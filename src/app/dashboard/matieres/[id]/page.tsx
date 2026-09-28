import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { byCourseTitle, countLabel } from "@/lib/courses";
import { formatNoteDate } from "@/lib/notes/title";
import GroupDeleteButton from "../../cours/group-delete-button";

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

  const { data: courses, error: coursesError } = await supabase
    .from("courses")
    .select("id, title, created_at")
    .eq("subject_id", subject.id)
    .order("created_at", { ascending: false });

  if (coursesError) {
    console.error("[matiere] courses query failed:", coursesError);
  }

  const courseIds = (courses ?? []).map((c) => c.id);
  const notesByCourse = new Map<string, number>();
  if (courseIds.length > 0) {
    const { data: notes, error: notesError } = await supabase
      .from("notes")
      .select("id, course_id")
      .in("course_id", courseIds);
    if (notesError) {
      console.error("[matiere] notes count failed:", notesError);
    }
    for (const note of notes ?? []) {
      if (!note.course_id) continue;
      notesByCourse.set(
        note.course_id,
        (notesByCourse.get(note.course_id) ?? 0) + 1
      );
    }
  }

  const sorted = (courses ?? [])
    .map((c) => ({ ...c, subject_id: subject.id }))
    .sort(byCourseTitle);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
      <Link
        href="/dashboard/cours"
        className="text-sm text-ink-soft transition-colors hover:text-terracotta-deep"
      >
        ← Mes cours
      </Link>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-medium text-ink">
            {subject.name}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {countLabel(sorted.length, "cours", "cours")} dans cette matière.
          </p>
        </div>
        <GroupDeleteButton
          mode="subject"
          id={subject.id}
          redirectTo="/dashboard/cours"
        />
      </div>

      {sorted.length > 0 ? (
        <ul className="mt-8 flex flex-col gap-3">
          {sorted.map((course) => (
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
        <div className="mt-8 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
          <p className="text-sm text-ink-soft">
            Aucun cours dans cette matière pour le moment.
          </p>
          <Link
            href="/dashboard/record"
            className="mt-4 inline-block text-sm font-semibold text-terracotta-deep hover:underline"
          >
            Enregistrer un cours
          </Link>
        </div>
      )}
    </main>
  );
}
