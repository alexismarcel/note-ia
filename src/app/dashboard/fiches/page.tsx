import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatNoteDate, noteDisplayTitle, titleFromSheet } from "@/lib/notes/title";
import DeleteButton from "../delete-button";

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
    .select("id, title, ai_summary, created_at, course_id")
    .eq("user_id", user.id)
    .not("ai_summary", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fiches] query failed:", error);
  }

  // One extra query for the whole list rather than an embedded resource per
  // row: the label is the only thing needed, and a nested select that stops
  // resolving would take the list down with it.
  const { data: courses, error: coursesError } = await supabase
    .from("courses")
    .select("id, title")
    .eq("user_id", user.id);

  if (coursesError) {
    console.error("[fiches] courses query failed:", coursesError);
  }

  const courseTitles = new Map(
    (courses ?? []).map((course) => [course.id, course.title])
  );

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
            <li
              key={note.id}
              className="flex items-start gap-3 rounded-2xl border border-line-soft bg-white p-5 transition-colors hover:border-line-warm"
            >
              <Link
                href={`/dashboard/notes/${note.id}`}
                className="min-w-0 flex-1"
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
                <span className="block text-xs text-ink-faint">
                  {(note.course_id && courseTitles.get(note.course_id)) ||
                    "Non classé"}
                </span>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">
                  {sheetPreview(note.ai_summary ?? "")}
                </p>
              </Link>
              <DeleteButton
                noteId={note.id}
                createdAt={note.created_at}
                mode="sheet"
              />
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
