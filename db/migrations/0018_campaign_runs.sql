-- ============ campaign_runs — the shape, recorded before the campaign ============
--
-- One row per evaluation of a campaign. It exists so that "300 evaluated, 20
-- contactable, 280 refused" is on disk BEFORE the first message goes out.
--
-- WHY THAT ORDERING IS THE WHOLE POINT
-- A run that records refusals as it goes and dies at contact 140 leaves no
-- answer to how many there were. The count of people we decided NOT to contact
-- is the compliance artefact, not a by-product of one that succeeded.
--
-- FORECAST, NOT PERMISSION
-- `forecast_permitted` is a forecast and authorises nothing. The gate runs a
-- second time immediately before each send, because a permission decided at
-- 09:00 and acted on at 14:00 is stale by construction -- it would widen the
-- objection race from the seconds inside dispatch() to the length of a
-- campaign, manufacturing the exact condition invariant 3 exists to catch.
-- So this table holds what the campaign LOOKED like; `sends` holds what was
-- actually decided and done. They can disagree, and when they do the difference
-- is the interesting part: a contact forecast as contactable who objected at
-- 10:00 appears here in forecast_permitted and in sends as a refusal at 14:00.
--
-- MUTABLE, LIKE jurisdiction_policy AND UNLIKE consent_events
-- A run progresses: evaluating -> evaluated -> sending -> complete. The counters
-- fill in as it goes. Nothing here justifies a past action -- `sends` does that,
-- and `sends` is frozen. This is the operator's view of a job.

create table if not exists public.campaign_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  automation text not null,
  campaign_id uuid,

  status text not null default 'evaluating'
    check (status in ('evaluating', 'evaluated', 'sending', 'complete', 'halted')),

  -- ---- the shape, written at the end of phase 1 --------------------------
  target_count integer not null default 0,
  excluded_count integer not null default 0,        -- terminal refusals, not re-asked
  excluded_breakdown jsonb not null default '{}',   -- {"objected": 18, "unparseable": 5}
  forecast_permitted integer not null default 0,
  forecast_refused integer not null default 0,
  refusal_breakdown jsonb not null default '{}',    -- {"no_ledger_basis": 214, …}

  -- The permitted contacts, so phase 2 can resume after a crash and so the
  -- forecast can be compared with what happened. NOT `sends` rows: nothing
  -- provisional belongs in the table that records decisions acted upon.
  permitted_contacts jsonb not null default '[]',

  -- ---- what actually happened, during phase 2 -----------------------------
  sent_count integer not null default 0,
  refused_late_count integer not null default 0,    -- permitted in the forecast, refused at send
  failed_count integer not null default 0,
  ambiguous_count integer not null default 0,       -- rows left at `intended`
  halted_reason text,

  evaluated_at timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),

  -- A halted run must say why. Same rule as a refusal stating its reason.
  constraint halted_states_its_reason check (status <> 'halted' or halted_reason is not null),
  -- The shape must add up once it is evaluated, or the record is not a record.
  constraint forecast_adds_up check (
    status = 'evaluating'
    or target_count = excluded_count + forecast_permitted + forecast_refused)
);

create index if not exists campaign_runs_client_idx
  on public.campaign_runs (client_id, started_at desc);

alter table public.campaign_runs enable row level security;
revoke all on public.campaign_runs from anon, authenticated;
grant select, insert, update on public.campaign_runs to service_role;

comment on table public.campaign_runs is
  'One row per campaign evaluation. forecast_permitted authorises nothing -- the gate runs again immediately before each send. See docs/campaign-evaluation-design.md §3.';
comment on column public.campaign_runs.excluded_count is
  'Terminal refusals -- objected, unreadable -- recorded once in sends and then excluded from target lists. Visible here rather than silently dropped.';

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select count(*) from public.campaign_runs;   -- expect 0
--
-- The two constraints, seen to refuse, inside a transaction:
--   begin;
--     insert into public.campaign_runs (client_id, automation, status, halted_reason)
--     select id, 'reactivation_02', 'halted', null from public.clients limit 1;
--     -- expect: ERROR ... halted_states_its_reason
--   rollback;
--
--   begin;
--     insert into public.campaign_runs (client_id, automation, status,
--       target_count, excluded_count, forecast_permitted, forecast_refused)
--     select id, 'reactivation_02', 'evaluated', 300, 23, 20, 200 from public.clients limit 1;
--     -- expect: ERROR ... forecast_adds_up   (23 + 20 + 200 = 243, not 300)
--   rollback;
--
--   begin;
--     insert into public.campaign_runs (client_id, automation, status,
--       target_count, excluded_count, forecast_permitted, forecast_refused)
--     select id, 'reactivation_02', 'evaluated', 300, 23, 20, 257 from public.clients limit 1;
--     -- expect: INSERT 0 1   (23 + 20 + 257 = 300)
--   rollback;
