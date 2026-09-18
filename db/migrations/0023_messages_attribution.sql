-- ============ 0023 — where a conversation came from ============
--
-- Recorded when an inbound message ARRIVES, never recomputed. "Which send
-- preceded this reply" has a different answer after the next campaign, and a
-- report that changes its mind about last month is not a report (§11b).
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ THREE STATES, NOT A NULLABLE ID.                                        │
-- │                                                                         │
-- │ A null attributed_send_id would mean "we looked and found no campaign   │
-- │ send". It must never ALSO mean "the lookup failed", because those write │
-- │ the same row and the second silently becomes an organic lead.           │
-- │                                                                         │
-- │   organic    looked; no preceding campaign send                         │
-- │   campaign   looked; here is the send and the run                       │
-- │   unknown    THE LOOKUP FAILED. Not organic. Not campaign               │
-- │                                                                         │
-- │ NOT NULL, DEFAULTING TO `unknown` — and the default is the point.      │
-- │                                                                         │
-- │ The first draft said "NOT NULL with no default, so a writer cannot      │
-- │ omit it". That would have broken the LIVE Concierge on the day it was   │
-- │ applied: the workflow inserts messages and knows nothing about this     │
-- │ column, so every inbound would have been rejected. Caught by reading    │
-- │ the schema the workflow writes to rather than by reasoning about the    │
-- │ one being written.                                                      │
-- │                                                                         │
-- │ And the corrected rule is better than the original: what matters is not │
-- │ that a writer CANNOT omit it, but that omitting it yields the LOUD      │
-- │ state rather than the quiet one. A row that inherits `unknown` shows up │
-- │ on its own line in the report and alerts; a row that inherited          │
-- │ `organic` would be a silent false claim. Default to the state that      │
-- │ means "we did not look", and omission becomes a question instead of an  │
-- │ answer.                                                                │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- `unknown` is loud by design: it alerts, and the weekly report shows it on its
-- own line rather than folding it into either figure. A client reading a number
-- that quietly absorbed the failures is being told something we do not know.

alter table public.messages
  add column if not exists attribution_state text,
  add column if not exists attributed_send_id uuid references public.sends(id) on delete set null,
  add column if not exists attributed_run_id uuid references public.campaign_runs(id) on delete set null,
  add column if not exists attributed_at timestamptz;

-- Existing rows predate attribution and must not claim to be organic: they were
-- never looked at. Backfilled as `unknown`, which is what they are.
update public.messages set attribution_state = 'unknown'
 where attribution_state is null;

alter table public.messages
  alter column attribution_state set default 'unknown';

alter table public.messages
  alter column attribution_state set not null;

alter table public.messages
  add constraint messages_attribution_state_known
  check (attribution_state in ('organic', 'campaign', 'unknown'));

-- A campaign attribution must name what it attributed to. "campaign" with no
-- send id is a claim with no evidence -- the same rule as a refusal stating its
-- reason and a confirmation naming its author.
alter table public.messages
  add constraint campaign_attribution_names_its_send
  check (attribution_state <> 'campaign' or attributed_send_id is not null);

-- And the converse: an organic conversation must not carry a send.
alter table public.messages
  add constraint organic_attribution_names_nothing
  check (attribution_state <> 'organic' or (attributed_send_id is null and attributed_run_id is null));

create index if not exists messages_attribution_idx
  on public.messages (client_id, attribution_state, created_at desc);

comment on column public.messages.attribution_state is
  'organic | campaign | unknown. `unknown` means the lookup FAILED and is never folded into either figure -- see docs/handoff-contract-design.md §2.2.';

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select attribution_state, count(*) from public.messages group by 1;
--   -- expect: every existing row 'unknown' (they were never looked at)
--
--   begin;
--     insert into public.messages (client_id, channel, direction, body, attribution_state)
--     select id, 'whatsapp', 'inbound', 'proof', 'campaign' from public.clients limit 1;
--     -- expect: ERROR ... campaign_attribution_names_its_send
--   rollback;
--
--   begin;
--     insert into public.messages (client_id, channel, direction, body,
--       attribution_state, attributed_run_id)
--     select id, 'whatsapp', 'inbound', 'proof', 'organic', gen_random_uuid()
--       from public.clients limit 1;
--     -- expect: ERROR ... organic_attribution_names_nothing (or the foreign key)
--   rollback;
--
--   -- THE ONE THAT MATTERS: the live workflow omits the column entirely, and
--   -- must keep working. It inherits `unknown`, which is loud, rather than
--   -- `organic`, which would be a silent false claim.
--   begin;
--     insert into public.messages (client_id, channel, direction, body)
--     select id, 'whatsapp', 'inbound', 'proof' from public.clients limit 1
--     returning attribution_state;
--     -- expect: one row, 'unknown'
--   rollback;
