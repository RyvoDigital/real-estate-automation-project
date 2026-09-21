-- The cases of 0012, SEEN. Paste the whole file into the SQL editor.
--
-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  🔴 THE MOST LOAD-BEARING TABLE IN THE SYSTEM, AND THE LAST TO BE PROVED. ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- `consent_events` is the record of who may lawfully be messaged. Every other
-- freeze in this database was built on the argument 0012 made — and 0012 has
-- never been registered in the proof book, because the book opens at 0013.
--
-- Its own footer says why this file has to exist, in words written before any
-- of tonight's findings: *"prove the trigger fires, because a guard that has
-- never been seen to fire has not been shown to work."*
--
-- 🔴 AND THE TABLE IS NOT EMPTY. Unlike every migration proved tonight, this
-- one is live and carries real consent history. So EVERY case below runs
-- inside a transaction and rolls back, and NONE of them deletes, truncates or
-- alters anything that exists. Cases 1–3 attempt writes that must be REFUSED,
-- which by definition change nothing.
--
-- 🔒 AND NOTHING HERE APPLIES 0012. It is already applied. These cases test the
-- deployed table directly — which is the only version that matters, and the
-- thing §1u could not do for a migration that changed shape.
--
-- EXPECTED, in order:
--   1  NOTICE  'Privileges: INSERT t, UPDATE f, DELETE f.'
--   2  ERROR   consent_events is append-only: UPDATE refused
--   3  ERROR   consent_events is append-only: DELETE refused
--   4  ERROR   consent_events_kind_known
--   5  ERROR   consent_events_consent_is_dated
--   6  ERROR   consent_events_phone_e164
--   7  NOTICE  'The resting state holds: a legitimate event inserts.'
--      NOTICE  'Revert verified: no fixture rows remain in the ledger.'
--
--   🔴 8  is SEPARATE and runs LAST, with its own read-only query first. See
--         the block at the foot of this file — it takes ACCESS EXCLUSIVE on
--         the ledger, so it is not run casually alongside the others.
--      NOTICE  'Dropping <fk> for the duration of this transaction.'
--      ERROR   consent_events cannot be truncated …
--      NOTICE  'Revert verified: the foreign key is back, and the ledger holds N row(s).'

-- ══ CASE 1 — the grants 0012 claims ════════════════════════════════════════
-- 🔒 The belt. Tonight found a revoke that had never applied on another table,
-- so this asks the database rather than reading the migration.
do $$
declare ins boolean; upd boolean; del boolean; trunc boolean;
begin
  ins   := has_table_privilege('service_role', 'public.consent_events', 'INSERT');
  upd   := has_table_privilege('service_role', 'public.consent_events', 'UPDATE');
  del   := has_table_privilege('service_role', 'public.consent_events', 'DELETE');
  trunc := has_table_privilege('service_role', 'public.consent_events', 'TRUNCATE');

  if not ins then
    raise exception 'REFUSING: service_role cannot INSERT. The ledger cannot be written to at all.';
  end if;
  if upd or del or trunc then
    raise exception
      'REFUSING: service_role holds UPDATE=%, DELETE=%, TRUNCATE=% on the consent ledger. '
      '0012''s revoke is not in force, and append-only rests on the trigger alone.',
      upd, del, trunc;
  end if;
  raise notice 'Privileges: INSERT t, UPDATE f, DELETE f, TRUNCATE f.';
end $$;

-- ══ CASE 2 — the trigger refuses an UPDATE ═════════════════════════════════
-- 🔴 Run as a role that COULD update if the trigger were absent, so this tests
-- the guarantee rather than re-testing the belt. postgres owns the table.
begin;
\echo '--- case 2: UPDATE refused by the trigger'
insert into public.consent_events (client_id, phone_e164, kind, source)
select id, '+351900000001', 'claimed', 'system' from public.clients limit 1;

update public.consent_events set note = 'x' where phone_e164 = '+351900000001';
do $$ begin
  raise exception 'CASE 2 DID NOT FIRE. The ledger was UPDATED. Every consent record in '
    'this database can be rewritten. DO NOT BLESS.';
end $$;
rollback;

-- ══ CASE 3 — the trigger refuses a DELETE ══════════════════════════════════
begin;
\echo '--- case 3: DELETE refused by the trigger'
insert into public.consent_events (client_id, phone_e164, kind, source)
select id, '+351900000001', 'claimed', 'system' from public.clients limit 1;

delete from public.consent_events where phone_e164 = '+351900000001';
do $$ begin
  raise exception 'CASE 3 DID NOT FIRE. A consent record was DELETED. An objection could '
    'be removed and nothing would record that it had been. DO NOT BLESS.';
