-- ====== ONE-OFF WRITE. Resets test lead b35915d1 (…230, Ryvo Test Client). ======
--
-- 🔴 THIS WRITES TO PRODUCTION. Manuel runs it by hand in the Supabase SQL
-- editor, once, on 24 Sep 2026. Paste the WHOLE file and run it as one query.
--
-- ORDER, relative to the calendar (the reason this file exists):
--   1. Run THIS FILE FIRST. Every row of the final SELECT must say PASS.
--   2. THEN delete the Friday 25 Sep 13:00 (Lisbon) event from the demo
--      calendar by hand. The event id the lead held is printed in the
--      `calendar_next_step` row; delete that one and no other.
--
--   Why this order: the retired-booking path (VerifyBooking → ResolveBooking
--   → booking_retired:cancelled) only runs for a lead that HOLDS
--   qualification.booking. Once this file has removed it, the workflow no
--   longer knows the event exists, so deleting it is invisible. Deleting the
--   event first leaves a window in which any inbound from …230 finds its
--   stored booking cancelled, retires it into past_bookings, escalates, and
--   sends the retired-booking note: exactly this morning's state.
--
-- WHAT IT CLEARS, and what reads each thing (BuildClaudeRequest unless named):
--   leads.qualification  → '{}'. Removes booking (MatchConfirmation →
--       VerifyBooking), past_bookings (the "An earlier appointment … was removed
--       from the calendar on our side" line, stated EVERY turn), proposed_slots,
--       escalated (AfterLead → the lead is silenced; the cockpit Queue),
--       escalation_cleared_at/_by (transcript hand-back note), stage_signals,
--       name_source, bedrooms, budget_history, rejected_budgets.
--   leads facts          → stage 'new'; lead_type, budget_min/max, timeline,
--       area, email, instagram_handle NULL (the known-facts block and the
--       QUALIFIED note; budget_max 3000000 is what fires high_value every turn).
--       full_name is KEPT: a real first contact arrives with the WhatsApp
--       profile name, and with name_source gone it is read as exactly that.
--   messages             → deleted. LoadHistory feeds the last 20 to the
--       model: it held the booking-retired handoff note and both old
--       confirmations. Also the AI-disclosure state (ReadDisclosureState), so
--       the next reply discloses again, as a first contact's does.
--   events               → deleted for this lead. The workflow never reads
--       them; the cockpit's lead page does (the struck-through retired booking,
--       the escalation history).
--   NOT touched: automation_runs (run history, not state), the client's
--   config, every other lead.
--
-- GUARDS: the lead id is a constant and every write is filtered on it; the
-- client must be Ryvo Test Client; the phone must end in 230; exactly one
-- leads row may change; and if the stored booking is not the Friday 13:00
-- event read on 24 Sep at 11:17 UTC, it refuses (the state moved since it
-- was read, so the calendar step below would be wrong). Any refusal raises
-- an error and writes nothing.

create temp table if not exists reset_b35915d1_report (k text primary key, v text);
truncate reset_b35915d1_report;

do $$
declare
  v_lead   constant uuid := 'b35915d1-9e11-4046-97db-71ee0f82f9e7';
  v_client constant uuid := '123e18bc-69a4-44c3-b1ad-b5503820301d';
  v_expect_event constant text := 'rvc99e66fba61fe0ee20260925120000000';
  r        record;
  v_event  text;
  n        bigint;
