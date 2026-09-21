-- ====== health_runs.n8n_api_key_exp: when the deploy key lapses ======
--
-- 🔴 NOT APPLIED. Manuel runs this by hand in the Supabase SQL editor, then runs
-- db/tests/0051_health_runs_n8n_api_key_exp.test.sql (expected verdicts are in
-- that file). Case 5 goes PASS only after the next health check has run (every
-- 10 minutes).
--
-- Why (21 Sep 2026): deploys now go through n8n's public API with N8N_API_KEY
-- (infra/scripts/n8n_api_deploy.py). A lapsed key blocks every deploy.
-- healthcheck.sh reads the key's own JWT exp claim on the server and publishes
-- it here, for the Expiries screen (brief §2.3, "Ryvo's own"). It also FAILS
-- the health check at <= 7 days, which sends the ordinary alert email.
--
-- Until this is applied, healthcheck.sh's first POST is refused with 400 (an
-- unknown column), and it retries without the field. Nothing is lost except the
-- date.
--
-- Nullable on purpose: every row before this one has no value, and a key that
-- cannot be read is published as null, never as a made-up date.

begin;

alter table public.health_runs
  add column if not exists n8n_api_key_exp timestamptz;

comment on column public.health_runs.n8n_api_key_exp is
  'When the n8n API key used for deploys expires, from its own JWT exp claim, read by healthcheck.sh on the server. Null = not readable or not published. Never a guess.';

commit;
