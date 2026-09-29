-- Sheets move from markdown text to a JSON object the app lays out itself.
--
-- ai_summary becomes jsonb in place rather than gaining a sibling column, so a
-- note still has exactly one sheet and every "has a sheet" test (the quota,
-- the counts, the lists) keeps reading one column. Each existing markdown
-- sheet becomes a JSON *string*: supabase-js hands it back as a plain JS
-- string, which is how the app tells an old sheet (rendered as text, as
-- before) from a new one (an object, rendered by FicheView). Nothing is
-- rewritten or lost.

-- 1. Views first ------------------------------------------------------------
-- Postgres refuses to change the type of a column a view reads, and both
-- views read ai_summary. They are recreated below, unchanged apart from the
-- preview columns.
drop view if exists public.note_previews;
drop view if exists public.dashboard_counts;

-- 2. The column --------------------------------------------------------------
-- to_jsonb(text) wraps the markdown as a JSON string; a null stays null.
alter table public.notes
  alter column ai_summary type jsonb
  using to_jsonb(ai_summary);

comment on column public.notes.ai_summary is
  'The AI sheet. A JSON string for sheets generated before 2026-10 (markdown, shown as text); a fiche object (see src/lib/fiche.ts) from then on. Null when the note has no sheet.';

-- 3. List previews -------------------------------------------------------------
-- Same view as 20261001100000_list_views.sql. summary_preview stays text for
-- both formats: a markdown sheet keeps its first 400 characters, opening
-- "# Titre" line included; a fiche gets its plan (or, failing that, its
-- section titles) joined into a line, since its title comes separately in
-- summary_title.
create view public.note_previews
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
        (select string_agg(p, ' · ')
           from jsonb_array_elements_text(
             case when jsonb_typeof(n.ai_summary -> 'plan') = 'array'
                  then n.ai_summary -> 'plan' end
           ) as p),
        (select string_agg(s ->> 'titre', ' · ')
           from jsonb_array_elements(
             case when jsonb_typeof(n.ai_summary -> 'sections') = 'array'
                  then n.ai_summary -> 'sections' end
           ) as s),
        n.ai_summary ->> 'message'
      ),
      400
    )
  end as summary_preview,
  case when jsonb_typeof(n.ai_summary) = 'object'
       then n.ai_summary ->> 'titre' end as summary_title
from public.notes n;

-- 4. Dashboard counts ------------------------------------------------------
-- Unchanged: "is not null" means the same thing on jsonb.
create view public.dashboard_counts
with (security_invoker = on) as
select
  (select count(*) from public.notes) as note_count,
  (select count(*) from public.notes where ai_summary is not null) as sheet_count,
  (select count(*) from public.courses) as course_count;

grant select on public.note_previews to authenticated;
grant select on public.dashboard_counts to authenticated;
