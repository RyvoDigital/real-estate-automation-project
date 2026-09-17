-- ============ message_templates — what may be said ============
--
-- One row per APPROVED VERSION of a template, per client. Not one row per
-- template: Meta approves TEXT, not a name, so an edit is a new submission, a
-- new approval and a new id -- and the old id may still have messages in flight
-- under it. A template is therefore never a row that changes.
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ THIS TABLE ANSWERS "WHAT MAY BE SAID". IT MUST NEVER ANSWER "TO WHOM".  │
-- │                                                                         │
-- │ The gate decides who may receive a message. A template that knows its   │
-- │ own audience has already made half that decision somewhere the gate     │
-- │ cannot see.                                                             │
-- │                                                                         │
-- │ NAMED EXAMPLES OF COLUMNS THAT MUST NEVER APPEAR HERE, because a rule   │
-- │ with examples survives where a principle alone does not -- and because  │
-- │ each of these will be proposed by somebody solving a reasonable local   │
-- │ problem:                                                                │
-- │                                                                         │
-- │   default_recipients      looks helpful                                 │
-- │   auto_send_on_approval   looks like a convenience                      │
-- │   send_to_segment         looks like configuration                      │
-- │   schedule                looks like scheduling                         │
-- │   enabled_for_campaign    looks like a feature flag                     │
-- │                                                                         │
-- │ Every one of them turns a record of what was approved into a campaign   │
-- │ definition, and something will eventually read it and act.              │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- THE TEXT IS FROZEN; THE STATUS IS NOT. That is the seam, and it is the one
-- `sends` already has. §9 of legal/modelos/modelos-whatsapp.md: "O texto
-- aprovado é imutável… conservar o texto exacto de cada versão aprovada" --
-- Clause 12 of the DPA requires demonstrating what was communicated and when.
-- Meanwhile Meta may pause, disable or re-approve a template days later, on its
-- own initiative and without asking.
--
-- WHY THERE IS NO STATUS HISTORY, AND THE ONE READ THAT NEARLY BROKE THE
-- ARGUMENT
-- The reasoning was "nothing reads status except the send path, which snapshots
-- what authorised it". An audit of the readers found four:
--
--   send path            reads at send time; the send row names the approval id,
--                        whose text is frozen. Answered.
--   operator screen      reads CURRENT status. A "now" question, no history
--                        needed.
--   orphan sweep         MUST NOT READ STATUS AT ALL. A message sent under a
--                        template Meta disabled yesterday is still one of ours,
--                        and a vocabulary filtered to `approved` would make
--                        every orphan under it invisible. The sweep asks "is
--                        this one of ours", never "may we send this".
--   campaign forecast    READS AT A DIFFERENT MOMENT. Phase 1 says "20
--                        contactable with template X" at 09:00; Meta pauses X at
--                        10:00; phase 2 re-decides at 14:00. Without a snapshot,
--                        "why did the forecast say 20" has no answer.
--
-- So the forecast snapshots, exactly as the send record does (§11b): see the
-- campaign_runs columns at the bottom of this file. With that, no status history
-- is needed, and the day one is needed is the day a Meta dispute asks about a
-- WINDOW rather than an instant.

-- Contiguity is checkable, so it is checked: Meta rejects non-contiguous
-- variable numbering and finding that out at submission costs a day of round
-- trip. IMMUTABLE so a CHECK constraint may call it.
create or replace function public.template_variables_contiguous(body text)
returns boolean language plpgsql immutable as $$
declare
  nums int[];
  i int;
begin
  select coalesce(array_agg(distinct (m[1])::int order by (m[1])::int), '{}')
    into nums
  from regexp_matches(coalesce(body, ''), '\{\{(\d+)\}\}', 'g') as m;

  if array_length(nums, 1) is null then return true; end if;   -- no variables is fine
  for i in 1 .. array_length(nums, 1) loop
    if nums[i] <> i then return false; end if;                 -- must be exactly 1..n
  end loop;
  return true;
end;
$$;

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,

  name text not null,
  language text not null,                          -- pt_PT, es_ES, en_GB
  version integer not null,                        -- ours, monotonic per name+language

  -- ---- FROZEN -------------------------------------------------------------
  body text not null,                              -- the exact approved text, with {{n}}
  category text not null check (category in ('marketing', 'utility', 'authentication')),
  approval_id text,                                -- Meta's id. What a send names
  submitted_at timestamptz,
  approved_at timestamptz,
  source_document text,                            -- e.g. legal/modelos/... §3.2

  -- ---- MUTABLE, because Meta changes them without asking -------------------
  status text not null default 'submitted'
    check (status in ('submitted', 'approved', 'rejected', 'paused', 'disabled')),
  status_changed_at timestamptz not null default now(),
  status_note text,
  quality_rating text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Per WhatsApp Business Account, so per client. There is no shared template
  -- row even where two agencies use identical text: the approval belongs to the
  -- account, and a shared row would let one client's campaign send under
  -- another's approval -- which Meta rejects, and which would put one agency's
  -- identifier in another's send record.
  constraint message_templates_identity unique (client_id, name, language, version),
  constraint message_templates_approval_unique unique (approval_id),

  -- An approved row has the two things that make it approved.
  constraint approved_has_its_approval check (
    status <> 'approved' or (approval_id is not null and approved_at is not null)),

  constraint variables_are_contiguous check (public.template_variables_contiguous(body)),
  constraint no_zero_variable check (body !~ '\{\{0\}\}')
);

