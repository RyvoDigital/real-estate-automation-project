-- ============ listings.region — Automation 04 ============
--
-- Where the property is, for the advertising jurisdiction (0029). Additive and
-- nullable: a listing arrives from a WhatsApp message long before anybody has
-- thought about which comunidad autónoma it is in, and refusing the row would
-- mean an agent cannot record a property at all. The TABLE accepts an
-- incomplete property; the GATE refuses to advertise one.
--
-- ---------------------------------------------------------------------------
-- ⚠️ THE REGION IS DECLARED. IT IS NEVER INFERRED FROM `area`.
-- ---------------------------------------------------------------------------
-- `listings.area` is a free-text town or zone, matched against a per-client
-- list — and §4.3 already refuses a hardcoded gazetteer for MATCHING, where the
-- cost of being wrong is a lead shown the wrong house.
--
-- Here the cost is different in kind. Deciding that "Sant Cugat" is in Cataluña
-- applies a mandatory agency-registration requirement to a property; deciding
-- it is not, removes one. Either way the system would have drawn a LEGAL
-- CONCLUSION FROM A STRING MATCH, and it would look authoritative in the
-- record: a guess with a citation attached.
--
-- So the region is entered by a person, and a country whose policy row says
-- `region_required` refuses a listing that has none — the same deny-by-default
-- as a missing policy row, for the same reason.
--
-- Portugal does not regulate this regionally (0029 seeds region_required =
-- false), so this column stays null for every Portuguese property and costs
-- nobody anything. It exists now because adding it later means adding it to a
-- table that has rows.

alter table public.listings
  add column if not exists region text;

-- Same code discipline as 0029 and 0030: a code, never a name. "Cataluña",
-- "Catalunya" and "Catalonia" are three values for one place, and the day they
-- coexist is the day a requirement silently stops matching.
alter table public.listings
  drop constraint if exists listing_region_code;
alter table public.listings
  add constraint listing_region_code
  check (region is null or region ~ '^[A-Z0-9-]{2,8}$');

comment on column public.listings.region is
  'Jurisdiction code where the property IS — declared, never inferred from `area`. '
  'Null is "not stated": lawful in Portugal, refused where region_required.';

create index if not exists listings_region_idx
  on public.listings (client_id, region)
  where region is not null;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   -- a code is accepted
--   update listings set region = 'CT' where id = '<the listing>';   -- ok
--   -- a NAME is refused
--   update listings set region = 'Cataluña' where id = '<the listing>';
--   -- expect: violates "listing_region_code"
--   -- and null stays lawful, because Portugal does not regulate regionally
--   update listings set region = null where id = '<the listing>';   -- ok
--
-- Roll it back; the listing keeps whatever it had.
