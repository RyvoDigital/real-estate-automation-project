-- ============ lead_requirements — Automation 03, Gate F3 ============
--
-- What a lead requires, as the extractor resolved it: one row per requirement,
-- mirroring the `Requirement` type in src/lib/matching/criteria.ts.
--
-- WHY THIS IS A TABLE RATHER THAN A RECOMPUTATION
--
-- Most of it could be recomputed from `messages` on demand. One part could not:
-- the agent's own answer to "why them?" in the triage flow
-- (no-crm-design §2.1). That sentence exists nowhere else, and it is the
-- mechanism by which a name-and-phone list acquires any structure at all. A
-- design that recomputes from messages would silently discard the only input
-- that cannot be derived.
--
-- Storing the rest beside it also makes the supersession chain inspectable,
-- which is what lets an agent tell a CORRECTION from an extraction bug.
--
-- ---------------------------------------------------------------------------
-- ⚠️ A RECOMPUTE DELETES BY SOURCE. IT MUST NEVER DELETE EVERYTHING.
-- ---------------------------------------------------------------------------
-- The obvious recompute is "delete every row for this lead, reinsert what the
-- extractor produced". That destroys the agent rows, which are the only rows in
-- this table that cannot be reproduced from anything -- and it would look like
-- it worked, because the derived rows would all come back.
--
--   delete from lead_requirements
--    where lead_id = $1 and source in ('field', 'conversation', 'note');
--
-- `source = 'agent'` is left alone, always, and the delete and the reinsert
-- happen in one transaction so a lead is never briefly requirement-less while a
-- match run is reading.
--
-- This is the shape of lesson 6f -- a deletion's blast radius is a property of
-- the statement, not of the intent -- and of 5c: a pass that targets the wrong
-- object reports success identically to one that had nothing to do.
--
-- NOTHING UPSERTS HERE. Replacement is delete-by-source then insert, so no
-- `ON CONFLICT` is emitted and the 42P10 defect of 0003/0004 has no surface to
-- act on. Recorded because §9 of the handoff asks for it to be considered, not
-- because it applies -- same posture as 0008.
--
-- ---------------------------------------------------------------------------
-- TWO CLOCKS, AND ONLY ONE OF THEM ORDERS ANYTHING
-- ---------------------------------------------------------------------------
-- `stated_at` is WHEN THE LEAD SAID IT, and it is nullable because for a notes
-- cell -- written over years by several people -- that moment is genuinely
-- unknown. It is NOT what decides which of two contradictory statements wins.
-- That is a SEQUENCE, resolved in src/lib/matching/recency.ts from the order
-- messages arrived in, which we know exactly.
--
-- Backfilling `stated_at` with the import time would make every row orderable
-- and every answer wrong, because the moment we learned a thing is not the
-- moment it was true. That is the `consent_at` correction (af4fba6) arriving in
-- a second place, and lesson 10: two clocks collapsed into one column.
--
-- `unordered` records WHY a row has no sequence position, so "we could not
-- order these" is a fact in the row rather than an inference from a null.

create table if not exists public.lead_requirements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,

  kind text not null check (kind in (
    'budget', 'area', 'bedrooms', 'property_type', 'feature')),

  -- budget: {"min":null,"max":900000} · area: ["Cascais","Estoril"]
  -- bedrooms: 3 · feature: "garden"
  --
  -- jsonb because the shape genuinely differs by kind. Note that `area` and
  -- `property_type` hold a LIST OF ALTERNATIVES in ONE row, never one row per
  -- value: the scorer requires every hard requirement to hold, so two rows of
  -- the same alternatives kind are an AND, and for a set of acceptable options
  -- an AND inverts the requirement rather than tightening it. That defect was
  -- live -- a lead who named two towns matched nothing anywhere. Lesson 7c.
  value jsonb not null,

  strength text not null check (strength in ('hard', 'preference')),

  source text not null check (source in ('field', 'conversation', 'note', 'agent')),

  -- The lead's own words, VERIFIED against their actual messages before being
  -- stored. Null where it came from a stored field, or where a quote could not
  -- be verified -- a weaker notification is recoverable, an invented one is not.
  evidence text,
  -- Why we read it that way. Shown to the agent, never to the lead.
  why text not null,

  -- When the lead said it. Recorded; never used to order. See above.
  stated_at timestamptz,
  -- Set when this row's source has no internal order, with the reason.
  unordered text,

  -- ---------------------------------------------------------------------------
  -- MARKED, NEVER DELETED
  -- ---------------------------------------------------------------------------
  -- A later -- or, where nothing can be ordered, a wider -- statement about the
  -- same single-valued thing takes this one's place. The row stays, carrying
  -- {"evidence": "...", "why": "..."} describing what replaced it, because an
  -- agent who cannot see the earlier statement cannot tell a correction from an
  -- extraction bug (§4.7: record, do not silently absorb).
  --
  -- A jsonb snapshot rather than a self-reference: the rows are replaced
  -- wholesale on every recompute, so a foreign key would churn, and the thing
  -- the agent needs is the WORDS, which the snapshot holds. This is the
  -- opposite call from `listing_matches.supersedes_id`, and deliberately: that
  -- chain is a record of what an agent was told and must survive, while this
  -- one is derived and is rebuilt from the messages every time.
  superseded_by jsonb,

  -- Who said it, where a person did. Null for a derived row: nobody authored
  -- "the extractor read `ate 900 mil` as a budget".
  authored_by text,

  created_at timestamptz not null default now(),

  -- An agent row is a person's assertion about somebody else, and it shapes
  -- every future match for that lead. So it carries BOTH their words and their
  -- name, for the reason the segmentation screen's declaration does: "registada
  -- com data, hora e identificação de quem a efectuou". A date with no author
  -- is a date, and an assertion with no author is a guess the system made.
  constraint agent_requirements_name_their_author check (
    source <> 'agent' or (evidence is not null and authored_by is not null))
);

create index if not exists lead_requirements_lead_idx
  on public.lead_requirements (lead_id, kind);

-- The match run reads only what still binds.
create index if not exists lead_requirements_binding_idx
  on public.lead_requirements (lead_id)
  where superseded_by is null;

-- What a recompute deletes, and what it must leave.
create index if not exists lead_requirements_source_idx
  on public.lead_requirements (lead_id, source);

alter table public.lead_requirements enable row level security;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING -- through PostgREST, not psql alone (0002, 0003)
-- ---------------------------------------------------------------------------
--   select has_table_privilege('service_role','public.lead_requirements','INSERT'); -- t
--   select has_table_privilege('anon','public.lead_requirements','SELECT');         -- f
--
--   -- an insert-update-select-delete round trip through the REST API, leaving
--   -- zero rows. A 42501 is the 0002 defect again.
--
-- And the constraints proven by trying to break them:
--
--   -- an unknown kind must be refused rather than stored and never matched,
--   -- which is 0009's `availabe` in a new place
--   insert into lead_requirements (…, kind) values (…, 'bedroms');
--   -- expect: violates "lead_requirements_kind_check"
--
--   insert into lead_requirements (…, source, evidence)
--     values (…, 'agent', null);
--   -- expect: violates "agent_requirements_name_their_author"
--
-- Then the deletion rule, which is the one that matters most here and is NOT a
-- constraint -- it lives in the caller, so it is checked by behaviour:
--
--   -- given one 'agent' row and three derived rows for a lead,
--   -- run the recompute and confirm the agent row is STILL THERE
--   -- and still carries its original id.
--
-- A recompute that deleted it would leave the table looking correct and the
-- only irreplaceable sentence in it gone.
