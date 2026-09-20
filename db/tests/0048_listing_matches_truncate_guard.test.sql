-- The cases of 0048, SEEN. Paste the whole file. Each case rolls back.
--
-- 🔴 CASE 4 IS THE ONE NOT TO SKIP: an UNNOTIFIED match must still be
-- deletable. A guard written one condition too wide makes the table
-- undeletable and turns ordinary cleanup into a migration — and all three
-- refusal cases still pass.
--
-- EXPECTED:
--   1  ERROR   listing_matches cannot be truncated …
--   2  ERROR   this match was sent to an agent at … so it cannot be deleted
--   3  ERROR   the existing update freeze still refuses (unchanged by this file)
--   4  NOTICE  'An unnotified match is still deletable.'

-- ══ CASE 1 — truncate ══════════════════════════════════════════════════════
begin;
\echo '--- case 1: truncate refused'
\i db/migrations/0048_listing_matches_truncate_guard.sql
truncate public.listing_matches;
do $$ begin raise exception 'CASE 1 DID NOT FIRE. The table was TRUNCATED. DO NOT BLESS.'; end $$;
rollback;

-- ══ CASE 2 — deleting a notified match ═════════════════════════════════════
begin;
\echo '--- case 2: a notified match cannot be deleted'
\i db/migrations/0048_listing_matches_truncate_guard.sql
-- A notified match. Columns beyond these are 0025's; adjust only if it refuses
-- for a NOT NULL reason, which would mean the fixture is wrong, not the guard.
insert into public.listing_matches (id, agent_notified_at)
values ('00000000-0000-0000-0000-000000020101', now());
delete from public.listing_matches where id = '00000000-0000-0000-0000-000000020101';
do $$ begin raise exception 'CASE 2 DID NOT FIRE. A notified match was deleted. DO NOT BLESS.'; end $$;
rollback;

-- ══ CASE 3 — the existing freeze is untouched ══════════════════════════════
-- 🔒 This file adds guards BESIDE the freeze. If adding them displaced it, the
-- update path would now be unguarded and cases 1 and 2 would still pass.
begin;
\echo '--- case 3: the update freeze still refuses'
\i db/migrations/0048_listing_matches_truncate_guard.sql
insert into public.listing_matches (id, agent_notified_at, score)
values ('00000000-0000-0000-0000-000000020101', now(), 0.9);
update public.listing_matches set score = 0.1
 where id = '00000000-0000-0000-0000-000000020101';
do $$ begin raise exception 'CASE 3 DID NOT FIRE. The update freeze is gone. DO NOT BLESS.'; end $$;
rollback;

-- ══ 🔴 CASE 4 — THE RESTING STATE. Unnotified must stay deletable ══════════
begin;
\echo '--- case 4: an unnotified match is working material'
\i db/migrations/0048_listing_matches_truncate_guard.sql
insert into public.listing_matches (id) values ('00000000-0000-0000-0000-000000020102');
delete from public.listing_matches where id = '00000000-0000-0000-0000-000000020102';

do $$
declare n bigint;
begin
  select count(*) into n from public.listing_matches
   where id = '00000000-0000-0000-0000-000000020102';
  if n <> 0 then
    raise exception
      'REFUSING: the unnotified match survived the delete. The guard is one condition too '
      'wide — the table is now undeletable and ordinary cleanup has become a migration, '
      'while every refusal case above still passes.';
  end if;
  raise notice 'An unnotified match is still deletable.';
end $$;
rollback;
