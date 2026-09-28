import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { byCourseTitle, countLabel } from "@/lib/courses";
import { formatNoteDate, noteDisplayTitle } from "@/lib/notes/title";
import GroupDeleteButton from "../../cours/group-delete-button";
import RenameButton from "../../cours/rename-button";
import QuickAdd from "../../cours/quick-add";

export default async function SubjectPage({
  params,
}: PageProps<"/dashboard/matieres/[id]">) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: subject, error: subjectError } = await supabase
    .from("subjects")
    .select("id, name")
    .eq("id", id)
    .single();

  if (subjectError) {
    // PGRST116: no row — the matière does not exist, or RLS hides someone
    // else's. Both are a 404 from here.
    if (subjectError.code === "PGRST116") {
      notFound();
    }
    console.error("[matiere] query failed:", subjectError);
    return (
      <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger la matière : {subjectError.message}
        </p>
      </main>
    );
  }

  const [courseRes, noteRes] = await Promise.all([
    supabase
      .from("courses")
      .select("id, title, subject_id, created_at")
      .eq("subject_id", subject.id),
    supabase
      .from("notes")
      .select("id, title, ai_summary, created_at, course_id")
      .eq("subject_id", subject.id)
      .order("created_at", { ascending: false }),
  ]);

  if (courseRes.error) {
    console.error("[matiere] courses query failed:", courseRes.error);
  }
  if (noteRes.error) {
    console.error("[matiere] notes query failed:", noteRes.error);
  }

  const courses = (courseRes.data ?? []).sort(byCourseTitle);
  const notes = noteRes.data ?? [];

  const notesByCourse = new Map<string, number>();
  // Notes filed in the matière but in no cours: they would be invisible if the
  // page only listed cours.
  const loose = notes.filter((note) => {
    if (!note.course_id) return true;
    notesByCourse.set(
      note.course_id,
      (notesByCourse.get(note.course_id) ?? 0) + 1
    );
    return false;
  });

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
      <Link
        href="/dashboard/cours"
        className="text-sm text-ink-soft transition-colors hover:text-terracotta-deep"
      >
        ← Mes cours
      </Link>
      <div className="mt-3">
        <h1 className="font-display text-2xl font-medium text-ink">
          {subject.name}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {countLabel(courses.length, "cours", "cours")} ·{" "}
          {countLabel(notes.length, "note")}
        </p>
        {/* Below the title rather than beside it: renaming opens a field that
            needs the full width, which a column pinned to the right cannot
            give it. */}
        <div className="mt-2 flex flex-wrap items-start gap-1">
          <RenameButton
            mode="subject"
            id={subject.id}
            currentName={subject.name}
          />
          <GroupDeleteButton
            mode="subject"
            id={subject.id}
            redirectTo="/dashboard/cours"
          />
        </div>
      </div>

      <Link
        href={`/dashboard/record?matiere=${subject.id}`}
        className="mt-6 inline-flex items-center gap-2.5 rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-cream/70" />
        Enregistrer dans cette matière
      </Link>

      {courses.length > 0 ? (
        <ul className="mt-8 flex flex-col gap-3">
          {courses.map((course) => (
            <li key={course.id}>
              <Link
                href={`/dashboard/cours/${course.id}`}
                className="flex items-center gap-4 rounded-2xl border border-line-soft bg-white p-5 transition-colors hover:border-line-warm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg font-medium text-ink">
                    {course.title}
                  </span>
                  <span className="block text-sm text-ink-soft">
                    {countLabel(notesByCourse.get(course.id) ?? 0, "séance")} ·
                    depuis le {formatNoteDate(course.created_at)}
                  </span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-ink-faint">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-ink-soft">
          Aucun cours dans cette matière. Tu peux enregistrer sans en créer : la
          note se rangera ici.
        </p>
      )}

      <QuickAdd mode="course" subjectId={subject.id} />

      {loose.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Dans cette matière, hors cours
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {loose.map((note) => (
              <li key={note.id}>
                <Link
                  href={`/dashboard/notes/${note.id}`}
                  className="block rounded-2xl border border-line-soft bg-white p-5 transition-colors hover:border-line-warm"
                >
                  <time
                    dateTime={note.created_at}
                    className="text-xs text-ink-faint"
                  >
                    {formatNoteDate(note.created_at)}
                  </time>
                  <span className="mt-1 block font-display text-base font-medium text-ink">
                    {noteDisplayTitle(note)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
