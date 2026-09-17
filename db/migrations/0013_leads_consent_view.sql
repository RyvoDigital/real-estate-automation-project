-- ============ the derivation — design §4.3 ============
--
-- Two objects, and the split is the point:
--
--   resolve_consent_state(jsonb) -> jsonb   PURE. The rules, and nothing else.
--   consent_by_contact                      the authority, keyed on the phone
--   leads_consent                           a convenience, keyed on the lead
--
-- WHY THE RULES ARE A PURE FUNCTION RATHER THAN SQL INSIDE THE VIEW
-- A view can only be tested by writing rows and reading them back. This ledger
-- refuses DELETE, so such a test can never clean up after itself, and the only
-- exit that leaves no trace is a transaction rollback -- which needs a real
-- Postgres session and therefore cannot run in the ordinary test suite. The
-- rules would have been checked by hand, when someone remembered.
--
-- A pure function takes its events as an argument. It can be called with
-- synthetic input, through PostgREST, from `npm test`, with nothing written
-- anywhere. So the rule that matters most -- an objection is permanent -- is
-- proved on every single run instead of when someone remembers. There is still
-- exactly ONE definition of the rules; the views call this function rather than
-- restating it, so there is no mirror to drift (lesson 15).
--
-- What still needs a by-hand transactional test is the WIRING: that the views
-- aggregate the right events, group by the right key, and join to leads
-- correctly. That is db/tests/0013_consent_view.test.sql, and the staleness of
-- that proof is watched by cockpit/tests/proof-staleness.test.ts.
--
-- THE ORDER OF THE RULES IS THE DESIGN (§4.3)
--   1. any objection            -> objected               PERMANENT
--   2. latest undwithdrawn consent_given -> consented
--   3. latest un-revoked declared        -> declared + segment
--   4. an un-revoked claimed/quarantined -> claimed_unevidenced
--   5. nothing                           -> undetermined
--
-- RULE 1 IS THE ONLY ONE THAT IGNORES WHAT COMES AFTER IT. Every other rule is
-- last-write-wins. An objection is not: a later consent does not overturn it,
-- it does not expire, and no operator setting overrides it. Someone who said
-- stop has said stop. This looks like an inconsistency to anyone who does not
-- know why it is there, which is exactly why it is the rule most likely to be
-- "tidied" by a future edit, and why it has its own test.
--
-- AND RULE 4 IS NOT A WEAK RULE 2
--   claimed_unevidenced is NOT a weaker form of consent.
--   It is a stronger form of NOTHING.
-- It exists so that "the agency asserted something we cannot use" and "nobody
-- ever said anything" stay different facts: the first is worth asking the
-- agency about, the second is not. Both are equally NOT CONTACTABLE. The
-- distinction governs what we ask a human, never what we send a lead. A state
-- sitting between `consented` and `undetermined` reads like partial permission,
-- and the day someone treats it as one is the day it sends a message.
--
-- THE VIEWS REPORT FACTS. THEY DO NOT DECIDE CONTACTABILITY.
-- Contactability is segment x jurisdiction policy x suppression, and policy
-- moves: Ireland's route lapses at twelve months, Spain's segment C is off, a
-- row is added when a new country is sold into. Bake today's policy in here and
-- "one table changes and every client is compliant tomorrow" stops being true.
-- These views say what was said and when. The gate applies the policy.

