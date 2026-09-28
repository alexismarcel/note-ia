-- Stripe subscription state, on the profile it belongs to.

-- 1. Columns -------------------------------------------------------------
alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  -- Stripe's own vocabulary, stored verbatim: active, trialing, past_due,
  -- canceled, unpaid, incomplete… Translating it here would only invent a
  -- second truth to keep in step with the first.
  add column if not exists subscription_status text,
  add column if not exists subscription_price_id text,
  add column if not exists subscription_current_period_end timestamptz;

-- One Stripe customer belongs to one profile. A second profile claiming the
-- same customer would mean two accounts sharing one subscription, and the
-- webhook resolves a customer back to a profile through this column.
create unique index if not exists profiles_stripe_customer_id_key
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- 2. Nobody may grant themselves a subscription --------------------------
-- This is the part that matters. The initial schema granted authenticated
-- full insert/update/delete on public.profiles, and RLS cannot restrict
-- columns — it decides which rows you may touch, not which fields. So with
-- the columns above simply added, any signed-in user could run
--
--   supabase.from("profiles").update({ subscription_status: "active" })
--
-- from the browser console and pay nothing. Column privileges are the tool
-- that does restrict fields, so the grant is narrowed to what a user legitimately
-- owns about themselves. Everything about the subscription is writable only by
-- the service role, which is to say only by the Stripe webhook.
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

-- Same reasoning for insert: handle_new_user() creates the row, and a user
-- who could insert one freely could insert it already subscribed.
revoke insert on public.profiles from authenticated;
grant insert (id, email, full_name, avatar_url) on public.profiles to authenticated;

-- And delete: nothing in the app deletes a profile, while the cascade from
-- profiles takes every note, cours and matière with it. Combined with the
-- insert above it was also a way round the columns — delete the row, insert a
-- fresh one. Account deletion, if it ever ships, belongs in a
-- security definer function that does it deliberately.
revoke delete on public.profiles from authenticated;

-- 3. Read-only visibility of your own subscription -----------------------
-- The existing "Profiles are viewable by their owner" select policy already
-- covers the new columns, so a page can show the status without the user
-- being able to write it.
comment on column public.profiles.subscription_status is
  'Stripe subscription status, written only by the Stripe webhook (service role). Read-only for the user.';
