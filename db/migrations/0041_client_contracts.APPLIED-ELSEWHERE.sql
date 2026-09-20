-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  🔴 DO NOT RUN THIS FILE. IT IS NOT WHAT IS DEPLOYED.                   ║
-- ╚═════════════════════════════════════════════════════════════════════════╝
--
-- `client_contracts` EXISTS IN PRODUCTION and was created by something other
-- than this file, on 21 September 2026. Verified through PostgREST rather than
-- taken from anybody's account of it:
--
--   the applied table has   automation_client_id, web_client_id, monthly_eur,
--                           setup_eur, setup_terms, starts_on, ends_on,
--                           automations, signed_by, recorded_by, recorded_at,
--                           created_at, updated_at
--   THIS FILE declares      client_id  — a column production does not have
--   and it creates          client_contracts_current — a view that does not
--                           exist in production
--
-- So the repository was BEHIND production and describing a different schema.
-- This file is kept as the record of what was designed and why — its reasoning
-- about contract periods, RESTRICT over CASCADE, and no defaults on money is
-- still the reasoning The Month is built on — and renamed so that nobody runs
-- it. Running it would refuse at its own precondition ("already exists"),
-- which is the precondition working, but the refusal would be the first anyone
-- heard of the divergence.
--
-- 🔒 WHAT ACTUALLY CLOSES THE GAP is `0042_client_contracts_append_only.sql`,
-- written against the schema as observed: it adds supersedes_id, the view, and
-- the freeze that this file would have provided at creation.
--
-- Lesson §1s, one level up: a fact preserved carefully in one place — the
-- repository's record of the schema — and overtaken somewhere else, with
-- neither the file nor the database wrong on its own terms.
--
-- ───────────────────────────────────────────────────────────────────────────
-- THE ORIGINAL FILE FOLLOWS, UNCHANGED.
-- ───────────────────────────────────────────────────────────────────────────

-- ============ client_contracts — what an agency agreed to pay ============
--
-- ALONE, in a transaction, with 0032's treatment: it proves its preconditions
-- before it acts, it names what it found when it refuses, and applying it is a
-- deliberate act rather than a line in a batch.
--
-- docs/the-month-migrations.md is the design. This is the first of six.
--
-- ---------------------------------------------------------------------------
-- 🔴 WHY A TABLE AND NOT A COLUMN
-- ---------------------------------------------------------------------------
-- `clients.monthly_fee_eur` exists and nothing has ever written to it. The
-- temptation is to start writing it, and it is wrong for one reason:
--
--   REVENUE IS DERIVED FROM CONTRACT PERIODS, NEVER FROM WHO IS ACTIVE TODAY.
--
-- `clients.status` is free text with no dates. With a fee on the client row,
-- "what did we earn in January" can only be answered by asking who is active
-- NOW — so a client who churns in March makes January's revenue drop
-- retroactively, and the progression chart lies about the past. Silently, and
-- in a direction nobody would think to check.
--
-- A month's recurring revenue is the sum over the periods covering that month.
-- History is then stable BY CONSTRUCTION. 0043 drops the column, after this
-- lands and after the cockpit reads this instead.
--
-- ---------------------------------------------------------------------------
-- 🔴 APPEND-ONLY, WHICH DECIDES HOW A CORRECTION WORKS
-- ---------------------------------------------------------------------------
-- A contract is a record of what was agreed. Editing one rewrites what we say
-- we agreed, and the only evidence that it ever said something else is gone.
-- So: 0012's mechanism, unchanged — a row trigger on update and delete, a
-- statement trigger on truncate, AND a revoke. All three, for 0012's own
-- stated reasons: the trigger is the guarantee, the revoke is the belt, a
-- future default-privileges change can restore what the revoke took away, and
-- a future superuser session can drop a trigger.
--
-- 🔒 AND THAT IS WHY IT IS `supersedes` AND NOT `superseded_by`.
--
-- `lead_requirements` (0026) carries `superseded_by` and reads
-- `where superseded_by is null`, which is the nicer shape: "current" is a
-- column, and a partial index can constrain it. It works there because that
-- table is NOT append-only — recording a correction updates the old row.
--
-- Here that update is forbidden by the trigger above. A correction can only be
-- an INSERT, so the new row points backwards. "Current" therefore means *no
-- other row supersedes me*, which is a NOT EXISTS rather than a column test —
-- and that is exactly the kind of predicate every caller re-derives slightly
-- differently until two screens disagree. So this migration also creates the
-- view that knows it, and nothing computes revenue from the base table.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATELY NOT HERE
-- ---------------------------------------------------------------------------
--   a currency column   euros only, every money column named `_eur`. A
--                       currency column nobody sets would default to 'EUR',
--                       no code would branch on it, and the first sterling
--                       invoice would set it and find nothing had read it.
--   structured setup instalments
--                       `setup_terms` is text. The shape of a real instalment
--                       plan is what a first contract teaches, and inventing
--                       one now means discovering the first real one does not
--                       fit it. Recorded against `first_client` in
--                       cockpit/src/lib/gates.ts.
--   any DEFAULT on money or dates
--                       lesson 13: a default asserts an answer nobody gave. A
--                       contract with `monthly_fee_eur default 0` claims an
--                       agreement worth nothing.

