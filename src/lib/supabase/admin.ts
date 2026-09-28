import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// A Stripe webhook arrives with no cookies and no user: it is Stripe calling,
// not a browser. The usual server client would therefore be anonymous and RLS
// would — correctly — refuse to write anything.
//
// This client uses the secret key, which bypasses RLS entirely. It must only
// ever be built inside a route handler that has already established who it is
// acting for: for the webhook, that is the signature check against
// STRIPE_WEBHOOK_SECRET.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required to write as the service role"
    );
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
