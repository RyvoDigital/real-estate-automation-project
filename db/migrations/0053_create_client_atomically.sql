-- ====== create_client_with_config: a client and its config, or neither ======
--
-- 🔴 NOT APPLIED. Manuel runs this by hand in the Supabase SQL editor, in the same
-- sitting as 0054, then runs db/tests/0053_create_client_atomically.test.sql
-- (the last output is its verdict rows; every row must be PASS).
--
-- Why (operator, 22 Sep 2026, /onboarding checkpoint 1):
--
-- The cockpit created a client in two inserts: the `clients` row, then its
-- `client_automations` config. When the second failed, the first stayed behind
-- HOLDING ITS WHATSAPP NUMBER, and 0007's unique index then refused the retry as
-- "already uses this number". Checkpoint 1 proposed deleting the half-made row;
-- the operator refused, for two reasons that this migration keeps as invariants:
--   * the 0049 audit established that NO application code deletes a client;
--   * a client delete cascades through 19 tables. A dangerous path to open, even
--     for a row created a second earlier.
-- So the two inserts become ONE transaction: a function PostgREST calls as one
-- statement. Any failure inside it (a duplicate number, an automation missing
-- from the catalogue, a config the table refuses) raises, and Postgres undoes
-- both inserts. There is nothing to clean up, because nothing was kept.
--
-- 🔒 The rehearsal answer is REQUIRED here too, as a JSON boolean. 0038 made the
--    column NOT NULL with no default; this function refuses a missing or
--    non-boolean answer itself, so no caller can reach the column's refusal with
--    a guessed value.
-- 🔒 The config must be a JSON object: the Concierge reads it as one.
-- 🔒 SECURITY INVOKER: it runs with the caller's own privileges. service_role
--    already holds INSERT on both tables (0046's belt); this adds EXECUTE, and
--    only for service_role.
-- 🔒 Errors keep their SQLSTATE through PostgREST: 23505 for a number another
--    client holds (the cockpit maps it to "already in use"), P0002 for an
--    automation missing from the catalogue, 22023 for a bad argument.

begin;

create or replace function public.create_client_with_config(
  p_client jsonb,
  p_automation_key text,
  p_config jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_client uuid;
  v_automation uuid;
begin
  if p_client is null or jsonb_typeof(p_client) <> 'object' then
    raise exception using errcode = '22023', message = 'create_client_with_config: p_client must be a JSON object';
  end if;
  if jsonb_typeof(p_client -> 'rehearsal') is distinct from 'boolean' then
    raise exception using errcode = '22023',
      message = 'create_client_with_config: rehearsal must be answered true or false. There is no default: an unanswered question is not an answer (0037/0038).';
  end if;
  if coalesce(trim(p_client ->> 'name'), '') = '' then
    raise exception using errcode = '22023', message = 'create_client_with_config: the client needs a name';
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception using errcode = '22023', message = 'create_client_with_config: p_config must be a JSON object';
  end if;

  select id into v_automation from public.automations where key = p_automation_key;
  if v_automation is null then
    raise exception using errcode = 'P0002',
      message = format('create_client_with_config: the automation %L is not in the catalogue, so nothing was created', p_automation_key);
  end if;

  insert into public.clients (name, agency_name, whatsapp_number, timezone, locale, status, rehearsal)
  values (
    trim(p_client ->> 'name'),
    nullif(trim(p_client ->> 'agency_name'), ''),
    nullif(trim(p_client ->> 'whatsapp_number'), ''),
    coalesce(nullif(trim(p_client ->> 'timezone'), ''), 'Europe/Lisbon'),
    coalesce(nullif(trim(p_client ->> 'locale'), ''), 'pt-PT'),
    coalesce(nullif(trim(p_client ->> 'status'), ''), 'active'),
    (p_client ->> 'rehearsal')::boolean
  )
  returning id into v_client;

  insert into public.client_automations (client_id, automation_id, enabled, config)
  values (v_client, v_automation, true, p_config);

  return v_client;
end;
$$;

comment on function public.create_client_with_config(jsonb, text, jsonb) is
  'Creates a client and its automation config in ONE transaction, or neither (0053). '
  'The cockpit''s only way to create a client: no application code deletes one (0049).';

revoke all on function public.create_client_with_config(jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_client_with_config(jsonb, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Postcondition, read back from the catalogue. If it raises, nothing above
-- is kept.
-- ---------------------------------------------------------------------------
do $$
declare def text;
begin
  if not has_function_privilege('service_role', 'public.create_client_with_config(jsonb, text, jsonb)', 'EXECUTE') then
    raise exception 'REFUSING: service_role cannot execute create_client_with_config.';
  end if;
  if has_function_privilege('anon', 'public.create_client_with_config(jsonb, text, jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.create_client_with_config(jsonb, text, jsonb)', 'EXECUTE') then
    raise exception 'REFUSING: anon or authenticated can execute create_client_with_config.';
  end if;
  select prosecdef::text into def from pg_proc where oid = 'public.create_client_with_config(jsonb, text, jsonb)'::regprocedure;
  if def <> 'false' then
    raise exception 'REFUSING: create_client_with_config is SECURITY DEFINER; it must run as its caller.';
  end if;
  raise notice '0053 applied: create_client_with_config exists, invoker rights, service_role only.';
end $$;

commit;
