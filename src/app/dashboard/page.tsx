import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // RLS already scopes notes to their owner; the explicit user_id filter keeps
  // that intent readable and lets the query use notes_user_id_idx.
  const { data: notes, error } = await supabase
    .from("notes")
    .select("id, title, content, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // An empty list and a silently-filtered query render identically, and a
  // server component leaves no trace in the browser — so state both the
  // identity the query ran as and what it returned, in the platform logs.
  if (error) {
    console.error("[dashboard] notes query failed:", error);
  } else {
    console.log(
      `[dashboard] user=${user.id} email=${user.email} notes=${notes?.length ?? 0}`
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">
            Vos fiches de cours
          </h1>
          <p className="mt-1 text-sm text-ink-soft">{user.email}</p>
        </div>
        <Link
          href="/dashboard/record"
          className="shrink-0 self-start rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 sm:self-auto"
        >
          + Note vocale
        </Link>
      </div>

      {error ? (
        <p className="mt-8 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger les notes : {error.message}
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
                  {note.title}
                </h2>
                <time
                  dateTime={note.created_at}
                  className="text-xs text-ink-faint"
                >
                  {new Date(note.created_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
                {note.content && (
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-soft">
                    {note.content}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
          <p className="font-display text-lg font-medium text-ink">
            Aucune fiche pour le moment
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
            Enregistrez votre premier cours : la transcription et la fiche se
            font toutes seules.
          </p>
        </div>
      )}
    </main>
  );
}
