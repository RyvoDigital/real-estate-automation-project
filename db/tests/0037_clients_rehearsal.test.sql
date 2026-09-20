-- The three cases of 0037, SEEN. Paste the whole file into the SQL editor.
--
-- It rolls itself back. Nothing here survives, and the column is NOT added by
-- this file — it adds it, tests the refusals, and rolls the lot away. Applying
-- 0037 is a separate, deliberate act afterwards.
--
-- 🔴 WHAT IS BEING PROVED, AND WHY CASE 3 IS THE ONE NOT TO SKIP.
--
-- Cases 1 and 2 prove the migration REFUSES when it should. Case 3 proves it
-- does NOT refuse when it should not — and that is the case that catches the
-- mistake actually made here. A guard of the form "refuse unless at least one
-- rehearsal row was matched" was written, then removed: it passes both
-- sabotage cases and fails only the quiet one, because after go-live, with the
-- test clients deleted and only real agencies left, it would refuse forever.
-- 0036 found the same shape. A check that fires on a legitimate state is a
-- check that gets deleted in a hurry six months from now.
--
-- EXPECTED, in order:
--   case 1   ERROR  REFUSING: 1 client row(s) are not classified … naming
--                   "PROOF FIXTURE — unclassified"
--   case 2   ERROR  REFUSING: 1 client row(s) are not classified … naming
--                   "Ryvo Test Client"
--   case 3   NOTICE Classified, not assumed: 2 rehearsal, 0 real, 0 undeclared.
--                   and NO error
--
-- If case 1 or 2 raises something OTHER than that refusal, or names a
-- different row, stop: the matchers do not match what you think they match.
-- If case 3 raises at all, do not apply the migration.

-- ═══════════════════════════════════════════════════════════════════════════
-- CASE 1 — a row nobody accounted for must be refused BY NAME
-- ═══════════════════════════════════════════════════════════════════════════
begin;

alter table public.clients add column if not exists rehearsal boolean;

insert into public.clients (id, name)
values ('00000000-0000-0000-0000-0000000c1e37', 'PROOF FIXTURE — unclassified');

update public.clients
   set rehearsal = true
 where id = '20e5c7ec-eaa6-4f5d-bf38-49e9ab24fc12'
    or whatsapp_number = '+14155238886';

do $$
declare
  n_rehearsal bigint; n_real bigint; n_unclassed bigint; unclassed text;
begin
  select count(*) filter (where rehearsal is true),
         count(*) filter (where rehearsal is false),
         count(*) filter (where rehearsal is null)
    into n_rehearsal, n_real, n_unclassed from public.clients;

  if n_unclassed > 0 then
    select string_agg(format('%s "%s" (created %s)', id, name, created_at::date), '; ' order by created_at)
      into unclassed from public.clients where rehearsal is null;
    raise exception 'REFUSING: % client row(s) are not classified as rehearsal or real: %.',
      n_unclassed, unclassed;
  end if;

  raise notice 'Classified, not assumed: % rehearsal, % real, 0 undeclared.', n_rehearsal, n_real;
end $$;

rollback;

-- ═══════════════════════════════════════════════════════════════════════════
-- CASE 2 — a WRONG MATCHER must surface as a refusal naming the row it missed,
--          never as a notice quietly counting one rehearsal client fewer
-- ═══════════════════════════════════════════════════════════════════════════
begin;

alter table public.clients add column if not exists rehearsal boolean;

-- Move the sandbox number out from under the matcher. This is what a typo in
-- the matcher, or Twilio changing the number, would look like.
update public.clients set whatsapp_number = '+10000000000'
 where whatsapp_number = '+14155238886';

update public.clients
   set rehearsal = true
 where id = '20e5c7ec-eaa6-4f5d-bf38-49e9ab24fc12'
    or whatsapp_number = '+14155238886';

do $$
declare
  n_rehearsal bigint; n_real bigint; n_unclassed bigint; unclassed text;
begin
  select count(*) filter (where rehearsal is true),
         count(*) filter (where rehearsal is false),
         count(*) filter (where rehearsal is null)
    into n_rehearsal, n_real, n_unclassed from public.clients;

  if n_unclassed > 0 then
    select string_agg(format('%s "%s" (created %s)', id, name, created_at::date), '; ' order by created_at)
      into unclassed from public.clients where rehearsal is null;
    raise exception 'REFUSING: % client row(s) are not classified as rehearsal or real: %.',
      n_unclassed, unclassed;
  end if;

  raise notice 'Classified, not assumed: % rehearsal, % real, 0 undeclared.', n_rehearsal, n_real;
end $$;

rollback;

-- ═══════════════════════════════════════════════════════════════════════════
-- CASE 3 — 🔴 THE RESTING STATE MUST NOT BE REFUSED. Do not skip this.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

alter table public.clients add column if not exists rehearsal boolean;

update public.clients
   set rehearsal = true
 where id = '20e5c7ec-eaa6-4f5d-bf38-49e9ab24fc12'
    or whatsapp_number = '+14155238886';

do $$
declare
  n_rehearsal bigint; n_real bigint; n_unclassed bigint; unclassed text;
begin
  select count(*) filter (where rehearsal is true),
         count(*) filter (where rehearsal is false),
         count(*) filter (where rehearsal is null)
    into n_rehearsal, n_real, n_unclassed from public.clients;

  if n_unclassed > 0 then
    select string_agg(format('%s "%s" (created %s)', id, name, created_at::date), '; ' order by created_at)
      into unclassed from public.clients where rehearsal is null;
    raise exception 'REFUSING: % client row(s) are not classified as rehearsal or real: %.',
      n_unclassed, unclassed;
  end if;

  raise notice 'Classified, not assumed: % rehearsal, % real, 0 undeclared.', n_rehearsal, n_real;
end $$;

-- What the two rows look like, before it all rolls back.
select id, name, whatsapp_number, rehearsal from public.clients order by created_at;

rollback;

-- ═══════════════════════════════════════════════════════════════════════════
-- AFTER ALL THREE BEHAVE
-- ═══════════════════════════════════════════════════════════════════════════
--   npm run proof:bless 0037-clients-rehearsal
--
-- Then apply db/migrations/0037_clients_rehearsal.sql (it carries its own
-- begin/commit), and verify:
--
--   select id, name, whatsapp_number, rehearsal from public.clients order by created_at;
--   -- expect: every row true or false, none null. Today: two rehearsal rows,
--   --         both true, and no real client — which is the truth
--
--   select column_default, is_nullable from information_schema.columns
--    where table_name = 'clients' and column_name = 'rehearsal';
--   -- expect: column_default NULL (no default — the whole point),
--   --         is_nullable YES (until 0038)
--
-- 🔴 THEN THE DEPLOY, BEFORE 0038. Onboard a client in the running cockpit and
-- see its row come back with rehearsal true or false — not null. 0038 before
-- that breaks client creation for the operator mid-onboarding.
