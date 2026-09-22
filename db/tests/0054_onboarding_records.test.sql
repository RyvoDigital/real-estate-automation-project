-- Proof for 0054. Run in the Supabase SQL editor WHOLE, after applying 0054.
-- Every case writes inside a block that raises ZZ054 to undo it, so nothing it
-- writes survives (case 12 checks). The verdict lives in a temp table, which the
-- undo does not touch.
--
-- Expected AFTER 0054: every row PASS.
-- Expected BEFORE 0054: 1-11 FAIL (no table), 12 PASS.

drop table if exists pg_temp.v0054;
create temp table v0054 (n int primary key, verdict text not null, reason text not null);

-- Two fixture clients: the one being onboarded, and an existing one whose number
-- must still answer with its own config (the routing proof's other half).
create or replace function pg_temp.f0054_fixtures() returns void language sql as $$
  insert into public.clients (id, name, whatsapp_number, rehearsal) values
    ('00000000-0000-0000-0000-000000054001', 'proof 0054 new',      '+351900054001', true),
    ('00000000-0000-0000-0000-000000054002', 'proof 0054 existing', '+351900054002', true);
$$;

-- ══ CASE 1 — grants, RLS, and the view's invoker rights ════════════════════
do $$
declare ok boolean; opts text[]; rls boolean;
begin
  select reloptions into opts from pg_class where oid = 'public.onboarding_records_current'::regclass;
  select relrowsecurity into rls from pg_class where oid = 'public.onboarding_records'::regclass;
  ok := has_table_privilege('service_role', 'public.onboarding_records', 'INSERT')
    and has_table_privilege('service_role', 'public.onboarding_records', 'SELECT')
    and not has_table_privilege('service_role', 'public.onboarding_records', 'UPDATE')
    and not has_table_privilege('service_role', 'public.onboarding_records', 'DELETE')
    and not has_table_privilege('service_role', 'public.onboarding_records', 'TRUNCATE')
    and not has_table_privilege('anon', 'public.onboarding_records', 'SELECT')
    and not has_table_privilege('authenticated', 'public.onboarding_records', 'SELECT')
    and has_table_privilege('service_role', 'public.onboarding_records_current', 'SELECT')
    and 'security_invoker=true' = any (coalesce(opts, '{}'))
    and rls;
  insert into v0054 values (1, case when ok then 'PASS' else 'FAIL' end,
    case when ok then 'service_role SELECT+INSERT only; no anon/authenticated; RLS on; the view is security_invoker'
         else 'a grant, RLS or the view''s invoker rights are wrong' end);
exception when others then
  insert into v0054 values (1, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ CASE 2 — PERMITTED: the disclosure conversation, with who was told ═════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    perform pg_temp.f0054_fixtures();
    insert into public.onboarding_records (client_id, step, happened_on, recorded_by, detail)
    values ('00000000-0000-0000-0000-000000054001', 'ai_disclosure_told', '2026-09-22', 'proof 0054', '{"told":"the agency owner"}');
    v := 'PASS'; why := 'a disclosure record naming who was told is accepted';
    raise exception using errcode = 'ZZ054', message = 'undo';
  exception
    when sqlstate 'ZZ054' then null;
    when others then v := 'FAIL'; why := 'a valid disclosure record was REFUSED: ' || sqlerrm;
  end;
  insert into v0054 values (2, v, why);
end $$;

-- ══ CASE 3 — a disclosure record that names nobody is refused ══════════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    perform pg_temp.f0054_fixtures();
    begin
      insert into public.onboarding_records (client_id, step, happened_on, recorded_by, detail)
      values ('00000000-0000-0000-0000-000000054001', 'ai_disclosure_told', '2026-09-22', 'proof 0054', '{"told":"  "}');
      v := 'FAIL'; why := 'ACCEPTED a disclosure record that names nobody';
    exception when check_violation then v := 'PASS'; why := 'refused by disclosure_names_who_was_told';
    end;
    raise exception using errcode = 'ZZ054', message = 'undo';
  exception
    when sqlstate 'ZZ054' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0054 values (3, v, why);
end $$;

-- ══ 🔴 CASE 4 — PERMITTED: a routing proof with BOTH halves ════════════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    perform pg_temp.f0054_fixtures();
    insert into public.onboarding_records (client_id, step, happened_on, recorded_by, detail)
    values ('00000000-0000-0000-0000-000000054001', 'routing_proved', '2026-09-22', 'proof 0054',
            '{"new_client_answered":true,"existing_client_answered":true,"existing_client_id":"00000000-0000-0000-0000-000000054002"}');
    v := 'PASS'; why := 'a routing proof with both halves is accepted';
    raise exception using errcode = 'ZZ054', message = 'undo';
  exception
    when sqlstate 'ZZ054' then null;
    when others then v := 'FAIL'; why := 'a valid routing proof was REFUSED: ' || sqlerrm;
  end;
  insert into v0054 values (4, v, why);
end $$;

-- ══ 🔴 CASE 5 — ONE half is not a routing proof ═════════════════════════════
do $$
declare v text := 'PASS'; why text := 'the new half alone, the existing half false, and no existing client are each refused'; d jsonb;
begin
  foreach d in array array[
    '{"new_client_answered":true}'::jsonb,
    '{"new_client_answered":true,"existing_client_answered":false,"existing_client_id":"00000000-0000-0000-0000-000000054002"}'::jsonb,
    '{"new_client_answered":true,"existing_client_answered":true}'::jsonb]
  loop
    begin
      perform pg_temp.f0054_fixtures();
      begin
        insert into public.onboarding_records (client_id, step, happened_on, recorded_by, detail)
        values ('00000000-0000-0000-0000-000000054001', 'routing_proved', '2026-09-22', 'proof 0054', d);
        v := 'FAIL'; why := 'ACCEPTED half a routing proof: ' || d::text;
      exception when check_violation then null;
      end;
      raise exception using errcode = 'ZZ054', message = 'undo';
    exception
      when sqlstate 'ZZ054' then null;
      when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
    end;
    exit when v = 'FAIL';
  end loop;
  insert into v0054 values (5, v, why);
end $$;

-- ══ CASE 6 — the new client cannot be its own "existing client" ═══════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    perform pg_temp.f0054_fixtures();
    begin
      insert into public.onboarding_records (client_id, step, happened_on, recorded_by, detail)
      values ('00000000-0000-0000-0000-000000054001', 'routing_proved', '2026-09-22', 'proof 0054',
              '{"new_client_answered":true,"existing_client_answered":true,"existing_client_id":"00000000-0000-0000-0000-000000054001"}');
      v := 'FAIL'; why := 'ACCEPTED a routing proof whose other half is the same client';
    exception when check_violation then v := 'PASS'; why := 'refused: the other half must be ANOTHER client';
    end;
    raise exception using errcode = 'ZZ054', message = 'undo';
  exception
    when sqlstate 'ZZ054' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0054 values (6, v, why);
end $$;

-- ══ CASE 7 — the other half must name a client that exists ═════════════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    perform pg_temp.f0054_fixtures();
    begin
      insert into public.onboarding_records (client_id, step, happened_on, recorded_by, detail)
      values ('00000000-0000-0000-0000-000000054001', 'routing_proved', '2026-09-22', 'proof 0054',
              '{"new_client_answered":true,"existing_client_answered":true,"existing_client_id":"00000000-0000-0000-0000-000000054999"}');
      v := 'FAIL'; why := 'ACCEPTED a routing proof naming a client that does not exist';
    exception when foreign_key_violation then v := 'PASS'; why := 'refused by the insert rule (23503)';
    end;
    raise exception using errcode = 'ZZ054', message = 'undo';
  exception
    when sqlstate 'ZZ054' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0054 values (7, v, why);
end $$;

-- ══ CASE 8 — append-only: UPDATE and DELETE are refused ════════════════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; rid uuid; upd boolean := false; del boolean := false;
begin
  begin
    perform pg_temp.f0054_fixtures();
    insert into public.onboarding_records (client_id, step, happened_on, recorded_by, detail)
    values ('00000000-0000-0000-0000-000000054001', 'ai_disclosure_told', '2026-09-22', 'proof 0054', '{"told":"owner"}') returning id into rid;
    begin update public.onboarding_records set happened_on = '2026-09-01' where id = rid; exception when raise_exception then upd := true; end;
    begin delete from public.onboarding_records where id = rid; exception when raise_exception then del := true; end;
    if upd and del then v := 'PASS'; why := 'UPDATE and DELETE both refused by the append-only trigger';
    else v := 'FAIL'; why := format('update refused=%s, delete refused=%s', upd, del); end if;
    raise exception using errcode = 'ZZ054', message = 'undo';
  exception
    when sqlstate 'ZZ054' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0054 values (8, v, why);
end $$;

-- ══ CASE 9 — a correction supersedes; the view shows only the correction; a
--             correction of ANOTHER step is refused ════════════════════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; r1 uuid; r2 uuid; shown uuid[]; other_refused boolean := false;
begin
  begin
    perform pg_temp.f0054_fixtures();
    insert into public.onboarding_records (client_id, step, happened_on, recorded_by, detail)
    values ('00000000-0000-0000-0000-000000054001', 'ai_disclosure_told', '2026-09-20', 'proof 0054', '{"told":"owner"}') returning id into r1;
    insert into public.onboarding_records (client_id, step, happened_on, recorded_by, detail, supersedes_id)
    values ('00000000-0000-0000-0000-000000054001', 'ai_disclosure_told', '2026-09-21', 'proof 0054', '{"told":"owner, corrected date"}', r1) returning id into r2;
    select array_agg(id) into shown from public.onboarding_records_current where client_id = '00000000-0000-0000-0000-000000054001';
    begin
      insert into public.onboarding_records (client_id, step, happened_on, recorded_by, detail, supersedes_id)
      values ('00000000-0000-0000-0000-000000054001', 'routing_proved', '2026-09-21', 'proof 0054',
              '{"new_client_answered":true,"existing_client_answered":true,"existing_client_id":"00000000-0000-0000-0000-000000054002"}', r2);
    exception when check_violation then other_refused := true;
    end;
    if shown = array[r2] and other_refused then v := 'PASS'; why := 'the view shows only the correction; superseding another step is refused';
    else v := 'FAIL'; why := format('view shows %s (expected only %s); other-step correction refused=%s', shown, r2, other_refused); end if;
    raise exception using errcode = 'ZZ054', message = 'undo';
  exception
    when sqlstate 'ZZ054' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0054 values (9, v, why);
end $$;

-- ══ CASE 10 — RESTRICT: a client with a record cannot be deleted ═══════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    perform pg_temp.f0054_fixtures();
    insert into public.onboarding_records (client_id, step, happened_on, recorded_by, detail)
    values ('00000000-0000-0000-0000-000000054001', 'ai_disclosure_told', '2026-09-22', 'proof 0054', '{"told":"owner"}');
    begin
      delete from public.clients where id = '00000000-0000-0000-0000-000000054001';
      v := 'FAIL'; why := 'DELETED a client that has an onboarding record';
    exception when restrict_violation or foreign_key_violation then v := 'PASS'; why := 'refused by the RESTRICT foreign key (' || sqlstate || ')';
    end;
    raise exception using errcode = 'ZZ054', message = 'undo';
  exception
    when sqlstate 'ZZ054' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0054 values (10, v, why);
end $$;

-- ══ 🔴 CASE 11 — ONE correction per record (the 0050 lesson), chains allowed ═
-- Two corrections of the same record would leave BOTH uncorrected, and a client
-- with two "current" disclosure records. The second is refused by the partial
-- unique index; a correction of the correction is still a correction.
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; r1 uuid; r2 uuid; r4 uuid;
        refused boolean := false; idx text; chained boolean := false; shown uuid[];
begin
  begin
    perform pg_temp.f0054_fixtures();
    insert into public.onboarding_records (client_id, step, happened_on, recorded_by, detail)
    values ('00000000-0000-0000-0000-000000054001', 'ai_disclosure_told', '2026-09-20', 'proof 0054', '{"told":"owner"}') returning id into r1;
    insert into public.onboarding_records (client_id, step, happened_on, recorded_by, detail, supersedes_id)
    values ('00000000-0000-0000-0000-000000054001', 'ai_disclosure_told', '2026-09-21', 'proof 0054', '{"told":"owner, first correction"}', r1) returning id into r2;
    begin
      insert into public.onboarding_records (client_id, step, happened_on, recorded_by, detail, supersedes_id)
      values ('00000000-0000-0000-0000-000000054001', 'ai_disclosure_told', '2026-09-21', 'proof 0054', '{"told":"owner, second correction of the SAME record"}', r1);
    exception when unique_violation then
      refused := true;
      get stacked diagnostics idx = constraint_name;
    end;
    begin
      insert into public.onboarding_records (client_id, step, happened_on, recorded_by, detail, supersedes_id)
      values ('00000000-0000-0000-0000-000000054001', 'ai_disclosure_told', '2026-09-22', 'proof 0054', '{"told":"owner, correction of the correction"}', r2) returning id into r4;
      chained := true;
    exception when others then chained := false;
    end;
    select array_agg(id) into shown from public.onboarding_records_current where client_id = '00000000-0000-0000-0000-000000054001';
    if refused and idx = 'onboarding_records_one_correction_each' and chained and shown = array[r4] then
      v := 'PASS'; why := 'a second correction of the same record is refused (23505, onboarding_records_one_correction_each); a chain is permitted; the view shows one record';
    else
      v := 'FAIL'; why := format('second correction refused=%s (by %s); chain permitted=%s; view shows %s (expected only %s)', refused, coalesce(idx, 'nothing'), chained, shown, r4);
    end if;
    raise exception using errcode = 'ZZ054', message = 'undo';
  exception
    when sqlstate 'ZZ054' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0054 values (11, v, why);
end $$;

-- ══ CASE 12 — no fixture survived ══════════════════════════════════════════
do $$
declare n int;
begin
  select count(*) into n from public.clients where name like 'proof 0054%';
  if to_regclass('public.onboarding_records') is not null then
    execute 'select $1 + count(*) from public.onboarding_records where recorded_by = ''proof 0054''' into n using n;
  end if;
  insert into v0054 values (12, case when n = 0 then 'PASS' else 'FAIL' end,
    case when n = 0 then 'no 0054 fixture row exists'
         else n || ' fixture row(s) SURVIVED in production; tell Manuel before touching them' end);
exception when others then
  insert into v0054 values (12, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ THE VERDICT — the only output that matters ════════════════════════════
select c.n as "case", c.what,
       coalesce(r.verdict, 'FAIL') as verdict,
       coalesce(r.reason, 'DID NOT RUN — a missing row is a failure') as reason,
       c.before_0054
  from (values
    (1,  'grants, RLS, the view''s invoker rights',                     'FAIL'),
    (2,  'PERMITTED: a disclosure record naming who was told',          'FAIL'),
    (3,  'a disclosure record naming nobody is refused',                'FAIL'),
    (4,  '🔴 PERMITTED: a routing proof with both halves',              'FAIL'),
    (5,  '🔴 half a routing proof is refused, three ways',              'FAIL'),
    (6,  'the new client cannot be its own other half',                 'FAIL'),
    (7,  'the other half names a client that exists',                   'FAIL'),
    (8,  'append-only: UPDATE and DELETE refused',                      'FAIL'),
    (9,  'a correction supersedes; the view shows only it',             'FAIL'),
    (10, 'RESTRICT: a client with a record cannot be deleted',          'FAIL'),
    (11, '🔴 one correction per record; a chain is permitted',          'FAIL'),
    (12, 'no fixture survived',                                         'PASS')
  ) as c(n, what, before_0054)
  left join v0054 r using (n)
 order by c.n;
