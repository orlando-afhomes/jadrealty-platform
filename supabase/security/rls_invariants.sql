-- RLS invariant audit (Phase 3B) — run read-only in the SQL editor / CI after
-- every migration batch. Fails (returns rows) if any anon/authenticated policy
-- can write, or if authenticated can write identity tables at the privilege
-- level. Empty result = PASS.

select schemaname, tablename, policyname, cmd, roles
from pg_policies
where roles && array['anon', 'authenticated']
  and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where grantee in ('anon', 'authenticated')
  and table_name in ('Member', 'MemberRole', 'Role')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
