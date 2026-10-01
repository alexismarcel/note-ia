import type { Bloc, Chapitre, Fiche, Marque, Section } from "@/components/FicheView";

// The JSON schema sent to the model and the validator run on its answer, both
// pinned to the types FicheView exports. Every `satisfies` below is there so
// that a field added to, removed from or made optional in those types breaks
// the build here, instead of the model being asked for one shape while the
// component renders another.

type FicheSuffisante = Exclude<Fiche, { suffisant: false }>;
type FicheInsuffisante = Extract<Fiche, { suffisant: false }>;

// keyof on a union only yields the keys every member shares; this collects
// the keys of each member instead.
type KeysOfUnion<T> = T extends unknown ? keyof T : never;
type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K;
}[keyof T];

type JsonSchema = Record<string, unknown>;

// `as const satisfies` checks each list against the type; the Exclude checks
// below it make sure no member was left out.
const MARQUES = ["prof", "cle", "pratique"] as const satisfies readonly Marque[];
const NIVEAUX = [2, 3] as const satisfies readonly NonNullable<Section["niveau"]>[];
const missingMarque: Exclude<Marque, (typeof MARQUES)[number]> extends never
  ? true
  : false = true;
const missingNiveau: Exclude<
  NonNullable<Section["niveau"]>,
  (typeof NIVEAUX)[number]
> extends never
  ? true
  : false = true;
void missingMarque;
void missingNiveau;

const stringList: JsonSchema = { type: "array", items: { type: "string" } };

const blocSchema = {
  type: "object",
  properties: {
    texte: { type: "string" },
    terme: { type: "string" },
    marque: { type: "string", enum: [...MARQUES] },
    signal: { type: "string" },
  } satisfies Record<keyof Bloc, JsonSchema>,
  required: ["texte"] satisfies RequiredKeys<Bloc>[],
  additionalProperties: false,
};

const sectionSchema = {
  type: "object",
  properties: {
    titre: { type: "string" },
    niveau: { type: "integer", enum: [...NIVEAUX] },
    blocs: { type: "array", items: blocSchema },
  } satisfies Record<keyof Section, JsonSchema>,
  required: ["titre", "blocs"] satisfies RequiredKeys<Section>[],
  additionalProperties: false,
};

const chapitreSchema = {
  type: "object",
  properties: {
    titre: { type: "string" },
    sections: { type: "array", items: sectionSchema },
    prioritaire: stringList,
  } satisfies Record<keyof Chapitre, JsonSchema>,
  required: ["titre", "sections"] satisfies RequiredKeys<Chapitre>[],
  additionalProperties: false,
};

// Kept on the type so sheets saved before chapters still show theirs, but
// never asked of the model.
type LegacyOnlyKeys = "reserves";

// One flat object rather than an anyOf of the two answers: the structured
// outputs docs only show object roots, and a root the API rejected would fail
// every generation. `suffisant` is the only key both answers carry; which of
// the others must be present is enforced by parseFiche below, and a mismatch
// is handled like any other unusable answer (refunded, never saved).
export const FICHE_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    suffisant: { type: "boolean" },
    message: { type: "string" },
    titre: { type: "string" },
    chapitres: { type: "array", items: chapitreSchema },
    pratique: stringList,
  } satisfies Record<Exclude<KeysOfUnion<Fiche>, LegacyOnlyKeys>, JsonSchema>,
  required: ["suffisant"],
  additionalProperties: false,
};

const isString = (v: unknown): v is string => typeof v === "string";
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// An absent list stays absent — FicheView skips the section — but a present
// one must hold only strings.
function optionalStrings(v: unknown): string[] | undefined | false {
  if (v === undefined) return undefined;
  return Array.isArray(v) && v.every(isString) ? v : false;
}

