-- Proof for 0052. Run in the Supabase SQL editor WHOLE, after applying 0052.
-- Every case writes its fixture inside a block that raises ZZ052 to undo it, so
-- nothing it writes survives (case 9 checks). The verdict lives in a variable,
-- which the undo does not touch.
--
-- Expected AFTER 0052: every row PASS.
-- Expected BEFORE 0052: 1-3 and 5-7 FAIL (no columns), 4 FAIL, 8 FAIL, 9 PASS.

drop table if exists pg_temp.v0052;
create temp table v0052 (n int primary key, verdict text not null, reason text not null);

create or replace function pg_temp.f0052_fixtures() returns void language sql as $$
  insert into public.clients (id, name, rehearsal) values ('00000000-0000-0000-0000-000000052001', 'proof 0052', true);
  insert into public.web_clients (id, name, status, started_on, rehearsal) values ('00000000-0000-0000-0000-000000052002', 'proof 0052', 'active', '2026-01-01', true);
$$;

-- ══ CASES 1-2 — the two references exist, uuid, nullable, and RESTRICT ══════
do $$
declare r record; n int := 0;
begin
  for r in
    select a.attname as col, pg_get_constraintdef(c.oid) as def, c.confdeltype
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.conrelid = 'public.costs'::regclass and c.contype = 'f'
       and a.attname in ('automation_client_id', 'web_client_id')
  loop
    n := n + 1;
    insert into v0052 values (
      case r.col when 'automation_client_id' then 1 else 2 end,
      case when r.confdeltype = 'r' then 'PASS' else 'FAIL' end,
      r.col || ': ' || r.def || case when r.confdeltype = 'r' then ' (RESTRICT)' else ' — NOT RESTRICT: deleting a client would delete its costs' end);
  end loop;
exception when others then
  insert into v0052 values (1, 'FAIL', 'the case itself errored: ' || sqlerrm) on conflict do nothing;
end $$;

