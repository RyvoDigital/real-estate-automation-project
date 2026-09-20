-- The cases of 0042, SEEN. Paste the whole file into the SQL editor.
--
-- 🔴 IT APPLIES 0042 INSIDE EACH TRANSACTION AND ROLLS IT BACK. Nothing
-- survives. Applying 0042 for real is a separate, deliberate act afterwards.
--
-- 🔴 CASE 5 IS THE ONE NOT TO SKIP. Cases 1-4 prove it REFUSES what it should.
-- Case 5 proves it ACCEPTS a correction and that the view hides the superseded
-- row — which is the case that catches a freeze written so tightly that the
-- correction path itself is blocked. A migration that forbids editing AND
-- forbids superseding has made the table read-only, and every sabotage case
-- would still pass.
--
-- EXPECTED, in order:
--   1  ERROR   append-only: UPDATE refused
--   2  ERROR   append-only: DELETE refused
--   3  ERROR   duplicate key … client_contracts_one_correction_each
--   4  ERROR   … contract_supersedes_another   (a row correcting itself)
--   5  NOTICE  'Correction accepted: 2 rows, 1 current, monthly 450.00'
--   6  NOTICE  'The overlap check sees a genuine double-count'

-- ══ CASE 1 — UPDATE must be refused ════════════════════════════════════════
begin;
\echo '--- case 1: UPDATE refused'
\i db/migrations/0042_client_contracts_append_only.sql
-- (or paste 0042's body here, without its begin/commit)

insert into public.client_contracts
  (id, automation_client_id, monthly_eur, starts_on, signed_by, recorded_by)
select '00000000-0000-0000-0000-00000000d101', id, 400.00, '2026-10-01', 'proof', 'proof'
  from public.clients limit 1;

update public.client_contracts set monthly_eur = 500.00
 where id = '00000000-0000-0000-0000-00000000d101';
-- expect: ERROR  client_contracts is append-only: UPDATE refused. A correction
--         is a NEW row whose supersedes_id points at the one it replaces …

-- 🔴 THE SENTINEL. Reached only if the statement above did NOT raise. An
-- expected error that silently did not happen looks identical to one that did,
-- in a console full of output — so the database announces it rather than
-- asking a reader to notice an absence. (§1n, in SQL.)
do $$
begin
  raise exception 'THIS CASE DID NOT FIRE: the statement above was accepted, so the guard it tests is not holding. DO NOT BLESS.';
end $$;

rollback;

-- ══ CASE 2 — DELETE must be refused ════════════════════════════════════════
begin;
\echo '--- case 2: DELETE refused'
\i db/migrations/0042_client_contracts_append_only.sql
insert into public.client_contracts
  (id, automation_client_id, monthly_eur, starts_on, signed_by, recorded_by)
select '00000000-0000-0000-0000-00000000d101', id, 400.00, '2026-10-01', 'proof', 'proof'
  from public.clients limit 1;
delete from public.client_contracts where id = '00000000-0000-0000-0000-00000000d101';
-- expect: ERROR  client_contracts is append-only: DELETE refused …

-- 🔴 THE SENTINEL. Reached only if the statement above did NOT raise. An
-- expected error that silently did not happen looks identical to one that did,
-- in a console full of output — so the database announces it rather than
-- asking a reader to notice an absence. (§1n, in SQL.)
do $$
begin
  raise exception 'THIS CASE DID NOT FIRE: the statement above was accepted, so the guard it tests is not holding. DO NOT BLESS.';
end $$;

rollback;

-- ══ CASE 3 — two corrections of the same row must be refused ═══════════════
-- Without this, both could be current and the month is counted twice — the
-- exact failure the view exists to prevent, arriving through the back.
begin;
\echo '--- case 3: two rows superseding the same contract'
\i db/migrations/0042_client_contracts_append_only.sql
insert into public.client_contracts
  (id, automation_client_id, monthly_eur, starts_on, signed_by, recorded_by)
select '00000000-0000-0000-0000-00000000d101', id, 400.00, '2026-10-01', 'proof', 'proof'
  from public.clients limit 1;
insert into public.client_contracts
  (id, automation_client_id, monthly_eur, starts_on, signed_by, recorded_by, supersedes_id)
select '00000000-0000-0000-0000-00000000d102', id, 450.00, '2026-10-01', 'proof', 'proof',
       '00000000-0000-0000-0000-00000000d101' from public.clients limit 1;
insert into public.client_contracts
  (id, automation_client_id, monthly_eur, starts_on, signed_by, recorded_by, supersedes_id)
select '00000000-0000-0000-0000-00000000d103', id, 475.00, '2026-10-01', 'proof', 'proof',
       '00000000-0000-0000-0000-00000000d101' from public.clients limit 1;
-- expect: ERROR  duplicate key value violates unique constraint
--         "client_contracts_one_correction_each"

-- 🔴 THE SENTINEL. Reached only if the statement above did NOT raise. An
-- expected error that silently did not happen looks identical to one that did,
-- in a console full of output — so the database announces it rather than
-- asking a reader to notice an absence. (§1n, in SQL.)
do $$
begin
  raise exception 'THIS CASE DID NOT FIRE: the statement above was accepted, so the guard it tests is not holding. DO NOT BLESS.';
end $$;

rollback;

-- ══ CASE 4 — a row correcting itself must be refused ═══════════════════════
begin;
\echo '--- case 4: a row cannot supersede itself'
\i db/migrations/0042_client_contracts_append_only.sql
insert into public.client_contracts
  (id, automation_client_id, monthly_eur, starts_on, signed_by, recorded_by, supersedes_id)
select '00000000-0000-0000-0000-00000000d101', id, 400.00, '2026-10-01', 'proof', 'proof',
       '00000000-0000-0000-0000-00000000d101' from public.clients limit 1;
-- expect: ERROR  … "contract_supersedes_another"

-- 🔴 THE SENTINEL. Reached only if the statement above did NOT raise. An
-- expected error that silently did not happen looks identical to one that did,
-- in a console full of output — so the database announces it rather than
-- asking a reader to notice an absence. (§1n, in SQL.)
do $$
begin
  raise exception 'THIS CASE DID NOT FIRE: the statement above was accepted, so the guard it tests is not holding. DO NOT BLESS.';
end $$;

rollback;

-- ══ 🔴 CASE 5 — THE RESTING STATE. A correction is ACCEPTED. DO NOT SKIP ════
begin;
\echo '--- case 5: a correction is accepted and the view hides the superseded row'
\i db/migrations/0042_client_contracts_append_only.sql

insert into public.client_contracts
  (id, automation_client_id, monthly_eur, starts_on, signed_by, recorded_by)
select '00000000-0000-0000-0000-00000000d101', id, 400.00, '2026-10-01', 'proof', 'proof'
  from public.clients limit 1;

insert into public.client_contracts
  (id, automation_client_id, monthly_eur, starts_on, signed_by, recorded_by, supersedes_id)
select '00000000-0000-0000-0000-00000000d102', id, 450.00, '2026-10-01', 'proof', 'proof',
       '00000000-0000-0000-0000-00000000d101' from public.clients limit 1;

do $$
declare n_all bigint; n_cur bigint; fee numeric;
begin
  select count(*) into n_all from public.client_contracts;
  select count(*) into n_cur from public.client_contracts_uncorrected;
  select monthly_eur into fee from public.client_contracts_uncorrected;

  if n_all <> 2 then
    raise exception 'REFUSING: expected 2 rows, found %. The correction was not accepted — '
      'a freeze that blocks superseding as well as editing has made the table read-only.', n_all;
  end if;
  if n_cur <> 1 then
    raise exception 'REFUSING: the view returned % rows, expected 1. A superseded row is '
      'still counted, which double-counts every correction ever made.', n_cur;
  end if;
  if fee <> 450.00 then
    raise exception 'REFUSING: the current fee is %, expected 450.00 — the view returned '
      'the superseded row.', fee;
  end if;
  raise notice 'Correction accepted: 2 rows, 1 current, monthly 450.00.';
end $$;
rollback;

-- ══ CASE 6 — the overlap check must SEE a real double-count (§1n) ══════════
begin;
\echo '--- case 6: the overlap check can fail'
\i db/migrations/0042_client_contracts_append_only.sql
insert into public.client_contracts
  (automation_client_id, monthly_eur, starts_on, ends_on, signed_by, recorded_by)
select id, 400.00, '2026-09-01', '2026-12-31', 'proof', 'proof' from public.clients limit 1;
insert into public.client_contracts
  (automation_client_id, monthly_eur, starts_on, signed_by, recorded_by)
select id, 450.00, '2026-10-01', 'proof', 'proof' from public.clients limit 1;

do $$
declare n bigint;
begin
  select count(*) into n
    from public.client_contracts_uncorrected a
    join public.client_contracts_uncorrected b
      on a.automation_client_id = b.automation_client_id and a.id < b.id
   where daterange(a.starts_on, a.ends_on, '[]') && daterange(b.starts_on, b.ends_on, '[]');
  if n <> 1 then
    raise exception 'REFUSING: the overlap check found % pair(s), expected 1. It cannot see '
      'a double-count, so a clean result from it would mean nothing.', n;
  end if;
  raise notice 'The overlap check sees a genuine double-count. It can fail.';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- AFTER ALL SIX BEHAVE
-- ---------------------------------------------------------------------------
--   npm run proof:bless 0042-client-contracts-append-only
-- then apply db/migrations/0042_client_contracts_append_only.sql and run its
-- verify block. 🔴 If case 5 raises, DO NOT APPLY: the freeze would have made
-- the table read-only rather than append-only.