begin;

do $$
declare
  n_clients bigint;
  n_self    bigint;
begin
  select count(*) into n_clients from information_schema.tables
   where table_schema = 'public' and table_name = 'clients';
  if n_clients = 0 then
    raise exception 'REFUSING: public.clients does not exist. 0001 comes first.';
  end if;

  select count(*) into n_self from information_schema.tables
   where table_schema = 'public' and table_name = 'client_contracts';
  if n_self > 0 then
    raise exception
      'REFUSING: public.client_contracts already exists. Nothing has been altered. '
      'Look at what is in it before deciding whether it means the same thing this '
      'migration means — an append-only record of what an agency agreed to pay, '
      'from which monthly revenue is derived by period.';
  end if;

  raise notice 'Preconditions proven, not assumed. Creating client_contracts.';
end $$;

create table public.client_contracts (
  id uuid primary key default gen_random_uuid(),

  -- 🔴 RESTRICT, never CASCADE. A contract outlives the client row: deleting a
  -- client must not erase the record that they were ever billed, and the
  -- refusal is the point — it forces somebody to decide what to do with the
  -- financial history rather than losing it as a side effect.
  client_id uuid not null references public.clients(id) on delete restrict,

  starts_on date not null,
  ends_on   date,

  -- Net of VAT. The cockpit never computes VAT and never presents its own
  -- figure as the legal record of revenue — that is the AT-certified
  -- invoicing software.
  monthly_fee_eur numeric(10,2) not null,
  setup_fee_eur   numeric(10,2) not null,
  setup_terms     text,

  -- The five automation keys 0001 seeds. A text array rather than a join
  -- table because the relationship carries no attributes of its own: a
  -- contract either covers an automation or does not.
  automations text[] not null,

  -- §1.10: an act by a person carries who and when.
  recorded_by text not null,
  recorded_at timestamptz not null default now(),

  -- The row this one corrects. Null on an original.
  supersedes uuid references public.client_contracts(id) on delete restrict,

  constraint contract_period_is_a_period
    check (ends_on is null or ends_on >= starts_on),

  -- Zero is a legitimate setup fee and a legitimate monthly fee for a pilot.
  -- Negative is not, and would silently reduce a month's revenue.
  constraint contract_fees_not_negative
    check (monthly_fee_eur >= 0 and setup_fee_eur >= 0),

  constraint contract_covers_something
    check (array_length(automations, 1) >= 1),

  -- 🔒 What the CHECK buys that a join table would: refusing a key that does
  -- not exist. A typo here is a contract that covers nothing the system can
  -- find, and it would be invisible until somebody asked why an automation
  -- was never billed.
  constraint contract_automations_are_real
    check (automations <@ array[
      'inbound_concierge', 'db_reactivation', 'lead_nurture',
      'listing_launch', 'reputation_loop'
    ]::text[]),

  constraint contract_recorded_by_is_somebody
    check (length(btrim(recorded_by)) > 0),

  -- A row cannot correct itself.
  constraint contract_supersedes_another check (supersedes is distinct from id)
);

