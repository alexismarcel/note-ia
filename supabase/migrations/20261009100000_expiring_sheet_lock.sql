-- The sheet-generation lock, split into "in progress" and "done".
--
-- 20261007100000 made one row per note both the lock of a running generation
-- and the record that the note had used its one generation. The route gave
-- the row back when a generation failed, but only from code that runs: a
-- request killed mid-call (a crash, a platform timeout) left a row that
-- blocked the note for good.
--
-- completed_at now tells the two apart. A row without it is a generation in
-- progress, and expires after 10 minutes; a row with it is permanent.

alter table public.note_sheet_generations
  add column if not exists completed_at timestamptz;

-- 1. Existing rows --------------------------------------------------------
-- Those that ended with something to show are complete.
update public.note_sheet_generations g
   set completed_at = g.generated_at
  from public.notes n
 where n.id = g.note_id
   and g.completed_at is null
   and (n.ai_summary is not null or g.insufficient_message is not null);

-- The rest never finished: the locks left behind by failed generations.
-- Released, so those notes can be generated again.
delete from public.note_sheet_generations
 where completed_at is null;

-- 2. Taking the lock ------------------------------------------------------
-- One statement, so two requests can never both get it. Returns:
--   'acquired'    the caller holds the lock and may generate;
--   'in_progress' another request holds it, taken less than 10 minutes ago;
--   'done'        the note has had its generation.
-- A note that already carries a sheet is done whatever the table says: that
-- also covers a sheet saved while its lock never got marked complete.
create or replace function public.acquire_sheet_generation(
  p_note_id uuid,
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  got boolean;
  done_at timestamptz;
begin
  if exists (
    select 1 from public.notes
     where id = p_note_id and ai_summary is not null
  ) then
    return 'done';
  end if;

  insert into public.note_sheet_generations as g (note_id, user_id)
  values (p_note_id, p_user_id)
  on conflict (note_id) do update
     set generated_at = now(),
         user_id = excluded.user_id,
         insufficient_message = null
   where g.completed_at is null
     and g.generated_at < now() - interval '10 minutes'
  returning true into got;

  if got then
    return 'acquired';
  end if;

  select completed_at into done_at
    from public.note_sheet_generations
   where note_id = p_note_id;

  return case when done_at is not null then 'done' else 'in_progress' end;
end;
$$;

-- The route calls it as the service role, for a user and a note it has
-- already checked; users cannot take or steal locks themselves.
revoke execute on function public.acquire_sheet_generation(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.acquire_sheet_generation(uuid, uuid)
  to service_role;