end $$;
rollback;

-- ══ CASE 4 — an unknown kind ═══════════════════════════════════════════════
-- The eight kinds are the vocabulary the gate reads. A ninth would be written,
-- stored, and silently ignored by every consumer.
begin;
\echo '--- case 4: an invented kind'
insert into public.consent_events (client_id, phone_e164, kind, source)
select id, '+351900000001', 'probably_fine', 'system' from public.clients limit 1;
do $$ begin raise exception 'CASE 4 DID NOT FIRE. An unknown kind was accepted. DO NOT BLESS.'; end $$;
rollback;

-- ══ CASE 5 — consent with no date ══════════════════════════════════════════
-- 🔴 The one constraint that is purely legal. Consent without a moment cannot
-- be evidenced, and the column comment says NULL means genuinely unknown —
-- so a consent_given with no occurred_at is a claim with nothing behind it.
begin;
\echo '--- case 5: undated consent'
insert into public.consent_events (client_id, phone_e164, kind, source)
select id, '+351900000001', 'consent_given', 'web_form' from public.clients limit 1;
do $$ begin raise exception 'CASE 5 DID NOT FIRE. Undated consent was accepted. DO NOT BLESS.'; end $$;
rollback;

-- ══ CASE 6 — a number that is not E.164 ════════════════════════════════════
-- The ledger is keyed on (client_id, phone_e164). A number stored in another
-- shape is a record nobody can find, and an objection nobody can find is an
-- objection that does not protect anybody.
begin;
\echo '--- case 6: a malformed number'
insert into public.consent_events (client_id, phone_e164, kind, source)
select id, '912345678', 'objection', 'operator' from public.clients limit 1;
do $$ begin raise exception 'CASE 6 DID NOT FIRE. A non-E.164 number was accepted. DO NOT BLESS.'; end $$;
rollback;

-- ══ 🔴 CASE 7 — THE RESTING STATE. A legitimate event MUST insert ══════════
-- Six refusals pass just as well on a table that accepts nothing at all. This
-- is the only case that distinguishes a working ledger from a sealed one.
begin;
\echo '--- case 7: the resting state'
insert into public.consent_events (client_id, phone_e164, kind, source, occurred_at, wording)
select id, '+351900000001', 'consent_given', 'web_form', now(), 'PROOF FIXTURE — rolled back'
  from public.clients limit 1;

do $$
declare n bigint;
begin
  select count(*) into n from public.consent_events where phone_e164 = '+351900000001';
  if n <> 1 then
    raise exception
      'REFUSING: a legitimate consent event did not insert (found % rows). The ledger '
      'refuses everything, and all six cases above pass on a table nothing can write to.', n;
  end if;
  raise notice 'The resting state holds: a legitimate event inserts.';
end $$;
rollback;

-- ── and prove the rollback, because this one wrote to a LIVE table ─────────
-- §1t: assert the sabotage applied AND assert the revert applied. Every case
-- above rolled back, but this file is the first to touch a table with real
-- consent history in it, so the absence is verified rather than assumed.
do $$
declare n bigint;
begin
  select count(*) into n from public.consent_events where phone_e164 = '+351900000001';
  if n <> 0 then
    raise exception
      'REVERT FAILED: % fixture row(s) survive in the consent ledger. They are append-only '
      'and CANNOT BE DELETED — this needs a person, not another statement.', n;
  end if;
  raise notice 'Revert verified: no fixture rows remain in the ledger.';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 CASE 8 — THE TRUNCATE TRIGGER, added 21 September 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY IT WAS MISSING: this file's cases 1-7 test the row trigger, the grants
