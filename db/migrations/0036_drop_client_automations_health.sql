-- ============ dropping client_automations.health and last_run_at ============
--
-- ⚠️ DESTRUCTIVE, and alone. Same treatment as 0032 and for the same reason:
-- a drop folded into a batch is a drop whose proof gets skipped.
--
-- ---------------------------------------------------------------------------
-- 🔴 ORDER OF OPERATIONS — READ THIS FIRST
-- ---------------------------------------------------------------------------
-- The cockpit's onboarding wrote `health: 'unknown'` on insert
-- (cockpit/src/lib/actions.ts). That line is REMOVED IN THE SAME COMMIT AS THIS
-- FILE and must be DEPLOYED BEFORE this migration runs.
--
--   code first, then migration   harmless: the column keeps its default,
--                                nothing writes it, nothing reads it
--   migration first, then code   CLIENT CREATION IS BROKEN in between —
--                                PostgREST rejects an insert naming a column
--                                that no longer exists, and the failure lands
--                                on the operator onboarding an agency
--
-- Pushing deploys the cockpit, so the deploy has already happened by the time
-- anyone reads this. Confirm it anyway before applying:
--
--   create a client in the cockpit and see the row appear. If that works, the
--   deployed build no longer names `health`, and this is safe to run.
--
-- ---------------------------------------------------------------------------
-- WHY THEY GO
-- ---------------------------------------------------------------------------
-- 0001 added both as the monitoring spine for a per-client health view:
--
--   health text not null default 'unknown'   -- healthy | degraded | failing | unknown
--   last_run_at timestamptz
--
-- NOTHING HAS EVER WRITTEN TO EITHER. Every `client_automations` access in the
-- repository selects `id`, `config`, or the `automations` join — the n8n
-- workflows included — and the single insert set `health` to the column's own
-- default. So `health` reads 'unknown' for every row and always has, and
-- `last_run_at` is null for every row and always has been.
--
-- They are not merely unused. They are a FALLBACK ASSERTING SOMETHING (lesson
-- 13): a column named `health` that always says 'unknown' claims "nobody has
-- checked", which is true today and stops being true the first time anyone
-- writes to it once — at which point every other row still says 'unknown' and
-- now means "checked, and fine" to a reader who cannot tell the two apart.
--
-- §3.17 asks for a per-client health rollup and these are the obvious columns
-- for it to read. They are the wrong source. Per §4.7 — DERIVE RATHER THAN
-- INFER — the rollup comes from artefacts:
--
--   is it running     the most recent automation_runs row per client_automation
--   did it fail       automation_runs.status = 'error', and run.errored events
--   did it do nothing invariant.violated / invariant.check_failed events
--   is it blocked     each gate's own refusal — thresholds_not_configured,
--                     policy_not_confirmed, no_ledger_basis
--
-- Same shape as 0032: the right idea in the wrong home, cheap to write, wrong
-- to keep, and two sources of truth is the thing this project refuses
-- everywhere else. Lesson 15 is unambiguous about which of the two keeps
-- answering confidently: the stale one.
--
-- See docs/cockpit-design-brief.md §3.6.
--
-- ---------------------------------------------------------------------------
-- 🔴 IT PROVES THEY ARE EMPTY, AND "EMPTY" IS NOT THE SAME TEST TWICE
-- ---------------------------------------------------------------------------
-- This is where copying 0032 mechanically would produce a guard that cannot
-- work. 0032's five columns were all NULLABLE, so `is not null` meant "somebody
-- put something here". Here:
--
--   last_run_at   nullable, no default          -> `is not null` is right
--   health        NOT NULL default 'unknown'    -> `is not null` matches EVERY
--                                                  ROW and would abort always,
--                                                  which is a guard that fires
--                                                  whatever the truth is, and
--                                                  therefore says nothing
--
-- A column that cannot be null cannot be tested for emptiness by nullness. The
-- question for `health` is "has anything ever recorded a real value", so the
-- test is `is distinct from 'unknown'`. Written as IS DISTINCT FROM rather than
-- <> deliberately: it stays correct if the column is ever made nullable, where
-- <> would silently skip the null rows — an absence excluded from the count
-- that is supposed to find absences (lesson 5k, from the other direction).
--
-- Counted separately so the exception NAMES what it found. "The columns are not
-- empty" sends somebody looking; "three rows have a health and one has a
-- last_run_at" tells them what they are about to lose.

