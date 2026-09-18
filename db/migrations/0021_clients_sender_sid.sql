-- ============ 0021 — the Sender SID, without which quality cannot be read ============
--
-- FOUND BY THE CAMPAIGN DRY RUN, 18 Sep 2026, and not by reading the code.
--
-- The quality-rating halt is built and tested. It reads
--   GET https://messaging.twilio.com/v2/Channels/Senders/{Sid}
-- and nothing in this database holds that Sid. `clients.whatsapp_number` is the
-- E.164 number; the Senders API is keyed on Twilio's own sender identifier
-- (XE…), which is a different thing.
--
-- So the halt could never have run. It would have been assembled, deployed, and
-- silently unable to read the number it exists to watch -- and because an
-- unreadable rating HALTS, the first campaign would have halted immediately
-- with "quality unreadable", which is the safe direction but the wrong reason.
--
-- Recorded that way because it is the third time this pattern has appeared: a
-- check that cannot reach its subject. The wrong channel prefix, the empty
-- vocabulary, and now a missing identifier. Each was found by running the thing
-- rather than by reading it.

alter table public.clients
  add column if not exists whatsapp_sender_sid text;

comment on column public.clients.whatsapp_sender_sid is
  'Twilio Sender SID (XE…) for the Senders API v2, which is where the quality rating lives. NOT the phone number: clients.whatsapp_number is that. Null means the quality halt cannot read this client and will therefore halt every campaign — which is the correct direction to fail in.';

-- Shape, not existence: a client without a sender cannot run a campaign, but a
-- client without a sender is perfectly normal until one is provisioned.
alter table public.clients
  add constraint clients_sender_sid_shape
  check (whatsapp_sender_sid is null or whatsapp_sender_sid ~ '^XE[0-9a-f]{32}$');

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   begin;
--     update public.clients set whatsapp_sender_sid = 'not-a-sid'
--      where id = (select id from public.clients limit 1);
--     -- expect: ERROR ... clients_sender_sid_shape
--   rollback;
--
--   begin;
--     update public.clients set whatsapp_sender_sid = 'XE' || repeat('0', 32)
--      where id = (select id from public.clients limit 1);
--     -- expect: UPDATE 1
--   rollback;
