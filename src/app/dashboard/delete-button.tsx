"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toErrorMessage } from "@/lib/errors";
import { formatNoteDate } from "@/lib/notes/title";

type Props = {
  noteId: string;
  createdAt: string;
  // "note" drops the row entirely; "sheet" clears the generated sheet and
  // leaves the recording alone.
  mode: "note" | "sheet";
};

const COPY = {
  note: {
    action: "Supprimer l'enregistrement et sa fiche",
    confirm: "Supprimer définitivement ?",
  },
  sheet: {
    action: "Supprimer la fiche, garder l'enregistrement",
    // One generation per recording: a deleted sheet cannot be made again.
    confirm: "Supprimer la fiche ? Elle ne pourra pas être régénérée.",
  },
} as const;

export default function DeleteButton({ noteId, createdAt, mode }: Props) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    setIsDeleting(true);
    try {
      const supabase = createClient();
      const { error: failure } =
        mode === "note"
          ? await supabase.from("notes").delete().eq("id", noteId)
          : await supabase
              .from("notes")
              // The title came from the sheet's heading; without the sheet it
              // would claim a subject nothing in the row still supports.
              .update({
                ai_summary: null,
                title: `Note du ${formatNoteDate(createdAt)}`,
              })
              .eq("id", noteId);
      if (failure) throw failure;
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
    <span className="flex shrink-0 flex-col items-end gap-1.5">
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
