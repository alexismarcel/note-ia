// A plain link to the PDF route: the server answers with an attachment, so
// the browser saves a file — on a phone too — instead of printing the page.
export default function SheetDownloadButton({ noteId }: { noteId: string }) {
  return (
    <a
      href={`/api/notes/${noteId}/pdf`}
      download
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
