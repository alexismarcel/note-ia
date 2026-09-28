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

type Props =
  // Nothing is written: the parent carries the choice into its own insert.
  // Controlled, because the record page may learn the course from the URL
  // after this component has already mounted.
  | {
      mode: "draft";
      value: string | null;
      onChange: (courseId: string | null) => void;
    }
  // Each change writes notes.course_id straight away.
  | {
      mode: "assign";
      noteId: string;
      initialCourseId: string | null;
    };

const UNCLASSIFIED = "";

export default function CoursePicker(props: Props) {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assigned, setAssigned] = useState<string | null>(
    props.mode === "assign" ? props.initialCourseId : null
  );
  const selected = props.mode === "draft" ? props.value : assigned;

  const [isCreating, setIsCreating] = useState(false);
  // "" means "a matière that does not exist yet", named by newSubjectName.
  const [subjectChoice, setSubjectChoice] = useState("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newCourseTitle, setNewCourseTitle] = useState("");

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

  const commit = async (courseId: string | null) => {
    setError(null);
    if (props.mode === "draft") {
      props.onChange(courseId);
      return;
    }

    setIsSaving(true);
    try {
      const supabase = createClient();
      const { error: failure } = await supabase
        .from("notes")
        .update({ course_id: courseId })
        .eq("id", props.noteId);
      if (failure) throw failure;
      setAssigned(courseId);
      // The breadcrumb above this picker is server-rendered from the same row.
      router.refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const createCourse = async () => {
    const title = newCourseTitle.trim();
    const typedSubject = newSubjectName.trim();
    if (!title) {
      setError("Donne un titre au cours.");
      return;
    }
    if (!subjectChoice && !typedSubject) {
      setError("Choisis une matière existante ou donne un nom à la nouvelle.");
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

      let subjectId = subjectChoice;
      if (!subjectId) {
        // subjects is unique on (user_id, lower(name)). The index is on an
        // expression, which onConflict cannot name, so reuse the matière here
        // instead of letting the insert fail with 23505.
        const existing = subjects.find(
          (s) => s.name.toLowerCase() === typedSubject.toLowerCase()
        );
        if (existing) {
          subjectId = existing.id;
        } else {
          const { data, error: failure } = await supabase
            .from("subjects")
            .insert({ user_id: user.id, name: typedSubject })
            .select("id, name")
            .single();
          if (failure) throw failure;
          subjectId = data.id;
          setSubjects((prev) => [...prev, data].sort(bySubjectName));
        }
      }

      const { data: course, error: courseFailure } = await supabase
        .from("courses")
        .insert({ user_id: user.id, subject_id: subjectId, title })
        .select("id, title, subject_id")
        .single();
      if (courseFailure) throw courseFailure;

      setCourses((prev) => [...prev, course].sort(byCourseTitle));
      setIsCreating(false);
      setNewCourseTitle("");
      setNewSubjectName("");
      setSubjectChoice("");
      setIsSaving(false);
      await commit(course.id);
      return;
    } catch (err) {
      setError(toErrorMessage(err));
    }
    setIsSaving(false);
  };

  const selectedCourse = courses.find((c) => c.id === selected) ?? null;
  const selectedSubject = selectedCourse
    ? subjects.find((s) => s.id === selectedCourse.subject_id)
    : null;

  return (
    <div className="rounded-2xl border border-line-soft bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label
          htmlFor="course-picker"
          className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint"
        >
          Matière et cours
        </label>
        {selectedSubject && (
          <span className="text-xs text-ink-faint">
            {selectedSubject.name} › {selectedCourse?.title}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          id="course-picker"
          value={selected ?? UNCLASSIFIED}
          disabled={!isLoaded || isSaving}
          onChange={(e) =>
            commit(e.target.value === UNCLASSIFIED ? null : e.target.value)
          }
          className="min-w-0 flex-1 rounded-xl border border-line-warm bg-cream px-3 py-2.5 text-sm text-ink disabled:opacity-60"
        >
          <option value={UNCLASSIFIED}>
            {isLoaded ? "Non classé" : "Chargement…"}
          </option>
          {subjects.map((subject) => {
            const inSubject = courses.filter((c) => c.subject_id === subject.id);
            if (inSubject.length === 0) return null;
            return (
              <optgroup key={subject.id} label={subject.name}>
                {inSubject.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>

        <button
          type="button"
          onClick={() => {
            setIsCreating((v) => !v);
            setError(null);
          }}
          disabled={isSaving}
          className="shrink-0 rounded-xl border border-line-warm px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-terracotta hover:text-terracotta-deep disabled:opacity-60"
        >
          {isCreating ? "Annuler" : "Nouveau cours"}
        </button>
      </div>

      {isCreating && (
        <div className="mt-3 flex flex-col gap-2 border-t border-line-soft pt-3">
          <select
            value={subjectChoice}
            onChange={(e) => setSubjectChoice(e.target.value)}
            aria-label="Matière du nouveau cours"
            className="rounded-xl border border-line-warm bg-cream px-3 py-2.5 text-sm text-ink"
          >
            <option value="">Nouvelle matière…</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
          {!subjectChoice && (
            <input
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              placeholder="Nom de la matière (ex. Économie)"
              aria-label="Nom de la nouvelle matière"
              className="rounded-xl border border-line-warm bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint"
            />
          )}
          <input
            value={newCourseTitle}
            onChange={(e) => setNewCourseTitle(e.target.value)}
            placeholder="Titre du cours (ex. Chapitre 3 — l'inflation)"
            aria-label="Titre du nouveau cours"
            className="rounded-xl border border-line-warm bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint"
          />
          <button
            type="button"
            onClick={createCourse}
            disabled={isSaving}
            className="self-start rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {isSaving ? "…" : "Créer et sélectionner"}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
