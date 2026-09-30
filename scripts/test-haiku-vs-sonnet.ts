/**
 * Compare Haiku 4.5 et le modèle Sonnet sur la génération de fiches.
 *
 *   npx tsx scripts/test-haiku-vs-sonnet.ts
 *
 * 4 transcripts (test-transcripts/) × 2 modèles × 2 runs = 16 appels, avec
 * exactement la requête de l'app (src/lib/fiche-generation.ts : même prompt
 * système, même schéma de sortie structurée, même effort, même max_tokens),
 * puis la même validation (parseFiche) et le même filtre (verifierSignaux).
 *
 * Test isolé : aucun import de Supabase, rien n'est écrit en base. Seule la
 * clé ANTHROPIC_API_KEY est lue (depuis l'environnement ou .env.local).
 *
 * Sortie : une ligne JSON par run sur stdout, puis les vérifications et le
 * résumé. La progression va sur stderr. Code de sortie 1 si une vérification
 * échoue.
 *
 * Variables facultatives :
 *   SONNET_MODEL  modèle Sonnet à tester (sinon CLAUDE_MODEL s'il désigne un
 *                 Sonnet, sinon claude-sonnet-5)
 *   EUR_USD       taux à utiliser si celui de la BCE est inaccessible
 *                 (nombre de dollars pour 1 euro)
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { loadEnvConfig } from "@next/env";
import { parseFiche, type StoredSheet } from "../src/lib/fiche";
import { ficheRequest } from "../src/lib/fiche-generation";
import { verifierSignaux, type RapportSignaux } from "../src/lib/verifierSignaux";

const RACINE = path.resolve(__dirname, "..");
loadEnvConfig(RACINE);

const HAIKU = "claude-haiku-4-5-20251001";
const SONNET = (() => {
  const explicite = process.env.SONNET_MODEL?.trim();
  if (explicite) return explicite;
  const app = process.env.CLAUDE_MODEL?.trim();
  if (app?.startsWith("claude-sonnet")) return app;
  return "claude-sonnet-5";
})();
const MODELES = [HAIKU, SONNET];
const RUNS_PAR_MODELE = 2;

const TARIFS_URL = "https://platform.claude.com/docs/en/about-claude/pricing.md";
const BCE_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

// Durées attendues, pour prévenir si un fichier n'a visiblement pas la
// longueur annoncée (≈ 150 mots par minute de cours parlé).
const TRANSCRIPTS = [
  { fichier: "court.txt", minutesAttendues: 5 },
  { fichier: "une-heure-avec-signaux.txt", minutesAttendues: 60 },
  { fichier: "deux-heures.txt", minutesAttendues: 120 },
  { fichier: "sans-signal-avec-astuces.txt", minutesAttendues: null },
] as const;
const MOTS_PAR_MINUTE = 150;

type Ligne = {
  modele: string;
  transcript: string;
  run: number;
  json_valide: boolean;
  suffisant: boolean | null;
  nb_sections: number;
  nb_blocs_marque_prof: number;
  rapport_signaux: RapportSignaux;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    // Hors du format demandé, mais nécessaire à un coût exact : l'écriture
    // du cache est facturée plus cher que l'entrée normale.
    cache_creation_input_tokens: number;
  };
  duree_ms: number;
  stop_reason?: string | null;
  erreur?: string;
};

type Tarif = { input: number; cacheWrite5m: number; cacheHit: number; output: number };

const log = (...args: unknown[]) => console.error(...args);

/* ---------- tarifs officiels, lus au lancement ---------- */

// "claude-haiku-4-5-20251001" → "Claude Haiku 4.5", le libellé de la page.
function libelleTarif(modele: string): string {
  const [famille, ...version] = modele
    .replace(/-\d{8}$/, "")
    .replace(/^claude-/, "")
    .split("-");
  return `Claude ${famille[0].toUpperCase()}${famille.slice(1)} ${version.join(".")}`;
}

