import RecordClient from "./record-client";

// ?matiere=<id> / ?cours=<id> file the séance before it is captured, and they
// are read here rather than with useSearchParams in the client: that hook
// needs a Suspense boundary, and the boundary made the whole recorder render
// client-side — the page was served as an empty 8 KB shell that showed nothing
// until 800 KB of JavaScript had arrived. Reading them on the server costs
// this route its static rendering, which it barely had, and gives back a page
// that is legible the moment it lands.
export default async function RecordPage({
  searchParams,
}: PageProps<"/dashboard/record">) {
  const { matiere, cours } = await searchParams;
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : null;

  return (
    <RecordClient
      prefill={{ subjectId: one(matiere), courseId: one(cours) }}
    />
  );
}
