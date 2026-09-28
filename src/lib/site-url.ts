// Stripe needs absolute URLs to come back to, and they must be the real
// deployment rather than whatever host the request carries.
//
// NEXT_PUBLIC_SITE_URL is the explicit answer. VERCEL_PROJECT_PRODUCTION_URL
// is the fallback Vercel sets by itself, so a preview deployment still works
// without configuration. localhost is the last resort, for `next dev`.
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
