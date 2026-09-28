"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toErrorMessage } from "@/lib/errors";

type Props =
  | { mode: "subject" }
  // The matière is already the page you are on, so it is never asked for.
  | { mode: "course"; subjectId: string };

const COPY = {
  subject: {
    open: "Ajouter une matière",
    placeholder: "Nom de la matière (ex. Économie)",
    label: "Nom de la nouvelle matière",
  },
  course: {
    open: "Ajouter un cours",
    placeholder: "Titre du cours (ex. Chapitre 3 — l'inflation)",
    label: "Titre du nouveau cours",
  },
} as const;

export default function QuickAdd(props: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = COPY[props.mode];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = value.trim();
    if (!text) {
      setError(
        props.mode === "subject"
          ? "Donne un nom à la matière."
          : "Donne un titre au cours."
      );
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

      const { error: failure } =
        props.mode === "subject"
          ? await supabase.from("subjects").insert({
              user_id: user.id,
              name: text,
            })
          : await supabase.from("courses").insert({
              user_id: user.id,
              subject_id: props.subjectId,
              title: text,
            });

      if (failure) {
        // 23505 here can only be subjects_user_id_name_key: worth saying in
        // French rather than showing the index name.
        if (failure.code === "23505") {
          throw new Error("Tu as déjà une matière de ce nom.");
        }
        throw failure;
      }

      setValue("");
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
        onClick={() => setIsOpen(true)}
        className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-dashed border-line-warm px-5 py-4 text-sm font-semibold text-ink-soft transition-colors hover:border-terracotta hover:text-terracotta-deep"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          +
        </span>
        {copy.open}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={copy.placeholder}
          aria-label={copy.label}
          autoFocus
          className="min-w-0 flex-1 rounded-xl border border-line-warm bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint"
        />
        <button
          type="submit"
          disabled={isSaving}
          className="shrink-0 rounded-full bg-terracotta px-4 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isSaving ? "…" : "Ajouter"}
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
      {error && (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
