-- ====== listing_matches: the belt that was never written ======
--
-- ALONE, in a transaction, with 0032's treatment.
--
-- ---------------------------------------------------------------------------
-- 🔴 A GAP NO AUDIT COULD HAVE SURFACED
-- ---------------------------------------------------------------------------
-- `0025` gives `listing_matches` a freeze: a notified match is frozen, because
-- changing a record somebody has already acted on is the failure it exists to
-- prevent.
--
-- It has a trigger. It has NO REVOKE.
--
-- So the belt was never written rather than never applied — and that is
-- invisible to `db/tools/audit_revoke_claims.sql`, which compares every revoke
-- a migration CLAIMS against the database. **There is no claim to compare.**
--
-- 🔒 The shape is worth naming because it generalises: an audit of claims can
-- only ever find claims that are false. It cannot find a claim that was never
-- made, and the missing ones are exactly the tables nobody thought about.
--
-- ---------------------------------------------------------------------------
-- WHY listing_matches NEEDS ONE
-- ---------------------------------------------------------------------------
-- A match is what the system told a buyer about. Deleting one removes the
-- record that a person was contacted about a property; truncating removes
-- every such record at once, and the freeze trigger fires per ROW — so a
-- TRUNCATE would not trip it at all unless a statement-level trigger exists.
--
-- 🔴 That is the same hole `0012` names: *"TRUNCATE does not fire a row-level
-- trigger, and would empty the ledger without tripping either guard."*
--
-- ---------------------------------------------------------------------------
-- WHAT STAYS WRITABLE, AND WHY
-- ---------------------------------------------------------------------------
-- `superseded_at` is how a match is retired — `0025` reads
-- `where superseded_at is null`, so the table is NOT append-only and UPDATE is
-- legitimate. The trigger discriminates: it refuses changes to a NOTIFIED
-- match. The grant must not do that job, or retiring a match becomes
-- impossible.

begin;

do $$
declare n bigint;
begin
  select count(*) into n from information_schema.tables
   where table_schema = 'public' and table_name = 'listing_matches';
  if n = 0 then
    raise exception 'REFUSING: public.listing_matches does not exist. 0025 comes first.';
  end if;

  select count(*) into n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal and c.relname = 'listing_matches';
  if n = 0 then
    raise exception
      'REFUSING: listing_matches has NO trigger. This migration adds the belt to a freeze '
      'that is meant to exist — if the trigger is gone, the guarantee is gone and a grant '
      'change would hide that rather than fix it.';
  end if;

  raise notice 'Preconditions proven, not assumed: table present, % trigger(s) present.', n;
end $$;

-- Nobody deletes or truncates a record of what a buyer was told.
revoke delete, truncate on public.listing_matches from public, anon, authenticated, service_role;

-- 🔒 UPDATE stays with service_role: retiring a match sets superseded_at, and
-- the trigger is what refuses a change to a NOTIFIED one. A grant cannot make
-- that distinction, so it must not try.
grant select, insert, update on public.listing_matches to service_role;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select grantee, string_agg(privilege_type, ', ' order by privilege_type)
--     from information_schema.table_privileges
--    where table_schema='public' and table_name='listing_matches'
--      and grantee in ('anon','authenticated','service_role')
--    group by grantee order by grantee;
--   -- expect: service_role INSERT, REFERENCES, SELECT, TRIGGER, UPDATE
--   --         anon / authenticated: no DELETE and no TRUNCATE
--
-- 🔴 AND THE THING TO CHECK AFTERWARDS, WHICH IS NOT A GRANT: whether the
-- freeze has a TRUNCATE trigger as well as a row trigger. 0012 has both and
-- says why. If 0025 has only the row trigger, the revoke above is now the ONLY
-- thing preventing a truncate — belt with no guarantee, which is the mirror of
-- what 0042 had.
