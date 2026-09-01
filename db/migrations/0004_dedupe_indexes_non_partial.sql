-- ============ Make the 0003 dedupe indexes usable by PostgREST ============
-- Phase 1, Checkpoint A. Fixes a defect in 0003, found during the functional
-- verification of that migration rather than by reading the DDL.
--
-- WHAT WENT WRONG
--
-- 0003 created both dedupe indexes as PARTIAL indexes:
--
--     create unique index ... on public.leads (client_id, phone)
--       where phone is not null;
--
-- Upserting through PostgREST (`?on_conflict=client_id,phone` with
-- `Prefer: resolution=merge-duplicates`) then fails with:
--
--     42P10  there is no unique or exclusion constraint matching the
--            ON CONFLICT specification
--
-- because PostgREST emits `ON CONFLICT (client_id, phone) DO UPDATE ...` with
-- no WHERE clause, and Postgres will only match a partial unique index if the
-- statement restates the index predicate. n8n calls PostgREST, so it cannot
-- restate it. The 0003 test suite passed only because the check was written in
-- raw SQL, where the predicate could be supplied by hand -- a good reminder
-- that a test has to exercise the path the caller actually takes.
--
-- WHY NON-PARTIAL IS CORRECT, NOT A COMPROMISE
--
-- The partial predicate was protecting against a problem that does not exist.
-- In a standard unique index Postgres treats NULLs as DISTINCT, so
-- `unique (client_id, phone)` already permits unlimited rows with a NULL phone
-- for the same client. The Phase 1b behaviour 0003 documented is unchanged:
-- Instagram and email leads carry no phone, do not collide with each other, and
-- still create their own rows. Cross-channel identity resolution remains a
-- Phase 1b matching problem, not a constraint problem.
--
-- The partial version was therefore strictly worse: identical uniqueness
-- semantics, marginally smaller index, and it broke the one operation the index
-- existed to enable.
--
-- (If NULLs ever need to collide, that is `nulls not distinct` -- a deliberate
-- opt-in, and not what we want here.)
--
-- Applied via the session-pooler procedure inside --single-transaction. Plain
-- DROP/CREATE rather than CONCURRENTLY: the tables hold no production rows yet,
-- and CONCURRENTLY cannot run inside a transaction block.

-- ---------------------------------------------------------------------------
-- leads: the index the upsert actually depends on
-- ---------------------------------------------------------------------------
drop index if exists public.leads_client_phone_uniq;

create unique index if not exists leads_client_phone_uniq
  on public.leads (client_id, phone);

-- ---------------------------------------------------------------------------
-- messages: same treatment, for consistency and future-proofing
-- ---------------------------------------------------------------------------
-- The inbound path only needs plain INSERT + catch-23505, which worked fine
-- against the partial index (verified: PostgREST returned 409). But leaving one
-- index partial and one not is a trap for whoever later tries to upsert a
-- message -- an outbound row acquiring its provider id after a successful send
-- is exactly that shape. Same NULL-distinct reasoning applies: outbound
-- messages awaiting a Twilio SID keep a NULL external_id and never collide.

drop index if exists public.messages_client_external_id_uniq;

create unique index if not exists messages_client_external_id_uniq
  on public.messages (client_id, external_id);
