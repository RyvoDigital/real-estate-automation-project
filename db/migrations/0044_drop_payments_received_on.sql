-- ====== dropping payments.received_on — two columns, one fact ======
--
-- ALONE, in a transaction, with 0032's treatment: it proves its precondition
-- before it acts and names what it found when it refuses.
--
-- ---------------------------------------------------------------------------
-- 🔴 TWO COLUMNS MEAN "THE MONEY ARRIVED", AND THE MONTH MUST READ ONE
-- ---------------------------------------------------------------------------
-- `payments` carries both:
--
--   received_on   no comment, no role in the settlement model
--   settled_on    'When the money actually arrived. NULL means it has not'
--
-- The Month's *paid* figure reads exactly one of them, and the wrong choice is
-- a silently wrong revenue number on the page the operator trusts most. There
-- is no reading of the schema that makes both correct: either they must always
-- agree — in which case one is redundant and will eventually disagree — or
-- they mean different things, in which case nothing says which.
--
-- 🔒 THIS IS THE DEFECT THIS PROJECT KEEPS FINDING, IN THE FINANCIAL SCHEMA.
-- `client_automations.health` and `last_run_at` were columns nothing wrote,
-- dropped by 0036. `clients.monthly_fee_eur` is a second source for a fee,
-- owed a drop. This is the same shape with the failure mode inverted: not a
-- column nobody writes, but a column somebody *might*, competing with the one
-- that is documented.
--
-- `settled_on` is the survivor, and not by preference:
--   · it carries the column comment that defines the fact;
--   · it belongs to a model that also expresses a PART payment
--     (settled_amount_eur) and a WRITE-OFF (written_off_on) — neither of which
--     `received_on` can express, so a system using it would lose both;
--   · nothing in the cockpit reads `received_on`. Verified by grep, not assumed.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS FREE TODAY AND WILL NOT BE LATER
-- ---------------------------------------------------------------------------
-- `payments` holds 0 rows. There is nothing to migrate, nothing to reconcile,
-- and no risk of dropping a value somebody entered. The moment one real
-- payment is recorded against `received_on`, this becomes a data question
-- instead of a schema one — and it will be asked by somebody looking at two
-- figures that disagree.
--
-- The precondition proves the table is empty rather than trusting it, because
-- "it was empty when I looked" and "it is empty now" are different claims.

begin;

do $$
declare
  n_col  bigint;
  n_rows bigint;
  n_set  bigint;
begin
  select count(*) into n_col from information_schema.columns
   where table_schema = 'public' and table_name = 'payments' and column_name = 'received_on';
  if n_col = 0 then
    raise exception
      'REFUSING: payments.received_on does not exist. Either it has already been dropped '
      '— in which case nothing is owed — or this migration is pointed at a database that '
      'never had it. Look before running anything else.';
  end if;

  select count(*) into n_col from information_schema.columns
   where table_schema = 'public' and table_name = 'payments' and column_name = 'settled_on';
  if n_col = 0 then
    raise exception
      'REFUSING: payments.settled_on does not exist, so dropping received_on would leave '
      'NO column recording that money arrived. This migration removes a duplicate, never '
      'the only answer.';
  end if;

  -- 🔴 Empty, proven. 0032's rule: a drop is safe when there is demonstrably
  -- nothing to lose, and "demonstrably" is a count rather than a memory.
  select count(*) into n_rows from public.payments;
  if n_rows > 0 then
    select count(*) into n_set from public.payments where received_on is not null;
    raise exception
      'REFUSING: payments holds % row(s), % of them with received_on set. Nothing has been '
      'altered. This migration was written when the table was empty, where the drop costs '
      'nothing. With rows present, decide first whether those dates agree with settled_on '
      '— and if any disagree, that disagreement is the finding, not an obstacle to it.',
      n_rows, n_set;
  end if;

  raise notice 'Preconditions proven, not assumed: received_on present, settled_on present, 0 rows.';
end $$;

alter table public.payments drop column received_on;

-- Say what the survivor means, so the next reader does not have to infer it
-- from an absence.
comment on column public.payments.settled_on is
  'When the money actually arrived. NULL means it has not — which is a different fact from '
  'zero, and from written_off_on. THE ONLY column recording arrival: payments.received_on '
  'was dropped by 0044 because two columns for one fact eventually disagree, and the one '
  'that disagrees is the one somebody trusted.';

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select column_name from information_schema.columns
--    where table_name = 'payments' and column_name in ('received_on','settled_on');
--   -- expect: settled_on only.
--
--   select count(*) from public.payments;   -- expect: 0, unchanged
--
-- ---------------------------------------------------------------------------
-- THE REFUSALS, PROVEN RATHER THAN TRUSTED
-- ---------------------------------------------------------------------------
-- db/tests/0044_drop_payments_received_on.test.sql. Run it BEFORE applying.
