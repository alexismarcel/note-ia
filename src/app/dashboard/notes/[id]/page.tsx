import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatNoteDate, noteDisplayTitle } from "@/lib/notes/title";
import CoursePicker from "../../course-picker";
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
    .select("id, title, content, ai_summary, created_at, course_id")
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
      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger la note : {error.message}
        </p>
      </main>
    );
  }

  // Fetched separately rather than as an embedded resource: two plain queries
  // fail one at a time and say which, where a nested select that stops
  // resolving reports one opaque error for the whole row.
  let course: { id: string; title: string; subject: string | null } | null = null;
  if (note.course_id) {
    const { data, error: courseError } = await supabase
      .from("courses")
      .select("id, title, subjects (name)")
      .eq("id", note.course_id)
      .single();
    if (courseError) {
      console.error("[note] course lookup failed:", courseError);
    } else if (data) {
      const subject = data.subjects as { name: string } | { name: string }[] | null;
      course = {
        id: data.id,
        title: data.title,
        subject: Array.isArray(subject)
          ? subject[0]?.name ?? null
          : subject?.name ?? null,
      };
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-10 sm:px-8">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-ink-soft transition-colors hover:text-terracotta-deep"
        >
          ← Retour
        </Link>
        <h1 className="mt-3 font-display text-2xl font-medium text-ink">
          {noteDisplayTitle(note)}
        </h1>
        <time dateTime={note.created_at} className="text-sm text-ink-faint">
          {formatNoteDate(note.created_at)}
        </time>
        {course && (
          <p className="mt-2 text-sm">
            <Link
              href={`/dashboard/cours/${course.id}`}
              className="text-terracotta-deep hover:underline"
            >
              {course.subject ? `${course.subject} › ` : ""}
              {course.title}
            </Link>
          </p>
        )}
      </div>

      <CoursePicker
        mode="assign"
        noteId={note.id}
        initialCourseId={note.course_id ?? null}
      />

      <NoteAiSheet noteId={note.id} initialSheet={note.ai_summary} />

      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
          Transcription brute
        </h2>
        <p className="whitespace-pre-wrap rounded-2xl border border-line-soft bg-white p-5 text-sm leading-relaxed text-ink-soft">
          {note.content || "Aucune transcription."}
        </p>
      </div>
    </main>
  );
}
