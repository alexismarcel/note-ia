-- One AI sheet per recording.
--
-- Every generation is a paid API call, and nothing stopped anyone clicking
-- "Générer la fiche" again and again on the same note (subscribers and
-- unlimited accounts have no counter at all). This table records that a note
-- has had its generation; the route refuses a second one.
--
-- A table of its own rather than a column on notes: notes are written straight
-- from the browser through PostgREST under an "own rows, all columns" policy,
-- so a flag there could be cleared by its owner. Here users may only read;
-- the route writes with the service role.

create table if not exists public.note_sheet_generations (
  note_id uuid primary key references public.notes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  generated_at timestamptz not null default now(),
  -- Set when the model answered that the transcript was too short: that
  -- answer is shown instead of a sheet, and it still used the generation.
  insufficient_message text
);

alter table public.note_sheet_generations enable row level security;

drop policy if exists "Users read their own sheet generations"
  on public.note_sheet_generations;
create policy "Users read their own sheet generations"
  on public.note_sheet_generations for select
  using (auth.uid() = user_id);

-- Read-only for users, whatever a schema-wide default grant may have given.
revoke insert, update, delete on public.note_sheet_generations from authenticated, anon;
grant select on public.note_sheet_generations to authenticated;

-- Notes that already carry a sheet have had their generation.
insert into public.note_sheet_generations (note_id, user_id, generated_at)
select n.id, n.user_id, n.updated_at
  from public.notes n
 where n.ai_summary is not null
on conflict (note_id) do nothing;
