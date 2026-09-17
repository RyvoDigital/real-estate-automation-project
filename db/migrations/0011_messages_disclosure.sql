-- ============ messages.disclosure — proof the AI disclosure was sent ============
--
-- Article 50 of Regulation (EU) 2024/1689 has been directly applicable since
-- 2 August 2026: a person must be told they are interacting with an AI system
-- "in a clear and distinguishable manner, at the latest at the time of the
-- first interaction". The Commission reads it as a duty of design, not of
-- notice. Clause 12 of the DPA and Clause 10.5 of the service agreement state
-- that the system complies.
--
-- An auditor will ask us to PROVE it, not describe it. This column is one of
-- four independent records of the same fact, so that no single deletion or bug
-- erases the proof:
--
--   1. this column               -- structured, queryable, per outbound row
--   2. messages.body             -- the banner itself, verbatim, for free
--   3. events 'ai.disclosure.sent'  -- pseudonymous timeline, survives pruning
--   4. automation_runs.payload.disclosure -- the per-run trace (§0.5)
--
-- and a fifth thing that is not a record but a check: invariant 6
-- (src/invariants.js), which asserts on every run that a lead-facing outbound
-- sent before any disclosure was on record actually CONTAINED one. That is
-- what turns "we designed it to comply" into "we can show it complied, run by
-- run" — the difference between describing and proving.
--
-- WHY A COLUMN AND NOT A BODY MATCH
-- The same reason migration 0010 gives for messages.origin: a client
-- customising their disclosure wording must not silently turn the check off.
-- The column is written by the sending node at send time. The body match in
-- src/ai_disclosure.js disclosureIn() exists for a different job — asking
-- whether a given text discloses, which is the question the regulation asks —
-- and is not the runtime source of truth for "has this lead been told".
--
--   {"v": 1, "lang": "pt", "reason": "first_contact"}
--
--   v       the wording version, so "what did you disclose in November" has an
--           answer that does not depend on reading config history
--   lang    the language the banner was sent in
--   reason  first_contact -- Article 50 itself, the first interaction
--           handback      -- a human had been replying; the lead is handed back
--                            to the assistant and their belief about who is
--                            replying is now wrong
--           gap           -- more than config.disclosure_gap_days since the
--                            last outbound (default 30)
--           failsafe      -- disclosure state could not be read this run, so
--                            we disclosed rather than risk not disclosing

alter table public.messages
  add column if not exists disclosure jsonb;

comment on column public.messages.disclosure is
  'AI disclosure carried by this outbound message (EU AI Act Art. 50): {v, lang, reason}. NULL means the message carried no disclosure. Written by the sending node at send time; read by ReadDisclosureState to decide whether this lead has already been told.';

-- The read is "has this lead ever been disclosed to", once per run, ordered by
-- recency and limited to 1. A partial index over exactly the disclosed rows is
-- small (one row per lead in the normal case) and answers it directly.
--
-- Partial is safe HERE, unlike the 0003/0004 dedupe indexes: those were unique
-- indexes that PostgREST's upsert had to conflict against, and Postgres will
-- only match a partial unique index if the statement restates the predicate.
-- This one is an ordinary index serving a SELECT whose WHERE clause
-- (disclosure=not.is.null) restates the predicate by construction.
create index if not exists messages_lead_disclosed_idx
  on public.messages (lead_id, created_at desc)
  where disclosure is not null;

-- The standing audit query. It must return zero rows: every lead whose
-- earliest outbound message carried no disclosure. One line, and it is the
-- answer to "prove you disclose".
--
--   select l.id, l.phone, m.created_at, m.body
--     from public.leads l
--     join lateral (
--       select m.* from public.messages m
--        where m.lead_id = l.id and m.direction = 'outbound'
--        order by m.created_at asc limit 1) m on true
--    where m.disclosure is null;
--
-- No backfill. Rows predating this column carried no disclosure and must not
-- be marked as though they did — the gap is real and the query above is
-- supposed to show it for every lead contacted before the deploy. The test
-- lead is reset before the proof run; there are no production leads yet.
