-- ============ clearances — Automation 04's decision, recorded ============
--
-- A clearance is THE GATE'S OWN DECISION, kept. Not a cache of one, and not a
-- summary of one: the snapshot of what was true when a property was cleared
-- for publication, so that a later run can ask whether it still holds.
--
-- ---------------------------------------------------------------------------
-- WHY THERE HAS NEVER BEEN ONE, AND WHAT THAT COST
-- ---------------------------------------------------------------------------
-- `publication/recheck.ts` is a complete re-check engine: four lapse causes,
-- nullable dates where a revocation has none, a separate axis for
-- registrations so one unchecked licence does not produce forty identical
-- lines, and a `notCheckedFor` field so a run given no policy rows cannot
-- report every clearance as unconfirmable. It is careful work and it has never
-- run once, because its input — `ClearanceRow[]` — has no source.
--
-- 🔴 THIS TABLE IS THAT INPUT. It is also the third thing found in one day
-- built against something that does not exist:
--
--   recheck.ts            logic with no input          (this migration)
--   agency_facts          a table with no writer       (improvements §3.22)
--   decidePublication()   a function with no caller    (found while writing
--                                                       this file)
--
-- That last one matters here more than the other two. THE GATE DOES NOT
-- DECIDE ANYTHING IN PRODUCTION YET — `decidePublication` is referenced by its
-- own module and by two test files, and by nothing else. So this table arrives
-- before the act it records.
--
-- ⚠️ WHICH IS WHY IT MUST NOT BE APPLIED UNTIL ITS WRITER EXISTS. A table
-- nothing writes is exactly what `agency_facts` is, and §3.22 is the entry
-- about how that surfaces: invisibly, until the day something else stops
-- hiding it. Applying this now would add a second one, in the same feature,
-- for the same reason, on the same afternoon we recorded the first.
--
-- It is written now because the writer cannot be written without it, and
-- because the operator asked for it explicitly. It is applied in the same act
-- as the publish screen that creates the decision path — not before.
--
-- ---------------------------------------------------------------------------
-- 🔴 IT PROVES ITS PRECONDITIONS. IT DOES NOT ASSUME THEM.  (0032's treatment)
-- ---------------------------------------------------------------------------
-- 0032 is the pattern: a comment saying "check first" is the control this
-- project does not accept, because it depends on somebody remembering and the
-- failure if they do not is silent. So the checks are IN the migration and
-- they ABORT.
--
-- Creating a table has no destructive risk, so the preconditions are about
-- landing on the shape this table claims to fit:
--
--   1. the tables it references exist        — a dangling reference would be
--                                              found at the first insert
--   2. nothing called `clearances` is here   — creating over a different shape
--      already                                 silently is how two meanings of
--                                              one name start
--   3. listing_facts exists with `valid_until` and `exemption` — because the
--      snapshot this table stores is assembled from those columns, and a
--      changed shape there means a changed snapshot here

do $$
declare
  n_listings   bigint;
  n_clients    bigint;
  n_facts      bigint;
  n_existing   bigint;
  n_cols       bigint;
begin
  select count(*) into n_listings from information_schema.tables
   where table_schema = 'public' and table_name = 'listings';
  select count(*) into n_clients from information_schema.tables
   where table_schema = 'public' and table_name = 'clients';
  select count(*) into n_facts from information_schema.tables
   where table_schema = 'public' and table_name = 'listing_facts';
  select count(*) into n_existing from information_schema.tables
   where table_schema = 'public' and table_name = 'clearances';

  if n_listings = 0 or n_clients = 0 or n_facts = 0 then
    raise exception
      'REFUSING: a table this one references is missing. listings=%, clients=%, '
      'listing_facts=%. Nothing has been created. 0009 and 0030 come first.',
      n_listings, n_clients, n_facts;
  end if;

  if n_existing > 0 then
    raise exception
      'REFUSING: a relation called clearances already exists. Nothing has been '
      'created and nothing has been altered. Two shapes under one name is how '
      'two meanings of a word begin — look at what is there before deciding '
      'whether this migration or that table is the one to keep.';
  end if;

  -- The snapshot stores what the gate read. If those columns have moved, the
  -- snapshot this table promises to hold is not the one the gate can produce.
  select count(*) into n_cols from information_schema.columns
   where table_schema = 'public' and table_name = 'listing_facts'
     and column_name in ('valid_until', 'exemption', 'requirement_id');
  if n_cols <> 3 then
    raise exception
      'REFUSING: listing_facts does not have the three columns the snapshot is '
      'assembled from (valid_until, exemption, requirement_id) — found %. The '
      'gate''s SatisfiedRequirement is built from them, so a changed shape '
      'there changes what this table can honestly store.', n_cols;
  end if;

  raise notice 'Preconditions proven, not assumed. Creating clearances.';
end $$;

create table if not exists public.clearances (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,

  -- WHERE the decision was made about. A clearance is for a jurisdiction: the
  -- same property in the same state is a different answer in another one.
  country text not null,
  region text,

  /*
   * THE GATE'S OWN SNAPSHOT, UNCHANGED.
   *
   * `SatisfiedRequirement[]` as decidePublication produced it — requirementId,
   * kind, values, number, validUntil, exemption. Stored whole rather than
   * reduced, because recheck.ts records what a lossy copy cost: with only
   * (id, expiry, exemption) it could not tell a rating from a registration and
   * rebuilt every row as a rating to ask the date question.
   *
   * 🔒 A SNAPSHOT, NOT A POINTER. It is what was true when this was cleared,
   * and the whole purpose of the re-check is to compare it against what is
   * true now. Joining to listing_facts instead would compare today with today
   * and find nothing, always.
   */
  satisfied jsonb not null,

  decided_at timestamptz not null default now(),

  /*
   * 🔴 THAT THE AGENCY WAS TOLD. NOTHING MORE.
   *
   * It records a notice going out and no other fact. In particular it does NOT
   * mean the advertisement came down, that anyone acted, or that the exposure
   * ended — and nothing reading this column may say or imply that it does.
   *
   * The rule survives from the Stage B design of the re-check notice, where it
   * is stated as: no verb claiming we acted. "Removed", "corrected",
   * "withdrawn", "republished" are all false about us, and a test fails on
   * them. THE OPERATOR NAMED THIS AS THE ONE MOST LIKELY TO SOFTEN once there
   * is a column to write to — which is why the rule is written on the column
   * rather than only in the design note.
   *
   * We prepare advertisements. The agency publishes them, in the agency's own
   * channels, and only the agency can take one down.
   */
  notice_sent_at timestamptz,

  created_at timestamptz not null default now(),

  -- A clearance is for one property in one jurisdiction. Re-clearing replaces
  -- the answer rather than accumulating answers nobody can order.
  constraint clearances_one_per_listing_jurisdiction
    unique (listing_id, country, coalesce(region, '-')),

  constraint clearances_country_iso check (country ~ '^[A-Z]{2}$'),
  constraint clearances_region_code check (region is null or region ~ '^[A-Z0-9-]{2,8}$'),

  -- A cleared property satisfied something. An empty snapshot is either a
  -- jurisdiction that requires nothing — which no analysed one does — or a
  -- write that lost the evidence it exists to keep.
  constraint clearances_snapshot_is_not_empty
    check (jsonb_typeof(satisfied) = 'array' and jsonb_array_length(satisfied) > 0)
);

create index if not exists clearances_by_client on public.clearances (client_id);
create index if not exists clearances_to_notify on public.clearances (client_id)
  where notice_sent_at is null;

alter table public.clearances enable row level security;

comment on table public.clearances is
  'The publication gate''s own decision, kept as a snapshot of what was true when a property was cleared. Input to publication/recheck.ts. notice_sent_at records that the agency was TOLD and nothing more — never that an advertisement came down.';

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   -- the table is there, with RLS on and nothing granted to anon
--   select relrowsecurity from pg_class where relname = 'clearances';
--   -- expect: t
--
--   select has_table_privilege('anon', 'public.clearances', 'SELECT');
--   -- expect: f
--
--   -- the snapshot constraint actually refuses an empty array
--   insert into public.clearances (client_id, listing_id, country, satisfied)
--   values ('<a client>', '<a listing>', 'PT', '[]'::jsonb);
--   -- expect: violates clearances_snapshot_is_not_empty; roll it back
--
--   -- and the uniqueness holds per jurisdiction rather than per property
--   -- (two rows, same listing, different country) — expect both to insert.
