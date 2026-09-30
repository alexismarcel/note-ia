// Soniox sends its segment markers as ordinary tokens: "<fin>" after a
// manual finalize, "<end>" when endpoint detection closes an utterance. They
// land mid-sentence ("il y a une.<end> Masse média") and would otherwise be
// stored with the transcript and sent to Claude with it.
const BALISES = /<\/?(?:fin|end)>/gi;
const ESPACE_AVANT_PONCTUATION = /[ \t]+([.,;:!?…])/g;
// ".." or ". ." or ".. ." → "." — one character, repeated with or without
// spaces in between.
const PONCTUATION_REPETEE = /([.,;:!?])(?:[ \t]*\1)+/g;
const ESPACES_MULTIPLES = /[ \t]{2,}/g;

// Deliberately does not trim: it is also applied to each chunk Soniox
// streams, and those chunks carry the space that separates them from the
// previous one.
export function nettoyerTranscript(texte: string): string {
  return texte
    .replace(BALISES, " ")
    .replace(ESPACE_AVANT_PONCTUATION, "$1")
    .replace(PONCTUATION_REPETEE, "$1")
    .replace(ESPACES_MULTIPLES, " ");
}
