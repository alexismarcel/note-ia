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
      <p className="mt-2 text-sm text-gray-500">
        Tes notes générées par IA apparaîtront ici.
      </p>
    </main>
  );
}
