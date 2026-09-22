-- Proof for 0053. Run in the Supabase SQL editor WHOLE, after applying 0053.
-- Every case writes inside a block that raises ZZ053 to undo it, so nothing it
-- writes survives (case 9 checks). The verdict lives in a temp table, which the
-- undo does not touch.
--
-- ⚠️ CASE 6 creates a trigger on public.client_automations that refuses every
-- insert, INSIDE a block that is always undone: the trigger exists only within
-- this transaction, for milliseconds, and is gone when the block raises. It is
-- the only way to make the config insert fail AFTER the client insert, which is
-- the case 0053 exists for.
--
-- Expected AFTER 0053: every row PASS.
-- Expected BEFORE 0053: 1-6 and 8 FAIL (no function); 7 and 9 PASS.

drop table if exists pg_temp.v0053;
create temp table v0053 (n int primary key, verdict text not null, reason text not null);

-- ══ CASE 1 — the function: invoker rights, service_role only ═══════════════
do $$
declare ok boolean; def boolean;
begin
  select prosecdef into def from pg_proc where oid = 'public.create_client_with_config(jsonb, text, jsonb)'::regprocedure;
  ok := has_function_privilege('service_role', 'public.create_client_with_config(jsonb, text, jsonb)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.create_client_with_config(jsonb, text, jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.create_client_with_config(jsonb, text, jsonb)', 'EXECUTE')
    and def = false;
  insert into v0053 values (1, case when ok then 'PASS' else 'FAIL' end,
    case when ok then 'SECURITY INVOKER; service_role may execute; anon and authenticated may not'
         else 'the function''s rights are wrong (security definer, or executable by anon/authenticated, or not by service_role)' end);
