-- ============ closes — Automation 05, the trigger ============
--
-- Nothing in this system recorded that a sale completed. Three near-misses:
-- `listings.status = 'sold'` knows a PROPERTY sold and not who; a segment A
-- declaration knows a PERSON transacted and not when; `leads.stage = 'won'`
-- is written by nothing at all.
--
-- This table is the join that did not exist, and the whole of its design is in
-- one sentence from `docs/automation-05-review-request-design.md` §3.2:
--
--     THE TRIGGER CARRIES WHO. IF THE AGENT DOES NOT SAY, NOTHING IS ASKED.
--
-- Which party is asked is the agency's answer and never a rule we picked. A
-- closed sale has two parties and which of them the agency has a relationship
-- with varies by sale — sometimes the seller they have known for years,
-- sometimes the buyer they spent three months with. Asking both doubles volume
-- against §8.B's spike rule for no gain, and asking the wrong one produces a
-- review from somebody with nothing to say.
--
-- ---------------------------------------------------------------------------
-- ⚠️ THERE IS NO DISPOSITION COLUMN, AND ITS ABSENCE IS THE DESIGN
-- ---------------------------------------------------------------------------
-- Whether a close was asked is DERIVED at read time from the send row, never
-- stored here. Rule 13: check the artefact, not the execution status. A stored
-- `asked = true` is a claim about a code path, and this codebase has eighteen
-- recorded instances of something reporting success while the underlying thing
-- failed — in a feature whose entire purpose is not skipping people.
--
-- Anybody adding `disposition text` to this table has removed the guarantee.
--
-- ---------------------------------------------------------------------------
-- AND WHY THERE IS NO BACKFILL CHECK
-- ---------------------------------------------------------------------------
-- §6.1 forbids backfill: two hundred historical sales is exactly the volume
-- pattern §8.B says is flagged as manipulation regardless of intent.
--
-- No constraint enforces it, because the ask window already does. The ask
-- expires FOURTEEN DAYS AFTER `closed_on` — not after `reported_at` — so a
-- close reported today for a sale six months ago is born expired and sends
-- nothing. A rule that enforces itself through a number already chosen is
-- better than the same rule with a second number chosen to defend it.
--
-- Which is also why BOTH dates are columns. A backfilled close records
-- `reported_after_window` — we were told too late to have acted — and NOT the
-- `unaccounted` that means we were told in time and did nothing. Two hundred
-- of the former would otherwise hide one of the latter, and the latter is the
-- only output of the whole reconciliation that means anything.

create table if not exists public.closes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,

  -- Nullable: an agency may close a sale on a property that was never in the
  -- system. That is a worse record and still a real close.
  listing_id uuid references public.listings(id) on delete set null,

  -- ---------------------------------------------------------------------
  -- THE PARTY. Null until the agency says who, and `party_not_named` is a
  -- recorded disposition rather than an absence — see `agent_asked_who_at`.
  -- ---------------------------------------------------------------------
  party_lead_id uuid references public.leads(id) on delete set null,
  party_role text check (party_role is null or party_role in ('buyer', 'seller')),
  party_declared_by text,
  party_declared_at timestamptz,

  -- The legal date of the transaction, as the agency reports it. Every window
  -- in Automation 05 is measured from HERE and never from `reported_at`.
  closed_on date not null,

  reported_by text not null,
  reported_at timestamptz not null default now(),
  source text not null check (source in ('whatsapp', 'cockpit')),
  -- What the agent actually sent. Kept for the same reason `listings` keeps it:
  -- the parse is a best effort and the original is the only way to tell a
  -- parser bug from a typo.
  raw_message text,

  -- When we asked the agency WHO. Null means we have not asked yet; a value
  -- with `party_lead_id` still null is the agency having been asked and not
  -- answered, which is a disposition and not a gap in the data.
  agent_asked_who_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- ---------------------------------------------------------------------
  -- THE PARTY ARRIVES WHOLE OR NOT AT ALL
  -- ---------------------------------------------------------------------
  -- §3.4: reporting a close is also a segment A declaration, and per §5.1 of
  -- the Enquadramento a classification is declared by the agency with date,
  -- time and the identity of whoever made it. A party recorded without a
  -- declarer is a lawful basis nobody declared — which is the thing the
  -- segmentation screen exists to prevent, arriving through a side door.
  constraint close_party_is_whole check (
    (party_lead_id is null and party_role is null
      and party_declared_by is null and party_declared_at is null)
    or
    (party_lead_id is not null and party_role is not null
      and party_declared_by is not null and party_declared_at is not null)
  ),

  -- A sale that has not happened is not a close. Guards the typo that would
  -- park a row in `pending` forever and never come due.
  constraint close_is_not_in_the_future check (closed_on <= current_date)
);

-- One sale per property per day. An agent sending "A-1042 vendido" twice must
-- not produce two asks to the same person, and a property genuinely re-sold
-- years later has a different `closed_on`.
--
-- NON-PARTIAL, for the reason recorded in 0004: PostgREST emits
-- `ON CONFLICT (…)` with no predicate and cannot restate one, so a partial
-- index fails 42P10. NULLs are distinct in a plain unique index, so closes with
-- no listing do not collide with each other.
create unique index if not exists closes_client_listing_day
  on public.closes (client_id, listing_id, closed_on);

