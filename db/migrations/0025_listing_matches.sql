-- ============ listing_matches — Automation 03, Gate F3 ============
--
-- One row per lead × listing. It holds TWO DIFFERENT KINDS OF CLAIM, and the
-- whole shape of this table exists to keep them apart.
--
--   origin = 'computed'   the engine met every hard constraint. It carries a
--                         score, a strength, the reasoning and the answer to
--                         "would a field-only CRM filter have found this?"
--   origin = 'agent'      a person said so. It carries their reason if they
--                         gave one, and NO score, because nobody computed one
--
-- Both are legitimate. An agency with no structured contact data has nothing to
-- compute from, and the triage flow -- the system brings the names, the agent
-- decides, the system keeps what they decided -- is the product for them
-- (docs/automation-03-no-crm-design.md §2). What is NOT legitimate is letting
-- the two blur, so the constraints below make the blur a write failure:
--
--   * a computed row without its reasoning is refused
--   * an agent row carrying a score, a strength or `filter_would_find` is refused
--
-- THE SECOND ONE IS THE IMPORTANT ONE. `filter_would_find` is computed from the
-- lead's STORED FIELDS ONLY and answers item 5 of the definition of done -- the
-- strongest claim this product makes, that it produces matches a competitor
-- working from form fields could not. On a row a human chose, that question was
-- never asked, so the honest value is NULL and never `false`. A `false` there
-- would let the claim be satisfied by rows that prove nothing, and a metric that
-- cannot fail is not evidence (§0.7). The CHECK makes it unwriteable rather
-- than a rule somebody remembers.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS TABLE MUST NEVER GROW, AND WHY IT IS WRITTEN HERE
-- ---------------------------------------------------------------------------
-- 0020 §4.1 recorded that for `message_templates` the danger was a COLUMN
-- rather than a call: the moment a table of approved text grows a field naming
-- an audience, it stops being a record and becomes a campaign definition, and
-- something eventually reads it and acts.
--
-- This table is closer to that line than `message_templates` ever was, because
-- a row here already names one lead and one listing. That is an audience of one.
-- What keeps it a record is that it says a listing is FOR somebody; it must
-- never say that anybody should be MESSAGED.
--
-- So: no `should_send`, no `scheduled_at`, no `approved_to_send`, no
-- `send_after`, no `auto_notify`. The gate decides who may receive a message,
-- at send time, from the ledger and the policy table. A match row that knows
-- its own audience has made half that decision somewhere the gate cannot see.
--
-- The field that breaks this will be added by somebody solving a reasonable
-- local problem -- "we just need to mark the ones to send tomorrow" -- which is
-- how it goes every time. That is why the list is written out rather than left
-- as a principle.
--
-- ---------------------------------------------------------------------------
-- `agent_notified_at`, NOT `notified_at`
-- ---------------------------------------------------------------------------
-- Lessons §8b is "the cockpit's 'the lead was told' is an inference". A bare
-- `notified_at` on a table that joins a lead to a listing will be read as "the
-- lead was told" by the first person who arrives with the lead in mind -- and a
-- bare name on a table joining two things is read as being about whichever one
-- the reader is already thinking about. The agent is who gets notified here.
-- The lead is never contacted by anything that reads this table; that path goes
-- through the gate and leaves a row in `sends`.
--
-- ---------------------------------------------------------------------------
-- A NOTIFIED MATCH IS FROZEN, AND A RECOMPUTE MAKES A NEW ROW
-- ---------------------------------------------------------------------------
-- Requirements change -- a new message, a corrected note -- and the match is
-- recomputed with different reasoning. If that overwrote the row, the record
-- would disagree with what happened: the agent acted on what the row SAID, and
-- when they ask "why did you send me this", the answer would have changed since
-- they read it.
--
-- Same reasoning as `sends` freezing its authorisation, and the same tell: the
-- only row anybody would ever want to edit is the one that turned out wrong.
--
-- So once `agent_notified_at` is set, the freeze trigger below permits only the
-- outcome fields and the supersession marker. A recompute inserts a NEW row
-- carrying `supersedes_id`, so "we told you X in April and Y in June" is
-- readable as a chain rather than reconstructed by sorting timestamps.
--
-- NOTHING UPSERTS INTO THIS TABLE, which is what makes the partial unique index
-- below safe. A re-match READS the current row and either updates it (never
-- notified) or inserts a successor (notified), both decided in code, so no
-- `ON CONFLICT` is ever emitted and the 42P10 defect of 0003/0004 cannot apply.
-- ⚠️ If anyone later adds a PostgREST upsert here, the partial index will fail
-- with 42P10 and the fix is to keep the upsert out, not to widen the index --
-- a non-partial version would permit two current rows for one pair.

