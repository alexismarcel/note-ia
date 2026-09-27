export function formatNoteDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// The sheet opens with a markdown H1 the model derives from the lecture.
// "## Plan du cours" and friends cannot match: a second # is not whitespace.
export function titleFromSheet(sheet: string | null | undefined): string | null {
  if (!sheet) return null;
  for (const line of sheet.split("\n")) {
    const heading = /^#\s+(.+)$/.exec(line.trim());
    if (heading) return heading[1].trim() || null;
  }
  return null;
}

type TitledNote = {
  title: string;
  ai_summary: string | null;
  created_at: string;
};

// Resolved at render rather than read straight from `title`, so notes saved
// before the sheet started naming them still read sensibly.
export function noteDisplayTitle(note: TitledNote): string {
  const fromSheet = titleFromSheet(note.ai_summary);
  if (fromSheet) return fromSheet;
  if (!note.ai_summary) {
    return `Note du ${formatNoteDate(note.created_at)} — en attente de la fiche`;
  }
  return note.title;
}
