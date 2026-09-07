-- ============ metrics_daily.escalations (Checkpoint E3) ============
-- Why this column exists:
--
-- §5.7 asks the weekly report to show escalations. The cockpit could count
-- them from `events` directly, and that would be wrong: §9 says two systems
-- computing the same number differently is a bug generator, and a
-- client-facing report is the worst possible place to discover that the
-- cockpit and the nightly derivation disagree about a week.
--
-- So it derives in the same place as everything else. metrics_daily.py counts
-- `lead.escalated` in the client's own day window, exactly as it already
-- counts lead.created, lead.qualified and viewing.booked.
--
-- The second reason is recoverability. The derivation is re-runnable over any
-- date range, so a day missed because the nightly job did not run can be
-- rebuilt from the event log. A number counted inline at request time cannot
-- be — it is only ever as good as the moment it was asked for.
--
-- NOTE ON GRANTS: unlike 0005, none are needed. Table-level privileges cover
-- columns added later, and 0002 already granted service_role DML on every
-- table in the schema. A new TABLE would need the explicit grant; a new
-- COLUMN on an existing table does not.

alter table public.metrics_daily
  add column if not exists escalations integer default 0;

-- Backfilled by re-running metrics_daily.py over the affected range rather
-- than by an UPDATE here: the derivation is the single definition of this
-- number, and a SQL backfill would be a second one.
