"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toErrorMessage } from "@/lib/errors";
import {
  bySubjectName,
  byCourseTitle,
  type Course,
  type Subject,
} from "@/lib/courses";

// What a note is filed under. A cours implies its matière; a matière on its
// own is a complete answer, which is the whole point of picking one before any
// cours exists.
export type Filing = {
  subjectId: string | null;
  courseId: string | null;
};

type Props =
  // Nothing is written: the parent carries the choice into its own insert.
  // Controlled, because the record page may learn the matière from the URL
  // after this component has already mounted.
  | {
      mode: "draft";
      value: Filing;
      onChange: (filing: Filing) => void;
    }
  // Each change writes the note's row straight away.
  | {
      mode: "assign";
      noteId: string;
      initialFiling: Filing;
    };

const NONE = "";

export default function CoursePicker(props: Props) {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assigned, setAssigned] = useState<Filing>(
    props.mode === "assign" ? props.initialFiling : { subjectId: null, courseId: null }
  );
  const filing = props.mode === "draft" ? props.value : assigned;

  const [newSubjectName, setNewSubjectName] = useState("");
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [creating, setCreating] = useState<"subject" | "course" | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      // No user_id filter: RLS already scopes both tables to the owner, and
      // the policies are the only thing that can be trusted here anyway.
      const [subjectRes, courseRes] = await Promise.all([
        supabase.from("subjects").select("id, name"),
        supabase.from("courses").select("id, title, subject_id"),
      ]);
      if (cancelled) return;

      const failure = subjectRes.error ?? courseRes.error;
      if (failure) {
        console.error("[course-picker] load failed:", failure);
        setError(toErrorMessage(failure));
      }
      setSubjects((subjectRes.data ?? []).sort(bySubjectName));
      setCourses((courseRes.data ?? []).sort(byCourseTitle));
      setIsLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const commit = async (next: Filing) => {
    setError(null);
    if (props.mode === "draft") {
      props.onChange(next);
      return;
    }

    setIsSaving(true);
    try {
      const supabase = createClient();
      const { error: failure } = await supabase
        .from("notes")
        .update({ subject_id: next.subjectId, course_id: next.courseId })
        .eq("id", props.noteId);
      if (failure) throw failure;
      setAssigned(next);
      // The breadcrumb above this picker is server-rendered from the same row.
      router.refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const createSubject = async () => {
    const name = newSubjectName.trim();
    if (!name) {
      setError("Donne un nom à la matière.");
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expirée, reconnecte-toi.");

      // subjects is unique on (user_id, lower(name)). The index is on an
      // expression, which onConflict cannot name, so reuse the matière here
      // instead of letting the insert fail with 23505.
      const existing = subjects.find(
        (s) => s.name.toLowerCase() === name.toLowerCase()
      );
      let subjectId = existing?.id ?? null;

      if (!subjectId) {
        const { data, error: failure } = await supabase
          .from("subjects")
          .insert({ user_id: user.id, name })
          .select("id, name")
          .single();
        if (failure) throw failure;
        subjectId = data.id;
        setSubjects((prev) => [...prev, data].sort(bySubjectName));
      }

      setNewSubjectName("");
      setCreating(null);
      setIsSaving(false);
      await commit({ subjectId, courseId: null });
      return;
    } catch (err) {
      setError(toErrorMessage(err));
    }
    setIsSaving(false);
  };

  const createCourse = async () => {
    const title = newCourseTitle.trim();
    if (!filing.subjectId) {
      setError("Choisis d'abord une matière.");
      return;
    }
    if (!title) {
      setError("Donne un titre au cours.");
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expirée, reconnecte-toi.");

      const { data: course, error: failure } = await supabase
        .from("courses")
        .insert({ user_id: user.id, subject_id: filing.subjectId, title })
        .select("id, title, subject_id")
        .single();
      if (failure) throw failure;

      setCourses((prev) => [...prev, course].sort(byCourseTitle));
      setNewCourseTitle("");
      setCreating(null);
      setIsSaving(false);
      await commit({ subjectId: course.subject_id, courseId: course.id });
      return;
    } catch (err) {
      setError(toErrorMessage(err));
    }
    setIsSaving(false);
  };

  const coursesInSubject = filing.subjectId
    ? courses.filter((c) => c.subject_id === filing.subjectId)
    : [];

  return (
    <div className="rounded-2xl border border-line-soft bg-white p-4">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
        Matière et cours
      </span>

      {/* Matière first: it stands on its own, and a cours only makes sense
          inside one. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="Matière"
          value={filing.subjectId ?? NONE}
          disabled={!isLoaded || isSaving}
          onChange={(e) =>
            // Changing matière drops the cours: keeping one from the previous
            // matière would file the note somewhere it cannot be found.
            commit({
              subjectId: e.target.value === NONE ? null : e.target.value,
              courseId: null,
            })
          }
          className="min-w-0 flex-1 rounded-xl border border-line-warm bg-cream px-3 py-2.5 text-sm text-ink disabled:opacity-60"
        >
          <option value={NONE}>
            {isLoaded ? "Aucune matière" : "Chargement…"}
          </option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => {
            setCreating((v) => (v === "subject" ? null : "subject"));
            setError(null);
          }}
          disabled={isSaving}
          className="shrink-0 rounded-xl border border-line-warm px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-terracotta hover:text-terracotta-deep disabled:opacity-60"
        >
          {creating === "subject" ? "Annuler" : "Nouvelle matière"}
        </button>
      </div>

      {creating === "subject" && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={newSubjectName}
            onChange={(e) => setNewSubjectName(e.target.value)}
            placeholder="Nom de la matière (ex. Économie)"
            aria-label="Nom de la nouvelle matière"
            autoFocus
            className="min-w-0 flex-1 rounded-xl border border-line-warm bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint"
          />
          <button
            type="button"
            onClick={createSubject}
            disabled={isSaving}
            className="shrink-0 rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {isSaving ? "…" : "Créer"}
          </button>
        </div>
      )}

      {/* The cours is optional on purpose: a matière alone is a valid answer,
          and most lectures are filed before anyone knows what to call the
          cours they belong to. */}
      {filing.subjectId && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              aria-label="Cours (facultatif)"
              value={filing.courseId ?? NONE}
              disabled={isSaving}
              onChange={(e) =>
                commit({
                  subjectId: filing.subjectId,
                  courseId: e.target.value === NONE ? null : e.target.value,
                })
              }
              className="min-w-0 flex-1 rounded-xl border border-line-warm bg-cream px-3 py-2.5 text-sm text-ink disabled:opacity-60"
            >
              <option value={NONE}>Aucun cours précis</option>
              {coursesInSubject.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setCreating((v) => (v === "course" ? null : "course"));
                setError(null);
              }}
              disabled={isSaving}
              className="shrink-0 rounded-xl border border-line-warm px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-terracotta hover:text-terracotta-deep disabled:opacity-60"
            >
              {creating === "course" ? "Annuler" : "Nouveau cours"}
            </button>
          </div>

          {creating === "course" && (
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={newCourseTitle}
                onChange={(e) => setNewCourseTitle(e.target.value)}
                placeholder="Titre du cours (ex. Chapitre 3 — l'inflation)"
                aria-label="Titre du nouveau cours"
                autoFocus
                className="min-w-0 flex-1 rounded-xl border border-line-warm bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint"
              />
              <button
                type="button"
                onClick={createCourse}
                disabled={isSaving}
                className="shrink-0 rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {isSaving ? "…" : "Créer"}
              </button>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