create index if not exists message_templates_client_idx
  on public.message_templates (client_id, name, language, version desc);

-- The sweep reads EVERY recorded template for a client regardless of status, so
-- this index deliberately has no status predicate.
create index if not exists message_templates_vocabulary_idx
  on public.message_templates (client_id);

-- ---------------------------------------------------------------------------
-- THE TEXT IS FROZEN. ALLOWLIST, NOT DENYLIST (0017's lesson).
-- ---------------------------------------------------------------------------
create or replace function public.message_templates_freeze()
returns trigger language plpgsql as $$
declare
  mutable constant text[] := array[
    'status', 'status_changed_at', 'status_note', 'quality_rating', 'updated_at'
  ];
  changed text[];
begin
  select array_agg(key order by key) into changed
  from jsonb_each(to_jsonb(new)) n
  where not (n.key = any(mutable))
    and n.value is distinct from (to_jsonb(old) -> n.key);

  if changed is not null then
    raise exception
      'message_templates: the approved text is immutable. Refused change to: %. '
      'An edit is a NEW SUBMISSION and a new row -- Meta approves text, not a name, '
      'and the old approval may still have messages in flight under it. '
      'Only % may change.',
      array_to_string(changed, ', '), array_to_string(mutable, ', ');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists message_templates_freeze_trg on public.message_templates;
create trigger message_templates_freeze_trg before update on public.message_templates
  for each row execute function public.message_templates_freeze();

alter table public.message_templates enable row level security;
revoke all on public.message_templates from anon, authenticated;
grant select, insert, update on public.message_templates to service_role;

comment on table public.message_templates is
  'One row per APPROVED VERSION, per client. Answers what may be said, never to whom. See docs/templates-design.md.';

-- ---------------------------------------------------------------------------
-- sends: the approval id becomes real and becomes required
-- ---------------------------------------------------------------------------
-- A legitimate join target under §11b: the row it points at has frozen text.
alter table public.sends
  add constraint sends_template_approval_fk
  foreign key (template_approval_id) references public.message_templates(approval_id);

-- Outside the 24-hour window WhatsApp permits nothing but templates, so a
-- business-initiated send with no approval id is not a thing that can lawfully
-- exist. Done while `sends` is empty, which is the moment to do it.
alter table public.sends
  add constraint sent_names_its_template
  check (status <> 'sent' or template_approval_id is not null);

-- ---------------------------------------------------------------------------
-- campaign_runs: the forecast snapshots what it relied on
-- ---------------------------------------------------------------------------
-- The read that nearly cost us the status history. A forecast taken at 09:00 and
-- acted on at 14:00 must record the template AND its status at the moment it
-- decided, or "why did the forecast say 20" has no answer after Meta pauses it.
alter table public.campaign_runs
  add column if not exists template_approval_id text,
  add column if not exists template_status_at_forecast text;

comment on column public.campaign_runs.template_status_at_forecast is
  'The template''s status when the forecast was taken. Snapshot, not a join: status is mutable and Meta changes it (§11b).';

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select public.template_variables_contiguous('Olá {{1}} em {{2}}');   -- t
--   select public.template_variables_contiguous('Olá {{1}} em {{3}}');   -- f
--   select public.template_variables_contiguous('sem variáveis');        -- t
--
--   begin;
--     insert into public.message_templates (client_id, name, language, version, body, category)
--     select id, 'proof', 'pt_PT', 1, 'Olá {{1}} em {{3}}', 'marketing' from public.clients limit 1;
--     -- expect: ERROR ... variables_are_contiguous
--   rollback;
--
--   begin;
--     insert into public.message_templates (client_id, name, language, version, body, category, status)
--     select id, 'proof', 'pt_PT', 1, 'Olá {{1}}', 'marketing', 'approved' from public.clients limit 1;
--     -- expect: ERROR ... approved_has_its_approval
--   rollback;
--
--   begin;
--     insert into public.message_templates (client_id, name, language, version, body, category,
--       status, approval_id, approved_at)
--     select id, 'proof', 'pt_PT', 1, 'Olá {{1}}', 'marketing', 'approved', 'HX_PROOF', now()
--       from public.clients limit 1;
--     update public.message_templates set status = 'paused', status_changed_at = now()
--      where approval_id = 'HX_PROOF';                       -- expect: UPDATE 1
--     update public.message_templates set body = 'Olá {{1}}!' where approval_id = 'HX_PROOF';
--     -- expect: ERROR ... the approved text is immutable. Refused change to: body
--   rollback;
--
--   begin;
--     insert into public.sends (client_id, phone_e164, automation, idempotency_key,
--       gate_verdict, gate_decided_at, status, template_approval_id)
--     select id, '+351911111111', 'proof', 'proof-0020', 'permitted', now(), 'intended', 'HX_NOT_REAL'
--       from public.clients limit 1;
--     -- expect: ERROR ... sends_template_approval_fk
--   rollback;
