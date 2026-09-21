-- The cases of 0050, SEEN — as a VERDICT TABLE the SQL editor displays.
--
-- 🔴 WHY THE SHAPE CHANGED. The Supabase SQL editor does not show RAISE
-- NOTICE (found running 0049's proof on 21 September): a correct run showed
-- nothing at all, and the pass rested on "no error". So this file ends in a
-- SELECT that returns one row per case: PASS or FAIL, and why. A case that
-- did not run is a FAIL row that says so, not a missing line.
--
-- 🔴 IT DOES NOT APPLY 0050. 0050 ends in COMMIT. Run this whole file TWICE:
--
--   1. BEFORE applying 0050. Every row's `verdict` must equal its
--      `before_0050` column. That run proves the cases can fail: the FAIL
--      rows are the deployed model's gaps, seen.
--   2. Apply 0050 by hand, the whole file.
--   3. AFTER applying. Every row must be PASS.
--
-- 🔒 HOW EACH CASE ROLLS BACK. There is no outer transaction to roll back:
-- the verdicts have to survive, and a rollback would take them too. Instead
-- each case runs inside a PL/pgSQL block that ENDS BY RAISING a private
-- SQLSTATE (ZZ050) and catches it. That undoes everything the case wrote,
-- including a write the case expected to be refused but which was accepted.
-- The verdict lives in a PL/pgSQL variable, which a rollback does not touch,
-- and is recorded only after the undo. Any other error is caught and
-- becomes a FAIL row. So the script as a whole never errors, and the verdict
-- table is always what the editor shows last.
--
-- Fixture ids end in 0500xx. The last case checks none survived.

drop table if exists pg_temp.v0050;
create temp table v0050 (n int primary key, verdict text not null, reason text not null);

-- One fixture client, created and destroyed inside each case.
create or replace function pg_temp.f0050_client() returns uuid language sql as $$
  insert into public.clients (id, name, rehearsal)
  values ('00000000-0000-0000-0000-000000050000', 'proof 0050', true)
  returning id
$$;

create or replace function pg_temp.f0050_contract(cid uuid, supersedes uuid, fee numeric) returns void language sql as $$
  insert into public.client_contracts
    (id, automation_client_id, monthly_eur, starts_on, signed_by, recorded_by, supersedes_id)
  values (cid, '00000000-0000-0000-0000-000000050000', fee, '2026-10-01', 'proof', 'proof 0050', supersedes)
$$;


-- ══ CASE 1 — UPDATE of an agreed term is refused by the TRIGGER ═══════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    perform pg_temp.f0050_client();
    perform pg_temp.f0050_contract('00000000-0000-0000-0000-000000050001', null, 400.00);
    begin
      update public.client_contracts set monthly_eur = 500.00
       where id = '00000000-0000-0000-0000-000000050001';
      v := 'FAIL'; why := 'the UPDATE was ACCEPTED: the fee of an agreed contract changed';
    exception when others then
      if sqlerrm like 'client_contracts is append-only%' then v := 'PASS'; why := 'refused by the trigger';
      else v := 'FAIL'; why := 'refused for the wrong reason: ' || sqlerrm; end if;
    end;
    raise exception using errcode = 'ZZ050', message = 'undo';
  exception
    when sqlstate 'ZZ050' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0050 values (1, v, why);
end $$;

-- ══ CASE 2 — the old stamping path is closed ══════════════════════════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    perform pg_temp.f0050_client();
    perform pg_temp.f0050_contract('00000000-0000-0000-0000-000000050001', null, 400.00);
    begin
      update public.client_contracts set superseded_at = now(), superseded_by = 'proof'
       where id = '00000000-0000-0000-0000-000000050001';
      v := 'FAIL'; why := 'stamping superseded_at was ACCEPTED: the two-step correction model is still open';
    exception when others then
      if sqlerrm like 'client_contracts is append-only%' then v := 'PASS'; why := 'refused by the trigger';
      else v := 'FAIL'; why := 'refused for the wrong reason: ' || sqlerrm; end if;
    end;
    raise exception using errcode = 'ZZ050', message = 'undo';
  exception
    when sqlstate 'ZZ050' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0050 values (2, v, why);
end $$;

-- ══ CASE 3 — DELETE is refused by the TRIGGER, not only the privilege ═════
-- Run as the editor's role, which bypasses privileges, so a pass here is the
-- guarantee rather than the belt.
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    perform pg_temp.f0050_client();
    perform pg_temp.f0050_contract('00000000-0000-0000-0000-000000050001', null, 400.00);
    begin
      delete from public.client_contracts where id = '00000000-0000-0000-0000-000000050001';
      v := 'FAIL'; why := 'the DELETE was ACCEPTED: only a privilege stood in the way';
    exception when others then
      if sqlerrm like 'client_contracts is append-only%' then v := 'PASS'; why := 'refused by the trigger';
      else v := 'FAIL'; why := 'refused for the wrong reason: ' || sqlerrm; end if;
    end;
    raise exception using errcode = 'ZZ050', message = 'undo';
  exception
    when sqlstate 'ZZ050' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0050 values (3, v, why);
end $$;

-- ══ CASE 4 — TRUNCATE is refused by the statement trigger ═════════════════
-- 🔴 Takes ACCESS EXCLUSIVE on client_contracts for an instant. Nothing in
-- production reads it yet (The Month is not built), so this is safe today.
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    set local lock_timeout = '3s';
    begin
      truncate public.client_contracts;
      v := 'FAIL'; why := 'the TRUNCATE was ACCEPTED (and undone by this case)';
    exception when others then
      if sqlerrm like 'client_contracts is append-only%' then v := 'PASS'; why := 'refused by the statement trigger';
      else v := 'FAIL'; why := 'refused for the wrong reason: ' || sqlerrm; end if;
    end;
    raise exception using errcode = 'ZZ050', message = 'undo';
  exception
    when sqlstate 'ZZ050' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0050 values (4, v, why);
end $$;

-- ══ 🔴 CASE 5 — PERMITTED: an INSERT still works ══════════════════════════
-- A freeze one verb too wide makes the table read-only, and cases 1-4 still
-- pass.
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; n bigint;
begin
  begin
    perform pg_temp.f0050_client();
    perform pg_temp.f0050_contract('00000000-0000-0000-0000-000000050001', null, 400.00);
    select count(*) into n from public.client_contracts_uncorrected
     where id = '00000000-0000-0000-0000-000000050001';
    if n = 1 then v := 'PASS'; why := 'a new contract is recorded and counted';
    else v := 'FAIL'; why := format('the new contract was inserted but the view shows it %s times', n); end if;
    raise exception using errcode = 'ZZ050', message = 'undo';
  exception
    when sqlstate 'ZZ050' then null;
    when others then v := 'FAIL'; why := 'the INSERT was refused: ' || sqlerrm;
  end;
  insert into v0050 values (5, v, why);
end $$;

-- ══ 🔴 CASE 6 — PERMITTED: superseding works, and counts ONCE ═════════════
-- The correction is an INSERT only: exactly what service_role can do. The
-- view must then show the correction and hide the original.
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; ids text; total numeric;
begin
  begin
    perform pg_temp.f0050_client();
    perform pg_temp.f0050_contract('00000000-0000-0000-0000-000000050001', null, 400.00);
    perform pg_temp.f0050_contract('00000000-0000-0000-0000-000000050002',
                                   '00000000-0000-0000-0000-000000050001', 450.00);
    select string_agg(right(id::text, 2), ',' order by id), sum(monthly_eur) into ids, total
      from public.client_contracts_uncorrected
     where automation_client_id = '00000000-0000-0000-0000-000000050000';
    if ids = '02' and total = 450.00 then
      v := 'PASS'; why := 'the correction is counted and the original is not: 450.00 once';
    else
      v := 'FAIL'; why := format('the view shows contract(s) %s totalling %s; expected only 02 at 450.00', ids, total);
    end if;
    raise exception using errcode = 'ZZ050', message = 'undo';
  exception
    when sqlstate 'ZZ050' then null;
    when others then v := 'FAIL'; why := 'superseding was refused: ' || sqlerrm;
  end;
  insert into v0050 values (6, v, why);
end $$;

-- ══ CASE 7 — a second correction of the same contract is refused ══════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; c text;
begin
  begin
    perform pg_temp.f0050_client();
    perform pg_temp.f0050_contract('00000000-0000-0000-0000-000000050001', null, 400.00);
    perform pg_temp.f0050_contract('00000000-0000-0000-0000-000000050002',
                                   '00000000-0000-0000-0000-000000050001', 450.00);
    begin
      perform pg_temp.f0050_contract('00000000-0000-0000-0000-000000050003',
                                     '00000000-0000-0000-0000-000000050001', 460.00);
      v := 'FAIL'; why := 'two corrections of one contract were ACCEPTED: both would count';
    exception when unique_violation then
      get stacked diagnostics c = constraint_name;
      if c = 'client_contracts_one_correction_each' then v := 'PASS'; why := 'refused by ' || c;
      else v := 'FAIL'; why := 'refused by the wrong constraint: ' || c; end if;
    end;
    raise exception using errcode = 'ZZ050', message = 'undo';
  exception
    when sqlstate 'ZZ050' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0050 values (7, v, why);
end $$;

-- ══ CASE 8 — the belt: write privileges exactly as intended ═══════════════
do $$
declare v text; why text; extra text;
begin
  select string_agg(format('%s %s %s', r, rel, pv), '; ') into extra
    from unnest(array['anon','authenticated','service_role']) r,
         unnest(array['public.client_contracts','public.client_contracts_uncorrected']) rel,
         unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) pv
   where has_table_privilege(r, rel, pv)
     and not (r = 'service_role' and rel = 'public.client_contracts' and pv = 'INSERT');
  if extra is not null then
    v := 'FAIL'; why := 'write privileges survive: ' || extra;
  elsif not has_table_privilege('service_role', 'public.client_contracts', 'INSERT')
     or not has_table_privilege('service_role', 'public.client_contracts_uncorrected', 'SELECT') then
    v := 'FAIL'; why := 'service_role lost INSERT on the table or SELECT on the view';
  else
    v := 'PASS'; why := 'service_role: INSERT on the table, SELECT on the view; no other writes anywhere';
  end if;
  insert into v0050 values (8, v, why);
