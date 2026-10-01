"use client";

import type { MouseEvent } from "react";

// iPhone and iPad, iPadOS included (it reports itself as a Mac with touch).
const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// A link to the PDF route. Elsewhere the server sends an attachment and the
// browser saves the file. On iOS a download link does nothing in an app's
// built-in browser or a home-screen web app, so there the tap opens the PDF
// itself, from which the share button saves it to Files; going back
// returns to the sheet.
export default function SheetDownloadButton({ noteId }: { noteId: string }) {
  const href = `/api/notes/${noteId}/pdf`;

  const open = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!isIos()) return;
    e.preventDefault();
    window.location.assign(new URL(`${href}?inline=1`, window.location.origin).href);
  };

  return (
    <a
      href={href}
      download
      onClick={open}
      className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-line-warm px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-white"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      Télécharger en PDF
    </a>
  );
}
