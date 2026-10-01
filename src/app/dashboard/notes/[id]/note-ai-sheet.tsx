"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toErrorMessage } from "@/lib/errors";
import { titleFromSheet } from "@/lib/notes/title";
import { isInsufficient, parseFiche, type StoredSheet } from "@/lib/fiche";
import QuotaLock from "../../quota-lock";
import SheetContent from "../../sheet-content";

type Props = {
  noteId: string;
  initialSheet: StoredSheet | null;
  // False once the ten free sheets are spent. The route refuses too; this only
  // spares the user a click that would fail.
  canGenerate: boolean;
  // True once this recording has had its one generation (see
  // 20261007100000_one_sheet_per_note.sql). The route refuses a second one.
  alreadyGenerated: boolean;
  // True for the accounts in src/lib/sheet-regeneration.ts, which may
  // generate the sheet again whatever alreadyGenerated says.
  canRegenerate: boolean;
  // Shown in the fiche's header and stats; all already known, none generated.
  matiere?: string;
  dureeSecondes?: number;
  nbMotsTranscrits?: number;
  creeLe?: string;
};

export default function NoteAiSheet({
  noteId,
  initialSheet,
  canGenerate,
  alreadyGenerated,
  canRegenerate,
  ...meta
}: Props) {
  const router = useRouter();
  const [sheet, setSheet] = useState(initialSheet);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSheet, setSavedSheet] = useState(initialSheet);
  const [generated, setGenerated] = useState(alreadyGenerated);

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
      if (res.status === 409 && body.state === "done") {
        // Generated in another tab since this page loaded. An "in_progress"
        // answer leaves the button: that lock expires, and the message says
        // to try again in a few minutes.
        setGenerated(true);
        router.refresh();
      }
      if (!res.ok) {
        throw new Error(body.error ?? `Échec de la génération (${res.status})`);
      }
      const fiche = parseFiche(body.sheet);
      if (!fiche) throw new Error("Réponse inattendue du serveur.");
      setGenerated(true);
      setSheet(fiche);
      // The route saves the sheet itself; the button below only appears if
      // that save failed.
      if (body.saved) {
        setSavedSheet(fiche);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      inFlight.current = false;
      setIsGenerating(false);
    }
  };

  const save = async () => {
    // "Transcript too short" is shown, never stored: saved, it would count as
    // a sheet in every list and name nothing.
    if (!sheet || isInsufficient(sheet)) return;
    setError(null);
    setIsSaving(true);
    try {
      const supabase = createClient();
      // The sheet's title (its H1 for a markdown sheet, `titre` for a fiche)
      // becomes the note's name, so the dashboard stops listing every note by
      // its recording date. The column is jsonb: an object is stored as is.
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

  const insufficient = isInsufficient(sheet);
  const hasUnsavedChanges =
    sheet !== null && !insufficient && sheet !== savedSheet;

  return (
    <section className="flex flex-col gap-4">
      {/* The lock replaces the generate button entirely, above the row rather
          than inside it: it is a panel, not a control. A sheet already on file
          still renders below, and can still be saved. */}
      {!canGenerate && <QuotaLock reason="sheet_limit" />}

      <div className="flex flex-wrap items-center gap-3">
        {canGenerate && (!generated || canRegenerate) && (
          <button
            onClick={generate}
            disabled={isGenerating}
            className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isGenerating
              ? "Génération en cours…"
              : generated || sheet
                ? "Regénérer la fiche IA"
                : "Générer la fiche IA"}
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

        {sheet !== null && !insufficient && !hasUnsavedChanges && (
          <span className="text-sm text-ink-faint">Fiche enregistrée.</span>
        )}
      </div>

      {generated && !sheet && !canRegenerate && (
        <p className="text-sm text-ink-faint">
          La fiche de cet enregistrement a déjà été générée. Une seule fiche est
          possible par enregistrement.
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}

      {sheet && <SheetContent sheet={sheet} {...meta} />}
    </section>
  );
}
