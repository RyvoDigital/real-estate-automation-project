-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  🔴 DO NOT RUN. SUPERSEDED BY WHAT IS ACTUALLY DEPLOYED.                ║
-- ╚═════════════════════════════════════════════════════════════════════════╝
--
-- Written 21 September 2026 against a `payments` table carrying two dates —
-- invoiced_on and received_on. The deployed table has since gained a richer
-- model, verified through PostgREST:
--
--   settled_on, settled_amount_eur, settled_method, settled_reference,
--   written_off_on, written_off_by
--
-- Which is BETTER than what this file assumed, in a way worth naming: with a
-- single `received_on`, a part payment is inexpressible — 600 arriving against
-- an invoice of 650 either reads as paid in full or as not paid at all.
-- `settled_amount_eur` makes a part payment a FACT rather than a rounding
-- error, and `written_off_on` makes giving up a decision somebody took rather
-- than a row that quietly stays outstanding forever.
--
-- This file's freeze knows nothing about those six columns, so applying it
-- would protect the old fields and leave the new ones editable — the worst of
-- both: a table that looks frozen and is not.
--
-- 🔒 ITS REASONING STILL STANDS and is why 0044 exists: a payment is NOT
-- 0012-append-only, because settlement arrives weeks after invoicing and must
-- be recordable against the same row. 0017's partial freeze is the right
-- pattern; only the column list was wrong.
--
-- ───────────────────────────────────────────────────────────────────────────
-- THE ORIGINAL FILE FOLLOWS, UNCHANGED.
-- ───────────────────────────────────────────────────────────────────────────

-- ====== payments: what may change after the fact, and what may not ======
--
-- ALONE, in a transaction, with 0032's treatment.
--
-- ---------------------------------------------------------------------------
-- 🔴 THIS IS **NOT** 0012'S FREEZE, AND GETTING THAT WRONG WOULD BREAK THE
--    ONLY RECURRING ENTRY THE OPERATOR MAKES
-- ---------------------------------------------------------------------------
-- `client_contracts` (0042) is append-only outright: a contract is a record of
-- what was agreed at a moment, and nothing about it legitimately changes.
--
-- A payment is different in a way the table already shows. It carries TWO
-- dates, both nullable:
--
--   invoiced_on   we asked for the money
--   received_on   the money arrived
--
-- Those are the two facts the operator asked for — *paid and owed are two
-- facts, never one total* — and they are separated in TIME as well as in
-- meaning. An invoice is raised, and weeks later it is paid. **Filling
-- `received_on` is a legitimate UPDATE to an existing row**, and a 0012-style
-- freeze would refuse it, making a payment impossible to mark as received
-- without deleting and re-entering it — which is worse than no freeze at all.
--
-- 🔒 SO THIS IS 0017'S PATTERN, NOT 0012'S. `sends` already does exactly this:
-- *"attempts / last_attempt_at / last_error writable; gate_decided_at refused
-- BY NAME"*. What authorised a decision is frozen; what happened afterwards is
-- recorded against the same row.
--
-- ---------------------------------------------------------------------------
-- WHAT IS FROZEN, AND WHY EACH ONE
-- ---------------------------------------------------------------------------
--   the party        automation_client_id / web_client_id — moving a payment
--                    to a different client changes two clients' revenue at
--                    once, and nothing records that it moved
--   amount_eur       the amount asked for. If it was wrong, the invoice was
--                    wrong: that is a credit note and a new row, not an edit
--   kind             what this money is for
--   invoiced_on      when we asked. Backdating an invoice moves revenue
--                    between months, which is the whole subject of The Month
--   recorded_by      §1.10 — who entered it. An author that can be reassigned
--                    is not an author
--
-- WHAT STAYS WRITABLE
--   received_on      the money arriving. This is the point of the table
--   reference        the bank reference, which arrives WITH the money
--   note             an operator note
--
-- 🔴 AND received_on IS WRITE-ONCE. Filling it is allowed; CHANGING it once
-- set is not. A received date that can be edited is a payment that can be
-- moved between months after the fact, which is the same defect as backdating
-- an invoice arriving through the one column that had to stay open.

begin;

do $$
declare
  n_table bigint;
  n_rows  bigint;
begin
  select count(*) into n_table from information_schema.tables
   where table_schema = 'public' and table_name = 'payments';
  if n_table = 0 then
    raise exception
      'REFUSING: public.payments does not exist. This migration constrains a table it '
      'expects to find already applied — see docs/the-month-migrations.md.';
  end if;

  -- 🔴 Proven, not trusted. Rows are not a reason to refuse outright, but a
  -- payment already recorded with neither date, or with a received date before
  -- its invoice date, would fail the checks below at ADD CONSTRAINT time and
  -- the failure would be confusing rather than instructive. Say it first.
  select count(*) into n_rows from public.payments
   where (invoiced_on is null and received_on is null)
      or (invoiced_on is not null and received_on is not null and received_on < invoiced_on)
      or amount_eur <= 0;
  if n_rows > 0 then
    raise exception
      'REFUSING: % existing payment row(s) would fail the constraints this migration adds '
      '— a payment that is neither invoiced nor received, a receipt dated before its '
      'invoice, or an amount at or below zero. Nothing has been altered. Look at those '
      'rows first: each is a real question about what was meant, not a data-cleaning job.',
      n_rows;
  end if;

  raise notice 'Preconditions proven, not assumed: payments present, 0 rows would fail.';
end $$;

-- ---------------------------------------------------------------------------
-- The constraints
-- ---------------------------------------------------------------------------

