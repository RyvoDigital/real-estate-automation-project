-- Proof for 0056. Run in the Supabase SQL editor WHOLE, after applying 0056.
-- Every case writes inside a block that raises ZZ056 to undo it, so nothing it
-- writes survives (case 10 checks). The verdict lives in a temp table, which the
-- undo does not touch.
--
-- Expected AFTER 0056: every row PASS.
-- Expected BEFORE 0056: 1-9 FAIL (no table, no function), 10 PASS.

drop table if exists pg_temp.v0056;
create temp table v0056 (n int primary key, verdict text not null, reason text not null);

-- Two fixture clients: one with a lead_nurture row whose config already holds a
-- key that is not ours (it must survive), one with no lead_nurture row at all.
create or replace function pg_temp.f0056_fixtures() returns void language plpgsql as $$
begin
  insert into public.clients (id, name, whatsapp_number, rehearsal) values
    ('00000000-0000-0000-0000-000000056001', 'proof 0056', '+351900056001', true),
    ('00000000-0000-0000-0000-000000056002', 'proof 0056 no nurture', '+351900056002', true);
  insert into public.client_automations (client_id, automation_id, enabled, config)
  select '00000000-0000-0000-0000-000000056001', id, false, '{"listing_ingest":{"kept":true}}'::jsonb
    from public.automations where key = 'lead_nurture';
end $$;

-- A sitting: the six thresholds (as deriveThresholds produces them) and the answers they came from.
create or replace function pg_temp.f0056_record(cal uuid, client uuid, answered text, recorder text, stretch numeric)
returns timestamptz language plpgsql as $$
begin
  return public.record_calibration(cal, client, answered, recorder,
    jsonb_build_object('budgetSaid', 2000000, 'budgetMost', 2000000 * (1 + stretch)),
    jsonb_build_object('budget_stretch', stretch, 'budget_stretch_with_evidence', 0.1, 'bedrooms_tolerance', 1,
                       'area_adjacency', '{}'::jsonb, 'min_score_strong', 0.8, 'min_score_possible', 0.6));
end $$;

-- ══ CASE 1 — the shape: RLS, grants, triggers, the function's grants, RESTRICT ═
do $$
declare ok boolean;
begin
  ok := (select relrowsecurity from pg_class where oid = 'public.calibration_records'::regclass)
    and has_table_privilege('service_role', 'public.calibration_records', 'INSERT')
    and has_table_privilege('service_role', 'public.calibration_records', 'SELECT')
    and not has_table_privilege('service_role', 'public.calibration_records', 'UPDATE')
    and not has_table_privilege('service_role', 'public.calibration_records', 'DELETE')
    and not has_table_privilege('anon', 'public.calibration_records', 'SELECT')
    and not has_table_privilege('authenticated', 'public.calibration_records', 'SELECT')
    and (select count(*) from pg_trigger where tgrelid = 'public.calibration_records'::regclass
          and tgname in ('calibration_records_no_update', 'calibration_records_no_truncate')) = 2
    and has_function_privilege('service_role', 'public.record_calibration(uuid, uuid, text, text, jsonb, jsonb)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.record_calibration(uuid, uuid, text, text, jsonb, jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.record_calibration(uuid, uuid, text, text, jsonb, jsonb)', 'EXECUTE')
    and exists (select 1 from pg_constraint where conrelid = 'public.calibration_records'::regclass
                 and contype = 'f' and confdeltype = 'r');
  insert into v0056 values (1, case when ok then 'PASS' else 'FAIL' end,
    case when ok then 'RLS on; service_role SELECT+INSERT only; both append-only triggers; record_calibration for service_role only; client_id RESTRICT'
         else 'RLS, a grant, a trigger, the function''s grants or the RESTRICT is not as 0056 states' end);
