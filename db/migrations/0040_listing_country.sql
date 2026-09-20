-- ============ listings.country — Automation 04 ============
--
-- 0031 added `region` and said why it is entered by a person: deciding a
-- region applies a legal requirement or removes one, and a string match that
-- produces a legal conclusion is a guess with a citation attached.
--
-- 🔴 IT ADDED THE REGION AND NOT THE COUNTRY, AND NOTHING NOTICED FOR A MONTH.
--
-- `decidePublication` takes a country. Nothing in this database holds one:
-- not on `listings`, not on `clients`, nowhere. The gate has been complete and
-- correct and unable to be asked a question it could answer — found on
-- 20 September 2026 while writing its first caller.
--
-- ---------------------------------------------------------------------------
-- WHY NOT DERIVE IT
-- ---------------------------------------------------------------------------
-- Three things look like they would do, and each is the guess 0031 refuses:
--
--   clients.timezone      'Europe/Lisbon' is not a jurisdiction. It is where
--                         the agency's day starts, and an agency in Lisbon may
--                         hold a property in Spain.
--   listings.area         a town name. "Cascais" resolving to PT is the exact
--                         string match that produces a legal conclusion, and
--                         "Valencia" is a province in Spain and a town in
--                         three other countries.
--   agency_facts.country  where the AGENCY is registered, which is a fact
--                         about the agency. A Portuguese agency listing a
--                         Spanish property would be judged under Portuguese
--                         law by a column that never claimed to say that.
--
-- So it is entered, exactly as the region is, and a property with no country
-- is not judged at all — the decision path refuses to ask rather than asking
-- with a null and receiving "we have not analysed this country", which is
-- false about a country we have analysed.
--
-- ---------------------------------------------------------------------------
-- 🔴 IT PROVES ITS PRECONDITIONS. IT DOES NOT ASSUME THEM.  (0032's treatment)
-- ---------------------------------------------------------------------------
-- Adding a nullable column is not destructive, so the preconditions are about
-- landing where this one is meant to land: `listings` exists, `region` is
-- already there (this is its pair, and a country arriving without it would
-- mean 0031 was skipped), and no `country` column exists under some other
-- meaning.

do $$
declare
  n_table   bigint;
  n_region  bigint;
  n_country bigint;
begin
  select count(*) into n_table from information_schema.tables
   where table_schema = 'public' and table_name = 'listings';
  select count(*) into n_region from information_schema.columns
   where table_schema = 'public' and table_name = 'listings' and column_name = 'region';
  select count(*) into n_country from information_schema.columns
   where table_schema = 'public' and table_name = 'listings' and column_name = 'country';

  if n_table = 0 then
    raise exception 'REFUSING: public.listings does not exist. 0009 comes first.';
  end if;

  if n_region = 0 then
    raise exception
      'REFUSING: listings.region is missing, so 0031 has not been applied. '
      'A country without its region is half of the jurisdiction the gate '
      'resolves, and adding it alone would let a listing be judged nationally '
      'in a country whose policy row says region_required.';
  end if;

  if n_country > 0 then
    raise exception
      'REFUSING: listings.country already exists. Nothing has been altered. '
      'Look at what is in it before deciding whether it means the same thing '
      'this migration means — an ISO-3166 alpha-2 code naming the jurisdiction '
      'whose advertising law applies to this property.';
  end if;

  raise notice 'Preconditions proven, not assumed. Adding listings.country.';
end $$;

alter table public.listings
  add column if not exists country text;

-- The same shape as advertising_policy.country and agency_facts.country, so a
-- join is a comparison rather than a normalisation. Upper-case, two letters,
-- never a name: "Portugal", "PT" and "prt" would be three values for one
-- place, which is the mistake 0029's region check already names.
alter table public.listings
  drop constraint if exists listing_country_iso;
alter table public.listings
  add constraint listing_country_iso
  check (country is null or country ~ '^[A-Z]{2}$');

comment on column public.listings.country is
  'ISO-3166 alpha-2, entered by a person and never inferred — not from the town, not from the agency''s timezone, and not from where the agency is registered. Null means nobody has said, and the publication gate is not asked at all rather than being asked with a null.';

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select column_name, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'listings' and column_name = 'country';
--   -- expect: country | YES | (null)  — nullable, NO DEFAULT. A default would
--   --         assert a jurisdiction for every property nobody has looked at.
--
--   update public.listings set country = 'Portugal' where id = '<one>';
--   -- expect: violates listing_country_iso; roll it back
--
--   update public.listings set country = 'PT' where id = '<one>';
--   -- expect: accepted