-- and the constraints. The STATEMENT trigger — `consent_events_no_truncate` —
-- was never exercised, and 0012 created it for a reason it states plainly:
-- *"TRUNCATE does not fire a row-level trigger, and would empty the ledger
-- without tripping either guard."*
--
-- 🔴 AND WHAT A NAIVE ATTEMPT FINDS INSTEAD:
--
--   ERROR 0A000: cannot truncate a table referenced in a foreign key constraint
--   DETAIL: Table "sends" references "consent_events".
--
-- That refusal comes from the ENGINE, before any trigger runs. So today the
-- ledger is protected from truncation by a FOREIGN KEY FROM `sends` —
-- incidentally, as a side effect of a relationship that exists for another
-- reason entirely. If `sends` were ever dropped, that protection would go with
-- it, and nobody would notice, because the guard meant to be doing the job has
-- never been seen to do it.
--
-- 🔒 SAME SHAPE AS 0044's GUARD 1 SHADOWING GUARD 2, arriving from the engine
-- rather than from a migration: a cheap refusal standing in front of the one
-- you meant to test, giving a red result that looks like the right one.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHY NOT `TRUNCATE ... CASCADE`
-- ───────────────────────────────────────────────────────────────────────────
-- It would work. TRUNCATE is fully transactional in PostgreSQL and rolls back,
-- and the EXPECTED outcome is an exception — the trigger fires, the statement
-- aborts, nothing is truncated.
--
-- But CASCADE decides what happens in the FAILURE case, which is the case
-- being tested. If the trigger does NOT fire, CASCADE empties `consent_events`
-- AND `sends` and anything else referencing them. Rollback restores it, and
-- relying on that is a bet on the rollback rather than a small blast radius.
--
-- Dropping the constraint inside the transaction reaches the same trigger with
-- only ONE table at risk. Both hold ACCESS EXCLUSIVE briefly, so run it at a
-- quiet moment: an ACCESS EXCLUSIVE lock blocks the Concierge's inbound path.

-- ── first, READ-ONLY: what would CASCADE have reached? ─────────────────────
-- 🔒 Run this before the case below. A blast radius nobody enumerated is not a
-- small one; it is an unmeasured one.
select conrelid::regclass::text as referencing_table, conname
  from pg_constraint
 where confrelid = 'public.consent_events'::regclass and contype = 'f'
 order by 1;
-- expect: sends (and whatever else appears — if it is more than you expected,
-- stop and read it rather than proceeding).

begin;
\echo '--- case 8: the statement-level truncate trigger'

-- Short leashes. If anything blocks, fail fast rather than holding an
-- ACCESS EXCLUSIVE lock on the ledger while somebody investigates.
set local lock_timeout = '3s';
set local statement_timeout = '10s';

-- Remove ONLY the reference that shadows the trigger. `sends` itself is not
-- truncated, not modified, and gets its constraint back on rollback.
--
-- 🔒 THE NAME IS DERIVED, NOT TYPED. 0015 declares the column as
-- `consent_event_id uuid references public.consent_events(id)` with no
-- constraint name, so PostgreSQL auto-generated one. Hardcoding a guess at it
-- would make this case fail with 'constraint does not exist' — which is a red
-- result for the wrong reason, and the entire point of case 8 is that a
-- refusal from the wrong source looks exactly like the one you wanted (§1u).
do $$
declare fk_name text;
begin
  select conname into fk_name
    from pg_constraint
   where conrelid = 'public.sends'::regclass
     and confrelid = 'public.consent_events'::regclass
     and contype = 'f';

  if fk_name is null then
    raise exception
      'REFUSING: sends no longer references consent_events. That reference is currently '
      'the ONLY thing preventing a truncate, so its absence is a finding in itself — and '
      'it means the ledger is already unprotected rather than that this case is unneeded.';
  end if;

  raise notice 'Dropping % for the duration of this transaction.', fk_name;
  execute format('alter table public.sends drop constraint %I', fk_name);
end $$;

truncate public.consent_events;

-- 🔴 THE SENTINEL. Reached only if the truncate SUCCEEDED, which means the
-- ledger's statement trigger is absent or not firing — and that the only thing
-- standing between this table and an empty one was a foreign key belonging to
-- another feature.
do $$
begin
  raise exception
    'CASE 8 DID NOT FIRE. consent_events WAS TRUNCATED. The statement trigger is not '
    'protecting the ledger, and the foreign key from sends was the only thing that ever '
    'was. DO NOT BLESS — and note that this transaction is about to roll the ledger back, '
    'so verify the count below before doing anything else.';
end $$;

rollback;

-- ── and prove the rollback, on the most important table in the database ────
-- §1t. If the truncate DID go through and the rollback failed, this is where
-- it is discovered — and the rows are append-only, so they cannot be restored
-- by any statement. That is a restore-from-backup conversation, not a fix.
do $$
declare n bigint; fk bigint;
begin
  select count(*) into n from public.consent_events;
  select count(*) into fk from pg_constraint
   where conrelid = 'public.sends'::regclass
     and confrelid = 'public.consent_events'::regclass
     and contype = 'f';

  if fk <> 1 then
    raise exception
      'REVERT FAILED: sends no longer references consent_events. The constraint drop was '
      'not rolled back, and the ledger has lost the incidental protection it had. Restore '
      'it before anything else.';
  end if;
  raise notice 'Revert verified: the foreign key is back, and the ledger holds % row(s).', n;
end $$;
