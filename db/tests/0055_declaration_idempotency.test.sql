-- Proof for 0055. Run in the Supabase SQL editor WHOLE, after applying 0055.
-- Every case writes inside a block that raises ZZ055 to undo it, so nothing it
-- writes survives (case 10 checks). The verdict lives in a temp table, which the
-- undo does not touch.
--
-- Expected AFTER 0055: every row PASS.
-- Expected BEFORE 0055: 1-7 and 9 FAIL (no column), 8 and 10 PASS.

drop table if exists pg_temp.v0055;
create temp table v0055 (n int primary key, verdict text not null, reason text not null);

-- One fixture client; its three numbers are the contacts being declared.
create or replace function pg_temp.f0055_client() returns void language sql as $$
  insert into public.clients (id, name, whatsapp_number, rehearsal)
  values ('00000000-0000-0000-0000-000000055001', 'proof 0055', '+351900055001', true);
$$;

-- One act: the rows the screen writes, for the given id and numbers. ONE statement,
-- as the cockpit's insert is. plpgsql, not sql: a sql function checks its columns
-- when it is created, so before 0055 this file would stop here instead of
-- reaching its verdict rows.
create or replace function pg_temp.f0055_declare(decl uuid, phones text[]) returns void language plpgsql as $$
begin
  insert into public.consent_events (client_id, phone_e164, kind, occurred_at, segment, source, declared_by, evidence, declaration_id, note)
  select '00000000-0000-0000-0000-000000055001', p, 'declared', now(), 'C', 'agency_attestation', 'proof 0055 agency person',
         '{"recorded_by":"proof 0055"}'::jsonb, decl, 'proof 0055'
    from unnest(phones) as p;
end $$;

-- ══ CASE 1 — the shape: column, index, both CHECKs, grants, triggers ═══════
do $$
declare ok boolean;
begin
  ok := exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'consent_events'
                   and column_name = 'declaration_id' and data_type = 'uuid' and is_nullable = 'YES')
    and exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                 where c.relname = 'consent_events_one_row_per_declaration_and_contact'
                   and i.indrelid = 'public.consent_events'::regclass
                   and i.indisunique and i.indpred is not null
                   and pg_get_indexdef(i.indexrelid) like '%(declaration_id, phone_e164)%')
    and (select count(*) from pg_constraint where conrelid = 'public.consent_events'::regclass
          and conname in ('declaration_id_only_on_declarations', 'screen_declarations_carry_their_id')) = 2
    and has_table_privilege('service_role', 'public.consent_events', 'INSERT')
    and not has_table_privilege('service_role', 'public.consent_events', 'UPDATE')
    and not has_table_privilege('service_role', 'public.consent_events', 'DELETE')
    and (select count(*) from pg_trigger where tgrelid = 'public.consent_events'::regclass
          and tgname in ('consent_events_no_update', 'consent_events_no_truncate')) = 2;
  insert into v0055 values (1, case when ok then 'PASS' else 'FAIL' end,
    case when ok then 'declaration_id uuid nullable; the unique partial index on (declaration_id, phone_e164); both CHECKs; service_role INSERT without UPDATE/DELETE; both append-only triggers'
         else 'the column, the index, a CHECK, a grant or a trigger is not as 0055 states' end);
