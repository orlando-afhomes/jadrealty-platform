# Supabase — Auth foundation (Phase 1 fresh start)

No Prisma. `Supabase Postgres 15+` via `DATABASE_URL`, Auth (`email/password` `admin@jad.local` / `user@jad.local` — passwords from `SUPABASE_SEED_*` env) replaces `MockSessionProvider` `localStorage jad:mock:session` `packages/mock/src/session/MockSessionProvider.tsx:8`.

## Env (see `apps/web/.env.example:16`)

```sh
# public (VITE_ — shipped to client, RLS enforced)
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon>

# server-only (never VITE_, never commit .env)
DATABASE_URL=postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres
SUPABASE_SERVICE_ROLE_KEY=<service_role> # bypasses RLS, seed only
SUPABASE_SEED_ADMIN_PASSWORD=<admin password> # local .env only, never commit
SUPABASE_SEED_USER_PASSWORD=<user password>  # local .env only, never commit
```

Copy `apps/web/.env.example` → `.env.local` for overrides. Never commit `.env*` `AGENTS.md:18`.

## Migrations

`supabase/migrations/20260829000001_auth_foundation.sql` — Phase 1 auth only (no Prisma):
- Creates `Member`, `Role`, `MemberRole` if not exists (id = `auth.users.id` for `auth.uid()`).
- Seeds roles `admin` / `user`.
- Enables `RLS` `Member auth.uid()=id`, `MemberRole` own row, `Role` read for authenticated.
- **CRM tables (`Customer`, `Sale`, `Property`, `Commission`, `Wallet`, etc.) are intentionally left untouched** until CRM phase (Q3).

Apply: `psql $DATABASE_URL -f supabase/migrations/20260829000001_auth_foundation.sql` (idempotent).
Legacy `supabase/migrations/20260828000001_enable_rls.sql` is deprecated — removed during Prisma cleanup.

Later migrations (apply in filename order, all idempotent):
- `20260830000001_cms_contents.sql`, `20260831000002_cms_realtime.sql`,
  `20260831000003_location_verifications.sql`, `20260831000004_countries.sql`
- `20260904000001_staff_roles.sql` — staff `Role` rows (`super_admin`, `finance`, `merchant`)
- `20260905000001_audit_log.sql` — append-only `AuditLog` (service_role writes only)
- `20260906000001_reference_data.sql` — `Program`, `ProgramQuestion`, `SystemConfig`
  (service_role-only), `Policy` (public read)
- `20260907000001_notifications_content.sql` — `Notification` (own + broadcast reads),
  `ContentItem` (published public read), Realtime publication for notifications

## Seed

`pnpm seed` (`tsx supabase/seed.ts:1`) uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) to `auth.admin.createUser` (`admin@jad.local` / `user@jad.local` — passwords from `SUPABASE_SEED_*` env, never committed) + `Role` (`admin`, `user`) + `Member` + `MemberRole`. Run after migrations:

```sh
# root .env (gitignored) must contain:
# SUPABASE_SEED_ADMIN_PASSWORD=...
# SUPABASE_SEED_USER_PASSWORD=...
pnpm seed
```

## Auth scope (Phase 1)

*   Supabase + PostgreSQL + Supabase Auth + TanStack Query only. No Prisma / no ORM.
*   Only `admin` / `user` test accounts. No registration, MFA, password reset, social login, user management UI.
*   CRM/CMS backend intentionally deferred — dashboards are static placeholders.
*   Full RLS/authorization design when CRM modules are connected.

## Security invariants

*   No `VITE_` service key `docs/security/SECURITY.md:97`.
*   No hardcoded passwords — `SUPABASE_SEED_*` env only.
*   Roles resolved authoritatively via `MemberRole` → `Role` (never client-side).
*   Finance invariants (`BI-005`, `BI-008`) deferred — no finance tables mutated in Phase 1.