-- ══ CASE 3 — service_role can write both new columns (0046's belt) ═════════
do $$
declare ok boolean;
begin
  ok := has_column_privilege('service_role', 'public.costs', 'automation_client_id', 'INSERT')
    and has_column_privilege('service_role', 'public.costs', 'web_client_id', 'INSERT')
    and has_column_privilege('service_role', 'public.cost_checks', 'for_month', 'INSERT');
  insert into v0052 values (3, case when ok then 'PASS' else 'FAIL' end,
    case when ok then 'service_role can insert every new column' else 'service_role cannot insert a new column' end);
exception when others then
  insert into v0052 values (3, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ CASE 4 — a cost naming BOTH a web and an automation client is refused ═
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    perform pg_temp.f0052_fixtures();
    begin
      execute $q$insert into public.costs (label, category, side, amount_eur, cadence, started_on, recorded_by, automation_client_id, web_client_id)
               values ('proof 0052', 'other', 'web', 1, 'monthly', '2026-01-01', 'proof 0052',
                       '00000000-0000-0000-0000-000000052001', '00000000-0000-0000-0000-000000052002')$q$;
      v := 'FAIL'; why := 'ACCEPTED a cost naming two clients';
    exception when check_violation then v := 'PASS'; why := 'refused: ' || sqlerrm;
    end;
    raise exception using errcode = 'ZZ052', message = 'undo';
  exception
    when sqlstate 'ZZ052' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0052 values (4, v, why);
end $$;

-- ══ CASE 5 — a client's cost on the wrong side is refused ══════════════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    perform pg_temp.f0052_fixtures();
    begin
      execute $q$insert into public.costs (label, category, side, amount_eur, cadence, started_on, recorded_by, web_client_id)
               values ('proof 0052', 'domain', 'shared', 12, 'annual', '2026-01-01', 'proof 0052', '00000000-0000-0000-0000-000000052002')$q$;
      v := 'FAIL'; why := 'ACCEPTED a SHARED cost naming a web client';
    exception when check_violation then v := 'PASS'; why := 'refused: ' || sqlerrm;
    end;
    raise exception using errcode = 'ZZ052', message = 'undo';
  exception
    when sqlstate 'ZZ052' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0052 values (5, v, why);
end $$;

-- ══ 🔴 CASE 6 — PERMITTED: a web client's own cost, and a business cost ════
-- A check one clause too wide refuses every cost, and 4-5 still pass.
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    perform pg_temp.f0052_fixtures();
    execute $q$insert into public.costs (label, category, side, amount_eur, cadence, started_on, recorded_by, web_client_id)
             values ('proof 0052 domain', 'domain', 'web', 12, 'annual', '2026-01-01', 'proof 0052', '00000000-0000-0000-0000-000000052002')$q$;
    insert into public.costs (label, category, side, amount_eur, cadence, started_on, recorded_by)
    values ('proof 0052 server', 'infrastructure', 'automation', 18.5, 'monthly', '2026-01-01', 'proof 0052');
    v := 'PASS'; why := 'a client''s own cost and a business''s cost are both recorded';
    raise exception using errcode = 'ZZ052', message = 'undo';
  exception
    when sqlstate 'ZZ052' then null;
    when others then v := 'FAIL'; why := 'a permitted cost was REFUSED: ' || sqlerrm;
  end;
  insert into v0052 values (6, v, why);
end $$;

-- ══ CASE 7 — for_month must be a first day, and is required ════════════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; cid uuid;
begin
  begin
    insert into public.costs (label, category, side, amount_eur, cadence, started_on, recorded_by)
    values ('proof 0052 model', 'model', 'automation', 0, 'monthly', '2026-01-01', 'proof 0052') returning id into cid;
    begin
      execute format($q$insert into public.cost_checks (cost_id, confirmed_on, confirmed_by, amount_eur, for_month)
                      values (%L, current_date, 'proof 0052', 4.34, '2026-09-15')$q$, cid);
      v := 'FAIL'; why := 'ACCEPTED a check for 15 Sep — not a month';
    exception when check_violation then
      begin
        execute format($q$insert into public.cost_checks (cost_id, confirmed_on, confirmed_by, amount_eur)
                        values (%L, current_date, 'proof 0052', 4.34)$q$, cid);
        v := 'FAIL'; why := 'ACCEPTED a check with no month';
      exception when not_null_violation then v := 'PASS'; why := 'a mid-month date and a missing month are both refused';
      end;
    end;
    raise exception using errcode = 'ZZ052', message = 'undo';
  exception
    when sqlstate 'ZZ052' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0052 values (7, v, why);
end $$;

-- ══ 🔴 CASE 8 — PERMITTED: a check for a month is recorded ═════════════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; cid uuid;
begin
  begin
    insert into public.costs (label, category, side, amount_eur, cadence, started_on, recorded_by)
    values ('proof 0052 model', 'model', 'automation', 0, 'monthly', '2026-01-01', 'proof 0052') returning id into cid;
    execute format($q$insert into public.cost_checks (cost_id, confirmed_on, confirmed_by, amount_eur, for_month)
                    values (%L, current_date, 'proof 0052', 4.34, '2026-09-01')$q$, cid);
    v := 'PASS'; why := 'an invoice total for September is recorded';
    raise exception using errcode = 'ZZ052', message = 'undo';
  exception
    when sqlstate 'ZZ052' then null;
    when others then v := 'FAIL'; why := 'a permitted check was REFUSED: ' || sqlerrm;
  end;
  insert into v0052 values (8, v, why);
end $$;

-- ══ CASE 9 — no fixture survived ═══════════════════════════════════════════
do $$
declare n int;
begin
  select (select count(*) from public.costs where recorded_by = 'proof 0052')
       + (select count(*) from public.clients where name = 'proof 0052')
       + (select count(*) from public.web_clients where name = 'proof 0052') into n;
  insert into v0052 values (9, case when n = 0 then 'PASS' else 'FAIL' end,
    case when n = 0 then 'no 0052 fixture row exists'
         else n || ' fixture row(s) SURVIVED in production; tell Manuel before touching them' end);
exception when others then
  insert into v0052 values (9, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ THE VERDICT — the only output that matters ════════════════════════════
select c.n as "case", c.what,
       coalesce(r.verdict, 'FAIL') as verdict,
       coalesce(r.reason, 'DID NOT RUN — a missing row is a failure') as reason,
       c.before_0052
  from (values
    (1, 'costs.automation_client_id → clients, RESTRICT',         'FAIL'),
    (2, 'costs.web_client_id → web_clients, RESTRICT',            'FAIL'),
    (3, 'service_role can insert every new column',                'FAIL'),
    (4, 'a cost naming two clients is refused',                    'FAIL'),
    (5, 'a client''s cost on the wrong side is refused',           'FAIL'),
    (6, 'PERMITTED: a client''s own cost and a business''s cost',  'FAIL'),
    (7, 'for_month: mid-month and missing are refused',            'FAIL'),
    (8, 'PERMITTED: a check for a month is recorded',              'FAIL'),
    (9, 'no fixture survived',                                     'PASS')
  ) as c(n, what, before_0052)
  left join v0052 r using (n)
 order by c.n;