exception when others then
  insert into v0056 values (1, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ 🔴 CASE 2 — a sitting is recorded AND projected, and no other key is lost ═
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; at timestamptz; cfg jsonb; n int;
begin
  begin
    perform pg_temp.f0056_fixtures();
    at := pg_temp.f0056_record('56565656-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000056001', 'Marta Soares', 'proof 0056', 0.05);
    select count(*) into n from public.calibration_records where client_id = '00000000-0000-0000-0000-000000056001';
    select ca.config into cfg from public.client_automations ca join public.automations a on a.id = ca.automation_id
     where ca.client_id = '00000000-0000-0000-0000-000000056001' and a.key = 'lead_nurture';
    if n = 1 and (cfg ->> 'budget_stretch')::numeric = 0.05 and cfg ? 'min_score_possible'
       and cfg #>> '{calibration,answered_by}' = 'Marta Soares' and cfg #>> '{calibration,recorded_by}' = 'proof 0056'
       and (cfg #>> '{calibration,recorded_at}')::timestamptz = at
       and cfg #>> '{calibration,calibration_id}' = '56565656-0000-0000-0000-000000000001'
       and cfg #> '{listing_ingest,kept}' = 'true'::jsonb then
      v := 'PASS'; why := 'one record; the six thresholds, who answered, who recorded and when are in the config; listing_ingest survived';
    else
      v := 'FAIL'; why := 'records=' || n || ' config=' || left(cfg::text, 200);
    end if;
    raise exception using errcode = 'ZZ056', message = 'undo';
  exception
    when sqlstate 'ZZ056' then null;
    when others then v := 'FAIL'; why := 'a valid sitting was REFUSED: ' || sqlerrm;
  end;
  insert into v0056 values (2, v, why);
end $$;

-- ══ 🔴 CASE 3 — the same form again is refused cleanly, and touches nothing ═══
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; c text; n int; cfg jsonb;
begin
  begin
    perform pg_temp.f0056_fixtures();
    perform pg_temp.f0056_record('56565656-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000056001', 'Marta Soares', 'proof 0056', 0.05);
    begin
      -- the same id, with different numbers: it must change NOTHING
      perform pg_temp.f0056_record('56565656-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000056001', 'Marta Soares', 'proof 0056', 0.3);
      v := 'FAIL'; why := 'ACCEPTED the same form a second time';
    exception when unique_violation then
      get stacked diagnostics c = constraint_name;
      select count(*) into n from public.calibration_records where client_id = '00000000-0000-0000-0000-000000056001';
      select ca.config into cfg from public.client_automations ca join public.automations a on a.id = ca.automation_id
       where ca.client_id = '00000000-0000-0000-0000-000000056001' and a.key = 'lead_nurture';
      if c = 'calibration_records_pkey' and n = 1 and (cfg ->> 'budget_stretch')::numeric = 0.05 then
        v := 'PASS'; why := 'refused 23505 by calibration_records_pkey; still 1 record, and the config still holds the first sitting';
      else
        v := 'FAIL'; why := 'refused by "' || coalesce(c, '?') || '", records=' || n || ', budget_stretch=' || coalesce(cfg ->> 'budget_stretch', 'null');
      end if;
    end;
    raise exception using errcode = 'ZZ056', message = 'undo';
  exception
    when sqlstate 'ZZ056' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0056 values (3, v, why);
end $$;

-- ══ 🔴 CASE 4 — a second sitting is a new record, and the first is KEPT ══════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; n int; cfg jsonb; first_kept boolean;
begin
  begin
    perform pg_temp.f0056_fixtures();
    perform pg_temp.f0056_record('56565656-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000056001', 'Marta Soares', 'proof 0056', 0.05);
    perform pg_temp.f0056_record('56565656-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000056001', 'Rui Antunes', 'proof 0056', 0.1);
    select count(*) into n from public.calibration_records where client_id = '00000000-0000-0000-0000-000000056001';
    select exists (select 1 from public.calibration_records where id = '56565656-0000-0000-0000-000000000001'
                    and (thresholds ->> 'budget_stretch')::numeric = 0.05 and answered_by = 'Marta Soares') into first_kept;
    select ca.config into cfg from public.client_automations ca join public.automations a on a.id = ca.automation_id
     where ca.client_id = '00000000-0000-0000-0000-000000056001' and a.key = 'lead_nurture';
    if n = 2 and first_kept and (cfg ->> 'budget_stretch')::numeric = 0.1 and cfg #>> '{calibration,answered_by}' = 'Rui Antunes' then
      v := 'PASS'; why := 'two records, the first intact; the config holds the second sitting';
    else
      v := 'FAIL'; why := 'records=' || n || ' first_kept=' || first_kept || ' config=' || left(cfg::text, 160);
    end if;
    raise exception using errcode = 'ZZ056', message = 'undo';
  exception
    when sqlstate 'ZZ056' then null;
    when others then v := 'FAIL'; why := 'a second sitting was REFUSED: ' || sqlerrm;
  end;
  insert into v0056 values (4, v, why);
end $$;

-- ══ CASE 5 — the agency answers, we record: the same name twice is refused ═══
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; c text; n int; cfg jsonb;
begin
  begin
    perform pg_temp.f0056_fixtures();
    begin
      perform pg_temp.f0056_record('56565656-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000056001', ' Proof 0056 ', 'proof 0056', 0.05);
      v := 'FAIL'; why := 'ACCEPTED a calibration whose answerer is its recorder';
    exception when check_violation then
      get stacked diagnostics c = constraint_name;
      select count(*) into n from public.calibration_records where client_id = '00000000-0000-0000-0000-000000056001';
      select ca.config into cfg from public.client_automations ca join public.automations a on a.id = ca.automation_id
       where ca.client_id = '00000000-0000-0000-0000-000000056001' and a.key = 'lead_nurture';
      if c = 'calibration_agency_answers_we_record' and n = 0 and not (cfg ? 'budget_stretch') then
        v := 'PASS'; why := 'refused 23514 by calibration_agency_answers_we_record; no record, config untouched';
      else v := 'FAIL'; why := 'refused by "' || coalesce(c, '?') || '", records=' || n; end if;
    end;
    raise exception using errcode = 'ZZ056', message = 'undo';
  exception
    when sqlstate 'ZZ056' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0056 values (5, v, why);
end $$;

-- ══ 🔴 CASE 6 — a sitting missing a threshold is refused, and the config is untouched ═
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; c text; cfg jsonb;
begin
  begin
    perform pg_temp.f0056_fixtures();
    begin
      perform public.record_calibration('56565656-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000056001',
        'Marta Soares', 'proof 0056', '{}'::jsonb, '{"budget_stretch":0.05}'::jsonb);
      v := 'FAIL'; why := 'ACCEPTED a sitting with one threshold of six';
    exception when check_violation then
      get stacked diagnostics c = constraint_name;
      select ca.config into cfg from public.client_automations ca join public.automations a on a.id = ca.automation_id
       where ca.client_id = '00000000-0000-0000-0000-000000056001' and a.key = 'lead_nurture';
      if c = 'calibration_has_all_six_thresholds' and not (cfg ? 'budget_stretch') then
        v := 'PASS'; why := 'refused 23514 by calibration_has_all_six_thresholds; the engine''s config was not half-written';
      else v := 'FAIL'; why := 'refused by "' || coalesce(c, '?') || '", config=' || left(cfg::text, 120); end if;
    end;
    raise exception using errcode = 'ZZ056', message = 'undo';
  exception
    when sqlstate 'ZZ056' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0056 values (6, v, why);
end $$;

-- ══ CASE 7 — a client with no lead_nurture row is refused by name ═══════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; n int;
begin
  begin
    perform pg_temp.f0056_fixtures();
    begin
      perform pg_temp.f0056_record('56565656-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000056002', 'Marta Soares', 'proof 0056', 0.05);
      v := 'FAIL'; why := 'ACCEPTED a calibration for a client with nothing to calibrate';
    exception when sqlstate 'P0002' then
      select count(*) into n from public.calibration_records where client_id = '00000000-0000-0000-0000-000000056002';
      if n = 0 and sqlerrm like '%no lead_nurture automation row%' then v := 'PASS'; why := 'refused P0002, naming the missing row; nothing recorded';
      else v := 'FAIL'; why := 'refused, but records=' || n || ': ' || sqlerrm; end if;
    end;
    raise exception using errcode = 'ZZ056', message = 'undo';
  exception
    when sqlstate 'ZZ056' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0056 values (7, v, why);
end $$;

-- ══ CASE 8 — append-only: a recorded sitting cannot be edited or deleted ════
do $$
declare v text := 'PASS'; why text := 'UPDATE and DELETE were both refused';
begin
  begin
    perform pg_temp.f0056_fixtures();
    perform pg_temp.f0056_record('56565656-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000056001', 'Marta Soares', 'proof 0056', 0.05);
    begin
      update public.calibration_records set answered_by = 'someone else' where id = '56565656-0000-0000-0000-000000000001';
      v := 'FAIL'; why := 'an UPDATE of a recorded sitting was ACCEPTED';
    exception when others then null;
    end;
    begin
      delete from public.calibration_records where id = '56565656-0000-0000-0000-000000000001';
      v := 'FAIL'; why := 'a DELETE of a recorded sitting was ACCEPTED';
    exception when others then null;
    end;
    raise exception using errcode = 'ZZ056', message = 'undo';
  exception
    when sqlstate 'ZZ056' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0056 values (8, v, why);
end $$;

-- ══ CASE 9 — RESTRICT: a client with a calibration cannot be deleted ════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    perform pg_temp.f0056_fixtures();
    perform pg_temp.f0056_record('56565656-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000056001', 'Marta Soares', 'proof 0056', 0.05);
    begin
      delete from public.clients where id = '00000000-0000-0000-0000-000000056001';
      v := 'FAIL'; why := 'a client with a calibration was DELETED, and its calibration with it';
    exception when sqlstate '23503' or sqlstate '23001' then
      v := 'PASS'; why := 'refused (' || sqlstate || '): what an agency said outlives any attempt to delete it';
    end;
    raise exception using errcode = 'ZZ056', message = 'undo';
  exception
    when sqlstate 'ZZ056' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0056 values (9, v, why);
end $$;

-- ══ CASE 10 — no fixture survived ══════════════════════════════════════════
do $$
declare n int;
begin
  select count(*) into n from public.clients where name like 'proof 0056%';
  if to_regclass('public.calibration_records') is not null then
    execute 'select $1 + count(*) from public.calibration_records where recorded_by = ''proof 0056''' into n using n;
  end if;
  insert into v0056 values (10, case when n = 0 then 'PASS' else 'FAIL' end,
    case when n = 0 then 'no 0056 fixture row exists'
         else n || ' fixture row(s) SURVIVED in production; tell Manuel before touching them' end);
exception when others then
  insert into v0056 values (10, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ THE VERDICT — the only output that matters ════════════════════════════
select c.n as "case", c.what,
       coalesce(r.verdict, 'FAIL') as verdict,
       coalesce(r.reason, 'DID NOT RUN — a missing row is a failure') as reason,
       c.before_0056
  from (values
    (1,  'the shape: RLS, grants, triggers, function grants, RESTRICT',  'FAIL'),
    (2,  '🔴 recorded AND projected; no other config key lost',          'FAIL'),
    (3,  '🔴 the same form again: refused cleanly, nothing touched',     'FAIL'),
    (4,  '🔴 a second sitting is new; the first is kept',                'FAIL'),
    (5,  'the agency answers, we record',                                'FAIL'),
    (6,  '🔴 a missing threshold: refused, config untouched',            'FAIL'),
    (7,  'no lead_nurture row: refused by name',                         'FAIL'),
    (8,  'append-only: UPDATE and DELETE refused',                       'FAIL'),
    (9,  'RESTRICT: a calibrated client cannot be deleted',              'FAIL'),
    (10, 'no fixture survived',                                          'PASS')
  ) as c(n, what, before_0056)
  left join v0056 r using (n)
 order by c.n;
