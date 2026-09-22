-- Proof for 0057. Run in the Supabase SQL editor WHOLE, after applying 0057.
-- Every case writes inside a block that raises ZZ057 to undo it, so nothing it
-- writes survives (case 15 checks). The verdict lives in a temp table, which the
-- undo does not touch.
--
-- Expected AFTER 0057: every row PASS.
-- Expected BEFORE 0057: 1-14 FAIL (no table, no functions), 15 PASS.

drop table if exists pg_temp.v0057;
create temp table v0057 (n int primary key, verdict text not null, reason text not null);

-- Two agencies. A has a listing and two contacts; B has one contact. A's second
-- contact already has a COMPUTED match to the listing (the engine found them).
create or replace function pg_temp.f0057_fixtures() returns void language plpgsql as $$
begin
  insert into public.clients (id, name, whatsapp_number, rehearsal) values
    ('00000000-0000-0000-0000-000000057001', 'proof 0057 A', '+351900057001', true),
    ('00000000-0000-0000-0000-000000057002', 'proof 0057 B', '+351900057002', true);
  insert into public.listings (id, client_id, status) values
    ('57575757-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-000000057001', 'available');
  insert into public.leads (id, client_id) values
    ('57575757-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-000000057001'),
    ('57575757-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-000000057001'),
    ('57575757-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-000000057002');
  insert into public.listing_matches (id, client_id, listing_id, lead_id, origin, score, strength, filter_would_find, reasoning, listing_status_at_match)
  values ('57575757-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000057001', '57575757-0000-0000-0000-00000000a001',
          '57575757-0000-0000-0000-00000000b002', 'computed', 0.9, 'strong', true, '{"reasons":[]}'::jsonb, 'available');
end $$;

create or replace function pg_temp.f0057_exempt(ex uuid, declared text, recorder text) returns timestamptz language plpgsql as $$
begin
  return public.record_exemption(ex, '57575757-0000-0000-0000-00000000a001', 'pt_energy_class', declared, recorder, 'Edifício anterior a 1951, sem obras');
end $$;

create or replace function pg_temp.f0057_pick(m uuid, lead uuid, chooser text, reqs jsonb) returns text language plpgsql as $$
begin
  return public.record_agent_pick(m, '57575757-0000-0000-0000-00000000a001', lead, chooser, 'proof 0057',
                                  'Procura T2 em Cascais', coalesce(reqs, '[]'::jsonb));
end $$;

-- ══ CASE 1 — the shape: RLS, grants, triggers, both functions' grants ══════
do $$
declare ok boolean;
begin
  ok := (select relrowsecurity from pg_class where oid = 'public.exemption_records'::regclass)
    and has_table_privilege('service_role', 'public.exemption_records', 'INSERT')
    and has_table_privilege('service_role', 'public.exemption_records', 'SELECT')
    and not has_table_privilege('service_role', 'public.exemption_records', 'UPDATE')
    and not has_table_privilege('service_role', 'public.exemption_records', 'DELETE')
    and not has_table_privilege('anon', 'public.exemption_records', 'SELECT')
    and (select count(*) from pg_trigger where tgrelid = 'public.exemption_records'::regclass
          and tgname in ('exemption_records_no_update', 'exemption_records_no_truncate')) = 2
    and has_function_privilege('service_role', 'public.record_exemption(uuid, uuid, text, text, text, text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.record_exemption(uuid, uuid, text, text, text, text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.record_exemption(uuid, uuid, text, text, text, text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.record_agent_pick(uuid, uuid, uuid, text, text, text, jsonb)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.record_agent_pick(uuid, uuid, uuid, text, text, text, jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.record_agent_pick(uuid, uuid, uuid, text, text, text, jsonb)', 'EXECUTE');
  insert into v0057 values (1, case when ok then 'PASS' else 'FAIL' end,
    case when ok then 'exemption_records: RLS, SELECT+INSERT only, both triggers; both functions service_role only'
         else 'a grant, RLS, a trigger or a function''s grants is not as 0057 states' end);
