-- Human-readable member identifier (`JAD-0001` style).
--
-- `Member.id` stays the auth uuid (PK/FK, routing, auth). `Member.memberCode`
-- is the admin-facing identifier: unique, stable, persisted, shown in
-- /admin/members + detail instead of the uuid. Assigned by the
-- `member_code_seq` sequence + `member_code_fill` trigger (concurrency-safe;
-- never max+1 queries, never frontend-generated).
--
-- Validation (expect 1 column, 0 nulls, 0 malformed, seq caught up):
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_name = 'Member' and column_name = 'memberCode';
--   select count(*) from "Member" where "memberCode" is null;
--   select "memberCode" from "Member"
--    where "memberCode" !~ '^JAD-[0-9]{4,}$';
--   select last_value from member_code_seq;
--   select count(*), count(distinct "memberCode") from "Member";
--
-- Down: drop trigger if exists member_code_fill on "Member";
--   drop function if exists member_code_fill();
--   alter table "Member" drop constraint if exists member_membercode_check;
--   alter table "Member" drop constraint if exists "Member_memberCode_uidx";
--   alter table "Member" drop column if exists "memberCode";
--   drop sequence if exists member_code_seq;

-- Sequence first (trigger + backfill depend on it).
create sequence if not exists member_code_seq;

-- Column (nullable until backfilled, per discipline).
alter table "Member" add column if not exists "memberCode" text;

-- Trigger function: INSERT fills nulls from the sequence; UPDATE never
-- nulls out an assigned code (stability across upserts/patches).
create or replace function member_code_fill() returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    if NEW."memberCode" is null or NEW."memberCode" = '' then
      NEW."memberCode" := 'JAD-' || lpad(nextval('member_code_seq')::text, 4, '0');
    end if;
    return NEW;
  else
    if (NEW."memberCode" is null or NEW."memberCode" = '')
      and OLD."memberCode" is not null then
      NEW."memberCode" := OLD."memberCode";
    end if;
    return NEW;
  end if;
end;
$$ language plpgsql;

drop trigger if exists member_code_fill on "Member";
create trigger member_code_fill
  before insert or update on "Member"
  for each row execute function member_code_fill();

-- Backfill existing rows (oldest first for stable numbering), starting after
-- any codes already present so reruns never renumber.
do $$ declare v_max int := 0; begin
  select coalesce(max(nullif(regexp_replace("memberCode", '^JAD-0*', ''), '')::int), 0)
    into v_max
    from "Member" where "memberCode" ~ '^JAD-[0-9]{4,}$';
  with ranked as (
    select id, row_number() over (order by "createdAt" asc nulls last, id asc) as rn
      from "Member" where "memberCode" is null or "memberCode" = ''
  )
  update "Member" m
     set "memberCode" = 'JAD-' || lpad((v_max + ranked.rn)::text, 4, '0')
    from ranked where m.id = ranked.id;
  -- Catch the sequence up past every assigned code (empty table -> next is 1).
  perform setval(
    'member_code_seq',
    coalesce(
      (select max(nullif(regexp_replace("memberCode", '^JAD-0*', ''), '')::int)
         from "Member" where "memberCode" ~ '^JAD-[0-9]{4,}$'),
      0
    ) + 1,
    false
  );
end $$;

-- Uniqueness + format CHECKs (added only after backfill, per discipline).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'Member_memberCode_uidx') then
    alter table "Member" add constraint "Member_memberCode_uidx" unique ("memberCode");
  end if;
  if not exists (select 1 from pg_constraint where conname = 'member_membercode_check') then
    alter table "Member" add constraint member_membercode_check
      check ("memberCode" ~ '^JAD-[0-9]{4,}$');
  end if;
end $$;

-- Every member must carry a code from here on (trigger fills new inserts).
alter table "Member" alter column "memberCode" set not null;
