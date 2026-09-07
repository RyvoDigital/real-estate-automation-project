-- ============ health_runs (Checkpoint E3) ============
-- Why this table exists:
--
-- healthcheck.sh runs from cron every 10 minutes and writes to
-- /var/log/ryvo-health.log and /var/lib/ryvo/health.state on the server. The
-- cockpit runs on Vercel and can read neither, so §5.6 -- "the twelve checks,
-- visible rather than only alerting on failure" -- has no data source without
-- somewhere shared to put the result.
--
-- THE SELF-REFERENCE IS DELIBERATE AND HAS A CONSEQUENCE. One of the twelve
-- checks is "Supabase reachable". When Supabase is down the publish fails too,
-- so the health SCREEN cannot report a Supabase outage -- it can only stop
-- updating. That is the correct behaviour and not a gap, because §5.6 already
-- requires a stale screen to look stale rather than reassuring. Email remains
-- the alerting channel that does not depend on the thing it watches (§1 rule
-- 4): a check that needs the monitored system in order to report on it tells
-- you nothing on the day it matters.
--
-- The screen therefore shows the last run's time ABSOLUTELY, not only as
-- "5 minutes ago" -- a relative time computed from a stale page is itself
-- stale, which is the same failure as everything else in this log.

create table if not exists public.health_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  ok boolean not null,
  passed text[] not null default '{}',
  failed text[] not null default '{}',
  duration_ms integer,
  host text,
  created_at timestamptz default now()
);

-- The only query the cockpit makes is "the most recent run".
create index if not exists health_runs_ran_at_desc
  on public.health_runs (ran_at desc);

-- Deny by default, exactly like the other nine tables: RLS on, zero policies.
-- Nothing reaches this except the service_role key, server-side.
alter table public.health_runs enable row level security;

-- REQUIRED, and the reason is in 0002: Supabase's ALTER DEFAULT PRIVILEGES
-- gives a table created by the `postgres` role (which is what the session
-- pooler connects as) only TRUNCATE/REFERENCES/TRIGGER/MAINTAIN for
-- service_role -- no select/insert/update/delete. Table grants are evaluated
-- BEFORE row level security, so service_role's BYPASSRLS attribute does not
-- help. Without this the health POST fails 42501 "permission denied", which
-- would look exactly like a health check that had simply stopped running.
grant select, insert, update, delete on public.health_runs to service_role;

-- anon and authenticated are granted nothing, as everywhere else.
