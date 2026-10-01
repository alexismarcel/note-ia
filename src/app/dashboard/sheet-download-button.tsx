"use client";

import { useState, type RefObject } from "react";

type Props = {
  // The element holding the sheet: everything else on the page is left out
  // of the printout.
  target: RefObject<HTMLElement | null>;
  // Becomes the PDF's default file name.
  fileName: string;
};

const HIDDEN = "data-print-hide";

// "Télécharger en PDF" through the browser's own print dialog, which every
// browser can save as a PDF (on a phone, from the share sheet): no PDF
// library to ship, and the file looks exactly like the sheet on screen.
// Before printing, every element that is not the sheet or one of its
// ancestors is marked and hidden by the print rule in globals.css, so the
// PDF holds the sheet alone, paginated normally.
export default function SheetDownloadButton({ target, fileName }: Props) {
  const [busy, setBusy] = useState(false);

  const download = () => {
    const sheet = target.current;
    if (!sheet || busy) return;
    setBusy(true);

    const hidden: Element[] = [];
    for (let node: Element = sheet; node.parentElement; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling !== node) {
          sibling.setAttribute(HIDDEN, "");
          hidden.push(sibling);
        }
      }
    }
    const previousTitle = document.title;
    document.title = fileName;

    // Undone only once the dialog has closed: on some browsers print()
    // returns before the page has been captured.
    const restore = () => {
      window.removeEventListener("afterprint", restore);
      for (const el of hidden) el.removeAttribute(HIDDEN);
      document.title = previousTitle;
      setBusy(false);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-line-warm px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-white disabled:opacity-50"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      Télécharger en PDF
    </button>
  );
}
