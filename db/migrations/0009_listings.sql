-- ============ listings — Automation 03, Gate F2 ============
--
-- The properties a match is made against. A separate table, deliberately:
-- §3 of the handoff says do not overload `leads`, and a listing and a lead have
-- almost nothing in common beyond both having a price and an area.
--
-- THE STATUS COLUMN IS THE POINT OF THIS TABLE.
--
-- "Telling a buyer about a house that sold last week" is the worst output this
-- automation can produce, and it is worse than an ordinary bug because the
-- damage lands on the client's reputation in front of their own customer —
-- the same shape as §0 of the lessons file, where a generated message promised
-- a booking that did not exist.
--
-- Three things follow, and the CHECK constraint is the one that is easy to
-- leave out:
--
-- 1. `status` is CONSTRAINED, not free text. A typo like 'availabe' would
--    otherwise be written happily and then be silently excluded from every
--    match — a listing that has quietly stopped existing, with nothing
--    reporting an error. The constraint turns that into a write failure.
-- 2. Only 'available' matches. Everything else — reserved, under offer, sold,
--    withdrawn — is out, and the matching query proves it by EXCLUSION
--    (lessons §7: a filter is tested by the rows it refuses).
-- 3. `status_changed_at` is maintained so a match can record what the status
--    was when it was computed, and the send path can refuse if it has moved
--    since. Checking at match time alone is check-then-act (§0b) and there is
--    no window small enough to make that safe.
--
-- The unique index is NON-PARTIAL, for the reason recorded in 0004: PostgREST
-- emits `ON CONFLICT (client_id, reference)` with no predicate and cannot
-- restate one, so a partial index fails 42P10. NULLs are distinct in a plain
-- unique index, so listings with no agency reference do not collide.

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,

  reference text,                                  -- the agency's own ref
  title text,
  property_type text,                              -- apartment | house | plot | commercial
  area text,                                       -- the town/zone, matched via §4.3 adjacency
  location_detail text,
  price numeric,
  bedrooms integer,
  size_sqm numeric,
  features jsonb not null default '[]',

  status text not null default 'available'
    check (status in ('available', 'reserved', 'under_offer', 'sold', 'withdrawn')),
  status_changed_at timestamptz not null default now(),

  source text,                                     -- whatsapp | cockpit
  -- What the agent actually sent. Kept because the parse is a best effort and
  -- the original is the only way to tell a parser bug from a typo — the same
  -- reason `messages` keeps the lead's own words rather than a summary.
  raw_message text,
  created_by text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists listings_client_reference_uniq
  on public.listings (client_id, reference);

-- The matching query's shape: available listings for one client, newest first.
create index if not exists listings_client_status_idx
  on public.listings (client_id, status, created_at desc);

alter table public.listings enable row level security;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select has_table_privilege('service_role','public.listings','INSERT');  -- t
--
--   -- the CHECK must refuse a typo rather than storing an unmatched listing:
--   insert into public.listings (client_id, status) values ('<a client>', 'availabe');
--   -- expect: new row violates check constraint "listings_status_check"
--
--   -- and through PostgREST, which is the path the caller actually takes.
