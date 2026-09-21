-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  ⚠️  WHAT WAS APPLIED AS "0045" IS NOT THIS FILE.                        ║
-- ╚═════════════════════════════════════════════════════════════════════════╝
--
-- Recorded 21 September 2026, from the operator's account and verified against
-- this file's own text.
--
-- THIS FILE touches `client_contracts_uncorrected` and nothing else: zero
-- occurrences of `public.client_contracts` anywhere in it. It sets
-- security_invoker on the VIEW and revokes the four write verbs on the VIEW.
--
-- WHAT WAS APPLIED additionally carried:
--
--   revoke insert, update, delete, truncate
--     on public.client_contracts from anon, authenticated, service_role;
--
-- 🔴 THAT REVOKED **INSERT ON THE TABLE**, so no contract could be recorded at
-- all. The application could not write to `client_contracts` between that
-- apply and `0046`.
--
-- It was survivable only because the table was empty and because `0046`
-- re-grants `select, insert` explicitly — see the note below, which is the
-- interesting half.
--
-- 🔒 THE DIFFERENCE IS RECORDED RATHER THAN RECONCILED. This file is not
-- edited to match what ran: the applied version was wrong, and rewriting the
-- file to agree with it would make the repository record a mistake as the
-- intent. `docs/deployed-schema-observed.md` is where the database's actual
-- state belongs; this is where the design belongs, and they are allowed to
-- differ as long as the difference is written down.
--
-- ───────────────────────────────────────────────────────────────────────────
-- 🔒 WHY 0046 REPAIRED IT BY ACCIDENT, AND WHY THAT IS NOT LUCK
-- ───────────────────────────────────────────────────────────────────────────
-- `0046` re-states every legitimate grant rather than only subtracting:
--
--   grant select, insert on public.client_contracts to service_role;
--
-- That decision was made for LEGIBILITY — so the file would be "the whole
-- answer to what may write here, rather than a list of subtractions from a
-- default nobody chose". It had nothing to do with this breakage, which was
-- unknown when it was written.
--
-- **A file that states the whole intended end-state repairs damage it does not
-- know about. A file that only states its own delta cannot.** That is the
-- argument for declarative over incremental, arrived at by being rescued by it.
--
-- ───────────────────────────────────────────────────────────────────────────
-- THE ORIGINAL FILE FOLLOWS, UNCHANGED.
-- ───────────────────────────────────────────────────────────────────────────

-- ====== the uncorrected view must not be a way through the freeze ======
--
-- ALONE, in a transaction, with 0032's treatment.
--
-- ---------------------------------------------------------------------------
-- 🔴 A VIEW OVER AN APPEND-ONLY TABLE REINSTATES THE HALF THAT WAS REVOKED
-- ---------------------------------------------------------------------------
-- `client_contracts_uncorrected` is `select c.* from client_contracts c where
-- not exists (…)` — one table, no aggregate, no DISTINCT. Postgres therefore
-- makes it AUTOMATICALLY UPDATABLE, and PostgREST advertises POST, PATCH and
-- DELETE on it accordingly.
--
-- That matters because of how permissions are checked on such a view:
--
--   FOR AN AUTO-UPDATABLE VIEW, RIGHTS ON THE UNDERLYING TABLE ARE CHECKED AS
--   THE VIEW'S OWNER, NOT AS THE INVOKING ROLE.
--
-- So `0042`'s `revoke update, delete, truncate on client_contracts from
-- service_role` does not govern writes routed through this view. The revoke is
-- intact on the table and bypassed by the path beside it.
--
-- 🔒 WHAT STILL HOLDS, AND WHY THIS IS A HOLE RATHER THAN A BREACH. Triggers
-- live on the BASE TABLE and fire for writes routed through an auto-updatable
-- view, so `client_contracts_append_only` still refuses. Append-only is
-- enforced — by the trigger alone.
--
-- 🔴 WHICH IS EXACTLY THE FAILURE 0012 NAMED WHEN IT EXPLAINED WHY BOTH ARE
-- NEEDED: *"the trigger is the guarantee, the revoke is the belt… a future
-- superuser session can drop a trigger."* A belt with a hole in it is not a
-- belt, and the hole was introduced by the view I added in 0042 to make the
-- freeze safer to read.
--
-- ---------------------------------------------------------------------------
-- TWO CHANGES, AND BOTH ARE NEEDED FOR THE SAME REASON BOTH WERE NEEDED BEFORE
-- ---------------------------------------------------------------------------
--   security_invoker   base-table rights are then checked as the CALLER, so
--                      the revoke on client_contracts governs this path too
--   revoke on the view removes the write verbs outright, so the question does
--                      not arise even if the view is ever redefined in a way
--                      that changes how it is checked
--
-- Either alone would close it today. Both, because 0012's argument has not
-- changed: one is the guarantee and one is the belt, and this migration exists
-- because relying on a single mechanism is what produced the hole.

begin;

do $$
declare
  n_view bigint;
  v_ver  int;
begin
  select count(*) into n_view from information_schema.views
   where table_schema = 'public' and table_name = 'client_contracts_uncorrected';
  if n_view = 0 then
    raise exception
      'REFUSING: public.client_contracts_uncorrected does not exist. This migration '
      'hardens a view it expects to find — see 0042.';
  end if;

  -- security_invoker on views is PostgreSQL 15 and later. On an older server
  -- the revoke below still applies, but say so rather than failing obscurely
  -- at the ALTER.
  show server_version_num into v_ver;
  if v_ver < 150000 then
    raise exception
      'REFUSING: server_version_num is %, and security_invoker on a view requires 150000 '
      'or later. The revoke alone would still close this, but half a fix recorded as a '
      'whole one is how the original hole was made. Decide deliberately.', v_ver;
  end if;

  raise notice 'Preconditions proven, not assumed: view present, server % supports security_invoker.', v_ver;
end $$;

-- 1. Base-table rights are checked as the CALLER, so 0042's revoke governs
--    writes routed through here.
alter view public.client_contracts_uncorrected set (security_invoker = on);

-- 2. And the view itself offers no write verbs to anybody.
revoke insert, update, delete, truncate on public.client_contracts_uncorrected from public;
revoke insert, update, delete, truncate on public.client_contracts_uncorrected from anon;
revoke insert, update, delete, truncate on public.client_contracts_uncorrected from authenticated;
revoke insert, update, delete, truncate on public.client_contracts_uncorrected from service_role;

comment on view public.client_contracts_uncorrected is
  'The contracts that have not been corrected. EVERY revenue figure reads this, never the '
  'base table: a superseded row still carries its period and its fee, so summing the base '
  'table double-counts every correction ever made. READ-ONLY, and deliberately so — it is '
  'automatically updatable by construction, and without security_invoker a write through '
  'it would be checked against the view owner rather than the caller, bypassing 0042''s '
  'revoke on client_contracts.';

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select reloptions from pg_class
--    where relname = 'client_contracts_uncorrected';
--   -- expect: {security_invoker=on}
--
--   select grantee, privilege_type from information_schema.table_privileges
--    where table_name = 'client_contracts_uncorrected' order by grantee, privilege_type;
--   -- expect: SELECT only, for every grantee. No INSERT, UPDATE, DELETE or
--   --         TRUNCATE anywhere.
--
-- 🔴 AND THE QUESTION THIS DOES NOT ANSWER: whether 0042's revoke on the BASE
-- TABLE is still in force, or was restored afterwards by ALTER DEFAULT
-- PRIVILEGES. That needs the grant listing for client_contracts itself, and it
-- is a separate migration if the answer is that it was restored.
