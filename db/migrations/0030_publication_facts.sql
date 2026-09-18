-- ============ listing_facts and agency_facts — Automation 04 ============
--
-- The facts that satisfy a jurisdiction's requirements (0029). Additive: this
-- migration adds nothing that competes with 0028's columns yet, and 0032 is
-- where those are dropped — deliberately a separate, deliberate act.
--
-- ---------------------------------------------------------------------------
-- WHY TWO TABLES AND NOT ONE "credentials"
-- ---------------------------------------------------------------------------
-- They are different kinds of fact with different failure modes, and flattening
-- them produces a gate that cannot say what is wrong:
--
--   A PROPERTY RATING belongs to the property. It fails by being absent,
--   expired, or -- in Spain -- UNREGISTERED.
--
--   AN AGENCY REGISTRATION belongs to the agency, and in Spain to the agency
--   IN A REGION. It fails by being absent, REVOKED, or held for the wrong
--   region. An agency operating in Cataluña and Valencia holds two, and one
--   does not satisfy the other's requirement -- which no single column on
--   `clients` can express.
--
-- ⚠️ AND "UNREGISTERED" IS NOT "EXPIRED". A Spanish certificate inside its ten
-- years that was never lodged with the comunidad autónoma has no official
-- validity. It is a FILING problem. An operator told "expired" goes and buys a
-- new certificate, which is the wrong action, costs the agency money, and does
-- not fix it. Different fact, different sentence, different action -- so
-- `registration_status` is its own column and not a flavour of validity.

create table if not exists public.listing_facts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,

  -- Which requirement this satisfies, from advertising_policy.requires[].id.
  -- Deliberately NOT a foreign key: requirements live inside a jsonb array, and
  -- a policy row may be rewritten as a jurisdiction changes. The gate resolves
  -- the id at decision time and a fact for an id nobody requires any more is
  -- simply never asked for -- which is the correct outcome, not an error.
  requirement_id text not null,

  -- Shape declared by the requirement. Portugal: {"class":"B"}.
  -- Spain: {"emissions":{"letter":"D"},"consumption":{"letter":"E"}}.
  values jsonb not null,

  certificate_number text,
  valid_from date,
  valid_until date,

  -- Where registration is what CONFERS validity (Spain). 'not_required' is the
  -- Portuguese answer and is a real value, not a null: null would mean nobody
  -- has said, and the gate would have to guess which country it was in.
  registration_status text not null default 'not_required'
    check (registration_status in ('not_required', 'registered', 'not_registered', 'unknown')),
  registered_with text,
  registered_at date,

  -- §5: typing is the universal path; a lookup is an upgrade. A fact is only
  -- ever one of these two -- a lookup RESULT that nobody has confirmed is a
  -- proposal and lives in fact_proposals, where it satisfies nothing.
  source text not null check (source in ('typed', 'lookup_confirmed')),
  confirmed_by text,
  confirmed_at timestamptz,

  -- The exemption declaration, where the requirement is exemptible. Same
  -- artefact as 0024 and 0028: a named person, their words, a date.
  exemption jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A rating we cannot date is a rating we cannot defend (0028's rule, moved).
  constraint fact_values_are_dated
    check (exemption is not null or valid_until is not null),

  -- An exemption with no author or no basis is a blank cheque, not a
  -- declaration -- and it would become the door everything walks through.
  constraint fact_exemption_is_a_declaration
    check (
      exemption is null
      or (coalesce(exemption ->> 'declared_by', '') <> ''
          and coalesce(exemption ->> 'basis', '') <> ''
          and coalesce(exemption ->> 'at', '') <> '')
    ),

  -- A fact obtained from a register must say who at the agency confirmed it.
  -- §5.2: the system proposes, the agency confirms -- and an unconfirmed
  -- lookup is not a fact at all.
  constraint fact_lookup_is_confirmed
    check (source <> 'lookup_confirmed'
           or (confirmed_by is not null and confirmed_at is not null))
);

-- One CURRENT fact per requirement per listing. Partial, because superseded
-- facts are kept: nothing upserts here (the caller reads, then inserts or
-- updates by id), so no ON CONFLICT is emitted and 42P10 cannot apply.
create unique index if not exists listing_facts_current
  on public.listing_facts (listing_id, requirement_id);

create index if not exists listing_facts_expiry
  on public.listing_facts (client_id, valid_until)
  where valid_until is not null;

