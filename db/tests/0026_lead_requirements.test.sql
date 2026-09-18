-- 0026's guards, SEEN to fire. Run in the SQL editor.
--
-- Two refusals and the neighbour they must leave alone. Small, because the rule
-- that matters most in 0026 is NOT a constraint: a recompute must delete by
-- source and never touch `source = 'agent'`. That lives in the caller and is
-- proved by behaviour once the matching run exists -- it is recorded in
-- proofs.json as 0026-recompute-preserves-agent-rows, blocked, with the file
-- whose arrival makes it runnable.
--
-- Rolls itself back. Nothing here survives.

begin;

insert into public.clients (id, name)
values ('00000000-0000-0000-0000-0000000c1e42', 'PROOF FIXTURE — rolled back')
on conflict (id) do nothing;

insert into public.leads (id, client_id, full_name, phone)
values ('00000000-0000-0000-0000-00000000ead1',
        '00000000-0000-0000-0000-0000000c1e42', 'PROOF FIXTURE', '+351911111111')
on conflict (id) do nothing;

do $$
declare
  CLIENT constant uuid := '00000000-0000-0000-0000-0000000c1e42';
  LEAD   constant uuid := '00000000-0000-0000-0000-00000000ead1';
  fired  int := 0;
begin
  -- ===================================================================
  -- 1. An unknown kind is refused rather than stored and never matched.
  -- This is 0009's `availabe` in a new place: a typo that the database
  -- accepts becomes a requirement that silently never participates.
  -- ===================================================================
  begin
    insert into public.lead_requirements
      (client_id, lead_id, kind, value, strength, source, why)
    values (CLIENT, LEAD, 'bedroms', '3'::jsonb, 'hard', 'conversation', 'a typo');
    raise exception '1 DID NOT FIRE: an unknown kind was accepted';
  exception when check_violation then
    fired := fired + 1;
    raise notice 'OK 1 — lead_requirements_kind_check refused a misspelt kind';
  end;

  -- ===================================================================
  -- 2. An agent's assertion about somebody else must carry their name.
  -- It shapes every future match for that lead, so an unattributed one is
  -- a guess the system made wearing a person's authority.
  -- ===================================================================
  begin
    insert into public.lead_requirements
      (client_id, lead_id, kind, value, strength, source, evidence, why, authored_by)
    values (CLIENT, LEAD, 'area', '["Cascais"]'::jsonb, 'hard', 'agent',
            'they always wanted Cascais', 'the agent said so', null);
    raise exception '2 DID NOT FIRE: an agent requirement was accepted with no author';
  exception when check_violation then
    fired := fired + 1;
    raise notice 'OK 2 — agent_requirements_name_their_author refused a missing author';
  end;

  -- And the same row with no EVIDENCE, since the constraint promises both.
  begin
    insert into public.lead_requirements
      (client_id, lead_id, kind, value, strength, source, evidence, why, authored_by)
    values (CLIENT, LEAD, 'area', '["Cascais"]'::jsonb, 'hard', 'agent',
            null, 'the agent said so', 'A. Ferreira');
    raise exception '3 DID NOT FIRE: an agent requirement was accepted with no words';
  exception when check_violation then
    fired := fired + 1;
    raise notice 'OK 3 — and refused a missing sentence';
  end;

  -- ===================================================================
  -- THE NEIGHBOURS THAT MUST BE ACCEPTED (§7b: a constraint is proved by
  -- the cases it must LEAVE ALONE). A table that refused everything would
  -- pass all three cases above identically.
  -- ===================================================================
  insert into public.lead_requirements
    (client_id, lead_id, kind, value, strength, source, evidence, why, authored_by)
  values (CLIENT, LEAD, 'area', '["Cascais","Estoril"]'::jsonb, 'hard', 'agent',
          'they always wanted Cascais or Estoril', 'the agent said so', 'A. Ferreira');
  raise notice 'OK — a complete agent requirement was accepted';

  -- A DERIVED row has no author and must not need one: nobody authored
  -- "the extractor read `ate 900 mil` as a budget".
  insert into public.lead_requirements
    (client_id, lead_id, kind, value, strength, source, evidence, why)
  values (CLIENT, LEAD, 'budget', '{"min":null,"max":900000}'::jsonb, 'hard',
          'conversation', 'Procuro T3 em Cascais ate 900 mil', 'said ate 900 mil');
  raise notice 'OK — a derived requirement was accepted with no author';

  -- And the alternatives shape: ONE row holding both towns, which is the
  -- thing lesson 7c exists about. Two rows here would be an AND and would
  -- match nothing anywhere.
  if (select jsonb_array_length(value) from public.lead_requirements
       where lead_id = LEAD and kind = 'area') <> 2 then
    raise exception 'the alternatives row does not hold both values';
  end if;
  raise notice 'OK — area holds a LIST of alternatives in one row, not one row each';

  if fired <> 3 then
    raise exception 'ONLY % OF 3 REFUSALS FIRED — something is not holding', fired;
  end if;
  raise notice 'ALL THREE REFUSAL CASES FIRED, and all three permitted cases were accepted';
end $$;

rollback;

-- Expect: OK 1, OK 2, OK 3, three permitted notices, then
--   ALL THREE REFUSAL CASES FIRED, and all three permitted cases were accepted
