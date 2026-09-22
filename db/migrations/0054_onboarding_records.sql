-- ====== onboarding_records: what onboarding PROVED or DID, with a date ======
--
-- 🔴 NOT APPLIED. Manuel runs this by hand in the Supabase SQL editor, in the same
-- sitting as 0053, then runs db/tests/0054_onboarding_records.test.sql (the last
-- output is its verdict rows; every row must be PASS).
--
-- Why (brief §2.8; operator, 22 Sep 2026, /onboarding checkpoint 2). Two of the
-- onboarding steps are not form fields, and until now had nowhere to live:
--
--   routing_proved      🔴 "The second real client is also the first proof that
--                       routing works." The Concierge resolves a client from the
--                       number a message arrived on. The step is: a message to
--                       the NEW client's number was answered with THIS client's
--                       config, AND a message to an EXISTING client's number was
--                       still answered with THEIRS. Both halves: checking only
--                       the new one proves nothing, because the failure is a real
--                       client's leads answered by another client's assistant,
--                       and the row that loses is the one nobody checked.
--   ai_disclosure_told  🔴 §3.0: the client hears about the AI disclosure FROM US,
--                       at onboarding, before they find it in their transcripts.
--                       A checklist item with a date, not a note.
--
-- (The contact declaration and the calibration are NOT recorded here: they are
-- the agency's own assertions, made on their own screens, and onboarding only
-- reads whether they exist.)
--
-- Shape:
--   * one row per thing that happened, with the day it happened and who recorded
--     it; `detail` carries the step's evidence, and a CHECK states what each
--     step's evidence must contain;
--   * APPEND-ONLY, exactly as 0050 left client_contracts: a correction is a NEW
--     row whose supersedes_id names the one it replaces (same client, same step),
--     never an edit. The trigger refuses UPDATE, DELETE and TRUNCATE; the grants
--     leave service_role SELECT and INSERT only;
--   * client_id RESTRICT, as 0049 made every foreign key that records a fact
--     about a client: deleting a client never deletes what was proved about it;
--   * onboarding_records_current: the rows no other row supersedes. The cockpit
--     reads this view, never the table.

begin;

do $$
begin
  if to_regclass('public.onboarding_records') is not null then
    raise exception 'REFUSING: public.onboarding_records already exists. This file creates it; it does not alter it.';
  end if;
end $$;

create table public.onboarding_records (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete restrict,
  step          text not null,
  happened_on   date not null,
  recorded_by   text not null,
  recorded_at   timestamptz not null default now(),
  detail        jsonb not null default '{}'::jsonb,
  supersedes_id uuid references public.onboarding_records(id) on delete restrict,

  constraint onboarding_step_known
    check (step in ('routing_proved', 'ai_disclosure_told')),
  constraint onboarding_recorded_by_named
    check (length(trim(recorded_by)) > 0),
  constraint onboarding_detail_is_object
    check (jsonb_typeof(detail) = 'object'),
  -- 🔴 Both halves, or it is not a routing proof.
  constraint routing_proof_has_both_halves
    check (step <> 'routing_proved' or (
      detail ->> 'new_client_answered' = 'true'
      and detail ->> 'existing_client_answered' = 'true'
      and coalesce(detail ->> 'existing_client_id', '') ~ '^[0-9a-f-]{36}$'
      and detail ->> 'existing_client_id' <> client_id::text
    )),
  -- Who at the agency heard it, by name: "told the client" is not evidence.
  constraint disclosure_names_who_was_told
    check (step <> 'ai_disclosure_told' or length(trim(coalesce(detail ->> 'told', ''))) > 0)
);

create index onboarding_records_client_step on public.onboarding_records (client_id, step);

comment on table public.onboarding_records is
  'What onboarding proved or did, with the day it happened (0054). Append-only: a correction '
  'is a new row whose supersedes_id names the one it replaces. Read onboarding_records_current.';

