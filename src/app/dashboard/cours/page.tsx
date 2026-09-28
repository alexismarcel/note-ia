import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthFailure } from "@/lib/supabase/auth-error";
import { createClient } from "@/lib/supabase/server";
import { bySubjectName, countLabel } from "@/lib/courses";
import QuickAdd from "./quick-add";

export default async function SubjectsPage() {
  const supabase = await createClient();

  // Three flat queries instead of nested aggregates: the counts are folded in
  // JS below, which keeps a failure attributable to one table.
  const [subjectRes, courseRes, noteRes] = await Promise.all([
    supabase.from("subjects").select("id, name"),
    supabase.from("courses").select("id, subject_id"),
    // Only the two light columns: no transcript, no sheet.
    supabase.from("notes").select("id, subject_id"),
  ]);

  const error = subjectRes.error ?? courseRes.error ?? noteRes.error;
  if (isAuthFailure(error)) {
    redirect("/login");
  }
  if (error) {
    console.error("[cours] query failed:", error);
  }

  const courses = courseRes.data ?? [];
  const notes = noteRes.data ?? [];

  // notes.subject_id is kept in step with the cours' matière by a trigger, so
  // it counts a note filed either way.
  const notesBySubject = new Map<string, number>();
  let unclassified = 0;
  for (const note of notes) {
    if (!note.subject_id) {
      unclassified += 1;
      continue;
    }
    notesBySubject.set(
      note.subject_id,
      (notesBySubject.get(note.subject_id) ?? 0) + 1
    );
  }

  const subjects = (subjectRes.data ?? []).sort(bySubjectName).map((subject) => ({
    ...subject,
    courseCount: courses.filter((c) => c.subject_id === subject.id).length,
    noteCount: notesBySubject.get(subject.id) ?? 0,
  }));

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
        Pose tes matières ici. Elles seront proposées au moment d&apos;enregistrer.
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
                    {countLabel(subject.noteCount, "note")}
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
          Aucune matière pour le moment. Ajoute-les une par une, sans rien
          enregistrer.
        </p>
      )}

      <QuickAdd mode="subject" />

      {unclassified > 0 && (
        <p className="mt-6 text-sm text-ink-soft">
          {countLabel(unclassified, "note")}{" "}
          {unclassified > 1 ? "ne sont" : "n'est"} rattachée
          {unclassified > 1 ? "s" : ""} à aucune matière.{" "}
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
