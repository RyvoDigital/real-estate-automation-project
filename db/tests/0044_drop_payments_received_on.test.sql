-- The cases of 0044, SEEN. Paste the whole file into the SQL editor.
-- Each case is its own transaction and rolls back. Nothing survives.
--
-- 🔴 CASE 3 IS THE ONE NOT TO SKIP. Cases 1 and 2 prove it REFUSES. Case 3
-- proves it ACCEPTS the resting state — a migration whose precondition is
-- written one test too tight refuses always, and both refusal cases still
-- pass. 0036 was caught by exactly this.
--
-- EXPECTED:
--   1  ERROR   REFUSING: payments holds 1 row(s), 1 of them with received_on set
--   2  ERROR   REFUSING: payments.settled_on does not exist …
--   3  NOTICE  'Preconditions proven …' then the column is gone, and settled_on remains

-- ══ CASE 1 — a row present must refuse, and NAME the count ═════════════════
begin;
\echo '--- case 1: rows present'
insert into public.payments (automation_client_id, kind, amount_eur, invoiced_on, received_on, recorded_by)
select id, 'setup', 1200.00, '2026-10-01', '2026-10-20', 'proof' from public.clients limit 1;
\i db/migrations/0044_drop_payments_received_on.sql
-- expect: ERROR  REFUSING: payments holds 1 row(s), 1 of them with received_on set …
--         'if any disagree, that disagreement is the finding, not an obstacle to it'
rollback;

-- ══ CASE 2 — dropping the duplicate must refuse if it is the ONLY answer ═══
-- 🔒 The case that stops this migration becoming a way to lose the fact it is
-- protecting. If settled_on were gone, received_on would be the only record
-- that money arrived, and dropping it would delete the answer rather than a
-- duplicate of it.
begin;
\echo '--- case 2: settled_on missing'
alter table public.payments drop column settled_on;
\i db/migrations/0044_drop_payments_received_on.sql
-- expect: ERROR  REFUSING: payments.settled_on does not exist, so dropping
--         received_on would leave NO column recording that money arrived.
rollback;

-- ══ 🔴 CASE 3 — THE RESTING STATE. It must ACCEPT and drop. DO NOT SKIP ════
begin;
\echo '--- case 3: the resting state'
\i db/migrations/0044_drop_payments_received_on.sql

do $$
declare n_recv bigint; n_settled bigint;
begin
  select count(*) into n_recv from information_schema.columns
   where table_schema='public' and table_name='payments' and column_name='received_on';
  select count(*) into n_settled from information_schema.columns
   where table_schema='public' and table_name='payments' and column_name='settled_on';

  if n_recv <> 0 then
    raise exception 'REFUSING: received_on is still present. The drop did not run.';
  end if;
  if n_settled <> 1 then
    raise exception 'REFUSING: settled_on is gone. The wrong column was dropped.';
  end if;
  raise notice 'received_on dropped, settled_on intact. One column, one fact.';
end $$;
rollback;

-- ---------------------------------------------------------------------------
--   npm run proof:bless 0044-drop-payments-received-on
-- then apply. 🔴 If case 3 raises, DO NOT APPLY.
