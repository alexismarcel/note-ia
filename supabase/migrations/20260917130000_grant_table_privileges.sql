-- RLS policies filter which rows a role may see, but they only apply once the
-- role holds the table privilege in the first place. Without these grants
-- every query fails with "permission denied for table ..." (42501) before any
-- policy is consulted — which reads nothing like an RLS problem.
--
-- Supabase normally issues these grants through default privileges on the
-- public schema; they are declared explicitly here so the schema stands on its
-- own. Only "authenticated" is granted: nothing in this app reads notes
-- anonymously, so "anon" is deliberately left without access.

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.subjects to authenticated;
grant select, insert, update, delete on public.notes to authenticated;
