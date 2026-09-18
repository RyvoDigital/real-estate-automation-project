-- ============ dropping 0028's columns — Automation 04 ============
--
-- ⚠️ THE ONLY DESTRUCTIVE MIGRATION IN THIS SERIES. It is alone, and last, so
-- that applying it is a deliberate act rather than a line in a batch.
--
-- ---------------------------------------------------------------------------
-- WHY THEY GO
-- ---------------------------------------------------------------------------
-- 0028 added `energy_class`, `energy_certificate_number`,
-- `energy_certificate_expires_at`, `energy_exemption` to `listings`, and
-- `ami_licence` to `clients`. They were THE RIGHT FACTS IN THE WRONG HOME:
--
--   energy_class text            cannot hold Spain's TWO ratings, and has
--                                nowhere for the registration that is what
--                                confers a Spanish certificate's validity
--   expires_at on the LISTING    validity belongs to the FACT; a property may
--                                hold several facts at once
--   energy_exemption on the      presumes exemption is a property of the
--   LISTING                      PROPERTY, when it is a property of a
--                                REQUIREMENT — and whether a requirement is
--                                exemptible is the jurisdiction's answer
--   clients.ami_licence text     an agency may hold SEVERAL registrations (a
--                                Catalan AICAT number does not satisfy
--                                Valencia), and a bare string cannot express
--                                suspension or cancellation
--
-- They were not wrong to WRITE. They were the minimum that made the gate real,
-- they cost one migration, and building the gate against them is what produced
-- the refusal vocabulary now used by the typed requirements. That is the cheap
-- way to find out a shape is too small.
--
-- They are wrong to KEEP. Two sources of truth is the thing this project
-- refuses everywhere else, and lesson 15 is unambiguous about which of the two
-- keeps answering confidently: the stale one.
--
-- 0030's `listing_facts` and `agency_facts` are where these live now.
--
-- ---------------------------------------------------------------------------
-- 🔴 IT PROVES THE COLUMNS ARE EMPTY. IT DOES NOT ASSUME IT.
-- ---------------------------------------------------------------------------
-- When this was designed there was one listing and two clients and not a single
-- value in any of the five columns — which is what made dropping them free. But
-- that was TRUE AT DESIGN TIME, and a migration runs later, possibly much
-- later, possibly after somebody typed a certificate into a screen that still
-- existed.
--
-- A comment saying "check they are empty first" is exactly the control this
-- project does not accept: it depends on somebody remembering, and the failure
-- if they do not is silent and permanent. So the check is IN THE MIGRATION and
-- it ABORTS.
--
-- If this raises, nothing has been dropped and nothing is lost. The data it
-- found has to be moved into `listing_facts` / `agency_facts` first, and then
-- this runs clean. That is a worse afternoon than today's and a far better one
-- than discovering afterwards.

do $$
declare
  n_listing_class    bigint;
  n_listing_number   bigint;
  n_listing_expiry   bigint;
  n_listing_exempt   bigint;
  n_client_ami       bigint;
  total              bigint;
begin
  -- Counted per column rather than in one aggregate, so the exception can NAME
  -- what is there. "Five columns are not empty" sends somebody looking; "two
  -- listings have an energy_class and one client has an ami_licence" tells them
  -- what to move.
  select count(*) into n_listing_class  from public.listings where energy_class is not null;
  select count(*) into n_listing_number from public.listings where energy_certificate_number is not null;
  select count(*) into n_listing_expiry from public.listings where energy_certificate_expires_at is not null;
  select count(*) into n_listing_exempt from public.listings where energy_exemption is not null;
  select count(*) into n_client_ami     from public.clients  where ami_licence is not null;

  total := n_listing_class + n_listing_number + n_listing_expiry + n_listing_exempt + n_client_ami;

  if total > 0 then
    raise exception
      'REFUSING TO DROP: these columns are not empty. energy_class=%, '
      'energy_certificate_number=%, energy_certificate_expires_at=%, '
      'energy_exemption=%, clients.ami_licence=%. '
      'Nothing has been dropped. Move these values into listing_facts and '
      'agency_facts (0030) first, then run this again. Dropping them now would '
      'destroy the only copy.',
      n_listing_class, n_listing_number, n_listing_expiry, n_listing_exempt, n_client_ami;
  end if;

  raise notice 'All five columns are empty — proven, not assumed. Dropping.';
end $$;

-- The constraints go with their columns, but they are dropped by name first so
-- that a failure here is about a constraint rather than about a column that
-- turned out to be referenced by something nobody remembered.
alter table public.listings drop constraint if exists energy_class_is_dated;
alter table public.listings drop constraint if exists exemption_is_a_declaration;

drop index if exists public.listings_certificate_expiry_idx;

alter table public.listings
  drop column if exists energy_class,
  drop column if exists energy_certificate_number,
  drop column if exists energy_certificate_expires_at,
  drop column if exists energy_exemption;

alter table public.clients
  drop column if exists ami_licence;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   -- the five columns are gone
--   select column_name from information_schema.columns
--    where table_name = 'listings'
--      and column_name like 'energy%';
--   -- expect: no rows
--
--   select column_name from information_schema.columns
--    where table_name = 'clients' and column_name = 'ami_licence';
--   -- expect: no rows
--
--   -- and the NEIGHBOURS survived. A migration that dropped too much would
--   -- pass the two checks above perfectly.
--   select count(*) from public.listings;          -- expect: unchanged (1)
--   select count(*) from public.clients;           -- expect: unchanged (2)
--   select reference, status, area, price, region  -- expect: all still there
--     from public.listings;
--
-- THE ABORT, PROVEN RATHER THAN TRUSTED — run this BEFORE the migration, in a
-- transaction you roll back, or the guard is a claim nobody has tested:
--
--   begin;
--   update public.clients set ami_licence = 'AMI 99999' where id = (select id from clients limit 1);
--   -- now run the do-block above on its own
--   -- expect: REFUSING TO DROP … clients.ami_licence=1 … Nothing has been dropped.
--   rollback;
