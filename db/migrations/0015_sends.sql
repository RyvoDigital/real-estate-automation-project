-- ============ sends — the record that precedes the action ============
--
-- One row per business-initiated message, written BEFORE the send and completed
-- after it. Full reasoning in docs/send-record-design.md; what a reader of the
-- schema needs in order not to undo it is here.
--
-- WHY THE ROW COMES FIRST (§3.10)
-- A row written after a successful send cannot record a send that failed
-- halfway, and "we sent something and lost the record" is the worst available
-- outcome in a regulatory table. So: gate decides, row is inserted as
-- 'intended', message goes out, the SAME row is updated with the outcome.
--
-- And that ordering buys something beyond durability: because the row exists
-- before the message does, the CHECK constraints below are enforced by the
-- database rather than observed afterwards. A future caller could bypass the
-- gate entirely and Postgres would still refuse to record the send. That is the
-- only version of this guarantee worth having.
--
-- THE EVIDENCE IS COPIED, NOT JOINED (engineering-lessons §11b)
-- jurisdiction_policy is MUTABLE by design -- Ireland's expiry, Spain's segment
-- C, ePrivacy landing are all UPDATEs, which is why policy lives in data. So a
-- join answers "what does the law say now" when the question asked of this
-- table is always "what authorised this send THEN". In a year those differ, and
-- the join gives the confident wrong answer. policy_confirmed_at,
-- policy_confirmed_by, policy_statute and gate_basis are therefore snapshots.
--
-- consent_event_id stays a foreign key, because consent_events is append-only
-- and cannot change under us. It is the one table a join to is safe, and it is
-- safe structurally rather than hopefully.
--
-- THE AUTHORISATION IS IMMUTABLE ONCE WRITTEN
-- The gate columns are writable on insert and never again (trigger below); the
-- outcome columns stay writable because the outcome genuinely arrives later. A
-- row recording a send that should not have happened is the only row anyone
-- would ever be tempted to edit, and an authorisation that can be rewritten
-- afterwards is not an authorisation, it is a note.

create table if not exists public.sends (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  phone_e164 text not null,

  automation text not null,                        -- reactivation_02, review_05, ...
  campaign_id uuid,

  -- Generated BEFORE the send and passed to the provider. Without it a row
  -- stuck at 'intended' is permanently undecidable -- did it go out? -- and an
  -- ambiguity in this table is not acceptable. With it, a reconciliation pass
  -- asks the provider what became of this key and completes the row.
  idempotency_key text not null unique,

  status text not null default 'intended'
    check (status in ('intended', 'sent', 'failed', 'refused')),

  -- ---- what authorised it. Copied at decision time, then frozen. ----------
  gate_verdict text not null check (gate_verdict in ('permitted', 'refused')),
  gate_layer text,                                 -- refusals: which layer said no
  gate_reason text,
  gate_detail text,
  gate_basis text,                                 -- permissions: the sentence
  gate_obligations jsonb not null default '[]',    -- conditions that rode WITH it
  gate_decided_at timestamptz not null,

  country text check (country is null or country ~ '^[A-Z]{2}$'),
  segment text check (segment is null or segment in ('A','B','C','D','E')),

  consent_event_id uuid references public.consent_events(id),
  consent_occurred_at timestamptz,

  policy_country text,
  policy_confirmed_at timestamptz,
  policy_confirmed_by text,
  policy_statute text,

  -- ---- what was going to be sent, written before sending -----------------
  template_name text,
  template_language text,
  template_approval_id text,
  body_intended text,
  intent_recorded_at timestamptz not null default now(),

  -- ---- the outcome, against the same row ----------------------------------
  provider text,
  provider_message_id text,
  body_sent text,                                  -- from the wire, not from a flag
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  error text,
  reconciled_at timestamptz,                       -- when the key was chased

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- =======================================================================
  -- INVARIANT 1. Nothing is recorded as sent without a permission on the row.
  -- =======================================================================
  constraint send_requires_permission check (
    status <> 'sent' or (
      gate_verdict = 'permitted'
      and consent_event_id is not null
      and gate_basis is not null
    )),

  -- =======================================================================
  -- INVARIANT 2. Nothing is sent into a jurisdiction no lawyer confirmed.
  -- A date with no name is not a confirmation -- same rule as 0014.
  -- =======================================================================
  constraint send_requires_confirmed_policy check (
    status <> 'sent' or (
      policy_confirmed_at is not null
      and policy_confirmed_by is not null
    )),

  -- =======================================================================
  -- INVARIANT 3a. The reserved test range is never sendable, at the database
  -- as well as at the gate. The fixtures of an append-only ledger must not be
  -- messageable, and "everyone knows those are fake" is not a mechanism.
  -- =======================================================================
  constraint send_never_reserved check (
    status <> 'sent' or phone_e164 !~ '^\+351900000[0-9]{3}$'
    ),

  -- A refusal is a decision too, and it must say which and why.
  constraint refusal_states_its_reason check (
    status <> 'refused' or (gate_layer is not null and gate_reason is not null)),

  -- A send that happened has a time and a provider id; one without the other
  -- is a row nobody can reconcile.
  constraint sent_has_provider_id check (
    status <> 'sent' or (sent_at is not null and provider_message_id is not null))
);

