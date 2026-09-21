-- ====== client_contracts: the whole append-only protection, stated once ======
--
-- ALONE, in a transaction, with 0032's treatment.
--
-- 🔴 NOT APPLIED. Manuel runs this by hand in the Supabase SQL editor, after
-- db/tests/0050_client_contracts_append_only_end_state.test.sql has been run
-- BEFORE it (expected verdicts listed in that file) and is run again AFTER it
-- and returns PASS on every row.
--
-- Declarative in the way 0046 is: this file is the whole answer to "what
-- protects client_contracts", not a delta against whichever version happens
-- to be deployed. Applied to the repository's 0042 or to what is actually
-- deployed, the end state is the same.
--
-- ---------------------------------------------------------------------------
-- 🔴 WHAT IS DEPLOYED, READ 21 SEPTEMBER 2026 THROUGH THE READ-ONLY MCP
-- ---------------------------------------------------------------------------
-- ONE trigger on the table: client_contracts_freeze_trg, BEFORE UPDATE, FOR
-- EACH ROW, calling client_contracts_freeze(). That function is an ALLOWLIST
-- freeze in this repository's own idiom (0017, 0020, 0025): it refuses a
-- change to any column except superseded_at, superseded_by and updated_at,
-- and stamps updated_at.
--   * No DELETE trigger. No TRUNCATE trigger.
--   * The view client_contracts_uncorrected filters on
--     `superseded_at IS NULL`.
--   * So the deployed correction model is: insert the new row, then UPDATE
--     the old one to stamp superseded_at.
--
-- The repository's 0042 describes a different model: fully append-only (no
-- UPDATE of any column, no DELETE, no TRUNCATE, by trigger), a correction is
-- ONLY an insert carrying supersedes_id, and the view is an anti-join. None of
-- 0042's triggers or its function exist in the database. Nothing in git
-- history, the working tree, unreachable objects or local session transcripts
-- names client_contracts_freeze before 21 September's MCP reading. Its origin
-- is unrecorded, and this file does not guess at it.
--
-- ---------------------------------------------------------------------------
-- 🔴 WHY THE DEPLOYED MODEL CANNOT STAND, WHOEVER WROTE IT
-- ---------------------------------------------------------------------------
-- 1. IT CANNOT BE USED. 0046 (verified live) gives service_role INSERT and
--    SELECT on client_contracts and NO UPDATE. The stamping step is an
--    UPDATE, so the application cannot perform it. An application correction
--    is therefore an insert alone, and the view, filtering on a stamp nobody
--    can write, shows BOTH rows. That month is counted twice, on the page the
--    operator trusts most.
-- 2. EVEN WITH UPDATE, NOTHING TIES THE TWO HALVES TOGETHER. The unique index
--    reads supersedes_id and the view reads superseded_at. A correction whose
--    second step is forgotten, or fails, double-counts. That is a two-phase
--    write with no transaction around it. The anti-join has one fact and so
--    cannot disagree with itself.
-- 3. DELETE AND TRUNCATE ARE GUARDED BY PRIVILEGE ALONE. That is the "belt
--    with no guarantee" arrangement 0012 refuses and 0048 exists to close on
--    listing_matches.
--
-- ---------------------------------------------------------------------------
-- THE END STATE THIS FILE ESTABLISHES
-- ---------------------------------------------------------------------------
-- * GUARANTEE: one function, client_contracts_append_only(), which raises
--   unconditionally, so it is safe on a statement trigger. Two triggers:
--   BEFORE UPDATE OR DELETE for each row, and BEFORE TRUNCATE for each
--   statement. The deployed freeze trigger and function are dropped.
-- * THE CORRECTION PATH: an INSERT whose supersedes_id names the row it
--   corrects. Unchanged, and already guarded by client_contracts_one_correction_each
--   and contract_does_not_supersede_itself, which both exist.
-- * THE VIEW: an anti-join on supersedes_id, with the same columns in the same
--   order, still security_invoker, still read-only.
-- * THE STAMP COLUMNS: superseded_at and superseded_by can no longer be
--   written, because no UPDATE survives, so a CHECK makes them provably empty
--   rather than quietly dead. 🔒 They, and updated_at, are OWED A DROP with
--   0032's treatment. Not here: a drop changes the view's shape and deserves
--   its own file.
-- * THE BELT, restated for the write verbs exactly as 0046 intends it:
--   service_role SELECT and INSERT; nobody UPDATE, DELETE or TRUNCATE.
--   REFERENCES and TRIGGER are left as 0046 left them.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preconditions — proven, not assumed
-- ---------------------------------------------------------------------------
do $$
declare n_rows bigint; n_cols bigint;
begin
  if to_regclass('public.client_contracts') is null then
    raise exception 'REFUSING: public.client_contracts does not exist.';
  end if;
  if to_regclass('public.client_contracts_uncorrected') is null then
    raise exception 'REFUSING: public.client_contracts_uncorrected does not exist; this file replaces its predicate, it does not create it.';
  end if;

  select count(*) into n_cols from information_schema.columns
   where table_schema = 'public' and table_name = 'client_contracts'
     and column_name in ('supersedes_id', 'superseded_at', 'superseded_by');
  if n_cols <> 3 then
    raise exception
      'REFUSING: expected supersedes_id, superseded_at and superseded_by on client_contracts, '
      'found % of them. Re-read the deployed schema before changing it.', n_cols;
  end if;

  -- 🔴 Written against an EMPTY table, where changing the view's predicate
  -- changes no figure. With rows present, the old predicate and the new one
  -- can disagree about which contracts count, and that is a decision for a
  -- person with the rows in front of them, not for a migration.
  select count(*) into n_rows from public.client_contracts;
  if n_rows > 0 then
    raise exception
      'REFUSING: client_contracts holds % row(s). Compare, row by row, what the stamp predicate '
      '(superseded_at is null) and the anti-join (no row supersedes it) each call uncorrected '
      'before changing which one the view uses.', n_rows;
  end if;

  raise notice 'Preconditions proven: both relations present, the three supersession columns present, 0 rows.';
