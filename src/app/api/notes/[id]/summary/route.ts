import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { SheetClaim } from "@/lib/quota";
import { parseFiche } from "@/lib/fiche";
import { DEFAULT_MODEL, ficheRequest } from "@/lib/fiche-generation";
import { verifierSignaux } from "@/lib/verifierSignaux";

export const dynamic = "force-dynamic";

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

  // Claimed before the model is called, so two clicks cannot both slip
  // through; given back below if the call produces nothing.
  const { data: claimRows, error: claimError } = await supabase.rpc(
    "claim_sheet_generation"
  );
  if (claimError) {
    console.error("[summary] claim_sheet_generation failed:", claimError);
    return NextResponse.json({ error: "quota_check_failed" }, { status: 500 });
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
  const claimedFree = claim.reason === "free";

  // Every path out of here that is not a generated sheet must give the claim
  // back, or a failed request would cost one of ten.
  const refund = async () => {
    if (!claimedFree) return;
    const { error } = await supabase.rpc("refund_sheet_generation");
    if (error) console.error("[summary] refund failed:", error);
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await refund();
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 }
    );
  }

  // Read the transcript server-side rather than trusting a client-supplied
  // one: RLS scopes this to the caller, so another user's note cannot be
  // summarised by passing its id.
  const { data: note, error } = await supabase
    .from("notes")
    .select("content")
    .eq("id", id)
    .single();

  if (error) {
    await refund();
    return NextResponse.json(
      { error: `note_lookup_failed: ${error.message} (${error.code})` },
      { status: 404 }
    );
  }

  const transcript = note.content?.trim();
  if (!transcript) {
    await refund();
    return NextResponse.json(
      { error: "Cette note n'a pas de transcription à résumer." },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;

  try {
    // Built in one place so scripts/test-haiku-vs-sonnet.ts sends exactly
    // the request the app sends.
    const message = await client.messages.create(
      ficheRequest(model, transcript)
    );

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
      await refund();
      return NextResponse.json(
        { error: "Claude a refusé de traiter cette transcription." },
        { status: 422 }
      );
    }

    // Structured output guarantees valid JSON only for a reply that finished:
    // one stopped by the ceiling is cut mid-object.
    if (message.stop_reason === "max_tokens") {
      console.error(`[summary] note=${id} hit max_tokens`);
      await refund();
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
      await refund();
      return NextResponse.json(
        { error: "Réponse inexploitable de Claude." },
        { status: 502 }
      );
    }

    // "Transcript too short" is an answer, not a sheet: the client shows it
    // but never saves it, so it must not cost one of the free sheets either.
    if (parsedSheet.suffisant === false) {
      await refund();
      return NextResponse.json({ sheet: parsedSheet });
    }

    // Every "signalé par le prof" must quote the teacher's words; one whose
    // quote is not in the transcript loses the mark (the note itself stays).
    // Done here, before the sheet leaves the server: what the client saves is
    // what it receives, so it is always the verified sheet.
    const { fiche: sheet, rapport } = verifierSignaux(parsedSheet, transcript);
    // proposes vs retires, per model, is what decides Haiku against Sonnet.
    console.log("[signaux]", { model: message.model, ...rapport });

    return NextResponse.json({ sheet });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      await refund();
      return NextResponse.json(
        { error: "Clé API Anthropic invalide." },
        { status: 502 }
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      await refund();
      return NextResponse.json(
        { error: "Limite de requêtes atteinte, réessaie dans un instant." },
        { status: 429 }
      );
    }
    if (err instanceof Anthropic.APIError) {
      await refund();
      return NextResponse.json(
        { error: `Erreur API Claude (${err.status}) : ${err.message}` },
        { status: 502 }
      );
    }
    // An unexpected throw is still a request that produced no sheet.
    await refund();
    throw err;
  }
}
