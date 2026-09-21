-- The cases of 0046, SEEN — as a VERDICT TABLE the SQL editor displays.
--
-- Rewritten 21 September 2026 in the verdict shape (CLAUDE.md). The first
-- version could not have been run as written, for three reasons:
--   * `\i` and `\echo` are psql commands, and the Supabase SQL editor rejects
--     them at the first line.
--   * Under psql, `\i` would have run 0046's own COMMIT inside each case: the
--     case's transaction ends there, and case 4's fixture contract, parented on
--     a REAL client (`from public.clients limit 1`), would have been permanent.
--   * Its checks read information_schema.table_privileges, which shows only
--     the grants the CURRENT role can see. For a role that cannot see them,
--     "no DELETE survives" passes on an empty result. has_table_privilege
--     answers for any role, so every check below uses it, over an explicit
--     list. None of them can pass by finding nothing.
--
-- 🔴 IT DOES NOT APPLY 0046. 0046 is applied, so this tests the DEPLOYED
-- state. Paste the whole file and run it. Every row must be PASS. Nothing it
-- writes survives: each case that writes undoes itself by raising a private
-- SQLSTATE (ZZ046) and catching it, and case 7 checks that.
--
-- 🔴 CASE 3 IS THE ONE NOT TO SKIP. Cases 1 and 2 prove privileges were
-- REMOVED. Case 3 proves the ones that must REMAIN still hold. A revoke one
-- word too wide leaves a schema nothing can write to, and both removal cases
-- still pass.
--
-- Beyond the first version: case 4 checks the WHOLE privilege matrix against
-- 0046's own "verify after applying" block, in both directions, so an extra
-- grant (anon SELECT on payments, say) is caught as well as a missing one.
-- Case 5 separates the belt from the guarantee, which the first version's
-- case 4 deliberately did not ("either refusal is correct").

drop table if exists pg_temp.v0046;
create temp table v0046 (n int primary key, verdict text not null, reason text not null);


-- ══ CASE 1 — nobody deletes or truncates any money table ══════════════════
do $$
declare held text;
begin
  select string_agg(format('%s %s %s', r, t, p), '; ' order by r, t, p) into held
    from unnest(array['public','anon','authenticated','service_role']) r,
         unnest(array['client_contracts','payments','costs','cost_checks','web_clients']) t,
         unnest(array['DELETE','TRUNCATE']) p
   where has_table_privilege(r, 'public.' || t, p);
  insert into v0046 values (1,
    case when held is null then 'PASS' else 'FAIL' end,
    coalesce('still held: ' || held, 'no role holds DELETE or TRUNCATE on any of the five (40 checks)'));
