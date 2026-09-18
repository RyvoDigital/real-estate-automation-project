-- ============ advertising_policy — Automation 04 ============
--
-- WHY THIS IS A SECOND TABLE AND NOT COLUMNS ON `jurisdiction_policy`.
--
-- That table answers "may we message this PERSON", resolved from their dialling
-- prefix, under GDPR and ePrivacy. This one answers "may this PROPERTY be
-- advertised", resolved from WHERE THE PROPERTY IS, under estate-agency and
-- advertising law.
--
-- One table answering both would let a caller satisfy the first and believe it
-- covered the second — which is precisely the failure
-- cockpit/tests/two-gates.test.ts exists to prevent, recreated one level down
-- in the data. Two gates, two subjects, two tables.
--
-- WHAT CARRIES OVER UNCHANGED, and it is copied deliberately:
--   * a missing row REFUSES. An unanalysed country is a stop, never a shrug
--   * a row is INERT until a lawyer confirms it (confirmed_at + confirmed_by)
--   * a confirmation names its author. A date with no name is a date
--
-- ---------------------------------------------------------------------------
-- THE RULE LIVES BELOW THE COUNTRY
-- ---------------------------------------------------------------------------
-- Spain's energy obligation is national in principle and regional in operation:
-- the certificate is registered with the órgão competente of the comunidad
-- autónoma and has NO OFFICIAL VALIDITY until it is. Seventeen registers, no
-- national ADENE. And agency registration is not national at all — mandatory in
-- Cataluña (AICAT) and Comunitat Valenciana (RAICV), voluntary in Madrid,
-- Canarias, Baleares and Navarra, absent elsewhere, and a registration in one
-- region does not carry to another.
--
-- So a Barcelona property carries a requirement the same agency's Zaragoza
-- property does not, and the primary key has to hold that.
--
-- ---------------------------------------------------------------------------
-- REQUIREMENTS ARE TYPED, AND THEY LAYER
-- ---------------------------------------------------------------------------
-- `requires` declares WHAT FACTS MUST BE PRESENT, not which columns to read.
-- That is the whole point: Portugal needs one single-letter rating and one
-- national registration; Spain needs two ratings whose validity comes from
-- registration; a third country will need something else again, and none of
-- them should require a migration to express.
--
-- A region's requirements ACCUMULATE on top of its country's. A region may add
-- and never remove — stated as an assumption rather than a fact, because it
-- holds for every case researched so far and a country where a region RELAXES a
-- national rule is a change to make with evidence in hand.
--
-- ---------------------------------------------------------------------------
-- ONE DELIBERATE ASYMMETRY, AND WHERE THE SAFETY COMES FROM
-- ---------------------------------------------------------------------------
-- An absent COUNTRY refuses. An absent REGION adds nothing — because Aragón
-- genuinely has no agency register, and demanding one would refuse a lawful
-- advertisement, which is how an agency stops using the system.
--
-- That inversion is only safe because of `regions_exhaustive`: the country row
-- must SAY that somebody enumerated the regions which add requirements and that
-- the rest add none. Without the flag, a missing region refuses. So the default
-- is still deny, and the flag is where a person takes responsibility for the
-- enumeration and a lawyer confirms it — rather than the system assuming a list
-- is complete because nobody has added to it.

create table if not exists public.advertising_policy (
  country text not null,
  -- Null is THE NATIONAL ROW. Not '' — a null region and an empty-string region
  -- would be two different rows meaning the same thing.
  region text,

  /*
   * Typed requirements. One shape, several kinds:
   *
   *   { "id": "pt_energy_class", "kind": "property_rating",
   *     "shape": "single_letter", "scale": "A+..F", "exemptible": true }
   *
   *   { "id": "pt_ami", "kind": "agency_registration",
   *     "scope": "national", "authority": "IMPIC", "revocable": true }
   *
   * `effective_from` / `effective_until` are optional and are what let Madrid
   * move to mandatory on a date without anybody editing a row that day. The
   * gate resolves the requirement set AS OF NOW — a permission that can expire
   * without anyone acting has to be re-asked, and so does an obligation that
   * can arrive without anyone acting.
   */
  requires jsonb not null default '[]',

  -- §2.4. Only meaningful on a national row.
  regions_exhaustive boolean not null default false,
  -- When true, a listing with no region in this country REFUSES rather than
  -- being judged against the national row alone.
  region_required boolean not null default false,

  statute text,
  authority text,
  traps text,

  -- INERT UNTIL BOTH ARE SET. Identical to 0014, and for the identical reason.
  confirmed_at timestamptz,
  confirmed_by text,
  confirmed_note text,

  researched_at timestamptz default now(),
  source_note text,
  updated_at timestamptz default now(),

  constraint advertising_confirmed_has_author
    check ((confirmed_at is null) = (confirmed_by is null)),
  constraint advertising_country_iso check (country ~ '^[A-Z]{2}$'),
  -- A region code is the jurisdiction's own, upper-case, no spaces. Never a
  -- name: "Cataluña", "Catalunya" and "Catalonia" are three rows for one place.
  constraint advertising_region_code check (region is null or region ~ '^[A-Z0-9-]{2,8}$'),
  -- Flags describe a COUNTRY. A region row claiming to have enumerated the
  -- regions is a row saying something about its siblings.
  constraint advertising_flags_are_national
    check (region is null or (regions_exhaustive = false and region_required = false))
);

