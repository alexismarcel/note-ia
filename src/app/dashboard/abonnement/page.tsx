import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAuthFailure } from "@/lib/supabase/auth-error";
import { isEntitled } from "@/lib/stripe";
import { formatNoteDate } from "@/lib/notes/title";
import { formatDuration } from "@/lib/quota";

// Stripe's statuses, in French, for the one line the page shows.
const STATUS_COPY: Record<string, string> = {
  active: "Abonnement actif",
  trialing: "Période d'essai en cours",
  past_due: "Paiement en retard",
  unpaid: "Impayé",
  canceled: "Abonnement résilié",
  incomplete: "Paiement non finalisé",
  incomplete_expired: "Paiement abandonné",
  paused: "Abonnement en pause",
};

const BANNER: Record<string, string> = {
  succes:
    "Paiement accepté. Le statut ci-dessous s'actualise dès que Stripe a confirmé — quelques secondes.",
  annule: "Paiement annulé. Rien n'a été débité.",
  erreur:
    "La page de paiement n'a pas pu s'ouvrir. Réessaie, et si ça recommence dis-le moi.",
};

export default async function SubscriptionPage({
  searchParams,
}: PageProps<"/dashboard/abonnement">) {
  const { statut } = await searchParams;
  const banner = typeof statut === "string" ? BANNER[statut] : undefined;

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "subscription_status, subscription_current_period_end, stripe_customer_id"
    )
    .single();

  if (isAuthFailure(error)) {
    redirect("/login");
  }
  if (error) {
    console.error("[abonnement] query failed:", error);
  }

  const { data: usage } = await supabase
    .from("usage_summary")
    .select(
      "is_unlimited, free_sheets_used, free_sheet_allowance, recorded_seconds, free_recording_seconds"
    )
    .single();

  const status = profile?.subscription_status ?? null;
  // An unlimited account has no subscription and needs none: it must not be
  // shown a "S'abonner" button as though it were a lapsed customer.
  const unlimited = usage?.is_unlimited === true;
  const active = unlimited || isEntitled(status);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
      <Link
        href="/dashboard"
        className="text-sm text-ink-soft transition-colors hover:text-terracotta-deep"
      >
        ← Retour
      </Link>
      <h1 className="mt-3 font-display text-2xl font-medium text-ink">
        Abonnement
      </h1>

      {banner && (
        <p className="mt-4 rounded-xl border border-line-warm bg-white p-4 text-sm text-ink-soft">
          {banner}
        </p>
      )}

      <div className="mt-8 rounded-2xl border border-line-soft bg-white p-6">
        <p className="font-display text-lg font-medium text-ink">
          {unlimited
            ? "Accès illimité"
            : status
              ? (STATUS_COPY[status] ?? status)
              : "Aucun abonnement"}
        </p>
        {unlimited && (
          <p className="mt-1 text-sm text-ink-soft">
            Ce compte n&apos;est soumis à aucun plafond. Rien à payer.
          </p>
        )}

        {profile?.subscription_current_period_end && (
          <p className="mt-1 text-sm text-ink-soft">
            {active ? "Prochain renouvellement le " : "Accès jusqu'au "}
            {formatNoteDate(profile.subscription_current_period_end)}
          </p>
        )}

        {!active && (
          <>
            {usage && (
              <dl className="mt-4 flex flex-col gap-1 text-sm text-ink-soft">
                <div className="flex justify-between gap-4">
                  <dt>Fiches générées</dt>
                  <dd className="tabular-nums">
                    {usage.free_sheets_used} / {usage.free_sheet_allowance}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Temps enregistré</dt>
                  <dd className="tabular-nums">
                    {formatDuration(usage.recorded_seconds)} /{" "}
                    {formatDuration(usage.free_recording_seconds)}
                  </dd>
                </div>
              </dl>
            )}
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">
              Le premier des deux plafonds atteint bloque l&apos;enregistrement.
              4,99 € par semaine lève les deux, résiliable à tout moment.
            </p>
            {/* A plain form post: the route answers 303 to Stripe's page, so
                this works with no JavaScript and a refresh cannot re-post. */}
            <form action="/api/stripe/checkout" method="post" className="mt-4">
              <button
                type="submit"
                className="rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
              >
                {status ? "Reprendre l'abonnement" : "S'abonner"}
              </button>
            </form>
          </>
        )}
      </div>

      <p className="mt-6 text-xs text-ink-faint">
        Les paiements sont gérés par Stripe. Note IA ne voit ni ne conserve
        aucune donnée bancaire.
      </p>
    </main>
  );
}