create or replace function public.resolve_consent_state(events jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  e            jsonb;
  best_consent jsonb := null;
  best_declare jsonb := null;
  best_claim   jsonb := null;
  withdrawn_at timestamptz := null;
begin
  if events is null or jsonb_array_length(events) = 0 then
    return jsonb_build_object('state', 'undetermined');
  end if;

  -- RULE 1, first and unconditional. Nothing later in this function can undo
  -- it, and nothing later in the array can either.
  for e in select * from jsonb_array_elements(events) loop
    if e->>'kind' = 'objection' then
      return jsonb_build_object(
        'state', 'objected',
        'occurred_at', e->>'occurred_at',
        'source', e->>'source',
        'event_id', e->>'id');
    end if;
  end loop;

  for e in select * from jsonb_array_elements(events) loop
    if e->>'kind' = 'consent_withdrawn' then
      withdrawn_at := greatest(coalesce(withdrawn_at, '-infinity'::timestamptz),
                               (e->>'recorded_at')::timestamptz);
    end if;
  end loop;

  for e in select * from jsonb_array_elements(events) loop
    case e->>'kind'
      when 'consent_given' then
        -- 0012 guarantees occurred_at is present on this kind, which is what
        -- lets the gate expiry-check it at all.
        if best_consent is null
           or (e->>'occurred_at')::timestamptz > (best_consent->>'occurred_at')::timestamptz then
          best_consent := e;
        end if;
      when 'declared' then
        if best_declare is null
           or (e->>'recorded_at')::timestamptz > (best_declare->>'recorded_at')::timestamptz then
          best_declare := e;
        end if;
      when 'claimed', 'quarantined' then
        if best_claim is null
           or (e->>'recorded_at')::timestamptz > (best_claim->>'recorded_at')::timestamptz then
          best_claim := e;
        end if;
      else null;
    end case;
  end loop;

  -- A claim whose import was undone is not a claim. It falls through to
  -- `undetermined` rather than to rule 4, because there is no longer anything
  -- to ask the agency to confirm (design §7.2).
  if best_claim is not null and public.claim_is_revoked(events, best_claim) then
    best_claim := null;
  end if;
  if best_declare is not null and public.claim_is_revoked(events, best_declare) then
    best_declare := null;
  end if;

  if best_consent is not null
     and (withdrawn_at is null
          or withdrawn_at < (best_consent->>'recorded_at')::timestamptz) then
    return jsonb_build_object(
      'state', 'consented',
      'occurred_at', best_consent->>'occurred_at',
      'source', best_consent->>'source',
      'event_id', best_consent->>'id');
  end if;

  if best_declare is not null then
    return jsonb_build_object(
      'state', 'declared',
      'segment', best_declare->>'segment',
      'occurred_at', best_declare->>'occurred_at',
      'source', best_declare->>'source',
      'event_id', best_declare->>'id');
  end if;

  if best_claim is not null then
    return jsonb_build_object(
      'state', 'claimed_unevidenced',
      'occurred_at', best_claim->>'occurred_at',
      'source', best_claim->>'source',
      'event_id', best_claim->>'id');
  end if;

  return jsonb_build_object('state', 'undetermined');
end;
$$;

-- A revocation cancels events from the same import batch. When either side
-- carries no batch id, a revocation recorded later cancels it: the operator
-- said "undo this", and the safe reading of an ambiguous undo is the one that
-- contacts fewer people.
create or replace function public.claim_is_revoked(events jsonb, target jsonb)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1 from jsonb_array_elements(events) r
    where r->>'kind' = 'claim_revoked'
      and (r->>'recorded_at')::timestamptz >= (target->>'recorded_at')::timestamptz
      and (
        (r->'evidence'->>'batch_id') is null
        or (target->'evidence'->>'batch_id') is null
        or (r->'evidence'->>'batch_id') = (target->'evidence'->>'batch_id')
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- THE AUTHORITY: keyed on the contact, because the ledger is
-- ---------------------------------------------------------------------------
-- Every gate decision reads THIS. A lead row is deleted by a revert and
-- recreated by the next import; an objection belongs to the phone and survives
-- both. Asking `leads_consent` whether a number may be messaged would miss an
-- objection whose lead row no longer exists, which is the exact failure the
-- ledger's key was chosen to prevent.
create or replace view public.consent_by_contact as
with per_contact as (
  select client_id,
         phone_e164,
         jsonb_agg(jsonb_build_object(
           'id',          id,
           'kind',        kind,
           'occurred_at', occurred_at,
           'recorded_at', recorded_at,
           'segment',     segment,
           'source',      source,
           'evidence',    evidence
         ) order by recorded_at) as events
  from public.consent_events
  group by client_id, phone_e164
)
select client_id,
       phone_e164,
       (res->>'state')              as state,
       (res->>'segment')            as segment,
       (res->>'occurred_at')::timestamptz as occurred_at,
       (res->>'source')             as source,
       (res->>'event_id')::uuid     as event_id
from per_contact, lateral (select public.resolve_consent_state(events) as res) r;

-- ---------------------------------------------------------------------------
-- THE CONVENIENCE: the same answer, hung off the lead, for lead-shaped screens
-- ---------------------------------------------------------------------------
-- A lead with no events at all appears as `undetermined` rather than vanishing.
-- Absence would make "nobody has said anything about this person" look
-- identical to "this person is not in the system", and an empty result that
-- gets narrated as a fact is §5b.
create or replace view public.leads_consent as
select l.id                              as lead_id,
       l.client_id,
       l.phone                           as phone_e164,
       coalesce(c.state, 'undetermined') as state,
       c.segment,
       c.occurred_at,
       c.source,
       c.event_id
from public.leads l
left join public.consent_by_contact c
  on c.client_id = l.client_id
 and c.phone_e164 = l.phone;

-- Server-side only, same posture as every other object here.
revoke all on public.consent_by_contact from anon, authenticated;
revoke all on public.leads_consent      from anon, authenticated;
grant select on public.consent_by_contact to service_role;
grant select on public.leads_consent      to service_role;
grant execute on function public.resolve_consent_state(jsonb) to service_role;
grant execute on function public.claim_is_revoked(jsonb, jsonb) to service_role;

comment on function public.resolve_consent_state(jsonb) is
  'The consent rules, pure so they can be tested with synthetic events and no writes. Rule 1: an objection is permanent and is never superseded. See docs/consent-ledger-design.md §4.3.';
comment on view public.consent_by_contact is
  'Authoritative consent state per (client_id, phone_e164). Gates read this, never leads_consent.';
comment on view public.leads_consent is
  'Lead-shaped convenience over consent_by_contact. A lead with no events reads as undetermined.';

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
-- 1. The rules, with no rows written. This is the same call the test suite
--    makes, and rule 1 is the one to run by eye at least once:
--
--    select public.resolve_consent_state('[
--      {"id":"00000000-0000-0000-0000-000000000001","kind":"objection",
--       "recorded_at":"2026-01-01T00:00:00Z","occurred_at":"2026-01-01T00:00:00Z"},
--      {"id":"00000000-0000-0000-0000-000000000002","kind":"consent_given",
--       "recorded_at":"2026-06-01T00:00:00Z","occurred_at":"2026-06-01T00:00:00Z"}
--    ]'::jsonb);
--    -- expect: {"state": "objected", ...}. A consent appended after an
--    -- objection must NOT change it.
--
-- 2. The real row this ledger already holds:
--    select * from public.consent_by_contact;
--    -- expect one row, +351912345678, state = claimed_unevidenced
--
-- 3. The wiring test, by hand, in a transaction:
--    db/tests/0013_consent_view.test.sql  -- run inside begin ... rollback
--    Its staleness is watched by cockpit/tests/proof-staleness.test.ts, which
--    fails the suite if this file changes and that proof is not re-run.