exception when others then
  insert into v0053 values (1, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ CASE 2 — PERMITTED: a rehearsal client and its config, together ═══════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; cid uuid; nc int; ncfg int; reh boolean;
begin
  begin
    cid := public.create_client_with_config(
      '{"name":"proof 0053","agency_name":"proof 0053","whatsapp_number":"+351900053002","timezone":"Europe/Lisbon","locale":"pt-PT","rehearsal":true}',
      'inbound_concierge', '{"agent_name":"proof"}');
    select count(*), bool_and(rehearsal) into nc, reh from public.clients where id = cid;
    select count(*) into ncfg from public.client_automations where client_id = cid and enabled;
    if nc = 1 and ncfg = 1 and reh then v := 'PASS'; why := 'one client (rehearsal=true) and one enabled config, from one call';
    else v := 'FAIL'; why := format('clients=%s configs=%s rehearsal=%s', nc, ncfg, reh); end if;
    raise exception using errcode = 'ZZ053', message = 'undo';
  exception
    when sqlstate 'ZZ053' then null;
    when others then v := 'FAIL'; why := 'a valid client was REFUSED: ' || sqlerrm;
  end;
  insert into v0053 values (2, v, why);
end $$;

-- ══ CASE 3 — PERMITTED: a real agency writes rehearsal=false ═══════════════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; cid uuid; reh boolean;
begin
  begin
    cid := public.create_client_with_config(
      '{"name":"proof 0053","whatsapp_number":"+351900053003","rehearsal":false}', 'inbound_concierge', '{}');
    select rehearsal into reh from public.clients where id = cid;
    if reh = false then v := 'PASS'; why := 'rehearsal=false is written as false, not defaulted';
    else v := 'FAIL'; why := 'rehearsal was ' || coalesce(reh::text, 'null'); end if;
    raise exception using errcode = 'ZZ053', message = 'undo';
  exception
    when sqlstate 'ZZ053' then null;
    when others then v := 'FAIL'; why := 'a real agency was REFUSED: ' || sqlerrm;
  end;
  insert into v0053 values (3, v, why);
end $$;

-- ══ CASE 4 — an unanswered or non-boolean rehearsal is refused ═════════════
do $$
declare v text := 'PASS'; why text := 'a missing, a null and a string rehearsal are each refused (22023)'; a jsonb;
begin
  foreach a in array array[
    '{"name":"proof 0053","whatsapp_number":"+351900053004"}'::jsonb,
    '{"name":"proof 0053","whatsapp_number":"+351900053004","rehearsal":null}'::jsonb,
    '{"name":"proof 0053","whatsapp_number":"+351900053004","rehearsal":"true"}'::jsonb]
  loop
    begin
      perform public.create_client_with_config(a, 'inbound_concierge', '{}');
      v := 'FAIL'; why := 'ACCEPTED an unanswered rehearsal: ' || a::text;
      raise exception using errcode = 'ZZ053', message = 'undo';
    exception
      when sqlstate 'ZZ053' then exit;
      when sqlstate '22023' then null;
      when others then v := 'FAIL'; why := 'refused, but not as 22023: ' || sqlerrm; exit;
    end;
  end loop;
  insert into v0053 values (4, v, why);
end $$;

-- ══ CASE 5 — a number another client holds: 23505, and nothing is kept ═════
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; n int;
begin
  begin
    insert into public.clients (name, whatsapp_number, rehearsal) values ('proof 0053 holder', '+351900053005', true);
    begin
      perform public.create_client_with_config(
        '{"name":"proof 0053 second","whatsapp_number":"+351900053005","rehearsal":true}', 'inbound_concierge', '{}');
      v := 'FAIL'; why := 'ACCEPTED a second client on a held number';
    exception when unique_violation then
      select count(*) into n from public.clients where name = 'proof 0053 second';
      if n = 0 then v := 'PASS'; why := '23505, and no row of the refused client exists';
      else v := 'FAIL'; why := 'refused, but the second client row was KEPT'; end if;
    end;
    raise exception using errcode = 'ZZ053', message = 'undo';
  exception
    when sqlstate 'ZZ053' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0053 values (5, v, why);
end $$;

-- ══ 🔴 CASE 6 — THE CASE: the config refused AFTER the client insert ═══════
-- Before 0053 this left a client holding its number. Now neither row may exist.
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; n int; ncfg int;
begin
  begin
    create function public.zz0053_refuse_config() returns trigger language plpgsql as
      $f$ begin raise exception using errcode = 'ZZ531', message = 'proof 0053: config refused'; end $f$;
    create trigger zz0053_refuse_config before insert on public.client_automations
      for each row execute function public.zz0053_refuse_config();
    begin
      perform public.create_client_with_config(
        '{"name":"proof 0053 atomic","whatsapp_number":"+351900053006","rehearsal":true}', 'inbound_concierge', '{}');
      v := 'FAIL'; why := 'the config insert was refused, but the call SUCCEEDED';
    exception when sqlstate 'ZZ531' then
      select count(*) into n from public.clients where name = 'proof 0053 atomic';
      select count(*) into ncfg from public.clients c join public.client_automations a on a.client_id = c.id where c.whatsapp_number = '+351900053006';
      if n = 0 and ncfg = 0 then v := 'PASS'; why := 'the config was refused after the client insert, and NEITHER row exists: the number is free';
      else v := 'FAIL'; why := format('a half-made client was KEPT (clients=%s, configs=%s)', n, ncfg); end if;
    end;
    raise exception using errcode = 'ZZ053', message = 'undo';   -- also drops the trigger and its function
  exception
    when sqlstate 'ZZ053' then null;
    when others then v := 'FAIL'; why := 'the case itself errored: ' || sqlerrm;
  end;
  insert into v0053 values (6, v, why);
end $$;

-- ══ CASE 7 — the refusing trigger from case 6 is gone ═══════════════════════
do $$
declare n int;
begin
  select count(*) into n from pg_trigger where tgname = 'zz0053_refuse_config';
  n := n + (select count(*) from pg_proc where proname = 'zz0053_refuse_config');
  insert into v0053 values (7, case when n = 0 then 'PASS' else 'FAIL' end,
    case when n = 0 then 'no trace of case 6''s trigger or function'
         else '🔴 case 6''s refusing trigger SURVIVED: every client_automations insert will fail. Drop zz0053_refuse_config NOW' end);
exception when others then
  insert into v0053 values (7, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ CASE 8 — an automation missing from the catalogue: P0002, nothing kept ══
do $$
declare v text := 'FAIL'; why text := 'did not reach a verdict'; n int;
begin
  begin
    perform public.create_client_with_config(
      '{"name":"proof 0053 noauto","whatsapp_number":"+351900053008","rehearsal":true}', 'no_such_automation', '{}');
    v := 'FAIL'; why := 'ACCEPTED an automation that is not in the catalogue';
  exception when sqlstate 'P0002' then
    select count(*) into n from public.clients where name = 'proof 0053 noauto';
    if n = 0 then v := 'PASS'; why := 'P0002, and no client row exists';
    else v := 'FAIL'; why := 'refused, but the client row was KEPT'; end if;
  when others then v := 'FAIL'; why := 'refused, but not as P0002: ' || sqlerrm;
  end;
  insert into v0053 values (8, v, why);
end $$;

-- ══ CASE 9 — no fixture survived ═══════════════════════════════════════════
do $$
declare n int;
begin
  select count(*) into n from public.clients where name like 'proof 0053%' or whatsapp_number like '+35190005300%';
  insert into v0053 values (9, case when n = 0 then 'PASS' else 'FAIL' end,
    case when n = 0 then 'no 0053 fixture row exists'
         else n || ' fixture row(s) SURVIVED in production; tell Manuel before touching them' end);
exception when others then
  insert into v0053 values (9, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ THE VERDICT — the only output that matters ════════════════════════════
select c.n as "case", c.what,
       coalesce(r.verdict, 'FAIL') as verdict,
       coalesce(r.reason, 'DID NOT RUN — a missing row is a failure') as reason,
       c.before_0053
  from (values
    (1, 'invoker rights; service_role only',                         'FAIL'),
    (2, 'PERMITTED: a rehearsal client and its config, together',     'FAIL'),
    (3, 'PERMITTED: a real agency writes rehearsal=false',            'FAIL'),
    (4, 'an unanswered or non-boolean rehearsal is refused',          'FAIL'),
    (5, 'a held number: 23505, nothing kept',                         'FAIL'),
    (6, '🔴 the config refused after the client insert: NEITHER row', 'FAIL'),
    (7, 'case 6''s refusing trigger is gone',                         'PASS'),
    (8, 'an automation not in the catalogue: P0002, nothing kept',    'FAIL'),
    (9, 'no fixture survived',                                        'PASS')
  ) as c(n, what, before_0053)
  left join v0053 r using (n)
 order by c.n;
