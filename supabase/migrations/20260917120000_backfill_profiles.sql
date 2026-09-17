-- notes.user_id references public.profiles (id), so saving a note fails with
-- a foreign key violation (23503) for any account that has no profile row.
-- The on_auth_user_created trigger only covers sign-ups that happened after
-- it was installed, leaving every pre-existing account unable to save.

insert into public.profiles (id, email, full_name, avatar_url)
select
  u.id,
  coalesce(u.email, ''),
  u.raw_user_meta_data ->> 'full_name',
  u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
on conflict (id) do nothing;
