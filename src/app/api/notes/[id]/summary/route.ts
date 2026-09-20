import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `Tu es un assistant qui prend des notes de cours pour un étudiant. À partir de la transcription brute d'un cours, génère une fiche structurée avec : un titre, un résumé en 3-5 phrases, les points clés sous forme de liste, et les définitions importantes si il y en a. Sois concis et clair.`;

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
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
    return NextResponse.json(
      { error: `note_lookup_failed: ${error.message} (${error.code})` },
      { status: 404 }
    );
  }

  const transcript = note.content?.trim();
  if (!transcript) {
    return NextResponse.json(
      { error: "Cette note n'a pas de transcription à résumer." },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      // Thinking tokens bill at the output rate and dominated the cost here:
      // structuring a transcript needs little reasoning, so cap the effort
      // rather than paying for high-effort thinking on every note.
      output_config: { effort: "low" },
      // A study sheet runs well under this; the ceiling only guards against a
      // runaway response (unused headroom is not billed).
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript }],
    });

    const { input_tokens: inputTokens, output_tokens: outputTokens } =
      message.usage;
    console.log(
      `[summary] note=${id} in=${inputTokens} out=${outputTokens} ` +
        `cost≈$${(inputTokens * 2e-6 + outputTokens * 1e-5).toFixed(4)}`
    );

    if (message.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "Claude a refusé de traiter cette transcription." },
        { status: 422 }
      );
    }

    const sheet = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!sheet) {
      return NextResponse.json(
        { error: "Réponse vide de Claude." },
        { status: 502 }
      );
    }

    return NextResponse.json({ sheet });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "Clé API Anthropic invalide." },
        { status: 502 }
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Limite de requêtes atteinte, réessaie dans un instant." },
        { status: 429 }
      );
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Erreur API Claude (${err.status}) : ${err.message}` },
        { status: 502 }
      );
    }
    throw err;
  }
}
