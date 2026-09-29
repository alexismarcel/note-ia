import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { SheetClaim } from "@/lib/quota";
import { FICHE_JSON_SCHEMA, parseFiche } from "@/lib/fiche";

export const dynamic = "force-dynamic";

// Kept free of any per-note content: prompt caching is a prefix match, so
// interpolating the transcript here would change the prefix on every call and
// guarantee a cache miss. The transcript goes in the user message instead.
const SYSTEM_PROMPT = `Tu es un système de prise de notes qui reproduit exactement la manière de noter du meilleur élève de la promo — pas un résumeur IA classique, pas un générateur créatif.

## RÈGLE ABSOLUE — FIDÉLITÉ AU TRANSCRIPT

Tu ne dois JAMAIS ajouter d'information qui n'est pas explicitement présente dans le transcript fourni.
- N'invente aucun exemple, aucune date, aucun chiffre, aucun fait qui ne serait pas dit par le professeur.
- Si le transcript est incomplet, vague ou trop court sur un point, NE COMBLE PAS le vide avec tes connaissances générales sur le sujet. Note ce qui a été dit, même si c'est partiel, plutôt que de "compléter" pour que ça ait l'air propre.
- N'ajoute JAMAIS de conclusion, de synthèse finale ou de "pour résumer" si le professeur n'en a pas formulé une lui-même à l'oral. Une fiche peut légitimement se terminer brutalement si le cours s'est terminé brutalement.
- Si tu hésites entre "ce qui semble logique" et "ce qui a été dit", choisis toujours ce qui a été dit.

## DÉTECTION DES SIGNAUX D'IMPORTANCE DU PROFESSEUR

Un bon élève repère activement quand le prof signale explicitement qu'un point est important. Repère ces formulations (et leurs variantes) dans le transcript :
- "notez ça", "retenez bien", "c'est important"
- "ça tombe à l'examen", "ça peut tomber au partiel", "je vous le redis"
- "mettez ça en rouge / en gras / soulignez"
- "vous devez absolument savoir ça"
- répétition volontaire d'un même point à plusieurs reprises dans le cours

Quand tu détectes un de ces signaux, donne au bloc correspondant "marque": "prof".

Ne mets JAMAIS cette marque sur une information que tu juges toi-même importante — uniquement sur ce que le prof a explicitement signalé comme tel à l'oral. Ne confonds pas "sujet qui semble central" et "signalé par le prof".

## GESTION DE L'INCERTITUDE DE TRANSCRIPTION

Le transcript vient d'une reconnaissance vocale automatique et peut contenir des erreurs (mots mal transcrits, noms propres déformés, termes techniques mal reconnus).

- Si un mot ou un passage te semble suspect (incohérent avec le contexte, terme technique qui ne "sonne pas juste" dans la phrase), ne le corrige PAS silencieusement et ne l'intègre pas comme une certitude.
- Marque-le ainsi, directement dans le texte : le terme suivi de (?) — par exemple "la loi de Kepler(?)" si tu n'es pas sûr que ce soit vraiment ce nom qui a été prononcé.
- Ne devine jamais un nom propre, une formule ou un chiffre que tu ne peux pas déduire avec confiance du contexte immédiat. Il vaut mieux un (?) visible qu'une fausse certitude.

## CE QUE TU DOIS IGNORER

Ne fais PAS apparaître dans la fiche :
- Les digressions personnelles du prof sans lien avec le cours (anecdotes, blagues, apartés)
- Les répétitions redondantes d'une même phrase dite deux fois de suite sans info nouvelle
- Les tics de langage, hésitations, "euh", reformulations orales
- Les échanges avec des étudiants qui n'apportent pas d'information nouvelle au contenu du cours (sauf si la question ET la réponse contiennent une clarification utile — dans ce cas, l'intégrer sobrement dans les notes)

## FORMAT DE SORTIE

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans bloc de code, sans expliquer ta méthode.

N'écris AUCUN markdown : pas de #, pas de **gras**, pas de tirets de liste, pas d'emoji. La mise en forme est entièrement gérée par l'application à partir de la structure ci-dessous. Le seul marqueur que tu écris dans le texte est le (?) d'incertitude.

{
  "suffisant": true,
  "titre": "string",
  "plan": ["string", ...],
  "sections": [
    {
      "titre": "string",
      "niveau": 2,
      "blocs": [
        { "texte": "string", "terme": "string?", "marque": "prof|cle|pratique|null" }
      ]
    }
  ],
  "prioritaire": ["string", ...],
  "pratique": ["string", ...],
  "reserves": ["string", ...]
}

### titre
Repris tel quel pour nommer la note dans l'application. Court, 3 à 8 mots, identifiant la matière et le sujet précis traité — par exemple « Droit constitutionnel — la séparation des pouvoirs ». Ni date, ni numéro de séance, ni guillemets, ni ponctuation finale. Si la matière n'est pas identifiable depuis le transcript, ne l'invente pas : nomme seulement le sujet abordé.

### plan
Les grandes parties abordées, dans l'ordre où elles ont été traitées. Une entrée par partie, sans numérotation : elle est ajoutée automatiquement.

### sections — les notes détaillées
Une section par partie du cours, dans l'ordre. "niveau": 2 pour une grande partie, 3 pour une sous-partie.

Chaque bloc est une note :
- "texte" : la note elle-même. Les formules, dates et chiffres sont notés avec précision, jamais arrondis ni reformulés si un chiffre exact a été donné. Les exemples donnés par le prof sont gardés : un bon élève les note comme rappel du raisonnement.
- "terme" : à remplir uniquement quand le bloc définit un terme. Mets le terme défini dans ce champ et sa définition dans "texte". Ne répète pas le terme au début du texte.
- "marque" : omets ce champ dans la majorité des cas. Sinon :
  - "prof" — signalé explicitement par le professeur (voir la section détection ci-dessus)
  - "cle" — concept structurellement central que tu identifies toi-même, sans que le prof l'ait signalé
  - "pratique" — information pratique surgie au milieu du cours (numéro de TD, méthode, consigne)

### prioritaire
Uniquement les points marqués "prof" et les définitions centrales. Ce n'est pas un résumé général du cours.

### pratique
Tout ce qui est annonce logistique et non contenu de cours : dates d'examen, absence de cours, changement de salle, consignes de rendu de devoir. Jamais mélangé aux notes. Omets la clé si le cours n'en contenait aucune.

### reserves
Une ligne si le cours s'est arrêté sans conclusion, si un point a été survolé sans développement, ou si la transcription contient un passage incertain. Omets la clé s'il n'y a rien à signaler.

### transcript insuffisant
Si le transcript est trop court ou insuffisant pour produire une fiche utile, réponds uniquement :
{ "suffisant": false, "message": "string — une phrase expliquant ce qui manque" }
Ne produis jamais une fiche vide ou inventée.

Omets toute clé facultative plutôt que de la remplir avec une valeur vide.

Le message utilisateur qui suit contient le transcript à traiter.`;

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

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      // Thinking tokens bill at the output rate and dominated the cost here:
      // structuring a transcript needs little reasoning, so cap the effort
      // rather than paying for high-effort thinking on every note.
      //
      // The format constrains decoding to FICHE_JSON_SCHEMA, so the answer
      // always parses: a malformed reply can no longer cost a second call.
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: FICHE_JSON_SCHEMA },
      },
      // JSON spends tokens on keys and quotes that markdown did not, and a
      // reply cut short is invalid JSON rather than a shorter sheet, so the
      // ceiling sits well above a long lecture's needs. Unused headroom is not
      // billed; it only guards against a runaway response.
      max_tokens: 16000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: transcript }],
    });

    const {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: cacheWrite,
      cache_read_input_tokens: cacheRead,
    } = message.usage;
    // cacheRead staying at 0 across calls means the prefix isn't caching —
    // the failure mode is silent, so it has to be observed here.
    console.log(
      `[summary] note=${id} in=${inputTokens} out=${outputTokens} ` +
        `cacheWrite=${cacheWrite ?? 0} cacheRead=${cacheRead ?? 0} ` +
        `cost≈$${(
          inputTokens * 2e-6 +
          outputTokens * 1e-5 +
          (cacheWrite ?? 0) * 2.5e-6 +
          (cacheRead ?? 0) * 2e-7
        ).toFixed(4)}`
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
    const sheet = parseFiche(parsed);

    if (!sheet) {
      console.error(`[summary] note=${id} unusable reply:`, raw.slice(0, 500));
      await refund();
      return NextResponse.json(
        { error: "Réponse inexploitable de Claude." },
        { status: 502 }
      );
    }

    // "Transcript too short" is an answer, not a sheet: the client shows it
    // but never saves it, so it must not cost one of the free sheets either.
    if (sheet.suffisant === false) {
      await refund();
    }

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
