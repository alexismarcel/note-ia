import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Stripe signs the exact bytes it sent. Anything that parses and re-serialises
// the body — req.json() included — changes those bytes and the signature stops
// matching, so the raw text is what gets verified.
async function rawBody(request: Request): Promise<string> {
  return await request.text();
}

type SubscriptionFields = {
  stripe_customer_id: string;
  stripe_subscription_id: string;
  subscription_status: string;
  subscription_price_id: string | null;
  subscription_current_period_end: string | null;
};

function fieldsFromSubscription(
  subscription: Stripe.Subscription
): SubscriptionFields {
  const item = subscription.items.data[0];
  // The period moved onto the subscription item in recent API versions; the
  // subscription-level field is read as a fallback for an older payload
  // replayed from Stripe's dashboard.
  const periodEnd =
    item?.current_period_end ??
    (subscription as unknown as { current_period_end?: number })
      .current_period_end ??
    null;

  return {
    stripe_customer_id:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    subscription_price_id: item?.price?.id ?? null,
    subscription_current_period_end: periodEnd
      ? new Date(periodEnd * 1000).toISOString()
      : null,
  };
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const stripe = createStripe();
  let event: Stripe.Event;
  try {
    // This is the only thing standing between the open internet and a route
    // that writes subscription status with the service role. Anyone can POST
    // here; only Stripe can sign.
    event = stripe.webhooks.constructEvent(
      await rawBody(request),
      signature,
      secret
    );
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed:", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        // Set on the session when checkout opened. Without it there is no way
        // to tell which account paid, and guessing by email would hand a
        // subscription to whoever typed that address into Stripe.
        const userId =
          session.client_reference_id ?? session.metadata?.supabase_user_id;
        if (!userId) {
          console.error(
            "[stripe/webhook] checkout.session.completed without a user id:",
            session.id
          );
          break;
        }

        if (!session.subscription) {
          console.error(
            "[stripe/webhook] checkout.session.completed without a subscription:",
            session.id
          );
          break;
        }

        // The session carries the subscription's id, not its status or period,
        // so the subscription itself is fetched rather than assumed active.
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        const subscription =
          await stripe.subscriptions.retrieve(subscriptionId);

        const { error } = await supabase
          .from("profiles")
          .update(fieldsFromSubscription(subscription))
          .eq("id", userId);
        if (error) throw error;

        console.log(
          `[stripe/webhook] ${event.type}: profile ${userId} -> ${subscription.status}`
        );
        break;
      }

      // Not asked for, and the subscription is wrong without them: a weekly
      // plan renews or lapses every seven days, and checkout.session.completed
      // fires once, at the very start. Without these two a cancelled
      // subscription stays "active" in the database for ever.
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const fields = fieldsFromSubscription(subscription);

        // Matched on the customer rather than the user id: by now the profile
        // carries the customer, and the metadata is only a fallback for a
        // subscription created outside this flow.
        const userId = subscription.metadata?.supabase_user_id;
        const query = supabase.from("profiles").update(fields);
        // select() after an update returns the rows it touched, which is how
        // an event for a customer this app has never seen is noticed rather
        // than silently accepted.
        const { data, error } = await (userId
          ? query.eq("id", userId)
          : query.eq("stripe_customer_id", fields.stripe_customer_id)
        ).select("id");
        if (error) throw error;

        if (!data?.length) {
          console.warn(
            `[stripe/webhook] ${event.type}: no profile for customer ${fields.stripe_customer_id}`
          );
        }
        break;
      }

      default:
        // Stripe retries anything that is not 2xx, so an event this app does
        // not care about is acknowledged rather than refused.
        break;
    }
  } catch (err) {
    // A 500 asks Stripe to retry, which is what a transient Supabase failure
    // deserves. The updates above are idempotent, so a replay is harmless.
    console.error(`[stripe/webhook] handling ${event.type} failed:`, err);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
