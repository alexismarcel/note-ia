"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toErrorMessage } from "@/lib/errors";
import { bySubjectName, type Subject } from "@/lib/courses";

type Props = {
  courseId: string;
  currentSubjectId: string;
};

export default function MoveButton({ courseId, currentSubjectId }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [target, setTarget] = useState(currentSubjectId);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loaded on open rather than on mount: most visits to a cours page are not
  // about moving it.
  const open = async () => {
    setIsOpen(true);
    setError(null);
    setTarget(currentSubjectId);
    if (isLoaded) return;

    const supabase = createClient();
    const { data, error: failure } = await supabase
      .from("subjects")
      .select("id, name");
    if (failure) {
      console.error("[move] subjects query failed:", failure);
      setError(toErrorMessage(failure));
      return;
    }
    setSubjects((data ?? []).sort(bySubjectName));
    setIsLoaded(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (target === currentSubjectId) {
      setIsOpen(false);
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const supabase = createClient();
      // The séances follow: courses_sync_notes_subject() realigns every note
      // of this cours on the new matière.
      const { error: failure } = await supabase
        .from("courses")
        .update({ subject_id: target })
        .eq("id", courseId);
      if (failure) throw failure;

      setIsOpen(false);
      router.refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={open}
        aria-label="Déplacer le cours dans une autre matière"
        className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-ink-faint transition-colors hover:bg-sand hover:text-terracotta-deep"
      >
        Déplacer
      </button>
    );
  }

  const others = subjects.filter((s) => s.id !== currentSubjectId);

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-2">
      <span className="text-xs text-ink-soft">
        Déplacer ce cours, et ses séances, vers :
      </span>
      <div className="flex flex-wrap gap-2">
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          aria-label="Matière de destination"
          disabled={!isLoaded || isSaving}
          className="min-w-0 flex-1 rounded-xl border border-line-warm bg-cream px-3 py-2.5 text-sm text-ink disabled:opacity-60"
        >
          <option value={currentSubjectId}>
            {isLoaded ? "Matière actuelle" : "Chargement…"}
          </option>
          {others.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isSaving || !isLoaded}
          className="shrink-0 rounded-full bg-terracotta px-4 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isSaving ? "…" : "Déplacer"}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setError(null);
          }}
          disabled={isSaving}
          className="shrink-0 rounded-full border border-line-warm px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-cream disabled:opacity-60"
        >
          Annuler
        </button>
      </div>
      {isLoaded && others.length === 0 && (
        <p className="text-xs text-ink-faint">
          Tu n&apos;as qu&apos;une seule matière — crée-en une autre depuis
          « Mes cours » pour pouvoir y déplacer ce cours.
        </p>
      )}
      {error && (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
