-- The cases of 0046, SEEN. Paste the whole file. Each case rolls back.
--
-- 🔴 CASE 3 IS THE ONE NOT TO SKIP. Cases 1 and 2 prove privileges were
-- REMOVED. Case 3 proves the ones that must REMAIN still work — a revoke
-- written one word too wide leaves a schema nothing can write to, and both
-- removal cases still pass.
--
-- EXPECTED:
--   1  NOTICE  'No role holds DELETE or TRUNCATE on any money table.'
--   2  NOTICE  'client_contracts and cost_checks: no UPDATE for anybody.'
--   3  NOTICE  'The legitimate writes survive: payments, costs, web_clients UPDATE; all five INSERT.'
--   4  ERROR   the append-only trigger still refuses, so the belt did not replace the guarantee

-- ══ CASE 1 — nobody deletes or truncates ═══════════════════════════════════
begin;
\echo '--- case 1: delete and truncate gone everywhere'
\i db/migrations/0046_money_tables_grants.sql

do $$
declare n bigint; who text;
begin
  select count(*), string_agg(distinct grantee || '=' || privilege_type, ', ')
    into n, who
    from information_schema.table_privileges
   where table_schema='public'
     and table_name in ('client_contracts','payments','costs','cost_checks','web_clients')
     and privilege_type in ('DELETE','TRUNCATE');
  if n > 0 then
    raise exception 'REFUSING: % delete/truncate privilege(s) survive: %.', n, who;
  end if;
  raise notice 'No role holds DELETE or TRUNCATE on any money table.';
end $$;
rollback;

-- ══ CASE 2 — the append-only tables have no UPDATE ═════════════════════════
begin;
\echo '--- case 2: no UPDATE on client_contracts or cost_checks'
\i db/migrations/0046_money_tables_grants.sql

do $$
declare n bigint;
begin
  select count(*) into n from information_schema.table_privileges
   where table_schema='public'
     and table_name in ('client_contracts','cost_checks')
     and privilege_type = 'UPDATE';
  if n > 0 then
    raise exception 'REFUSING: % UPDATE privilege(s) survive on an append-only table.', n;
  end if;
  raise notice 'client_contracts and cost_checks: no UPDATE for anybody.';
end $$;
rollback;

-- ══ 🔴 CASE 3 — THE RESTING STATE. The legitimate writes must SURVIVE ══════
-- A revoke one word too wide leaves a schema nothing can write to, and both
-- cases above still pass. This is the case that catches it.
begin;
\echo '--- case 3: what must still work, still works'
\i db/migrations/0046_money_tables_grants.sql

do $$
declare missing text;
begin
  select string_agg(want.t || '.' || want.p, ', ') into missing
    from (values
      ('payments','UPDATE'), ('costs','UPDATE'), ('web_clients','UPDATE'),
      ('client_contracts','INSERT'), ('payments','INSERT'), ('costs','INSERT'),
      ('cost_checks','INSERT'), ('web_clients','INSERT'),
      ('client_contracts','SELECT'), ('payments','SELECT')
    ) as want(t,p)
   where not exists (
     select 1 from information_schema.table_privileges g
      where g.table_schema='public' and g.table_name = want.t
        and g.grantee = 'service_role' and g.privilege_type = want.p
   );
  if missing is not null then
    raise exception
      'REFUSING: the revoke went too wide — service_role has lost %. A schema nothing can '
      'write to passes every removal check.', missing;
  end if;
  raise notice 'The legitimate writes survive: payments, costs, web_clients UPDATE; all five INSERT.';
end $$;
rollback;

-- ══ CASE 4 — the belt did not replace the guarantee ════════════════════════
-- 🔒 0012's argument: both are needed. If adding the revoke had somehow
-- displaced the trigger, append-only would now rest on a privilege alone —
-- and a privilege is exactly what was found missing today.
begin;
\echo '--- case 4: the trigger still refuses'
\i db/migrations/0046_money_tables_grants.sql

insert into public.client_contracts
  (id, automation_client_id, monthly_eur, starts_on, signed_by, recorded_by)
select '00000000-0000-0000-0000-000000010101', id, 400.00, '2026-10-01', 'proof', 'proof'
  from public.clients limit 1;

-- service_role no longer holds UPDATE, so this may be refused by the PRIVILEGE
-- rather than by the trigger. Either refusal is correct; what must not happen
-- is the update succeeding.
update public.client_contracts set monthly_eur = 500.00
 where id = '00000000-0000-0000-0000-000000010101';

do $$
begin
  raise exception
    'CASE 4 DID NOT FIRE. The UPDATE was ACCEPTED after 0046, which means neither the '
    'privilege nor the trigger is holding. DO NOT BLESS.';
end $$;
rollback;
