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
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bienvenue, {user.email}</h1>
        <Link
          href="/dashboard/record"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          + Note vocale
        </Link>
      </div>

      {error ? (
        <p className="mt-6 rounded-md bg-red-50 p-3 text-sm text-red-700">
          Impossible de charger les notes : {error.message}
        </p>
      ) : notes && notes.length > 0 ? (
        <ul className="mt-6 flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                href={`/dashboard/notes/${note.id}`}
                className="block rounded-md border border-gray-200 p-4 hover:border-gray-400"
              >
                <h2 className="font-medium">{note.title}</h2>
                <time
                  dateTime={note.created_at}
                  className="text-xs text-gray-500"
                >
                  {new Date(note.created_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
                {note.content && (
                  <p className="mt-2 line-clamp-3 text-sm text-gray-600">
                    {note.content}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-gray-500">
          Tes notes générées par IA apparaîtront ici.
        </p>
      )}
    </main>
  );
}