exception when others then
  insert into v0050 values (8, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ CASE 9 — the catalogue: exactly the end state, nothing left over ══════
do $$
declare v text; why text; triggers text; n_freeze bigint; opts text;
begin
  select string_agg(format('%s/%s/%s/%s', t.tgname, t.tgtype, t.tgenabled, t.tgfoid::regproc), ', ' order by t.tgname)
    into triggers
    from pg_trigger t
   where t.tgrelid = 'public.client_contracts'::regclass and not t.tgisinternal;
  select count(*) into n_freeze from pg_proc
   where proname = 'client_contracts_freeze' and pronamespace = 'public'::regnamespace;
  select array_to_string(reloptions, ',') into opts from pg_class
   where oid = 'public.client_contracts_uncorrected'::regclass;

  if triggers is distinct from
     'client_contracts_append_only_row/27/O/client_contracts_append_only, '
     'client_contracts_append_only_truncate/34/O/client_contracts_append_only' then
    v := 'FAIL'; why := 'triggers are: ' || coalesce(triggers, 'none');
  elsif n_freeze <> 0 then
    v := 'FAIL'; why := 'client_contracts_freeze() still exists';
  elsif opts is distinct from 'security_invoker=true' then
    v := 'FAIL'; why := 'the view is not security_invoker: ' || coalesce(opts, 'no options');
  else
    v := 'PASS'; why := 'two enabled triggers on the one function, no freeze, view security_invoker';
  end if;
  insert into v0050 values (9, v, why);
exception when others then
  insert into v0050 values (9, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ CASE 10 — no fixture survived ═════════════════════════════════════════
do $$
declare n bigint;
begin
  select (select count(*) from public.clients          where id::text like '%0000000500%')
       + (select count(*) from public.client_contracts where id::text like '%0000000500%')
    into n;
  insert into v0050 values (10,
    case when n = 0 then 'PASS' else 'FAIL' end,
    case when n = 0 then 'no 0050 fixture row exists'
         else n || ' fixture row(s) SURVIVED in production; tell Manuel before touching them' end);
exception when others then
  insert into v0050 values (10, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;


-- ══ THE VERDICT — the only output that matters ════════════════════════════
select c.n                                  as "case",
       c.what,
       coalesce(r.verdict, 'FAIL')          as verdict,
       coalesce(r.reason, 'DID NOT RUN — a missing row is a failure')  as reason,
       c.before_0050
  from (values
    (1,  'UPDATE of an agreed term refused by trigger',     'PASS'),
    (2,  'stamping superseded_at refused',                  'FAIL'),
    (3,  'DELETE refused by trigger',                       'FAIL'),
    (4,  'TRUNCATE refused by trigger',                     'FAIL'),
    (5,  'PERMITTED: insert works',                         'PASS'),
    (6,  'PERMITTED: superseding works and counts once',    'FAIL'),
    (7,  'second correction of one contract refused',       'PASS'),
    (8,  'belt: write privileges exact',                    'PASS'),
    (9,  'catalogue is exactly the end state',              'FAIL'),
    (10, 'no fixture survived',                             'PASS')
  ) as c(n, what, before_0050)
  left join v0050 r using (n)
 order by c.n;
