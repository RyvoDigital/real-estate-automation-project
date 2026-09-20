-- The cases of 0041, SEEN. Paste the whole file into the SQL editor.
--
-- It rolls itself back. Nothing survives, and the table is NOT left behind:
-- each case creates it, proves one thing, and rolls the lot away. Applying
-- 0041 is a separate, deliberate act afterwards.
--
-- 🔴 CASE 6 IS THE ONE NOT TO SKIP. Cases 1–5 prove the schema REFUSES what it
-- should. Case 6 proves it ACCEPTS what it should — and that is the case that
-- catches a constraint written too tightly, which is the mistake that passes
-- every sabotage and fails only the quiet path nobody runs. 0036 was caught by
-- exactly this, and 0037's own proof says the same thing.
--
-- EXPECTED, in order:
--   1  ERROR  append-only: UPDATE refused
--   2  ERROR  append-only: DELETE refused
--   3  ERROR  contract_automations_are_real
--   4  ERROR  contract_period_is_a_period
--   5  ERROR  contract_fees_not_negative
--   6  NOTICE two contracts inserted, one superseding the other; the view
--             returns exactly ONE row, and the overlap query returns NONE
--   7  NOTICE the overlap query FINDS a genuine double-count
--
-- If case 6 raises, do not apply the migration.

-- ═══════════════════════════════════════════════════════════════════════════
-- Shared setup. Each case repeats it, because each rolls back.
-- ═══════════════════════════════════════════════════════════════════════════
-- \set is not available in every client, so the fixture ids are literal:
--   client   00000000-0000-0000-0000-0000000c0041

-- ── CASE 1 — an UPDATE must be refused ──────────────────────────────────────
begin;
\echo '--- case 1: UPDATE must be refused'

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-0000000c0041', 'PROOF FIXTURE — 0041');

-- (run the migration body here, from `create table` to the revoke, without
--  its begin/commit — or apply 0041 first in a transaction you roll back)

insert into public.client_contracts
  (id, client_id, starts_on, monthly_fee_eur, setup_fee_eur, automations, recorded_by)
values
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-0000000c0041',
   '2026-10-01', 400.00, 1200.00, array['inbound_concierge'], 'proof');

update public.client_contracts set monthly_fee_eur = 500.00
 where id = '00000000-0000-0000-0000-00000000c101';
-- expect: ERROR  client_contracts is append-only: UPDATE refused. A correction
--         is a NEW row whose supersedes points at the one it replaces …

rollback;

-- ── CASE 2 — a DELETE must be refused ───────────────────────────────────────
begin;
\echo '--- case 2: DELETE must be refused'
-- setup as above, then:
delete from public.client_contracts
 where id = '00000000-0000-0000-0000-00000000c101';
-- expect: ERROR  client_contracts is append-only: DELETE refused …
rollback;

-- ── CASE 3 — an automation key that does not exist must be refused ──────────
begin;
\echo '--- case 3: an invented automation key must be refused BY NAME'
insert into public.client_contracts
  (client_id, starts_on, monthly_fee_eur, setup_fee_eur, automations, recorded_by)
values
  ('00000000-0000-0000-0000-0000000c0041', '2026-10-01', 400.00, 0.00,
   array['inbound_concierge', 'agent_owner'], 'proof');
-- expect: ERROR  new row … violates check constraint "contract_automations_are_real"
--
-- 🔒 THIS IS WHAT THE CHECK BUYS THAT A JOIN TABLE WOULD. A typo here is a
-- contract covering something the system cannot find, invisible until somebody
-- asks why an automation was never billed.
rollback;

-- ── CASE 4 — a period that ends before it starts must be refused ────────────
begin;
\echo '--- case 4: ends_on before starts_on must be refused'
insert into public.client_contracts
  (client_id, starts_on, ends_on, monthly_fee_eur, setup_fee_eur, automations, recorded_by)
values
  ('00000000-0000-0000-0000-0000000c0041', '2026-10-01', '2026-09-01', 400.00, 0.00,
   array['inbound_concierge'], 'proof');
-- expect: ERROR  … "contract_period_is_a_period"
rollback;

-- ── CASE 5 — a negative fee must be refused ─────────────────────────────────
begin;
\echo '--- case 5: a negative fee must be refused'
insert into public.client_contracts
  (client_id, starts_on, monthly_fee_eur, setup_fee_eur, automations, recorded_by)
values
  ('00000000-0000-0000-0000-0000000c0041', '2026-10-01', -1.00, 0.00,
   array['inbound_concierge'], 'proof');
-- expect: ERROR  … "contract_fees_not_negative"
--
-- Zero is legitimate — a pilot, or a contract with no setup fee — so the
-- constraint refuses only what would silently REDUCE a month's revenue.
rollback;

