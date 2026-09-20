-- ====== client_contracts becomes append-only, with supersedes ======
--
-- ALONE, in a transaction, with 0032's treatment: it proves its preconditions
-- before it acts, it names what it found when it refuses, and applying it is a
-- deliberate act rather than a line in a batch.
--
-- ---------------------------------------------------------------------------
-- 🔴 WHY, AND IT IS THE FAILURE THIS SYSTEM KEEPS ARRIVING AT
-- ---------------------------------------------------------------------------
-- `client_contracts` today carries `updated_at` and no supersedes column, so a
-- fee correction is an UPDATE. That means:
--
--   "WHAT DID WE EARN IN JANUARY" HAS A DIFFERENT ANSWER DEPENDING ON WHEN YOU
--   ASK, AND NOTHING RECORDS THAT IT CHANGED.
--
-- Which is the stale-record failure, on the one page whose entire subject is
-- the past. The Month cannot promise that a past month's figure never moves
-- while a row underneath it can be edited — and a page that can make that
-- promise is a different page from one that cannot, not a better version of
-- the same one.
--
-- 🔒 SAME SHAPE AS TWO THINGS ALREADY BUILT, AND THE PATTERN IS REUSED RATHER
-- THAN REDESIGNED:
--
--   `consent_events` (0012)  a ledger of what was said. A correction is a new
--                            event, never an edit.
--   `sends` (0017)           the allowlist freeze: what authorised a send is
--                            copied at decision time and frozen, because a
--                            decision's inputs must not change after it.
--
-- A contract is a record of what was agreed AT A MOMENT. A correction is a new
-- row that supersedes it.
--
-- ---------------------------------------------------------------------------
-- WHY NOW IS THE CHEAPEST MOMENT
-- ---------------------------------------------------------------------------
-- The table is EMPTY — 0 rows, verified 21 September 2026 before this was
-- written. No backfill, no existing row that could violate the new shape, and
-- no decision about what to do with a contract somebody already edited. The
-- precondition below proves it rather than trusting it, because "it was empty
-- when I looked" and "it is empty now" are different claims.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS LEAVES BEHIND, DELIBERATELY
-- ---------------------------------------------------------------------------
-- `updated_at` becomes dead the moment this applies: nothing can update the
-- row, so it can only ever equal `created_at`. It is NOT dropped here — one
-- migration, one act — and it is owed a `0032`-treatment drop of its own,
-- proving no row has a value differing from `created_at` first.
--
-- 🔴 A column that cannot change but looks like it can is exactly the shape of
-- `client_automations.health`, which read 'unknown' for every row and always
-- had. Leaving it unnamed is how that happened; naming it here is the
-- difference.

begin;

do $$
declare
  n_table bigint;
  n_col   bigint;
  n_rows  bigint;
begin
  select count(*) into n_table from information_schema.tables
   where table_schema = 'public' and table_name = 'client_contracts';
  if n_table = 0 then
    raise exception
      'REFUSING: public.client_contracts does not exist. This migration freezes a '
      'table it expects to find already applied — see docs/the-month-migrations.md.';
  end if;

  select count(*) into n_col from information_schema.columns
   where table_schema = 'public' and table_name = 'client_contracts'
     and column_name in ('supersedes_id', 'supersedes', 'superseded_by');
  if n_col > 0 then
    raise exception
      'REFUSING: client_contracts already has a supersedes-shaped column. Nothing has '
      'been altered. Look at what is in it and what writes it before adding another — '
      'two columns meaning "this row was corrected" is two answers to one question.';
  end if;

  -- 🔴 Proven, not trusted. An existing row is not a reason to refuse in
  -- itself, but it IS a reason for a person to decide: a contract already
  -- edited has a history this migration cannot reconstruct.
  select count(*) into n_rows from public.client_contracts;
  if n_rows > 0 then
    raise exception
      'REFUSING: client_contracts holds % row(s). This migration was written against an '
      'EMPTY table, where freezing costs nothing. With rows present, decide first what '
      'happens to any contract that has already been edited — `updated_at` differing from '
      '`created_at` is the evidence — because after this, that history can never be '
      'recorded.',
      n_rows;
  end if;

  -- 🔴 NOT a precondition failure, and deliberately not one. A relation called
  -- `client_contracts_current` already exists in production, created by a
  -- migration this repository does not hold. This migration no longer wants
  -- that name, so it neither needs it nor touches it.
  raise notice 'Preconditions proven, not assumed: table present, no supersedes column, 0 rows.';
end $$;

-- ---------------------------------------------------------------------------
-- The correction path
-- ---------------------------------------------------------------------------
alter table public.client_contracts
  add column supersedes_id uuid references public.client_contracts(id) on delete restrict;

comment on column public.client_contracts.supersedes_id is
  'The contract row this one corrects. Null on an original. It points BACKWARDS because '
  'this table is append-only: a superseded_by column would need an UPDATE, which the '
  'trigger below refuses. Uncorrected therefore means no other row supersedes me — read '
  'the view client_contracts_uncorrected, never this table directly, for anything that '
  'counts money. The view is NOT called _current: that would read as "covering today", and '
  'a caller summing it for January would get rows in force now.';

-- A row cannot correct itself.
alter table public.client_contracts
  drop constraint if exists contract_supersedes_another;
alter table public.client_contracts
  add constraint contract_supersedes_another
  check (supersedes_id is distinct from id);

