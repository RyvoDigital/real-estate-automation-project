-- ====== 0058 — Ryvo's own expiries: the manual rows, and the domain's date ======
--
-- 🔴 NOT APPLIED. Manuel runs this by hand in the Supabase SQL editor, then runs
-- db/tests/0058_ryvo_obligations.test.sql WHOLE (its last output is its verdict
-- rows; every row must be PASS).
--
-- Why (brief §2.3 "Ryvo's own expiries", /ops/expiries checkpoint 1, 22 Sep
-- 2026). The operator's own obligations lapse on dates nobody in the cockpit
-- holds: the certidão permanente, the procuração, the payment cards behind
-- every service, and the domain. The brief: "the manual rows need a small
-- table: label, kind, expiry, source, entered by, last checked. The migration is
-- written when the screen is built (C5), not before." This is it.
--
-- Shape:
--   * ryvo_obligations: one row per ACT on one obligation. An obligation is a
--     chain: the first row is `entered`; a later fact is a NEW row that
--     supersedes it — `corrected` (a value was wrong), `checked` (looked at the
--     document again, nothing changed: this is "last checked"), `renewed` (a new
--     date), `retired` (the card was cancelled, the procuração revoked).
--     APPEND-ONLY, 0050's shape (triggers refuse UPDATE, DELETE and TRUNCATE;
--     service_role SELECT and INSERT only; RLS on), and each row is superseded at
--     most once (ryvo_obligations_one_successor_each, 0054's lesson), so the
--     chain cannot fork.
--   * ryvo_obligations_current: the head of every chain that is not retired.
--   * the id is minted when the FORM IS DRAWN: the same form sent twice is 23505
--     on ryvo_obligations_pkey ("already recorded").
--   * 🔒 PER KIND, what an entry must hold:
--       certidao      an expiry date ("válida até"); never the access code
--       procuracao    an expiry date, OR no_expiry_stated = true said in so many
--                     words: never a blank (brief: "Never a blank and never a dash")
--       payment_card  brand, the LAST FOUR digits, expiry month and year, and
--                     the services charged to it; 🔴 NEVER A CARD NUMBER: no
--                     column can hold one, last_four is exactly four digits, and
--                     a run of 13+ digits (spaces and dashes ignored, and not
--                     written as a phone, +...) anywhere in the label, the
--                     services, the brand or the note is refused: a pasted number
--                     is refused, not stored. Card numbers are 13 to 19 digits
--                     and never start with "+". A first 8-digit rule refused a
--                     date (8 digits once its dashes go) and a 12-digit one a
--                     phone with its country code: both found in the dry run,
--                     22 Sep 2026, and both now proof case 15.
--   * health_runs.domain_expires_on: the registry's expiry for ryvodigital.com,
--     read over RDAP by healthcheck.sh on the server (infra/scripts/
--     healthcheck.sh, changed in this checkpoint, NOT deployed). A run that
--     could not read it leaves it null; the screen shows the last run that did,
--     with its age, never a stale date as clean (§2.3's stale-sweep rule).
--
-- Checked read-only before writing (22 Sep 2026): ryvo_obligations does not
-- exist; health_runs holds ran_at and n8n_api_key_exp and no domain column.

begin;

do $$
begin
  if to_regclass('public.ryvo_obligations') is not null then
    raise exception 'REFUSING: public.ryvo_obligations already exists. This file creates it; it does not alter it.';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'health_runs' and column_name = 'domain_expires_on') then
    raise exception 'REFUSING: health_runs.domain_expires_on already exists.';
  end if;
end $$;

create table public.ryvo_obligations (
  id uuid primary key,
  -- The chain this row belongs to: the first row's id. Every act on one obligation carries it.
  obligation_id uuid not null,
  supersedes_id uuid references public.ryvo_obligations(id) on delete restrict,
  act text not null,
  kind text not null,
  label text not null,
  expires_on date,
  no_expiry_stated boolean not null default false,
  card_brand text,
  card_last_four text,
  card_exp_month int,
  card_exp_year int,
  services text[],
  source text not null,
  note text,
  recorded_by text not null,
  recorded_at timestamptz not null default now(),

  constraint obligation_act_known check (act in ('entered', 'corrected', 'checked', 'renewed', 'retired')),
  constraint obligation_kind_known check (kind in ('certidao', 'procuracao', 'payment_card')),
  constraint obligation_source_is_manual check (source = 'manual'),
  constraint obligation_names_itself check (trim(label) <> ''),
  constraint obligation_names_who_recorded check (trim(recorded_by) <> ''),
  -- An entry starts a chain and supersedes nothing; every later act supersedes exactly one row.
  constraint obligation_chain_shape check ((act = 'entered') = (supersedes_id is null)),
  constraint obligation_first_row_is_the_chain check (act <> 'entered' or obligation_id = id),

  -- 🔒 THE CERTIDÃO: a date, always (a retirement needs none).
  constraint certidao_has_its_date check (kind <> 'certidao' or act = 'retired' or expires_on is not null),
  -- 🔒 THE PROCURAÇÃO: a date, or "no expiry stated" said in so many words; never both, never neither.
  constraint procuracao_date_or_stated check (kind <> 'procuracao' or act = 'retired' or ((expires_on is not null) <> no_expiry_stated)),
  constraint no_expiry_only_for_procuracao check (not no_expiry_stated or kind = 'procuracao'),

  -- 🔴 THE CARD: brand, last four, month and year, the services; and never a number.
  constraint card_is_described check (kind <> 'payment_card' or act = 'retired' or (
    coalesce(trim(card_brand), '') <> '' and card_last_four ~ '^[0-9]{4}$'
    and card_exp_month between 1 and 12 and card_exp_year between 2000 and 2100
    and coalesce(array_length(services, 1), 0) >= 1)),
  constraint card_fields_only_on_cards check (kind = 'payment_card' or (
    card_brand is null and card_last_four is null and card_exp_month is null and card_exp_year is null and services is null)),
  -- A run of 13+ digits, spaces and dashes removed, not written as a phone (+...).
  constraint no_card_number_anywhere check (
    regexp_replace(label, '[ -]', '', 'g') !~ '(^|[^+0-9])[0-9]{13,}'
    and regexp_replace(coalesce(note, ''), '[ -]', '', 'g') !~ '(^|[^+0-9])[0-9]{13,}'
    and regexp_replace(coalesce(array_to_string(services, ','), ''), '[ -]', '', 'g') !~ '(^|[^+0-9])[0-9]{13,}'
    and regexp_replace(coalesce(card_brand, ''), '[ -]', '', 'g') !~ '(^|[^+0-9])[0-9]{13,}')
);

comment on table public.ryvo_obligations is
  'Ryvo''s own expiries (brief §2.3): the certidão, the procuração, the payment cards. One row per act on an obligation; a chain per obligation; append-only; never a card number (0058).';

-- A chain cannot fork: each row is superseded at most once.
create unique index ryvo_obligations_one_successor_each on public.ryvo_obligations (supersedes_id) where supersedes_id is not null;
create index ryvo_obligations_chain on public.ryvo_obligations (obligation_id, recorded_at desc);

create function public.ryvo_obligations_append_only() returns trigger
language plpgsql as $$
begin
  raise exception using errcode = '42501',
    message = 'ryvo_obligations is append-only: a correction, a check, a renewal or a retirement is a NEW row (0058).';
end $$;

create trigger ryvo_obligations_no_update before update or delete on public.ryvo_obligations
  for each row execute function public.ryvo_obligations_append_only();
create trigger ryvo_obligations_no_truncate before truncate on public.ryvo_obligations
  for each statement execute function public.ryvo_obligations_append_only();

-- A successor must continue the SAME obligation and keep its kind: a card cannot become a procuração.
create function public.ryvo_obligations_chain_holds() returns trigger
language plpgsql as $$
declare prev record;
begin
  if new.supersedes_id is null then return new; end if;
  select obligation_id, kind into prev from public.ryvo_obligations where id = new.supersedes_id;
  if prev.obligation_id is distinct from new.obligation_id or prev.kind is distinct from new.kind then
    raise exception using errcode = '23514',
      message = 'ryvo_obligations: a later act must continue the same obligation and keep its kind (0058).';
  end if;
  return new;
end $$;

create trigger ryvo_obligations_chain before insert on public.ryvo_obligations
  for each row execute function public.ryvo_obligations_chain_holds();

-- The head of every chain, retired chains left out.
create view public.ryvo_obligations_current with (security_invoker = true) as
  select o.*
    from public.ryvo_obligations o
   where not exists (select 1 from public.ryvo_obligations s where s.supersedes_id = o.id)
     and o.act <> 'retired';

alter table public.ryvo_obligations enable row level security;
revoke all on public.ryvo_obligations from public, anon, authenticated;
revoke update, delete, truncate on public.ryvo_obligations from service_role;
grant select, insert on public.ryvo_obligations to service_role;
revoke all on public.ryvo_obligations_current from public, anon, authenticated, service_role;
grant select on public.ryvo_obligations_current to service_role;

-- ---------------------------------------------------------------------------
-- The domain's date, published by healthcheck.sh (as 0051 did the deploy key)
-- ---------------------------------------------------------------------------
alter table public.health_runs add column domain_expires_on date;
comment on column public.health_runs.domain_expires_on is
  'ryvodigital.com''s registry expiry, read over RDAP by healthcheck.sh. Null when this run could not read it: the screen shows the last run that did, with its age (0058).';

-- ---------------------------------------------------------------------------
-- Postcondition, read back from the catalogue. If it raises, nothing above
-- is kept.
-- ---------------------------------------------------------------------------
do $$
declare opts text[];
begin
  if not has_table_privilege('service_role', 'public.ryvo_obligations', 'INSERT')
     or not has_table_privilege('service_role', 'public.ryvo_obligations', 'SELECT')
     or has_table_privilege('service_role', 'public.ryvo_obligations', 'UPDATE')
     or has_table_privilege('service_role', 'public.ryvo_obligations', 'DELETE')
     or has_table_privilege('anon', 'public.ryvo_obligations', 'SELECT')
     or has_table_privilege('authenticated', 'public.ryvo_obligations', 'SELECT')
     or not has_table_privilege('service_role', 'public.ryvo_obligations_current', 'SELECT') then
    raise exception 'REFUSING: ryvo_obligations grants are not service_role SELECT+INSERT only (and SELECT on the view).';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.ryvo_obligations'::regclass
       and tgname in ('ryvo_obligations_no_update', 'ryvo_obligations_no_truncate', 'ryvo_obligations_chain')) <> 3 then
    raise exception 'REFUSING: a ryvo_obligations trigger is missing.';
  end if;
  if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                  where c.relname = 'ryvo_obligations_one_successor_each' and i.indisunique and i.indpred is not null) then
    raise exception 'REFUSING: ryvo_obligations_one_successor_each is missing, not unique, or not partial.';
  end if;
  select reloptions into opts from pg_class where oid = 'public.ryvo_obligations_current'::regclass;
  if opts is null or not ('security_invoker=true' = any (opts)) then
    raise exception 'REFUSING: ryvo_obligations_current lost security_invoker.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.ryvo_obligations'::regclass) then
    raise exception 'REFUSING: RLS is off on ryvo_obligations.';
  end if;
  raise notice '0058 applied: ryvo_obligations (append-only), ryvo_obligations_current, health_runs.domain_expires_on.';
end $$;

commit;
