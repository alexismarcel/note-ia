import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createStripe, WEEKLY_PRICE_ID } from "@/lib/stripe";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

// Opens a Stripe Checkout session for the weekly subscription and sends the
// user to it. Mirrors /api/soniox/token: the caller is identified from the
// session cookie, never from anything in the request body — a user id sent by
// the browser is a user id the browser can change.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const stripe = createStripe();
    const base = siteUrl();

    // A customer already on file is reused, so a second subscription is not
    // opened under a second customer for the same person.
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: WEEKLY_PRICE_ID, quantity: 1 }],
      // Both are read back in the webhook. client_reference_id survives on the
      // session, metadata is copied onto the subscription so later lifecycle
      // events (renewal, cancellation) can still find the profile.
      client_reference_id: user.id,
      subscription_data: { metadata: { supabase_user_id: user.id } },
      metadata: { supabase_user_id: user.id },
      ...(profile?.stripe_customer_id
        ? { customer: profile.stripe_customer_id }
        : { customer_email: user.email }),
      success_url: `${base}/dashboard/abonnement?statut=succes`,
      cancel_url: `${base}/dashboard/abonnement?statut=annule`,
      // Stripe collects what the EU requires for a recurring charge.
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new Error("Stripe returned a session without a URL");
    }

    // 303 so the browser follows with GET: a plain <form method="post"> works
    // without any JavaScript, and a refresh of the destination does not repost.
    return NextResponse.redirect(session.url, 303);
  } catch (err) {
    // The message names the price, the key or the account, none of which the
    // browser should see; it goes to the server log instead.
    console.error("[stripe/checkout] failed:", err);
    return NextResponse.redirect(
      `${siteUrl()}/dashboard/abonnement?statut=erreur`,
      303
    );
  }
}
