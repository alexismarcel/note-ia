-- A note may be filed into a matière alone.
--
-- The previous migration made the cours the only way in, so a matière could
-- only be born as a side effect of creating a cours while recording. Picking
-- just "Économie" at the start of a lecture had no way to be stored.
--
-- notes.subject_id (from the initial schema, marked deprecated last migration)
-- is what answers that, so it comes back into use:
--
--   course_id set   -> the note is a séance of that cours
--   subject_id only -> the note belongs to the matière, no cours yet
--   neither         -> unclassified

comment on column public.notes.subject_id is
  'The note''s matière. Kept equal to the cours'' matière by notes_sync_subject() whenever course_id is set.';

-- 1. The two columns can never disagree ----------------------------------
-- Storing the matière on the note as well as on its cours is two answers to
-- one question, which drift apart the day a cours is moved. A BEFORE trigger
-- makes the cours the source of truth and leaves subject_id free only while
-- there is no cours.
create or replace function public.notes_sync_subject()
returns trigger
language plpgsql
as $$
begin
  if new.course_id is not null then
    select c.subject_id into new.subject_id
    from public.courses c
    where c.id = new.course_id;
  end if;
  return new;
end;
$$;

drop trigger if exists notes_sync_subject on public.notes;
create trigger notes_sync_subject
  before insert or update of course_id, subject_id on public.notes
  for each row execute function public.notes_sync_subject();

-- Notes filed before this trigger existed carry a null matière.
update public.notes n
   set subject_id = c.subject_id
  from public.courses c
 where n.course_id = c.id
   and n.subject_id is distinct from c.subject_id;

-- 2. A note may only point at its owner's matière ------------------------
-- Same reasoning as the cours check added last migration, and the same
-- replacement rather than addition: two permissive policies are OR'd.
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
    and (
      subject_id is null
      or exists (
        select 1
        from public.subjects s
        where s.id = subject_id
          and s.user_id = auth.uid()
      )
    )
  );
