-- ============ clients.rehearsal — step 2 of 2: prove, then constrain ============
--
-- ALONE, in a transaction, with 0032's treatment. Read 0037 first: it says why
-- the column has no default and why this is a separate migration.
--
-- ---------------------------------------------------------------------------
-- 🔴 ORDER OF OPERATIONS — THE DEPLOY IS A PRECONDITION, NOT A COMPANION
-- ---------------------------------------------------------------------------
-- 0036's lesson: its drop ran before the deploy was checked, and the ordering
-- held by luck. This one does not rely on luck. BEFORE applying it:
--
--   1. 0037 is applied.
--   2. The onboarding that writes `rehearsal` is DEPLOYED. It must be a
--      required choice with nothing pre-selected, and it is parsed in
--      `cockpit/src/lib/rehearsal.ts`. That path is this proof's
--      `runnable_when` in db/tests/proofs.json, so the suite goes red the day
--      the file appears, saying this proof is now runnable. Check the choice
--      in the running cockpit, not in the source: create a client, and see its
--      row appear with rehearsal true or false — not null.
--   3. The proof fixtures in db/tests/*.test.sql insert their client with
--      `rehearsal = true`. They are rehearsals by definition, and after this
--      migration an insert that omits the column fails.
--
--   in that order    harmless: every insert already names the column
--   this one first   CLIENT CREATION IS BROKEN — the not-null violation lands
--                    on the operator onboarding an agency, which is 0036's
--                    failure again, by a different route
--
-- ---------------------------------------------------------------------------
-- WHAT IT PROVES FIRST
-- ---------------------------------------------------------------------------
-- (a) No row is null. A client created through the old onboarding between 0037
--     and the deploy is null, honestly, and is refused BY NAME, never
--     defaulted.
-- (b) The column STILL HAS NO DEFAULT. A default added by hand since 0037 —
--     "just to unblock onboarding" — would make NOT NULL meaningless, because
--     every undeclared row would silently receive an answer. A constraint that
--     a default satisfies on everyone's behalf proves nothing.

begin;

do $$
declare
  n_null   bigint;
  nulls    text;
  dflt     text;
begin
  select count(*) into n_null from public.clients where rehearsal is null;

  if n_null > 0 then
    select string_agg(format('%s "%s" (created %s)', id, name, created_at::date), '; '
                      order by created_at)
      into nulls
      from public.clients where rehearsal is null;

    raise exception
      'REFUSING: % client row(s) have rehearsal = NULL — nobody declared them: %. '
      'Nothing has been changed. Declare each one (rehearsal = true for a test or '
      'demo, false for a real agency) and run this again. If this row was created '
      'after 0037, the onboarding deploy (precondition 2) has not happened — check '
      'that before anything else.',
      n_null, nulls;
  end if;

  select column_default into dflt
    from information_schema.columns
   where table_schema = 'public' and table_name = 'clients' and column_name = 'rehearsal';

  if dflt is not null then
    raise exception
      'REFUSING: clients.rehearsal has acquired a default (%). NOT NULL on a '
      'column with a default is satisfied on every undeclared row''s behalf and '
      'proves nothing. Drop the default deliberately — and find out who added it '
      'and why — before constraining.',
      dflt;
  end if;

  raise notice 'Every client row declares itself, and the column has no default — proven, not assumed. Constraining.';
end $$;

alter table public.clients
  alter column rehearsal set not null;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select column_default, is_nullable from information_schema.columns
--    where table_name = 'clients' and column_name = 'rehearsal';
--   -- expect: column_default NULL, is_nullable NO
--
--   -- an insert that does not declare itself is refused
--   begin;
--   insert into public.clients (name) values ('PROOF FIXTURE — undeclared');
--   -- expect: ERROR  null value in column "rehearsal" … violates not-null constraint
--   rollback;
--
--   -- and the one screen that writes clients still works: onboard a test
--   -- client in the cockpit, see its row with rehearsal = true, delete it.
--
-- ---------------------------------------------------------------------------
-- THE REFUSALS, PROVEN RATHER THAN TRUSTED — run the do-block on its own
-- ---------------------------------------------------------------------------
--   -- case 1: an undeclared row is refused by name
--   begin;
--   insert into public.clients (id, name) values
--     ('00000000-0000-0000-0000-0000000c1e38', 'PROOF FIXTURE — undeclared');
--   -- run the do-block
--   -- expect: REFUSING: 1 client row(s) have rehearsal = NULL … PROOF FIXTURE …
--   rollback;
--
--   -- case 2: a default added by hand is refused
--   begin;
--   alter table public.clients alter column rehearsal set default false;
--   -- run the do-block
--   -- expect: REFUSING: clients.rehearsal has acquired a default (false) …
--   rollback;
--
--   -- case 3, AND DO NOT SKIP IT: the resting state must NOT be refused
--   begin;
--   -- run the do-block with nothing modified
--   -- expect: NOTICE  Every client row declares itself … and NO exception
--   rollback;
