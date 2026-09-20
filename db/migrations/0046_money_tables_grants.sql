-- ====== the belt: write privileges on the money tables ======
--
-- ALONE, in a transaction, with 0032's treatment.
--
-- ---------------------------------------------------------------------------
-- 🔴 WHAT THE GRANT LISTING FOUND, 21 SEPTEMBER 2026
-- ---------------------------------------------------------------------------
-- All seven relations carry an IDENTICAL grant set:
--
--   service_role   SELECT INSERT UPDATE DELETE TRUNCATE REFERENCES TRIGGER
--   anon           REFERENCES TRIGGER TRUNCATE
--   authenticated  REFERENCES TRIGGER TRUNCATE
--
-- So `service_role` still holds UPDATE, DELETE and TRUNCATE on
-- `client_contracts`. **The revoke is not in force.** Append-only is enforced
-- by the trigger and by nothing else — which is the arrangement `0012`
-- explicitly refused: *"the trigger is the guarantee, the revoke is the belt…
-- a future superuser session can drop a trigger."*
--
-- ---------------------------------------------------------------------------
-- 🔴 AND THE WORSE ONE, WHICH IS NOT ABOUT US: anon HOLDS TRUNCATE
-- ---------------------------------------------------------------------------
-- RLS is enabled on six of the seven, and it is easy to read that as covering
-- this. IT DOES NOT.
--
--   **TRUNCATE IS NOT SUBJECT TO ROW-LEVEL SECURITY.** RLS filters rows for
--   SELECT, INSERT, UPDATE and DELETE. TRUNCATE is a table-level operation
--   gated only by the privilege, so a role holding it empties the table
--   whatever the policies say — and leaves no rows for a policy to have
--   protected.
--
-- `anon` is the role an unauthenticated request runs as. PostgREST never
-- issues TRUNCATE, so this is not reachable through the API today; it is
-- reachable by anything that can open a connection as that role. It is a
-- Supabase default rather than anybody's decision, which is exactly why it
-- goes unexamined.
--
-- 🔒 The truncate TRIGGER on client_contracts would still refuse it. Every
-- other money table has no such trigger, so for those the privilege is the
-- only thing standing in the way.
--
-- ---------------------------------------------------------------------------
-- WHAT EACH TABLE NEEDS, AND WHY THEY DIFFER
-- ---------------------------------------------------------------------------
-- 🔒 NOT A BLANKET REVOKE. Each table's write surface is decided by what it is:
--
--   client_contracts  APPEND-ONLY (0042). INSERT and SELECT only.
--   payments          PARTIALLY frozen: settlement arrives weeks after
--                     invoicing, so UPDATE is legitimate and the trigger
--                     discriminates by column. INSERT, SELECT, UPDATE.
--   cost_checks       A check is an EVENT — somebody looked on a date and said
--                     it was still the price. Correcting one is a new check,
--                     not an edit. INSERT and SELECT only.
--   costs             🔒 DELIBERATELY MUTABLE. A subscription's price changes
--                     and the row is the current agreement, not a historical
--                     claim about a month; `ended_on` carries the history.
--                     This is the one table where UPDATE is correct, and
--                     saying so here stops somebody applying the append-only
--                     pattern by symmetry and turning a price change into a
--                     second row that double-counts.
--   web_clients       A client's status and end date change. INSERT, SELECT,
--                     UPDATE.
--
-- DELETE and TRUNCATE go from all five, for every role. Nothing in this
-- schema is deleted: a contract that was never agreed is superseded, a payment
-- that did not happen is corrected by a row of the opposite kind, and a cost
-- that ended has an `ended_on`.

begin;

do $$
declare n_missing text;
begin
  select string_agg(t, ', ') into n_missing
    from unnest(array['client_contracts','payments','costs','cost_checks','web_clients']) t
   where not exists (
     select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
   );
  if n_missing is not null then
    raise exception
      'REFUSING: these tables do not exist: %. This migration adjusts privileges on tables '
      'it expects to find — see docs/deployed-schema-observed.md.', n_missing;
  end if;
  raise notice 'Preconditions proven, not assumed: all five money tables present.';
end $$;

-- ── nobody deletes or truncates anything here ───────────────────────────────
revoke delete, truncate on
  public.client_contracts, public.payments, public.costs,
  public.cost_checks, public.web_clients
  from public, anon, authenticated, service_role;

-- ── append-only: no UPDATE ──────────────────────────────────────────────────
revoke update on public.client_contracts, public.cost_checks
  from public, anon, authenticated, service_role;

-- ── and the writes that ARE legitimate, stated rather than left implicit ────
-- 🔒 Re-granted explicitly so this file is the whole answer to "what may write
-- here", rather than a list of subtractions from a default nobody chose.
grant select, insert on public.client_contracts to service_role;
grant select, insert on public.cost_checks     to service_role;
grant select, insert, update on public.payments     to service_role;
grant select, insert, update on public.costs        to service_role;
grant select, insert, update on public.web_clients  to service_role;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type)
--     from information_schema.table_privileges
--    where table_schema = 'public'
--      and table_name in ('client_contracts','payments','costs','cost_checks','web_clients')
--      and grantee in ('anon','authenticated','service_role')
--    group by table_name, grantee order by table_name, grantee;
--
--   -- expect, for service_role:
--   --   client_contracts  INSERT, REFERENCES, SELECT, TRIGGER
--   --   cost_checks       INSERT, REFERENCES, SELECT, TRIGGER
--   --   payments          INSERT, REFERENCES, SELECT, TRIGGER, UPDATE
--   --   costs             INSERT, REFERENCES, SELECT, TRIGGER, UPDATE
--   --   web_clients       INSERT, REFERENCES, SELECT, TRIGGER, UPDATE
--   -- expect, for anon and authenticated: REFERENCES, TRIGGER — and NO TRUNCATE.
--
-- 🔴 AND THE QUESTION THIS DOES NOT CLOSE: `ALTER DEFAULT PRIVILEGES` is what
-- granted these in the first place, and it applies to tables created AFTER it
-- was set. It does not re-grant on existing tables — so this revoke holds for
-- these five. THE NEXT TABLE CREATED IN THIS SCHEMA WILL ARRIVE WITH THE SAME
-- DEFAULTS, and will need the same treatment. That is a standing obligation,
-- not a one-off, and it belongs in whatever creates the next table.