begin
  -- ---- guards --------------------------------------------------------------
  select l.id, l.client_id, l.phone, l.qualification, c.name as client_name
    into r
    from leads l join clients c on c.id = l.client_id
   where l.id = v_lead
     for update of l;

  if not found then
    raise exception 'REFUSED: lead % does not exist', v_lead;
  end if;
  if r.client_id <> v_client or r.client_name <> 'Ryvo Test Client' then
    raise exception 'REFUSED: lead % belongs to client % (%), not Ryvo Test Client',
      v_lead, r.client_id, r.client_name;
  end if;
  if right(coalesce(r.phone, ''), 3) <> '230' then
    raise exception 'REFUSED: lead % phone does not end in 230', v_lead;
  end if;

  v_event := r.qualification -> 'booking' ->> 'event_id';
  if v_event is not null and v_event <> v_expect_event then
    raise exception 'REFUSED: stored booking is % , expected % (Fri 25 Sep 13:00 Lisbon). State changed since it was read; stop and re-check before deleting any calendar event.',
      v_event, v_expect_event;
  end if;
  insert into reset_b35915d1_report values ('event_id_removed', coalesce(v_event, '(none stored)'));

  -- ---- writes: every one filtered on v_lead ---------------------------------
  delete from messages where lead_id = v_lead;
  get diagnostics n = row_count;
  insert into reset_b35915d1_report values ('messages_deleted', n::text);

  delete from events where data ->> 'lead_id' = v_lead::text;
  get diagnostics n = row_count;
  insert into reset_b35915d1_report values ('events_deleted', n::text);

  update leads
     set stage            = 'new',
         qualification    = '{}'::jsonb,
         lead_type        = null,
         budget_min       = null,
         budget_max       = null,
         timeline         = null,
         area             = null,
         email            = null,
         instagram_handle = null,
         last_contact_at  = null,
         updated_at       = now()
   where id = v_lead and client_id = v_client;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'REFUSED: the lead update touched % rows, expected exactly 1; rolled back', n;
  end if;
  insert into reset_b35915d1_report values ('leads_updated', n::text);
end $$;

-- ---- the verdict: one row per case, every case named -----------------------
with l as (
  select * from leads where id = 'b35915d1-9e11-4046-97db-71ee0f82f9e7'
), rep as (
  select k, v from reset_b35915d1_report
), cases(ord, name, ok, reason) as (values
  (1, 'guards_passed_and_one_lead_updated',
      (select v from rep where k = 'leads_updated') = '1',
      'leads_updated = ' || coalesce((select v from rep where k = 'leads_updated'), 'MISSING: the DO block did not run')),
  (2, 'stage_is_new',
      (select stage from l) = 'new',
      'stage = ' || coalesce((select stage from l), 'NULL')),
  (3, 'qualification_empty (booking, past_bookings, proposed_slots, escalated, cleared_at)',
      (select qualification from l) = '{}'::jsonb,
      'keys: ' || coalesce((select string_agg(k, ',') from l, jsonb_object_keys(l.qualification) k), '(none)')),
  (4, 'facts_cleared (lead_type, budgets, timeline, area)',
      (select lead_type is null and budget_min is null and budget_max is null
              and timeline is null and area is null from l),
      (select concat_ws(', ', 'lead_type=' || coalesce(lead_type, 'null'), 'budget_min=' || coalesce(budget_min::text, 'null'),
              'budget_max=' || coalesce(budget_max::text, 'null'), 'timeline=' || coalesce(timeline, 'null'),
              'area=' || coalesce(area, 'null')) from l)),
  (5, 'no_messages_left (history + disclosure state)',
      (select count(*) from messages where lead_id = 'b35915d1-9e11-4046-97db-71ee0f82f9e7') = 0,
      'deleted ' || coalesce((select v from rep where k = 'messages_deleted'), '?') || ', remaining '
        || (select count(*) from messages where lead_id = 'b35915d1-9e11-4046-97db-71ee0f82f9e7')),
  (6, 'no_events_left (cockpit lead page)',
      (select count(*) from events where data ->> 'lead_id' = 'b35915d1-9e11-4046-97db-71ee0f82f9e7') = 0,
      'deleted ' || coalesce((select v from rep where k = 'events_deleted'), '?') || ', remaining '
        || (select count(*) from events where data ->> 'lead_id' = 'b35915d1-9e11-4046-97db-71ee0f82f9e7')),
  (7, 'only_one_lead_for_this_phone_and_client',
      (select count(*) from leads x, l where x.client_id = l.client_id and x.phone = l.phone) = 1,
      'a second row for …230 would be a second lead the reset did not touch')
)
select ord, name as case_name, case when ok then 'PASS' else 'FAIL' end as verdict, reason
  from cases
union all
select 99, 'calendar_next_step', 'TODO',
       'NOW delete event id ' || coalesce((select v from reset_b35915d1_report where k = 'event_id_removed'), 'MISSING')
       || ' (Fri 25 Sep 13:00-14:00 Lisbon) from the demo calendar. Not before every row above is PASS.'
order by ord;