end $$;

-- ---------------------------------------------------------------------------
-- The guarantee
-- ---------------------------------------------------------------------------
create or replace function public.client_contracts_append_only()
returns trigger language plpgsql as $$
begin
  -- Unconditional: touches neither OLD nor NEW, so it is safe on the
  -- statement-level TRUNCATE trigger as well as the row trigger.
  raise exception
    'client_contracts is append-only: % refused. A correction is a NEW row whose '
    'supersedes_id points at the one it replaces. Editing a contract rewrites what we '
    'say was agreed, and makes "what did we earn in January" depend on when you ask.',
    tg_op;
end;
$$;

-- Everything that has ever guarded this table, under any name, goes first:
-- the deployed freeze, and 0042's names in case any environment has them.
drop trigger if exists client_contracts_freeze_trg   on public.client_contracts;
drop trigger if exists client_contracts_no_update    on public.client_contracts;
drop trigger if exists client_contracts_no_truncate  on public.client_contracts;
drop function if exists public.client_contracts_freeze();

drop trigger if exists client_contracts_append_only_row      on public.client_contracts;
drop trigger if exists client_contracts_append_only_truncate on public.client_contracts;

create trigger client_contracts_append_only_row
  before update or delete on public.client_contracts
  for each row execute function public.client_contracts_append_only();

-- TRUNCATE fires no row trigger, and would empty the table past the one above.
create trigger client_contracts_append_only_truncate
  before truncate on public.client_contracts
  for each statement execute function public.client_contracts_append_only();

-- ---------------------------------------------------------------------------
-- The stamp columns, which nothing can now write, are provably empty
-- ---------------------------------------------------------------------------
alter table public.client_contracts drop constraint if exists contract_is_never_stamped;
alter table public.client_contracts
  add constraint contract_is_never_stamped
  check (superseded_at is null and superseded_by is null);

comment on column public.client_contracts.superseded_at is
  'DEAD since 0050: always null (contract_is_never_stamped). A correction is recorded by the '
  'NEW row''s supersedes_id, never by stamping the old one. Owed a drop.';