-- The national row and a region row must be distinguishable, and a null region
-- does not participate in a plain unique index. Non-partial, because nothing
-- upserts here today and 42P10 (0003, 0004) is the defect that follows from
-- assuming otherwise.
create unique index if not exists advertising_policy_key
  on public.advertising_policy (country, coalesce(region, '-'));

alter table public.advertising_policy enable row level security;

-- ---------------------------------------------------------------------------
-- PORTUGAL, RESEARCHED AND NOT CONFIRMED
-- ---------------------------------------------------------------------------
-- ⚠️ `confirmed_at` is NULL, so this row PERMITS NOTHING and every Portuguese
-- property refuses with `policy_not_confirmed`.
--
-- That is deliberate and it is the same posture 0014 takes. The obligations
-- themselves are not in doubt — what is unconfirmed is OUR ENCODING of them,
-- and the difference between those two is exactly what the flag exists to
-- record. Carving out an exception for the country we happen to feel sure about
-- would make the flag mean "somebody was confident" rather than "a lawyer
-- confirmed", which is the only thing it can usefully mean.
--
-- To make Portugal publishable: a lawyer reads this row and sets confirmed_at
-- and confirmed_by. One sentence, and it is on the list for the next batch.

insert into public.advertising_policy
  (country, region, requires, regions_exhaustive, region_required,
   statute, authority, traps, source_note)
values (
  'PT', null,
  '[
     {"id": "pt_energy_class", "kind": "property_rating",
      "shape": "single_letter", "scale": "A+..F", "exemptible": true,
      "authority": "ADENE"},
     {"id": "pt_ami", "kind": "agency_registration",
      "scope": "national", "authority": "IMPIC", "revocable": true}
   ]'::jsonb,
  true,   -- Portugal does not regulate this regionally: one national answer
  false,
  'Classe energética obrigatória em anúncio desde 2013 (regime do CE/ADENE). '
  'Licença AMI: Lei n.º 15/2013, divulgação em toda a publicidade e documentação.',
  'IMPIC; ADENE',
  'Coimas para pessoas colectivas: 2.500 a 44.890 euros — NÃO o escalão de '
  'particulares (250 a 3.741). A licença AMI pode ser suspensa ou cancelada e o '
  'IMPIC publica a lista, pelo que é um estado e não um facto permanente.',
  'docs/automation-04-advertising-jurisdiction-design.md; enquadramento §8.A'
)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING -- through PostgREST, not psql alone (0002, 0003)
-- ---------------------------------------------------------------------------
--   select has_table_privilege('service_role','public.advertising_policy','SELECT'); -- t
--   select has_table_privilege('anon','public.advertising_policy','SELECT');         -- f
--
--   -- the PT row exists and PERMITS NOTHING
--   select country, region, confirmed_at, jsonb_array_length(requires)
--     from advertising_policy;
--   -- expect: PT, null, NULL, 2
--
-- And each constraint proven by trying to break it:
--
--   insert into advertising_policy (country) values ('pt');
--   -- expect: violates "advertising_country_iso"  (lower case is a different row)
--
--   insert into advertising_policy (country, region) values ('ES', 'Cataluña');
--   -- expect: violates "advertising_region_code"  (a name, not a code)
--
--   insert into advertising_policy (country, region, regions_exhaustive)
--     values ('ES', 'CT', true);
--   -- expect: violates "advertising_flags_are_national"
--
--   insert into advertising_policy (country, confirmed_at) values ('ES', now());
--   -- expect: violates "advertising_confirmed_has_author"
--
--   -- and the national row cannot be duplicated
--   insert into advertising_policy (country) values ('PT');
--   -- expect: duplicate key on advertising_policy_key
--
-- Roll it all back except the PT row.
