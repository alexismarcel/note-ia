"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toErrorMessage } from "@/lib/errors";

type Props = {
  noteId: string;
  initialSheet: string | null;
};

export default function NoteAiSheet({ noteId, initialSheet }: Props) {
  const router = useRouter();
  const [sheet, setSheet] = useState(initialSheet);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSheet, setSavedSheet] = useState(initialSheet);

  // `disabled` only takes effect on the next render, leaving a window where a
  // fast double-click fires two billed requests. A ref closes it synchronously.
  const inFlight = useRef(false);

  const generate = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/notes/${noteId}/summary`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? `Échec de la génération (${res.status})`);
      }
      setSheet(body.sheet);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      inFlight.current = false;
      setIsGenerating(false);
    }
  };

  const save = async () => {
    if (!sheet) return;
    setError(null);
    setIsSaving(true);
    try {
      const supabase = createClient();
      const { error: saveError } = await supabase
        .from("notes")
        .update({ ai_summary: sheet })
        .eq("id", noteId);
      if (saveError) throw saveError;

      setSavedSheet(sheet);
      router.refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const hasUnsavedChanges = sheet !== null && sheet !== savedSheet;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={generate}
          disabled={isGenerating}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {isGenerating ? "Génération en cours…" : "Générer la fiche IA"}
        </button>

        {hasUnsavedChanges && (
          <button
            onClick={save}
            disabled={isSaving}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {isSaving ? "Enregistrement…" : "Sauvegarder la fiche"}
          </button>
        )}

        {sheet !== null && !hasUnsavedChanges && (
          <span className="text-sm text-gray-500">Fiche enregistrée.</span>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {sheet && (
        <article className="whitespace-pre-wrap rounded-md border border-gray-200 p-4 text-sm leading-relaxed">
          {sheet}
        </article>
      )}
    </section>
  );
}
