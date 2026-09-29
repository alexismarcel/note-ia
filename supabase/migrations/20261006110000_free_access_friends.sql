-- Two more accounts with unlimited access, alongside the owner's
-- (20261005100000_unlimited_access.sql). Keyed by email: whoever signs in with
-- these addresses gets it, whether the account exists yet or not.
insert into public.free_access_emails (email, note)
values
  ('ismael.bacha1001@gmail.com', 'Accès gratuit'),
  ('gabtardieux@gmail.com', 'Accès gratuit')
on conflict (email) do nothing;