-- 🔴 A payment belongs to exactly one party. Neither is a payment from
-- nobody; both is a payment counted into two businesses at once, which would
-- make the company's total larger than the sum of its parts.
alter table public.payments drop constraint if exists payment_names_exactly_one_client;
alter table public.payments
  add constraint payment_names_exactly_one_client
  check ((automation_client_id is null) <> (web_client_id is null));

-- 🔴 A payment that is neither invoiced nor received has not happened. This is
-- the row that would otherwise sit in the table forever, counted as owed by
-- anything that reads `received_on is null`.
alter table public.payments drop constraint if exists payment_has_happened;
alter table public.payments
  add constraint payment_has_happened
  check (invoiced_on is not null or received_on is not null);

-- Money cannot arrive before it was asked for. A receipt dated before its own
-- invoice is a typo that would move revenue into an earlier month.
alter table public.payments drop constraint if exists payment_received_after_invoiced;
alter table public.payments
  add constraint payment_received_after_invoiced
  check (invoiced_on is null or received_on is null or received_on >= invoiced_on);

-- Zero is not a payment, and a negative one is a refund — which is a different
-- fact needing its own kind, not a minus sign hidden in an amount column.
alter table public.payments drop constraint if exists payment_amount_is_positive;
alter table public.payments
  add constraint payment_amount_is_positive
  check (amount_eur > 0);

alter table public.payments drop constraint if exists payment_recorded_by_is_somebody;
alter table public.payments
  add constraint payment_recorded_by_is_somebody
  check (length(btrim(recorded_by)) > 0);

comment on column public.payments.invoiced_on is
  'When the money was ASKED FOR. Frozen once set: backdating an invoice moves revenue '
  'between months, which is the whole subject of The Month.';
comment on column public.payments.received_on is
  'When the money ARRIVED. Null means owed, not zero. Write-once: it may be filled, and '
  'never changed afterwards — an editable received date is a payment that can be moved '
  'between months after the fact.';

-- ---------------------------------------------------------------------------
-- 🔒 THE PARTIAL FREEZE — 0017's pattern
-- ---------------------------------------------------------------------------
create or replace function public.payments_freeze()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'payments is not deletable: a payment that did not happen is corrected by a new row '
      'of the opposite kind, not by removing the record that it was once believed to have.';
  end if;

  -- Named individually so the refusal says WHICH field, rather than "the row
  -- changed". An operator who sees the column chases the right thing.
  if new.automation_client_id is distinct from old.automation_client_id
     or new.web_client_id is distinct from old.web_client_id then
    raise exception
      'payments: the party is frozen. Moving a payment to a different client changes two '
      'clients'' revenue at once and records nothing about the move.';
  end if;
  if new.amount_eur is distinct from old.amount_eur then
    raise exception
      'payments.amount_eur is frozen (was %, refused %). If the amount was wrong the '
      'invoice was wrong: that is a credit note and a new row, not an edit.',
      old.amount_eur, new.amount_eur;
  end if;
  if new.kind is distinct from old.kind then
    raise exception 'payments.kind is frozen: what the money was for does not change after the fact.';
  end if;
  if new.invoiced_on is distinct from old.invoiced_on then
    raise exception
      'payments.invoiced_on is frozen (was %). Backdating an invoice moves revenue between '
      'months.', old.invoiced_on;
  end if;
  if new.recorded_by is distinct from old.recorded_by or new.recorded_at is distinct from old.recorded_at then
    raise exception 'payments: the author and the moment of recording are frozen. An author that can be reassigned is not an author.';
  end if;

  -- 🔴 WRITE-ONCE, not writable. Filling it is the point of the table;
  -- changing it is moving money between months.
  if old.received_on is not null and new.received_on is distinct from old.received_on then
    raise exception
      'payments.received_on is write-once (was %, refused %). It may be filled when the '
      'money arrives and never changed afterwards.',
      old.received_on, new.received_on;
  end if;

  return new;
end;
$$;

drop trigger if exists payments_frozen_fields on public.payments;
create trigger payments_frozen_fields
  before update or delete on public.payments
  for each row execute function public.payments_freeze();

-- TRUNCATE does not fire a row-level trigger.
create or replace function public.payments_no_truncate()
returns trigger language plpgsql as $$
begin
  raise exception 'payments cannot be truncated: it is the record of money asked for and received.';
end;
$$;
drop trigger if exists payments_no_truncate on public.payments;
create trigger payments_no_truncate
  before truncate on public.payments
  for each statement execute function public.payments_no_truncate();

-- The belt. Note that UPDATE is NOT revoked — unlike 0042 — because filling
-- `received_on` is a legitimate update. The trigger is what discriminates.
revoke delete, truncate on public.payments from service_role;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select conname from pg_constraint
--    where conrelid = 'public.payments'::regclass and contype = 'c'
--    order by conname;
--   -- expect: payment_amount_is_positive, payment_has_happened,
--   --         payment_names_exactly_one_client, payment_received_after_invoiced,
--   --         payment_recorded_by_is_somebody
--
--   select privilege_type from information_schema.table_privileges
--    where table_name = 'payments' and grantee = 'service_role' order by privilege_type;
--   -- expect: INSERT, SELECT, UPDATE — and NO DELETE, NO TRUNCATE. UPDATE is
--   --         deliberate: the trigger decides which columns, not the grant.
--
-- ---------------------------------------------------------------------------
-- THE REFUSALS, PROVEN RATHER THAN TRUSTED
-- ---------------------------------------------------------------------------
-- db/tests/0043_payments_partial_freeze.test.sql. Run it BEFORE applying.
-- 🔴 Its case 7 is the one not to skip: filling `received_on` must be
-- PERMITTED. A freeze that refuses it has made the table useless while every
-- refusal case still passes.
