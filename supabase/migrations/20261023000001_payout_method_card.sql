-- Payout methods: add Credit/Debit Card (owner-confirmed set).
--
-- The creatable set becomes CREDIT_DEBIT_CARD / DIGITAL_BANK / GCASH /
-- TRADITIONAL_BANK (enforced at the Zod edge). Legacy `OTHER` rows stay
-- valid everywhere (reads accept them; the DB keeps them legal) - only new
-- writes are restricted by the API contract, so no data remap is needed.
--
-- Pre-apply validation (run first; expect 0 unexpected rows):
--   select method, count(*) from "PayoutAccount"
--    where method not in ('TRADITIONAL_BANK','DIGITAL_BANK','GCASH','OTHER','CREDIT_DEBIT_CARD')
--    group by method;
--   (MemberPayoutAccount is a pre-unification legacy table; skip if absent.)
-- Down: drop payoutaccount_method_check and re-add the 4-value variant
-- (only when no CREDIT_DEBIT_CARD rows exist).
--   alter table "PayoutAccount" drop constraint payoutaccount_method_check;
--   alter table "PayoutAccount" add constraint payoutaccount_method_check
--     check (method in ('TRADITIONAL_BANK','DIGITAL_BANK','GCASH','OTHER'));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payoutaccount_method_check') THEN
    alter table "PayoutAccount" drop constraint payoutaccount_method_check;
  END IF;
  alter table "PayoutAccount" add constraint payoutaccount_method_check
    check (method in ('TRADITIONAL_BANK','DIGITAL_BANK','GCASH','OTHER','CREDIT_DEBIT_CARD'));
END $$;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'memberpayoutaccount_method_check'
  ) THEN
    alter table "MemberPayoutAccount" drop constraint memberpayoutaccount_method_check;
    alter table "MemberPayoutAccount" add constraint memberpayoutaccount_method_check
      check (method in ('TRADITIONAL_BANK','DIGITAL_BANK','GCASH','OTHER','CREDIT_DEBIT_CARD'));
  END IF;
END $$;
