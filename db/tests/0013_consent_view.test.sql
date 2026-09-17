-- The WIRING of 0013, tested by hand. Run inside the transaction below.
--
--   Supabase SQL editor → paste → run. It rolls itself back.
--
-- WHAT THIS FILE IS FOR, AND WHAT IT IS NOT FOR
-- The RULES live in resolve_consent_state(), which is pure and is tested on
-- every `npm test` run with synthetic events and no writes
-- (cockpit/tests/consent-resolution.test.ts). Do not duplicate those cases here.
--
-- What cannot be tested that way is the WIRING: that the views aggregate the
-- right events, group by the right key, order them the way the function
-- expects, and join to leads without losing or inventing a row. That needs real
-- rows, and consent_events refuses DELETE, so rollback is the only exit that
-- leaves no trace.
--
-- IF YOU CHANGE 0013, RUN THIS. The suite will tell you: proof-staleness.test.ts
-- fails while the recorded hash of 0013 does not match the file.

begin;

-- A client to hang the fixtures on, without depending on one existing.
insert into public.clients (id, name)
values ('00000000-0000-0000-0000-0000000c1e41', 'PROOF FIXTURE — rolled back')
on conflict (id) do nothing;

insert into public.consent_events (client_id, phone_e164, kind, source, occurred_at, recorded_at) values
  -- (a) objection, then a consent appended AFTER it. Rule 1.
  ('00000000-0000-0000-0000-0000000c1e41', '+351900000001', 'objection',     'whatsapp_reply', now() - interval '10 days', now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000c1e41', '+351900000001', 'consent_given', 'web_form',       now() - interval '1 day',   now() - interval '1 day'),
  -- (b) a dated consent, alone
  ('00000000-0000-0000-0000-0000000c1e41', '+351900000002', 'consent_given', 'web_form',       now() - interval '30 days', now() - interval '30 days'),
  -- (c) consent, then withdrawal
  ('00000000-0000-0000-0000-0000000c1e41', '+351900000003', 'consent_given',     'web_form', now() - interval '30 days', now() - interval '30 days'),
  ('00000000-0000-0000-0000-0000000c1e41', '+351900000003', 'consent_withdrawn', 'whatsapp_reply', now() - interval '2 days', now() - interval '2 days');

-- (d) a claim, alone
insert into public.consent_events (client_id, phone_e164, kind, source, recorded_at, evidence)
values ('00000000-0000-0000-0000-0000000c1e41', '+351900000004', 'claimed', 'import_declaration',
        now() - interval '5 days', '{"batch_id":"11111111-1111-1111-1111-111111111111"}');

-- (e) a claim whose batch was later undone
insert into public.consent_events (client_id, phone_e164, kind, source, recorded_at, evidence) values
  ('00000000-0000-0000-0000-0000000c1e41', '+351900000005', 'claimed',       'import_declaration', now() - interval '5 days', '{"batch_id":"22222222-2222-2222-2222-222222222222"}'),
  ('00000000-0000-0000-0000-0000000c1e41', '+351900000005', 'claim_revoked', 'operator',           now() - interval '4 days', '{"batch_id":"22222222-2222-2222-2222-222222222222"}');

do $$
declare
  got text;
begin
  select state into got from public.consent_by_contact where phone_e164 = '+351900000001';
  if got is distinct from 'objected' then
    raise exception 'RULE 1 BROKEN: consent appended after an objection produced "%" instead of objected', got;
  end if;

  select state into got from public.consent_by_contact where phone_e164 = '+351900000002';
  if got is distinct from 'consented' then raise exception '(b) dated consent produced "%"', got; end if;

  select state into got from public.consent_by_contact where phone_e164 = '+351900000003';
  if got is distinct from 'claimed_unevidenced' and got is distinct from 'undetermined' then
    raise exception '(c) a withdrawn consent produced "%", which must not be consented', got;
  end if;

  select state into got from public.consent_by_contact where phone_e164 = '+351900000004';
  if got is distinct from 'claimed_unevidenced' then raise exception '(d) a bare claim produced "%"', got; end if;

  select state into got from public.consent_by_contact where phone_e164 = '+351900000005';
  if got is distinct from 'undetermined' then
    raise exception '(e) a revoked claim produced "%" — it must fall through to undetermined, not stay askable', got;
  end if;

  raise notice 'WIRING OK — all five cases resolved as designed';
end $$;

-- A lead with no consent events at all must still appear, as undetermined.
do $$
declare n int; st text;
begin
  select count(*) into n from public.leads_consent;
  if n <> (select count(*) from public.leads) then
    raise exception 'leads_consent returned % rows for % leads — the join drops or duplicates',
      n, (select count(*) from public.leads);
  end if;
  raise notice 'JOIN OK — % leads, % rows', n, n;
end $$;

rollback;
