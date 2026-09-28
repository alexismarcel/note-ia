import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { countLabel } from "@/lib/courses";
import { formatNoteDate, noteDisplayTitle } from "@/lib/notes/title";
import GroupDeleteButton from "../group-delete-button";
import MoveButton from "../move-button";
import RenameButton from "../rename-button";

export default async function CoursePage({
  params,
}: PageProps<"/dashboard/cours/[id]">) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Both queries key off the id in the URL, not off each other, so they go out
  // together: waiting for the cours before asking for its séances cost a full
  // round trip to Supabase for nothing.
  const [courseRes, notesRes] = await Promise.all([
    supabase
      .from("courses")
      .select("id, title, subject_id, subjects (name)")
      .eq("id", id)
      .single(),
    // Ascending: a cours is read in the order it was taught, unlike the lists
    // elsewhere which put the newest capture first.
    supabase
      .from("notes")
      .select("id, title, ai_summary, created_at")
      .eq("course_id", id)
      .order("created_at", { ascending: true }),
  ]);

  const { data: course, error: courseError } = courseRes;

  if (courseError) {
    if (courseError.code === "PGRST116") {
      notFound();
    }
    console.error("[cours] query failed:", courseError);
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger le cours : {courseError.message}
        </p>
      </main>
    );
  }

  const embedded = course.subjects as
    | { name: string }
    | { name: string }[]
    | null;
  const subjectName = Array.isArray(embedded)
    ? embedded[0]?.name ?? null
    : embedded?.name ?? null;

  const { data: notes, error: notesError } = notesRes;

  if (notesError) {
    console.error("[cours] notes query failed:", notesError);
  }

  const sessions = notes ?? [];
  const withSheets = sessions.filter((note) => note.ai_summary);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
      <Link
        href={`/dashboard/matieres/${course.subject_id}`}
        className="text-sm text-ink-soft transition-colors hover:text-terracotta-deep"
      >
        ← {subjectName ?? "Mes cours"}
      </Link>

      <div className="mt-3">
        <h1 className="font-display text-2xl font-medium text-ink">
          {course.title}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {countLabel(sessions.length, "séance")} ·{" "}
          {countLabel(withSheets.length, "fiche")}
        </p>
        <div className="mt-2 flex flex-wrap items-start gap-1">
          <RenameButton mode="course" id={course.id} currentName={course.title} />
          <MoveButton courseId={course.id} currentSubjectId={course.subject_id} />
          <GroupDeleteButton
            mode="course"
            id={course.id}
            redirectTo={`/dashboard/matieres/${course.subject_id}`}
          />
        </div>
      </div>

      <Link
        href={`/dashboard/record?cours=${course.id}`}
        className="mt-6 inline-flex items-center gap-2.5 rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-cream/70" />
        Enregistrer une séance
      </Link>

      {notesError && (
        <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger les séances : {notesError.message}
        </p>
      )}

      {sessions.length > 0 ? (
        <ol className="mt-8 flex flex-col gap-3">
          {sessions.map((note, index) => (
            <li
              key={note.id}
              className="rounded-2xl border border-line-soft bg-white p-5 transition-colors hover:border-line-warm"
            >
              <Link href={`/dashboard/notes/${note.id}`} className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
                  Séance {index + 1} · {formatNoteDate(note.created_at)}
                </span>
                <h2 className="mt-1 font-display text-lg font-medium text-ink">
                  {noteDisplayTitle(note)}
                </h2>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-8 rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-ink-soft">
          Aucune séance dans ce cours. Enregistrez-en une, ou rattachez une note
          existante depuis sa page.
        </p>
      )}

      {withSheets.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Le cours complet
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Les fiches des séances, à la suite, dans l&apos;ordre où le cours a
            été donné.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {withSheets.map((note) => (
              <article
                key={note.id}
                className="rounded-2xl border border-line-soft bg-white p-5"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
                  Séance {sessions.indexOf(note) + 1} ·{" "}
                  {formatNoteDate(note.created_at)}
                </span>
                {/* Sheets are stored as markdown but rendered as preformatted
                    text, exactly as on the note page — one renderer, or none,
                    rather than two that disagree. */}
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                  {note.ai_summary}
                </p>
              </article>
            ))}
            {withSheets.length < sessions.length && (
              <p className="text-sm text-ink-faint">
                {countLabel(sessions.length - withSheets.length, "séance")} sans
                fiche IA — ouvrez-la pour la générer.
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
