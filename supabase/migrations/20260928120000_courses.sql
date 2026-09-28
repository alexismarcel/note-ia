-- Cours (courses): the level between a note and a matière.
--
-- A note is one recording session. Several sessions make up a cours, and a
-- cours belongs to exactly one matière. subjects already existed in the initial
-- schema but nothing ever wrote to it; the hierarchy is only usable now that
-- the middle level exists.
--
--   subjects (matière) 1 ── n courses (cours) 1 ── n notes (séances)

-- 0. An unrelated public.courses already in the way ----------------------
-- "create table if not exists" is silent about a table that exists with a
-- different shape: it creates nothing, and every later statement fails on a
-- column that was never added ("column courses.subject_id does not exist"),
-- taking the whole migration down with it. This database had exactly that — a
-- courses table with a `subject` column, predating this feature and used by
-- nothing in the app.
--
-- The stray table is moved aside, never dropped: whatever it holds is still
-- readable at public.courses_legacy_20260928.
do $$
begin
  if to_regclass('public.courses') is null then
    return;
  end if;

  -- Already the shape this migration expects (a re-run): leave it alone.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'courses'
      and column_name = 'subject_id'
  ) then
    return;
  end if;

  if to_regclass('public.courses_legacy_20260928') is not null then
    raise exception
      'public.courses has an unexpected shape and courses_legacy_20260928 is taken; rename one of them by hand first.';
  end if;

  alter table public.courses rename to courses_legacy_20260928;
  raise notice
    'public.courses had an unexpected shape and was renamed to courses_legacy_20260928; its rows are intact.';
end $$;

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
-- Same trap as above, one column down: "add column if not exists" would keep
-- a course_id of the wrong type without a word.
do $$
declare
  existing text;
begin
  select data_type into existing
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'notes'
    and column_name = 'course_id';

  if existing is not null and existing <> 'uuid' then
    raise exception
      'notes.course_id already exists as % — expected uuid; rename or drop it first.', existing;
  end if;
end $$;

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
-- Skipped rather than fatal if the database already holds duplicates: the
-- index is a guard for what comes next, not worth aborting a migration whose
-- other statements this database needs.
do $$
begin
  if exists (
    select 1 from public.subjects
    group by user_id, lower(name)
    having count(*) > 1
  ) then
    raise notice
      'subjects_user_id_name_key skipped: duplicate matière names already exist. Merge them, then re-run this migration.';
  else
    create unique index if not exists subjects_user_id_name_key
      on public.subjects (user_id, lower(name));
  end if;
end $$;

-- 5. Privileges ----------------------------------------------------------
-- RLS is consulted only after the role holds the table privilege; see
-- 20260917130000_grant_table_privileges.sql.
grant select, insert, update, delete on public.courses to authenticated;
