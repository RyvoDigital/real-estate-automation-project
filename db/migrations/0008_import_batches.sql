-- ============ import_batches — Automation 03, Gate F1 ============
--
-- One row per uploaded contact list. It holds the parsed rows while the
-- operator reviews the mapping, the mapping they approved, the honest report of
-- what landed and what did not, and the ids of the leads it created so the
-- import can be reversed.
--
-- WHY THE STAGED ROWS LIVE HERE RATHER THAN IN A FILE STORE
-- §2.5 requires the import to be previewable before it commits. That means the
-- parsed rows have to survive between "propose a mapping" and "commit", and
-- the preview and the commit must operate on EXACTLY the same parsed data --
-- lesson 15: never let two copies of the same thing exist, because they
-- diverge and the stale one keeps reporting confidently. Keeping them in this
-- row makes a second copy impossible.
--
-- `staged` is CLEARED on commit and on revert. The accepted rows have become
-- leads by then, and a second copy of a client's contact list sitting in a
-- jsonb column is personal data we would be holding for no purpose. The
-- rejected rows stay in `report`, because naming them is the whole point of
-- "imported 847 of 900" rather than "imported successfully".
--
-- NO UNIQUE CONSTRAINT, DELIBERATELY
-- Nothing upserts into this table -- every import is a new batch, and two
-- uploads of the same file are two real events that both need recording. So
-- there is no ON CONFLICT anywhere near it and therefore no exposure to the
-- 42P10 partial-index defect that cost migrations 0003 and 0004. Recorded
-- because §9 asks for it to be considered, not because it applies.
--
-- GRANTS: 0002 set ALTER DEFAULT PRIVILEGES for service_role on this schema,
-- so a table created by `postgres` inherits DML. That is an assumption about
-- which role applies this file -- VERIFY IT after applying rather than
-- assuming, with the check at the bottom of this file. A table without DML
-- grants fails at the REST layer with 42501, not at migration time.

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,

  filename text not null,
  format text not null,                            -- csv | xlsx | vcard
  byte_size integer,
  source_headers jsonb not null default '[]',      -- the columns as they arrived

  status text not null default 'staged',           -- staged | committed | reverted

  -- What was proposed, by what, and why. Kept separately from `mapping` so the
  -- operator's corrections are visible as corrections rather than overwriting
  -- the proposal -- §4.7's principle applied to onboarding: record, do not
  -- silently absorb.
  proposal jsonb not null default '{}',
  mapping jsonb,                                   -- what the human approved

  tier text,                                       -- contact_only | approximate | precise
  report jsonb not null default '{}',              -- counts, rejects with reasons, duplicates
  staged jsonb,                                    -- parsed rows; cleared on commit/revert
  created_lead_ids jsonb not null default '[]',

  uploaded_by text,
  created_at timestamptz default now(),
  committed_at timestamptz,
  reverted_at timestamptz
);

create index if not exists import_batches_client_created_idx
  on public.import_batches (client_id, created_at desc);

-- Same deny-by-default posture as 0001: RLS on, no policies, and every read or
-- write goes through the server with the service_role key.
alter table public.import_batches enable row level security;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING (do not skip -- 0002 exists because this was assumed)
-- ---------------------------------------------------------------------------
--   select has_table_privilege('service_role', 'public.import_batches', 'INSERT');
--   -- expect: t
--
-- And through the path the caller actually takes, which is PostgREST, not psql:
--   curl -s -X POST "$SUPABASE_URL/rest/v1/import_batches" \
--     -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
--     -H 'content-type: application/json' -H 'Prefer: return=representation' \
--     -d '{"client_id":"<a real client>","filename":"grant-check","format":"csv"}'
--   -- expect 201, then delete the row. A 42501 here is the 0002 defect again.
