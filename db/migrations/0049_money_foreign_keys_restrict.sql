-- ====== money cannot disappear because its parent was deleted ======
--
-- ALONE, in a transaction, with 0032's treatment.
--
-- 🔴 NOT APPLIED. Manuel runs this by hand in the Supabase SQL editor, after
-- db/tests/0049_money_foreign_keys_restrict.test.sql has been SEEN to pass.
--
-- ---------------------------------------------------------------------------
-- 🔴 WHAT WAS FOUND, 21 SEPTEMBER 2026
-- ---------------------------------------------------------------------------
-- Read from pg_constraint through the read-only MCP connection. Every foreign
-- key from a money table to its parent was ON DELETE CASCADE:
--
--   client_contracts.automation_client_id → clients       CASCADE
--   client_contracts.web_client_id        → web_clients   CASCADE
--   payments.automation_client_id         → clients       CASCADE
--   payments.web_client_id                → web_clients   CASCADE
--   cost_checks.cost_id                   → costs         CASCADE
--   client_contracts.supersedes_id        → client_contracts   NO ACTION
--
-- So `delete from clients where id = …` removed the client's signed contract
-- and every payment it made, in one statement, with no error. The same went
-- for a web client and, one level down, deleting a cost erased every record
-- that somebody had confirmed its price.
--
-- 🔒 THE RULE: nothing that records money or a signed contract can disappear
-- because its parent was deleted. RESTRICT is the default for anything
-- financial, and an exception needs a reason written next to it. There are
-- no exceptions in this file.
--
-- ---------------------------------------------------------------------------
-- 🔴 WHY NOTHING ELSE ALREADY STOPPED IT
-- ---------------------------------------------------------------------------
-- * THE PRIVILEGE. `0046` revokes DELETE on these tables from every API role.
--   PostgreSQL carries out a referential action with the rights of the
--   referencing table's OWNER (ri_triggers.c), not the rights of the role that
--   deleted the parent. So a revoke on the child does not reach a cascade.
--   That is PostgreSQL's documented design, and it has NOT been witnessed on
--   this database.
-- * THE TRIGGER. The repository's `0042` puts a BEFORE UPDATE OR DELETE
--   trigger on client_contracts, and a cascaded delete WOULD fire it. But the
--   database does not have that trigger. Its only trigger on client_contracts
--   is `client_contracts_freeze_trg`, BEFORE UPDATE only, which appears
--   nowhere in this repository. See docs/deployed-schema-observed.md.
--   payments and cost_checks have no triggers at all.
--
-- A delete guard on each table would be a second answer, and a worse one: a
-- trigger fires per row after the cascade has decided to delete, while
-- RESTRICT refuses the parent delete before anything is touched. The foreign
-- key is the right place for the rule, because the foreign key is what
-- decides.
--
-- ---------------------------------------------------------------------------
-- WHY RESTRICT AND NOT NO ACTION
-- ---------------------------------------------------------------------------
-- On a non-deferrable key the two refuse the same deletes. They differ in
-- WHEN the check runs: NO ACTION checks at the end of the statement, so a
-- trigger or a data-modifying CTE in the same statement can quietly re-point
-- the child first. RESTRICT checks immediately and nothing can intervene.
-- A money record should be refused at once, with no window in between.
--
-- supersedes_id changes too, NO ACTION → RESTRICT. It was never a cascade,
-- but "the financial default is RESTRICT" is only a rule if it holds for
-- every key, and a correction chain is financial history: deleting the
-- contract that a correction supersedes would leave the correction pointing
-- at nothing.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES NOT TOUCH
-- ---------------------------------------------------------------------------
-- The other 19 foreign keys into `clients` (leads, messages, events,
-- consent_events, sends, …) still CASCADE. They are not money, so they fall
-- outside this rule, and changing them would break the documented cleanup in
-- docs/concierge-runbook.md ("ZZ TEST — Cascais Demo"), which relies on
-- `delete from clients` taking leads, client_automations and metrics_daily
-- with it. consent_events and sends are records of a different kind. They
-- deserve their own decision rather than a ride in this file.
--
-- ON UPDATE stays NO ACTION everywhere. Every parent key is a generated uuid
-- that nothing updates.
--
-- ---------------------------------------------------------------------------
-- 🔒 THE LOCK
-- ---------------------------------------------------------------------------
-- Adding a foreign key takes SHARE ROW EXCLUSIVE on the PARENT as well as the
-- child, and `clients` is read on every inbound WhatsApp message. The money
-- tables hold 0 rows, so validation is instant. lock_timeout makes the
-- migration give up rather than queue behind a long transaction and block
-- the Concierge while it waits. If it times out, run it again at a quiet
-- moment.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preconditions — proven, not assumed
-- ---------------------------------------------------------------------------
do $$
declare
  expected constant text[][] := array[
    -- constraint, child, child column, parent
    ['client_contracts_automation_client_id_fkey', 'client_contracts', 'automation_client_id', 'clients'],
    ['client_contracts_web_client_id_fkey',        'client_contracts', 'web_client_id',        'web_clients'],
    ['client_contracts_supersedes_id_fkey',        'client_contracts', 'supersedes_id',        'client_contracts'],
    ['payments_automation_client_id_fkey',         'payments',         'automation_client_id', 'clients'],
    ['payments_web_client_id_fkey',                'payments',         'web_client_id',        'web_clients'],
    ['cost_checks_cost_id_fkey',                   'cost_checks',      'cost_id',              'costs']
  ];
  i int;
  n bigint;
  stray text;
