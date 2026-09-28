import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAuthFailure } from "@/lib/supabase/auth-error";
import { createClient } from "@/lib/supabase/server";
import { formatNoteDate, noteDisplayTitle } from "@/lib/notes/title";
import CoursePicker from "../../course-picker";
import NoteAiSheet from "./note-ai-sheet";

export default async function NotePage({
  params,
}: PageProps<"/dashboard/notes/[id]">) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: note, error } = await supabase
    .from("notes")
    .select("id, title, content, ai_summary, created_at, subject_id, course_id")
    .eq("id", id)
    .single();

  if (isAuthFailure(error)) {
    redirect("/login");
  }
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

  // Fetched separately rather than as embedded resources: plain queries fail
  // one at a time and say which, where a nested select that stops resolving
  // reports one opaque error for the whole row.
  const [subjectRes, courseRes] = await Promise.all([
    note.subject_id
      ? supabase.from("subjects").select("id, name").eq("id", note.subject_id).single()
      : Promise.resolve({ data: null, error: null }),
    note.course_id
      ? supabase.from("courses").select("id, title").eq("id", note.course_id).single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (subjectRes.error) {
    console.error("[note] subject lookup failed:", subjectRes.error);
  }
  if (courseRes.error) {
    console.error("[note] course lookup failed:", courseRes.error);
  }

  const subject = subjectRes.data;
  const course = courseRes.data;

  // Only the sheet ceiling closes generation; the 3 h ceiling deliberately
  // leaves it open, which is the rule the product asked for.
  const { data: usageRows } = await supabase
    .from("usage_summary")
    .select("is_subscribed, free_sheets_used, free_sheet_allowance")
    .single();
  const canGenerate =
    usageRows?.is_subscribed === true ||
    (usageRows?.free_sheets_used ?? 0) < (usageRows?.free_sheet_allowance ?? 0);

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
        {subject && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
            <Link
              href={`/dashboard/matieres/${subject.id}`}
              className="text-terracotta-deep hover:underline"
            >
              {subject.name}
            </Link>
            {course && (
              <>
                <span aria-hidden="true" className="text-ink-faint">
                  ›
                </span>
                <Link
                  href={`/dashboard/cours/${course.id}`}
                  className="text-terracotta-deep hover:underline"
                >
                  {course.title}
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      <CoursePicker
        mode="assign"
        noteId={note.id}
        initialFiling={{
          subjectId: note.subject_id ?? null,
          courseId: note.course_id ?? null,
        }}
      />

      <NoteAiSheet
        noteId={note.id}
        initialSheet={note.ai_summary}
        canGenerate={canGenerate}
      />

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
