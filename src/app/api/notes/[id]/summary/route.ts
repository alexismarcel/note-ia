import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SheetClaim } from "@/lib/quota";
import { parseFiche } from "@/lib/fiche";
import { DEFAULT_MODEL, ficheRequest } from "@/lib/fiche-generation";
import { verifierSignaux } from "@/lib/verifierSignaux";
import { nettoyerTranscript } from "@/lib/stt/nettoyerTranscript";
import {
  acquireRegeneration,
  canRegenerateSheets,
} from "@/lib/sheet-regeneration";

export const dynamic = "force-dynamic";

// Shown for every failure the user can do nothing about but wait — a missing
// key, a database hiccup, the API rejecting our credentials. The cause goes
// to the logs; the user gets something they can act on.
const START_FAILED =
  "La génération n'a pas pu démarrer. Réessaie dans quelques minutes.";

// $ per token, for the cost estimate in the log only. Keyed by prefix so a
// dated ID and its alias share a row; an unlisted model logs no estimate
// rather than a wrong one.
const PRICES: Record<
  string,
  { input: number; output: number; cacheWrite: number; cacheRead: number }
> = {
  "claude-haiku-4-5": { input: 1e-6, output: 5e-6, cacheWrite: 1.25e-6, cacheRead: 1e-7 },
  "claude-sonnet-5": { input: 2e-6, output: 1e-5, cacheWrite: 2.5e-6, cacheRead: 2e-7 },
};

const priceFor = (model: string) =>
  Object.entries(PRICES).find(([prefix]) => model.startsWith(prefix))?.[1];