-- The reconciliation's shape: every close for one client, oldest first, since
-- the oldest unasked is the one that matters.
create index if not exists closes_client_date_idx
  on public.closes (client_id, closed_on);

-- The intake screen's shape: closes still waiting for a party.
create index if not exists closes_awaiting_party_idx
  on public.closes (client_id, reported_at desc)
  where party_lead_id is null;

alter table public.closes enable row level security;

comment on table public.closes is
  'A completed sale, as the agency reported it. Carries WHO is to be asked; '
  'if the agency does not say, nothing is asked and that is recorded. No '
  'disposition column — see the header.';

comment on column public.closes.closed_on is
  'Every window in Automation 05 is measured from here, never from '
  'reported_at. That is what makes a backfill inert rather than a burst.';

comment on column public.closes.agent_asked_who_at is
  'Set when we ask the agency who to ask. With party_lead_id still null this '
  'is the party_not_named disposition — honest silence, recorded, so it '
  'cannot be mistaken for a defect.';

-- ---------------------------------------------------------------------------
-- THE ASK, ON THE SEND ROW
-- ---------------------------------------------------------------------------
-- `sends` already carries `automation` (its own comment names `review_05`), a
-- `refused` status, and the gate's layer, reason and detail. So a refusal
-- ALREADY leaves a row saying why — `pacing.ts`: "A FILTER REMOVES SOMEBODY
-- SILENTLY. A REFUSAL LEAVES A ROW SAYING WHY."
--
-- What Automation 05 adds is that the close travels with it. Without this
-- column a refusal exists and cannot be attributed to the close it belongs to,
-- and the reconciliation in §5 could not tell a refused close from an
-- unaccounted one — which is the one distinction it exists to make.

alter table public.sends
  add column if not exists close_id uuid references public.closes(id) on delete set null;

create index if not exists sends_close_idx
  on public.sends (close_id)
  where close_id is not null;

comment on column public.sends.close_id is
  'Automation 05: the close this send answers, whether it was sent or refused. '
  'The reconciliation accounts for every close against these rows.';

-- ---------------------------------------------------------------------------
-- A CLOSE REPORT IS ALSO A SEGMENT DECLARATION, AND SAYS SO
-- ---------------------------------------------------------------------------
-- Widening `consent_events.source` by one value rather than reusing
-- `agency_attestation`. The distinction is evidential and not cosmetic: a bulk
-- import declaration is a claim about history, and a close report is a
-- contemporaneous statement about an event that happened this week. A
-- supervisory authority asking how we knew somebody was a client should get
-- the better answer where we have it.
--
-- Every existing row satisfies the wider constraint, so the revalidation
-- cannot fail on data that is already there.

alter table public.consent_events
  drop constraint if exists consent_events_source_known;

alter table public.consent_events
  add constraint consent_events_source_known check (source in (
    'import_declaration', 'agency_attestation', 'whatsapp_reply',
    'web_form', 'operator', 'meta_block', 'system',
    'close_report'      -- Automation 05: the agency reporting a completed sale
  ));

-- ---------------------------------------------------------------------------
-- VERIFICATION — run these, do not assume them
-- ---------------------------------------------------------------------------
-- The grants come from 0002's default privileges. Confirm rather than trust:
--
--   select has_table_privilege('service_role','public.closes','INSERT');  -- t
--   select has_table_privilege('anon','public.closes','SELECT');          -- f
--
-- Then through PostgREST, which is the path the real caller takes. A 42501
-- there is the 0002 defect again, and psql answering `t` proves nothing
-- about it.
--
-- Each constraint proven by TRYING TO BREAK IT, the way 0009's status typo was:
--
--   -- a party with no declarer must be refused (23514)
--   insert into closes (client_id, closed_on, reported_by, source,
--     party_lead_id, party_role)
--     values (…, current_date, 'operator', 'cockpit', …, 'buyer');
--   -- expect: violates "close_party_is_whole"
--
--   -- and a declarer with no party, which is the same fault mirrored
--   …party_declared_by = 'A. Ferreira', party_lead_id = null
--   -- expect: the same refusal
--
--   -- no party at all inserts fine, because that is the normal first state
--   insert into closes (client_id, closed_on, reported_by, source)
--     values (…, current_date, 'operator', 'cockpit');   -- expect: ok
--
--   -- a sale in the future must be refused
--   …closed_on = current_date + 1  -- expect: violates "close_is_not_in_the_future"
--
--   -- a role outside the two must be refused
--   …party_role = 'landlord'       -- expect: violates the party_role check
--
--   -- the same sale reported twice must be refused
--   insert … twice, same client_id, listing_id and closed_on
--   -- expect: duplicate key on closes_client_listing_day
--   -- and with listing_id null BOTH inserts succeed, which is correct:
--   -- NULLs are distinct, and two unreferenced closes are two sales
--
--   -- the widened consent source accepts the new value and still refuses junk
--   insert into consent_events (client_id, phone_e164, kind, source, segment,
--     declared_by) values (…, '+351910000000', 'declared', 'close_report',
--     'A', 'A. Ferreira');                                -- expect: ok
--   …source = 'guessed'                                   -- expect: 23514
--
-- Delete the fixtures afterwards and confirm zero rows remain.
