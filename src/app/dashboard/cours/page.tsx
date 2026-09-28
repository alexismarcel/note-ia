import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { bySubjectName, countLabel } from "@/lib/courses";

export default async function SubjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Three flat queries instead of nested aggregates: the counts are folded in
  // JS below, which keeps a failure attributable to one table.
  const [subjectRes, courseRes, noteRes] = await Promise.all([
    supabase.from("subjects").select("id, name").eq("user_id", user.id),
    supabase
      .from("courses")
      .select("id, subject_id")
      .eq("user_id", user.id),
    supabase.from("notes").select("id, course_id").eq("user_id", user.id),
  ]);

  const error = subjectRes.error ?? courseRes.error ?? noteRes.error;
  if (error) {
    console.error("[cours] query failed:", error);
  }

  const courses = courseRes.data ?? [];
  const notes = noteRes.data ?? [];

  const notesByCourse = new Map<string, number>();
  let unclassified = 0;
  for (const note of notes) {
    if (!note.course_id) {
      unclassified += 1;
      continue;
    }
    notesByCourse.set(note.course_id, (notesByCourse.get(note.course_id) ?? 0) + 1);
  }

  const subjects = (subjectRes.data ?? []).sort(bySubjectName).map((subject) => {
    const own = courses.filter((c) => c.subject_id === subject.id);
    return {
      ...subject,
      courseCount: own.length,
      noteCount: own.reduce((sum, c) => sum + (notesByCourse.get(c.id) ?? 0), 0),
    };
  });

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
      <Link
        href="/dashboard"
        className="text-sm text-ink-soft transition-colors hover:text-terracotta-deep"
      >
        ← Retour
      </Link>
      <h1 className="mt-3 font-display text-2xl font-medium text-ink">
        Mes cours
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Vos matières, et dans chacune les cours que vos séances composent.
      </p>

      {error ? (
        <p className="mt-8 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger les matières : {error.message}
        </p>
      ) : subjects.length > 0 ? (
        <ul className="mt-8 flex flex-col gap-3">
          {subjects.map((subject) => (
            <li key={subject.id}>
              <Link
                href={`/dashboard/matieres/${subject.id}`}
                className="flex items-center gap-4 rounded-2xl border border-line-soft bg-white p-5 transition-colors hover:border-line-warm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg font-medium text-ink">
                    {subject.name}
                  </span>
                  <span className="block text-sm text-ink-soft">
                    {countLabel(subject.courseCount, "cours", "cours")} ·{" "}
                    {countLabel(subject.noteCount, "séance")}
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
            Aucune matière pour le moment. Créez-en une au moment d&apos;un
            enregistrement, ou depuis une note déjà enregistrée.
          </p>
          <Link
            href="/dashboard/record"
            className="mt-4 inline-block text-sm font-semibold text-terracotta-deep hover:underline"
          >
            Enregistrer un cours
          </Link>
        </div>
      )}

      {unclassified > 0 && (
        <p className="mt-6 text-sm text-ink-soft">
          {countLabel(unclassified, "note")}{" "}
          {unclassified > 1 ? "ne sont" : "n'est"} rattachée
          {unclassified > 1 ? "s" : ""} à aucun cours.{" "}
          <Link
            href="/dashboard/enregistrements"
            className="font-semibold text-terracotta-deep hover:underline"
          >
            Les classer
          </Link>
        </p>
      )}
    </main>
  );
}
