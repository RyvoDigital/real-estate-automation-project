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
