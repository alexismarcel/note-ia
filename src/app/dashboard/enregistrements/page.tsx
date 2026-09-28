import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthFailure } from "@/lib/supabase/auth-error";
import { createClient } from "@/lib/supabase/server";
import { filingLabel } from "@/lib/courses";
import { formatNoteDate } from "@/lib/notes/title";
import DeleteButton from "../delete-button";

export default async function RecordingsPage() {
  const supabase = await createClient();

  // note_previews carries 400 characters of transcript instead of the whole
  // thing: this list clamps to two lines, and a two-hour lecture is ~100 KB.
  // No getUser and no user_id filter — the proxy has already turned away a
  // signed-out visitor, and RLS scopes every row to its owner.
  const [notesRes, subjectRes, courseRes] = await Promise.all([
    supabase
      .from("note_previews")
      .select("id, content_preview, created_at, subject_id, course_id")
      .order("created_at", { ascending: false }),
    supabase.from("subjects").select("id, name"),
    supabase.from("courses").select("id, title"),
  ]);

  const error = notesRes.error;
  if (isAuthFailure(error)) {
    redirect("/login");
  }
  if (error) {
    console.error("[enregistrements] query failed:", error);
  }
  if (subjectRes.error ?? courseRes.error) {
    console.error(
      "[enregistrements] filing labels failed:",
      subjectRes.error ?? courseRes.error
    );
  }

  const notes = notesRes.data;
  const subjectNames = new Map(
    (subjectRes.data ?? []).map((subject) => [subject.id, subject.name])
  );
  const courseTitles = new Map(
    (courseRes.data ?? []).map((course) => [course.id, course.title])
  );

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
      <Link
        href="/dashboard"
        className="text-sm text-ink-soft transition-colors hover:text-terracotta-deep"
      >
        ← Retour
      </Link>
      <h1 className="mt-3 font-display text-2xl font-medium text-ink">
        Mes enregistrements
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Les transcriptions brutes, telles que captées.
      </p>

      {error ? (
        <p className="mt-8 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger les enregistrements : {error.message}
        </p>
      ) : notes && notes.length > 0 ? (
        <ul className="mt-8 flex flex-col gap-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className="flex items-start gap-3 rounded-2xl border border-line-soft bg-white p-5 transition-colors hover:border-line-warm"
            >
              <Link
                href={`/dashboard/notes/${note.id}`}
                className="min-w-0 flex-1"
              >
                <time
                  dateTime={note.created_at}
                  className="font-display text-base font-medium text-ink"
                >
                  {formatNoteDate(note.created_at)}
                </time>
                <span className="mt-1 block text-xs text-ink-faint">
                  {filingLabel(
                    note.subject_id ? subjectNames.get(note.subject_id) : undefined,
                    note.course_id ? courseTitles.get(note.course_id) : undefined
                  )}
                </span>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">
                  {note.content_preview || "Aucune transcription."}
                </p>
              </Link>
              <DeleteButton
                noteId={note.id}
                createdAt={note.created_at}
                mode="note"
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-ink-soft">
          Aucun enregistrement pour le moment.
        </p>
      )}
    </main>
  );
}
