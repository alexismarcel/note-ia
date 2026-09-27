import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatNoteDate } from "@/lib/notes/title";

export default async function RecordingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // ai_summary is left out on purpose: this view is the raw capture, listed
  // by date, so the sheet has nothing to say here.
  const { data: notes, error } = await supabase
    .from("notes")
    .select("id, content, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[enregistrements] query failed:", error);
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
        Mes enregistrements
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Les transcriptions brutes, telles que captées.
      </p>

      {error ? (
        <p className="mt-8 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger les enregistrements : {error.message}
        </p>
      ) : notes && notes.length > 0 ? (
        <ul className="mt-8 flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                href={`/dashboard/notes/${note.id}`}
                className="block rounded-2xl border border-line-soft bg-white p-5 transition-colors hover:border-line-warm"
              >
                <time
                  dateTime={note.created_at}
                  className="font-display text-base font-medium text-ink"
                >
                  {formatNoteDate(note.created_at)}
                </time>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">
                  {note.content || "Aucune transcription."}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-ink-soft">
          Aucun enregistrement pour le moment.
        </p>
      )}
    </main>
  );
}
