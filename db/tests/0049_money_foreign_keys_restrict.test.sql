-- The cases of 0049, SEEN.
--
-- 🔴 THIS FILE DOES NOT APPLY 0049, AND MUST NOT.
-- The other proofs use `\i` to apply their migration inside each case. 0049
-- ends in `commit;`, so doing that here would COMMIT the case's transaction:
-- 0049 would be applied for real, halfway through a test, and every fixture
-- after that point would be permanent. Money fixtures behind a RESTRICT key
-- are exactly the kind of row that is hard to take back out.
-- So this file tests the DEPLOYED database, in the same way 0012's proof does:
--
--   BEFORE applying 0049:  run CASE 0 and CASE 3. Case 0 must say
--                          'THE DEFECT, SEEN'. Case 3 must REFUSE and name
--                          exactly the six keys, and no others.
--   Apply 0049 by hand: the whole file, including its own begin/commit.
--   AFTER applying:        run CASES 1, 2 and 3.
--
-- No psql meta-commands, so it pastes straight into the Supabase SQL editor.
--
-- 🔒 EVERY EXPECTED REFUSAL IS CAUGHT AND CHECKED INSIDE THE DATABASE.
-- A refusal case passes only if the delete raised a foreign_key_violation AND
-- named the right constraint. Refused for any other reason is a failure: a
-- delete trigger, a privilege or a check constraint would each produce a red
-- line that looks like success, which is the 0044 lesson ("failed for the
-- wrong reason is the same as not tested").
-- So a correct run produces NOTICEs and NO ERROR AT ALL. Any ERROR means stop
-- and read it. The SQL editor abandons the rest of the script at the first
-- error, so nothing after it runs half-done.
--
-- 🔴 CASE 2 IS THE ONE NOT TO SKIP. Case 1 proves the keys refuse. Case 2
-- proves that a parent with nothing recorded against it can still be deleted,
-- and that a client's NON-money children still cascade. That second part is
-- what docs/concierge-runbook.md's test-client cleanup relies on. A key made
-- one step too strict, or a change that moved the wrong key, makes every
-- parent undeletable, and case 1 still passes.
--
-- EXPECTED:
--   0  NOTICE  'CASE 0 — THE DEFECT, SEEN …'           (before applying only)
--   1  six NOTICEs 'Refused by <constraint> …', then 'CASE 1: all six keys refuse.'
--   2  NOTICE  'CASE 2 — THE RESTING STATE HOLDS …'
--   3  NOTICE  'CASE 3: all 45 foreign keys are as expected …'
--   ✔  NOTICE  'No 0049 fixture survived.'
--
-- Fixture ids all end in 0490xx and every case rolls back. The last block
-- checks that none survived.


-- ══ CASE 0 — THE DEFECT, SEEN. BEFORE applying 0049 only ═══════════════════
-- Without this, case 1 is a test nobody has seen fail. Here the same kind of
-- delete that case 1 expects to be refused is seen to SUCCEED, and to take the
-- payment with it.
begin;
insert into public.clients (id, name, rehearsal)
values ('00000000-0000-0000-0000-000000049000', 'proof 0049 — case 0', true);
insert into public.payments (id, automation_client_id, kind, amount_eur, recorded_by)
values ('00000000-0000-0000-0000-000000049050', '00000000-0000-0000-0000-000000049000',
        'setup', 1.00, 'proof 0049');

do $$
declare n bigint;
begin
  begin
    delete from public.clients where id = '00000000-0000-0000-0000-000000049000';
  exception when foreign_key_violation then
    raise notice
      'CASE 0 NOT APPLICABLE: the delete was refused, so 0049 is already applied. '
      'Case 0 witnesses the defect and only means something before the fix.';
    return;
  end;

  select count(*) into n from public.payments where id = '00000000-0000-0000-0000-000000049050';
  if n <> 0 then
    raise exception
      'CASE 0 UNEXPECTED: the client was deleted and its payment SURVIVED. Something '
      'other than a cascade is governing this key. Read the catalogue before applying 0049.';
  end if;
  raise notice
    'CASE 0 — THE DEFECT, SEEN: deleting the client deleted its payment with it, '
    'with no error. This is what 0049 exists to stop.';
end $$;
rollback;


-- ══ CASE 1 — a parent with a money child is REFUSED, by the right key ══════
-- One sub-case per key, each with a fixture that has exactly one kind of
-- child, so the constraint that refuses is determined in advance.
begin;

create function pg_temp.expect_refused(stmt text, fk text) returns void
language plpgsql as $f$
declare got text;
begin
  execute stmt;
  -- Reached only if the delete was ACCEPTED.
  raise exception 'CASE 1 DID NOT FIRE: "%" was accepted, so % is not holding. DO NOT BLESS.', stmt, fk;
exception
  when foreign_key_violation then
    get stacked diagnostics got = constraint_name;
    if got is distinct from fk then
      raise exception 'CASE 1 WRONG KEY: "%" was refused by %, expected %. DO NOT BLESS.', stmt, got, fk;
    end if;
    raise notice 'Refused by %: %', fk, stmt;
end $f$;

-- A: an automation client with a contract, which a correction supersedes
insert into public.clients (id, name, rehearsal)
values ('00000000-0000-0000-0000-000000049001', 'proof 0049 — A', true);
insert into public.client_contracts (id, automation_client_id, monthly_eur, starts_on, signed_by, recorded_by)
values ('00000000-0000-0000-0000-000000049011', '00000000-0000-0000-0000-000000049001', 400.00, '2026-10-01', 'proof', 'proof 0049');
insert into public.client_contracts (id, automation_client_id, monthly_eur, starts_on, signed_by, recorded_by, supersedes_id)
values ('00000000-0000-0000-0000-000000049012', '00000000-0000-0000-0000-000000049001', 450.00, '2026-10-01', 'proof', 'proof 0049',
        '00000000-0000-0000-0000-000000049011');

-- B: an automation client with a payment and nothing else
insert into public.clients (id, name, rehearsal)
values ('00000000-0000-0000-0000-000000049002', 'proof 0049 — B', true);
insert into public.payments (id, automation_client_id, kind, amount_eur, recorded_by)
values ('00000000-0000-0000-0000-000000049052', '00000000-0000-0000-0000-000000049002', 'setup', 1.00, 'proof 0049');

-- C: a web client with a contract and nothing else
insert into public.web_clients (id, name, status, started_on, rehearsal)
values ('00000000-0000-0000-0000-000000049003', 'proof 0049 — C', 'active', '2026-10-01', true);
insert into public.client_contracts (id, web_client_id, monthly_eur, starts_on, signed_by, recorded_by)
values ('00000000-0000-0000-0000-000000049013', '00000000-0000-0000-0000-000000049003', 100.00, '2026-10-01', 'proof', 'proof 0049');

-- D: a web client with a payment and nothing else
insert into public.web_clients (id, name, status, started_on, rehearsal)
values ('00000000-0000-0000-0000-000000049004', 'proof 0049 — D', 'active', '2026-10-01', true);
insert into public.payments (id, web_client_id, kind, amount_eur, recorded_by)
values ('00000000-0000-0000-0000-000000049054', '00000000-0000-0000-0000-000000049004', 'project', 1.00, 'proof 0049');

-- E: a cost with a confirmation of its price
insert into public.costs (id, label, category, side, amount_eur, cadence, started_on, recorded_by)
values ('00000000-0000-0000-0000-000000049005', 'proof 0049 — E', 'other', 'shared', 1.00, 'monthly', '2026-10-01', 'proof 0049');
insert into public.cost_checks (id, cost_id, confirmed_on, confirmed_by, amount_eur)
values ('00000000-0000-0000-0000-000000049055', '00000000-0000-0000-0000-000000049005', current_date, 'proof 0049', 1.00);

select pg_temp.expect_refused($$delete from public.clients where id = '00000000-0000-0000-0000-000000049001'$$,
                              'client_contracts_automation_client_id_fkey');
select pg_temp.expect_refused($$delete from public.clients where id = '00000000-0000-0000-0000-000000049002'$$,
                              'payments_automation_client_id_fkey');
select pg_temp.expect_refused($$delete from public.web_clients where id = '00000000-0000-0000-0000-000000049003'$$,
                              'client_contracts_web_client_id_fkey');
select pg_temp.expect_refused($$delete from public.web_clients where id = '00000000-0000-0000-0000-000000049004'$$,
                              'payments_web_client_id_fkey');
select pg_temp.expect_refused($$delete from public.costs where id = '00000000-0000-0000-0000-000000049005'$$,
                              'cost_checks_cost_id_fkey');
-- The contract that a correction supersedes. 🔒 If a BEFORE DELETE trigger on
-- client_contracts ever exists (the repository's 0042 declares one; the
-- database does not have it), it would fire before the key is checked. This
-- sub-case would then report the trigger's error rather than pass, which is
-- the right outcome: the key would be untested, not proven.
select pg_temp.expect_refused($$delete from public.client_contracts where id = '00000000-0000-0000-0000-000000049011'$$,
                              'client_contracts_supersedes_id_fkey');

do $$ begin raise notice 'CASE 1: all six keys refuse, each by name.'; end $$;
rollback;


-- ══ 🔴 CASE 2 — THE RESTING STATE. DO NOT SKIP ═════════════════════════════
begin;
insert into public.clients (id, name, rehearsal)
values ('00000000-0000-0000-0000-000000049021', 'proof 0049 — childless', true),
       ('00000000-0000-0000-0000-000000049022', 'proof 0049 — non-money child', true);
insert into public.metrics_daily (client_id, date)
values ('00000000-0000-0000-0000-000000049022', '2026-10-01');
insert into public.web_clients (id, name, status, started_on, rehearsal)
values ('00000000-0000-0000-0000-000000049023', 'proof 0049 — childless web', 'active', '2026-10-01', true);
insert into public.costs (id, label, category, side, amount_eur, cadence, started_on, recorded_by)
values ('00000000-0000-0000-0000-000000049024', 'proof 0049 — unconfirmed', 'other', 'shared', 1.00, 'monthly', '2026-10-01', 'proof 0049');

delete from public.clients     where id in ('00000000-0000-0000-0000-000000049021', '00000000-0000-0000-0000-000000049022');
delete from public.web_clients where id =  '00000000-0000-0000-0000-000000049023';
delete from public.costs       where id =  '00000000-0000-0000-0000-000000049024';

do $$
declare n_left bigint; n_metrics bigint;
begin
  select (select count(*) from public.clients     where id in ('00000000-0000-0000-0000-000000049021', '00000000-0000-0000-0000-000000049022'))
       + (select count(*) from public.web_clients where id =  '00000000-0000-0000-0000-000000049023')
       + (select count(*) from public.costs       where id =  '00000000-0000-0000-0000-000000049024')
    into n_left;
  select count(*) into n_metrics from public.metrics_daily
   where client_id = '00000000-0000-0000-0000-000000049022';

  if n_left <> 0 then
    raise exception
      'CASE 2 FAILED: % parent row(s) with no money recorded against them survived the delete. '
      'A key is stricter than designed, and every parent is now undeletable while case 1 still passes.', n_left;
  end if;
  if n_metrics <> 0 then
    raise exception
      'CASE 2 FAILED: the client went but its metrics_daily row stayed. A NON-money key moved, '
      'and the runbook''s test-client cleanup now leaves rows behind or fails.';
  end if;
  raise notice
    'CASE 2 — THE RESTING STATE HOLDS: a client, a web client and a cost with no money '
    'recorded against them delete cleanly, and a client''s non-money children still cascade.';
end $$;
rollback;


-- ══ CASE 3 — EVERY foreign key, not only the six ═══════════════════════════
-- The whole schema's foreign keys, compared as a set in both directions
-- against the list below, which was read from the catalogue on 21 September
-- 2026 with only 0049's six changed. It catches a key 0049 was meant to
-- change and did not, a key it was NOT meant to change and did, a key dropped
-- and not re-added, and a key added since. Read-only, so run it before
-- applying as well: it must refuse, naming exactly the six keys and no others.
--
-- confdeltype: r = restrict, c = cascade, n = set null, a = no action.
-- One statement, no temporary tables, so it runs on a read-only connection.
do $$
declare missing text; unexpected text; n_actual bigint;
begin
  with expected(conname, child, parent, d) as (values
    ('agency_facts_client_id_fkey'                 , 'agency_facts'      , 'clients'             , 'c'),
    ('automation_runs_client_automation_id_fkey'   , 'automation_runs'   , 'client_automations'  , 'c'),
    ('campaign_runs_client_id_fkey'                , 'campaign_runs'     , 'clients'             , 'c'),
    ('clearances_client_id_fkey'                   , 'clearances'        , 'clients'             , 'c'),
    ('clearances_listing_id_fkey'                  , 'clearances'        , 'listings'            , 'c'),
    ('client_automations_automation_id_fkey'       , 'client_automations', 'automations'         , 'r'),
    ('client_automations_client_id_fkey'           , 'client_automations', 'clients'             , 'c'),
    ('client_contracts_automation_client_id_fkey'  , 'client_contracts'  , 'clients'             , 'r'),  -- 0049
    ('client_contracts_supersedes_id_fkey'         , 'client_contracts'  , 'client_contracts'    , 'r'),  -- 0049
    ('client_contracts_web_client_id_fkey'         , 'client_contracts'  , 'web_clients'         , 'r'),  -- 0049
    ('closes_client_id_fkey'                       , 'closes'            , 'clients'             , 'c'),
    ('closes_listing_id_fkey'                      , 'closes'            , 'listings'            , 'n'),
    ('closes_party_lead_id_fkey'                   , 'closes'            , 'leads'               , 'n'),
    ('consent_events_client_id_fkey'               , 'consent_events'    , 'clients'             , 'c'),
    ('consent_events_lead_id_fkey'                 , 'consent_events'    , 'leads'               , 'n'),
    ('cost_checks_cost_id_fkey'                    , 'cost_checks'       , 'costs'               , 'r'),  -- 0049
    ('events_client_id_fkey'                       , 'events'            , 'clients'             , 'c'),
    ('fact_proposals_client_id_fkey'               , 'fact_proposals'    , 'clients'             , 'c'),
    ('fact_proposals_listing_id_fkey'              , 'fact_proposals'    , 'listings'            , 'c'),
    ('import_batches_client_id_fkey'               , 'import_batches'    , 'clients'             , 'c'),
    ('lead_requirements_client_id_fkey'            , 'lead_requirements' , 'clients'             , 'c'),
    ('lead_requirements_lead_id_fkey'              , 'lead_requirements' , 'leads'               , 'c'),
    ('leads_client_id_fkey'                        , 'leads'             , 'clients'             , 'c'),
    ('listing_facts_client_id_fkey'                , 'listing_facts'     , 'clients'             , 'c'),
    ('listing_facts_listing_id_fkey'               , 'listing_facts'     , 'listings'            , 'c'),
    ('listing_matches_client_id_fkey'              , 'listing_matches'   , 'clients'             , 'c'),
    ('listing_matches_lead_id_fkey'                , 'listing_matches'   , 'leads'               , 'c'),
    ('listing_matches_listing_id_fkey'             , 'listing_matches'   , 'listings'            , 'c'),
    ('listing_matches_supersedes_id_fkey'          , 'listing_matches'   , 'listing_matches'     , 'n'),
    ('listings_client_id_fkey'                     , 'listings'          , 'clients'             , 'c'),
    ('message_templates_client_id_fkey'            , 'message_templates' , 'clients'             , 'c'),
    ('messages_attributed_run_id_fkey'             , 'messages'          , 'campaign_runs'       , 'n'),
    ('messages_attributed_send_id_fkey'            , 'messages'          , 'sends'               , 'n'),
    ('messages_client_id_fkey'                     , 'messages'          , 'clients'             , 'c'),
    ('messages_lead_id_fkey'                       , 'messages'          , 'leads'               , 'n'),
    ('metrics_daily_client_id_fkey'                , 'metrics_daily'     , 'clients'             , 'c'),
    ('payments_automation_client_id_fkey'          , 'payments'          , 'clients'             , 'r'),  -- 0049
    ('payments_web_client_id_fkey'                 , 'payments'          , 'web_clients'         , 'r'),  -- 0049
    ('reports_client_id_fkey'                      , 'reports'           , 'clients'             , 'c'),
    ('sends_campaign_run_id_fkey'                  , 'sends'             , 'campaign_runs'       , 'n'),
    ('sends_client_id_fkey'                        , 'sends'             , 'clients'             , 'c'),
    ('sends_close_id_fkey'                         , 'sends'             , 'closes'              , 'n'),
    ('sends_consent_event_id_fkey'                 , 'sends'             , 'consent_events'      , 'a'),
    ('sends_lead_id_fkey'                          , 'sends'             , 'leads'               , 'n'),
    ('sends_template_approval_fk'                  , 'sends'             , 'message_templates'   , 'a') 
  ),
  actual as (
    select con.conname::text as conname, ch.relname::text as child,
           pa.relname::text  as parent,  con.confdeltype::text as d
      from pg_constraint con
      join pg_class ch on ch.oid = con.conrelid
      join pg_class pa on pa.oid = con.confrelid
     where con.contype = 'f' and con.connamespace = 'public'::regnamespace
  ),
  m as (select * from expected except select * from actual),
  u as (select * from actual except select * from expected)
  select (select count(*) from actual),
         (select string_agg(format('%s (%s → %s) expected %s', conname, child, parent, d), '; ' order by conname) from m),
         (select string_agg(format('%s (%s → %s) is %s', conname, child, parent, d), '; ' order by conname) from u)
    into n_actual, missing, unexpected;

  if missing is not null or unexpected is not null then
    raise exception E'CASE 3: the foreign keys are not as expected (% in the database, 45 expected).\n  EXPECTED BUT NOT FOUND: %\n  FOUND BUT NOT EXPECTED: %',
      n_actual, coalesce(missing, '—'), coalesce(unexpected, '—');
  end if;
  raise notice
    'CASE 3: all 45 foreign keys are as expected. The six money keys are RESTRICT, and no other key moved.';
end $$;


-- ══ No fixture survived ════════════════════════════════════════════════════
do $$
declare n bigint;
begin
  select (select count(*) from public.clients          where id::text like '00000000-0000-0000-0000-0000000490%')
       + (select count(*) from public.web_clients      where id::text like '00000000-0000-0000-0000-0000000490%')
       + (select count(*) from public.costs            where id::text like '00000000-0000-0000-0000-0000000490%')
       + (select count(*) from public.client_contracts where id::text like '00000000-0000-0000-0000-0000000490%')
       + (select count(*) from public.payments         where id::text like '00000000-0000-0000-0000-0000000490%')
       + (select count(*) from public.cost_checks      where id::text like '00000000-0000-0000-0000-0000000490%')
    into n;
  if n <> 0 then
    raise exception
      '% 0049 fixture row(s) SURVIVED. A case committed rather than rolled back. They are proof '
      'rows in production money tables; tell Manuel before doing anything about them.', n;
  end if;
  raise notice 'No 0049 fixture survived.';
end $$;
