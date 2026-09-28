-- A server-side floor under notes.duration_seconds.
--
-- The browser measures the recording and inserts the number with the user's
-- own token, so the value arriving here is a claim, not a measurement. There
-- is no server-side recording to check it against — transcription happens in
-- the browser — but there is the transcript, and a transcript of a given
-- length cannot have been spoken in less than a certain time.
--
-- So the transcript sets a floor. Understating the duration now means
-- shortening the transcript, which is the thing the user actually wants to
-- keep: the incentive points the right way.

-- 1. The floor ------------------------------------------------------------
-- Deliberately generous to the user. 200 words per minute is a fast lecturer;
-- ordinary French speech runs nearer 140, so an honest client measurement is
-- normally well above this and wins. This is a lower bound on plausible
-- speaking time, not an estimate of it.
create or replace function public.estimated_speech_seconds(transcript text)
returns integer
language sql
immutable
as $$
  select case
    when transcript is null or btrim(transcript) = '' then 0
    else ceil(
      array_length(regexp_split_to_array(btrim(transcript), '\s+'), 1)
        * 60.0 / 200.0
    )::integer
  end;
$$;

-- 2. Applied where it cannot be skipped -----------------------------------
-- A trigger, not a check in the route: notes are written straight from the
-- browser through PostgREST, so a rule living in application code would apply
-- only to the clients that choose to run it. A trigger applies to every
-- insert, whatever sends it.
create or replace function public.notes_floor_duration()
returns trigger
language plpgsql
as $$
begin
  new.duration_seconds := greatest(
    coalesce(new.duration_seconds, 0),
    public.estimated_speech_seconds(new.content)
  );
  return new;
end;
$$;

drop trigger if exists notes_floor_duration on public.notes;
create trigger notes_floor_duration
  -- Only when one of these two is being written: setting ai_summary on an old
  -- note must not quietly re-bill it.
  before insert or update of content, duration_seconds on public.notes
  for each row execute function public.notes_floor_duration();

comment on column public.notes.duration_seconds is
  'Recording length in seconds. The browser measures it; notes_floor_duration() raises it to the minimum time the transcript could have taken to speak. Null only on notes saved before the free allowance existed.';

-- 3. Existing notes are left alone ----------------------------------------
-- No backfill on purpose. The previous migration stated that notes saved
-- before the allowance existed count as zero, and retroactively billing hours
-- recorded under the old rules could lock someone out overnight for something
-- they did when nothing was metered. The floor applies from here on.