const texteCellule = (cellule: string) =>
  cellule
    .replace(/<sup>.*?<\/sup>/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim();

const dollarsParMTok = (cellule: string) => {
  const m = /\$\s*([\d.]+)/.exec(cellule);
  return m ? Number(m[1]) : NaN;
};

async function chargerTarifs(modeles: string[]): Promise<Map<string, Tarif>> {
  const res = await fetch(TARIFS_URL);
  if (!res.ok) throw new Error(`${TARIFS_URL} a répondu ${res.status}`);
  const md = await res.text();

  // Seul le tableau "Model pricing" a ces colonnes ; les tableaux batch et
  // autres plus bas n'en ont que deux.
  const debut = md.indexOf("## Model pricing");
  if (debut < 0) throw new Error("section « Model pricing » introuvable");
  const fin = md.indexOf("\n## ", debut + 1);
  const lignes = md
    .slice(debut, fin < 0 ? undefined : fin)
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .map((l) => l.split("|").slice(1, -1).map(texteCellule));

  const entete = lignes[0]?.map((c) => c.toLowerCase()) ?? [];
  const col = (motif: RegExp) => {
    const i = entete.findIndex((c) => motif.test(c));
    if (i < 0) throw new Error(`colonne ${motif} introuvable dans ${entete.join(" | ")}`);
    return i;
  };
  const iInput = col(/base input/);
  const iWrite = col(/5m cache write/);
  const iHit = col(/cache hits/);
  const iOutput = col(/output/);

  const tarifs = new Map<string, Tarif>();
  for (const modele of modeles) {
    const libelle = libelleTarif(modele);
    const ligne = lignes.find(
      (l) => l[0] === libelle || l[0]?.startsWith(`${libelle} (`)
    );
    if (!ligne) throw new Error(`pas de ligne « ${libelle} » pour ${modele}`);
    const tarif = {
      input: dollarsParMTok(ligne[iInput]),
      cacheWrite5m: dollarsParMTok(ligne[iWrite]),
      cacheHit: dollarsParMTok(ligne[iHit]),
      output: dollarsParMTok(ligne[iOutput]),
    };
    if (Object.values(tarif).some(Number.isNaN)) {
      throw new Error(`tarif illisible pour ${libelle} : ${ligne.join(" | ")}`);
    }
    tarifs.set(modele, tarif);
  }
  return tarifs;
}

// Nombre de dollars pour 1 euro, taux de référence du jour de la BCE.
async function chargerEurUsd(): Promise<number> {
  const manuel = Number(process.env.EUR_USD);
  if (manuel > 0) return manuel;
  const res = await fetch(BCE_URL);
  if (!res.ok) throw new Error(`${BCE_URL} a répondu ${res.status}`);
  const m = /currency=['"]USD['"]\s+rate=['"]([\d.]+)['"]/.exec(await res.text());
  if (!m) throw new Error("taux USD introuvable dans le flux de la BCE");
  return Number(m[1]);
}

const coutDollars = (u: Ligne["usage"], t: Tarif) =>
  (u.input_tokens * t.input +
    u.cache_creation_input_tokens * t.cacheWrite5m +
    u.cache_read_input_tokens * t.cacheHit +
    u.output_tokens * t.output) /
  1e6;

/* ---------- un run ---------- */

const rapportVide = (): RapportSignaux => ({
  proposes: 0,
  confirmes: 0,
  retires: 0,
  rejets: [],
});

async function unRun(
  client: Anthropic,
  modele: string,
  nom: string,
  transcript: string,
  run: number
): Promise<{ ligne: Ligne; plan: string[]; fiche: StoredSheet | null }> {
  const ligne: Ligne = {
    modele,
    transcript: nom,
    run,
    json_valide: false,
    suffisant: null,
    nb_sections: 0,
    nb_blocs_marque_prof: 0,
    rapport_signaux: rapportVide(),
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    duree_ms: 0,
  };
  let plan: string[] = [];
  // La fiche telle que l'app l'enregistrerait (après verifierSignaux), ou
  // la réponse « insuffisant » ; null si aucune fiche exploitable.
  const fiche: StoredSheet | null = null;

  const t0 = performance.now();
  let message: Anthropic.Message;
  try {
    message = await client.messages.create(ficheRequest(modele, transcript));
  } catch (err) {
    ligne.duree_ms = Math.round(performance.now() - t0);
    ligne.erreur =
      err instanceof Anthropic.APIError
        ? `API ${err.status} : ${err.message}`
        : String(err);
    return { ligne, plan, fiche };
  }
  ligne.duree_ms = Math.round(performance.now() - t0);
  ligne.stop_reason = message.stop_reason;
  ligne.usage = {
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
  };

  // Même lecture que la route : texte concaténé, JSON.parse, puis parseFiche.
  // Une réponse coupée par max_tokens ou refusée n'est pas un JSON valide.
  const brut = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(brut);
  } catch {
    ligne.erreur = "JSON.parse a échoué";
  }
  const lue = parseFiche(parsed);
  if (!lue) {
    ligne.erreur ??= "réponse non conforme au schéma";
    return { ligne, plan, fiche };
  }
  ligne.json_valide = true;
  ligne.suffisant = lue.suffisant !== false;
  if (lue.suffisant === false) return { ligne, plan, fiche: lue };

  const { fiche: verifiee, rapport } = verifierSignaux(lue, transcript);
  ligne.rapport_signaux = rapport;
  ligne.nb_sections = verifiee.sections.length;
  // Après vérification : ce que l'app enregistrerait réellement.
  ligne.nb_blocs_marque_prof = verifiee.sections
    .flatMap((s) => s.blocs)
    .filter((b) => b.marque === "prof").length;
  plan = verifiee.plan ?? [];
  return { ligne, plan, fiche: verifiee };
}

/* ---------- résumé ---------- */

const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));