exception when others then
  insert into v0046 values (1, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ CASE 2 — the append-only tables have no UPDATE for anybody ════════════
do $$
declare held text;
begin
  select string_agg(format('%s %s', r, t), '; ' order by r, t) into held
    from unnest(array['public','anon','authenticated','service_role']) r,
         unnest(array['client_contracts','cost_checks']) t
   where has_table_privilege(r, 'public.' || t, 'UPDATE');
  insert into v0046 values (2,
    case when held is null then 'PASS' else 'FAIL' end,
    coalesce('UPDATE still held: ' || held, 'no role holds UPDATE on client_contracts or cost_checks (8 checks)'));
exception when others then
  insert into v0046 values (2, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ 🔴 CASE 3 — THE RESTING STATE: the legitimate writes survive ══════════
do $$
declare missing text;
begin
  select string_agg(w.t || ' ' || w.p, ', ' order by w.t, w.p) into missing
    from (values
      ('payments','UPDATE'), ('costs','UPDATE'), ('web_clients','UPDATE'),
      ('client_contracts','INSERT'), ('payments','INSERT'), ('costs','INSERT'),
      ('cost_checks','INSERT'), ('web_clients','INSERT'),
      ('client_contracts','SELECT'), ('payments','SELECT'), ('costs','SELECT'),
      ('cost_checks','SELECT'), ('web_clients','SELECT')
    ) as w(t, p)
   where not has_table_privilege('service_role', 'public.' || w.t, w.p);
  insert into v0046 values (3,
    case when missing is null then 'PASS' else 'FAIL' end,
    coalesce('the revoke went too wide; service_role has lost: ' || missing,
             'service_role keeps SELECT and INSERT on all five, and UPDATE on payments, costs, web_clients'));
exception when others then
  insert into v0046 values (3, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ CASE 4 — the whole matrix, both directions ════════════════════════════
-- Expected, from 0046's "verify after applying" block:
--   service_role    client_contracts, cost_checks: SELECT INSERT REFERENCES TRIGGER
--                   payments, costs, web_clients:  SELECT INSERT UPDATE REFERENCES TRIGGER
--   anon, authenticated, on all five:              REFERENCES TRIGGER only
do $$
declare wrong text;
begin
  with actual as (
    select r, t, p, has_table_privilege(r, 'public.' || t, p) as held
      from unnest(array['anon','authenticated','service_role']) r,
           unnest(array['client_contracts','payments','costs','cost_checks','web_clients']) t,
           unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
  ),
  expected as (
    select r, t, p,
           case
             when p in ('REFERENCES','TRIGGER') then true
             when r <> 'service_role' then false
             when p in ('SELECT','INSERT') then true
             when p = 'UPDATE' then t in ('payments','costs','web_clients')
             else false
           end as held
      from actual
  )
  select string_agg(format('%s %s %s is %s, expected %s', a.r, a.t, a.p, a.held, e.held), '; '
                    order by a.r, a.t, a.p)
    into wrong
    from actual a join expected e using (r, t, p)
   where a.held is distinct from e.held;
  insert into v0046 values (4,
    case when wrong is null then 'PASS' else 'FAIL' end,
    coalesce(wrong, 'all 105 role/table/privilege combinations are exactly as 0046 intends'));
exception when others then
  insert into v0046 values (4, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ CASE 5 — the BELT: service_role's UPDATE is refused by the privilege ══
-- Run AS service_role, so a refusal here is the grant, not the trigger. The
-- row is created by the editor's role first, then the role is switched.
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; st text;
begin
  begin
    insert into public.clients (id, name, rehearsal)
    values ('00000000-0000-0000-0000-000000046000', 'proof 0046', true);
    insert into public.client_contracts (id, automation_client_id, monthly_eur, starts_on, signed_by, recorded_by)
    values ('00000000-0000-0000-0000-000000046001', '00000000-0000-0000-0000-000000046000',
            400.00, '2026-10-01', 'proof', 'proof 0046');
    set local role service_role;
    begin
      update public.client_contracts set monthly_eur = 500.00
       where id = '00000000-0000-0000-0000-000000046001';
      v := 'FAIL'; why := 'service_role UPDATED a contract: the belt is off';
    exception when others then
      get stacked diagnostics st = returned_sqlstate;
      if st = '42501' then v := 'PASS'; why := 'refused by the privilege (42501) while running as service_role';
      else v := 'FAIL'; why := format('refused, but not by the privilege (%s: %s); the belt is untested', st, sqlerrm); end if;
    end;
    reset role;
    raise exception using errcode = 'ZZ046', message = 'undo';
  exception
    when sqlstate 'ZZ046' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0046 values (5, v, why);
end $$;

-- ══ CASE 6 — the GUARANTEE: the trigger refuses even where privilege allows ══
-- Run as the editor's role, which bypasses privileges, so only the trigger
-- stands in the way. 0012's argument: both are needed.
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    insert into public.clients (id, name, rehearsal)
    values ('00000000-0000-0000-0000-000000046000', 'proof 0046', true);
    insert into public.client_contracts (id, automation_client_id, monthly_eur, starts_on, signed_by, recorded_by)
    values ('00000000-0000-0000-0000-000000046001', '00000000-0000-0000-0000-000000046000',
            400.00, '2026-10-01', 'proof', 'proof 0046');
    begin
      update public.client_contracts set monthly_eur = 500.00
       where id = '00000000-0000-0000-0000-000000046001';
      v := 'FAIL'; why := 'the UPDATE was ACCEPTED: append-only rests on the privilege alone';
    exception when others then
      if sqlerrm like 'client_contracts is append-only%' then v := 'PASS'; why := 'refused by the append-only trigger';
      else v := 'FAIL'; why := 'refused for the wrong reason: ' || sqlerrm; end if;
    end;
    raise exception using errcode = 'ZZ046', message = 'undo';
  exception
    when sqlstate 'ZZ046' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0046 values (6, v, why);
end $$;

-- ══ CASE 7 — no fixture survived ══════════════════════════════════════════
do $$
declare n bigint;
begin
  select (select count(*) from public.clients          where id::text like '%0000000460%')
       + (select count(*) from public.client_contracts where id::text like '%0000000460%')
    into n;
  insert into v0046 values (7,
    case when n = 0 then 'PASS' else 'FAIL' end,
    case when n = 0 then 'no 0046 fixture row exists'
         else n || ' fixture row(s) SURVIVED in production; tell Manuel before touching them' end);
exception when others then
  insert into v0046 values (7, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;


-- ══ THE VERDICT ═══════════════════════════════════════════════════════════
select c.n                                                        as "case",
       c.what,
       coalesce(r.verdict, 'FAIL')                                as verdict,
       coalesce(r.reason, 'DID NOT RUN — a missing row is a failure') as reason
  from (values
    (1, 'nobody deletes or truncates a money table'),
    (2, 'no UPDATE on client_contracts or cost_checks'),
    (3, 'RESTING STATE: the legitimate writes survive'),
    (4, 'the whole privilege matrix, both directions'),
    (5, 'belt: service_role UPDATE refused by privilege'),
    (6, 'guarantee: the trigger refuses regardless'),
    (7, 'no fixture survived')
  ) as c(n, what)
  left join v0046 r using (n)
 order by c.n;
