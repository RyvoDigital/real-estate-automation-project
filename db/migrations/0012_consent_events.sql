-- ============ consent_events — the ledger (design doc §3) ============
--
-- One row per consent event, never updated, never deleted. It exists for one
-- purpose: to answer a supervisory authority asking why a particular person
-- received a particular message. Everything below follows from that.
--
-- WHY IT EXISTS AT ALL
-- `leads.consent_status` / `consent_at` were a mutable three-value column and a
-- timestamp, and the importer wrote both from a spreadsheet cell -- "sim"
-- became a consented person, at the moment of import. The reading is now a
-- claim (cockpit/src/lib/import/normalise.ts) and consent lives here instead.
-- The full reasoning is docs/consent-ledger-design.md; this header carries only
-- what a person reading the schema needs in order not to undo it.
--
-- TWO CLOCKS, AND THIS IS THE ROOT OF THE DEFECT BEING FIXED
--   occurred_at  when the act happened -- the person said yes
--   recorded_at  when we came to know it -- the import ran, the reply arrived
-- One column was being written with the second and read as the first. They are
-- separate here and neither is ever derived from the other.
--
-- AND THE DATA SAID SO BEFORE ANYONE ARGUED IT
-- The one surviving false row, read on 2026-09-17:
--
--   leads.consent_at   2026-09-08T12:25:37.265Z
--   batch committed_at 2026-09-08T12:25:37.375Z   (+110ms)
--   leads.created_at   2026-09-08T12:25:37.376Z   (+111ms)
--
-- The consent timestamp precedes the creation of the row it belongs to. The
-- field asserts that a person consented 111 milliseconds before our record of
-- that person existed -- because `new Date()` fired while the row objects were
-- being built, ahead of any insert. Nothing about that is arguable. When two
-- clocks are collapsed into one column the collapse is invisible in the source
-- and eventually becomes an ordering in the data that cannot be true, and that
-- impossibility is the cheapest proof available. See engineering-lessons §10.
--
-- occurred_at IS NULLABLE, DELIBERATELY, AND THAT IS NOT AN OVERSIGHT
-- For the rows this migration's companion pass will quarantine, the time of the
-- act is genuinely unknown: the only surviving timestamp is the import clock,
-- which is a recorded_at. A NOT NULL column would force that value into
-- occurred_at and the ledger would assert that a person consented at 12:25:37
-- on the Tuesday we imported a spreadsheet. That is the defect reappearing
-- inside its own fix. A null here reads as "we know this was claimed, we do not
-- know when it happened", and every consumer must handle it by REFUSING, never
-- by guessing. Same rule as `wording` being null: an invented value in a
-- regulatory record is worse than a recorded gap.
--
-- ...EXCEPT FOR CONSENT ITSELF, WHICH CANNOT BE UNDATED (see the check below)
-- `kind = 'consent_given'` requires occurred_at. Consent with no date cannot be
-- expiry-checked -- Ireland's existing-customer route lapses 12 months from the
-- act -- so an undated consent is one the gate could never safely honour. The
-- database refuses to hold it rather than leaving the gate to notice.
--
-- THE IDENTITY IS THE PHONE, NOT THE LEAD ROW
-- A lead row is deleted by a revert, merged by dedupe, recreated by the next
-- import. An objection has to survive all three, so the ledger is keyed on
-- (client_id, phone_e164) and `lead_id` is a convenience link only.
--
-- §6f warns that `on delete set null` destroys more quietly than `cascade`. It
-- is the RIGHT behaviour here and the exception is deliberate: losing the lead
-- link costs nothing because the phone is the identity, whereas cascading would
-- delete an objection because a lead row was tidied up. The lesson is honoured
-- by justifying the exception, not by ignoring it.
--
-- CLIENT-SCOPED, ALWAYS
-- Consent is given to a controller. An objection to one agency is not an
-- objection to another, and there is no such thing as a global row here.

