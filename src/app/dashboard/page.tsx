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
      <h1 className="text-2xl font-semibold">Bienvenue, {user.email}</h1>
      <p className="mt-2 text-sm text-gray-500">
        Tes notes générées par IA apparaîtront ici.
      </p>
    </main>
  );
}
