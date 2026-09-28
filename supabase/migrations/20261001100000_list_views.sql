-- Two views for the list pages, so they stop paying for data they never show.
--
-- security_invoker = on (PostgreSQL 15+) makes a view run with the caller's
-- rights, so the RLS policies on public.notes and public.courses apply exactly
-- as they do on a direct query. Without it a view would belong to its owner
-- and hand every user everyone else's rows.

-- 1. List previews -------------------------------------------------------
-- "Mes enregistrements" and "Mes fiches" show two clamped lines per row, but
-- were fetching every transcript and every sheet in full to do it — a two-hour
-- lecture is on the order of 100 KB, so a dozen of them crossed the wire on
-- every visit to produce a few hundred characters of preview.
--
-- 400 characters is comfortably more than the two lines the pages clamp to,
-- and keeps the sheet's opening "# Titre" line, which is where the note's
-- display title is read from.
create or replace view public.note_previews
with (security_invoker = on) as
select
  n.id,
  n.user_id,
  n.subject_id,
  n.course_id,
  n.title,
  n.created_at,
  -- The pages need to know a sheet exists without downloading it.
  n.ai_summary is not null as has_summary,
  left(n.content, 400) as content_preview,
  left(n.ai_summary, 400) as summary_preview
from public.notes n;

-- 2. Dashboard counts ----------------------------------------------------
-- The hub asked for three counts as three separate requests. One row, one
-- round trip; the sub-selects are filtered by the same RLS as anywhere else.
create or replace view public.dashboard_counts
with (security_invoker = on) as
select
  (select count(*) from public.notes) as note_count,
  (select count(*) from public.notes where ai_summary is not null) as sheet_count,
  (select count(*) from public.courses) as course_count;

grant select on public.note_previews to authenticated;
grant select on public.dashboard_counts to authenticated;
