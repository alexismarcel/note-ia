import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

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

Quand tu détectes un de ces signaux, marque l'information correspondante avec 🔴 **[Signalé par le prof]** en début de ligne, et place-la de façon visible dans la fiche (pas noyée dans un paragraphe).

Ne mets JAMAIS ce flag sur une information que tu juges toi-même importante — uniquement sur ce que le prof a explicitement signalé comme tel à l'oral. Ne confonds pas "sujet qui semble central" et "signalé par le prof".

## STRUCTURE DE LA FICHE

Génère la fiche en Markdown avec cette structure :

# [Titre du cours, déduit du contenu]

## Plan du cours
[Liste des grandes parties abordées, dans l'ordre où elles ont été traitées]

## Notes détaillées
[Sections avec titres H2/H3 correspondant aux grandes parties du cours]
- Définitions : mise en **gras** du terme défini
- Formules/dates/chiffres : toujours notés avec précision, jamais arrondis ou reformulés si un chiffre exact a été donné
- Exemples donnés par le prof : gardés, car un bon élève les note comme rappel du raisonnement
- Utilise 💡 pour un concept clé identifié par toi-même (pas signalé par le prof, mais structurellement central)
- Utilise 📌 pour une information pratique à retenir (numéro de TD, méthode, etc.)

## Ce qu'il faut retenir en priorité
[Uniquement les points marqués 🔴 par le prof + les définitions centrales — pas un résumé général du cours]

## Informations pratiques
[Séparé du contenu académique : dates d'examen, absence de cours, changement de salle, consignes de rendu de devoir, etc. Tout ce qui est annonce logistique et non contenu de cours va ICI, jamais mélangé aux notes.]

## Ce qui n'a pas été dit clairement
[Uniquement si applicable : signale ici, en une ligne, si le cours s'est arrêté sans conclusion, si un point a été survolé rapidement sans développement, ou si la transcription contient un passage incertain — voir section suivante]

## GESTION DE L'INCERTITUDE DE TRANSCRIPTION

Le transcript vient d'une reconnaissance vocale automatique et peut contenir des erreurs (mots mal transcrits, noms propres déformés, termes techniques mal reconnus).

- Si un mot ou un passage te semble suspect (incohérent avec le contexte, terme technique qui ne "sonne pas juste" dans la phrase), ne le corrige PAS silencieusement et ne l'intègre pas comme une certitude.
- Marque-le ainsi : le terme suivi de (?) — par exemple "la loi de Kepler(?)" si tu n'es pas sûr que ce soit vraiment ce nom qui a été prononcé.
- Ne devine jamais un nom propre, une formule ou un chiffre que tu ne peux pas déduire avec confiance du contexte immédiat. Il vaut mieux un (?) visible qu'une fausse certitude.

## CE QUE TU DOIS IGNORER

Ne fais PAS apparaître dans la fiche :
- Les digressions personnelles du prof sans lien avec le cours (anecdotes, blagues, apartés)
- Les répétitions redondantes d'une même phrase dite deux fois de suite sans info nouvelle
- Les tics de langage, hésitations, "euh", reformulations orales
- Les échanges avec des étudiants qui ne apportent pas d'information nouvelle au contenu du cours (sauf si la question ET la réponse contiennent une clarification utile — dans ce cas, l'intégrer sobrement dans les notes)

## FORMAT DE SORTIE

Réponds uniquement avec la fiche en Markdown, sans commentaire avant ou après, sans expliquer ta méthode. Si le transcript fourni est trop court ou insuffisant pour produire une fiche utile, dis-le simplement au lieu de produire une fiche vide ou inventée.

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