comment on table public.client_contracts is
  'Append-only. What an agency agreed to pay, and for which period. Monthly revenue is '
  'derived by summing the periods covering a month, NEVER from clients.status — which has '
  'no dates, so recomputing "who is active" would make a past month''s revenue change when '
  'a client churns. A correction is a new row whose supersedes points at the old one; read '
  'client_contracts_current, never this table directly, for anything that counts money.';

comment on column public.client_contracts.monthly_fee_eur is
  'Euros, NET OF VAT. The cockpit never computes VAT and never presents its own figure as '
  'the legal record of revenue.';
comment on column public.client_contracts.setup_fee_eur is
  'Euros, net of VAT. The total agreed; what has actually arrived is client_payments (0042).';
comment on column public.client_contracts.setup_terms is
  'The instalment plan, as free text, deliberately unstructured until a first real contract '
  'shows what shape one takes. See gates.ts, first_client.';
comment on column public.client_contracts.supersedes is
  'The row this one corrects. Null on an original. It points BACKWARDS because this table is '
  'append-only: a superseded_by column would need an UPDATE, which the trigger below refuses.';

create index client_contracts_by_client on public.client_contracts (client_id, starts_on desc);
create index client_contracts_supersedes on public.client_contracts (supersedes)
  where supersedes is not null;

-- ---------------------------------------------------------------------------
-- 🔴 THE VIEW THAT KNOWS WHAT "CURRENT" MEANS
-- ---------------------------------------------------------------------------
-- Without it, every caller writes its own NOT EXISTS, and the first one to
-- forget double-counts a corrected contract into a month's revenue — a figure
-- that is wrong in the direction that flatters, on the page the operator
-- trusts most. improvements §1s: one fact, one place that knows it.
create view public.client_contracts_current as
  select c.*
    from public.client_contracts c
   where not exists (
     select 1 from public.client_contracts s where s.supersedes = c.id
   );

comment on view public.client_contracts_current is
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
    'supersedes points at the one it replaces — editing a contract rewrites what we '
    'say was agreed and destroys the only evidence it ever said otherwise.',
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
revoke update, delete, truncate on public.client_contracts from service_role;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select count(*) from public.client_contracts;          -- expect: 0
--   select count(*) from public.client_contracts_current;  -- expect: 0
--
--   select privilege_type from information_schema.table_privileges
--    where table_name = 'client_contracts' and grantee = 'service_role';
--   -- expect: INSERT and SELECT only. No UPDATE, no DELETE, no TRUNCATE.
--
--   select column_name, column_default, is_nullable
--     from information_schema.columns
--    where table_name = 'client_contracts' and column_name like '%_eur';
--   -- expect: both NOT NULL with NO DEFAULT. A default would assert an
--   --         agreement nobody made.
--
-- ---------------------------------------------------------------------------
-- 🔴 THE OVERLAP THIS SCHEMA CANNOT CONSTRAIN, AND HOW TO SEE IT
-- ---------------------------------------------------------------------------
-- Two CURRENT contracts for one client with overlapping periods would
-- double-count that client's revenue for every month they share. It cannot be
-- an exclusion constraint, because "current" is a NOT EXISTS over this same
-- table rather than a column, and a constraint cannot query the table it is
-- constraining.
--
-- So it is a check somebody RUNS, and the cockpit's suite will carry it as a
-- reconciliation rather than an invariant:
--
--   select a.client_id, a.id, b.id
--     from public.client_contracts_current a
--     join public.client_contracts_current b
--       on a.client_id = b.client_id and a.id < b.id
--    where daterange(a.starts_on, a.ends_on, '[]')
--       && daterange(b.starts_on, b.ends_on, '[]');
--   -- expect: no rows. Any row is a month counted twice.
--
-- ---------------------------------------------------------------------------
-- THE REFUSALS, PROVEN RATHER THAN TRUSTED
-- ---------------------------------------------------------------------------
-- db/tests/0041_client_contracts.test.sql runs all of it in rolled-back
-- transactions. Run it BEFORE applying this file.
