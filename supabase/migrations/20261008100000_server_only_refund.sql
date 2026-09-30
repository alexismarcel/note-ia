-- The free-sheet refund, callable by the server only.
--
-- refund_sheet_generation() was granted to authenticated and took back one
-- sheet from whoever called it, with no check that a generation had failed:
-- anyone could call it from the browser console
-- (supabase.rpc("refund_sheet_generation")) as often as they liked and never
-- run out of free sheets.
--
-- Only the generation route knows a claim it made produced nothing. It now
-- refunds as the service role, naming the user it has already authenticated;
-- users cannot execute the function at all.

drop function if exists public.refund_sheet_generation();

create or replace function public.refund_sheet_generation(uid uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  used integer;
begin
  update public.profiles
     set free_sheets_used = greatest(free_sheets_used - 1, 0)
   where id = uid
   returning free_sheets_used into used;

  return coalesce(used, 0);
end;
$$;

revoke execute on function public.refund_sheet_generation(uuid) from public, anon, authenticated;
grant execute on function public.refund_sheet_generation(uuid) to service_role;
