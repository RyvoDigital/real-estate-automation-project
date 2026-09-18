-- ============ 0024 — a declaration without a name is not a declaration ============
--
-- The same rule as 0014's jurisdiction confirmation, for the same reason and
-- with the same shape: an act with legal consequences has an author, and a date
-- with no name attached is a date.
--
-- Enquadramento §5.1: "Cada declaração é registada com data, hora e
-- identificação de quem a efectuou." The knowledge of where a contact came from
-- exists at the agency and nowhere else; the declaration is the moment that
-- knowledge enters our record, and the record is worth exactly as much as the
-- name on it.
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ declared_by IS THE AGENCY'S PERSON. evidence.recorded_by IS OURS.       │
-- │ THEY ARE NOT THE SAME FIELD AND MUST NOT BE MERGED.                     │
-- │                                                                         │
-- │ Somebody will propose merging them — one "user" column is simpler, and  │
-- │ in the meeting it IS one laptop with one operator driving. Merging      │
-- │ them would put OUR name on THEIR assertion.                             │
-- │                                                                         │
-- │ That inverts the thing the whole architecture rests on. The agency      │
-- │ declares because the agency knows; we record because we are holding the │
-- │ pen. If a supervisory authority later asks who said these contacts were │
-- │ past clients, the answer must be the person who knew, not the person    │
-- │ who typed. Responsibility follows knowledge, and the column that names  │
-- │ the responsible party has to name the one who had it.                   │
-- └─────────────────────────────────────────────────────────────────────────┘

alter table public.consent_events
  add constraint declaration_has_its_author
  check (kind <> 'declared' or declared_by is not null);

comment on column public.consent_events.declared_by is
  'The person AT THE AGENCY who declared this, by name. Never the operator who recorded it — that is evidence.recorded_by. Responsibility follows knowledge (0024).';

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
-- The ledger refuses UPDATE and DELETE, so these run inside a transaction and
-- roll back; the append-only trigger does not fire on INSERT.
--
--   begin;
--     insert into public.consent_events (client_id, phone_e164, kind, source, segment)
--     select id, '+351900000007', 'declared', 'agency_attestation', 'A'
--       from public.clients limit 1;
--     -- expect: ERROR ... declaration_has_its_author
--   rollback;
--
--   begin;
--     insert into public.consent_events (client_id, phone_e164, kind, source, segment, declared_by)
--     select id, '+351900000007', 'declared', 'agency_attestation', 'A', 'Ana Ferreira (Cascais Demo)'
--       from public.clients limit 1;
--     -- expect: INSERT 0 1
--   rollback;
--
-- And the constraint must leave every OTHER kind alone — an objection has no
-- declarer, and requiring one would make a contact's own opt-out unrecordable:
--
--   begin;
--     insert into public.consent_events (client_id, phone_e164, kind, source, occurred_at)
--     select id, '+351900000007', 'objection', 'whatsapp_reply', now()
--       from public.clients limit 1;
--     -- expect: INSERT 0 1   (no declared_by, and correctly so)
--   rollback;