function tableau(entetes: string[], lignes: string[][]): string {
  const largeurs = entetes.map((h, i) =>
    Math.max(h.length, ...lignes.map((l) => l[i].length))
  );
  const fmt = (l: string[]) => `| ${l.map((c, i) => pad(c, largeurs[i])).join(" | ")} |`;
  return [fmt(entetes), `|${largeurs.map((w) => "-".repeat(w + 2)).join("|")}|`, ...lignes.map(fmt)].join(
    "\n"
  );
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    log("ANTHROPIC_API_KEY manquante (ni dans l'environnement, ni dans .env.local).");
    process.exit(1);
  }
  if (SONNET === HAIKU) {
    log("Le modèle Sonnet et Haiku sont identiques : rien à comparer.");
    process.exit(1);
  }

  const textes = TRANSCRIPTS.map(({ fichier, minutesAttendues }) => {
    const chemin = path.join(RACINE, "test-transcripts", fichier);
    const texte = readFileSync(chemin, "utf8").trim();
    if (!texte) {
      log(`${chemin} est vide.`);
      process.exit(1);
    }
    const mots = texte.split(/\s+/).length;
    const minutes = Math.round(mots / MOTS_PAR_MINUTE);
    if (minutesAttendues && minutes < minutesAttendues / 2) {
      log(
        `⚠️  ${fichier} : ${mots} mots, soit ≈ ${minutes} min de parole — ` +
          `un cours de ${minutesAttendues} min en ferait ≈ ${minutesAttendues * MOTS_PAR_MINUTE}. ` +
          `Texte d'exemple pas encore remplacé ?`
      );
    }
    return { nom: fichier, texte };
  });

  // Les tarifs sont lus avant les appels : s'ils sont introuvables, le test
  // tourne quand même et le coût est affiché comme indisponible, jamais
  // estimé avec un prix inventé.
  let tarifs: Map<string, Tarif> | null = null;
  let eurUsd: number | null = null;
  try {
    tarifs = await chargerTarifs(MODELES);
    for (const [m, t] of tarifs) {
      log(`Tarif ${m} ($/MTok) : entrée ${t.input}, écriture cache ${t.cacheWrite5m}, lecture cache ${t.cacheHit}, sortie ${t.output}`);
    }
  } catch (err) {
    log(`⚠️  Tarifs officiels indisponibles (${String(err)}) : coût non calculé.`);
  }
  try {
    eurUsd = await chargerEurUsd();
    log(`Taux BCE : 1 € = ${eurUsd} $`);
  } catch (err) {
    log(`⚠️  Taux EUR/USD indisponible (${String(err)}) : coût affiché en dollars.`);
  }

  const client = new Anthropic();
  const lignes: Ligne[] = [];
  const plans = new Map<string, string[][]>();
  const fichesDeuxHeures: { modele: string; run: number; fiche: StoredSheet | null }[] = [];
  const total = textes.length * MODELES.length * RUNS_PAR_MODELE;

  // Modèles alternés pour chaque transcript, pour qu'une variation de charge
  // de l'API pendant le test pèse pareil sur les deux.
  for (const { nom, texte } of textes) {
    for (let run = 1; run <= RUNS_PAR_MODELE; run++) {
      for (const modele of MODELES) {
        log(`[${lignes.length + 1}/${total}] ${modele} · ${nom} · run ${run}…`);
        const { ligne, plan, fiche } = await unRun(client, modele, nom, texte, run);
        lignes.push(ligne);
        console.log(JSON.stringify(ligne));
        if (nom === "deux-heures.txt") {
          plans.set(modele, [...(plans.get(modele) ?? []), plan]);
          fichesDeuxHeures.push({ modele, run, fiche });
        }
      }
    }
  }

  /* ----- vérifications automatiques ----- */

  const deModele = (m: string, fichier?: string) =>
    lignes.filter((l) => l.modele === m && (!fichier || l.transcript === fichier));
  const somme = (ls: Ligne[], k: keyof Omit<RapportSignaux, "rejets">) =>
    ls.reduce((s, l) => s + l.rapport_signaux[k], 0);

  const verifs: { ok: boolean; texte: string }[] = [];
  for (const m of MODELES) {
    const tous = deModele(m);
    const valides = tous.filter((l) => l.json_valide).length;
    verifs.push({
      ok: valides === tous.length,
      texte: `${m} : JSON valide sur ${valides}/${tous.length} runs`,
    });

    // Tout "prof" proposé sur un cours sans aucun signal est un faux
    // signalement, qu'il soit ensuite retiré par le filtre ou non.
    const astuces = deModele(m, "sans-signal-avec-astuces.txt");
    const faux = somme(astuces, "proposes");
    const passes = somme(astuces, "confirmes");
    // Zéro faux signalement ne prouve rien si aucune fiche n'a été produite.
    const fichesAstuces = astuces.filter((l) => l.suffisant).length;
    verifs.push({
      ok: faux === 0 && fichesAstuces > 0,
      texte:
        `${m} : ${faux} faux signalement(s) sur sans-signal-avec-astuces.txt ` +
        `(${passes} passé(s) malgré le filtre, ${fichesAstuces} fiche(s) produite(s))`,
    });

    const signaux = deModele(m, "une-heure-avec-signaux.txt");
    verifs.push({
      ok: signaux.every((l) => l.rapport_signaux.confirmes > 0),
      texte: `${m} : au moins un signal confirmé sur chaque run de une-heure-avec-signaux.txt`,
    });

    const long = deModele(m, "deux-heures.txt");
    verifs.push({
      ok: long.every((l) => l.suffisant === true),
      texte: `${m} : fiche complète (suffisant) sur chaque run de deux-heures.txt`,
    });
  }

  console.log("\n=== Vérifications ===");
  for (const v of verifs) console.log(`${v.ok ? "✅" : "❌"} ${v.texte}`);

  /* ----- résumé par modèle ----- */

  const euros = (dollars: number) =>
    eurUsd ? `${(dollars / eurUsd).toFixed(4)} €` : `${dollars.toFixed(4)} $`;

  const resume = MODELES.map((m) => {
    const tous = deModele(m);
    const valides = tous.filter((l) => l.json_valide).length;
    const astuces = deModele(m, "sans-signal-avec-astuces.txt");
    const signaux = deModele(m, "une-heure-avec-signaux.txt");
    const tarif = tarifs?.get(m);
    const factures = tous.filter((l) => !l.erreur?.startsWith("API"));
    const cout = tarif && factures.length
      ? euros(factures.reduce((s, l) => s + coutDollars(l.usage, tarif), 0) / factures.length)
      : "n/d";
    const duree = tous.reduce((s, l) => s + l.duree_ms, 0) / tous.length / 1000;
    return [
      m,
      `${Math.round((100 * valides) / tous.length)} %`,
      String(somme(astuces, "proposes")),
      `${somme(signaux, "proposes")} / ${somme(signaux, "confirmes")} / ${somme(signaux, "retires")}`,
      cout,
      `${duree.toFixed(1)} s`,
    ];
  });

  console.log("\n=== Résumé ===");
  console.log(
    tableau(
      [
        "Modèle",
        "JSON valides",
        "Faux signalements (sans-signal)",
        "Une heure : proposés / confirmés / retirés",
        "Coût moyen / run",
        "Durée moyenne",
      ],
      resume
    )
  );

  console.log("\n=== Plan trouvé sur deux-heures.txt (à vérifier à la main) ===");
  for (const m of MODELES) {
    (plans.get(m) ?? []).forEach((plan, i) => {
      console.log(`\n${m} · run ${i + 1} :`);
      console.log(plan.length ? plan.map((p, j) => `  ${j + 1}. ${p}`).join("\n") : "  (aucun plan)");
    });
  }

  console.log("\n=== Fiches complètes sur deux-heures.txt ===");
  for (const { modele, run, fiche } of fichesDeuxHeures) {
    console.log(`\n--- ${modele} · run ${run} ---`);
    console.log(fiche ? JSON.stringify(fiche, null, 2) : "(aucune fiche exploitable)");
  }

  console.log("\n=== Citations rejetées par verifierSignaux (à lire à la main) ===");
  for (const m of MODELES) {
    const rejets = deModele(m).flatMap((l) =>
      l.rapport_signaux.rejets.map((r) => `  [${l.transcript} · run ${l.run}] ${r}`)
    );
    console.log(`\n${m} :`);
    console.log(rejets.length ? rejets.join("\n") : "  (aucune)");
  }

  if (verifs.some((v) => !v.ok)) process.exitCode = 1;
}

main().catch((err) => {
  log(err);
  process.exit(1);
});
