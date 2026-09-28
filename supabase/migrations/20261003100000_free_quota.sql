-- The free allowance, and the gate on it.
--
--   10 fiches, or 3 hours of recording — whichever is reached first.
--
--   * 3 hours reached  -> no more recording, but sheets can still be made
--                         from what is already recorded, up to 10.
--   * 10 sheets reached -> no more sheets AND no more recording.
--
-- A subscription lifts both.

-- 1. How long a recording lasted -----------------------------------------
-- Nothing recorded a duration until now. Notes saved before this migration
-- keep null and count as zero: guessing a length from transcript size would
-- put an invented number in the way of someone's paywall.
alter table public.notes
  add column if not exists duration_seconds integer
    check (duration_seconds is null or duration_seconds >= 0);

comment on column public.notes.duration_seconds is
  'Length of the recording in seconds, measured by the browser. Null for notes saved before the free allowance existed.';

-- 2. Sheets consumed ------------------------------------------------------
-- A count of generations, not of sheets currently on file. "Supprimer la
-- fiche" exists in the UI, so counting rows where ai_summary is not null
-- would let anyone generate, delete, and generate again for ever.
alter table public.profiles
  add column if not exists free_sheets_used integer not null default 0
    check (free_sheets_used >= 0);

-- Notes already carrying a sheet were generated before any counter existed;
-- they are what the user has consumed so far.
update public.profiles p
   set free_sheets_used = sub.n
  from (
    select user_id, count(*)::integer as n
    from public.notes
    where ai_summary is not null
    group by user_id
  ) as sub
 where p.id = sub.user_id
   and p.free_sheets_used = 0;

-- The column privileges from the Stripe migration already keep authenticated
-- out of every profiles column but full_name and avatar_url, so this counter
-- is no more writable by a user than subscription_status is. It moves only
-- through the two functions below.

-- 3. The allowance --------------------------------------------------------
create or replace function public.free_sheet_allowance()
returns integer language sql immutable as $$ select 10 $$;

create or replace function public.free_recording_seconds()
returns integer language sql immutable as $$ select 3 * 3600 $$;

-- 4. Where the user stands ------------------------------------------------
-- security_invoker so the sum covers the caller's own notes and nobody
-- else's, exactly as a direct query would.
-- Dropped rather than replaced: a later migration adds a column to this view,
-- and "create or replace view" refuses to drop one, which would make replaying
-- the whole set from scratch fail here. The later migration recreates it with
-- its extra column, so a replay ends in the right place either way.
drop view if exists public.usage_summary;

create view public.usage_summary
with (security_invoker = on) as
select
  p.id as user_id,
  p.subscription_status,
  p.subscription_status in ('active', 'trialing') as is_subscribed,
  p.free_sheets_used,
  public.free_sheet_allowance() as free_sheet_allowance,
  coalesce(
    (select sum(n.duration_seconds) from public.notes n where n.user_id = p.id),
    0
  )::integer as recorded_seconds,
  public.free_recording_seconds() as free_recording_seconds
from public.profiles p;

grant select on public.usage_summary to authenticated;

-- 5. Claiming a sheet -----------------------------------------------------
-- security definer because free_sheets_used is deliberately not writable by
-- the caller; search_path is pinned so the body cannot be redirected through
-- a schema the caller controls.
--
-- "for update" takes the row lock before reading the counter, so two requests
-- fired at once cannot both see 9 and both be allowed.
create or replace function public.claim_sheet_generation()
returns table (allowed boolean, reason text, sheets_used integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  status text;
  used integer;
begin
  if uid is null then
    return query select false, 'unauthenticated'::text, 0;
    return;
  end if;

  select p.subscription_status, p.free_sheets_used
    into status, used
    from public.profiles p
   where p.id = uid
     for update;

  if not found then
    return query select false, 'no_profile'::text, 0;
    return;
  end if;

  if status in ('active', 'trialing') then
    return query select true, 'subscribed'::text, used;
    return;
  end if;

  if used >= public.free_sheet_allowance() then
    return query select false, 'sheet_limit'::text, used;
    return;
  end if;

  update public.profiles
     set free_sheets_used = free_sheets_used + 1
   where id = uid
   returning free_sheets_used into used;

  return query select true, 'free'::text, used;
end;
$$;

-- Generation is claimed before the model is called, so that two clicks cannot
-- both slip through. When the call then fails, the claim is given back: a
-- request that produced nothing must not cost one of ten.
create or replace function public.refund_sheet_generation()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  used integer;
begin
  if uid is null then
    return 0;
  end if;

  update public.profiles
     set free_sheets_used = greatest(free_sheets_used - 1, 0)
   where id = uid
   returning free_sheets_used into used;

  return coalesce(used, 0);
end;
$$;

-- 6. May they record? -----------------------------------------------------
-- Both ceilings, in the order the product describes them: the sheet ceiling
-- closes recording too, the time ceiling closes recording alone.
create or replace function public.recording_allowance()
returns table (
  allowed boolean,
  reason text,
  recorded_seconds integer,
  sheets_used integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  status text;
  used integer;
  seconds integer;
begin
  if uid is null then
    return query select false, 'unauthenticated'::text, 0, 0;
    return;
  end if;

  select p.subscription_status, p.free_sheets_used
    into status, used
    from public.profiles p
   where p.id = uid;

  if not found then
    return query select false, 'no_profile'::text, 0, 0;
    return;
  end if;

  select coalesce(sum(n.duration_seconds), 0)::integer
    into seconds
    from public.notes n
   where n.user_id = uid;

  if status in ('active', 'trialing') then
    return query select true, 'subscribed'::text, seconds, used;
    return;
  end if;

  if used >= public.free_sheet_allowance() then
    return query select false, 'sheet_limit'::text, seconds, used;
    return;
  end if;

  if seconds >= public.free_recording_seconds() then
    return query select false, 'time_limit'::text, seconds, used;
    return;
  end if;

  return query select true, 'free'::text, seconds, used;
end;
$$;

-- 7. Who may call them ----------------------------------------------------
-- A security definer function is granted to public by default, which would
-- let an anonymous request run it. auth.uid() is null there so it refuses
-- anyway, but the grant is narrowed rather than relying on that.
revoke execute on function public.claim_sheet_generation() from public;
revoke execute on function public.refund_sheet_generation() from public;
revoke execute on function public.recording_allowance() from public;

grant execute on function public.claim_sheet_generation() to authenticated;
grant execute on function public.refund_sheet_generation() to authenticated;
grant execute on function public.recording_allowance() to authenticated;
grant execute on function public.free_sheet_allowance() to authenticated;
grant execute on function public.free_recording_seconds() to authenticated;
