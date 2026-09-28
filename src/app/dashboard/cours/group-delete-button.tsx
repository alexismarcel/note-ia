"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toErrorMessage } from "@/lib/errors";

type Props = {
  // "subject" cascades to the matière's cours (courses.subject_id is ON DELETE
  // CASCADE); "course" drops one cours. Neither touches a note: notes.course_id
  // is ON DELETE SET NULL, so the recordings and their sheets survive and
  // simply become unclassified again.
  mode: "subject" | "course";
  id: string;
  redirectTo: string;
};

const COPY = {
  subject: {
    action: "Supprimer la matière",
    confirm: "Supprimer la matière et ses cours ? Les notes sont conservées.",
  },
  course: {
    action: "Supprimer le cours",
    confirm: "Supprimer ce cours ? Les séances sont conservées.",
  },
} as const;

export default function GroupDeleteButton({ mode, id, redirectTo }: Props) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    setIsDeleting(true);
    try {
      const supabase = createClient();
      const { error: failure } = await supabase
        .from(mode === "subject" ? "subjects" : "courses")
        .delete()
        .eq("id", id);
      if (failure) throw failure;
      router.push(redirectTo);
      // The page we land on was rendered before this row disappeared.
      router.refresh();
    } catch (err) {
      setError(toErrorMessage(err));
      setIsDeleting(false);
      setIsConfirming(false);
    }
  };

  if (error) {
    return (
      <span className="shrink-0 text-xs text-red-700" role="alert">
        {error}
      </span>
    );
  }

  if (!isConfirming) {
    return (
      <button
        type="button"
        onClick={() => setIsConfirming(true)}
        aria-label={COPY[mode].action}
        className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-ink-faint transition-colors hover:bg-sand hover:text-terracotta-deep"
      >
        Supprimer
      </button>
    );
  }

  return (
    <span className="flex max-w-[15rem] shrink-0 flex-col items-end gap-1.5 text-right">
      <span className="text-xs text-ink-soft">{COPY[mode].confirm}</span>
      <span className="flex gap-1.5">
        <button
          type="button"
          onClick={run}
          disabled={isDeleting}
          className="rounded-full bg-terracotta-deep px-3 py-1.5 text-xs font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isDeleting ? "…" : "Confirmer"}
        </button>
        <button
          type="button"
          onClick={() => setIsConfirming(false)}
          disabled={isDeleting}
          className="rounded-full border border-line-warm px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-cream disabled:opacity-60"
        >
          Annuler
        </button>
      </span>
    </span>
  );
}
