-- Cours (courses): the level between a note and a matière.
--
-- A note is one recording session. Several sessions make up a cours, and a
-- cours belongs to exactly one matière. subjects already existed in the initial
-- schema but nothing ever wrote to it; the hierarchy is only usable now that
-- the middle level exists.
--
--   subjects (matière) 1 ── n courses (cours) 1 ── n notes (séances)

-- 1. Courses -------------------------------------------------------------
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- A cours without a matière would be invisible in a navigation that goes
  -- matière first, so the link is required rather than nullable.
  subject_id uuid not null references public.subjects (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.courses enable row level security;

drop policy if exists "Users manage their own courses" on public.courses;
create policy "Users manage their own courses"
  on public.courses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists courses_user_id_idx on public.courses (user_id);
create index if not exists courses_subject_id_idx on public.courses (subject_id);

drop trigger if exists courses_set_updated_at on public.courses;
create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

-- 2. Notes belong to a cours ---------------------------------------------
-- on delete set null: deleting a cours regroups its notes, it does not destroy
-- recordings the user spent two hours capturing.
alter table public.notes
  add column if not exists course_id uuid references public.courses (id) on delete set null;

create index if not exists notes_course_id_idx on public.notes (course_id);

-- notes.subject_id predates courses and is now redundant: the matière is read
-- through courses.subject_id, so a note carrying its own would be a second
-- answer to the same question. Left in place rather than dropped (no code has
-- ever written to it, so every row holds null) but never read.
comment on column public.notes.subject_id is
  'Deprecated: the matière is derived from courses.subject_id via notes.course_id.';

-- 3. A note may only be filed into its owner's cours ---------------------
-- The existing policy checked notes.user_id alone, so a crafted request could
-- point course_id at a cours belonging to someone else. Replaced rather than
-- added to: two permissive policies are OR'd, not AND'd, so a second one could
-- only widen what is allowed.
drop policy if exists "Users manage their own notes" on public.notes;
create policy "Users manage their own notes"
  on public.notes for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      course_id is null
      or exists (
        select 1
        from public.courses c
        where c.id = course_id
          and c.user_id = auth.uid()
      )
    )
  );

-- 4. One matière per name per user ---------------------------------------
-- The picker creates a matière from a typed name; without this, "Maths" typed
-- twice would split one matière into two entries in the navigation.
create unique index if not exists subjects_user_id_name_key
  on public.subjects (user_id, lower(name));

-- 5. Privileges ----------------------------------------------------------
-- RLS is consulted only after the role holds the table privilege; see
-- 20260917130000_grant_table_privileges.sql.
grant select, insert, update, delete on public.courses to authenticated;
