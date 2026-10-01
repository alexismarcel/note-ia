"use client";

import { useRef } from "react";
import FicheView from "@/components/FicheView";
import { isInsufficient, type StoredSheet } from "@/lib/fiche";
import { titleFromSheet } from "@/lib/notes/title";
import SheetDownloadButton from "./sheet-download-button";

type Props = {
  sheet: StoredSheet;
  matiere?: string;
  dureeSecondes?: number;
  nbMotsTranscrits?: number;
  creeLe?: string;
};

// Sheets generated before the JSON migration are markdown strings and keep
// the rendering they always had; fiche objects go through FicheView. One
// switch, used by every page that shows a sheet, so no page can end up
// handing an object to a text renderer — and every sheet shown gets the
// download button. A "transcript too short" answer is not a sheet and gets
// none.
export default function SheetContent({ sheet, ...meta }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const fileName = `Fiche — ${titleFromSheet(sheet) ?? "Note IA"}`;

  return (
    <div className="flex flex-col gap-3">
      {!isInsufficient(sheet) && (
        <div className="flex justify-end">
          <SheetDownloadButton target={ref} fileName={fileName} />
        </div>
      )}
      {/* What the PDF holds: this element and nothing else on the page. */}
      <div ref={ref}>
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
    </div>
  );
}
