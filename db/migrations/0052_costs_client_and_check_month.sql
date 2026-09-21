-- ====== costs: an optional client; cost_checks: the month a check is for ======
--
-- 🔴 NOT APPLIED. Manuel runs this by hand in the Supabase SQL editor, in the same
-- sitting as 0051, then runs db/tests/0052_costs_client_and_check_month.test.sql
-- (expected verdicts are in that file; it must show PASS on every row).
--
-- Why (operator, 21 Sep 2026, The Month checkpoint 1):
--
-- 1. A cost belongs to a client, to one business, or to the company (brief I
--    §2.11, "at their own level, never apportioned"). The deployed `costs` can
--    say "a business" (side) and "the company" (side = 'shared'), but never "this
--    client": a web client's own domain had nowhere to live, so The Month could
--    not show what a client alone costs, or what it leaves. The optional
--    reference follows client_contracts exactly: the automation_client_id /
--    web_client_id pair, never one nullable "party" column (a null there would
--    mean both "not applicable" and "nobody entered it").
--
-- 2. `cost_checks` recorded WHEN an invoice total was confirmed, never WHICH
--    MONTH it was for. "Closed and checked" (§2.11, the three month states) needs
--    the month. An invoice arrives after its month closes, so confirmed_on is a
--    different month from the one checked, and no rule could infer it.
--
-- Shape, and the constraints that hold it:
--   * both references nullable (a cost with neither is a business's or the
--     company's, as today), at most one of the two, and each only on its own
--     side: a web client's cost is side 'web', an automation client's is
--     'automation'. A shared cost can never name a client;
--   * both foreign keys RESTRICT, as 0049 made every money foreign key. Deleting
--     a client must never delete the costs recorded against it;
--   * for_month is the FIRST DAY of the month it checks, NOT NULL. A check with no
--     month is exactly the ambiguity this removes.
--
-- 🔒 PRECONDITION, proved first (the 0036 pattern): cost_checks has no rows, so
-- adding a NOT NULL column with no default cannot fail halfway or need a guess.
-- Read on 21 Sep 2026: 0 rows. If any exist, this refuses and changes nothing.
--
-- No grant changes: service_role's table-level INSERT (0046) covers new columns,
-- and the proof asserts it.

begin;

do $$
begin
  if exists (select 1 from public.cost_checks) then
    raise exception '0052 refused: cost_checks has % row(s); each needs its month decided by hand before for_month can be NOT NULL', (select count(*) from public.cost_checks);
  end if;
end $$;

alter table public.costs
  add column automation_client_id uuid references public.clients (id) on delete restrict,
  add column web_client_id uuid references public.web_clients (id) on delete restrict,
  add constraint cost_names_at_most_one_client
    check (automation_client_id is null or web_client_id is null),
  add constraint cost_client_is_on_its_own_side
    check ((automation_client_id is null or side = 'automation')
       and (web_client_id is null or side = 'web'));

comment on column public.costs.automation_client_id is
  'Optional: the automation client this cost belongs to alone. Null = the automation business''s own cost (side automation) or the company''s (shared). Never apportioned.';
comment on column public.costs.web_client_id is
  'Optional: the web client this cost belongs to alone (e.g. its domain). Null = the web business''s own cost (side web) or the company''s (shared). Never apportioned.';

alter table public.cost_checks
  add column for_month date not null,
  add constraint cost_check_month_is_a_first_day
    check (for_month = date_trunc('month', for_month)::date);

comment on column public.cost_checks.for_month is
  'The month this invoice total checks, as its first day. confirmed_on is when it was entered, which is after the month closed.';

commit;
