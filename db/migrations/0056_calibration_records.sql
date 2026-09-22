-- ====== 0056 — a calibration is a record, kept, and written in one step ======
--
-- 🔴 NOT APPLIED. Manuel runs this by hand in the Supabase SQL editor, then runs
-- db/tests/0056_calibration_records.test.sql WHOLE (its last output is its
-- verdict rows; every row must be PASS).
--
-- Why (/calibrate rebuild, checkpoint 1, 22 Sep 2026). The calibration is the
-- agency's own judgement about their market — "someone said €2,000,000; what is
-- the most you would still show them?" — and the matcher (automation 03) runs on
-- the six numbers derived from it. Until now it was saved by reading the whole
-- client_automations.config, merging in the answers, and writing it back:
--
--   🔴 IT OVERWROTE. A second calibration replaced the first. What the agency
--      said in the first sitting, and when, was gone; the thresholds changed
--      with no record of what they had been.
--   🔴 IT COULD LOSE A CONCURRENT WRITE. Between the read and the write,
--      anything else written to that config (listing_ingest, areas) was undone
--      without a trace.
--   🔴 IT KEPT ONLY US. `recorded_by` was the operator. Who AT THE AGENCY gave
--      the answers was nowhere, which is the collapse the segmentation screen
--      refuses: the agency answers, we record, and the row keeps them apart.
--
-- Shape:
--   * calibration_records: one row per calibration sitting — who at the agency
--     answered, who recorded it, when, the answers in the agent's units, and the
--     six thresholds derived from them. APPEND-ONLY, 0050's shape (the trigger
--     refuses UPDATE, DELETE and TRUNCATE; service_role SELECT and INSERT only;
--     RLS on). A new sitting is a new row; the latest is in force.
--   * its id is minted when the FORM IS DRAWN, and is the primary key: the same
--     form sent twice is refused 23505 by calibration_records_pkey, and the
--     cockpit reports "already recorded" (0055's rule, for the same reason);
--   * the answerer and the recorder must differ (the agency answers; we record);
--   * client_id RESTRICT (0049): deleting a client never deletes what it said;
--   * record_calibration(): ONE transaction that locks the client's
--     lead_nurture row, inserts the record, and merges the thresholds and the
--     calibration stamp into its config with `||` — one statement under the
--     row lock, so no concurrent config write is lost, and the record and the
--     numbers the engine reads cannot disagree.
--   * 🔴 A CLIENT WITH NO lead_nurture ROW GETS ONE, DISABLED (operator,
--     22 Sep 2026). /onboarding creates only the Concierge's row, so without
--     this no onboarded client could ever be calibrated. The row is created in
--     the same transaction with enabled = FALSE, stated explicitly, because the
--     column's default is TRUE. Calibrating records what the agency answered;
--     it never switches an automation on, and an existing row's `enabled` is
--     never written at all. Switching nurture on stays a separate, explicit act.
--
-- The config keeps what readers already use: the six threshold keys (the engine,
-- lib/matching/run.ts) and calibration.recorded_at (lib/onboarding-read.ts). It
-- also gains calibration.calibration_id and calibration.answered_by.
--
-- Checked read-only before writing (22 Sep 2026): no client_automations config
-- carries a calibration or a threshold yet, so there is nothing to backfill.
-- 3 clients, all rehearsals; 2 have a lead_nurture row. client_automations has
-- UNIQUE (client_id, automation_id), which the create-if-absent relies on, and
-- its `enabled` defaults to true, which is why the insert states false.

begin;

do $$
begin
  if to_regclass('public.calibration_records') is not null then
    raise exception 'REFUSING: public.calibration_records already exists. This file creates it; it does not alter it.';
  end if;
end $$;

create table public.calibration_records (
  id uuid primary key,
  client_id uuid not null references public.clients(id) on delete restrict,
  answered_by text not null,
  recorded_by text not null,
  recorded_at timestamptz not null default now(),
  answers jsonb not null,
  thresholds jsonb not null,
  constraint calibration_names_who_answered check (trim(answered_by) <> ''),
  constraint calibration_names_who_recorded check (trim(recorded_by) <> ''),
  constraint calibration_agency_answers_we_record check (lower(trim(answered_by)) <> lower(trim(recorded_by))),
  constraint calibration_answers_are_an_object check (jsonb_typeof(answers) = 'object'),
  constraint calibration_has_all_six_thresholds check (
    jsonb_typeof(thresholds) = 'object'
    and thresholds ?& array['budget_stretch', 'budget_stretch_with_evidence', 'bedrooms_tolerance',
                            'area_adjacency', 'min_score_strong', 'min_score_possible'])
);

comment on table public.calibration_records is
  'One calibration sitting: the agency''s answers, who gave them, who recorded them, and the six thresholds derived. Append-only; the latest is in force; written only through record_calibration() (0056).';

create index calibration_records_client_latest on public.calibration_records (client_id, recorded_at desc);

-- ---------------------------------------------------------------------------
-- Append-only, 0050's shape
-- ---------------------------------------------------------------------------
create function public.calibration_records_append_only() returns trigger
language plpgsql as $$
begin
  raise exception using errcode = '42501',
    message = 'calibration_records is append-only: a calibration is corrected by a NEW sitting, never by an edit (0056).';
end $$;

create trigger calibration_records_no_update before update or delete on public.calibration_records
  for each row execute function public.calibration_records_append_only();
create trigger calibration_records_no_truncate before truncate on public.calibration_records
  for each statement execute function public.calibration_records_append_only();

alter table public.calibration_records enable row level security;
revoke all on public.calibration_records from public, anon, authenticated;
revoke update, delete, truncate on public.calibration_records from service_role;
grant select, insert on public.calibration_records to service_role;

-- ---------------------------------------------------------------------------
-- The one way a calibration is written
-- ---------------------------------------------------------------------------
create function public.record_calibration(
  p_calibration_id uuid,
  p_client_id uuid,
  p_answered_by text,
  p_recorded_by text,
  p_answers jsonb,
  p_thresholds jsonb
) returns timestamptz
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_automation uuid;
  v_row uuid;
  v_at timestamptz;
begin
  if p_calibration_id is null or p_client_id is null then
    raise exception using errcode = '22023', message = 'record_calibration: the calibration id and the client are required';
  end if;

  select id into v_automation from public.automations where key = 'lead_nurture';
  if v_automation is null then
    raise exception using errcode = 'P0002',
      message = 'record_calibration: lead_nurture is not in the automation catalogue, so there is nothing to calibrate. Nothing was recorded.';
  end if;

  -- 🔴 The row, created DISABLED if the client has none. `enabled` is stated
  -- because its default is true; an existing row is left exactly as it is.
  insert into public.client_automations (client_id, automation_id, enabled, config)
  values (p_client_id, v_automation, false, '{}'::jsonb)
  on conflict (client_id, automation_id) do nothing;

  -- Lock the row the engine reads, so nothing else writes its config until this commits.
  select ca.id into v_row
    from public.client_automations ca
   where ca.client_id = p_client_id and ca.automation_id = v_automation
   for update;
  if v_row is null then
    -- Unreachable after the insert above, unless the row was removed in between. Refuse rather than
    -- record a sitting whose numbers would reach no config: the record and the projection, or neither.
    raise exception using errcode = 'P0002',
      message = 'record_calibration: the lead_nurture row could not be found or created. Nothing was recorded.';
  end if;

  -- The record: a resubmitted form is refused here (23505, calibration_records_pkey). The function is one
  -- transaction, so a refusal anywhere below undoes everything above it; the order is for reading, not safety.
  insert into public.calibration_records (id, client_id, answered_by, recorded_by, answers, thresholds)
  values (p_calibration_id, p_client_id, trim(p_answered_by), trim(p_recorded_by), p_answers, p_thresholds)
  returning recorded_at into v_at;

  -- Then the numbers the engine reads, merged in ONE statement under the lock: every other key survives,
  -- and `enabled` is not in this statement at all.
  update public.client_automations
     set config = coalesce(config, '{}'::jsonb) || p_thresholds || jsonb_build_object('calibration', jsonb_build_object(
           'calibration_id', p_calibration_id,
           'answers', p_answers,
           'answered_by', trim(p_answered_by),
           'recorded_by', trim(p_recorded_by),
           'recorded_at', v_at))
   where id = v_row;

  return v_at;
end;
$$;

comment on function public.record_calibration(uuid, uuid, text, text, jsonb, jsonb) is
  'Records a calibration sitting and projects its thresholds into the lead_nurture config, in ONE transaction, or neither (0056).';

revoke all on function public.record_calibration(uuid, uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_calibration(uuid, uuid, text, text, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Postcondition, read back from the catalogue. If it raises, nothing above
-- is kept.
-- ---------------------------------------------------------------------------
do $$
begin
  if not has_table_privilege('service_role', 'public.calibration_records', 'INSERT')
     or not has_table_privilege('service_role', 'public.calibration_records', 'SELECT') then
    raise exception 'REFUSING: service_role lost INSERT/SELECT on calibration_records.';
  end if;
  if has_table_privilege('service_role', 'public.calibration_records', 'UPDATE')
     or has_table_privilege('service_role', 'public.calibration_records', 'DELETE')
     or has_table_privilege('service_role', 'public.calibration_records', 'TRUNCATE')
     or has_table_privilege('anon', 'public.calibration_records', 'SELECT')
     or has_table_privilege('authenticated', 'public.calibration_records', 'SELECT') then
    raise exception 'REFUSING: a write verb or an anon/authenticated read survives on calibration_records.';
  end if;
  if not has_function_privilege('service_role', 'public.record_calibration(uuid, uuid, text, text, jsonb, jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.record_calibration(uuid, uuid, text, text, jsonb, jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.record_calibration(uuid, uuid, text, text, jsonb, jsonb)', 'EXECUTE') then
    raise exception 'REFUSING: record_calibration is executable by the wrong roles.';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.calibration_records'::regclass
       and tgname in ('calibration_records_no_update', 'calibration_records_no_truncate')) <> 2 then
    raise exception 'REFUSING: an append-only trigger on calibration_records is missing.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.calibration_records'::regclass) then
    raise exception 'REFUSING: RLS is off on calibration_records.';
  end if;
  raise notice '0056 applied: calibration_records (append-only) and record_calibration().';
end $$;

commit;
