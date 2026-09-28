"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toErrorMessage } from "@/lib/errors";

type Props = {
  mode: "subject" | "course";
  id: string;
  currentName: string;
};

const COPY = {
  subject: {
    action: "Renommer la matière",
    label: "Nouveau nom de la matière",
    // subjects stores its name in `name`, courses in `title`.
    column: "name",
    empty: "Donne un nom à la matière.",
  },
  course: {
    action: "Renommer le cours",
    label: "Nouveau titre du cours",
    column: "title",
    empty: "Donne un titre au cours.",
  },
} as const;

export default function RenameButton({ mode, id, currentName }: Props) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(currentName);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = COPY[mode];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = value.trim();
    if (!name) {
      setError(copy.empty);
      return;
    }
    if (name === currentName) {
      setIsEditing(false);
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const supabase = createClient();
      const { error: failure } = await supabase
        .from(mode === "subject" ? "subjects" : "courses")
        .update({ [copy.column]: name })
        .eq("id", id);

      if (failure) {
        // 23505 here can only be subjects_user_id_name_key.
        if (failure.code === "23505") {
          throw new Error("Tu as déjà une matière de ce nom.");
        }
        throw failure;
      }

      setIsEditing(false);
      // The heading above is server-rendered from the same row; without this
      // the page would keep showing the old name until a full reload.
      router.refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => {
          // Reopening after a cancel should offer the name as it stands now,
          // not whatever was half-typed last time.
          setValue(currentName);
          setError(null);
          setIsEditing(true);
        }}
        aria-label={copy.action}
        className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-ink-faint transition-colors hover:bg-sand hover:text-terracotta-deep"
      >
        Renommer
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={copy.label}
          autoFocus
          className="min-w-0 flex-1 rounded-xl border border-line-warm bg-white px-3 py-2.5 font-display text-lg text-ink"
        />
        <button
          type="submit"
          disabled={isSaving}
          className="shrink-0 rounded-full bg-terracotta px-4 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isSaving ? "…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsEditing(false);
            setError(null);
          }}
          disabled={isSaving}
          className="shrink-0 rounded-full border border-line-warm px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-cream disabled:opacity-60"
        >
          Annuler
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