-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 CASE 6 — THE RESTING STATE. A correction must be ACCEPTED, and the view
--             must return exactly one row. DO NOT SKIP THIS.
-- ═══════════════════════════════════════════════════════════════════════════
begin;
\echo '--- case 6: a correction is accepted and the view hides the superseded row'

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-0000000c0041', 'PROOF FIXTURE — 0041');

insert into public.client_contracts
  (id, client_id, starts_on, monthly_fee_eur, setup_fee_eur, automations, recorded_by)
values
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-0000000c0041',
   '2026-10-01', 400.00, 1200.00, array['inbound_concierge'], 'proof');

-- The correction: the same period, a different fee, pointing at the original.
insert into public.client_contracts
  (id, client_id, starts_on, monthly_fee_eur, setup_fee_eur, automations, recorded_by, supersedes)
values
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-0000000c0041',
   '2026-10-01', 450.00, 1200.00, array['inbound_concierge'], 'proof',
   '00000000-0000-0000-0000-00000000c101');

do $$
declare
  n_all     bigint;
  n_current bigint;
  fee       numeric;
  n_overlap bigint;
begin
  select count(*) into n_all     from public.client_contracts;
  select count(*) into n_current from public.client_contracts_current;
  select monthly_fee_eur into fee from public.client_contracts_current;

  if n_all <> 2 then
    raise exception 'REFUSING: expected 2 rows in the base table, found %.', n_all;
  end if;

  -- 🔴 The whole point of the view. Two rows exist; one contract is current.
  if n_current <> 1 then
    raise exception
      'REFUSING: client_contracts_current returned % rows, expected 1. A superseded '
      'row is still being counted, which double-counts every correction ever made.',
      n_current;
  end if;

  if fee <> 450.00 then
    raise exception 'REFUSING: the current fee is %, expected 450.00 — the view returned the superseded row.', fee;
  end if;

  select count(*) into n_overlap
    from public.client_contracts_current a
    join public.client_contracts_current b
      on a.client_id = b.client_id and a.id < b.id
   where daterange(a.starts_on, a.ends_on, '[]') && daterange(b.starts_on, b.ends_on, '[]');

  -- The two rows DO overlap in the base table. They must not in the view,
  -- because only one of them is current — which is exactly the case that
  -- would otherwise read as a double-count.
  if n_overlap <> 0 then
    raise exception 'REFUSING: the overlap check found % pair(s) among current contracts.', n_overlap;
  end if;

  raise notice 'Resting state holds: 2 rows, 1 current, fee 450.00, 0 overlaps.';
end $$;

rollback;

-- ═══════════════════════════════════════════════════════════════════════════
-- CASE 7 — and the overlap query must FIND a real double-count, or it is
--          a check that cannot fail (§1n).
-- ═══════════════════════════════════════════════════════════════════════════
begin;
\echo '--- case 7: the overlap check must see a genuine double-count'

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-0000000c0041', 'PROOF FIXTURE — 0041');

-- Two contracts, neither superseding the other, overlapping in October.
insert into public.client_contracts
  (client_id, starts_on, ends_on, monthly_fee_eur, setup_fee_eur, automations, recorded_by)
values
  ('00000000-0000-0000-0000-0000000c0041', '2026-09-01', '2026-12-31', 400.00, 0.00,
   array['inbound_concierge'], 'proof'),
  ('00000000-0000-0000-0000-0000000c0041', '2026-10-01', null, 450.00, 0.00,
   array['db_reactivation'], 'proof');

do $$
declare n_overlap bigint;
begin
  select count(*) into n_overlap
    from public.client_contracts_current a
    join public.client_contracts_current b
      on a.client_id = b.client_id and a.id < b.id
   where daterange(a.starts_on, a.ends_on, '[]') && daterange(b.starts_on, b.ends_on, '[]');

  if n_overlap <> 1 then
    raise exception
      'REFUSING: the overlap check found % pair(s), expected 1. It cannot see a '
      'double-count, so a clean result from it would mean nothing.', n_overlap;
  end if;
  raise notice 'The overlap check sees a genuine double-count. It can fail.';
end $$;

rollback;

-- ---------------------------------------------------------------------------
-- AFTER ALL SEVEN BEHAVE
-- ---------------------------------------------------------------------------
--   npm run proof:bless 0041-client-contracts
--
-- Then apply db/migrations/0041_client_contracts.sql (it carries its own
-- begin/commit) and run the verify block in its footer.
--
-- 🔴 0043 — the drop of clients.monthly_fee_eur — does NOT follow immediately.
-- It waits for the cockpit to read this table, and proof:bless's
-- deploy_precondition will refuse to bless it until it does.
