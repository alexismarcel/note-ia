import type { StoredSheet } from "@/lib/fiche";

export function formatNoteDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// A markdown sheet (every one generated before the JSON migration) opens with
// an H1 the model derives from the lecture. "## Plan du cours" and friends
// cannot match: a second # is not whitespace. A fiche object carries the same
// title in `titre`; one that says the transcript was too short has none.
export function titleFromSheet(
  sheet: StoredSheet | null | undefined
): string | null {
  if (!sheet) return null;
  if (typeof sheet !== "string") {
    return sheet.suffisant === false ? null : sheet.titre.trim() || null;
  }
  for (const line of sheet.split("\n")) {
    const heading = /^#\s+(.+)$/.exec(line.trim());
    if (heading) return heading[1].trim() || null;
  }
  return null;
}

type TitledNote = {
  title: string;
  ai_summary: StoredSheet | null;
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

type PreviewedNote = {
  title: string;
  created_at: string;
  // From the note_previews view: the first 400 characters of a markdown
  // sheet, or a text digest of a fiche object (its section titles).
  summary_preview: string | null;
  // The fiche's `titre`; null for markdown sheets, which carry it in their H1.
  summary_title: string | null;
};

// For the list pages, which read the note_previews view rather than the full
// sheet.
export function previewDisplayTitle(note: PreviewedNote): string {
  return (
    note.summary_title?.trim() ||
    noteDisplayTitle({ ...note, ai_summary: note.summary_preview })
  );
}