export async function POST(
  request: Request,
  { params }: RouteContext<"/api/notes/[id]/summary">
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Read the transcript server-side rather than trusting a client-supplied
  // one: RLS scopes this to the caller, so another user's note cannot be
  // summarised by passing its id. Done first, so an unknown note costs
  // nothing and the lock below is only ever taken on a note the caller owns.
  const { data: note, error } = await supabase
    .from("notes")
    .select("content")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json(
      { error: `note_lookup_failed: ${error.message} (${error.code})` },
      { status: 404 }
    );
  }

  // Notes recorded before nettoyerTranscript existed still carry Soniox's
  // "<fin>"/"<end>" markers in the database; they are stripped here so the
  // prompt never contains them, whatever the note's age.
  const transcript = nettoyerTranscript(note.content ?? "").trim();
  if (!transcript) {
    return NextResponse.json(
      { error: "Cette note n'a pas de transcription à résumer." },
      { status: 400 }
    );
  }

  // One sheet per recording: each generation is a paid call, and nothing else
  // stops subscribers and unlimited accounts from generating again and again.
  // acquire_sheet_generation() takes the note's lock atomically, as the
  // service role because users may only read that table
  // (20261009100000_expiring_sheet_lock.sql). A lock stays "in progress"
  // until this request marks it complete; one left in progress by a request
  // that died without reaching its finally block (crash, platform timeout)
  // expires after 10 minutes, so it can never block a note for good.
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("[summary] admin client unavailable:", err);
    return NextResponse.json({ error: START_FAILED }, { status: 503 });
  }

  // The accounts in sheet-regeneration.ts may generate a note again; their
  // lock only refuses a generation still in progress.
  let lockState: string | null = null;
  let lockError: unknown = null;
  if (canRegenerateSheets(user.email)) {
    const result = await acquireRegeneration(admin, id, user.id);
    if ("error" in result) lockError = result.error;
    else lockState = result.state;
  } else {
    const { data, error } = await admin.rpc("acquire_sheet_generation", {
      p_note_id: id,
      p_user_id: user.id,
    });
    lockState = data;
    lockError = error;
  }
  if (lockError) {
    // Not a held lock — that is "in_progress" below — but the lock could not
    // be read or written at all: a missing or wrong SUPABASE_SECRET_KEY, or
    // the migration not applied. The details are for the logs.
    console.error("[summary] lock failed:", lockError);
    return NextResponse.json({ error: START_FAILED }, { status: 503 });
  }
  if (lockState === "done") {
    return NextResponse.json(
      {
        error:
          "La fiche de cet enregistrement a déjà été générée : une seule fiche est possible par enregistrement.",
        state: "done",
      },
      { status: 409 }
    );
  }
  if (lockState !== "acquired") {
    return NextResponse.json(
      {
        error:
          "Une génération est déjà en cours pour cet enregistrement, réessaie dans quelques minutes.",
        state: "in_progress",
      },
      { status: 409 }
    );
  }

  // Set once the note's one generation has been used up — a sheet, or a
  // "transcript too short" answer. Anything else, including a throw, leaves
  // it null and the finally block gives the lock back.
  let completed = false;
  // True between a successful quota claim and either a sheet (kept) or the
  // finally block (refunded).
  let claimedFree = false;

  try {
    // Claimed before the model is called, so two clicks cannot both slip
    // through; given back in the finally block if the call produces nothing.
    const { data: claimRows, error: claimError } = await supabase.rpc(
      "claim_sheet_generation"
    );
    if (claimError) {
      console.error("[summary] claim_sheet_generation failed:", claimError);
      return NextResponse.json({ error: START_FAILED }, { status: 503 });
    }
    const claim = (Array.isArray(claimRows) ? claimRows[0] : claimRows) as
      | SheetClaim
      | undefined;
    if (!claim?.allowed) {
      return NextResponse.json(
        { error: "quota_exceeded", reason: claim?.reason ?? "no_profile" },
        { status: 402 }
      );
    }
    claimedFree = claim.reason === "free";

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("[summary] ANTHROPIC_API_KEY is not configured");
      return NextResponse.json({ error: START_FAILED }, { status: 503 });
    }

    // Bounded well under the lock's 10-minute expiry: with the SDK's default
    // (10 minutes per attempt, 2 retries) a slow call could outlive its lock
    // and let a second request start a paid generation in parallel. 4 minutes
    // and one retry is 8 at worst.
    const client = new Anthropic({ apiKey, timeout: 4 * 60_000, maxRetries: 1 });
    const model = process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;

    let message: Anthropic.Message;
    try {
      // Built in one place so scripts/test-haiku-vs-sonnet.ts sends exactly
      // the request the app sends.
      message = await client.messages.create(ficheRequest(model, transcript));
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        console.error("[summary] Anthropic authentication failed:", err.message);
        return NextResponse.json({ error: START_FAILED }, { status: 503 });
      }
      if (err instanceof Anthropic.RateLimitError) {
        return NextResponse.json(
          { error: "Limite de requêtes atteinte, réessaie dans un instant." },
          { status: 429 }
        );
      }
      if (err instanceof Anthropic.APIConnectionTimeoutError) {
        console.error(`[summary] note=${id} Claude call timed out`);
        return NextResponse.json(
          { error: "La génération a pris trop de temps, réessaie dans quelques minutes." },
          { status: 504 }
        );
      }
      if (err instanceof Anthropic.APIError) {
        console.error(`[summary] Claude API error ${err.status}:`, err.message);
        return NextResponse.json(
          { error: "Le service de génération est indisponible, réessaie dans quelques minutes." },
          { status: 502 }
        );
      }
      throw err;
    }

    const {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: cacheWrite,
      cache_read_input_tokens: cacheRead,
    } = message.usage;
    // message.model is the model that actually served the call, so the log
    // stays right even if CLAUDE_MODEL is mistyped for an alias. cacheRead
    // staying at 0 across calls means the prefix isn't caching — the failure
    // mode is silent, so it has to be observed here.
    const price = priceFor(message.model);
    const cost = price
      ? ` cost≈$${(
          inputTokens * price.input +
          outputTokens * price.output +
          (cacheWrite ?? 0) * price.cacheWrite +
          (cacheRead ?? 0) * price.cacheRead
        ).toFixed(4)}`
      : "";
    console.log(
      `[summary] note=${id} model=${message.model} in=${inputTokens} ` +
        `out=${outputTokens} cacheWrite=${cacheWrite ?? 0} ` +
        `cacheRead=${cacheRead ?? 0}${cost}`
    );

    if (message.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "Claude a refusé de traiter cette transcription." },
        { status: 422 }
      );
    }

    // Structured output guarantees valid JSON only for a reply that finished:
    // one stopped by the ceiling is cut mid-object.
    if (message.stop_reason === "max_tokens") {
      console.error(`[summary] note=${id} hit max_tokens`);
      return NextResponse.json(
        { error: "La fiche générée était trop longue et a été coupée." },
        { status: 502 }
      );
    }

    const raw = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    // The schema cannot say "titre and sections when suffisant is true" (see
    // FICHE_JSON_SCHEMA), so the pairing is checked here.
    const parsedSheet = parseFiche(parsed);

    if (!parsedSheet) {
      console.error(`[summary] note=${id} unusable reply:`, raw.slice(0, 500));
      return NextResponse.json(
        { error: "Réponse inexploitable de Claude." },
        { status: 502 }
      );
    }

    // "Transcript too short" is an answer, not a sheet: it never becomes the
    // note's sheet, so the free-sheet claim goes back (in the finally block,
    // claimedFree still being set). It does use up the note's one generation
    // — the transcript will not change, so a retry would only pay for the
    // same answer — and its message is stored so the note page keeps it.
    if (parsedSheet.suffisant === false) {
      await completeLock(admin, id, parsedSheet.message);
      completed = true;
      return NextResponse.json({ sheet: parsedSheet, saved: false });
    }

    // Every "signalé par le prof" must quote the teacher's words; one whose
    // quote is not in the transcript loses the mark (the note itself stays).
    // Done before the sheet is stored, so only the verified sheet is kept.
    const { fiche: sheet, rapport } = verifierSignaux(parsedSheet, transcript);
    // proposes vs retires, per model, is what decides Haiku against Sonnet.
    console.log("[signaux]", { model: message.model, ...rapport });

    // Saved here rather than left to a "Sauvegarder" click: with one
    // generation per note, a sheet the user forgot to save could never be
    // generated again. Through the caller's own client, so RLS still applies.
    // Its title names the note, as the markdown H1 used to.
    const { error: saveError } = await supabase
      .from("notes")
      .update({ ai_summary: sheet, title: sheet.titre })
      .eq("id", id);
    if (saveError) {
      // The sheet is still returned, and the client offers to save it.
      console.error("[summary] save failed:", saveError);
    }

    // The sheet exists and is paid for: the quota stays spent and the lock
    // becomes permanent.
    claimedFree = false;
    await completeLock(admin, id, null);
    completed = true;
    return NextResponse.json({ sheet, saved: !saveError });
  } finally {
    // Every way out that did not use up the generation — an early return, an
    // API error, a throw — lands here: the quota and the lock come back, so
    // the user can try again. Each step logs its own failure rather than
    // throwing over the response already chosen above.
    if (claimedFree) {
      const { error } = await admin.rpc("refund_sheet_generation", {
        uid: user.id,
      });
      if (error) console.error("[summary] refund failed:", error);
    }
    if (!completed) {
      const { error } = await admin
        .from("note_sheet_generations")
        .delete()
        .eq("note_id", id)
        .is("completed_at", null);
      if (error) console.error("[summary] lock release failed:", error);
    }
  }
}

// Marks the note's one generation as used: the lock stops expiring.
async function completeLock(
  admin: ReturnType<typeof createAdminClient>,
  noteId: string,
  insufficientMessage: string | null
) {
  const { error } = await admin
    .from("note_sheet_generations")
    .update({
      completed_at: new Date().toISOString(),
      insufficient_message: insufficientMessage,
    })
    .eq("note_id", noteId);
  if (error) console.error("[summary] lock completion failed:", error);
}
