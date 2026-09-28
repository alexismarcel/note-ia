import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDuration } from "@/lib/quota";

function MicIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
    </svg>
  );
}

function WaveIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="3" y1="12" x2="3" y2="12" />
      <line x1="7" y1="8" x2="7" y2="16" />
      <line x1="11" y1="5" x2="11" y2="19" />
      <line x1="15" y1="9" x2="15" y2="15" />
      <line x1="19" y1="11" x2="19" y2="13" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <polyline points="15 3 15 8 20 8" />
      <line x1="8" y1="12" x2="14" y2="12" />
      <line x1="8" y1="16" x2="16" y2="16" />
    </svg>
  );
}

function SheetIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="14" y2="13" />
      <line x1="8" y1="17" x2="12" y2="17" />
    </svg>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  // One row instead of three separate count requests, and it goes out at the
  // same time as getUser rather than after it: the hub is the page the user
  // comes back to constantly, so its latency is two round trips overlapped
  // into one rather than four in sequence.
  const [userRes, countsRes, usageRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("dashboard_counts")
      .select("note_count, sheet_count, course_count")
      .single(),
    supabase
      .from("usage_summary")
      .select(
        "is_subscribed, free_sheets_used, free_sheet_allowance, recorded_seconds, free_recording_seconds"
      )
      .single(),
  ]);

  const user = userRes.data.user;
  if (!user) {
    redirect("/login");
  }

  if (countsRes.error) {
    console.error("[dashboard] counts failed:", countsRes.error);
  }
  const counts = countsRes.data ?? {
    note_count: 0,
    sheet_count: 0,
    course_count: 0,
  };
  const usage = usageRes.data;

  const entries = [
    {
      href: "/dashboard/record",
      icon: <MicIcon />,
      title: "Enregistrer un cours",
      body: "Lancez la transcription en direct.",
      meta: null,
      primary: true,
    },
    {
      href: "/dashboard/cours",
      icon: <StackIcon />,
      title: "Mes cours",
      body: "Rangés par matière, séance après séance.",
      meta: counts.course_count,
      primary: false,
    },
    {
      href: "/dashboard/enregistrements",
      icon: <WaveIcon />,
      title: "Mes enregistrements",
      body: "Les transcriptions brutes, telles que captées.",
      meta: counts.note_count,
      primary: false,
    },
    {
      href: "/dashboard/fiches",
      icon: <SheetIcon />,
      title: "Mes fiches IA",
      body: "Les cours mis au propre, prêts à réviser.",
      meta: counts.sheet_count,
      primary: false,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-xl px-5 py-16 sm:px-8">
      <h1 className="font-display text-2xl font-medium text-ink">Note IA</h1>
      <p className="mt-1 text-sm text-ink-soft">{user.email}</p>

      {/* The allowance is shown before it runs out, not only when it stops
          something: finding the ceiling by hitting it is the unpleasant way. */}
      {usage && !usage.is_subscribed && (
        <p className="mt-3 text-sm text-ink-faint">
          Offre gratuite : {usage.free_sheets_used}/{usage.free_sheet_allowance}{" "}
          fiches ·{" "}
          {formatDuration(usage.recorded_seconds)} sur{" "}
          {formatDuration(usage.free_recording_seconds)} enregistrées{" "}
          <Link
            href="/dashboard/abonnement"
            className="font-semibold text-terracotta-deep hover:underline"
          >
            Passer à l&apos;illimité
          </Link>
        </p>
      )}
      {usage?.is_subscribed && (
        <p className="mt-3 text-sm text-ink-faint">
          Abonnement actif — enregistrement et fiches illimités.{" "}
          <Link
            href="/dashboard/abonnement"
            className="font-semibold text-terracotta-deep hover:underline"
          >
            Gérer
          </Link>
        </p>
      )}

      <nav className="mt-10 flex flex-col gap-3">
        {entries.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className={
              entry.primary
                ? "flex items-center gap-4 rounded-2xl bg-terracotta p-5 text-cream transition-opacity hover:opacity-90"
                : "flex items-center gap-4 rounded-2xl border border-line-soft bg-white p-5 transition-colors hover:border-line-warm"
            }
          >
            <span
              className={
                entry.primary
                  ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cream/20"
                  : "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand text-terracotta-deep"
              }
            >
              {entry.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={
                  entry.primary
                    ? "block font-display text-lg font-medium"
                    : "block font-display text-lg font-medium text-ink"
                }
              >
                {entry.title}
              </span>
              <span
                className={
                  entry.primary
                    ? "block text-sm text-cream/80"
                    : "block text-sm text-ink-soft"
                }
              >
                {entry.body}
              </span>
            </span>
            {entry.meta !== null && (
              <span className="shrink-0 text-sm tabular-nums text-ink-faint">
                {entry.meta ?? 0}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </main>
  );
}
