-- ============ clients.rehearsal — step 1 of 2: add, classify, refuse ============
--
-- ALONE, and in a transaction, with 0032's treatment: it proves its
-- precondition before it acts, it names what it found when it refuses, and
-- applying it is a deliberate act rather than a line in a batch.
--
-- ---------------------------------------------------------------------------
-- WHY THE COLUMN EXISTS
-- ---------------------------------------------------------------------------
-- The cockpit's landing is the Overview (cockpit-design-brief.md D2′, §2.10):
-- revenue, what the system did, and a register of FIRSTS — first client, first
-- lead handled, first contract. Every client row in the database today is a
-- rehearsal:
--
--   ZZ TEST — Cascais Demo   20e5c7ec-eaa6-4f5d-bf38-49e9ab24fc12
--                            (docs/send-record-design.md)
--   Ryvo Test Client         matched by whatsapp_number '+14155238886', the
--                            Twilio sandbox number (docs/concierge-runbook.md,
--                            which matches it the same way)
--
-- With nothing to tell them apart, "first client onboarded" would print the day
-- a test fixture was created, and "leads handled" would count rehearsal
-- conversations as the business's history. That is a fact about our own state
-- presented as a fact about the world (§5j), on the page read every morning.
-- A caption saying "may include rehearsal data" would be a caption explaining a
-- wrong number, which is worse than a right number. So: a marker, and the
-- Overview reads it.
--
-- ---------------------------------------------------------------------------
-- 🔴 WHY THERE IS NO DEFAULT — AND WHY THIS IS TWO MIGRATIONS
-- ---------------------------------------------------------------------------
-- `default false` would be a FALLBACK ASSERTING SOMETHING (lesson 13): every
-- row nobody classified would read as "a real client". That is precisely the
-- defect this column exists to remove, reintroduced as a default. `default
-- true` fails the other way, and quieter: a real client nobody declared
-- would drop out of the business's numbers.
--
-- So the column has no default, and a client row must SAY which it is. But NOT
-- NULL with no default breaks every insert that does not name the column —
-- the onboarding insert in cockpit/src/lib/actions.ts, and the proof fixtures
-- in db/tests/*.test.sql. And the code cannot name the column before it
-- exists, because PostgREST rejects an insert naming an unknown column.
--
-- 0036's sequencing lesson says that the code deploy is a PRECONDITION of the
-- schema change, not a companion to it. Here each needs the other, so the
-- change is split:
--
--   0037 (this)   add the column NULLABLE, classify every existing row, and
--                 refuse if any row is left unclassified
--   deploy        onboarding asks the question — a required choice with
--                 nothing pre-selected (§4.6: a pre-filled field collects a
--                 click, not a decision) — and writes the answer. The fixtures
--                 declare themselves rehearsal
--   0038          prove no row is null, THEN set NOT NULL. It refuses while
--                 any row, including one created between the two, is null
--
-- Between 0037 and 0038 a client created through the old onboarding gets NULL.
-- That is honest — nobody declared it — and 0038 refuses by name until
-- somebody does. The Overview treats null as not-yet-declared (S3), never as
-- either answer.
--
-- ---------------------------------------------------------------------------
-- THE CLASSIFICATION IS EXPLICIT, AND ONLY FOR ROWS WE CAN NAME
-- ---------------------------------------------------------------------------
-- Two matchers, both for rows the repository documents as rehearsal. There is
-- NO rule of the form "anything else is real". No real client has been signed,
-- so an unmatched row is a row nobody has accounted for, and the migration
-- refuses and lists it rather than guessing. To classify one, add a line
-- here — `update public.clients set rehearsal = false where id = '…';` for a
-- real agency — and run it again. It rolls back whole on refusal, so running
-- it again is safe.

begin;

alter table public.clients
  add column if not exists rehearsal boolean;

comment on column public.clients.rehearsal is
  'True for a rehearsal, demo or test client; false for a real agency. No default, '
  'on purpose: a default would assert an answer nobody gave (lesson 13). NULL means '
  'not yet declared and is refused by 0038. The Overview (cockpit-design-brief §2.10) '
  'counts only rehearsal = false; a null is shown as undeclared, never as either answer.';

update public.clients
   set rehearsal = true
 where id = '20e5c7ec-eaa6-4f5d-bf38-49e9ab24fc12'        -- ZZ TEST — Cascais Demo
    or whatsapp_number = '+14155238886';                 -- Ryvo Test Client (Twilio sandbox)

do $$
declare
  n_rehearsal  bigint;
  n_real       bigint;
  n_unclassed  bigint;
  unclassed    text;
begin
  select count(*) filter (where rehearsal is true),
         count(*) filter (where rehearsal is false),
         count(*) filter (where rehearsal is null)
    into n_rehearsal, n_real, n_unclassed
    from public.clients;

  if n_unclassed > 0 then
    select string_agg(format('%s "%s" (created %s)', id, name, created_at::date), '; '
                      order by created_at)
      into unclassed
      from public.clients
     where rehearsal is null;

    raise exception
      'REFUSING: % client row(s) are not classified as rehearsal or real: %. '
      'Nothing has been changed — this migration runs in one transaction. '
      'Declare each one explicitly in this file (set rehearsal = true or false '
      'where id = …) and run it again. There is deliberately no rule for '
      '"everything else": a row nobody accounted for is not evidence of a real client.',
      n_unclassed, unclassed;
  end if;

  -- No separate "a matcher matched nothing" check, deliberately. A wrong
  -- matcher leaves its row NULL, and the refusal above names that row. A check
  -- that refused when zero rehearsal rows exist would ALSO refuse the correct
  -- state after go-live — both test clients deleted, only real ones left — and
  -- a guard that fires on a legitimate state is 0036's case 3 failed.

  raise notice 'Classified, not assumed: % rehearsal, % real, 0 undeclared.',
    n_rehearsal, n_real;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select id, name, whatsapp_number, rehearsal from public.clients order by created_at;
--   -- expect: every row true or false, none null. Today: the two rehearsal
--   --         rows, both true — and no real client, which is the truth
--
--   select column_default, is_nullable from information_schema.columns
--    where table_name = 'clients' and column_name = 'rehearsal';
--   -- expect: column_default NULL (no default — the point), is_nullable YES
--   --         (until 0038)
--
--   select count(*) from public.clients;   -- expect: unchanged
--
-- ---------------------------------------------------------------------------
-- THE REFUSALS, PROVEN RATHER THAN TRUSTED
-- ---------------------------------------------------------------------------
-- Run BEFORE applying. Each case is its own transaction, rolled back.
--
--   -- case 1: an unaccounted-for row must be refused BY NAME
--   begin;
--   insert into public.clients (id, name) values
--     ('00000000-0000-0000-0000-0000000c1e37', 'PROOF FIXTURE — unclassified');
--   -- now run the whole file's body from `alter table` to the do-block (no
--   -- begin/commit)
--   -- expect: REFUSING: 1 client row(s) are not classified … PROOF FIXTURE —
--   --         unclassified …
--   rollback;
--
--   -- case 2: a WRONG MATCHER must surface as a refusal naming the row it
--   -- missed — not as a notice that counts one rehearsal client fewer
--   begin;
--   update public.clients set whatsapp_number = '+10000000000'
--    where whatsapp_number = '+14155238886';
--   -- run the body with nothing else modified
--   -- expect: REFUSING: 1 client row(s) are not classified … "Ryvo Test Client" …
--   rollback;
--
--   -- case 3, AND DO NOT SKIP IT: the resting state must NOT be refused
--   begin;
--   -- run the body with nothing modified
--   -- expect: NOTICE  Classified, not assumed: 2 rehearsal, 0 real, 0 undeclared.
--   --         and NO exception
--   rollback;
