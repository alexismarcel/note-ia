-- Sheets now come as { titre, chapitres: [{ titre, sections, prioritaire }],
-- pratique }, with no "plan". The list preview read "plan", then the root
-- "sections": a new sheet has neither, so its preview would come out empty.
--
-- Nothing else in the database needs to change: ai_summary is plain jsonb
-- with no check on its shape (20261006100000_ai_summary_jsonb.sql), and the
-- app validates the JSON itself (parseFiche in src/lib/fiche.ts).
--
-- Same view as 20261006100000 apart from summary_preview, which now joins
-- the section titles of every chapter, in order; sheets saved before
-- chapters fall back to their root sections, then to the "too short"
-- message. "plan" is no longer read.
create or replace view public.note_previews
with (security_invoker = on) as
select
  n.id,
  n.user_id,
  n.subject_id,
  n.course_id,
  n.title,
  n.created_at,
  n.ai_summary is not null as has_summary,
  left(n.content, 400) as content_preview,
  case jsonb_typeof(n.ai_summary)
    when 'string' then left(n.ai_summary #>> '{}', 400)
    when 'object' then left(
      coalesce(
        (select string_agg(s.value ->> 'titre', ' · ' order by c.i, s.j)
           from jsonb_array_elements(
             case when jsonb_typeof(n.ai_summary -> 'chapitres') = 'array'
                  then n.ai_summary -> 'chapitres' end
           ) with ordinality as c(value, i)
           cross join lateral jsonb_array_elements(
             case when jsonb_typeof(c.value -> 'sections') = 'array'
                  then c.value -> 'sections' end
           ) with ordinality as s(value, j)),
        (select string_agg(s.value ->> 'titre', ' · ' order by s.j)
           from jsonb_array_elements(
             case when jsonb_typeof(n.ai_summary -> 'sections') = 'array'
                  then n.ai_summary -> 'sections' end
           ) with ordinality as s(value, j)),
        n.ai_summary ->> 'message'
      ),
      400
    )
  end as summary_preview,
  case when jsonb_typeof(n.ai_summary) = 'object'
       then n.ai_summary ->> 'titre' end as summary_title
from public.notes n;

grant select on public.note_previews to authenticated;
