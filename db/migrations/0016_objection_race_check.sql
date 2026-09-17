-- ============ invariant 3: no send after an objection ============
--
-- The one invariant of the send record that CANNOT be a check constraint,
-- because it spans two tables:
--
--   For every sends row with sent_at, there must be no consent_events
--   objection for that (client_id, phone_e164) with recorded_at <= sent_at.
--
-- WHAT IT ACTUALLY CATCHES, WHICH IS NARROWER THAN IT LOOKS
-- The gate already refuses a contact whose ledger holds an objection, so an
-- objection in the ledger cannot produce a second message THROUGH the gate. So
-- this does not prevent the second message -- the gate does. What it catches is
-- a message that already went out wrongly, by one of two causes:
--
--   THE RACE      an objection recorded between the gate's decision and the
--                 send. Real, and measured in seconds. The row shows
--                 gate_decided_at < objection.recorded_at <= sent_at.
--   STALE EVIDENCE a decision held too long before being acted on -- a queued
--                 batch, a retry, a paused campaign resumed.
--
-- AND WHAT IT CANNOT CATCH, STATED PLAINLY
-- A total bypass -- something sending without inserting a sends row at all --
-- is invisible here, because this iterates sends rows. That gap needs a
-- different check: reconciling the provider's own message log against this
-- table. It is the §4.9 "who watches the watchers" shape and it is NOT built.
-- Recorded so nobody reads this invariant as covering more than it does.
--
-- ---------------------------------------------------------------------------
-- CADENCE: every 5 minutes, plus a nightly full sweep. Reasoning, because the
-- number matters less than why it is that number.
-- ---------------------------------------------------------------------------
-- The violation condition uses recorded_at, not occurred_at: an objection we
-- learn of tomorrow about a send from yesterday has recorded_at > sent_at and
-- is NOT a violation -- we could not have known. That is the load-bearing
-- fact for the cadence: nothing arrives late that turns an old send into a
-- violation. Every violation is therefore detectable within seconds of
-- happening, and a rolling window is sufficient.
--
--   TOO SLOW (hourly, daily): the damage is bounded to the messages already
--   sent -- but the apology is what is delayed, and a client learning on
--   Thursday that we messaged someone who opted out on Tuesday is a different
--   conversation from learning within the hour.
--
--   TOO FAST (every 30s): load for a window measured in seconds, on a query
--   that will almost always return nothing. And it buys nothing, because the
--   response is a human one.
--
--   FIVE MINUTES bounds the apology latency to something defensible while the
--   rolling query stays trivial -- indexed on sends_sent_at_idx, over a 15
--   minute window, which for a campaign capped at 30 messages a day is a
--   handful of rows.
--
-- NOT event-driven after each batch, though that would be tighter. A check
-- that runs because a caller remembered to call it is not a control (rule 13,
-- and engineering-lessons §12): the scheduled sweep covers the paths that
-- forget, including the ones not written yet.
--
-- THE NIGHTLY FULL SWEEP over 30 days exists for a different reason than late
-- data: it catches a BUG IN THE ROLLING CHECK -- a window boundary, a timezone,
-- a clock skew between rows. A check that only ever examines the last fifteen
-- minutes can be quietly broken for months.
--
-- ---------------------------------------------------------------------------
-- WHEN IT FIRES: alert AND halt. Not alert alone.
-- ---------------------------------------------------------------------------
-- Same asymmetry as opt-out recognition (src/opt_out.js): halting is cheap and
-- a human undoes it in a second; anything irreversible waits for a person.
--
--   HALT     the client's campaigns stop immediately. If this fired, either a
--            decision was acted on too late or something is sending outside
--            the gate -- both mean the NEXT send is unsafe, and the cost of
--            being wrong is a pause.
--   ALERT    critical, on the same channel as an invariant violation (§3.7),
--            naming the send row, the objection row, and the gap between them.
--   RECORD   an `invariant.violated` event, consistent with the six.
--
--   DOES NOT write an objection -- one already exists, which is the point.
--   DOES NOT try to unsend. It cannot, and pretending otherwise would be the
--            §0 defect: narrating a state we have not secured.

create or replace view public.invariant_send_after_objection as
select s.id                        as send_id,
       s.client_id,
       s.phone_e164,
       s.automation,
       s.campaign_id,
       s.gate_decided_at,
       s.sent_at,
       s.provider_message_id,
       o.id                        as objection_id,
       o.recorded_at               as objection_recorded_at,
       o.source                    as objection_source,
       -- Which of the two causes this was. A race is a design limit; stale
       -- evidence is a bug in whatever held the decision.
       case
         when o.recorded_at > s.gate_decided_at then 'race'
         else 'stale_evidence'
       end                         as cause,
       s.sent_at - o.recorded_at   as sent_after_objection_by
from public.sends s
join public.consent_events o
  on o.client_id = s.client_id
 and o.phone_e164 = s.phone_e164
 and o.kind = 'objection'
 and o.recorded_at <= s.sent_at
where s.sent_at is not null;

revoke all on public.invariant_send_after_objection from anon, authenticated;
grant select on public.invariant_send_after_objection to service_role;

comment on view public.invariant_send_after_objection is
  'Invariant 3: a message sent after an objection was already recorded. Empty is the only acceptable result. Checked every 5 minutes over a rolling window, plus a nightly sweep over 30 days -- see this migration''s header for why those numbers.';

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select * from public.invariant_send_after_objection;   -- expect: no rows
--
-- And seen to fire, inside a transaction, because a check that has never
-- returned a row has not been shown to detect anything (§0.7). The reserved
-- range is used deliberately: those numbers already hold real objections, and
-- the `sent` constraint refuses them -- so the fixture is inserted as
-- 'intended' with a sent_at, which is the one shape this view reads and the
-- check constraint permits.
--
--   begin;
--     insert into public.sends (client_id, phone_e164, automation,
--       idempotency_key, status, gate_verdict, gate_decided_at, sent_at)
--     select client_id, phone_e164, 'proof', 'proof-inv3-race', 'intended',
--            'permitted', recorded_at - interval '2 seconds', recorded_at + interval '1 second'
--       from public.consent_events where kind = 'objection' limit 1;
--     select send_id, cause, sent_after_objection_by
--       from public.invariant_send_after_objection;
--     -- expect: one row, cause = 'race'
--   rollback;