-- 🔒 ONE CORRECTION PER ROW. Without this, two rows could both supersede the
-- same contract and both be uncorrected, so that month would be counted twice —
-- the exact failure the view exists to prevent, arriving through the back.
create unique index client_contracts_one_correction_each
  on public.client_contracts (supersedes_id)
  where supersedes_id is not null;

-- The index the uncorrected predicate needs. `not exists (… where supersedes_id
-- = c.id)` is an anti-join, and without this it is a sequential scan of the
-- whole table for every row.
create index client_contracts_supersedes_lookup
  on public.client_contracts (supersedes_id);

-- ---------------------------------------------------------------------------
-- 🔴 THE VIEW THAT KNOWS WHICH ROWS HAVE NOT BEEN CORRECTED
-- ---------------------------------------------------------------------------
-- Without it every caller writes its own NOT EXISTS, and the first one to
-- forget double-counts a corrected contract into a month's revenue — a figure
-- wrong in the direction that flatters, on the page the operator trusts most.
--
-- 🔴 IT IS `_uncorrected` AND NOT `_current`, AND THAT IS NOT A STYLE CHOICE.
--
-- "Current" is ambiguous in exactly the dangerous direction: it reads equally
-- as *not superseded* and as *covering today's date*. A caller who takes the
-- second meaning and sums the view for January gets rows in force TODAY, which
-- is a wrong figure that looks entirely right — the same class as every
-- stale-record defect this project has found, arriving through a name.
--
-- `_uncorrected` can only mean one thing: rows no other row supersedes. It
-- says nothing about dates, so nobody can read a date claim out of it.
--
-- (Found because a relation named `client_contracts_current` already exists in
-- production and `create or replace view` cannot replace it — the collision
-- forced a rename the name deserved on its own. The existing relation is NOT
-- dropped: nothing in this repository reads it, and an object created by a
-- migration this repository does not have is not one to delete for a name.)
create or replace view public.client_contracts_uncorrected as
  select c.*
    from public.client_contracts c
   where not exists (
     select 1 from public.client_contracts s where s.supersedes_id = c.id
   );

comment on view public.client_contracts_uncorrected is
  'The contracts that have not been corrected. EVERY revenue figure reads this, never the '
  'base table: a superseded row still carries its period and its fee, so summing the base '
  'table double-counts every correction ever made.';

-- ---------------------------------------------------------------------------
-- APPEND-ONLY — 0012's mechanism, unchanged
-- ---------------------------------------------------------------------------
create or replace function public.client_contracts_append_only()
returns trigger language plpgsql as $$
begin
  raise exception
    'client_contracts is append-only: % refused. A correction is a NEW row whose '
    'supersedes_id points at the one it replaces — editing a contract rewrites what we '
    'say was agreed, and makes "what did we earn in January" depend on when you ask.',
    tg_op;
end;
$$;

drop trigger if exists client_contracts_no_update on public.client_contracts;
create trigger client_contracts_no_update
  before update or delete on public.client_contracts
  for each row execute function public.client_contracts_append_only();

-- TRUNCATE does not fire a row-level trigger, and would empty the table
-- without tripping the guard above.
drop trigger if exists client_contracts_no_truncate on public.client_contracts;
create trigger client_contracts_no_truncate
  before truncate on public.client_contracts
  for each statement execute function public.client_contracts_append_only();

-- The belt. 0002 set ALTER DEFAULT PRIVILEGES for service_role on this schema,
-- so a table created here INHERITS update and delete without anyone asking.
-- Both are needed: a future default-privileges change can silently restore
-- what the revoke took away, and a future superuser session can drop a trigger.
revoke update, delete, truncate on public.client_contracts from service_role;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select privilege_type from information_schema.table_privileges
--    where table_name = 'client_contracts' and grantee = 'service_role'
--    order by privilege_type;
--   -- expect: INSERT, SELECT (and REFERENCES/TRIGGER). No UPDATE, no DELETE,
--   --         no TRUNCATE.
--
--   select count(*) from public.client_contracts_uncorrected;   -- expect: 0
--
--   select indexname from pg_indexes
--    where tablename = 'client_contracts' and indexname like '%supersedes%'
--       or indexname like '%one_correction%';
--   -- expect: client_contracts_one_correction_each, client_contracts_supersedes_lookup
--
-- ---------------------------------------------------------------------------
-- 🔴 THE OVERLAP THIS SCHEMA STILL CANNOT CONSTRAIN
-- ---------------------------------------------------------------------------
-- Two UNCORRECTED contracts for one client with overlapping periods double-count
-- that client's revenue for every shared month. It cannot be an exclusion
-- constraint, because "uncorrected" is a NOT EXISTS over this same table and a
-- constraint cannot query the table it constrains.
--
-- So it is a reconciliation somebody runs, and the cockpit's suite carries it:
--
--   select a.automation_client_id, a.id, b.id
--     from public.client_contracts_uncorrected a
--     join public.client_contracts_uncorrected b
--       on a.automation_client_id = b.automation_client_id and a.id < b.id
--    where daterange(a.starts_on, a.ends_on, '[]')
--       && daterange(b.starts_on, b.ends_on, '[]');
--   -- expect: no rows. Any row is a month counted twice.
--
-- ---------------------------------------------------------------------------
-- THE REFUSALS, PROVEN RATHER THAN TRUSTED
-- ---------------------------------------------------------------------------
-- db/tests/0042_client_contracts_append_only.test.sql. Run it BEFORE applying.