alter table public.listing_facts enable row level security;

-- ---------------------------------------------------------------------------

create table if not exists public.agency_facts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  requirement_id text not null,

  -- The registration is held FOR a jurisdiction. A Catalan AICAT number does
  -- not satisfy Valencia's requirement, and the columns have to say so.
  country text not null,
  region text,

  number text not null,
  authority text,

  -- §6.2: IMPIC suspends and cancels, and publishes the list. A licence in our
  -- record is not a licence valid today.
  --
  -- 'unknown' IS NOT 'valid'. A registration nobody has checked since it was
  -- typed is one whose status we do not know, and after some interval the
  -- system should say so rather than go on asserting.
  status text not null default 'unknown'
    check (status in ('valid', 'suspended', 'cancelled', 'unknown')),
  status_checked_at timestamptz,

  source text not null check (source in ('typed', 'lookup_confirmed')),
  confirmed_by text,
  confirmed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint agency_fact_country_iso check (country ~ '^[A-Z]{2}$'),
  constraint agency_fact_region_code check (region is null or region ~ '^[A-Z0-9-]{2,8}$'),
  constraint agency_fact_status_is_dated
    check (status = 'unknown' or status_checked_at is not null),
  constraint agency_fact_lookup_is_confirmed
    check (source <> 'lookup_confirmed'
           or (confirmed_by is not null and confirmed_at is not null))
);

create unique index if not exists agency_facts_current
  on public.agency_facts (client_id, requirement_id, coalesce(region, '-'));

alter table public.agency_facts enable row level security;

-- ---------------------------------------------------------------------------
-- fact_proposals -- what a lookup found, and nothing more
-- ---------------------------------------------------------------------------
-- §5: the system proposes, the agency confirms. A row here SATISFIES NOTHING.
-- It is deliberately a separate table rather than a status on a fact, so that
-- "the gate can see it" is false by construction rather than by a WHERE clause
-- somebody might forget.
--
-- `disagrees_with_typed` is recorded and never acted on (§4.7): a disagreement
-- means one of the two is wrong about the agency's own property, and that is
-- worth their attention rather than our arbitration.

create table if not exists public.fact_proposals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  requirement_id text not null,

  found jsonb not null,
  disagrees_with_typed boolean not null default false,
  register text not null,
  fetched_at timestamptz not null default now(),

  -- When these are set the proposal has become a fact and the fact row carries
  -- source='lookup_confirmed'. Set here too, so the proposal records its own
  -- outcome rather than being deleted.
  confirmed_at timestamptz,
  confirmed_by text,

  constraint proposal_confirmed_has_author
    check ((confirmed_at is null) = (confirmed_by is null))
);

create index if not exists fact_proposals_open
  on public.fact_proposals (client_id, requirement_id)
  where confirmed_at is null;

alter table public.fact_proposals enable row level security;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING -- through PostgREST, not psql alone (0002, 0003)
-- ---------------------------------------------------------------------------
--   select has_table_privilege('service_role','public.listing_facts','INSERT'); -- t
--   select has_table_privilege('anon','public.agency_facts','SELECT');          -- f
--
-- Each constraint proven by TRYING TO BREAK IT, and each with its neighbour:
--
--   -- a rating with no expiry and no exemption is refused
--   insert into listing_facts (client_id, listing_id, requirement_id, values, source)
--     values (…, 'pt_energy_class', '{"class":"B"}', 'typed');
--   -- expect: violates "fact_values_are_dated"
--   -- …and the SAME row with valid_until set is accepted   ← the neighbour
--
--   -- an exemption with no basis is refused
--   … exemption = '{"declared_by":"A. Ferreira"}'
--   -- expect: violates "fact_exemption_is_a_declaration"
--   -- …and one with declared_by + basis + at is accepted
--
--   -- a lookup nobody confirmed is not a fact
--   … source = 'lookup_confirmed', confirmed_by = null
--   -- expect: violates "fact_lookup_is_confirmed"
--
--   -- a status other than 'unknown' must say when it was checked
--   insert into agency_facts (…, status) values (…, 'valid');
--   -- expect: violates "agency_fact_status_is_dated"
--   -- …and 'valid' WITH status_checked_at is accepted
--
--   -- a region name rather than a code
--   insert into agency_facts (…, region) values (…, 'Cataluña');
--   -- expect: violates "agency_fact_region_code"
--
-- Roll all of it back. Nothing here should survive the check.
