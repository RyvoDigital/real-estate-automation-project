-- ============ service_role grants ============
-- Why this migration exists:
--
-- Supabase configures ALTER DEFAULT PRIVILEGES so that tables created by the
-- `postgres` role grant only Dxtm (TRUNCATE / REFERENCES / TRIGGER / MAINTAIN)
-- to anon, authenticated and service_role -- NOT select/insert/update/delete.
-- Only tables created by `supabase_admin` get full DML by default.
--
-- 0001 was applied over the session pooler, which connects as `postgres`, so
-- every table landed without DML privileges for service_role. The REST API
-- returned: 42501 "permission denied for table clients".
--
-- Table GRANTs are evaluated BEFORE row level security, so the fact that
-- service_role carries the BYPASSRLS attribute does not help -- the explicit
-- grant is still required.
--
-- anon and authenticated are deliberately granted NOTHING. v1 has no
-- browser-side data access; all reads/writes go through the server using the
-- service_role key (n8n now, Next.js server actions later). This preserves the
-- deny-by-default posture that 0001 established by enabling RLS with no
-- policies.

grant usage on schema public to service_role;

grant select, insert, update, delete
  on all tables in schema public
  to service_role;

grant usage, select
  on all sequences in schema public
  to service_role;

-- Future objects created by `postgres` in this schema inherit the same grants,
-- so later migrations do not have to repeat this.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;