create table if not exists public.listing_matches (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,

  origin text not null check (origin in ('computed', 'agent')),

  -- computed rows only
  score numeric,
  -- 'none' is deliberately ABSENT. `scoreListing` returns it for a listing that
  -- is not a match, and a non-match is not a row here -- so a 'none' row is a
  -- caller storing a refusal as a result and the CHECK refuses it. Do not add
  -- it to make an insert pass.
  strength text check (strength in ('strong', 'possible', 'weak')),
  filter_would_find boolean,
  -- hardMet, hardFailed, preferencesMet, preferencesMissed, evidence, reasons
  reasoning jsonb,

  -- agent rows only
  chosen_by text,
  chosen_at timestamptz,
  -- Their words, one line, from "why them?". This is the only content in the
  -- table that is not derivable from anything else -- see 0026's note on what a
  -- recompute may delete.
  chosen_reason text,

  -- THE STATUS SNAPSHOT. What the listing was when this match was computed, so
  -- the send path can refuse if it has moved since. 0009's header already
  -- argues why checking only at match time is check-then-act and why there is
  -- no window small enough to make that safe.
  listing_status_at_match text not null,
  listing_status_changed_at_at_match timestamptz,

  agent_notified_at timestamptz,
  -- The draft written FOR the agent to send by hand. Stored because the agent
  -- reads it in the cockpit. ⚖️ Whether we may supply text the agency then
  -- sends outside our gate is an open question for the lawyer
  -- (no-crm-design §5.4); nothing here reconciles a hand-sent message against
  -- this column, and the orphan sweep is deliberately left noisy until that is
  -- answered. A blinded sweep is not a measurement.
  draft_text text,

  -- §4.7: outcomes are RECORDED, never auto-applied.
  outcome text check (outcome in (
    'agent_dismissed_match',
    'agent_dismissed_lead',
    'agent_sent',
    'lead_replied',
    'lead_no_response'
  )),
  outcome_at timestamptz,

  -- The row this one replaces, so a chain reads forwards.
  supersedes_id uuid references public.listing_matches(id) on delete set null,
  -- Set on the row being replaced. A row with this set is history.
  superseded_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- §2.2 made structural. A computed row that cannot show its working is not a
  -- match, it is a number.
  constraint computed_rows_carry_their_reasoning check (
    origin <> 'computed'
    or (score is not null and strength is not null and reasoning is not null)),

  -- And the other direction, which is the one that protects the claim.
  constraint agent_rows_claim_no_score check (
    origin <> 'agent'
    or (score is null and strength is null and filter_would_find is null)),

  constraint outcome_has_its_moment check (
    (outcome is null) = (outcome_at is null))
);

-- ---------------------------------------------------------------------------
-- ⚖️ `agent_dismissed_lead` IS NOT AN OBJECTION. NOTHING MAY READ IT AS ONE.
-- ---------------------------------------------------------------------------
-- The two dismissals are different facts about different subjects:
--
--   agent_dismissed_match   "not this one"      -- about the MATCH
--   agent_dismissed_lead    "not this person"   -- about the LEAD, and it is
--                                                  the one that should stop
--                                                  them appearing in future
--                                                  candidate sets
--
-- The second is a WORKING PREFERENCE held by an agent. It is not the contact
-- exercising a right, and it must never become one. An objection is permanent,
-- belongs to the contact, lives in the consent ledger, and is recorded because
-- a person asked for it. If these ever merge, an agent's convenience becomes a
-- permanent legal state on somebody who never asked for it -- and it would be
-- invisible, because both produce the same silence.
--
-- Three things keep them apart, and the third is the one to add next:
--
--   1. They live in different tables. This is an outcome on a match; an
--      objection is an append-only row in `consent_events`.
--   2. The vocabulary does not invite the merge. The value is
--      `agent_dismissed_lead` and NOT `blocked`, `suppressed`, `do_not_contact`
--      or `opted_out`. A rename toward suppression language is the failure
--      mode; it would make the conflation read as obviously correct.
--   3. The gate must never read this table. It reads the ledger, the
--      suppression list and the policy row, and nothing else decides whether a
--      person may be messaged. When the matching run is built, that belongs in
--      a source-level check of the kind `one-sender.test.ts` already does for
--      the provider credential -- a boundary, not a rule.
--
-- The converse is also true and is the point of the value existing: the
-- CANDIDATE SET for a future listing should read it, because "stop showing me
-- this person" is exactly what the agent meant.

