-- The cases of 0047, SEEN. Paste the whole file. Each case rolls back.
--
-- 🔴 WRITTEN AFTER THE MIGRATION WAS APPLIED, because it was never written
-- before. `0047` went out with no proof registered at all, and nothing
-- noticed — see cockpit/tests/every-migration-has-a-proof.test.ts, which now
-- makes that impossible.
--
-- §1u applies: applying a migration destroys the preconditions its refusals
-- test. Here that is survivable, because 0047 is a GRANT change rather than a
-- shape change — a privilege can be revoked and re-granted inside a rolled-back
-- transaction, so its refusals remain reconstructible. Had it dropped a column,
-- this would not have been recoverable.
--
-- EXPECTED:
--   1  NOTICE  'No role holds DELETE or TRUNCATE on listing_matches.'
--   2  NOTICE  'service_role can still insert, select and update.'
--   3  ERROR   permission denied — a revoked role really cannot delete

-- ══ CASE 1 — delete and truncate are gone from every role ══════════════════
begin;
\echo '--- case 1: the belt'
\i db/migrations/0047_listing_matches_belt.sql

do $$
declare n bigint; who text;
begin
  select count(*), string_agg(grantee || '=' || privilege_type, ', ' order by grantee)
    into n, who
    from information_schema.table_privileges
   where table_schema='public' and table_name='listing_matches'
     and privilege_type in ('DELETE','TRUNCATE');
  if n > 0 then
    raise exception 'REFUSING: % delete/truncate privilege(s) survive: %.', n, who;
  end if;
  raise notice 'No role holds DELETE or TRUNCATE on listing_matches.';
end $$;
rollback;

-- ══ 🔴 CASE 2 — THE RESTING STATE. Retiring a match must still work ════════
-- A revoke one verb too wide takes UPDATE with it, and then superseded_at can
-- never be stamped — the table becomes append-only by accident, which is NOT
-- what 0025 designed. Case 1 passes either way.
begin;
\echo '--- case 2: the legitimate writes survive'
\i db/migrations/0047_listing_matches_belt.sql

do $$
declare missing text;
begin
  select string_agg(p, ', ') into missing from unnest(array['INSERT','SELECT','UPDATE']) p
   where not exists (
     select 1 from information_schema.table_privileges
      where table_schema='public' and table_name='listing_matches'
        and grantee='service_role' and privilege_type = p
   );
  if missing is not null then
    raise exception
      'REFUSING: service_role has lost %. Retiring a match sets superseded_at, so losing '
      'UPDATE makes the table append-only by accident — which is not what 0025 designed, '
      'and case 1 passes either way.', missing;
  end if;
  raise notice 'service_role can still insert, select and update.';
end $$;
rollback;

-- ══ CASE 3 — the revoke actually bites ═════════════════════════════════════
-- 🔒 A privilege listing is a claim about what SHOULD happen. This is the
-- attempt itself, which is the only thing that shows it does.
begin;
\echo '--- case 3: a revoked role really cannot delete'
\i db/migrations/0047_listing_matches_belt.sql
set local role service_role;
delete from public.listing_matches where false;
-- expect: ERROR  permission denied for table listing_matches
do $$
begin
  raise exception
    'CASE 3 DID NOT FIRE. The DELETE was permitted even with no DELETE privilege, which '
    'means the session is not running as service_role — the case is UN-RUN rather than '
    'passed. DO NOT BLESS.';
end $$;
rollback;
