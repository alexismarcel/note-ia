import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NoteAiSheet from "./note-ai-sheet";

export default async function NotePage({
  params,
}: PageProps<"/dashboard/notes/[id]">) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: note, error } = await supabase
    .from("notes")
    .select("id, title, content, ai_summary, created_at")
    .eq("id", id)
    .single();

  if (error) {
    // PGRST116 is "no rows returned" — either the note does not exist or RLS
    // hides someone else's. Anything else is a real failure worth showing.
    if (error.code === "PGRST116") {
      notFound();
    }
    console.error("Failed to load note:", error);
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          Impossible de charger la note : {error.message}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← Retour aux notes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{note.title}</h1>
        <time dateTime={note.created_at} className="text-sm text-gray-500">
          {new Date(note.created_at).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </time>
      </div>

      <NoteAiSheet noteId={note.id} initialSheet={note.ai_summary} />

      <div>
        <h2 className="mb-2 text-sm font-medium text-gray-500">
          Transcription brute
        </h2>
        <p className="whitespace-pre-wrap rounded-md border border-gray-200 p-4 text-sm leading-relaxed">
          {note.content || "Aucune transcription."}
        </p>
      </div>
    </main>
  );
}
