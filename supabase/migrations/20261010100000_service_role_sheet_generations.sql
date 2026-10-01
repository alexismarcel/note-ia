-- The route's admin client (the service role) could not touch
-- note_sheet_generations directly: "42501 permission denied for table
-- note_sheet_generations". This project does not give the API roles
-- privileges on new tables by default, and 20261007100000 only granted
-- select to authenticated.
--
-- acquire_sheet_generation() worked regardless, being security definer.
-- Everything else the route does on this table with plain queries did not:
--   - regenerating a sheet on a test account (src/lib/sheet-regeneration.ts),
--     refused before it started;
--   - marking a generation complete, and releasing the lock of a failed one,
--     both of which failed silently (logged only): a failed generation kept
--     its note locked until the 10-minute expiry.

grant select, insert, update, delete
  on public.note_sheet_generations
  to service_role;