function parseBloc(v: unknown): Bloc | null {
  if (!isRecord(v) || !isString(v.texte)) return null;
  if (v.terme !== undefined && !isString(v.terme)) return null;
  if (v.signal !== undefined && !isString(v.signal)) return null;
  if (
    v.marque !== undefined &&
    v.marque !== null &&
    !(MARQUES as readonly unknown[]).includes(v.marque)
  ) {
    return null;
  }
  return {
    texte: v.texte,
    ...(isString(v.terme) && v.terme.trim() ? { terme: v.terme } : {}),
    ...(v.marque ? { marque: v.marque as Marque } : {}),
    // The teacher's quote only means something on a "prof" mark, which it
    // justifies; anywhere else it is dropped rather than stored.
    ...(v.marque === "prof" && isString(v.signal) && v.signal.trim()
      ? { signal: v.signal }
      : {}),
  };
}

function parseSection(v: unknown): Section | null {
  if (!isRecord(v) || !isString(v.titre) || !Array.isArray(v.blocs)) return null;
  if (
    v.niveau !== undefined &&
    !(NIVEAUX as readonly unknown[]).includes(v.niveau)
  ) {
    return null;
  }
  const blocs = v.blocs.map(parseBloc);
  if (blocs.some((b) => b === null)) return null;
  return {
    titre: v.titre,
    ...(v.niveau !== undefined ? { niveau: v.niveau as 2 | 3 } : {}),
    blocs: blocs as Bloc[],
  };
}

function parseSections(v: unknown): Section[] | null {
  if (!Array.isArray(v)) return null;
  const sections = v.map(parseSection);
  return sections.some((s) => s === null) ? null : (sections as Section[]);
}

function parseChapitre(v: unknown): Chapitre | null {
  if (!isRecord(v) || !isString(v.titre)) return null;
  const sections = parseSections(v.sections);
  const prioritaire = optionalStrings(v.prioritaire);
  if (!sections || prioritaire === false) return null;
  return {
    titre: v.titre.trim(),
    sections,
    ...(prioritaire ? { prioritaire } : {}),
  };
}

// Null when the value is not a fiche FicheView can render. Run on the model's
// answer before it is returned, and on whatever is read back from the
// database, since notes are also written straight from the browser.
//
// Sheets saved before chapters existed ({ titre, plan, sections,
// prioritaire, pratique, reserves }) come back as a fiche with one chapter
// named after the sheet, so every consumer only ever deals with chapters.
// Their "plan" is dropped: the outline has been drawn from the sections for
// a while.
export function parseFiche(v: unknown): Fiche | null {
  if (!isRecord(v)) return null;

  if (v.suffisant === false) {
    if (!isString(v.message)) return null;
    return { suffisant: false, message: v.message } satisfies FicheInsuffisante;
  }

  if (!isString(v.titre) || !v.titre.trim()) return null;
  const titre = v.titre.trim();

  let chapitres: Chapitre[];
  if (Array.isArray(v.chapitres)) {
    const parsed = v.chapitres.map(parseChapitre);
    if (parsed.length === 0 || parsed.some((c) => c === null)) return null;
    chapitres = parsed as Chapitre[];
  } else {
    const legacy = parseChapitre({ titre, sections: v.sections, prioritaire: v.prioritaire });
    if (!legacy) return null;
    chapitres = [legacy];
  }

  const pratique = optionalStrings(v.pratique);
  const reserves = optionalStrings(v.reserves);
  if (pratique === false || reserves === false) return null;

  return {
    suffisant: true,
    titre,
    chapitres,
    ...(pratique ? { pratique } : {}),
    ...(reserves ? { reserves } : {}),
  } satisfies FicheSuffisante;
}

// What the ai_summary column can hold once it is jsonb: a JSON string for
// every sheet generated before this migration (markdown, rendered as text as
// it always was), or a fiche object from here on.
export type StoredSheet = string | Fiche;

// Anything else — an object that no longer matches the types, say — is shown
// as its JSON text rather than dropped: a note should never become unreadable.
export function toStoredSheet(v: unknown): StoredSheet | null {
  if (v === null || v === undefined) return null;
  if (isString(v)) return v;
  return parseFiche(v) ?? JSON.stringify(v, null, 2);
}

export const isInsufficient = (
  sheet: StoredSheet | null
): sheet is FicheInsuffisante =>
  typeof sheet === "object" && sheet !== null && sheet.suffisant === false;
