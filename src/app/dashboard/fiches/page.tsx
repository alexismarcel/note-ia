import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatNoteDate, noteDisplayTitle, titleFromSheet } from "@/lib/notes/title";

// The sheet opens with its own H1; repeating it under the heading would just
// be the title twice.
function sheetPreview(sheet: string): string {
  const withoutHeading = sheet
    .split("\n")
    .filter((line) => !/^#\s+/.test(line.trim()))
    .join(" ")
    .replace(/[#*_>`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return withoutHeading || "Fiche vide.";
}

export default async function SheetsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // content is left out: this view shows the sheet, never the transcript,
  // and a lecture transcript is by far the heaviest column on the row.
  const { data: notes, error } = await supabase
    .from("notes")
    .select("id, title, ai_summary, created_at")
    .eq("user_id", user.id)
    .not("ai_summary", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fiches] query failed:", error);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
      <Link
        href="/dashboard"
        className="text-sm text-ink-soft transition-colors hover:text-terracotta-deep"
      >
        ← Retour
      </Link>
      <h1 className="mt-3 font-display text-2xl font-medium text-ink">
        Mes fiches IA
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Les cours mis au propre, prêts à réviser.
      </p>

      {error ? (
        <p className="mt-8 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger les fiches : {error.message}
        </p>
      ) : notes && notes.length > 0 ? (
        <ul className="mt-8 flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                href={`/dashboard/notes/${note.id}`}
                className="block rounded-2xl border border-line-soft bg-white p-5 transition-colors hover:border-line-warm"
              >
                <h2 className="font-display text-lg font-medium text-ink">
                  {titleFromSheet(note.ai_summary) ?? noteDisplayTitle(note)}
                </h2>
                <time
                  dateTime={note.created_at}
                  className="text-xs text-ink-faint"
                >
                  {formatNoteDate(note.created_at)}
                </time>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">
                  {sheetPreview(note.ai_summary ?? "")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
          <p className="text-sm text-ink-soft">
            Aucune fiche pour le moment. Ouvrez un enregistrement et lancez
            « Générer la fiche IA ».
          </p>
          <Link
            href="/dashboard/enregistrements"
            className="mt-4 inline-block text-sm font-semibold text-terracotta-deep hover:underline"
          >
            Voir mes enregistrements
          </Link>
        </div>
      )}
    </main>
  );
}
