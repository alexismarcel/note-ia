-- Accounts that bypass the free allowance without paying.
--
-- Keyed by email rather than by user id, so the access survives signing out,
-- signing back in, or the account being recreated: whoever holds that mailbox
-- gets it, which is exactly what an owner's account means here.

-- 1. The list -------------------------------------------------------------
create table if not exists public.free_access_emails (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

-- Deliberately no grant to authenticated: nothing in the app reads or writes
-- this table. It is reached only through the security definer function below,
-- and edited only from the SQL editor. RLS is enabled so that a future grant,
-- or a schema-wide default privilege, cannot quietly open it.
alter table public.free_access_emails enable row level security;

insert into public.free_access_emails (email, note)
values ('alexismarcel89@gmail.com', 'Compte administrateur')
on conflict (email) do nothing;

-- 2. The check ------------------------------------------------------------
-- Case-insensitive: the address typed at sign-up is not always the casing the
-- list was written in.
create or replace function public.has_unlimited_access(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.free_access_emails f
      on lower(f.email) = lower(p.email)
    where p.id = uid
  );
$$;

revoke execute on function public.has_unlimited_access(uuid) from public;
grant execute on function public.has_unlimited_access(uuid) to authenticated;

-- 3. Both ceilings honour it ----------------------------------------------
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

  -- Checked before the counter is touched, so an unlimited account never
  -- consumes one of the ten free sheets it does not need.
  if public.has_unlimited_access(uid) then
    return query select true, 'unlimited'::text, used;
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

  if public.has_unlimited_access(uid) then
    return query select true, 'unlimited'::text, seconds, used;
    return;
  end if;

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

revoke execute on function public.claim_sheet_generation() from public;
revoke execute on function public.recording_allowance() from public;
grant execute on function public.claim_sheet_generation() to authenticated;
grant execute on function public.recording_allowance() to authenticated;

-- 4. So the pages can say so ----------------------------------------------
-- Dropped rather than replaced: "create or replace view" can only append
-- columns, and is_unlimited belongs next to is_subscribed. Nothing depends on
-- this view but the pages that query it by name.
drop view if exists public.usage_summary;

create view public.usage_summary
with (security_invoker = on) as
select
  p.id as user_id,
  p.subscription_status,
  p.subscription_status in ('active', 'trialing') as is_subscribed,
  public.has_unlimited_access(p.id) as is_unlimited,
  p.free_sheets_used,
  public.free_sheet_allowance() as free_sheet_allowance,
  coalesce(
    (select sum(n.duration_seconds) from public.notes n where n.user_id = p.id),
    0
  )::integer as recorded_seconds,
  public.free_recording_seconds() as free_recording_seconds
from public.profiles p;

grant select on public.usage_summary to authenticated;
