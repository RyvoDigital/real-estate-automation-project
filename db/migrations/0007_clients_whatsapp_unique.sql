-- ============ clients.whatsapp_number uniqueness (Checkpoint E3) ============
-- NOT YET APPLIED — awaiting the operator's go-ahead.
--
-- The Concierge resolves the client for an inbound message with:
--
--   GET /clients?whatsapp_number=eq.<To>&limit=1
--
-- `limit=1` with no ORDER BY. If two clients ever share a WhatsApp number,
-- Postgres is free to return either row, and a real client's leads would be
-- answered with another client's config, areas and assistant name -- silently,
-- and differently from one message to the next.
--
-- Nothing prevented that. `whatsapp_number` is a plain nullable text column in
-- 0001, and the onboarding form built at E3 makes creating the collision a
-- two-minute mistake made under time pressure in front of an agency.
--
-- §6: when a correctness property can be enforced by a constraint the database
-- already checks atomically, put it there. The form now refuses a duplicate
-- too, but an application check is advisory the moment there is more than one
-- caller -- and there are already two (the cockpit and any hand-written SQL).
--
-- Partial on `is not null` so that clients without a WhatsApp number (an
-- Instagram-only client, say) do not collide with each other. Note the lesson
-- from migration 0003: a PARTIAL index breaks PostgREST upserts, because
-- PostgREST cannot restate the predicate in ON CONFLICT. That does not apply
-- here -- nothing upserts on this column; it exists purely to reject a second
-- row. If anything ever does need to upsert by whatsapp_number, this index has
-- to become non-partial first.

create unique index if not exists clients_whatsapp_number_unique
  on public.clients (whatsapp_number)
  where whatsapp_number is not null;
