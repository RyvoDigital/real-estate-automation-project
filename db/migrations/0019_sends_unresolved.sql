-- ============ 0019 — `unresolved`, and the index reconciliation reads ============
--
-- Additive to 0015 and 0017.
--
-- WHY `unresolved` IS A STATUS AND NOT A FLAG
-- A row sits at `intended` when the provider did not answer. Reconciliation
-- looks for it in the provider's own message list and either completes it or
-- cannot. A row it could not complete must be distinguishable from one that is
-- merely young -- otherwise the ten-minute grace period silently becomes the
-- definition of "unresolved for ever", and a number that should be zero is
-- mixed in with rows that are simply waiting their turn.
--
-- It behaves as NOT SENT everywhere. Every constraint in 0015 is keyed on
-- `status <> 'sent'`, so they are unaffected: an unresolved row still cannot
-- claim a send it does not have the evidence for.
--
-- WHAT IT MEANS OPERATIONALLY: we do not know whether this person received a
-- message. Not "they did not" -- we do not know. That is an uncomfortable state
-- to have in a table and it is the honest one; the alternative is guessing, and
-- guessing writes either a send that never happened or a silence that was not.

alter table public.sends drop constraint if exists sends_status_check;
alter table public.sends
  add constraint sends_status_check
  check (status in ('intended', 'sent', 'failed', 'refused', 'unresolved'));

-- The first reconciliation pass reads exactly this: rows still waiting, oldest
-- first. Partial, because `sent` rows are the overwhelming majority and none of
-- them belong in this index.
create index if not exists sends_awaiting_reconciliation_idx
  on public.sends (intent_recorded_at)
  where status in ('intended', 'unresolved');

-- The orphan sweep matches provider ids back to rows, and does it for every
-- outbound message in a 48-hour window.
create index if not exists sends_provider_message_id_idx
  on public.sends (provider_message_id)
  where provider_message_id is not null;

comment on column public.sends.status is
  'intended → sent | failed, or unresolved when the provider did not answer and reconciliation could not find the message. `unresolved` means we do not know whether it arrived -- never that it did not.';

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   begin;
--     insert into public.sends (client_id, phone_e164, automation, idempotency_key,
--       gate_verdict, gate_decided_at, status)
--     select id, '+351911111111', 'proof', 'proof-0019', 'permitted', now(), 'unresolved'
--       from public.clients limit 1;
--     -- expect: INSERT 0 1   (0015 would have refused this status)
--
--     -- and the freeze still holds on a row in the new state:
--     update public.sends set gate_basis = 'x' where idempotency_key = 'proof-0019';
--     -- expect: ERROR ... Refused change to: gate_basis
--
--     -- while the outcome half stays writable:
--     update public.sends set reconciled_at = now(), last_error = 'not found in provider log'
--      where idempotency_key = 'proof-0019';
--     -- expect: UPDATE 1
--   rollback;
--
--   select indexname from pg_indexes where tablename = 'sends'
--    and indexname in ('sends_awaiting_reconciliation_idx', 'sends_provider_message_id_idx');
--   -- expect: 2 rows
