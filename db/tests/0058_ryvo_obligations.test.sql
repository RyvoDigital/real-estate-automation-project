-- Proof for 0058. Run in the Supabase SQL editor WHOLE, after applying 0058.
-- Every case writes inside a block that raises ZZ058 to undo it, so nothing it
-- writes survives (case 14 checks). The verdict lives in a temp table, which the
-- undo does not touch.
--
-- Expected AFTER 0058: every row PASS.
-- Expected BEFORE 0058: 1-13 and 15 FAIL (no table), 14 PASS.

drop table if exists pg_temp.v0058;
create temp table v0058 (n int primary key, verdict text not null, reason text not null);

-- Insert one act. plpgsql, so before 0058 the file reaches its verdict rows instead of stopping here.
create or replace function pg_temp.f0058(id uuid, obligation uuid, sup uuid, act text, kind text, label text,
  expires date, no_exp boolean, brand text, last4 text, m int, y int, services text[], note text) returns void language plpgsql as $$
begin
  insert into public.ryvo_obligations (id, obligation_id, supersedes_id, act, kind, label, expires_on, no_expiry_stated,
    card_brand, card_last_four, card_exp_month, card_exp_year, services, source, note, recorded_by)
  values (id, obligation, sup, act, kind, label, expires, no_exp, brand, last4, m, y, services, 'manual', note, 'proof 0058');
end $$;

-- A case that must be REFUSED by a named constraint, and write nothing.
create or replace function pg_temp.f0058_refused(n int, what text, expect text, stmt text) returns void language plpgsql as $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; c text;
begin
  begin
    begin
      execute stmt;
      v := 'FAIL'; why := 'ACCEPTED ' || what;
    exception when check_violation or unique_violation or foreign_key_violation then
      get stacked diagnostics c = constraint_name;
      if c = expect or (expect = '(trigger)' and c is null) then v := 'PASS'; why := 'refused ' || what || coalesce(' by ' || nullif(c, ''), ' by the chain trigger');
      else v := 'FAIL'; why := 'refused ' || what || ', but by "' || coalesce(c, '?') || '", not ' || expect; end if;
    end;
    raise exception using errcode = 'ZZ058', message = 'undo';
  exception
    when sqlstate 'ZZ058' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0058 values (n, v, why);
end $$;

-- ══ CASE 1 — the shape ═════════════════════════════════════════════════════
do $$
declare ok boolean; opts text[];
begin
  select reloptions into opts from pg_class where oid = 'public.ryvo_obligations_current'::regclass;
  ok := (select relrowsecurity from pg_class where oid = 'public.ryvo_obligations'::regclass)
    and has_table_privilege('service_role', 'public.ryvo_obligations', 'INSERT')
    and has_table_privilege('service_role', 'public.ryvo_obligations', 'SELECT')
    and not has_table_privilege('service_role', 'public.ryvo_obligations', 'UPDATE')
    and not has_table_privilege('service_role', 'public.ryvo_obligations', 'DELETE')
    and not has_table_privilege('anon', 'public.ryvo_obligations', 'SELECT')
    and has_table_privilege('service_role', 'public.ryvo_obligations_current', 'SELECT')
    and 'security_invoker=true' = any (coalesce(opts, '{}'))
    and (select count(*) from pg_trigger where tgrelid = 'public.ryvo_obligations'::regclass
          and tgname in ('ryvo_obligations_no_update', 'ryvo_obligations_no_truncate', 'ryvo_obligations_chain')) = 3
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'health_runs'
                 and column_name = 'domain_expires_on' and data_type = 'date');
  insert into v0058 values (1, case when ok then 'PASS' else 'FAIL' end,
    case when ok then 'RLS on; SELECT+INSERT only; the view security_invoker; the three triggers; health_runs.domain_expires_on date'
         else 'a grant, RLS, the view, a trigger or the domain column is not as 0058 states' end);