create index if not exists sends_client_created_idx on public.sends (client_id, created_at desc);
create index if not exists sends_contact_idx on public.sends (client_id, phone_e164);
-- The cross-table invariant's query, and the reconciliation sweep's.
create index if not exists sends_sent_at_idx on public.sends (sent_at) where sent_at is not null;
create index if not exists sends_unresolved_idx on public.sends (intent_recorded_at)
  where status = 'intended';

-- ---------------------------------------------------------------------------
-- THE AUTHORISATION IS FROZEN; THE OUTCOME IS NOT
-- ---------------------------------------------------------------------------
create or replace function public.sends_freeze_authorisation()
returns trigger language plpgsql as $$
begin
  if new.client_id           is distinct from old.client_id
  or new.phone_e164          is distinct from old.phone_e164
  or new.automation          is distinct from old.automation
  or new.idempotency_key     is distinct from old.idempotency_key
  or new.gate_verdict        is distinct from old.gate_verdict
  or new.gate_layer          is distinct from old.gate_layer
  or new.gate_reason         is distinct from old.gate_reason
  or new.gate_basis          is distinct from old.gate_basis
  or new.gate_obligations    is distinct from old.gate_obligations
  or new.gate_decided_at     is distinct from old.gate_decided_at
  or new.country             is distinct from old.country
  or new.segment             is distinct from old.segment
  or new.consent_event_id    is distinct from old.consent_event_id
  or new.consent_occurred_at is distinct from old.consent_occurred_at
  or new.policy_confirmed_at is distinct from old.policy_confirmed_at
  or new.policy_confirmed_by is distinct from old.policy_confirmed_by
  or new.policy_statute      is distinct from old.policy_statute
  or new.body_intended       is distinct from old.body_intended
  or new.intent_recorded_at  is distinct from old.intent_recorded_at then
    raise exception
      'sends: the authorisation is frozen once written. Only the outcome columns may change. '
      'A row recording a send that should not have happened is the only row anyone would be '
      'tempted to edit (engineering-lessons 11b).';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sends_freeze on public.sends;
create trigger sends_freeze before update on public.sends
  for each row execute function public.sends_freeze_authorisation();

alter table public.sends enable row level security;
revoke all on public.sends from anon, authenticated;
grant select, insert, update on public.sends to service_role;

comment on table public.sends is
  'One row per business-initiated message, written BEFORE the send. The evidence is copied, not joined, because jurisdiction_policy is mutable (engineering-lessons 11b).';
comment on column public.sends.idempotency_key is
  'Generated before the send and given to the provider, so a row stuck at "intended" is a question with an answer rather than permanently undecidable.';
comment on column public.sends.body_sent is
  'What the provider actually accepted. Compared with body_intended, because a guarantee checked against an internal flag is a guarantee about the flag.';

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING: db/tests/0015_sends_constraints.test.sql
-- Each of the three invariants, plus the freeze, SEEN to refuse a row it must
-- refuse, inside a transaction that rolls back. A constraint that has never
-- been observed to fire has not been shown to hold (§0.7).
-- ---------------------------------------------------------------------------
