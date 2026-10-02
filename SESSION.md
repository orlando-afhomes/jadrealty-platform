# SESSION.md - handoff for a new chat session

Date: 2026-10-02 (UTC, continued session). Since the 10-01 handoff the user committed everything in small steps on `develop` (latest `e97c6f6 enhance security: voucher crypto`; full tail: `10fd87a` member-detail actions → `c45c3f9` sale create form → `0c10d1a` member sale submission → `95009fd` payment method → `48f4611` withdrawals form → `1064181` profile page → `2ddb222` voucher crud → `750849e` voucher error fix → `e97c6f6`). **Working tree is CLEAN - nothing uncommitted. 2 new migrations, both live on the hosted DB. No `vercel --prod` was run this session - prod code predates all of it.**

## Deployment - current state (the important part)

**Live site:** `https://jadrealty.vercel.app` (production alias of the `jad-realty` Vercel project under `orlando-workspace-afhomes`). All deploys are **manual**: `pnpm dlx vercel --prod` from the repo root (deploy source shows as the `staging` branch). Branch history is `feature/chat` → merged/committed by the user; there is no git auto-deploy wired up.

**Topology (all one origin - required for auth):**

- `/` → web SPA (`apps/web/dist`)
- `/admin` → admin SPA (`apps/admin/dist`, Vite `base: '/admin/'` in production)
- `/api/v1/*` → ONE Vercel Function (`api/router.ts`)
- `/health` → readiness probe (`api/_handlers/health.ts`)
- `/crons/commission-clearing` → daily commission-clearing trigger (GET, see below)

**Supabase:** project `vudwoqduebdgtzvybywb.supabase.co` (URL is in root `.env`).
**Super-admin login is `jad@admin.com` / `SUPABASE_PROD_SUPERADMIN_PASSWORD`** (both in root `.env`). `admin@jad.local` and `user@jad.local` **do not exist** on the deployed DB - do not suggest them. Migrations + seed are applied (`pnpm db:migrate` uses root `.env` `DATABASE_URL`; versions recorded in `supabase_migrations.schema_migrations`).

**New endpoints since the last handoff:**

- `GET /locations/provinces?countryCode=PH` (public, provinces + independent cities as top level)
- `GET /locations/cities?provinceCode=...` (public, children; `[]` for independent-city parents; 404 unknown)
- `GET /locations/barangays?cityCode=...` (public; 404 unknown city)
- `GET /locations/suggest?countryCode=US&q=los` (public, non-PH only; Nominatim forward-search proxy, `{label,region,city}` fill values, provider outage → `200 []`; PH → 400)
- `GET /config/public` countries now carry optional `dialCode/phoneMin/phoneMax/phonePattern`
- `POST /contact` (public, honeypot + per-IP throttle) - `api/_handlers/contact.ts`
- `GET /admin/inquiries`, `PATCH /admin/inquiries/:id` (staff `cms` module, audited)
- `POST /admin/programs`, `PATCH /admin/programs/:id` (staff `programs` super_admin, audited; `isActive` retire)
- `POST /auth/verify-email`, `POST /auth/verify-email/resend` rewritten to self-managed EmailJS codes (see Phase K)
- `POST /admin/commissions/clear-due` (staff `withdrawals`+FINANCE_VIEW, audited)
- `GET /crons/commission-clearing` (daily Vercel cron; **intentionally unauthenticated** - idempotent + time-gated, can create no money; system actor)
- Frontend routes: `/auth/forgot-password`, `/auth/reset-password` (Supabase `resetPasswordForEmail` → PKCE recovery session → `updateUser`)
- `GET /policies` now returns `slug` and filters active programs
- `GET /sales/commission-preview?propertyId=` (member, read-only pre-submission estimate; per-category rates with global fallback via `resolveCategoryRates`; 422 when unconfigured; router branch sits BEFORE the `/sales/:id` regex or the id route would swallow it)

**New migrations applied (all live, verified in prod):**