do $$
declare
  n_health   bigint;
  n_last_run bigint;
  total      bigint;
begin
  select count(*) into n_health
    from public.client_automations
   where health is distinct from 'unknown';

  select count(*) into n_last_run
    from public.client_automations
   where last_run_at is not null;

  total := n_health + n_last_run;

  if total > 0 then
    raise exception
      'REFUSING TO DROP: these columns are not empty. '
      'client_automations.health (anything other than ''unknown'')=%, '
      'client_automations.last_run_at (not null)=%. '
      'Nothing has been dropped. Something has started writing to a column this '
      'migration was told nothing writes to — find out WHAT before dropping it, '
      'because the derived rollup (improvements §4.7) does not read these and '
      'would silently lose whatever that writer knows.',
      n_health, n_last_run;
  end if;

  raise notice 'Both columns are empty — proven, not assumed. health is ''unknown'' on every row and last_run_at is null on every row. Dropping.';
end $$;

alter table public.client_automations
  drop column if exists health,
  drop column if exists last_run_at;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   -- the two columns are gone
--   select column_name from information_schema.columns
--    where table_name = 'client_automations'
--      and column_name in ('health', 'last_run_at');
--   -- expect: no rows
--
--   -- and the NEIGHBOURS survived. A migration that dropped too much would
--   -- pass the check above perfectly. (0032's lesson, and 7b: a constraint is
--   -- proved by the cases it must LEAVE ALONE.)
--   select column_name from information_schema.columns
--    where table_name = 'client_automations' order by ordinal_position;
--   -- expect: id, client_id, automation_id, enabled, config, n8n_workflow_id,
--   --         created_at  — seven columns, and `config` above all, because it
--   --         holds every threshold, area and handoff note in the system
--
--   select count(*) from public.client_automations;   -- expect: unchanged
--   select id, enabled, config is not null from public.client_automations;
--
--   -- the unique constraint is untouched
--   select conname from pg_constraint
--    where conrelid = 'public.client_automations'::regclass;
--
-- AND THE THING THE ORDERING SECTION IS ABOUT — creating a client still works:
--
--   Onboard a test client through the cockpit and see the clients row AND the
--   client_automations row appear. Delete it afterwards. A migration that is
--   correct in the database and breaks the one screen that writes to the table
--   is not a correct migration.
--
-- ---------------------------------------------------------------------------
-- THE ABORT, PROVEN RATHER THAN TRUSTED
-- ---------------------------------------------------------------------------
-- Run this BEFORE the migration, in a transaction you roll back, or the guard
-- is a claim nobody has tested. TWO cases, because the two columns have
-- different predicates and one of them is the one that could be written wrong:
--
--   -- case 1: last_run_at, the ordinary nullable one
--   begin;
--   update public.client_automations set last_run_at = now()
--    where id = (select id from public.client_automations limit 1);
--   -- now run the do-block above on its own
--   -- expect: REFUSING TO DROP … health…=0, … last_run_at (not null)=1
--   rollback;
--
--   -- case 2: health, the NOT NULL one — this is the case that proves the
--   -- predicate is right rather than merely present
--   begin;
--   update public.client_automations set health = 'healthy'
--    where id = (select id from public.client_automations limit 1);
--   -- now run the do-block above on its own
--   -- expect: REFUSING TO DROP … health (anything other than 'unknown')=1 …
--   rollback;
--
--   -- case 3, AND DO NOT SKIP IT: the abort must NOT fire on the resting
--   -- state. A guard that fires on everything is as useless as one that fires
--   -- on nothing, and `is not null` on a NOT NULL column would pass cases 1
--   -- and 2 and fail this one.
--   -- run the do-block with nothing modified
--   -- expect: NOTICE  Both columns are empty — proven, not assumed …
--   --         and NO exception
