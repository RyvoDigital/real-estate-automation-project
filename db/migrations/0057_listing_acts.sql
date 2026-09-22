-- ====== 0057 — the two acts on a listing, each written in one step ======
--
-- 🔴 NOT APPLIED. Manuel runs this by hand in the Supabase SQL editor, then runs
-- db/tests/0057_listing_acts.test.sql WHOLE (its last output is its verdict
-- rows; every row must be PASS).
--
-- Why (the listing screens, checkpoint 1, 22 Sep 2026). The listing screens
-- write two acts, and each was several separate requests:
--
--   THE AGENT'S PICK (/listings/[id]/triage): "this contact suits this
--   property", in the agency person's name. Three writes: the match, the
--   requirements learned from their sentence, the event.
--     🔴 HALF-WRITTEN. The match could land and its requirements fail ("the
--        choice was recorded but its reasons were not"); the event's error was
--        never read at all.
--     🔴 REFUSED BY ITS OWN INDEX. listing_matches allows one CURRENT row per
--        listing × lead. When the engine had already matched that contact, the
--        agent's pick hit listing_matches_current_uniq and the screen threw:
--        the agent could not choose somebody the engine had also found.
--     🔴 ANY CONTACT. The lead id came from the form and was never checked
--        against the listing's agency: a pick could match another agency's
--        contact to this property.
--
--   THE EXEMPTION (/listings/[id]/exemption): "this property needs no energy
--   certificate", in the agency person's name. Two writes: the current value in
--   listing_facts (an UPDATE when a row exists), and an event as the history.
--     🔴 THE HISTORY WAS NOT KEPT. `events` is not append-only (service_role
--        holds UPDATE and DELETE), and the event's insert error was never read,
--        so "who said this property needed no certificate, and when" could be
--        missing, or edited, while the value itself had been overwritten.
--     🔴 A RACE ON "ALREADY RATED". The check that refuses an exemption over an
--        existing rating read first and wrote later, in two requests.
--
-- Shape:
--   * exemption_records: one row per exemption declared — the listing, the
--     requirement, who at the agency declared it, who recorded it, the basis in
--     their words, when. APPEND-ONLY (0050's shape: triggers refuse UPDATE,
--     DELETE and TRUNCATE; service_role SELECT and INSERT only; RLS on). Its id
--     is minted when the FORM IS DRAWN and is the primary key, so the same form
--     sent twice is 23505 on exemption_records_pkey ("already recorded").
--     listing_facts keeps the CURRENT value, as before; this keeps the act.
--   * record_exemption(): ONE transaction. Locks the listing's fact row, refuses
--     an exemption over an existing rating (RY001, read under the lock), inserts
--     the record, writes the current value carrying the record's id, and the
--     event (kept for the activity feed; no longer the only history).
--   * record_agent_pick(): ONE transaction. Refuses a contact from another
--     agency (RY002); a second pick of a contact the agency ALREADY chose for
--     this listing (RY003); an id already recorded (23505 naming
--     listing_matches_pkey, "already recorded"). When the engine's computed
--     match is the current row, it is SUPERSEDED (superseded_at stamped, which
--     0025's freeze permits even after the agent was told) and the pick is
--     inserted as its successor (supersedes_id), so the history reads "the
--     engine found them, then the agent chose them". The requirements learned
--     from the sentence and the event go in the same transaction.
--   * both functions refuse the agency person and the recorder being the same
--     (the agency decides; we record), and are service_role only.
--
-- Checked read-only before writing (22 Sep 2026): 1 listing, 0 listing_matches,
-- 0 lead_requirements, 0 listing_facts; nothing reads the two event types; the
-- listing_matches freeze allows superseded_at to change on a notified row.

begin;

do $$
begin
  if to_regclass('public.exemption_records') is not null then
    raise exception 'REFUSING: public.exemption_records already exists. This file creates it; it does not alter it.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The exemption, kept
-- ---------------------------------------------------------------------------
create table public.exemption_records (
  id uuid primary key,
  client_id uuid not null references public.clients(id) on delete restrict,
  listing_id uuid not null references public.listings(id) on delete restrict,
  requirement_id text not null,
  declared_by text not null,
  recorded_by text not null,
  basis text not null,
  declared_at timestamptz not null default now(),
  constraint exemption_names_who_declared check (trim(declared_by) <> ''),
  constraint exemption_names_who_recorded check (trim(recorded_by) <> ''),
  constraint exemption_states_its_basis check (trim(basis) <> ''),
  constraint exemption_agency_declares_we_record check (lower(trim(declared_by)) <> lower(trim(recorded_by)))
);

comment on table public.exemption_records is
  'One exemption declared, as an act: who at the agency, who recorded it, the basis in their words, when. Append-only; listing_facts holds the current value; written only through record_exemption() (0057).';

create index exemption_records_listing on public.exemption_records (listing_id, requirement_id, declared_at desc);

create function public.exemption_records_append_only() returns trigger
language plpgsql as $$
begin
  raise exception using errcode = '42501',
    message = 'exemption_records is append-only: an exemption is withdrawn or corrected by a NEW act, never by an edit (0057).';
end $$;

create trigger exemption_records_no_update before update or delete on public.exemption_records
  for each row execute function public.exemption_records_append_only();
create trigger exemption_records_no_truncate before truncate on public.exemption_records
  for each statement execute function public.exemption_records_append_only();

alter table public.exemption_records enable row level security;
revoke all on public.exemption_records from public, anon, authenticated;
revoke update, delete, truncate on public.exemption_records from service_role;
grant select, insert on public.exemption_records to service_role;

-- ---------------------------------------------------------------------------
-- record_exemption: the act, the current value and the event, or none of them
-- ---------------------------------------------------------------------------
create function public.record_exemption(
  p_exemption_id uuid,
  p_listing_id uuid,
  p_requirement_id text,
  p_declared_by text,
  p_recorded_by text,
  p_basis text
) returns timestamptz
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_client uuid;
  v_fact record;
  v_had_fact boolean;
  v_at timestamptz;
begin
  if p_exemption_id is null or p_listing_id is null or coalesce(trim(p_requirement_id), '') = '' then
    raise exception using errcode = '22023', message = 'record_exemption: the exemption id, the listing and the requirement are required';
  end if;

  select client_id into v_client from public.listings where id = p_listing_id;
  if v_client is null then
    raise exception using errcode = 'P0002', message = 'record_exemption: no such listing. Nothing was recorded.';
  end if;

  -- The current fact, locked, so "already rated" is decided on what will be written over.
  select id, values, exemption into v_fact
    from public.listing_facts
   where listing_id = p_listing_id and requirement_id = p_requirement_id
   for update;
  -- Kept in a variable: FOUND is reset by every statement below, the insert of the act included.
  v_had_fact := found;
  if v_had_fact and v_fact.exemption is null and v_fact.values is not null and v_fact.values <> '{}'::jsonb then
    raise exception using errcode = 'RY001',
      message = 'record_exemption: this property already holds a rating for this requirement, so it cannot also be exempt. Nothing was recorded.';
  end if;

  -- The act. A resubmitted form stops here: 23505 on exemption_records_pkey.
  insert into public.exemption_records (id, client_id, listing_id, requirement_id, declared_by, recorded_by, basis)
  values (p_exemption_id, v_client, p_listing_id, p_requirement_id, trim(p_declared_by), trim(p_recorded_by), trim(p_basis))
  returning declared_at into v_at;

  -- The current value, carrying the act's id.
  if v_had_fact then
    update public.listing_facts
       set values = '{}'::jsonb,
           exemption = jsonb_build_object('exemption_id', p_exemption_id, 'declared_by', trim(p_declared_by),
                                          'basis', trim(p_basis), 'at', v_at, 'recorded_by', trim(p_recorded_by)),
           registration_status = 'not_required', source = 'typed', updated_at = now()
     where id = v_fact.id;
  else
    insert into public.listing_facts (client_id, listing_id, requirement_id, values, exemption, registration_status, source)
    values (v_client, p_listing_id, p_requirement_id, '{}'::jsonb,
            jsonb_build_object('exemption_id', p_exemption_id, 'declared_by', trim(p_declared_by),
                               'basis', trim(p_basis), 'at', v_at, 'recorded_by', trim(p_recorded_by)),
            'not_required', 'typed');
  end if;

  insert into public.events (client_id, type, severity, summary, data)
  values (v_client, 'listing.exemption_declared', 'info',
          trim(p_declared_by) || ' declared this property exempt from certification',
          jsonb_build_object('listing_id', p_listing_id, 'requirement_id', p_requirement_id, 'exemption_id', p_exemption_id,
                             'declared_by', trim(p_declared_by), 'basis', trim(p_basis), 'recorded_by', trim(p_recorded_by)));
  return v_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_agent_pick: the match, its requirements and the event, or none of them
-- ---------------------------------------------------------------------------
create function public.record_agent_pick(
  p_match_id uuid,
  p_listing_id uuid,
  p_lead_id uuid,
  p_chosen_by text,
  p_recorded_by text,
  p_reason text,
  p_requirements jsonb
) returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_listing record;
  v_lead_client uuid;
  v_current record;
  v_had_current boolean;
  v_superseded uuid;
begin
  if p_match_id is null or p_listing_id is null or p_lead_id is null then
    raise exception using errcode = '22023', message = 'record_agent_pick: the pick id, the listing and the contact are required';
  end if;
  if coalesce(trim(p_chosen_by), '') = '' or coalesce(trim(p_recorded_by), '') = '' then
    raise exception using errcode = '23514', message = 'record_agent_pick: who at the agency chose, and who recorded it, are both required';
  end if;
  if lower(trim(p_chosen_by)) = lower(trim(p_recorded_by)) then
    raise exception using errcode = '23514',
      message = 'record_agent_pick: the agency chooses and we record; the chooser and the recorder are the same name';
  end if;
  if p_requirements is not null and jsonb_typeof(p_requirements) <> 'array' then
    raise exception using errcode = '22023', message = 'record_agent_pick: p_requirements must be a JSON array';
  end if;

  -- The same form again: the first submit is the record.
  if exists (select 1 from public.listing_matches where id = p_match_id) then
    raise exception using errcode = '23505',
      message = 'duplicate key value violates unique constraint "listing_matches_pkey"';
  end if;

  select id, client_id, status, status_changed_at into v_listing from public.listings where id = p_listing_id;
  if v_listing.id is null then
    raise exception using errcode = 'P0002', message = 'record_agent_pick: no such listing. Nothing was recorded.';
  end if;
  select client_id into v_lead_client from public.leads where id = p_lead_id;
  if v_lead_client is null then
    raise exception using errcode = 'P0002', message = 'record_agent_pick: no such contact. Nothing was recorded.';
  end if;
  if v_lead_client <> v_listing.client_id then
    raise exception using errcode = 'RY002',
      message = 'record_agent_pick: this contact belongs to another agency, so it cannot be chosen for this property. Nothing was recorded.';
  end if;

  select id, origin, chosen_by into v_current
    from public.listing_matches
   where listing_id = p_listing_id and lead_id = p_lead_id and superseded_at is null
   for update;
  v_had_current := found;
  if v_had_current and v_current.origin = 'agent' then
    raise exception using errcode = 'RY003',
      message = format('record_agent_pick: %s already chose this contact for this property. Nothing new was recorded.', v_current.chosen_by);
  end if;
  if v_had_current then
    -- The engine's match, superseded by the agent's choice: the history reads engine → agent.
    update public.listing_matches set superseded_at = now() where id = v_current.id;
    v_superseded := v_current.id;
  end if;

  insert into public.listing_matches (id, client_id, listing_id, lead_id, origin, chosen_by, chosen_at, chosen_reason,
                                      listing_status_at_match, listing_status_changed_at_at_match, supersedes_id)
  values (p_match_id, v_listing.client_id, p_listing_id, p_lead_id, 'agent', trim(p_chosen_by), now(), nullif(trim(p_reason), ''),
          v_listing.status, v_listing.status_changed_at, v_superseded);

  insert into public.lead_requirements (client_id, lead_id, kind, value, strength, source, evidence, why, stated_at, unordered, authored_by, superseded_by)
  select v_listing.client_id, p_lead_id, r.kind, r.value, r.strength, 'agent', nullif(trim(p_reason), ''), r.why, null,
         'an agent said this, and nothing says where it sits against what the lead said', trim(p_chosen_by), r.superseded_by
    from jsonb_to_recordset(coalesce(p_requirements, '[]'::jsonb)) as r(kind text, value jsonb, strength text, why text, superseded_by jsonb);

  insert into public.events (client_id, type, severity, summary, data)
  values (v_listing.client_id, 'listing.chosen_by_agent', 'info', trim(p_chosen_by) || ' chose a contact for this listing',
          jsonb_build_object('listing_id', p_listing_id, 'lead_id', p_lead_id, 'match_id', p_match_id, 'chosen_by', trim(p_chosen_by),
                             'recorded_by', trim(p_recorded_by), 'superseded_computed', v_superseded,
                             'requirements_learned', jsonb_array_length(coalesce(p_requirements, '[]'::jsonb))));

  return case when v_superseded is null then 'recorded' else 'superseded_computed' end;
end;
$$;

comment on function public.record_exemption(uuid, uuid, text, text, text, text) is
  'Records an exemption as an act, its current value and its event in ONE transaction, or none (0057).';
comment on function public.record_agent_pick(uuid, uuid, uuid, text, text, text, jsonb) is
  'Records an agent''s pick, the requirements its sentence taught, and the event, in ONE transaction, or none (0057).';

revoke all on function public.record_exemption(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_exemption(uuid, uuid, text, text, text, text) to service_role;
revoke all on function public.record_agent_pick(uuid, uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_agent_pick(uuid, uuid, uuid, text, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Postcondition, read back from the catalogue. If it raises, nothing above
-- is kept.
-- ---------------------------------------------------------------------------
do $$
begin
  if not has_table_privilege('service_role', 'public.exemption_records', 'INSERT')
     or not has_table_privilege('service_role', 'public.exemption_records', 'SELECT')
     or has_table_privilege('service_role', 'public.exemption_records', 'UPDATE')
     or has_table_privilege('service_role', 'public.exemption_records', 'DELETE')
     or has_table_privilege('anon', 'public.exemption_records', 'SELECT')
     or has_table_privilege('authenticated', 'public.exemption_records', 'SELECT') then
    raise exception 'REFUSING: exemption_records grants are not service_role SELECT+INSERT only.';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.exemption_records'::regclass
       and tgname in ('exemption_records_no_update', 'exemption_records_no_truncate')) <> 2 then
    raise exception 'REFUSING: an append-only trigger on exemption_records is missing.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.exemption_records'::regclass) then
    raise exception 'REFUSING: RLS is off on exemption_records.';
  end if;
  if not has_function_privilege('service_role', 'public.record_exemption(uuid, uuid, text, text, text, text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.record_agent_pick(uuid, uuid, uuid, text, text, text, jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.record_exemption(uuid, uuid, text, text, text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.record_exemption(uuid, uuid, text, text, text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.record_agent_pick(uuid, uuid, uuid, text, text, text, jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.record_agent_pick(uuid, uuid, uuid, text, text, text, jsonb)', 'EXECUTE') then
    raise exception 'REFUSING: a 0057 function is executable by the wrong roles.';
  end if;
  raise notice '0057 applied: exemption_records (append-only), record_exemption(), record_agent_pick().';
end $$;

commit;