exception when others then
  insert into v0058 values (1, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ CASE 2 — PERMITTED: each kind, entered properly ════════════════════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; n int;
begin
  begin
    perform pg_temp.f0058('58585858-0000-0000-0000-000000000001', '58585858-0000-0000-0000-000000000001', null, 'entered', 'certidao', 'Certidão permanente', '2027-03-01', false, null, null, null, null, null, null);
    perform pg_temp.f0058('58585858-0000-0000-0000-000000000002', '58585858-0000-0000-0000-000000000002', null, 'entered', 'procuracao', 'Procuração', null, true, null, null, null, null, null, 'O documento não indica validade');
    perform pg_temp.f0058('58585858-0000-0000-0000-000000000003', '58585858-0000-0000-0000-000000000003', null, 'entered', 'payment_card', 'Cartão da empresa', null, false, 'Visa', '4242', 11, 2027, array['Hetzner', 'Vercel', 'Supabase'], null);
    select count(*) into n from public.ryvo_obligations_current where recorded_by = 'proof 0058';
    if n = 3 then v := 'PASS'; why := 'a certidão with its date, a procuração saying "no expiry stated", a card as brand + last four + month/year + services';
    else v := 'FAIL'; why := 'expected 3 current rows, found ' || n; end if;
    raise exception using errcode = 'ZZ058', message = 'undo';
  exception
    when sqlstate 'ZZ058' then null;
    when others then v := 'FAIL'; why := 'a valid entry was REFUSED: ' || sqlerrm;
  end;
  insert into v0058 values (2, v, why);
end $$;

-- ══ CASE 3 — a certidão without its date ═══════════════════════════════════
select pg_temp.f0058_refused(3, 'a certidão with no date', 'certidao_has_its_date',
  $q$select pg_temp.f0058('58585858-0000-0000-0000-000000000011', '58585858-0000-0000-0000-000000000011', null, 'entered', 'certidao', 'Certidão', null, false, null, null, null, null, null, null)$q$);

-- ══ 🔴 CASE 4 — a procuração with neither a date nor "no expiry stated" (a blank) ═
select pg_temp.f0058_refused(4, 'a procuração left blank', 'procuracao_date_or_stated',
  $q$select pg_temp.f0058('58585858-0000-0000-0000-000000000012', '58585858-0000-0000-0000-000000000012', null, 'entered', 'procuracao', 'Procuração', null, false, null, null, null, null, null, null)$q$);

-- ══ CASE 5 — a procuração with a date AND "no expiry stated" ═══════════════
select pg_temp.f0058_refused(5, 'a procuração with both a date and no expiry', 'procuracao_date_or_stated',
  $q$select pg_temp.f0058('58585858-0000-0000-0000-000000000013', '58585858-0000-0000-0000-000000000013', null, 'entered', 'procuracao', 'Procuração', '2030-01-01', true, null, null, null, null, null, null)$q$);

-- ══ 🔴 CASE 6 — a FULL CARD NUMBER in the label, even spaced, is refused ════
select pg_temp.f0058_refused(6, 'a card number typed into the label', 'no_card_number_anywhere',
  $q$select pg_temp.f0058('58585858-0000-0000-0000-000000000014', '58585858-0000-0000-0000-000000000014', null, 'entered', 'payment_card', 'Visa 4242 4242 4242 4242', null, false, 'Visa', '4242', 11, 2027, array['Vercel'], null)$q$);

-- ══ 🔴 CASE 7 — a card number in the note ══════════════════════════════════
select pg_temp.f0058_refused(7, 'a card number in the note', 'no_card_number_anywhere',
  $q$select pg_temp.f0058('58585858-0000-0000-0000-000000000015', '58585858-0000-0000-0000-000000000015', null, 'entered', 'payment_card', 'Cartão', null, false, 'Visa', '4242', 11, 2027, array['Vercel'], 'número 4242-4242-4242-4242')$q$);

-- ══ 🔴 CASE 15 — PERMITTED: a DATE, a NIF and a phone in the note are not card numbers ═
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    perform pg_temp.f0058('58585858-0000-0000-0000-000000000061', '58585858-0000-0000-0000-000000000061', null, 'entered', 'certidao', 'Certidão 2027-03-01', '2027-03-01', false, null, null, null, null, null,
      'renovada a 2026-09-22; NIF 514 123 456; tel. +351 912 345 678');
    v := 'PASS'; why := 'a date (8 digits once its dashes go), a NIF and a phone are accepted: the guard is 13+ digits not written as a phone';
    raise exception using errcode = 'ZZ058', message = 'undo';
  exception
    when sqlstate 'ZZ058' then null;
    when others then v := 'FAIL'; why := 'an ordinary note was REFUSED as a card number: ' || sqlerrm;
  end;
  insert into v0058 values (15, v, why);
end $$;

-- ══ CASE 8 — "last four" that is not four digits ═══════════════════════════
select pg_temp.f0058_refused(8, 'a last-four of five digits', 'card_is_described',
  $q$select pg_temp.f0058('58585858-0000-0000-0000-000000000016', '58585858-0000-0000-0000-000000000016', null, 'entered', 'payment_card', 'Cartão', null, false, 'Visa', '42424', 11, 2027, array['Vercel'], null)$q$);

-- ══ CASE 9 — a card that names no service it pays for ══════════════════════
select pg_temp.f0058_refused(9, 'a card with no services', 'card_is_described',
  $q$select pg_temp.f0058('58585858-0000-0000-0000-000000000017', '58585858-0000-0000-0000-000000000017', null, 'entered', 'payment_card', 'Cartão', null, false, 'Visa', '4242', 11, 2027, array[]::text[], null)$q$);

-- ══ 🔴 CASE 10 — a chain: a check supersedes the entry, and only the check is current ═
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; cur text;
begin
  begin
    perform pg_temp.f0058('58585858-0000-0000-0000-000000000021', '58585858-0000-0000-0000-000000000021', null, 'entered', 'certidao', 'Certidão', '2027-03-01', false, null, null, null, null, null, null);
    perform pg_temp.f0058('58585858-0000-0000-0000-000000000022', '58585858-0000-0000-0000-000000000021', '58585858-0000-0000-0000-000000000021', 'checked', 'certidao', 'Certidão', '2027-03-01', false, null, null, null, null, null, null);
    select string_agg(act, ',') into cur from public.ryvo_obligations_current where obligation_id = '58585858-0000-0000-0000-000000000021';
    if cur = 'checked' then v := 'PASS'; why := 'the entry and the check both kept; only the check is current';
    else v := 'FAIL'; why := 'current acts: ' || coalesce(cur, 'none'); end if;
    raise exception using errcode = 'ZZ058', message = 'undo';
  exception
    when sqlstate 'ZZ058' then null;
    when others then v := 'FAIL'; why := 'a check was REFUSED: ' || sqlerrm;
  end;
  insert into v0058 values (10, v, why);
end $$;

-- ══ 🔴 CASE 11 — a chain cannot FORK: a second successor of one row ═══════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; c text;
begin
  begin
    perform pg_temp.f0058('58585858-0000-0000-0000-000000000031', '58585858-0000-0000-0000-000000000031', null, 'entered', 'certidao', 'Certidão', '2027-03-01', false, null, null, null, null, null, null);
    perform pg_temp.f0058('58585858-0000-0000-0000-000000000032', '58585858-0000-0000-0000-000000000031', '58585858-0000-0000-0000-000000000031', 'checked', 'certidao', 'Certidão', '2027-03-01', false, null, null, null, null, null, null);
    begin
      perform pg_temp.f0058('58585858-0000-0000-0000-000000000033', '58585858-0000-0000-0000-000000000031', '58585858-0000-0000-0000-000000000031', 'renewed', 'certidao', 'Certidão', '2028-03-01', false, null, null, null, null, null, null);
      v := 'FAIL'; why := 'ACCEPTED two successors of one row: the chain forked';
    exception when unique_violation then
      get stacked diagnostics c = constraint_name;
      if c = 'ryvo_obligations_one_successor_each' then v := 'PASS'; why := 'refused 23505 by ryvo_obligations_one_successor_each';
      else v := 'FAIL'; why := 'refused, but by "' || coalesce(c, '?') || '"'; end if;
    end;
    raise exception using errcode = 'ZZ058', message = 'undo';
  exception
    when sqlstate 'ZZ058' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0058 values (11, v, why);
end $$;

-- ══ CASE 12 — a later act cannot change the obligation's kind ═════════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict';
begin
  begin
    perform pg_temp.f0058('58585858-0000-0000-0000-000000000041', '58585858-0000-0000-0000-000000000041', null, 'entered', 'certidao', 'Certidão', '2027-03-01', false, null, null, null, null, null, null);
    begin
      perform pg_temp.f0058('58585858-0000-0000-0000-000000000042', '58585858-0000-0000-0000-000000000041', '58585858-0000-0000-0000-000000000041', 'corrected', 'procuracao', 'Procuração', null, true, null, null, null, null, null, null);
      v := 'FAIL'; why := 'ACCEPTED a correction that turned a certidão into a procuração';
    exception when check_violation then v := 'PASS'; why := 'refused 23514 by the chain trigger: same obligation, same kind';
    end;
    raise exception using errcode = 'ZZ058', message = 'undo';
  exception
    when sqlstate 'ZZ058' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0058 values (12, v, why);
end $$;

-- ══ CASE 13 — retired leaves the current view; append-only; the same form twice ═
do $$
declare v text := 'PASS'; why text := 'a retired chain is not current; UPDATE and DELETE refused; the same id twice refused by the pkey'; n int; c text;
begin
  begin
    perform pg_temp.f0058('58585858-0000-0000-0000-000000000051', '58585858-0000-0000-0000-000000000051', null, 'entered', 'payment_card', 'Cartão', null, false, 'Visa', '4242', 11, 2027, array['Vercel'], null);
    perform pg_temp.f0058('58585858-0000-0000-0000-000000000052', '58585858-0000-0000-0000-000000000051', '58585858-0000-0000-0000-000000000051', 'retired', 'payment_card', 'Cartão', null, false, null, null, null, null, null, 'cancelado');
    select count(*) into n from public.ryvo_obligations_current where obligation_id = '58585858-0000-0000-0000-000000000051';
    if n <> 0 then v := 'FAIL'; why := 'a retired card is still current'; end if;
    begin
      update public.ryvo_obligations set label = 'x' where id = '58585858-0000-0000-0000-000000000051';
      v := 'FAIL'; why := 'an UPDATE was ACCEPTED';
    exception when others then null;
    end;
    begin
      delete from public.ryvo_obligations where id = '58585858-0000-0000-0000-000000000051';
      v := 'FAIL'; why := 'a DELETE was ACCEPTED';
    exception when others then null;
    end;
    begin
      perform pg_temp.f0058('58585858-0000-0000-0000-000000000051', '58585858-0000-0000-0000-000000000051', null, 'entered', 'payment_card', 'Cartão', null, false, 'Visa', '4242', 11, 2027, array['Vercel'], null);
      v := 'FAIL'; why := 'the same form twice was ACCEPTED';
    exception when unique_violation then
      get stacked diagnostics c = constraint_name;
      if c <> 'ryvo_obligations_pkey' then v := 'FAIL'; why := 'the same id refused, but by "' || c || '"'; end if;
    end;
    raise exception using errcode = 'ZZ058', message = 'undo';
  exception
    when sqlstate 'ZZ058' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0058 values (13, v, why);
end $$;

-- ══ CASE 14 — no fixture survived ══════════════════════════════════════════
do $$
declare n int := 0;
begin
  if to_regclass('public.ryvo_obligations') is not null then
    execute 'select count(*) from public.ryvo_obligations where recorded_by = ''proof 0058''' into n;
  end if;
  insert into v0058 values (14, case when n = 0 then 'PASS' else 'FAIL' end,
    case when n = 0 then 'no 0058 fixture row exists'
         else n || ' fixture row(s) SURVIVED in production; tell Manuel before touching them' end);
exception when others then
  insert into v0058 values (14, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ THE VERDICT — the only output that matters ════════════════════════════
select c.n as "case", c.what,
       coalesce(r.verdict, 'FAIL') as verdict,
       coalesce(r.reason, 'DID NOT RUN — a missing row is a failure') as reason,
       c.before_0058
  from (values
    (1,  'the shape, and the domain column',                             'FAIL'),
    (2,  'PERMITTED: each kind, entered properly',                       'FAIL'),
    (3,  'a certidão without its date',                                  'FAIL'),
    (4,  '🔴 a procuração left blank',                                   'FAIL'),
    (5,  'a procuração with a date and "no expiry"',                     'FAIL'),
    (6,  '🔴 a full card number in the label',                           'FAIL'),
    (7,  '🔴 a card number in the note',                                 'FAIL'),
    (8,  'a last-four that is not four digits',                          'FAIL'),
    (9,  'a card with no services',                                      'FAIL'),
    (10, '🔴 a check supersedes; only it is current',                    'FAIL'),
    (11, '🔴 a chain cannot fork',                                       'FAIL'),
    (12, 'a later act keeps the kind',                                   'FAIL'),
    (13, 'retired, append-only, the same form twice',                    'FAIL'),
    (14, 'no fixture survived',                                          'PASS'),
    (15, '🔴 PERMITTED: a date, a NIF and a phone in a note',            'FAIL')
  ) as c(n, what, before_0058)
  left join v0058 r using (n)
 order by c.n;