exception when others then
  insert into v0057 values (1, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ 🔴 CASE 2 — an exemption: the act, the current value and the event, together ═
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; nrec int; fact jsonb; nev int;
begin
  begin
    perform pg_temp.f0057_fixtures();
    perform pg_temp.f0057_exempt('57575757-0000-0000-0000-00000000e001', 'Marta Soares', 'proof 0057');
    select count(*) into nrec from public.exemption_records where listing_id = '57575757-0000-0000-0000-00000000a001';
    select exemption into fact from public.listing_facts where listing_id = '57575757-0000-0000-0000-00000000a001' and requirement_id = 'pt_energy_class';
    select count(*) into nev from public.events where type = 'listing.exemption_declared' and data ->> 'exemption_id' = '57575757-0000-0000-0000-00000000e001';
    if nrec = 1 and fact ->> 'exemption_id' = '57575757-0000-0000-0000-00000000e001' and fact ->> 'declared_by' = 'Marta Soares' and nev = 1 then
      v := 'PASS'; why := 'one record, the current value carrying its id, one event';
    else v := 'FAIL'; why := 'records=' || nrec || ' events=' || nev || ' fact=' || coalesce(fact::text, 'null'); end if;
    raise exception using errcode = 'ZZ057', message = 'undo';
  exception
    when sqlstate 'ZZ057' then null;
    when others then v := 'FAIL'; why := 'a valid exemption was REFUSED: ' || sqlerrm;
  end;
  insert into v0057 values (2, v, why);
end $$;

-- ══ 🔴 CASE 3 — the same exemption form again: refused cleanly, nothing added ═
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; c text; nrec int; nev int;
begin
  begin
    perform pg_temp.f0057_fixtures();
    perform pg_temp.f0057_exempt('57575757-0000-0000-0000-00000000e001', 'Marta Soares', 'proof 0057');
    begin
      perform pg_temp.f0057_exempt('57575757-0000-0000-0000-00000000e001', 'Marta Soares', 'proof 0057');
      v := 'FAIL'; why := 'ACCEPTED the same exemption form twice';
    exception when unique_violation then
      get stacked diagnostics c = constraint_name;
      select count(*) into nrec from public.exemption_records where listing_id = '57575757-0000-0000-0000-00000000a001';
      select count(*) into nev from public.events where type = 'listing.exemption_declared' and data ->> 'listing_id' = '57575757-0000-0000-0000-00000000a001';
      if c = 'exemption_records_pkey' and nrec = 1 and nev = 1 then v := 'PASS'; why := 'refused 23505 by exemption_records_pkey; still 1 record and 1 event';
      else v := 'FAIL'; why := 'refused by "' || coalesce(c, '?') || '", records=' || nrec || ', events=' || nev; end if;
    end;
    raise exception using errcode = 'ZZ057', message = 'undo';
  exception
    when sqlstate 'ZZ057' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0057 values (3, v, why);
end $$;

-- ══ 🔴 CASE 4 — an exemption over an existing RATING is refused, and nothing is written ═
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; nrec int; vals jsonb; nev int;
begin
  begin
    perform pg_temp.f0057_fixtures();
    insert into public.listing_facts (client_id, listing_id, requirement_id, values, valid_until, source)
    values ('00000000-0000-0000-0000-000000057001', '57575757-0000-0000-0000-00000000a001', 'pt_energy_class', '{"class":"C"}'::jsonb, '2030-01-01', 'typed');
    begin
      perform pg_temp.f0057_exempt('57575757-0000-0000-0000-00000000e002', 'Marta Soares', 'proof 0057');
      v := 'FAIL'; why := 'ACCEPTED an exemption over an existing rating';
    exception when sqlstate 'RY001' then
      select count(*) into nrec from public.exemption_records where listing_id = '57575757-0000-0000-0000-00000000a001';
      select values into vals from public.listing_facts where listing_id = '57575757-0000-0000-0000-00000000a001' and requirement_id = 'pt_energy_class';
      select count(*) into nev from public.events where type = 'listing.exemption_declared' and data ->> 'listing_id' = '57575757-0000-0000-0000-00000000a001';
      if nrec = 0 and vals = '{"class":"C"}'::jsonb and nev = 0 then v := 'PASS'; why := 'refused RY001; no record, the rating intact, no event';
      else v := 'FAIL'; why := 'refused, but records=' || nrec || ' values=' || coalesce(vals::text, 'null') || ' events=' || nev; end if;
    end;
    raise exception using errcode = 'ZZ057', message = 'undo';
  exception
    when sqlstate 'ZZ057' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0057 values (4, v, why);
end $$;

-- ══ CASE 5 — the agency declares, we record: the same name twice is refused ═
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; c text;
begin
  begin
    perform pg_temp.f0057_fixtures();
    begin
      perform pg_temp.f0057_exempt('57575757-0000-0000-0000-00000000e003', ' PROOF 0057 ', 'proof 0057');
      v := 'FAIL'; why := 'ACCEPTED an exemption declared by its recorder';
    exception when check_violation then
      get stacked diagnostics c = constraint_name;
      if c = 'exemption_agency_declares_we_record' then v := 'PASS'; why := 'refused 23514 by exemption_agency_declares_we_record';
      else v := 'FAIL'; why := 'refused, but by "' || coalesce(c, '?') || '"'; end if;
    end;
    raise exception using errcode = 'ZZ057', message = 'undo';
  exception
    when sqlstate 'ZZ057' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0057 values (5, v, why);
end $$;

-- ══ CASE 6 — a NEW exemption over an old one: both acts kept, the newer in force ═
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; nrec int; fact jsonb;
begin
  begin
    perform pg_temp.f0057_fixtures();
    perform pg_temp.f0057_exempt('57575757-0000-0000-0000-00000000e001', 'Marta Soares', 'proof 0057');
    perform pg_temp.f0057_exempt('57575757-0000-0000-0000-00000000e004', 'Rui Antunes', 'proof 0057');
    select count(*) into nrec from public.exemption_records where listing_id = '57575757-0000-0000-0000-00000000a001';
    select exemption into fact from public.listing_facts where listing_id = '57575757-0000-0000-0000-00000000a001' and requirement_id = 'pt_energy_class';
    if nrec = 2 and fact ->> 'exemption_id' = '57575757-0000-0000-0000-00000000e004' and fact ->> 'declared_by' = 'Rui Antunes' then
      v := 'PASS'; why := 'two acts on record; the current value is the second';
    else v := 'FAIL'; why := 'records=' || nrec || ' fact=' || coalesce(fact::text, 'null'); end if;
    raise exception using errcode = 'ZZ057', message = 'undo';
  exception
    when sqlstate 'ZZ057' then null;
    when others then v := 'FAIL'; why := 'a second exemption was REFUSED: ' || sqlerrm;
  end;
  insert into v0057 values (6, v, why);
end $$;

-- ══ CASE 7 — append-only: an exemption act cannot be edited or deleted ═════
do $$
declare v text := 'PASS'; why text := 'UPDATE and DELETE were both refused';
begin
  begin
    perform pg_temp.f0057_fixtures();
    perform pg_temp.f0057_exempt('57575757-0000-0000-0000-00000000e001', 'Marta Soares', 'proof 0057');
    begin
      update public.exemption_records set basis = 'something else' where id = '57575757-0000-0000-0000-00000000e001';
      v := 'FAIL'; why := 'an UPDATE of an exemption act was ACCEPTED';
    exception when others then null;
    end;
    begin
      delete from public.exemption_records where id = '57575757-0000-0000-0000-00000000e001';
      v := 'FAIL'; why := 'a DELETE of an exemption act was ACCEPTED';
    exception when others then null;
    end;
    raise exception using errcode = 'ZZ057', message = 'undo';
  exception
    when sqlstate 'ZZ057' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0057 values (7, v, why);
end $$;

-- ══ 🔴 CASE 8 — a pick: the match, the requirements and the event, together ═
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; r text; m record; nreq int; nev int;
begin
  begin
    perform pg_temp.f0057_fixtures();
    r := pg_temp.f0057_pick('57575757-0000-0000-0000-00000000d001', '57575757-0000-0000-0000-00000000b001', 'Marta Soares',
      '[{"kind":"area","value":{"area":"Cascais"},"strength":"preference","why":"the agent said Cascais","superseded_by":null}]'::jsonb);
    select origin, chosen_by, score into m from public.listing_matches where id = '57575757-0000-0000-0000-00000000d001';
    select count(*) into nreq from public.lead_requirements where lead_id = '57575757-0000-0000-0000-00000000b001' and source = 'agent' and authored_by = 'Marta Soares';
    select count(*) into nev from public.events where type = 'listing.chosen_by_agent' and data ->> 'match_id' = '57575757-0000-0000-0000-00000000d001';
    if r = 'recorded' and m.origin = 'agent' and m.chosen_by = 'Marta Soares' and m.score is null and nreq = 1 and nev = 1 then
      v := 'PASS'; why := 'the agent''s match (no score), one requirement in their name, one event';
    else v := 'FAIL'; why := 'result=' || coalesce(r, 'null') || ' requirements=' || nreq || ' events=' || nev; end if;
    raise exception using errcode = 'ZZ057', message = 'undo';
  exception
    when sqlstate 'ZZ057' then null;
    when others then v := 'FAIL'; why := 'a valid pick was REFUSED: ' || sqlerrm;
  end;
  insert into v0057 values (8, v, why);
end $$;

-- ══ 🔴 CASE 9 — picking a contact the ENGINE already matched: the computed row is superseded, not refused ═
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; r text; cur int; sup uuid; old_sup timestamptz;
begin
  begin
    perform pg_temp.f0057_fixtures();
    r := pg_temp.f0057_pick('57575757-0000-0000-0000-00000000d002', '57575757-0000-0000-0000-00000000b002', 'Marta Soares', null);
    select count(*) into cur from public.listing_matches
     where listing_id = '57575757-0000-0000-0000-00000000a001' and lead_id = '57575757-0000-0000-0000-00000000b002' and superseded_at is null;
    select supersedes_id into sup from public.listing_matches where id = '57575757-0000-0000-0000-00000000d002';
    select superseded_at into old_sup from public.listing_matches where id = '57575757-0000-0000-0000-00000000c001';
    if r = 'superseded_computed' and cur = 1 and sup = '57575757-0000-0000-0000-00000000c001' and old_sup is not null then
      v := 'PASS'; why := 'the computed match superseded, the pick its successor, one current row: engine → agent';
    else v := 'FAIL'; why := 'result=' || coalesce(r, 'null') || ' current=' || cur; end if;
    raise exception using errcode = 'ZZ057', message = 'undo';
  exception
    when sqlstate 'ZZ057' then null;
    when others then v := 'FAIL'; why := 'picking an engine-matched contact was REFUSED: ' || sqlerrm;
  end;
  insert into v0057 values (9, v, why);
end $$;

-- ══ 🔴 CASE 10 — a contact from ANOTHER agency is refused, and nothing is written ═
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; n int;
begin
  begin
    perform pg_temp.f0057_fixtures();
    begin
      perform pg_temp.f0057_pick('57575757-0000-0000-0000-00000000d003', '57575757-0000-0000-0000-00000000b003', 'Marta Soares', null);
      v := 'FAIL'; why := 'ACCEPTED a pick of another agency''s contact';
    exception when sqlstate 'RY002' then
      select count(*) into n from public.listing_matches where lead_id = '57575757-0000-0000-0000-00000000b003';
      if n = 0 then v := 'PASS'; why := 'refused RY002; no match written';
      else v := 'FAIL'; why := 'refused, but ' || n || ' match(es) exist'; end if;
    end;
    raise exception using errcode = 'ZZ057', message = 'undo';
  exception
    when sqlstate 'ZZ057' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0057 values (10, v, why);
end $$;

-- ══ CASE 11 — the same pick form again: refused cleanly, by the key ════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; msg text; n int;
begin
  begin
    perform pg_temp.f0057_fixtures();
    perform pg_temp.f0057_pick('57575757-0000-0000-0000-00000000d001', '57575757-0000-0000-0000-00000000b001', 'Marta Soares', null);
    begin
      perform pg_temp.f0057_pick('57575757-0000-0000-0000-00000000d001', '57575757-0000-0000-0000-00000000b001', 'Marta Soares', null);
      v := 'FAIL'; why := 'ACCEPTED the same pick form twice';
    exception when unique_violation then
      get stacked diagnostics msg = message_text;
      select count(*) into n from public.listing_matches where lead_id = '57575757-0000-0000-0000-00000000b001';
      if msg like '%listing_matches_pkey%' and n = 1 then v := 'PASS'; why := 'refused 23505 naming listing_matches_pkey; still one match';
      else v := 'FAIL'; why := 'refused with "' || msg || '", matches=' || n; end if;
    end;
    raise exception using errcode = 'ZZ057', message = 'undo';
  exception
    when sqlstate 'ZZ057' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0057 values (11, v, why);
end $$;

-- ══ CASE 12 — a NEW pick of a contact the agency already chose: refused, named ═
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; msg text;
begin
  begin
    perform pg_temp.f0057_fixtures();
    perform pg_temp.f0057_pick('57575757-0000-0000-0000-00000000d001', '57575757-0000-0000-0000-00000000b001', 'Marta Soares', null);
    begin
      perform pg_temp.f0057_pick('57575757-0000-0000-0000-00000000d004', '57575757-0000-0000-0000-00000000b001', 'Rui Antunes', null);
      v := 'FAIL'; why := 'ACCEPTED a second current pick of the same contact';
    exception when sqlstate 'RY003' then
      get stacked diagnostics msg = message_text;
      if msg like '%Marta Soares already chose%' then v := 'PASS'; why := 'refused RY003, naming who already chose them';
      else v := 'FAIL'; why := 'refused, but: ' || msg; end if;
    end;
    raise exception using errcode = 'ZZ057', message = 'undo';
  exception
    when sqlstate 'ZZ057' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0057 values (12, v, why);
end $$;

-- ══ 🔴 CASE 13 — ALL OR NOTHING: a requirement that cannot be written takes the whole pick back ═
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; nm int; nev int; old_sup timestamptz;
begin
  begin
    perform pg_temp.f0057_fixtures();
    begin
      perform pg_temp.f0057_pick('57575757-0000-0000-0000-00000000d005', '57575757-0000-0000-0000-00000000b002', 'Marta Soares',
        '[{"kind":"not_a_kind","value":{},"strength":"hard","why":"x","superseded_by":null}]'::jsonb);
      v := 'FAIL'; why := 'ACCEPTED a pick whose requirement is invalid';
    exception when check_violation then
      select count(*) into nm from public.listing_matches where id = '57575757-0000-0000-0000-00000000d005';
      select count(*) into nev from public.events where data ->> 'match_id' = '57575757-0000-0000-0000-00000000d005';
      select superseded_at into old_sup from public.listing_matches where id = '57575757-0000-0000-0000-00000000c001';
      if nm = 0 and nev = 0 and old_sup is null then v := 'PASS'; why := 'refused whole: no match, no event, and the engine''s match NOT superseded';
      else v := 'FAIL'; why := 'half-written: match=' || nm || ' event=' || nev || ' computed superseded=' || (old_sup is not null); end if;
    end;
    raise exception using errcode = 'ZZ057', message = 'undo';
  exception
    when sqlstate 'ZZ057' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0057 values (13, v, why);
end $$;

-- ══ CASE 14 — the agency chooses, we record: the same name twice is refused ═
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    perform pg_temp.f0057_fixtures();
    begin
      perform pg_temp.f0057_pick('57575757-0000-0000-0000-00000000d006', '57575757-0000-0000-0000-00000000b001', 'Proof 0057', null);
      v := 'FAIL'; why := 'ACCEPTED a pick whose chooser is its recorder';
    exception when check_violation then v := 'PASS'; why := 'refused 23514: the chooser and the recorder are the same name';
    end;
    raise exception using errcode = 'ZZ057', message = 'undo';
  exception
    when sqlstate 'ZZ057' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0057 values (14, v, why);
end $$;

-- ══ CASE 15 — no fixture survived ══════════════════════════════════════════
do $$
declare n int;
begin
  select count(*) into n from public.clients where name like 'proof 0057%';
  select n + count(*) into n from public.listings where id = '57575757-0000-0000-0000-00000000a001';
  if to_regclass('public.exemption_records') is not null then
    execute 'select $1 + count(*) from public.exemption_records where recorded_by = ''proof 0057''' into n using n;
  end if;
  insert into v0057 values (15, case when n = 0 then 'PASS' else 'FAIL' end,
    case when n = 0 then 'no 0057 fixture row exists'
         else n || ' fixture row(s) SURVIVED in production; tell Manuel before touching them' end);
exception when others then
  insert into v0057 values (15, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ THE VERDICT — the only output that matters ════════════════════════════
select c.n as "case", c.what,
       coalesce(r.verdict, 'FAIL') as verdict,
       coalesce(r.reason, 'DID NOT RUN — a missing row is a failure') as reason,
       c.before_0057
  from (values
    (1,  'the shape: RLS, grants, triggers, function grants',              'FAIL'),
    (2,  '🔴 exemption: the act, the current value and the event',        'FAIL'),
    (3,  '🔴 the same exemption form again: refused, nothing added',       'FAIL'),
    (4,  '🔴 exemption over a rating: refused, nothing written',           'FAIL'),
    (5,  'exemption: the agency declares, we record',                      'FAIL'),
    (6,  'a new exemption over an old: both kept, newer in force',         'FAIL'),
    (7,  'exemption acts are append-only',                                 'FAIL'),
    (8,  '🔴 pick: the match, the requirements and the event',             'FAIL'),
    (9,  '🔴 picking an engine-matched contact: superseded, not refused',  'FAIL'),
    (10, '🔴 another agency''s contact: refused, nothing written',         'FAIL'),
    (11, 'the same pick form again: refused by the key',                   'FAIL'),
    (12, 'a second pick of an already-chosen contact: refused, named',     'FAIL'),
    (13, '🔴 all or nothing: a bad requirement takes the whole pick back', 'FAIL'),
    (14, 'pick: the agency chooses, we record',                            'FAIL'),
    (15, 'no fixture survived',                                            'PASS')
  ) as c(n, what, before_0057)
  left join v0057 r using (n)
 order by c.n;
