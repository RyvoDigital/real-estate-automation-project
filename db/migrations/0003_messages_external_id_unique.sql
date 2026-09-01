-- ============ Dedupe integrity for inbound webhooks ============
-- Phase 1, Checkpoint A.
--
-- Workflow-level dedupe ("does this message id already exist?") is not
-- sufficient on its own. Twilio retries webhook deliveries, and two retries can
-- both pass the existence check before either has committed its insert. The
-- result is a duplicate message row and, once Checkpoint B lands, a duplicate
-- AI reply to the lead.
--
-- The fix is to let the database arbitrate. The workflow attempts the insert and
-- treats a unique-violation (SQLSTATE 23505 / PostgREST 409) as "already
-- processed, stop here" rather than as an error.
--
-- Applied with the documented session-pooler procedure, which connects as
-- `postgres`. Both statements below are plain CREATE INDEX (not CONCURRENTLY)
-- so the whole migration runs inside --single-transaction; the tables are empty
-- today, so there is no locking concern.

-- ---------------------------------------------------------------------------
-- 1. messages: one row per (client, external message id)
-- ---------------------------------------------------------------------------
-- external_id holds Twilio's MessageSid now, Meta's message id after the
-- migration back to the Cloud API. It is scoped by client_id rather than being
-- globally unique: message ids are only guaranteed unique within the provider
-- account, and scoping by client keeps the constraint correct once more than
-- one client exists.
--
-- Partial (external_id is not null) so that outbound messages, which have no
-- provider id until the send succeeds, are not forced into the constraint and
-- do not collide with each other on NULL.

create unique index if not exists messages_client_external_id_uniq
  on public.messages (client_id, external_id)
  where external_id is not null;

-- ---------------------------------------------------------------------------
-- 2. leads: one lead per (client, phone)
-- ---------------------------------------------------------------------------
-- NOT in the literal Checkpoint A spec -- added deliberately. See the note in
-- the checkpoint report; strike this section if the operator disagrees.
--
-- Rationale: the handoff specifies "upsert key: client_id + phone" for leads,
-- and Checkpoint A's definition of done requires that a second message from the
-- same number updates the existing lead rather than creating a duplicate. The
-- base schema has no unique constraint backing that key, which means:
--
--   a) A real upsert is impossible. PostgREST's merge-duplicates resolution and
--      SQL's ON CONFLICT both require a unique index to conflict against, so
--      without this the workflow can only do select-then-insert-or-update.
--   b) Select-then-insert has exactly the race this migration exists to close.
--      Two messages from a new number arriving together both find no lead and
--      both insert. The lead is then split in two and the conversation history
--      the Claude call depends on in Checkpoint B is split with it.
--
-- Partial (phone is not null) because leads from other sources -- Instagram and
-- email entry points in Phase 1b -- legitimately have no phone, and NULLs would
-- otherwise not collide anyway. Making the predicate explicit documents the
-- intent rather than relying on NULL semantics.
--
-- Consequence, and it is intended: the same human arriving later by email or
-- Instagram has no phone, so this index does not match them and they get a
-- SECOND leads row. That is correct behaviour for now -- two contact records
-- for one person is a resolvable data problem, whereas silently merging two
-- different people because both lacked a phone is not.
--
-- Do NOT try to fix that here by widening the key. Cross-channel identity
-- resolution (same person across WhatsApp / Instagram / email) is a Phase 1b
-- design question about matching and merging, not a uniqueness constraint.

create unique index if not exists leads_client_phone_uniq
  on public.leads (client_id, phone)
  where phone is not null;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- 0002 set ALTER DEFAULT PRIVILEGES so objects created later by `postgres`
-- inherit service_role's DML grants, and indexes carry no privileges of their
-- own, so nothing needs granting here. This is asserted rather than assumed:
-- verify functionally after applying (see the checkpoint report), because this
-- project has already been bitten once by grants that looked correct and were
-- not.
