import FicheView from "@/components/FicheView";
import { isInsufficient, type StoredSheet } from "@/lib/fiche";
import SheetDownloadButton from "./sheet-download-button";

type Props = {
  sheet: StoredSheet;
  // The note the sheet is saved on. Without it — a sheet shown before it
  // was saved — there is nothing for the PDF route to read, so no button.
  noteId?: string;
  matiere?: string;
  dureeSecondes?: number;
  nbMotsTranscrits?: number;
  creeLe?: string;
};

// Sheets generated before the JSON migration are markdown strings and keep
// the rendering they always had; fiche objects go through FicheView. One
// switch, used by every page that shows a sheet, so no page can end up
// handing an object to a text renderer — and every saved sheet gets the
// download button. A "transcript too short" answer is not a sheet and gets
// none.
export default function SheetContent({ sheet, noteId, ...meta }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {noteId && !isInsufficient(sheet) && (
        <div className="flex justify-end">
          <SheetDownloadButton noteId={noteId} />
        </div>
      )}
      {typeof sheet === "string" ? (
        <article className="whitespace-pre-wrap rounded-2xl border border-line-soft bg-white p-5 text-sm leading-relaxed text-ink">
          {sheet}
        </article>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line-soft bg-white">
          <FicheView fiche={sheet} {...meta} />
        </div>
      )}
    </div>
  );
}
