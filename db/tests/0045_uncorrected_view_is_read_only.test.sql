-- The cases of 0045, SEEN. Paste the whole file. Each case rolls back.
--
-- 🔴 CASE 1 IS THE POINT: it demonstrates the HOLE before the fix closes it.
-- A migration that only shows the after-state proves the change was made, not
-- that it was needed.
--
-- EXPECTED:
--   1  the write through the view is REFUSED — by the trigger, which is the
--      half that was still holding. Read the message: if it names the
--      append-only trigger, the belt was bypassed and only the guarantee
--      caught it
--   2  after 0045: the view offers no write verb at all
--   3  the view still READS correctly — the fix must not break what it is for

-- ══ CASE 1 — the hole, before the fix ══════════════════════════════════════
begin;
\echo '--- case 1: what refuses a write through the view TODAY'

insert into public.client_contracts
  (id, automation_client_id, monthly_eur, starts_on, signed_by, recorded_by)
select '00000000-0000-0000-0000-00000000f101', id, 400.00, '2026-10-01', 'proof', 'proof'
  from public.clients limit 1;

update public.client_contracts_uncorrected set monthly_eur = 500.00
 where id = '00000000-0000-0000-0000-00000000f101';

-- 🔴 EXPECTED: ERROR 'client_contracts is append-only: UPDATE refused …'
--
-- READ WHICH ERROR IT IS. If it is the append-only trigger, the write REACHED
-- the base table — the grant check passed, because an auto-updatable view
-- checks base-table rights as the VIEW OWNER, and only the trigger stopped it.
-- That is the hole 0045 closes.
--
-- If instead it is 'permission denied for view client_contracts_uncorrected',
-- the belt is already holding here and 0045 is belt-and-braces rather than a
-- fix — which is worth knowing and changes nothing about applying it.
do $$
begin
  raise exception
    'CASE 1 DID NOT FIRE. The UPDATE through the view was ACCEPTED, which means neither '
    'the grant nor the trigger stopped it — the freeze is not holding at all. DO NOT BLESS.';
end $$;
rollback;

-- ══ CASE 2 — after 0045, the view offers no write verb ═════════════════════
begin;
\echo '--- case 2: the view is read-only'
\i db/migrations/0045_uncorrected_view_is_read_only.sql

do $$
declare n_write bigint;
begin
  select count(*) into n_write from information_schema.table_privileges
   where table_schema = 'public'
     and table_name = 'client_contracts_uncorrected'
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if n_write > 0 then
    raise exception
      'REFUSING: the view still carries % write privilege(s) after 0045. The revoke did '
      'not take — most likely ALTER DEFAULT PRIVILEGES re-granting, which is the same '
      'mechanism that put this hole here.', n_write;
  end if;
  raise notice 'The view offers no write verb to anybody.';
end $$;
rollback;

-- ══ 🔴 CASE 3 — THE RESTING STATE. It must still READ. DO NOT SKIP ═════════
-- A view locked down so hard it stops answering is a fix that removes the
-- thing it was protecting. Every revenue figure reads this.
begin;
\echo '--- case 3: the view still does its job'
\i db/migrations/0045_uncorrected_view_is_read_only.sql

insert into public.client_contracts
  (id, automation_client_id, monthly_eur, starts_on, signed_by, recorded_by)
select '00000000-0000-0000-0000-00000000f101', id, 400.00, '2026-10-01', 'proof', 'proof'
  from public.clients limit 1;
insert into public.client_contracts
  (id, automation_client_id, monthly_eur, starts_on, signed_by, recorded_by, supersedes_id)
select '00000000-0000-0000-0000-00000000f102', id, 450.00, '2026-10-01', 'proof', 'proof',
       '00000000-0000-0000-0000-00000000f101' from public.clients limit 1;

do $$
declare n bigint; fee numeric;
begin
  select count(*), max(monthly_eur) into n, fee from public.client_contracts_uncorrected;
  if n <> 1 then
    raise exception 'REFUSING: the view returned % rows, expected 1. security_invoker or '
      'the revoke has broken what the view is FOR.', n;
  end if;
  if fee <> 450.00 then
    raise exception 'REFUSING: the view returned the superseded row (fee %).', fee;
  end if;
  raise notice 'The view still reads: 1 uncorrected row at 450.00.';
end $$;
rollback;