-- ---------------------------------------------------------------------------
-- Insert-time rules a CHECK cannot state (they read other rows)
-- ---------------------------------------------------------------------------
create or replace function public.onboarding_records_insert_rules()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare prev record;
begin
  -- The routing proof's other half names a client that exists. Only when a
  -- well-formed id is present: a MISSING or malformed one is the CHECK's to refuse
  -- (routing_proof_has_both_halves), and a BEFORE trigger runs before it.
  if new.step = 'routing_proved'
     and coalesce(new.detail ->> 'existing_client_id', '') ~ '^[0-9a-f-]{36}$'
     and not exists (select 1 from public.clients c where c.id = (new.detail ->> 'existing_client_id')::uuid) then
    raise exception using errcode = '23503',
      message = 'onboarding_records: the routing proof''s existing client does not exist';
  end if;
  -- A correction supersedes a record of the SAME client and the SAME step.
  if new.supersedes_id is not null then
    select client_id, step into prev from public.onboarding_records where id = new.supersedes_id;
    if prev.client_id is distinct from new.client_id or prev.step is distinct from new.step then
      raise exception using errcode = '23514',
        message = 'onboarding_records: a correction must supersede a record of the same client and step';
    end if;
  end if;
  return new;
end;
$$;

create trigger onboarding_records_insert_rules
  before insert on public.onboarding_records
  for each row execute function public.onboarding_records_insert_rules();

-- ---------------------------------------------------------------------------
-- The guarantee: append-only (0050's shape)
-- ---------------------------------------------------------------------------
create or replace function public.onboarding_records_append_only()
returns trigger language plpgsql as $$
begin
  raise exception
    'onboarding_records is append-only: % refused. A correction is a NEW row whose '
    'supersedes_id points at the one it replaces. Editing a proof rewrites what we say '
    'was checked, and when.', tg_op;
end;
$$;

create trigger onboarding_records_append_only_row
  before update or delete on public.onboarding_records
  for each row execute function public.onboarding_records_append_only();

create trigger onboarding_records_append_only_truncate
  before truncate on public.onboarding_records
  for each statement execute function public.onboarding_records_append_only();

-- ---------------------------------------------------------------------------
-- The view the cockpit reads
-- ---------------------------------------------------------------------------
create view public.onboarding_records_current
  with (security_invoker = true)
as
  select r.id, r.client_id, r.step, r.happened_on, r.recorded_by, r.recorded_at, r.detail, r.supersedes_id
    from public.onboarding_records r
   where not exists (select 1 from public.onboarding_records s where s.supersedes_id = r.id);

comment on view public.onboarding_records_current is
  'The onboarding records no other row supersedes. The cockpit reads this, never the table.';

-- ---------------------------------------------------------------------------
-- The belt: RLS on, as on every table beside it; write verbs restated whole
-- ---------------------------------------------------------------------------
alter table public.onboarding_records enable row level security;

revoke all on public.onboarding_records from public, anon, authenticated;
revoke update, delete, truncate on public.onboarding_records from service_role;
grant select, insert on public.onboarding_records to service_role;

revoke all on public.onboarding_records_current from public, anon, authenticated, service_role;
grant select on public.onboarding_records_current to service_role;

-- ---------------------------------------------------------------------------
-- Postcondition, read back from the catalogue. If it raises, nothing above
-- is kept.
-- ---------------------------------------------------------------------------
do $$
declare opts text[];
begin
  if not has_table_privilege('service_role', 'public.onboarding_records', 'INSERT')
     or not has_table_privilege('service_role', 'public.onboarding_records', 'SELECT')
     or not has_table_privilege('service_role', 'public.onboarding_records_current', 'SELECT') then
    raise exception 'REFUSING: service_role lost INSERT/SELECT on the table or SELECT on the view.';
  end if;
  if has_table_privilege('service_role', 'public.onboarding_records', 'UPDATE')
     or has_table_privilege('service_role', 'public.onboarding_records', 'DELETE')
     or has_table_privilege('service_role', 'public.onboarding_records', 'TRUNCATE')
     or has_table_privilege('anon', 'public.onboarding_records', 'SELECT')
     or has_table_privilege('authenticated', 'public.onboarding_records', 'SELECT') then
    raise exception 'REFUSING: a write verb or an anon/authenticated read survives on onboarding_records.';
  end if;
  select reloptions into opts from pg_class where oid = 'public.onboarding_records_current'::regclass;
  if opts is null or not ('security_invoker=true' = any (opts)) then
    raise exception 'REFUSING: onboarding_records_current lost security_invoker (options: %).', opts;
  end if;
  raise notice '0054 applied: onboarding_records (append-only) and onboarding_records_current.';
end $$;

commit;
