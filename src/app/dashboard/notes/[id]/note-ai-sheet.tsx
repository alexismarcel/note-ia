"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toErrorMessage } from "@/lib/errors";
import { titleFromSheet } from "@/lib/notes/title";
import QuotaLock from "../../quota-lock";

type Props = {
  noteId: string;
  initialSheet: string | null;
  // False once the ten free sheets are spent. The route refuses too; this only
  // spares the user a click that would fail.
  canGenerate: boolean;
};

export default function NoteAiSheet({
  noteId,
  initialSheet,
  canGenerate,
}: Props) {
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
      if (res.status === 402) {
        // The ceiling was reached in another tab, or between render and click.
        throw new Error(
          "Tes 10 fiches gratuites sont utilisées. L'abonnement les débloque."
        );
      }
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
      // The sheet's own H1 becomes the note's name, so the dashboard stops
      // listing every note by its recording date.
      const generatedTitle = titleFromSheet(sheet);
      const { error: saveError } = await supabase
        .from("notes")
        .update({
          ai_summary: sheet,
          ...(generatedTitle ? { title: generatedTitle } : {}),
        })
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
      {/* The lock replaces the generate button entirely, above the row rather
          than inside it: it is a panel, not a control. A sheet already on file
          still renders below, and can still be saved. */}
      {!canGenerate && <QuotaLock reason="sheet_limit" />}

      <div className="flex flex-wrap items-center gap-3">
        {canGenerate && (
          <button
            onClick={generate}
            disabled={isGenerating}
            className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isGenerating ? "Génération en cours…" : "Générer la fiche IA"}
          </button>
        )}

        {hasUnsavedChanges && (
          <button
            onClick={save}
            disabled={isSaving}
            className="rounded-full border-[1.5px] border-line-warm px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-white disabled:opacity-50"
          >
            {isSaving ? "Enregistrement…" : "Sauvegarder la fiche"}
          </button>
        )}

        {sheet !== null && !hasUnsavedChanges && (
          <span className="text-sm text-ink-faint">Fiche enregistrée.</span>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}

      {sheet && (
        <article className="whitespace-pre-wrap rounded-2xl border border-line-soft bg-white p-5 text-sm leading-relaxed text-ink">
          {sheet}
        </article>
      )}
    </section>
  );
}