- `20261020000003_policy_privacy_seed.sql` - upserts canonical `privacy` policy (pol-003) exactly once, never overwrites admin content. **Resolves backlog item 6 below** - the login consent Privacy Policy link now resolves.
- `20261020000004_phone_country_rules.sql` - `dial_code/phone_national_min/max/pattern` on `countries` + curated seed (25 dial codes; PH `63/10/10/^9[0-9]{9}$`).
- `20261020000005_ph_location_tables.sql` - `ph_provinces/ph_cities/ph_barangays` (PSGC codes, nullable city parent for HUCs), SELECT-public + ALL-service_role RLS mirroring `countries`.
- `20261020000006_registration_address_columns.sql` - 7 structured columns (`province/city/barangay_code+name`, `region_name`) on `Registration` + `Member`; legacy `address` keeps street-line meaning.
- `20261016000001_sale_qualify_coalesce_fix.sql` - `(v_patch ->> 'sellerId')::uuid` cast
- `20261016000002_list_order_indexes.sql` - `Member(createdAt)`, `Sale(submittedAt)`, `Sale(sellerId,submittedAt)`, `Commission(memberId,createdAt)`
- `20261017000001_role_authenticated_read.sql` - `grant select (slug, name) on "Role" to authenticated`
- `20261017000002_sale_qualify_referral_fix.sql` - per-`commissionType` idempotency + `DIRECT_REFERRAL` backfill
- `20261017000003_commission_clearing.sql` - `commission_clear`, `commission_clear_batch`, `COMMISSION_CLEARING_DAYS='7'`
- `20261017000004_member_id_verified.sql` - `Member.idVerified` + backfill
- `20261017000005_commission_clear_format_fix.sql` - `…990.00` mask
- `20261018000001_contact_inquiries.sql` - `ContactInquiry(id, name, email, message, status NEW|READ|ARCHIVED, ipHash, createdAt, handledAt, handledBy)`, service_role-only RLS, `INQUIRY_STATUS_UPDATED` audit
- `20261018000002_email_verification_codes.sql` - `EmailVerification(email PK, user_id, code_hash, expires_at, attempts, send_count, window_start, sent_at, verified_at)`, service_role-only
- `20261018000003_policy_slug.sql` - `Policy.slug` backfilled from `type`/`id`, `UNIQUE`, `CHECK slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`
- `20261018000004_policy_realtime.sql` - `alter publication supabase_realtime add table "Policy"`
- `20261018000005_program_is_active.sql` - `Program.isActive boolean default true`, public RLS `using ("isActive")`
- `20261018000006_policy_type_normalize.sql` - `type/slug='policies'` → `terms` when title contains "term"
- `20261019000001_sale_qualify_immediate_credit.sql` - `sale_qualify` now inserts `AVAILABLE` + inline `commission_clear` (wallet/ledger) in same tx; sweep `commission_clear_batch(0,'system')`
- `20261019000002_sale_qualify_return_fix.sql` - fixes `jsonb_build_object('sale', v_sale)` nesting bug via `v_sale_json jsonb` → flat `{"sale":{…}}`
- `20261019000003_sale_referrer_id.sql` - `Sale.referrerId uuid` + best-effort backfill from `referrerName` → direct referral
- `20261019000004_sale_qualify_referrer_model.sql` - `DIRECT_REFERRAL` payee is `Sale.referrerId` (members only, no free text); `referrerId` fallback removed (null = no referral)
- `20261019000005_sale_delete_guard.sql` - `sale_delete(id,actor,role)` SECURITY DEFINER; blocks delete when any `AVAILABLE` commission exists; deletes non-credited commissions + sale + `SALE_DELETED` audit
- `20261019000006_orphan_commission_cleanup.sql` - reverses/wallet-debits 3 orphan `AVAILABLE` commissions (Darcy 160k, Orlando 640k) with `COMMISSION_REVERSAL` ledger entries and removes rows
- `20261019000007_sale_qualify_sponsor_fallback.sql` - fallback: `referrerId` wins else `Member.sponsorId` (never both); adds pending estimate downline slice + sponsor backfill
- `20261021000001_category_commission_rates.sql` - `direct_rate`/`referral_rate` text on `PropertyCategory` (exact 0..1 4dp CHECKs), backfilled from live globals (all 3 cats inherited 0.0800/0.0400); seed fills fresh rows only, never clobbers customized rates
- `20261021000002_sale_qualify_category_rates.sql` - `sale_qualify` resolves the sale's category via `Property` join, uses its rates, global fallback on missing/malformed rows; body otherwise byte-identical (history snapshots untouched per BI-006)
- `20261022000001_member_code.sql` - `Member.memberCode` text + `member_code_seq` + `member_code_fill` trigger (fills nulls on insert, never nulls on update), oldest-first backfill, `UNIQUE` + `^JAD-[0-9]{4,}$` CHECK + `NOT NULL`. Live: 1 member converted, seq caught up.
- `20261022000002_member_code_mem_format.sql` - converts v1 `JAD-0001` codes to `JAD-MEM-0001` (numbers preserved, seq untouched), swaps trigger + CHECK to `^JAD-MEM-[0-9]{4,}$`. Live member is now `JAD-MEM-0003`. Ordering lesson: the old CHECK has to be dropped BEFORE the converting UPDATE (first attempt failed on it).
- `20261022000003_registration_seq_id.sql` - `registration_id_seq` + `registration_id_fill` trigger (fills PK only when omitted, never rewrites); backfill renumbers legacy `reg-*` PKs oldest-first + remaps `Member.registrationId` in-txn (no FKs reference it); seq set past max. Live: queue empty so backfill was a no-op; next ID is `JAD-REG-0001`. Storage-prefix moves for renamed rows need a one-off service-role script (SQL can't touch Storage).
- `20261023000001_payout_method_card.sql` - widens `payoutaccount_method_check` (+ legacy `memberpayoutaccount_method_check`, guarded for the dropped table) to 5 values (`TRADITIONAL_BANK/DIGITAL_BANK/GCASH/OTHER/CREDIT_DEBIT_CARD`); legacy `OTHER` stays legal, no data remap. Live-verified: 0 off-vocabulary rows, table empty, CHECK confirmed in place.
- `20261023000002_withdraw_amount_digit_cap.sql` - `withdraw_reserve` rejects >12 whole digits with 400 BEFORE any wallet/account access (full body otherwise byte-identical to the mask-fix version). Live-probed with a fake member (zero-write by construction): 13-digit amount → 400 digit-cap message; sane amount → falls through to 404, proving nothing else moved.

### How the deploy is wired

- `scripts/prepare-vercel-env.mjs` - writes `VITE_WEB_URL`/`VITE_ADMIN_URL` into `apps/{web,admin}/.env.production` from **`VERCEL_PROJECT_PRODUCTION_URL`** (fallback `VERCEL_URL`). MUST be the canonical host, otherwise login redirects to a per-deployment URL (different origin → different localStorage → login loop). Do not set these vars in Vercel env.
- `scripts/assemble-vercel-output.mjs` - copies `apps/web/dist` → `vercel-static/` and `apps/admin/dist` → `vercel-static/admin/`.
- `vercel.json` - `framework: null`, buildCommand chain (prepare → `turbo run build` → assemble), `outputDirectory: vercel-static`, rewrites (`/api/v1/:path*`→`/api/router`, `/health`→`/api/router?path=health`, `/admin*`→admin index, `/(.*)`→web index), `functions: { "api/router.ts": { "includeFiles": "packages/**" } }`, and `crons`: `/health` daily `0 0 * * *` + `/crons/commission-clearing` daily `0 1 * * *`. **Hobby allows max 2 daily crons**.
- **CRITICAL:** `includeFiles` must stay `packages/**`. Narrowing it risks `ERR_MODULE_NOT_FOUND .../@jad/contracts/src/index.ts`.
- `.vercelignore` - excludes `**/*.spec.ts(x)`, `api/dev-server.ts`, `supabase/`, `docs/`, `node_modules/`, `.turbo/`, `vercel-static/`, **`.env*`**, `.vercel/`.
- `.gitignore` - added `vercel-static/`.

### Single-function API (Vercel Hobby caps at 12 functions)

- `api/v1/**` handlers live in **`api/_handlers/**`** (underscore dirs are not functions).
- `api/_lib/router.ts` - shared URL→handler router. **Handlers are lazy-loaded** (`lazy(() => import(...))` per branch, cached per instance); shared libs stay eager. `route-coverage.ts` recognizes dynamic-import branches.
- `api/router.ts` - the single Vercel Function; `resolveRequestUrl` rebuilds the path from the rewrite's `?path=` param.
- `api/_lib/rest.ts` - `serviceClient()`/`anonClient()` are **cached per instance**; `requireService` delegates. `api/_lib/verification-code.ts` uses the inferred `ServiceClient` type (`NonNullable<ReturnType<typeof serviceClient>>`) with `Chain` casts through `unknown` so `supabase.from()` typing stays loose.
- `api/_lib/emailjs.ts` - EmailJS REST delivery (`user_id`/`accessToken`/`template_params`), 10s abort, never throws.
- `api/_lib/catalog-cms-sync.ts` - bidirectional catalog↔CMS `properties` sync for linked listings (`catalogId`), exact-decimal price gate, version bump + realtime broadcast.
- `api/_lib/env.ts` - no hardcoded URL fallback; trims `url`/`serviceKey`/`anonKey`; `getEmailJsConfig()` requires `EMAILJS_SERVICE_ID/TEMPLATE_ID/PUBLIC_KEY`.

### What this session built (uncommitted; prior turns deployed: 9d78da8, 71323a0, 1278dee on staging)

**Commission instant-credit + pending pipeline:**
- `sale_qualify` now credits `AVAILABLE` + `clearedAt` + `Wallet` (`availableBalance`, `totalEarned`, recomputed `pendingAmount` via `990.00` mask) + `LedgerEntry` `CREDIT` + `COMMISSION_CLEARED` audit in the same tx; per-type idempotency; referral backfill + sweep `commission_clear_batch(0)`. Referrer model: `DIRECT_REFERRAL` → `Sale.referrerId` when set else `Member.sponsorId` (never both), no self-pay. `pendingCommission` computed server-side in `GET /me/wallet` via `pending-commission.ts` (`ownSales×direct` + `referredSales×referral` + `downlineSales(referrerId IS NULL)×referral`), with `multiplyMoney` in `@jad/shared` (BigInt, PG-compatible half-away). Contract `walletSchema.pendingCommission` optional; `saleSchema.referrerId`, `submitSaleRequestSchema.referrerId`.

**Qualify fixes:**
- `ConfirmDialog` gained `confirmDisabled`/`confirmLoading` (`packages/ui/src/components/ConfirmDialog.tsx`); `SaleDetailPage` gained `inFlight` ref + `deleteMut.isPending` guard, close-on-success only, `ConfirmDialog` pending wiring; `SalesPage` guard via `deleteMut.isPending`; `SaleFormDialog` added `if (isPending) return` race guard.
- `api/_lib/pipeline.ts` same-status idempotent (`patch.status === currentStatus → null`); handler same-status no-op for non-qualify, always RPC for `QUALIFYING_SALE`.
- Return-shape fix: `select to_jsonb(s) into v_sale_json` → `jsonb_build_object('sale', v_sale_json)`; handler defensively unwraps `sale.to_jsonb ?? sale`. Specs updated to flat.

**Referrer flow:**
- `submitSaleRequestSchema` now `referrerId` (no free text); `SaleSubmitPage` select uses `referrerId` (id + name) from `useDirectReferrals`, hint notes sponsor fallback; admin `SaleFormDialog` filters `referrerOptions` to `sponsorId === sellerId`, clears invalid referrer on seller change, edit prefill + `updateMut` includes `referrerId/referrerName`.
- API `POST /sales` + `/sales/:id/resubmit` + `POST /admin/sales` validate `referrerId` is a direct referral of the seller; `PATCH /admin/sales/:id` whitelist + validation; `sponsorId` repair skips `referrerId IS NOT NULL` sales.

**Payout + sale-delete + commissions link:**
- `POST /me/payout-accounts` now inserts `accountIdentifierMasked: maskIdentifier(...)` (was the NOT NULL violation). `GET /me/commissions` drops commissions whose sale no longer exists (never a dead property link). `sale_delete` guard + orphan cleanup (reverse credited via ledger + wallet debit then remove).

**Admin loading hardening (10-item):**
- Sale detail/list delete, sale form race, registration accept/reject, MembersPage archive/restore, MemberDetailPage edit save, deactivate/activate, qualify/revoke, archive, purge spinner `loading={purgePending}`. All use `actionPending + guard + confirmDisabled/confirmLoading` + cancel/backdrop lock.

**Auth gates + archive:**
- Archived-list mapping now uses `mapMemberRow` + fallbacks, warns on drop.
- `getMemberAccessBlock()` shared helper; `LoginPage` + `session.tsx` block `archivedAt` / `accountStatus !== ACTIVE` with `ACCOUNT_ARCHIVED`/`ACCOUNT_INACTIVE`; archive bans (`ban_duration: 876000h`), restore unbans, clears `archivedBy`; mock parity in admin/member handlers.

**Mocks/seeds/specs:** `MockSale.referrerId`, `toSale`, ` MockWallet.pendingCommission`, store wallets, commissions `AVAILABLE`, member store `accountStatus/archivedAt`, web mock login gates, admin archive/restore/purge mock, new `pending-commission.spec.ts`, `archived.spec.ts`, `memberLifecycle.spec.ts`, updated `SaleSubmitPage.spec`, `sponsors repair`, `payout-accounts`.

**Background:** `docs/business/BUSINESS-RULES.md:133` BR-COM-002 now notes fallback ("referrer wins else sponsor").

### What the validation-hardening session built (COMMITTED as `75ec470`; DB writes were live at the time)

**Registration validation hardening (TDD, user decisions: curated phone table / non-PH text fields / MI N/A→empty / full PSGC seed):**
- `packages/contracts/src/schemas/registration-validation.ts` (new, single source): normalize-then-validate primitives - Unicode-letter names (`\p{L}\p{M}`, spaces/hyphens/apostrophes, curly-folded, 60 max, control-char reject), MI fold (`A.`→`A`, N/A→empty), E.164 phone engine (`toPhoneRule` kernel + `validatePhoneNumber`), strict DOB parser (YYYY-MM-DD round-trip, past-only, min-age, 120 max), PH/generic address shapes.
- `registerRequestSchema` tightened (names/MI/DOB/phone-shape/gender+country trim+length, structured address + no-mixing superRefine; `resubmitRequestSchema` re-derived via plain-base `.partial()` - Zod v4 forbids `.partial()` on refined schemas); `registration.ts`/`member.ts` read models gained optional address columns; `publicConfigSchema` countries gained optional phone metadata.
- `api/_lib/intake-validation.ts` (new): `buildPhoneRule`/`validateIntakePhone`/`resolveIntakeAddress` with injected lookups + `locationLookupsFor` (service-client cast pattern); independent-city self-parent convention (`provinceCode == cityCode`, names snapshotted server-side, never trusted from client).
- `register.ts`: country `is_active` check, per-country E.164 normalization stored canonical, hierarchy membership checks, new columns on insert + replay; `resubmit.ts`: **now actually validates** (`resubmitRequestSchema.safeParse`, legacy `governmentId` alias folded) + phone/address normalization + street-only path; `approve.ts` carries columns to Member; `mapRegistrationRow`/`mapMemberRow` pass new columns through.
- `GET /locations/*` handlers + router branches (route-coverage green); `GET /config/public` serves sanitized phone metadata (malformed rows dropped per-row).
- Web `RegistrationForm`: MI N/A checkbox (disables input), `+dial` hint, `SearchableSelect` combobox (deferred filter, free text reverts on blur - never submitted; keyboard accessible), PH hierarchy with dependent resets vs generic region/city, live DOB validation, **full-draft re-validation on submit** with step jump + focus (closes persisted-draft/devtools bypass), review shows N/A + resolved names; draft key bumped `v1→v2` with shape guard + v1 cleanup (also added to test setup); `ResubmitPage` prefills hierarchy + N/A state.
- Dev mocks: dial metadata on mock PH, mock `/locations/*` tiny dataset, MockMember hierarchy fields.

### Committed as `3b9c1f2` + `da40ef9` since last handoff (no longer pending)

**Location rate limits + DOB fix:** `provinces/cities/barangays` gained `enforceRateLimit` (120/15m, `LOCATIONS_RATE_LIMIT` override, 429 specs); contracts DOB time bomb fixed (relative today/tomorrow dates). **Anon-key regression spec** (`web/src/lib/supabase.spec.ts`) locks trailing-newline trimming. **Dynamic public properties (frontend-only):** `content/cms-listings.ts` adapters (CMS price passes only if exact-decimal, else inquiry state), parametrized selectors, `PropertyCard categories?` prop; Home/Properties/Category/Detail render live CMS records with static fallback. **CMS scroll-jump fix:** new `useCmsHashScroll` (one-shot on load) replaced the `[data,draft]` hash effects in all 8 admin CMS pages (keystroke re-scroll proven: 6 scrolls for 6 chars before fix). **Register CMS wiring:** `RegistrationForm copy` prop (stepTitles/16 field labels+ints/qualification id-matched override/submitLabel/loginPrompt), `RegisterPage` + `ResubmitPage` pass live CMS, `PhoneField label` prop, dev-only fallback-cause logging in `getRegisterCmsPublic`. **Security hardening:** contract password `min(8).max(72)` (shared `staffPasswordSchema`; bcrypt boundary), login trim + maxlengths + generic 401 message + email-only copy/validation, `admin/session/password` throttle (10/15m), `usePersistedDraft` strips passwords on save+restore, 409 accepted-risk note on register. **Visited-label fix (`da40ef9`):** `.signInLink:visited` + ContactPage method-icon guards (global `a:visited` 0,1,1 beats single-class rules) + `visited-label.spec.ts`.

**Live incidents fixed this batch:**
- PH registration 500 `Cannot read properties of undefined (reading 'rest')`: `locationLookupsFor` detached `client.from` (prototype method needs receiver). Fixed with `.bind` (+ receiver-dependent regression spec). Non-PH path never touches lookups, which is why it hid. Same `.bind` precedent already in `auth.ts`.
- Resend 503 + cooldown confusion: first-send EmailJS failure (row written, `sent:false`) arms the 60s cooldown, so retries 200 with `retryAfterSeconds` while nothing was emailed. Root cause diagnosed from terminal: `400 template ID not found` - `EMAILJS_TEMPLATE_ID` not in the key's account (user-side dashboard fix, still open). `verification-code.ts` `table()` helper is SAFE (parenthesized member call keeps receiver - probed live).

### What this batch built (UNCOMMITTED, 23 files; DB writes ARE live)

**Per-category commission percentages (user decisions: columns on PropertyCategory / global fallback / history immutable / category-editor permission):**
- contracts: `categoryCommissionRateSchema` (0..1 4dp) + `propertyCategorySchema` + create/update request schemas, exported from index.
- `api/_lib/category-rates.ts` (new, single source): `pickRate` + batched `resolveCategoryRates` (3 queries any batch size); used by wallet pending estimate (per-sale rates), both sale-detail previews, sponsor repair (hoisted, once per call), category CRUD (list includes rates; create defaults omitted rates to live globals fail-closed; PATCH updates each rate independently, audited).
- `sale_qualify` v20261021000002 (above); admin `CategoryFormDialog` percent fields (display % in, 4dp out, blank = unchanged/defaults) + table Direct/Referral columns.
- Specs (all RED-first): contracts catalog (11), category endpoints (5: per-cat list, explicit/default create, single-rate PATCH independence, range reject), category-rates (5), pending-commission row rates (+2).
- Verified: backfill = live globals on all 3 cats; header queries green (columns, join+mask, 0 malformed); `sale_qualify` NOT_FOUND probe returns flat shape. Full money path at changed rates NOT live-probed (would pay real commissions) - do a scratch-sale probe or BEGIN/ROLLBACK before shipping.

**Committed as `75ec470` since last handoff (no longer pending):** phone dial-code dropdown + per-country digit cap (`PhoneField`, `phoneDial` draft, `composeE164Phone` submit, dial default follows verified country); wide-panel (680px) single-column step 0 with `FormField`-normalized read-only blocks (`AuthLayout wide` prop, `ResubmitPage` wrapper 560→680px); name live shaping (`sanitizePersonName`) + MI single-letter shaping (`sanitizeMiddleInitial`) + title-case auto-format (`capitalizePersonName`, MI uppercased) - all single-sourced in `@jad/contracts`; Program/Personal section split with `sectionDivider`.

### What the member-ID batch built (UNCOMMITTED; 2 migrations live, verified prod)

**Human-readable member IDs (`JAD-MEM-XXXX`, user-confirmed shape):**
- contracts `memberCodeSchema` (`/^JAD-MEM-[0-9]{4,}$/`, optional on profile so legacy rows parse); `api/_lib/member-codes.ts` (format/is/parse/next-mock mirrors); `mapMemberRow` passes `memberCode` + `middleInitial`/`nameSuffix` (columns existed, mapper dropped them - MI never surfaced anywhere before this).
- No handler logic needed for assignment (trigger fills on insert; `PATCH` whitelist can't touch the code). Admin list/detail/archived show codes, search by code, routes still UUID-internal; sponsor line no longer falls back to UUID.
- "—" incident root-caused (not a data bug): new UI against a stale API (dev-server has no hot-reload; prod not redeployed). Proved end-to-end live: REST → `mapAdminMemberRow` → schema-valid `JAD-MEM-0003`. Fix is restart/redeploy, not code.

### What the registration-ID batch built (UNCOMMITTED; 1 migration live, queue empty)

**Sequential registration IDs (`JAD-REG-XXXX`):** `Registration.id` is TEXT PK (not a UUID), so the PK itself took the shape - no second column. `register.ts` no longer sends `id` (deleted the only `prefixedId('reg')` site) and reads back `.select('id,status').single()` for the upload + 201 payload; email-conflict replay untouched. Contracts `registrationIdSchema` (strict) while `registrationSchema.id` stays lenient for legacy/audit rows; `api/_lib/registration-ids.ts` mirrors. Admin queue gained an ID column + ID search; detail/member pages render `id` generically (no change needed). Live probe (rolled back): format yields `JAD-REG-0001`, explicit IDs preserved, seq unconsumed.

### What the Create Member validation batch built (UNCOMMITTED, no migration)

**Register parity in the admin dialog:** phone kernels (`buildPhoneRule`, `dialCodeOptions`, `buildPhoneRuleForDial`, `maxNationalLength`, `sanitizeNationalInput`, `splitStoredPhone`, `composeE164Phone`, `cutoffDateForMinAge`, `CountryPhoneMeta`) promoted to `@jad/contracts`; web re-exports them (specs green). New admin `services/reference.ts` + `useMemberFormReference` (same endpoints, `enabled: open`), `MemberPhoneField`, `MemberLocationSelect` (commit-listed-only/revert/keyboard contract), `memberForm.ts` validation (all shared primitives), full dialog rewrite (MI+N/A, E.164 phone, DOB/minAge, street+PH hierarchy/non-PH text, blur+submit validation, `isPending` guard). `POST /admin/members` hardened (names/MI/phone-E.164/DOB/country-active/address-membership/password via shared core) and now **stores** `middleInitial`/`dateOfBirth`/`gender`/address columns it previously accepted-but-dropped. Follow-ups: live title-case names, forced-lowercase email, `MemberFormDialog.module.css` polish, fixed suffix dropdown (None/Jr./Sr./II/III/IV/V, allowlisted server-side), city/barangay hidden until province picked, production-ready members header copy.

### What the investigation-fix round built (UNCOMMITTED, no migration)

- **A11y:** `<form onSubmit>` + `type="submit" form=` (+ explicit Enter handler; combobox stops propagation on pick), `aria-required` everywhere, error wiring on Country/Program/referral/dial, combobox `aria-activedescendant` + Home/End, ref-fail `role="status"`, single `submitError` alert.
- **Idempotency (user chose header approach):** `Idempotency-Key` required on `POST /admin/members` (CORS advertised), staff-scoped `POST:/admin/members:<staff>:<key>` rows (memberId null - staff ids aren't Member rows), 200-replay/201-store/24h expiry; dialog mints a key per open; `ADMIN_MEMBERS_RATE_LIMIT` throttle (30/15m).
- **Perf:** `countries/SystemConfig/Program/email` batched in one `Promise.all`; sponsor lookup is `ilike` exact-match (no full scan); referral codes loop `generateReferralCode` up to `MAX_REFERRAL_CODE_ATTEMPTS` (no pre-scan; unique index is truth). `Program` existence enforced (free country×program combos documented intentional in-code).
- **Real bug caught by tests:** camelCase keys passed to snake_case `buildPhoneRule` silently fell back to generic E.164 (a short PH number 201'd) - fixed; TS would have caught it had typecheck run right after the edit.

**International location suggestions (this batch, uncommitted):**
- `packages/contracts/.../location.ts`: `locationSuggestQuerySchema` (ISO-2 + `q` 3-100) + `locationSuggestionSchema` (`{label,region,city}`), exported from index.
- `api/_lib/geocode.ts` (new): shared server-side Nominatim config reusing `REVERSE_GEO_*` env (derives `/search` from reverse URL) + timeout/UA fetch helper. `location-verify.ts` deliberately untouched.
- `api/_handlers/locations/suggest.ts` (new) + router branch (route-coverage green): per-IP throttle (30/min), PH → 400, provider rows mapped state/county → region, city/town/village/hamlet → city (schema-validated, max 5), outage → `200 []` logged server-side. No migration - `region_name`/`city_name` columns already exist; intake storage semantics unchanged.
- Web: `getSuggestions()` endpoint, `useLocationSuggest()` hook (350ms debounce, min-3-chars, non-PH gating, `retry: false`), suggestion list under non-PH Region/City (choose fills both + dismisses; edit re-shows; free text always submittable). PH path untouched.

**Localhost location-list incident (user-reported, fixed live):**
- Root cause: brand-new `ph_*` tables existed only as migration files - never applied or seeded on the hosted DB (localhost points at hosted). Endpoint correctly fail-closed (500/empty → Alert).
- Ran `pnpm db:migrate` (4 pending incl. privacy seed - all verified via header queries), seeded PSGC via `pnpm seed:locations` from transient `@ph-dev-utils/core@0.5.0` + `@ph-dev-utils/psgc-barangays@0.1.0` (PSA Q4 2024 provenance, NOT added to package.json): **82 provinces / 1634 cities / 42046 barangays, 0 orphans**; verified via dev-server curl (all three endpoints 200 with real rows).
- UI hardening: the single opaque Alert is now split - fetch error ("could not be loaded" + Retry) vs empty dataset ("has not been loaded into the database", warning + Retry); query errors log to dev console; cities/barangays errors gained Retry.

### What the 2026-10-02 session built (all COMMITTED, debits live; no deploy)

**Member-detail actions (`10fd87a`):** action-card buttons color-coded by function (Edit blue / Grant green / Revoke amber / Activate navy / Deactivate orange / Archive slate / Delete red); header meta line (status chips + program/email/date) removed (info already in cards). `Button` className-merge fix in `@jad/ui` (caller classes previously REPLACED base styles - also repairs ScanVoucherPage `redeemButton`).

**Admin sale create modal (`c45c3f9`, SaleFormDialog):** Category → Property cascade (category from `useCategories`, property filtered + disabled until picked, switches clear out-of-category picks; edit backfills category from the property incl. late-catalog path); seller/referrer labels name-only (values stay uuids); customer name/phone/email live shaping via `@jad/contracts` (`sanitize/capitalizePersonName`, digits-only phone ≤20, lowercase email) + normalize-then-validate submit; field order Category/Property/Value/Seller/Referrer/Name/Mobile/Email.

**Admin sale detail (`c45c3f9` follow-ups):** Edit/Delete moved from header into the Actions card beside Reject (kept in the terminal Status card too so those states don't lose the actions; triggers carry no pending-lock - dialogs self-lock, preserving the delete-race test); **new sale IDs `JAD-SAL-<UPPER36>`** via `saleReferenceId()` in `pipeline.ts`, wired into member + admin create paths (legacy `sal-*` rows unaffected; commission ids are random, never embed sale id); Est. Commission split to two rows with compact percents (`8%` not `8.00%`); Submitted-by shows `memberCode` via `useMember` (uuid gone; renders nothing while loading/failing).

**Member sale submit (`0c10d1a`, SaleSubmitPage):** category cascade over static catalog records; production copy sweep (`(BI-006)`/Idempotency-Key jargon gone); commission preview rows (seller + named/generic referrer) from the new preview endpoint (`getCommissionPreview` + `useCommissionPreview`, `retry:false`, amounts via `multiplyMoney`); referrer dropdown has no empty option and disables with an explanatory hint when no sponsor/referrals; labels Category/Property Listings; no em dashes; merged sale-value + commission block (`Sale value: ₱X (locked at submission)`).

**Payout methods (`95009fd`):** dropdown is now Credit/Debit Card, Digital Bank, GCash, Traditional Bank (that order). Contract split: `payoutMethodSchema` (4, writes) + `legacyPayoutMethodSchema` (4+OTHER, reads: `payoutAccountSchema`, `withdrawalPayoutAccountSchema`) so legacy rows keep rendering; card branch (13-19 digits), holder/bank names shaped + charset-validated, identifiers digits-only shaped with per-method caps (11/12/19); Luhn (`isValidCardNumber`, single-sourced) enforced client + server (`superRefine` on create schema → 400, zero inserts); admin filter/labels updated with "Other (legacy)"; migration above. No `OTHER` in mocks/seeds.

**Withdrawals form (`48f4611`):** fixed suggestion ladder **10,000/20,000/40,000/50,000** filtered to [min, affordable cap] (single-min fallback; hidden below minimum); amount input numeric-only with live thousand separators (commas stripped before validate/submit/preview/confirm - the confirm dialog previously would have shown ₱0.00, fixed); production copy (`(BR-*)` refs gone). Investigation: member-scoped 24h idempotency, CONFIRMED-only + owner-scoped accounts, row-locked balance check all verified in `withdraw_reserve`. Follow-ups built next turn: **per-attempt key regeneration** (`keyForAttempt` - same payload reuses, edited payload mints fresh; fixes cross-tab replay; `mintIdempotencyKey` module-level for hooks lint) + the digit-cap migration above.

**Member hub pages:** 6 pages (ewallet, ledger, referrals direct/network/genealogy/earned) copy-swept of all `(XX-000)` codes with per-page no-dev-code guard specs. **Profile (`1064181`, via `frontend-design` skill - the local skill IS `anthropics/skills@frontend-design`, verified 943.9K installs via `npx skills find`):** linked-accounts zone (payout incl. primary/masked, voucher QR + code + remaining, sponsor + direct count) with independent loading/error per block; two-column desktop grid (personal left, linked right); full account number by default + icon-only eye toggle (`eye`/`eye-off` added to `@jad/ui` Icon); Primary pill badge; `CONFIRMED` word removed; spacing pass.

**Vouchers (`2ddb222`/`750849e`/`e97c6f6`):** assign modal - name-only member options, `Valid for Days` prefilled from `VOUCHER_DEFAULT_EXPIRY_DAYS` (late-config backfill that never clobbers typed input), expiry auto-display (today+N, display-only so the days path survives) + `min=today` + past-date validation, digits-only days; revoke confirm lock (close-on-success). Server: past-date + `MAX_VALIDITY_DAYS=36500` refines on assign + template create/update. **Security review** (via `security-best-practices` + `web-security-review`; report at `C:\Users\SSD-ORLANDO\AppData\Local\Temp\opencode\voucher-security-report.md`, NOT in repo): V1 redeem expiry re-check added (was bypassable direct-by-id), V2 scan/assign/redeem throttled (120/120/60, `VOUCHERS_*_RATE_LIMIT` overrides), V3 assign rejects non-ACTIVE members (422), V4 `computeMemberExpiry` overflow guard. **Codes now random** (`JAD-VCH-2026-1H57MP` via `crypto.randomBytes`, in-memory collision retry + DB unique backstop; mock generator aligned). **Vouchers are Points:** `formatPoints` in `@jad/shared` (`5,000 Points`, singular `1 Point`) swapped into all 9 display sites (admin list/detail/scan, member list/detail/profile) + create-dialog copy; wire values unchanged (no migration).

### Production auth fixes (cumulative)

- Bearer header on every request; 401 → one rotation → retry → `clearSession` (no warning for public requests). `VITE_SUPABASE_ANON_KEY` trimmed (trailing-newline `%0A` realtime bug).
- Role reads for login go through the restored `authenticated` `SELECT(slug,name)` grant.
- Email verification no longer depends on Supabase SMTP or the Magic Link template variable; EmailJS is the delivery mechanism (requires `Allow non-browser` + correct `EMAILJS_*`).

### Security audit - done + still open
Done: secrets excluded, hardcoded URL removed, CORS scoped, `/health`, money functions + `commission_clear(_batch)` + `sale_delete` service_role-only, cron trigger intentionally public (idempotent + time-gated), SELECT-only Role re-grant (rls_invariants #1,4,6 PASS; #2/3 findings are pre-existing managed-project Anon/Storage grants + is_staff_user routine, documented), pending replay now updates the existing row (no duplicate).
**Still open (do these next):**

1. **EmailJS delivery (STILL OPEN, now precisely diagnosed):** first-send fails `400 template ID not found` - `EMAILJS_TEMPLATE_ID` is not in the account owning the public key (same mismatch class as the service ID). Fix in dashboard (same-account IDs + template params `to_email/to_name/verification_code/app_name/expiry_minutes` + Allow non-browser), update root `.env` + Vercel env, restart dev-server, redeploy. Note: a failed first send arms the 60s cooldown, so retries 200 with `retryAfterSeconds` while nothing was emailed - check the FIRST attempt's `[email]` line, not the retry.
2. **Rate limiting:** `provinces/cities/barangays` covered (120/15m); `register`/`location-verify`/`verify`/`resend`/`suggest` covered; `admin/session/password` throttled (10/15m); **voucher scan/redeem/assign throttled this session** (120/120/60, `VOUCHERS_*_RATE_LIMIT` overrides). Remaining: distributed quota is out of scope (in-memory per instance by design).
3. **Clean the Vercel env var `VITE_SUPABASE_ANON_KEY`** - trailing newline (realtime `%0A`).
4. **Rotate the Supabase service-role key** - pre-`.vercelignore` snapshots may hold it.
5. **Supabase dashboard → Authentication → URL Configuration:** Site URL `https://jadrealty.vercel.app` + redirect URL `.../auth/reset-password`.
6. **Privacy policy content: DONE this session** (`20261020000003` upserts canonical `privacy` policy; login consent link resolves).
7. **Deploy the uncommitted registration work:** commit the 45 files, then `pnpm dlx vercel --prod` (DB side already live and backward-compatible).
7. **Pending-replay update semantics (now implemented):** a re-registration with the same email refreshes the PENDING row. Consider whether a PENDING application should be editable before a decision; a stricter alternative is to keep replay unchanged and just show `replayed: true` without mutating (current implementation mutates).
8. **Public properties listings: DONE this batch** (frontend-only CMS-records rendering with static fallback; catalog↔CMS sync unchanged).
9. **Registration follow-ups (deliberately out of scope):** `verificationId` binding still dead (accepted, never enforced); gender values not allowlisted server-side; upload-abandon orphans (signed file never saved) need a future reconciliation sweep; max-age 120 / name-60 caps are proposed values, not business-approved. RESOLVED this batch: server password floor now `min(8).max(72)` (shared schema), DOB time bomb fixed with relative dates, consent label stays linked by design (CMS plain text would lose ToS links), address sub-field labels have no CMS keys (stay static).

## Repo map

Root: `C:\Users\SSD-ORLANDO\Documents\Project\jad-realty` (pnpm + Turborepo).

- `apps/web` (`:5173`) - member/public SPA (React 19 + Vite 8). Prod base `/`.
- `apps/admin` (`:5174`) - staff SPA. Prod base `/admin/`.
- `api/` - `api/router.ts` (single Vercel Function), `api/_handlers/**`, `api/_lib/**`
  (auth/rbac/router/cors/money/pipeline/emailjs/verification-code/catalog-cms-sync/…), `api/dev-server.ts` (local :3000).
- `packages/contracts` - DTO types + Zod schemas, single source; now also `contactSubmissionRequestSchema`, `contactInquirySchema`, `programCreate/UpdateSchema`, `policySlugSchema`, `replayed`, `referrerId`, plus `registration-validation.ts` (normalize-then-validate core: names/MI/phone/DOB/address), location ref schemas, phone metadata on public config.
- `api/_lib/` now also `intake-validation.ts` (phone/address guards with injected lookups) and `storage.ts` (shared storage-sync helpers: URL→key extraction, exact-key + prefix removal, best-effort/never-throw).
- `packages/config`, `packages/shared` - typed env; framework-free utils.
- `packages/mock`, `packages/ui` - test mocks/session fixtures; tokens + shared components (`Spinner`, `notify*`).
- `scripts/` - `prepare-vercel-env.mjs`, `assemble-vercel-output.mjs`.
- `vercel-static/` - assembled deploy output (gitignored).
- `supabase/migrations/` - one idempotent migration per change + header validation queries;
  `supabase/seed.ts` (now seeds `COMMISSION_CLEARING_DAYS` + `slug` + referrer-aware commissions); `supabase/seed-ph-locations.ts` (`pnpm seed:locations --file/--url [--dry-run]`, fail-closed PSGC import, chunked upserts); `supabase/security/rls_invariants.sql`
  (empty = PASS, except documented `is_staff_user` §5; Q2/Q3 findings are pre-existing managed-project state).
- `docs/` - SSOT; **never reformatted** (`.prettierignore`). Largely stale; `AGENTS.md` + this file + code are authoritative.

## Stack / conventions (do not violate)

- Money is exact-decimal **strings**; format with `@jad/shared`; no float math anywhere (including TS repair math - use integer/BigInt). `multiplyMoney` mirrors PG `round(x,2)` half-away.
- `to_char(x, 'FM…990.00')` renders zero as **`0.00`** - always use the `…990.00` mask. Bit us live on the cron endpoint (500) before the fix.
- All HTTP via typed clients (`request`/`requestList`/`requestPage`/`requestListEnvelope`) validated against `@jad/contracts`; no ad-hoc `fetch` in features.
- Authenticated users: SELECT-only RLS on identity/member tables; all writes via service-role handlers or `SECURITY DEFINER` functions. `Role` reads are restricted to `slug`/`name`.
- Money transitions are atomic DB functions (`withdraw_*`, `sale_qualify`, `commission_clear*`, `sale_delete`) - single transaction, wallet row-locked, ledger + wallet + audit in one unit; EXECUTE restricted to `service_role`. Never re-implement money state changes as sequential API writes.
- **Contact inquiries** are service_role-only (`ContactInquiry`), triaged via `cms` module (the queue, not email, is delivery).
- **Email verification codes** are service_role-only (`EmailVerification`: `code_hash` HMAC-SHA256 with `EMAIL_OTP_PEPPER` or service key, 15-min TTL, max 5 attempts, 60s cooldown, 5/hour cap; `listUsers` scan is bounded 300).
- **Program lifecycle:** `isActive` (soft retire); public list is active-only (`using ("isActive")` + handler `eq isActive=true`); `POST/PATCH /admin/programs` are `super_admin`.
- **Policy identity:** `slug` is the stable public URL key; `findPolicy` matches slug/id/`type` case-insensitively; footer/consent links hide when the slug/type is absent.
- **Sales referrer:** `Sale.referrerId` (members only) + `referrerName` snapshot; referrer pickable from `useDirectReferrals()`; payee on qualify is picked referrer → else seller's `Member.sponsorId` → else skipped; pending estimate counts both picked-referrer sales and downline-with-no-referrer sales.
- **Registration validation is normalize-then-validate, single-sourced in `@jad/contracts`** (`registration-validation.ts`): client step validators delegate to the same primitives the Zod schemas enforce; lengths/formats always apply to normalized values, never raw input or `maxlength`. Server is the boundary (client is UX-only); persisted drafts are untrusted (shape-guarded, re-validated on submit).
- **Phone:** canonical E.164 storage (`+<dial><national>`); curated per-country rules from `countries` (generic 7-15 fallback); PH = `09…`/`+639…`, 10-digit NSN starting 9.
- **Address:** legacy `address` column = street line (optional); hierarchy in `province/city/barangay_code+name` (PH, codes + server-resolved snapshots) or `region_name`/`city_name` (others); independent cities self-parent (`provinceCode == cityCode`); membership re-checked server-side on every write; `mapRegistrationRow`/`mapMemberRow` pass columns through.
- Migration discipline: one migration per change, idempotent; run the validation queries in each file header before applying; include a down note. `.sql` files are hand-formatted (no SQL prettier in repo). Apply with `pnpm db:migrate` (root `.env` `DATABASE_URL`).
- CSS Modules per component; tokens in `@jad/ui`.
- Tests colocated `*.spec.ts(x)`; web `renderWithProviders`/`mockFetchRoutes`; admin `installMockApi()` (install + `server.install()`/`restore()` per test).
- Secrets never committed; root `.env` gitignored AND excluded from Vercel uploads. Do not paste keys into chat/docs.
- Deployment is Vercel + Supabase, single-origin, one API function (Hobby cap 12); see above.

## Verification status

- `pnpm typecheck`: clean per workspace at each step this session (api/admin/web/contracts/shared/ui). Full `turbo run build` + `vercel build` NOT re-run this session - run before the next `vercel --prod` (expect exactly 1 function; `includeFiles: packages/**` untouched).
- Tests (subsets run green this session; full suites NOT re-run): api **635/635** full (+5 commission-preview, +2 redeem-expiry/throttle, +2 assign throttle/standing, +1 offline saleReferenceId change covered by existing round-trips); contracts **233/233** (+payout methods/Luhn/per-method cases, +voucher expiry/MAX_VALIDITY_DAYS cases); shared **28/28** (+formatPoints, +expiry overflow); admin vouchers **42/42** (dialog 7 incl. new, page specs incl. Points swap); web withdrawal **11/11**, submit **11/11**, payout-account **8/8**, profile **7/7**, six hub pages **17/17**. Older counts below are stale (pre-10-02).
- `pnpm db:migrate` applied `20261023000001` + `20261023000002` live (header queries + read-only probes green, re-run is a clean no-op: 79 recorded). `rls_invariants.sql` NOT re-run this session (no RLS/table changes - only CHECK widen + function body).
- Tests: api **619/619** (was 602: +member-codes 4, mapper 3, registration-ids 4, register read-back, moderation validation/idempotency/throttle/program/suffix); contracts **224/224** (+memberCode/registrationId schemas); admin **589/589** full suite (memberForm 11, dialog validation 20, queue search/ID, fixtures) - CMS flake did NOT appear this round; web **470/470** full + auth **124/124** (contracts re-export safe). `pnpm typecheck` 8/8, web eslint clean. Known flakes unchanged (CMS parallel-load, rerun if red once).
- `pnpm db:migrate` - idempotent; this session applied `policy_privacy_seed` + `phone_country_rules` + `ph_location_tables` + `registration_address_columns` (header queries verified: privacy=1 row, PH/US/GB/SG metadata correct, 0 orphans); `rls_invariants.sql` re-run: #1/#4/#6/#7 empty, #5 only documented `is_staff_user` (+ pre-existing trigger helpers), #2/#3 pre-existing managed grants with new tables matching the baseline pattern (SELECT-only policies, no new exposure).
- `pnpm seed:locations` - **82 provinces / 1634 cities / 42046 barangays, 0 orphans** (PSA Q4 2024 via transient `@ph-dev-utils` packages - NOT added to package.json; Manila correctly province-null).
- Live probes (local dev-server + curl): `GET /locations/provinces|cities|barangays` → 200 with real rows, contract shape; web mock + `RegisterPage` full-submit flow (hierarchy select → payload asserts) green.
- Live probes: `GET /health` → `{ok:true,db:"ok"}`; `GET /api/v1/crons/commission-clearing` → `{cleared,total,windowDays}`; `GET /api/v1/policies` → `{data[0].slug:"terms"}` (was `"policies"`). Rolled-back live test proved the full clear path (AVAILABLE + wallet + CREDIT ledger, self-healing pending recompute). `POST /sales` with `referrerId` → referrer earns; `GET /sales/:id` as referrer → 200 (not 404); orphan count 0.
- Live probes (this session, local dev-server + curl against hosted DB): `GET /locations/provinces?countryCode=PH`, `/cities?provinceCode=0128`, `/barangays?cityCode=012801` → all 200 with real PSGC rows in contract shape.
- Vercel function logs: `pnpm dlx vercel logs <deployment-url>` (exact `jad-realty-<hash>-orlando-workspace-afhomes.vercel.app` URL from `vercel ls --prod`).
- Admin queues: `GET /admin/queues` → `{"registrations":1,"salesReadyToQualify":1,"sales":…, "members":2,"withdrawals":0}`.

## Useful commands

- Local: `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format`,
  `pnpm seed`, `pnpm db:migrate [--mark-existing]`, `pnpm seed:locations --file/--url [--dry-run]`.
- Local API: `pnpm exec tsx api/dev-server.ts` (:3000; Vite proxies `/api`).
- Deploy: `pnpm dlx vercel --prod` (login/link already done; `vercel ls --prod` to list).
- Single spec: `pnpm --filter @jad/admin exec vitest run <path>` (same per workspace).
- Read-only prod DB check: `node -e` with `pg` + root `.env` `DATABASE_URL` (SELECTs only; wrap write-tests in `BEGIN`/`ROLLBACK`).

## Session notes for the next agent

- **Tree is CLEAN on `develop` (10-02 session committed in small steps) - but NOTHING this session is deployed.** Next: `pnpm typecheck` (all) + `pnpm exec turbo run build` + `vercel build` (expect 1 function), then `pnpm dlx vercel --prod`. Prod still predates even the member-ID batch, so new UI shows `—`/old shapes until redeployed. Restart `api/dev-server.ts` too (no hot-reload).
- **New-spec env convention:** every api handler spec must `vi.stubEnv('SUPABASE_URL'/'VITE_SUPABASE_ANON_KEY'/'SUPABASE_SERVICE_ROLE_KEY', …)` in `beforeEach` (see `sales.spec.ts:121-124`) - without it everything 500s with "Supabase not configured". Throttle specs additionally need `resetRateLimits()` (buckets are module-global) + `VOUCHERS_*_RATE_LIMIT` overrides.
- **Router order matters:** exact branches (e.g. `/sales/commission-preview`) must sit BEFORE regex branches (`/sales/:id`) or the param route swallows them.
- **`SelectField` (web) now takes `disabled` + `hidePlaceholder`** - used by the referrer picker (no empty option, disabled with zero choices).
- **Mock `fetch` + React Query fallback race** (existing note) also bit the preview hook: settle on absence/presence with `waitFor`.
- **jsdom native date inputs don't take keystrokes** - use `fireEvent.change` for date values in admin specs.
- **Controlled-select + `rerender` can replace the DOM node** - a previously captured element goes stale while the live tree is correct; re-query inside `waitFor` (seen in the sale-dialog late-catalog test).
- **Shared mock stores bite again:** admin VouchersPage specs share the voucher store across tests (an edit test renames the seed) - assert on values unique to the test (e.g. `5,000 Points`), never on seed text another test mutates.
- **Voucher code format is now random** (`JAD-VCH-<year>-<6×A-Z0-9>`); only exact-match lookups and shape regexes are safe in specs - never assert a specific generated code.
- **Legacy `OTHER` payout method stays readable everywhere** (read schemas + DB CHECK keep it; writes reject it). Admin filter keeps "Other (legacy)".
- **`isValidCardNumber` (Luhn) is single-sourced in `@jad/contracts`** - client and server refine share it; test PANs: `4111111111111111`/`5500000000000004`/`378282246310005` valid.
- **Voucher security report** lives OUTSIDE the repo at `C:\Users\SSD-ORLANDO\AppData\Local\Temp\opencode\voucher-security-report.md` (V1-V4 marked remediated there).
- **Intake `buildPhoneRule` takes SNAKE_CASE keys** (`dial_code/phone_national_min/...`), contracts `toPhoneRule` takes camelCase - passing the wrong shape silently yields generic E.164 (no error). Caused a live 201-on-invalid this session; fixed + regression-tested. Always run `pnpm typecheck` immediately after touching either (excess-property check catches it).
- **Supabase `client.from` must never be detached:** `SupabaseClient.from` reads `this.rest` - `const f = client.from; f()` throws `reading 'rest'` (killed all PH registrations). Always `client.from.bind(client)` (see `auth.ts:227,259`). BUT `(client.from as T)(args)` (parenthesized member call, no assignment) is SAFE - verified live before nearly "fixing" working `verification-code.ts`. Mocks with plain closures never catch this - regression specs need a receiver-dependent fake.
- **Per-category rate architecture:** `PropertyCategory.direct_rate/referral_rate` is the single source; globals are fallback-only; `Commission` snapshots immutable (never recalculate); `sale_qualify` joins via `Property`; `resolveCategoryRates` (3 queries any batch) serves wallet/previews/repair/endpoints. Full money path at changed rates never live-probed (would pay real money) - scratch-sale or BEGIN/ROLLBACK probe before shipping.
- **`?raw` on `.module.css` returns the proxy object, not source** - stylesheet-guard specs must `readFileSync` via `node:fs`.
- **ESLint exists only in `apps/web`** (api/admin/contracts have no eslint script) - typecheck + tests cover them. RegistrationForm + mock/handlers lint errors are pre-existing on HEAD (proven via stdin lint); don't chase.
- **DOB time bomb resolved** (old note retired): `auth.spec` uses runtime today/tomorrow now.
- **Uncommitted-batch deploy preflight** (for the coming `vercel --prod`): `pnpm typecheck` 8/8 was green at handoff; `vercel build` → exactly 1 function expected; `includeFiles: packages/**` untouched.
- **DOB spec time bomb: FIXED this batch** (relative-date rewrite; old "do not chase" note retired).
- **Input-shaping architecture (registration):** sanitizers live in `@jad/contracts` (`sanitizePersonName`, `sanitizeMiddleInitial`, `capitalizePersonName`), applied in `onChange` (covers typing + paste) with native `maxLength` backup; Zod schemas stay the boundary; persisted/tampered drafts bypass shaping and still hit validator errors (by design - covered by tampered-draft spec). Title-case lowercases non-initials (`McDonald` → `Mcdonald`) - accepted per requirement, flag if product objects.
- **Phone dial follows verified country** (user decision): dropdown never mutates `countryCode`; server re-validates against verified country, mismatch surfaces verbatim. `sanitizeNationalInput` strips embedded dial/trunk only on overflow (US dial `1` vs nationals starting with `1` - length-gated strip).
- **react-hooks lint forbids ref reads during render** (v7 `no-ref-during-render` is error): suggestion-chosen state uses `useState`, not a ref. `setDraft`-omitting effects match existing `exhaustive-deps` warning style.
- **URLSearchParams encodes spaces as `+`** (spec asserted `%20` once - fixed).
- **`mockFetchRoutes` strips query strings** (pathname-only matching) - suggest specs mock by path.
- **Prettier `--check` fails repo-wide on untouched files** (CRLF line endings) - do not `--write` (would churn everything).
- **PSGC refresh:** `seed-ph-locations.ts` is upsert-safe; re-run with a fresh PSA extract quarterly. Provenance this round: `@ph-dev-utils/core@0.5.0` + `@ph-dev-utils/psgc-barangays@0.1.0` (PSA Q4 2024), used transiently - NOT in package.json.
- **Login account is `jad@admin.com`** (password in root `.env`) on the deployed Supabase.
- **The `includeFiles` must remain `packages/**`** - narrowing crashes the deployed function.
- **Hobby cron limit: max 2 daily crons** - hourly schedules are rejected at deploy validation; keep `/health` + `/crons/commission-clearing` daily.
- **`VITE_WEB_URL`/`VITE_ADMIN_URL` are auto-derived** from `VERCEL_PROJECT_PRODUCTION_URL`; never set them in Vercel env, and never log into an old per-deployment URL (cross-origin loop).
- **`sale_qualify` must stay flat** `{"sale":{…}}` - the nesting bug (`sale.to_jsonb`) silently breaks every admin confirm; defensively unwrap in the handler as well.
- **Commission payee:** picked `Sale.referrerId` wins else `Member.sponsorId` (never both, referrer wins); pending estimate counts both picked and downline-with-no-referrer; sponsor-link repair must skip `referrerId IS NOT NULL` to avoid double-pay.
- **Pending pipeline is expectation-only** - a downline sale that later gets a referrer won't pay the sponsor; docs/BR-COM-002 now notes the fallback but the docs are still largely stale.
- **`sale_delete` now blocks** `AVAILABLE` commissions; deletion is not a reversal workflow for credited sales. Don't add one without a product decision.
- **Archived mapping** built with `mapMemberRow` + `?` fallbacks; ban/unban is best-effort (pre-existing JWTs stay valid until expiry) — app-layer gates are the enforcement point.
- **Cached Supabase clients** (`serviceClient()`/`anonClient()` in `api/_lib/rest.ts`) must keep call-inferred types via the unannotated `make*Client` factories - `ReturnType<typeof createClient>` breaks `.from()` typing (`never[]`); bare `SupabaseClient` is fine locally but keep the factory form (it passes both).
- **Draft persistence is v2:** `jad:register:draft:v2` with shape guard + v1 self-cleanup; test setup removes v2 in afterEach (missing this caused cross-test pollution once - check first when register specs flake).
- **rAF-timing in scroll/message tests:** assert scroll position inside `waitFor` (frames land after paint); stub rAF sync only in hook unit specs.
- **SearchableSelect contract:** free text reverts on blur, commits only listed options; focus clears a filled field to browse; highlight clamped on read (no reset effects - lint forbids set-state-in-effect, render-time sync uses state form).
- **Zod v4:** `.partial()` is forbidden on refined schemas - keep a plain base + apply `superRefine` per derivation (see `auth.ts` `registerBaseSchema`).
- **Mock `fetch` + React Query fallback race:** `usePolicyLinks`-style fallbacks render before mocked fetches resolve - settle with `waitFor` on absence/presence, and use link dumps to find duplicate sources.
- **New-handler specs need storage mocks:** `remove`/`list` must exist on mocked storage or the best-effort helpers swallow TypeErrors (tests still pass but assert nothing); `ilike` must exist where handlers use it.
- **Loading states:** `actionPending` + `InFlight` ref + `confirmDisabled/confirmLoading` + cancel/backdrop lock while pending; purge Save/Archive/Deactivate toggles all use it now; SaleDetailPage delete is `deleteMut.isPending`, Registration accept is gated, SaleFormDialog has `if (isPending) return`, MembersPage has `archivePending/restorePending`.
- **EmailJS:** server-side via `api/_lib/emailjs.ts` REST `https://api.emailjs.com/api/v1.0/email/send` (`user_id` = public key, `accessToken` = private key when present, `template_params: {to_email,to_name,verification_code,app_name,expiry_minutes}`); requires **Allow non-browser** + correct `EMAILJS_SERVICE_ID/TEMPLATE_ID/PUBLIC_KEY` (and redeploy; env changes do not apply to existing deployments).
- **Notifications:** success is a centered `toast: {position:'center'}` (`jad-swal-container` in `base.css`), errors/warnings are centered modals; success was a top-end toast that set `aria-hidden` and broke `findByRole` assertions (nowToast center avoids the `aria-hidden` trap). Guards use `min-height:70vh; place-items:center`.
- **Shared mock stores are module singletons** - tests that mutate them affect later tests; reset in `beforeEach` (added `resetRegistrationStore`/`resetMockMemberLifecycle`).
- **jsdom has no canvas:** QR upload-decode specs stub `Image` + `getContext` and use `fireEvent.change`.
- **Migrations applied (all live):** `contact_inquiries`, `email_verification_codes`, `policy_slug` + `policy_realtime` + `policy_type_normalize` → known legacy `type='policies'` → `terms`, `program_is_active`, `sale_qualify_immediate_credit` + `referrer_model` + `sale_delete_guard` + `orphan_cleanup` + `sponsor_fallback`, `category_commission_rates` (rate columns + global backfill) + `sale_qualify_category_rates` (per-category join, global fallback), `member_code` + `member_code_mem_format` (live member `JAD-MEM-0003`, seq ready), `registration_seq_id` (queue empty, next `JAD-REG-0001`).
- **Policy identity is `slug`:** canonical deep links `terms`/`privacy`/`guidelines`; admin `Type` is now a select (syncs slug when empty), never a free text `policies` again.
- **Catalog ↔ CMS properties** is a true bidirectional sync for linked listings (`catalogId`), exact-decimal price gate, version bump + realtime broadcast, and cross-cache invalidation (`['admin','properties']` ↔ `['cms','properties']`).
- **Backlog:** email `EMAILJS_SERVICE_ID` correctness (the 400 "service ID not found" + 403 "non-browser disabled"), `EMAILJS_PRIVATE_KEY` optional, `EMAIL_OTP_PEPPER` optional, privacy policy content, rate limiting, staging-vs-public decision, anon-key newline cleanup, service-role rotation, and making the public properties listings (currently static `content/properties.ts`) dynamic from the catalog/CMS (separate).

