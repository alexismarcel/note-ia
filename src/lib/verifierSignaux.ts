/**
 * Filet de sécurité contre les faux signalements.
 *
 * Le modèle doit citer les mots exacts du professeur pour justifier un
 * "marque": "prof". Cette fonction vérifie que cette citation existe vraiment
 * dans le transcript. Si elle n'y est pas, le signalement est retiré.
 *
 * À appeler juste après le parsing de la réponse de l'API, avant l'insertion
 * en base. Coût : zéro token.
 */

type Bloc = {
  texte: string;
  terme?: string;
  marque?: 'prof' | 'cle' | 'pratique' | null;
  signal?: string;
};

type FicheAvecChapitres = {
  chapitres?: { sections?: { blocs?: Bloc[] }[] }[];
  [k: string]: unknown;
};

export type RapportSignaux = {
  /** signalements produits par le modèle */
  proposes: number;
  /** signalements dont la citation a été retrouvée dans le transcript */
  confirmes: number;
  /** signalements retirés faute de citation vérifiable */
  retires: number;
  /** les citations rejetées, pour inspection */
  rejets: string[];
};

/* on compare des textes « nus » : sans accents, sans ponctuation, sans casse */
const normaliser = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/* le modèle peut citer avec une légère dérive : on accepte si une fenêtre
   suffisamment longue de la citation se retrouve telle quelle */
const FENETRE = 5;

const citationPresente = (citation: string, transcript: string) => {
  const c = normaliser(citation);
  if (!c) return false;

  if (transcript.includes(c)) return true;

  const mots = c.split(' ');
  if (mots.length < FENETRE) return false;

  for (let i = 0; i + FENETRE <= mots.length; i++) {
    if (transcript.includes(mots.slice(i, i + FENETRE).join(' '))) return true;
  }
  return false;
};

export function verifierSignaux<T extends FicheAvecChapitres>(
  fiche: T,
  transcript: string
): { fiche: T; rapport: RapportSignaux } {
  const base = normaliser(transcript);
  const rapport: RapportSignaux = { proposes: 0, confirmes: 0, retires: 0, rejets: [] };

  const blocs = (fiche.chapitres ?? [])
    .flatMap((chapitre) => chapitre.sections ?? [])
    .flatMap((section) => section.blocs ?? []);

  for (const bloc of blocs) {
    if (bloc.marque !== 'prof') continue;

    rapport.proposes++;

    if (bloc.signal && citationPresente(bloc.signal, base)) {
      rapport.confirmes++;
      continue;
    }

    /* citation absente ou introuvable : le signalement saute.
       Le contenu de la note, lui, est conservé tel quel. */
    rapport.retires++;
    rapport.rejets.push(bloc.signal ?? '(aucune citation fournie)');
    delete bloc.marque;
    delete bloc.signal;
  }

  return { fiche, rapport };
}