create table if not exists public.consent_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,

  -- The identity. Normalised at the boundary so nothing downstream has to
  -- wonder: a number that cannot be written in E.164 cannot be recorded.
  phone_e164 text not null,
  lead_id uuid references public.leads(id) on delete set null,

  kind text not null,
  occurred_at timestamptz,                         -- null = time of act unknown
  recorded_at timestamptz not null default now(),

  segment text,                                    -- A..E, when the event declares one
  source text not null,
  wording text,                                    -- null = NOT RETAINED, never a guess
  evidence jsonb not null default '{}',            -- batch id, line, message id, template id
  declared_by text,
  jurisdiction text,                               -- ISO-3166-1 alpha-2, from the prefix
  note text,
  created_at timestamptz not null default now(),

  constraint consent_events_kind_known check (kind in (
    'claimed',           -- the agency asserted something we cannot evidence
    'claim_revoked',     -- the import behind a claim was undone
    'declared',          -- the agency classified the contact into a segment
    'consent_given',
    'consent_withdrawn',
    'objection',         -- SAIR, a block, a suppression list
    'quarantined',       -- OUR correction of a record we should not have written
    'erasure'
  )),
  constraint consent_events_source_known check (source in (
    'import_declaration', 'agency_attestation', 'whatsapp_reply',
    'web_form', 'operator', 'meta_block', 'system'
  )),
  constraint consent_events_segment_known check (segment is null or segment in ('A','B','C','D','E')),
  constraint consent_events_phone_e164 check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  constraint consent_events_jurisdiction_iso check (jurisdiction is null or jurisdiction ~ '^[A-Z]{2}$'),

  -- Consent cannot be undated. Everything else can.
  constraint consent_events_consent_is_dated
    check (kind <> 'consent_given' or occurred_at is not null)
);

-- The lookup the view performs for every contact.
create index if not exists consent_events_contact_idx
  on public.consent_events (client_id, phone_e164, recorded_at desc);

-- Suppression is the hottest question in the system and the one that must never
-- be slow enough to be tempting to skip.
create index if not exists consent_events_objection_idx
  on public.consent_events (client_id, phone_e164)
  where kind = 'objection';

-- ---------------------------------------------------------------------------
-- APPEND-ONLY, ENFORCED TWICE
-- ---------------------------------------------------------------------------
-- The trigger is the guarantee. The revoke is the belt: 0002 set ALTER DEFAULT
-- PRIVILEGES for service_role on this schema, so a table created here INHERITS
-- update and delete without anyone asking for them. Both are needed, because a
-- future default-privileges change can silently restore what the revoke took
-- away, and a future superuser session can drop a trigger.
create or replace function public.consent_events_append_only()
returns trigger language plpgsql as $$
begin
  raise exception
    'consent_events is append-only: % refused. Record what happened next instead (design §5.2).',
    tg_op;
end;
$$;

drop trigger if exists consent_events_no_update on public.consent_events;
create trigger consent_events_no_update
  before update or delete on public.consent_events
  for each row execute function public.consent_events_append_only();

-- TRUNCATE does not fire a row-level trigger, and would empty the ledger
-- without tripping either guard above.
drop trigger if exists consent_events_no_truncate on public.consent_events;
create trigger consent_events_no_truncate
  before truncate on public.consent_events
  for each statement execute function public.consent_events_append_only();

revoke update, delete, truncate on public.consent_events from service_role;
revoke update, delete, truncate on public.consent_events from authenticated, anon;

-- Same deny-by-default posture as 0001 and 0008: RLS on, no policies, every
-- read and write through the server with the service_role key.
alter table public.consent_events enable row level security;

comment on table public.consent_events is
  'Append-only consent ledger. Keyed on (client_id, phone_e164) so an objection survives revert, dedupe and re-import. See docs/consent-ledger-design.md.';
comment on column public.consent_events.occurred_at is
  'When the act happened. NULL means genuinely unknown -- never substitute a plausible value; consumers must refuse, not guess.';
comment on column public.consent_events.recorded_at is
  'When we came to know it. Never read as the time of the act.';
comment on column public.consent_events.wording is
  'The exact text shown to the person, or the exact cell asserted. NULL means NOT RETAINED.';

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING (do not skip -- 0002 exists because this was assumed)
-- ---------------------------------------------------------------------------
--   select has_table_privilege('service_role', 'public.consent_events', 'INSERT');  -- expect: t
--   select has_table_privilege('service_role', 'public.consent_events', 'UPDATE');  -- expect: f
--   select has_table_privilege('service_role', 'public.consent_events', 'DELETE');  -- expect: f
--
-- And prove the trigger fires, because a guard that has never been seen to fire
-- has not been shown to work (§0.7). Run inside a transaction and roll back:
--   begin;
--     insert into public.consent_events (client_id, phone_e164, kind, source)
--     select id, '+351900000000', 'claimed', 'system' from public.clients limit 1;
--     update public.consent_events set note = 'x' where phone_e164 = '+351900000000';
--     -- expect: ERROR ... consent_events is append-only: UPDATE refused
--   rollback;
--
-- Through PostgREST, which is the path the cockpit actually takes:
--   curl -s -X POST "$SUPABASE_URL/rest/v1/consent_events" \
--     -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
--     -H 'content-type: application/json' -H 'Prefer: return=representation' \
--     -d '{"client_id":"<a real client>","phone_e164":"+351900000000","kind":"claimed","source":"system"}'
--   -- expect 201. A 42501 here is the 0002 defect again.