comment on column public.client_contracts.superseded_by is
  'DEAD since 0050: always null (contract_is_never_stamped). Owed a drop.';

-- ---------------------------------------------------------------------------
-- The view: same columns, same order, one fact instead of two
-- ---------------------------------------------------------------------------
create or replace view public.client_contracts_uncorrected
  with (security_invoker = true)
as
  select c.id, c.automation_client_id, c.web_client_id, c.monthly_eur, c.setup_eur,
         c.setup_terms, c.starts_on, c.ends_on, c.automations, c.signed_by,
         c.recorded_by, c.recorded_at, c.created_at, c.updated_at, c.supersedes_id,
         c.superseded_at, c.superseded_by
    from public.client_contracts c
   where not exists (
     select 1 from public.client_contracts s where s.supersedes_id = c.id
   );

comment on view public.client_contracts_uncorrected is
  'The contracts no other row supersedes. EVERY revenue figure reads this, never the base '
  'table: a superseded row still carries its period and its fee. Not called _current, which '
  'would read as "covering today".';

-- ---------------------------------------------------------------------------
-- The belt: the write verbs, restated whole (0045 for the view, 0046 for the table)
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on public.client_contracts
  from public, anon, authenticated;
revoke update, delete, truncate on public.client_contracts from service_role;
grant select, insert on public.client_contracts to service_role;

revoke insert, update, delete, truncate on public.client_contracts_uncorrected
  from public, anon, authenticated, service_role;
grant select on public.client_contracts_uncorrected to service_role;

-- ---------------------------------------------------------------------------
-- Postcondition — read back from the catalogue. If it raises, nothing above
-- has happened.
-- ---------------------------------------------------------------------------
do $$
declare triggers text; n_freeze bigint; opts text; belt text;
begin
  -- tgtype bits: 1 row, 2 before, 8 delete, 16 update, 32 truncate.
  -- tgenabled 'O' = enabled: a disabled trigger is a guard that looks present.
  select string_agg(format('%s/%s/%s/%s', t.tgname, t.tgtype, t.tgenabled, t.tgfoid::regproc), ', ' order by t.tgname)
    into triggers
    from pg_trigger t
   where t.tgrelid = 'public.client_contracts'::regclass and not t.tgisinternal;
  if triggers is distinct from
     'client_contracts_append_only_row/27/O/client_contracts_append_only, '
     'client_contracts_append_only_truncate/34/O/client_contracts_append_only' then
    raise exception 'REFUSING: the triggers on client_contracts are not the end state. Found: %', triggers;
  end if;

  select count(*) into n_freeze from pg_proc
   where proname = 'client_contracts_freeze' and pronamespace = 'public'::regnamespace;
  if n_freeze <> 0 then
    raise exception 'REFUSING: client_contracts_freeze() still exists.';
  end if;

  select array_to_string(reloptions, ',') into opts from pg_class
   where oid = 'public.client_contracts_uncorrected'::regclass;
  if opts is distinct from 'security_invoker=true' then
    raise exception 'REFUSING: the view lost security_invoker (options: %). 0045''s hole would be open again.', opts;
  end if;

  select string_agg(format('%s %s %s', r, rel, v), '; ') into belt
    from unnest(array['anon','authenticated','service_role']) r,
         unnest(array['public.client_contracts','public.client_contracts_uncorrected']) rel,
         unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) v
   where has_table_privilege(r, rel, v)
     and not (r = 'service_role' and rel = 'public.client_contracts' and v = 'INSERT');
  if belt is not null then
    raise exception 'REFUSING: write privileges survive beyond service_role INSERT on the table: %', belt;
  end if;
  if not has_table_privilege('service_role', 'public.client_contracts', 'INSERT')
     or not has_table_privilege('service_role', 'public.client_contracts_uncorrected', 'SELECT') then
    raise exception 'REFUSING: service_role lost INSERT on the table or SELECT on the view. A revoke one word too wide.';
  end if;

  raise notice 'End state proven: two triggers enabled, freeze gone, view security_invoker, belt exact.';
end $$;

commit;
