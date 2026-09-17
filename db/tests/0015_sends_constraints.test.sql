-- The three invariants of 0015, SEEN to refuse. Run in the SQL editor.
--
-- Each case attempts a row the constraint must reject. The assertion is not
-- "an error happened" -- it is that the error was a check violation AND that
-- the insert did not succeed. A constraint that silently accepts is the whole
-- failure mode, so every block raises loudly if the insert goes through.
--
-- Rolls itself back. Nothing here survives.
--
-- IF YOU CHANGE 0015, RUN THIS. proof-staleness.test.ts fails the suite while
-- the recorded hash of that migration does not match the file.

begin;

insert into public.clients (id, name)
values ('00000000-0000-0000-0000-0000000c1e42', 'PROOF FIXTURE — rolled back')
on conflict (id) do nothing;

-- A real, frozen, append-only consent row to point at, so the FK is satisfied
-- for the cases that are supposed to pass everything except the rule under test.
insert into public.consent_events (id, client_id, phone_e164, kind, source, occurred_at)
values ('00000000-0000-0000-0000-00000000ce01',
        '00000000-0000-0000-0000-0000000c1e42', '+351911111111',
        'consent_given', 'web_form', now() - interval '3 days')
on conflict (id) do nothing;

do $$
declare
  CLIENT constant uuid := '00000000-0000-0000-0000-0000000c1e42';
  CE     constant uuid := '00000000-0000-0000-0000-00000000ce01';
  fired  int := 0;
begin
  -- ===================================================================
  -- INVARIANT 1: no 'sent' without a permission on the same row.
  -- Everything else about this row is impeccable; the permission is missing.
  -- ===================================================================
  begin
    insert into public.sends (client_id, phone_e164, automation, idempotency_key,
      status, gate_verdict, gate_decided_at, country, segment,
      consent_event_id, gate_basis,
      policy_confirmed_at, policy_confirmed_by,
      sent_at, provider_message_id)
    values (CLIENT, '+351911111111', 'reactivation_02', 'proof-inv1',
      'sent', 'refused', now(), 'PT', 'B',
      CE, 'documented consent · PT',
      now(), 'M. de Sousa Pereira',
      now(), 'SMproof1');
    raise exception 'INVARIANT 1 DID NOT FIRE: a sent row was accepted with gate_verdict=refused';
  exception when check_violation then
    fired := fired + 1;
    raise notice 'OK 1 — send_requires_permission refused gate_verdict=refused';
  end;

  begin
    insert into public.sends (client_id, phone_e164, automation, idempotency_key,
      status, gate_verdict, gate_decided_at, country, segment,
      gate_basis, policy_confirmed_at, policy_confirmed_by, sent_at, provider_message_id)
    values (CLIENT, '+351911111111', 'reactivation_02', 'proof-inv1b',
      'sent', 'permitted', now(), 'PT', 'B',
      'documented consent · PT', now(), 'M. de Sousa Pereira', now(), 'SMproof1b');
    raise exception 'INVARIANT 1 DID NOT FIRE: a sent row was accepted with no consent_event_id';
  exception when check_violation then
    fired := fired + 1;
    raise notice 'OK 1 — send_requires_permission refused a null consent_event_id';
  end;

  -- ===================================================================
  -- INVARIANT 2: no 'sent' into a jurisdiction no lawyer confirmed.
  -- This is the row the gate would produce today, with PT unconfirmed.
  -- ===================================================================
  begin
    insert into public.sends (client_id, phone_e164, automation, idempotency_key,
      status, gate_verdict, gate_decided_at, country, segment,
      consent_event_id, gate_basis, sent_at, provider_message_id)
    values (CLIENT, '+351911111111', 'reactivation_02', 'proof-inv2',
      'sent', 'permitted', now(), 'PT', 'B',
      CE, 'documented consent · PT', now(), 'SMproof2');
    raise exception 'INVARIANT 2 DID NOT FIRE: a sent row was accepted with no policy confirmation';
  exception when check_violation then
    fired := fired + 1;
    raise notice 'OK 2 — send_requires_confirmed_policy refused an unconfirmed jurisdiction';
  end;

  begin
    insert into public.sends (client_id, phone_e164, automation, idempotency_key,
      status, gate_verdict, gate_decided_at, country, segment,
      consent_event_id, gate_basis, policy_confirmed_at, sent_at, provider_message_id)
    values (CLIENT, '+351911111111', 'reactivation_02', 'proof-inv2b',
      'sent', 'permitted', now(), 'PT', 'B',
      CE, 'documented consent · PT', now(), now(), 'SMproof2b');
    raise exception 'INVARIANT 2 DID NOT FIRE: a confirmation date with no name was accepted';
  exception when check_violation then
    fired := fired + 1;
    raise notice 'OK 2 — a date with no name is not a confirmation, here as well as in 0014';
  end;

  -- ===================================================================
  -- INVARIANT 3a: the reserved range is never sendable.
  -- Fully authorised, fully confirmed, and refused for being a fixture.
  -- ===================================================================
  begin
    insert into public.sends (client_id, phone_e164, automation, idempotency_key,
      status, gate_verdict, gate_decided_at, country, segment,
      consent_event_id, gate_basis, policy_confirmed_at, policy_confirmed_by,
      sent_at, provider_message_id)
    values (CLIENT, '+351900000001', 'reactivation_02', 'proof-inv3',
      'sent', 'permitted', now(), 'PT', 'B',
      CE, 'documented consent · PT', now(), 'M. de Sousa Pereira',
      now(), 'SMproof3');
    raise exception 'INVARIANT 3a DID NOT FIRE: a reserved-range number was accepted as sent';
  exception when check_violation then
    fired := fired + 1;
    raise notice 'OK 3a — send_never_reserved refused +351900000001 despite a perfect authorisation';
  end;

  -- A neighbouring real number must NOT be refused, or the pattern is wrong in
  -- the other direction: a constraint that refuses everything proves nothing.
  insert into public.sends (client_id, phone_e164, automation, idempotency_key,
    status, gate_verdict, gate_decided_at, country, segment,
    consent_event_id, gate_basis, policy_confirmed_at, policy_confirmed_by,
    sent_at, provider_message_id)
  values (CLIENT, '+351900001001', 'reactivation_02', 'proof-inv3-neighbour',
    'sent', 'permitted', now(), 'PT', 'B',
    CE, 'documented consent · PT', now(), 'M. de Sousa Pereira',
    now(), 'SMproof3n');
  raise notice 'OK 3a — and a number one digit outside the block was ACCEPTED';

  -- ===================================================================
  -- A refusal must say which and why.
  -- ===================================================================
  begin
    insert into public.sends (client_id, phone_e164, automation, idempotency_key,
      status, gate_verdict, gate_decided_at)
    values (CLIENT, '+351911111111', 'reactivation_02', 'proof-refusal',
      'refused', 'refused', now());
    raise exception 'REFUSAL CONSTRAINT DID NOT FIRE: a refusal with no layer or reason was accepted';
  exception when check_violation then
    fired := fired + 1;
    raise notice 'OK — refusal_states_its_reason refused a refusal that explains nothing';
  end;

  if fired <> 6 then
    raise exception 'EXPECTED 6 constraint firings, got % -- a case did not run', fired;
  end if;
  raise notice 'ALL SIX CONSTRAINT CASES FIRED';