-- Only one CURRENT row per lead × listing; history is unbounded.
create unique index if not exists listing_matches_current_uniq
  on public.listing_matches (listing_id, lead_id)
  where superseded_at is null;

-- The agent-facing query: this listing's matches, strongest first.
create index if not exists listing_matches_listing_idx
  on public.listing_matches (listing_id, superseded_at, score desc);

-- The candidate-set query: what has this lead already been shown or dismissed.
create index if not exists listing_matches_lead_idx
  on public.listing_matches (lead_id, outcome);

create index if not exists listing_matches_client_created_idx
  on public.listing_matches (client_id, created_at desc);

-- ---------------------------------------------------------------------------
-- THE FREEZE. ALLOWLIST, NOT DENYLIST (0017's lesson, via 0020).
-- ---------------------------------------------------------------------------
-- Conditional, unlike `message_templates`: a match that nobody has been told
-- about is working state and may be corrected freely. The moment it has been
-- communicated it becomes a record of something that happened.
create or replace function public.listing_matches_freeze()
returns trigger language plpgsql as $$
declare
  mutable constant text[] := array[
    'outcome', 'outcome_at', 'superseded_at', 'updated_at'
  ];
  changed text[];
begin
  if old.agent_notified_at is null then
    new.updated_at := now();
    return new;
  end if;

  select array_agg(key order by key) into changed
  from jsonb_each(to_jsonb(new)) n
  where not (n.key = any(mutable))
    and n.value is distinct from (to_jsonb(old) -> n.key);

  if changed is not null then
    raise exception
      'listing_matches: this match was sent to an agent at %, so its reasoning is '
      'frozen. Refused change to: %. The agent acted on what this row SAID -- a row '
      'that rewrites its own justification afterwards means the record disagrees '
      'with what happened. Recompute by INSERTING a successor with supersedes_id '
      'set, and stamping superseded_at here. Only % may change.',
      old.agent_notified_at, array_to_string(changed, ', '), array_to_string(mutable, ', ');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists listing_matches_freeze_trg on public.listing_matches;
create trigger listing_matches_freeze_trg before update on public.listing_matches
  for each row execute function public.listing_matches_freeze();

-- Same deny-by-default posture as 0001: RLS on, no policies, every read and
-- write through the server with the service_role key.
alter table public.listing_matches enable row level security;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING -- and not with psql alone (0002, 0003)
-- ---------------------------------------------------------------------------
--   select has_table_privilege('service_role','public.listing_matches','INSERT'); -- t
--   select has_table_privilege('anon','public.listing_matches','SELECT');         -- f
--
-- Then through PostgREST, which is the path the real caller takes. A 42501 here
-- is the 0002 defect again; psql answering `t` proves nothing about it.
--
-- Each constraint proven by TRYING TO BREAK IT, the way 0009's status typo was:
--
--   -- an agent row that claims a score must be refused (23514)
--   insert into listing_matches (client_id, listing_id, lead_id, origin,
--     listing_status_at_match, score)
--     values (…, 'agent', 'available', 0.9);
--   -- expect: violates "agent_rows_claim_no_score"
--
--   -- and the one that protects the claim:
--   …same, with filter_would_find = false  -- expect the same refusal
--
--   -- a computed row with no reasoning must be refused
--   …origin='computed', score=0.9, strength='strong', reasoning=null
--   -- expect: violates "computed_rows_carry_their_reasoning"
--
--   -- two CURRENT rows for one pair must be refused
--   insert … twice with superseded_at null -- expect: duplicate key
--   -- and the SAME pair inserts fine once the first carries superseded_at
--
--   -- the freeze must refuse an edit to a notified row, and permit an outcome
--   update listing_matches set agent_notified_at = now() where id = …;
--   update listing_matches set score = 0.1 where id = …;      -- expect: raise
--   update listing_matches set outcome = 'agent_sent',
--          outcome_at = now() where id = …;                   -- expect: ok
--
-- Delete the fixtures afterwards and confirm zero rows remain.
