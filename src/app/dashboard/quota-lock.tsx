import Link from "next/link";
import { LOCK_COPY } from "@/lib/quota";

// Shown in place of the action a ceiling has closed. It always offers the way
// out rather than only stating the refusal.
export default function QuotaLock({ reason }: { reason: string }) {
  const copy = LOCK_COPY[reason] ?? LOCK_COPY.sheet_limit;

  return (
    <div className="rounded-2xl border border-line-warm bg-sand p-5">
      <p className="font-display text-lg font-medium text-ink">{copy.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{copy.body}</p>
      <Link
        href="/dashboard/abonnement"
        className="mt-4 inline-block rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
      >
        Voir l&apos;abonnement — 4,99 €/semaine
      </Link>
    </div>
  );
}
