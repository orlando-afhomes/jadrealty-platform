-- Member identifier v2 (`JAD-MEM-0001` style).
--
-- Converts the v1 `JAD-0001` codes (20261022000001) to the MEM-infixed shape,
-- matching the `JAD-VCH-…` voucher convention (`JAD-<ENTITY>-<SEQ>`).
-- Sequence numbers are preserved (`JAD-0003` -> `JAD-MEM-0003`), so the
-- `member_code_seq` needs no reset and ordering is unchanged.
--
-- Validation (expect 0 rows):
--   select "memberCode" from "Member"
--    where "memberCode" !~ '^JAD-MEM-[0-9]{4,}$';
--   select count(*), count(distinct "memberCode") from "Member";
--
-- Down: update "Member" set "memberCode" =
--   'JAD-' || lpad(nullif(regexp_replace("memberCode", '^JAD-MEM-0*', ''), '')::int::text, 4, '0')
--   where "memberCode" ~ '^JAD-MEM-[0-9]{4,}$';
--   create or replace function member_code_fill() ... 'JAD-' || ... (see
--   20261022000001); alter table "Member"
--   drop constraint if exists member_membercode_check;
--   alter table "Member" add constraint member_membercode_check
--     check ("memberCode" ~ '^JAD-[0-9]{4,}$');

-- Drop the v1 format CHECK first: it would reject the converted rows below.
alter table "Member" drop constraint if exists member_membercode_check;

-- Convert v1 codes only; reruns and already-converted rows match nothing.
update "Member" set "memberCode" =
  'JAD-MEM-' || lpad(parts.n::text, 4, '0')
  from (
    select id, nullif(regexp_replace("memberCode", '^JAD-0*', ''), '')::int as n
      from "Member" where "memberCode" ~ '^JAD-[0-9]{4,}$'
  ) as parts
  where "Member".id = parts.id and parts.n is not null;

-- Trigger now mints the MEM-infixed shape (sequence untouched).
create or replace function member_code_fill() returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    if NEW."memberCode" is null or NEW."memberCode" = '' then
      NEW."memberCode" := 'JAD-MEM-' || lpad(nextval('member_code_seq')::text, 4, '0');
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

-- New format CHECK (added only after the conversion above, per discipline).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'member_membercode_check') then
    alter table "Member" add constraint member_membercode_check
      check ("memberCode" ~ '^JAD-MEM-[0-9]{4,}$');
  end if;
end $$;
