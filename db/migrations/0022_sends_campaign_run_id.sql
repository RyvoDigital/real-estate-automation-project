-- ============ 0022 — attributing a send row to the RUN that made it ============
--
-- FOUND BY READING BACK WHAT recordPlan WROTE, 18 Sep 2026. The function
-- reported "refusalsWritten: 1" and the row was there — and its `campaign_id`
-- was null, so nothing tied it to the run that decided it. The report and the
-- database were two different claims, and only the second one was checked.
--
-- WHY campaign_id WAS THE WRONG COLUMN TO REACH FOR
-- A campaign and a RUN are different things. A halted campaign is re-evaluated
-- into a NEW run, so the same contact ends up with refusal rows from two runs of
-- one campaign — and "which run refused this, and under what forecast" is
-- exactly the question a re-evaluation makes worth asking. Overloading
-- campaign_id would have made the two indistinguishable at the moment they
-- first differ.
--
-- It also matters for the interruption guarantee. runCampaign asks "has this run
-- already produced a row for this contact"; with only campaign_id, a second run
-- of the same campaign would read the first run's rows as its own and skip
-- everybody.

alter table public.sends
  add column if not exists campaign_run_id uuid references public.campaign_runs(id) on delete set null;

comment on column public.sends.campaign_run_id is
  'The run that produced this row. NOT campaign_id: a halted campaign is re-evaluated into a new run, and "which run" is the question that makes the difference visible.';

-- The interruption cursor: "has this run already produced a row for this contact".
create index if not exists sends_run_contact_idx
  on public.sends (campaign_run_id, phone_e164);

-- on delete set null, not cascade: deleting a run must never delete the record
-- of what was sent under it. §6f's warning applies and the exception is
-- deliberate for the same reason as the ledger's lead_id — the send happened
-- whatever happened to the bookkeeping around it.

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select column_name from information_schema.columns
--    where table_name = 'sends' and column_name = 'campaign_run_id';     -- 1 row
--
--   begin;
--     insert into public.sends (client_id, phone_e164, automation, idempotency_key,
--       gate_verdict, gate_decided_at, status, campaign_run_id)
--     select id, '+351911111111', 'proof', 'proof-0022', 'permitted', now(), 'intended',
--            '00000000-0000-0000-0000-000000000000'
--       from public.clients limit 1;
--     -- expect: ERROR ... violates foreign key constraint
--   rollback;