begin
  for i in 1 .. array_length(expected, 1) loop
    select count(*) into n
      from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
     where con.contype = 'f'
       and con.conname = expected[i][1]
       and con.conrelid = ('public.' || expected[i][2])::regclass
       and con.confrelid = ('public.' || expected[i][4])::regclass
       and array_length(con.conkey, 1) = 1
       and a.attname = expected[i][3];
    if n <> 1 then
      raise exception
        'REFUSING: % is not the key this file was written against (expected %.% → %). '
        'Re-read the deployed schema before changing it — this project has found the '
        'repository behind the database three times in one day.',
        expected[i][1], expected[i][2], expected[i][3], expected[i][4];
    end if;
  end loop;

  -- 🔒 A key this file does not know about would be left exactly as it is,
  -- and the postcondition below would then refuse. Refusing here says so
  -- earlier, and names the key.
  select string_agg(con.conname, ', ') into stray
    from pg_constraint con
   where con.contype = 'f'
     and con.conrelid in ('public.client_contracts'::regclass, 'public.payments'::regclass,
                          'public.costs'::regclass, 'public.cost_checks'::regclass)
     and con.conname <> all (array(select expected[j][1] from generate_subscripts(expected, 1) j));
  if stray is not null then
    raise exception
      'REFUSING: a money table carries a foreign key this file does not handle: %. '
      'Decide its delete action deliberately and add it here.', stray;
  end if;

  raise notice 'Preconditions proven: the six keys are where this file expects them, and there are no others.';
end $$;

-- ---------------------------------------------------------------------------
-- The change. Same names and columns; only the delete action moves.
-- ---------------------------------------------------------------------------
alter table public.client_contracts
  drop constraint client_contracts_automation_client_id_fkey,
  add  constraint client_contracts_automation_client_id_fkey
       foreign key (automation_client_id) references public.clients(id) on delete restrict,
  drop constraint client_contracts_web_client_id_fkey,
  add  constraint client_contracts_web_client_id_fkey
       foreign key (web_client_id) references public.web_clients(id) on delete restrict,
  drop constraint client_contracts_supersedes_id_fkey,
  add  constraint client_contracts_supersedes_id_fkey
       foreign key (supersedes_id) references public.client_contracts(id) on delete restrict;

alter table public.payments
  drop constraint payments_automation_client_id_fkey,
  add  constraint payments_automation_client_id_fkey
       foreign key (automation_client_id) references public.clients(id) on delete restrict,
  drop constraint payments_web_client_id_fkey,
  add  constraint payments_web_client_id_fkey
       foreign key (web_client_id) references public.web_clients(id) on delete restrict;

alter table public.cost_checks
  drop constraint cost_checks_cost_id_fkey,
  add  constraint cost_checks_cost_id_fkey
       foreign key (cost_id) references public.costs(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- Postcondition — read back from the catalogue, across EVERY key on a money
-- table rather than only the six this file named. If it raises, the whole
-- transaction rolls back and nothing has changed.
-- ---------------------------------------------------------------------------
do $$
declare n_total bigint; n_restrict bigint; wrong text;
begin
  select count(*),
         count(*) filter (where confdeltype = 'r' and confupdtype = 'a' and convalidated),
         -- confdeltype is the one-byte "char" type: without the casts, || is
         -- ambiguous and the block fails before checking anything. Found by
         -- running this block against the live catalogue before the fix.
         string_agg(conname::text || '=' || confdeltype::text, ', ') filter (where confdeltype <> 'r')
    into n_total, n_restrict, wrong
    from pg_constraint
   where contype = 'f'
     and conrelid in ('public.client_contracts'::regclass, 'public.payments'::regclass,
                      'public.costs'::regclass, 'public.cost_checks'::regclass);

  -- 🔒 The count comes first. "No key is anything but RESTRICT" is also true
  -- of zero keys, so a query that matched nothing would pass it.
  if n_total <> 6 then
    raise exception 'REFUSING: expected 6 foreign keys on the money tables, found %.', n_total;
  end if;
  if n_restrict <> 6 then
    raise exception 'REFUSING: % of 6 money keys are RESTRICT and validated. Not RESTRICT: %.',
      n_restrict, coalesce(wrong, '(all RESTRICT — check confupdtype / convalidated)');
  end if;

  raise notice 'All 6 foreign keys on the money tables are ON DELETE RESTRICT, validated.';
end $$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select conname, conrelid::regclass, confrelid::regclass, confdeltype
--     from pg_constraint
--    where contype = 'f'
--      and (conrelid in ('public.client_contracts'::regclass, 'public.payments'::regclass,
--                        'public.costs'::regclass, 'public.cost_checks'::regclass))
--    order by 1;
--   -- expect SIX rows, every confdeltype = 'r'.
--
-- 🔴 AND THEN the foreign keys into `clients` from everything else should
-- still read 'c' (19 of them). This file must not have moved them, and the
-- runbook's test-client cleanup depends on them.
