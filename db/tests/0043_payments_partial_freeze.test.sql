-- The cases of 0043, SEEN. Paste the whole file into the SQL editor.
--
-- Each case applies 0043 inside its own transaction and rolls back. Nothing
-- survives. Applying it for real is a separate, deliberate act afterwards.
--
-- 🔴 CASE 7 IS THE ONE NOT TO SKIP. Cases 1-6 prove it REFUSES what it should.
-- Case 7 proves it PERMITS the one update the table exists for — filling
-- `received_on` when the money arrives. A freeze that refuses that has made
-- payments useless, and every refusal case still passes.
--
-- EXPECTED, in order:
--   1  ERROR   payment_names_exactly_one_client   (neither party)
--   2  ERROR   payment_names_exactly_one_client   (both parties)
--   3  ERROR   payment_has_happened               (neither date)
--   4  ERROR   payment_received_after_invoiced    (received before invoiced)
--   5  ERROR   payments.amount_eur is frozen
--   6  ERROR   payments.received_on is write-once
--   7  NOTICE  'Receipt recorded: owed 1, paid 1'   and NO exception
--   8  ERROR   payments is not deletable

-- ══ CASE 1 — a payment naming nobody ═══════════════════════════════════════
begin;
\echo '--- case 1: neither party'
\i db/migrations/0043_payments_partial_freeze.sql
insert into public.payments (kind, amount_eur, invoiced_on, recorded_by)
values ('setup', 1200.00, '2026-10-01', 'proof');
-- expect: ERROR … "payment_names_exactly_one_client"
rollback;

-- ══ CASE 2 — a payment naming both ═════════════════════════════════════════
-- Both is a payment counted into two businesses at once, which makes the
-- company's total larger than the sum of its parts.
begin;
\echo '--- case 2: both parties'
\i db/migrations/0043_payments_partial_freeze.sql
insert into public.payments (automation_client_id, web_client_id, kind, amount_eur, invoiced_on, recorded_by)
select c.id, w.id, 'setup', 1200.00, '2026-10-01', 'proof'
  from public.clients c, public.web_clients w limit 1;
-- expect: ERROR … "payment_names_exactly_one_client"
rollback;

-- ══ CASE 3 — neither invoiced nor received ═════════════════════════════════
-- The row that would otherwise sit in the table forever, counted as OWED by
-- anything reading `received_on is null`.
begin;
\echo '--- case 3: a payment that has not happened'
\i db/migrations/0043_payments_partial_freeze.sql
insert into public.payments (automation_client_id, kind, amount_eur, recorded_by)
select id, 'setup', 1200.00, 'proof' from public.clients limit 1;
-- expect: ERROR … "payment_has_happened"
rollback;

-- ══ CASE 4 — money arriving before it was asked for ════════════════════════
begin;
\echo '--- case 4: received before invoiced'
\i db/migrations/0043_payments_partial_freeze.sql
insert into public.payments (automation_client_id, kind, amount_eur, invoiced_on, received_on, recorded_by)
select id, 'setup', 1200.00, '2026-10-10', '2026-10-05', 'proof' from public.clients limit 1;
-- expect: ERROR … "payment_received_after_invoiced"
rollback;

-- ══ CASE 5 — the amount is frozen ══════════════════════════════════════════
begin;
\echo '--- case 5: amount_eur frozen, BY NAME and with both values'
\i db/migrations/0043_payments_partial_freeze.sql
insert into public.payments (id, automation_client_id, kind, amount_eur, invoiced_on, recorded_by)
select '00000000-0000-0000-0000-00000000e101', id, 'setup', 1200.00, '2026-10-01', 'proof'
  from public.clients limit 1;
update public.payments set amount_eur = 1500.00
 where id = '00000000-0000-0000-0000-00000000e101';
-- expect: ERROR  payments.amount_eur is frozen (was 1200.00, refused 1500.00).
--         If the amount was wrong the invoice was wrong: that is a credit note
--         and a new row, not an edit.
rollback;

-- ══ CASE 6 — received_on is WRITE-ONCE ═════════════════════════════════════
-- 🔴 The subtle one. Filling it is allowed; changing it once set is moving a
-- payment between months after the fact — the same defect as backdating an
-- invoice, arriving through the one column that had to stay open.
begin;
\echo '--- case 6: received_on cannot be changed once set'
\i db/migrations/0043_payments_partial_freeze.sql
insert into public.payments (id, automation_client_id, kind, amount_eur, invoiced_on, received_on, recorded_by)
select '00000000-0000-0000-0000-00000000e101', id, 'setup', 1200.00, '2026-10-01', '2026-10-20', 'proof'
  from public.clients limit 1;
update public.payments set received_on = '2026-09-30'
 where id = '00000000-0000-0000-0000-00000000e101';
-- expect: ERROR  payments.received_on is write-once (was 2026-10-20, refused 2026-09-30) …
rollback;

-- ══ 🔴 CASE 7 — THE RESTING STATE. Filling received_on MUST be permitted ════
begin;
\echo '--- case 7: the money arrives, and the freeze allows it'
\i db/migrations/0043_payments_partial_freeze.sql

insert into public.payments (id, automation_client_id, kind, amount_eur, invoiced_on, recorded_by)
select '00000000-0000-0000-0000-00000000e101', id, 'setup', 1200.00, '2026-10-01', 'proof'
  from public.clients limit 1;

-- Owed: invoiced, not received.
do $$
declare owed bigint;
begin
  select count(*) into owed from public.payments where received_on is null;
  if owed <> 1 then raise exception 'REFUSING: expected 1 owed payment, found %.', owed; end if;
end $$;

-- The money arrives. THIS IS THE UPDATE THE TABLE EXISTS FOR.
update public.payments
   set received_on = '2026-10-20', reference = 'TRF-8891'
 where id = '00000000-0000-0000-0000-00000000e101';

do $$
declare owed bigint; paid bigint;
begin
  select count(*) into owed from public.payments where received_on is null;
  select count(*) into paid from public.payments where received_on is not null;
  if paid <> 1 then
    raise exception
      'REFUSING: the receipt was not recorded (paid = %). The freeze has refused the one '
      'update this table exists for, which makes payments useless while every refusal '
      'case still passes.', paid;
  end if;
  if owed <> 0 then raise exception 'REFUSING: still % owed after payment.', owed; end if;
  raise notice 'Receipt recorded: owed %, paid %.', owed, paid;
end $$;
rollback;

-- ══ CASE 8 — a payment cannot be deleted ═══════════════════════════════════
begin;
\echo '--- case 8: delete refused'
\i db/migrations/0043_payments_partial_freeze.sql
insert into public.payments (id, automation_client_id, kind, amount_eur, invoiced_on, recorded_by)
select '00000000-0000-0000-0000-00000000e101', id, 'setup', 1200.00, '2026-10-01', 'proof'
  from public.clients limit 1;
delete from public.payments where id = '00000000-0000-0000-0000-00000000e101';
-- expect: ERROR  payments is not deletable: a payment that did not happen is
--         corrected by a new row of the opposite kind …
rollback;

-- ---------------------------------------------------------------------------
-- AFTER ALL EIGHT BEHAVE
-- ---------------------------------------------------------------------------
--   npm run proof:bless 0043-payments-partial-freeze
-- then apply db/migrations/0043_payments_partial_freeze.sql and run its verify
-- block. 🔴 If case 7 raises, DO NOT APPLY.
