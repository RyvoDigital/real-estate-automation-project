-- ====== 0055 — a declaration is recorded once, whatever the resubmission ======
--
-- 🔴 NOT APPLIED. Manuel runs this by hand in the Supabase SQL editor, then runs
-- db/tests/0055_declaration_idempotency.test.sql WHOLE (its last output is its
-- verdict rows; every row must be PASS). Then the cockpit is pushed: /segmentation
-- checkpoints 1 and 2 go in ONE deploy.
--
-- Why (operator, 22 Sep 2026, /segmentation checkpoint 2). A declaration is one
-- act: the agency's person answers once, for a group. If the save succeeds and
-- the response is lost (a dropped connection in a meeting), the operator submits
-- again, and until now that wrote the whole declaration a second time: a second
-- act nobody made, dated a few seconds after the first.
--
-- The fix: the screen mints `declaration_id` when it DRAWS the form, and every row
-- of that act carries it. The same form submitted again carries the same id, and
-- this index refuses it (23505, by name). The cockpit reads that as "already
-- recorded", never as a failure, and writes nothing. A new form gets a new id,
-- so a genuine second declaration (the agency changed its answer) is a new act,
-- as it must be.
--
-- Shape:
--   * consent_events.declaration_id uuid, NULLABLE: every other kind of event, and
--     the five rows already in the table, have none;
--   * consent_events_one_row_per_declaration_and_contact: UNIQUE (declaration_id,
--     phone_e164), PARTIAL on declaration_id is not null. One act declares a
--     contact once; the INSERT is one statement, so a resubmission is refused
--     WHOLE, never half-applied;
--   * declaration_id_only_on_declarations: an id only on kind = 'declared';
--   * 🔴 screen_declarations_carry_their_id: a declaration made on the screen
--     (source 'agency_attestation') MUST carry its id, so the idempotency cannot
--     be bypassed by code that forgets it. The other declared source
--     (close_report, closes-store.ts, not wired yet) is not made to carry one:
--     a close's party is recorded once per close by construction.
--
-- ⚠️ THE WINDOW. Between this migration and the push, the LIVE /segmentation
-- still writes screen declarations without an id, so they are REFUSED (cleanly:
-- nothing is written) until the new build is live. Push straight after the proof.
--
-- Checked read-only before writing (22 Sep 2026): 5 rows in consent_events, 0 of
-- kind 'declared'; service_role holds INSERT and not UPDATE or DELETE; the views
-- consent_by_contact and invariant_send_after_objection depend on the table,
-- and adding a column does not change a view.
--
-- Append-only is untouched: ADD COLUMN and CREATE INDEX fire no row trigger, and
-- the triggers refusing UPDATE, DELETE and TRUNCATE stay as they are.

begin;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'consent_events' and column_name = 'declaration_id') then
    raise exception 'REFUSING: consent_events.declaration_id already exists. This file adds it; it does not alter it.';
  end if;
end $$;

alter table public.consent_events add column declaration_id uuid;

comment on column public.consent_events.declaration_id is
  'One declaration act: minted when the /segmentation form is drawn, carried by every row of that act. The same form submitted again is refused by consent_events_one_row_per_declaration_and_contact, and the cockpit reports it as already recorded (0055).';

alter table public.consent_events
  add constraint declaration_id_only_on_declarations
  check (declaration_id is null or kind = 'declared');

alter table public.consent_events
  add constraint screen_declarations_carry_their_id
  check (not (kind = 'declared' and source = 'agency_attestation') or declaration_id is not null);

create unique index consent_events_one_row_per_declaration_and_contact
  on public.consent_events (declaration_id, phone_e164)
  where declaration_id is not null;

-- ---------------------------------------------------------------------------
-- Postcondition, read back from the catalogue. If it raises, nothing above
-- is kept.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
     where c.relname = 'consent_events_one_row_per_declaration_and_contact'
       and i.indrelid = 'public.consent_events'::regclass
       and i.indisunique and i.indpred is not null and i.indnatts = 2) then
    raise exception 'REFUSING: the idempotency index is missing, not unique, not partial, or not on two columns.';
  end if;
  if (select count(*) from pg_constraint
       where conrelid = 'public.consent_events'::regclass
         and conname in ('declaration_id_only_on_declarations', 'screen_declarations_carry_their_id')) <> 2 then
    raise exception 'REFUSING: a declaration_id CHECK is missing.';
  end if;
  if not has_table_privilege('service_role', 'public.consent_events', 'INSERT')
     or has_table_privilege('service_role', 'public.consent_events', 'UPDATE')
     or has_table_privilege('service_role', 'public.consent_events', 'DELETE') then
    raise exception 'REFUSING: service_role must keep INSERT and must not hold UPDATE or DELETE on consent_events.';
  end if;
  if (select count(*) from pg_trigger
       where tgrelid = 'public.consent_events'::regclass
         and tgname in ('consent_events_no_update', 'consent_events_no_truncate')) <> 2 then
    raise exception 'REFUSING: an append-only trigger on consent_events is missing.';
  end if;
  raise notice '0055 applied: consent_events.declaration_id, its two CHECKs and the idempotency index.';
end $$;

commit;
