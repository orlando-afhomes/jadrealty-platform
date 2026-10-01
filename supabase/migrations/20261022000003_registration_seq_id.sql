-- Sequential human-readable Registration IDs (`JAD-REG-0001` style).
--
-- `Registration.id` is TEXT PRIMARY KEY (not a uuid) and is already the
-- identifier every URL, lookup, display, storage prefix, and
-- `Member.registrationId` link uses - so the PK itself takes the new shape
-- instead of adding a second column. Assigned by the `registration_id_seq`
-- sequence + `registration_id_fill` trigger (concurrency-safe; never max+1
-- queries, never frontend-generated). Uniqueness is inherent (PK).
--
-- Validation (expect new shape, 0 malformed, unique):
--   select id from "Registration"
--    where id !~ '^JAD-REG-[0-9]{4,}$';
--   select count(*), count(distinct id) from "Registration";
--   select last_value from registration_id_seq;
--   select "registrationId" from "Member"
--    where "registrationId" is not null
--      and "registrationId" !~ '^JAD-REG-[0-9]{4,}$'
--      and "registrationId" !~ '^reg-';
--
-- Down: drop trigger if exists registration_id_fill on "Registration";
--   drop function if exists registration_id_fill();
--   drop sequence if exists registration_id_seq;
--   (Row IDs are NOT converted back - they are the PK referenced by
--   `Member.registrationId`, storage prefixes, and audit history.)

-- Sequence first (trigger + backfill depend on it).
create sequence if not exists registration_id_seq;

-- Trigger function: fills the PK from the sequence only when the insert
-- omits it. Existing IDs (old or new shape) are never rewritten, so an
-- assigned ID is stable across replays, edits, and upserts.
create or replace function registration_id_fill() returns trigger as $$
begin
  if NEW.id is null or NEW.id = '' then
    NEW.id := 'JAD-REG-' || lpad(nextval('registration_id_seq')::text, 4, '0');
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists registration_id_fill on "Registration";
create trigger registration_id_fill
  before insert on "Registration"
  for each row execute function registration_id_fill();

-- Backfill legacy `reg-*` rows oldest-first, starting after any new-format
-- max so reruns never renumber. `Member.registrationId` is plain text (no
-- FK), so it is remapped in the same transaction. Storage objects under old
-- prefixes (`government-ids/<oldId>/…`) must be moved with a one-off
-- service-role script (SQL cannot touch Storage) - see plan notes.
do $$ declare
  v_max int := 0;
  v_row record;
  v_n int := 0;
  v_new_id text;
begin
  select coalesce(max(nullif(regexp_replace(id, '^JAD-REG-0*', ''), '')::int), 0)
    into v_max
    from "Registration" where id ~ '^JAD-REG-[0-9]{4,}$';
  for v_row in
    select id as old_id from "Registration"
     where id !~ '^JAD-REG-[0-9]{4,}$'
     order by "submittedAt" asc nulls last, id asc
  loop
    v_n := v_n + 1;
    v_new_id := 'JAD-REG-' || lpad((v_max + v_n)::text, 4, '0');
    update "Registration" set id = v_new_id where id = v_row.old_id;
    update "Member" set "registrationId" = v_new_id
     where "registrationId" = v_row.old_id;
  end loop;
  -- Catch the sequence up past every assigned ID (empty table -> next is 1).
  perform setval(
    'registration_id_seq',
    coalesce(
      (select max(nullif(regexp_replace(id, '^JAD-REG-0*', ''), '')::int)
         from "Registration" where id ~ '^JAD-REG-[0-9]{4,}$'),
      0
    ) + 1,
    false
  );
end $$;
