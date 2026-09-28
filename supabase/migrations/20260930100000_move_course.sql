-- Moving a cours to another matière takes its séances with it.
--
-- notes_sync_subject() (previous migration) fires on the note: it derives
-- notes.subject_id from the cours whenever a note is inserted or its
-- course_id/subject_id changes. Nothing fired on the other side, so changing
-- courses.subject_id left every note of that cours pointing at the matière it
-- just left — visible immediately as a note listed under two different
-- matières at once.
--
-- The rule belongs here rather than in the page doing the move: any client
-- that updates a cours has to preserve it.

create or replace function public.courses_sync_notes_subject()
returns trigger
language plpgsql
as $$
begin
  update public.notes
     set subject_id = new.subject_id
   where course_id = new.id
     and subject_id is distinct from new.subject_id;
  return null;
end;
$$;

drop trigger if exists courses_sync_notes_subject on public.courses;
create trigger courses_sync_notes_subject
  -- AFTER: the cours' own row must be settled before its notes are realigned
  -- on it. The when clause keeps a plain rename from touching any note.
  after update of subject_id on public.courses
  for each row
  when (old.subject_id is distinct from new.subject_id)
  execute function public.courses_sync_notes_subject();

-- Any cours moved before this trigger existed left its notes behind.
update public.notes n
   set subject_id = c.subject_id
  from public.courses c
 where n.course_id = c.id
   and n.subject_id is distinct from c.subject_id;
