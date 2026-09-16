import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">notes-ia</h1>
      <p className="max-w-md text-lg text-gray-500">
        Prends des notes, laisse l&apos;IA les résumer et les organiser pour
        tes révisions.
      </p>
      <Link
        href="/login"
        className="rounded-full bg-black px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
      >
        Commencer
      </Link>
    </main>
  );
}