exception when others then
  insert into v0055 values (1, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ 🔴 CASE 2 — a first submit is recorded ══════════════════════════════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; n int;
begin
  begin
    perform pg_temp.f0055_client();
    perform pg_temp.f0055_declare('55555555-0000-0000-0000-000000000001', array['+351910055001', '+351910055002']);
    select count(*) into n from public.consent_events where declaration_id = '55555555-0000-0000-0000-000000000001';
    if n = 2 then v := 'PASS'; why := 'a declaration of two contacts is recorded as two rows carrying its id';
    else v := 'FAIL'; why := 'expected 2 rows for the act, found ' || n; end if;
    raise exception using errcode = 'ZZ055', message = 'undo';
  exception
    when sqlstate 'ZZ055' then null;
    when others then v := 'FAIL'; why := 'a valid first submit was REFUSED: ' || sqlerrm;
  end;
  insert into v0055 values (2, v, why);
end $$;

-- ══ 🔴 CASE 3 — the same form again is refused cleanly, by name ═════════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; n int; c text;
begin
  begin
    perform pg_temp.f0055_client();
    perform pg_temp.f0055_declare('55555555-0000-0000-0000-000000000001', array['+351910055001', '+351910055002']);
    begin
      perform pg_temp.f0055_declare('55555555-0000-0000-0000-000000000001', array['+351910055001', '+351910055002']);
      v := 'FAIL'; why := 'ACCEPTED the same form a second time: a second act nobody made';
    exception when unique_violation then
      get stacked diagnostics c = constraint_name;
      select count(*) into n from public.consent_events where declaration_id = '55555555-0000-0000-0000-000000000001';
      if c = 'consent_events_one_row_per_declaration_and_contact' and n = 2 then
        v := 'PASS'; why := 'refused 23505 by consent_events_one_row_per_declaration_and_contact; still 2 rows';
      else
        v := 'FAIL'; why := 'refused, but by "' || coalesce(c, '?') || '" with ' || n || ' rows for the act';
      end if;
    end;
    raise exception using errcode = 'ZZ055', message = 'undo';
  exception
    when sqlstate 'ZZ055' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0055 values (3, v, why);
end $$;

-- ══ 🔴 CASE 4 — a new form gets a new id, and is a new act ══════════════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; n int;
begin
  begin
    perform pg_temp.f0055_client();
    perform pg_temp.f0055_declare('55555555-0000-0000-0000-000000000001', array['+351910055001', '+351910055002']);
    perform pg_temp.f0055_declare('55555555-0000-0000-0000-000000000002', array['+351910055001', '+351910055002']);
    select count(*) into n from public.consent_events where client_id = '00000000-0000-0000-0000-000000055001';
    if n = 4 then v := 'PASS'; why := 'the same contacts declared again under a new id: a second act, recorded (4 rows)';
    else v := 'FAIL'; why := 'expected 4 rows, found ' || n; end if;
    raise exception using errcode = 'ZZ055', message = 'undo';
  exception
    when sqlstate 'ZZ055' then null;
    when others then v := 'FAIL'; why := 'a new form with a new id was REFUSED: ' || sqlerrm;
  end;
  insert into v0055 values (4, v, why);
end $$;

-- ══ 🔴 CASE 5 — a resubmission that also adds a contact is refused WHOLE ════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; n int; extra int;
begin
  begin
    perform pg_temp.f0055_client();
    perform pg_temp.f0055_declare('55555555-0000-0000-0000-000000000001', array['+351910055001', '+351910055002']);
    begin
      perform pg_temp.f0055_declare('55555555-0000-0000-0000-000000000001', array['+351910055002', '+351910055003']);
      v := 'FAIL'; why := 'ACCEPTED a resubmission under the same id';
    exception when unique_violation then
      select count(*) into n from public.consent_events where declaration_id = '55555555-0000-0000-0000-000000000001';
      select count(*) into extra from public.consent_events where phone_e164 = '+351910055003';
      if n = 2 and extra = 0 then v := 'PASS'; why := 'refused whole: still 2 rows, and the new contact was NOT half-recorded';
      else v := 'FAIL'; why := n || ' rows for the act and ' || extra || ' for the new contact: half-applied'; end if;
    end;
    raise exception using errcode = 'ZZ055', message = 'undo';
  exception
    when sqlstate 'ZZ055' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0055 values (5, v, why);
end $$;

-- ══ CASE 6 — a screen declaration without its id is refused ════════════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; c text;
begin
  begin
    perform pg_temp.f0055_client();
    begin
      perform pg_temp.f0055_declare(null, array['+351910055001']);
      v := 'FAIL'; why := 'ACCEPTED a screen declaration with no id: the idempotency can be bypassed';
    exception when check_violation then
      get stacked diagnostics c = constraint_name;
      if c = 'screen_declarations_carry_their_id' then v := 'PASS'; why := 'refused 23514 by screen_declarations_carry_their_id';
      else v := 'FAIL'; why := 'refused, but by "' || coalesce(c, '?') || '"'; end if;
    end;
    raise exception using errcode = 'ZZ055', message = 'undo';
  exception
    when sqlstate 'ZZ055' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0055 values (6, v, why);
end $$;

-- ══ CASE 7 — an id on anything but a declaration is refused ════════════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; c text;
begin
  begin
    perform pg_temp.f0055_client();
    begin
      insert into public.consent_events (client_id, phone_e164, kind, source, declaration_id, note)
      values ('00000000-0000-0000-0000-000000055001', '+351910055001', 'objection', 'whatsapp_reply',
              '55555555-0000-0000-0000-000000000009', 'proof 0055');
      v := 'FAIL'; why := 'ACCEPTED a declaration id on an objection';
    exception when check_violation then
      get stacked diagnostics c = constraint_name;
      if c = 'declaration_id_only_on_declarations' then v := 'PASS'; why := 'refused 23514 by declaration_id_only_on_declarations';
      else v := 'FAIL'; why := 'refused, but by "' || coalesce(c, '?') || '"'; end if;
    end;
    raise exception using errcode = 'ZZ055', message = 'undo';
  exception
    when sqlstate 'ZZ055' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0055 values (7, v, why);
end $$;

-- ══ 🔴 CASE 8 — PERMITTED: every other event still needs no id ═════════════
-- (An objection, and a close's party declared from closes-store.ts. The case
-- that must not be skipped: a CHECK one word too wide refuses the objection path.)
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    perform pg_temp.f0055_client();
    insert into public.consent_events (client_id, phone_e164, kind, source, note)
    values ('00000000-0000-0000-0000-000000055001', '+351910055001', 'objection', 'whatsapp_reply', 'proof 0055');
    insert into public.consent_events (client_id, phone_e164, kind, segment, source, occurred_at, declared_by, note)
    values ('00000000-0000-0000-0000-000000055001', '+351910055002', 'declared', 'A', 'close_report', now(), 'proof 0055 agency person', 'proof 0055');
    v := 'PASS'; why := 'an objection and a close''s party, both with no id, are accepted';
    raise exception using errcode = 'ZZ055', message = 'undo';
  exception
    when sqlstate 'ZZ055' then null;
    when others then v := 'FAIL'; why := 'an event that needs no id was REFUSED: ' || sqlerrm;
  end;
  insert into v0055 values (8, v, why);
end $$;

-- ══ CASE 9 — still append-only: a recorded declaration cannot be edited ════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    perform pg_temp.f0055_client();
    perform pg_temp.f0055_declare('55555555-0000-0000-0000-000000000001', array['+351910055001']);
    begin
      update public.consent_events set segment = 'A' where declaration_id = '55555555-0000-0000-0000-000000000001';
      v := 'FAIL'; why := 'an UPDATE of a recorded declaration was ACCEPTED';
    exception when others then v := 'PASS'; why := 'the UPDATE was refused: ' || sqlerrm;
    end;
    raise exception using errcode = 'ZZ055', message = 'undo';
  exception
    when sqlstate 'ZZ055' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0055 values (9, v, why);
end $$;

-- ══ CASE 10 — no fixture survived ══════════════════════════════════════════
do $$
declare n int;
begin
  select count(*) into n from public.clients where name = 'proof 0055';
  select n + count(*) into n from public.consent_events where note = 'proof 0055';
  insert into v0055 values (10, case when n = 0 then 'PASS' else 'FAIL' end,
    case when n = 0 then 'no 0055 fixture row exists'
         else n || ' fixture row(s) SURVIVED in production; tell Manuel before touching them' end);
exception when others then
  insert into v0055 values (10, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ THE VERDICT — the only output that matters ════════════════════════════
select c.n as "case", c.what,
       coalesce(r.verdict, 'FAIL') as verdict,
       coalesce(r.reason, 'DID NOT RUN — a missing row is a failure') as reason,
       c.before_0055
  from (values
    (1,  'the shape: column, index, CHECKs, grants, triggers',          'FAIL'),
    (2,  '🔴 a first submit is recorded',                               'FAIL'),
    (3,  '🔴 the same form again is refused cleanly, by name',          'FAIL'),
    (4,  '🔴 a new form gets a new id, and is a new act',               'FAIL'),
    (5,  '🔴 a resubmission adding a contact is refused whole',         'FAIL'),
    (6,  'a screen declaration without its id is refused',              'FAIL'),
    (7,  'an id on anything but a declaration is refused',              'FAIL'),
    (8,  '🔴 PERMITTED: every other event still needs no id',           'PASS'),
    (9,  'still append-only: a declaration cannot be edited',           'FAIL'),
    (10, 'no fixture survived',                                         'PASS')
  ) as c(n, what, before_0055)
  left join v0055 r using (n)
 order by c.n;