end $$;

-- ===================================================================
-- THE FREEZE: the outcome may be written, the authorisation may not.
-- ===================================================================
do $$
declare
  CLIENT constant uuid := '00000000-0000-0000-0000-0000000c1e42';
  CE     constant uuid := '00000000-0000-0000-0000-00000000ce01';
  sid uuid;
begin
  insert into public.sends (client_id, phone_e164, automation, idempotency_key,
    status, gate_verdict, gate_decided_at, country, segment,
    consent_event_id, gate_basis, policy_confirmed_at, policy_confirmed_by,
    body_intended)
  values (CLIENT, '+351911111111', 'reactivation_02', 'proof-freeze',
    'intended', 'permitted', now(), 'PT', 'B',
    CE, 'documented consent · PT', now(), 'M. de Sousa Pereira',
    'Olá Maria, fala a Ana da Cascais Demo…')
  returning id into sid;

  -- The outcome: allowed, because it genuinely arrives later.
  update public.sends
     set status = 'sent', provider = 'twilio', provider_message_id = 'SMfreeze',
         body_sent = 'Olá Maria, fala a Ana da Cascais Demo…', sent_at = now()
   where id = sid;
  raise notice 'OK freeze — the outcome columns were writable';

  -- The authorisation: refused.
  begin
    update public.sends set gate_basis = 'retrospectively improved' where id = sid;
    raise exception 'FREEZE DID NOT FIRE: the authorisation was editable after the fact';
  exception when raise_exception then
    -- The trigger raises P0001, not a check violation, and it must be ITS
    -- message rather than the one above -- the distinction lesson 9c is about.
    if position('authorisation is frozen' in sqlerrm) = 0 then
      raise;
    end if;
    raise notice 'OK freeze — gate_basis refused: %', left(sqlerrm, 60);
  end;

  begin
    update public.sends set consent_event_id = null where id = sid;
    raise exception 'FREEZE DID NOT FIRE: the consent evidence was removable';
  exception when raise_exception then
    if position('authorisation is frozen' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK freeze — consent_event_id refused';
  end;
end $$;

rollback;
