-- Per-category commission rates (BR-COM per-category percentages).
--
-- Each PropertyCategory owns its Direct Commission (direct_rate) and Direct
-- Referral (referral_rate) percentages as exact-decimal text (0..1, up to 4
-- decimal places, e.g. 0.1000 = 10%). sale_qualify resolves the sale's
-- category and uses these rates, falling back to the global SystemConfig
-- keys when the property/category row is missing. Stored Commission rows
-- keep their snapshots (BI-006) - history is never recalculated.
--
-- Validation (expect 2 columns, 0 malformed rows):
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'PropertyCategory'
--      and column_name in ('direct_rate', 'referral_rate');
--   select slug, direct_rate, referral_rate from "PropertyCategory";
--   select slug from "PropertyCategory"
--    where direct_rate !~ '^(0(\.[0-9]{1,4})?|1(\.0{1,4})?)$'
--       or referral_rate !~ '^(0(\.[0-9]{1,4})?|1(\.0{1,4})?)$';
--
-- Down: alter table "PropertyCategory"
--   drop constraint if exists propertycategory_direct_rate_check,
--   drop constraint if exists propertycategory_referral_rate_check,
--   drop column if exists direct_rate,
--   drop column if exists referral_rate;
alter table "PropertyCategory"
  add column if not exists direct_rate text,
  add column if not exists referral_rate text;

-- Backfill from the live global rates (no literals): rows created before
-- this change inherit current behavior, so changing one category later
-- cannot affect the others. Guarded so a missing SystemConfig key leaves
-- the zero default instead of nulling the column.
update "PropertyCategory" set
  direct_rate = (select value from "SystemConfig" where key = 'COMMISSION_DIRECT_RATE')
  where (direct_rate is null or direct_rate = '0.0000')
    and exists (select 1 from "SystemConfig" where key = 'COMMISSION_DIRECT_RATE');
update "PropertyCategory" set
  referral_rate = (select value from "SystemConfig" where key = 'COMMISSION_REFERRAL_RATE')
  where (referral_rate is null or referral_rate = '0.0000')
    and exists (select 1 from "SystemConfig" where key = 'COMMISSION_REFERRAL_RATE');
update "PropertyCategory" set direct_rate = '0.0000' where direct_rate is null;
update "PropertyCategory" set referral_rate = '0.0000' where referral_rate is null;

alter table "PropertyCategory"
  alter column direct_rate set not null,
  alter column referral_rate set not null;
alter table "PropertyCategory"
  alter column direct_rate set default '0.0000',
  alter column referral_rate set default '0.0000';

-- Range + format CHECKs (added only after backfill, per discipline). The
-- regex pins 0..1 with up to 4 decimals - sale_qualify's looser format
-- check stays a superset, so category rates always pass it.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'propertycategory_direct_rate_check') then
    alter table "PropertyCategory" add constraint propertycategory_direct_rate_check
      check (direct_rate ~ '^(0(\.[0-9]{1,4})?|1(\.0{1,4})?)$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'propertycategory_referral_rate_check') then
    alter table "PropertyCategory" add constraint propertycategory_referral_rate_check
      check (referral_rate ~ '^(0(\.[0-9]{1,4})?|1(\.0{1,4})?)$');
  end if;
end $$;
