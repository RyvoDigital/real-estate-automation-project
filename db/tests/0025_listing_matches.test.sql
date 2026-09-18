-- 0025's guards, SEEN to fire. Run in the SQL editor.
--
-- Three things the constraint-only checks could not reach, because each one
-- needs a row that EXISTS and then survives an attempt to change it:
--
--   A. the two CHECKs that keep a computed match and a chosen one apart
--   B. the partial unique index -- one CURRENT row per lead × listing
--   C. the freeze -- a notified match resists an edit and permits an outcome
--
-- B and C have never been seen to fire. A constraint that silently accepts is
-- the whole failure mode, so every block below raises loudly if the statement
-- it expects to be refused goes through instead.
--
-- Rolls itself back. Nothing here survives.
--
-- IF YOU CHANGE 0025, RUN THIS. proof-staleness.test.ts fails the suite while
-- the recorded hash of that migration does not match the file.

begin;

insert into public.clients (id, name)
values ('00000000-0000-0000-0000-0000000c1e42', 'PROOF FIXTURE — rolled back')
on conflict (id) do nothing;

insert into public.leads (id, client_id, full_name, phone)
values ('00000000-0000-0000-0000-00000000ead1',
        '00000000-0000-0000-0000-0000000c1e42', 'PROOF FIXTURE', '+351911111111')
on conflict (id) do nothing;

insert into public.listings (id, client_id, reference, area, price, bedrooms, status)
values ('00000000-0000-0000-0000-0000000715e1',
        '00000000-0000-0000-0000-0000000c1e42', 'PROOF-A-1', 'Cascais', 900000, 3, 'available')
on conflict (id) do nothing;

do $$
declare
  CLIENT  constant uuid := '00000000-0000-0000-0000-0000000c1e42';
  LEAD    constant uuid := '00000000-0000-0000-0000-00000000ead1';
  LISTING constant uuid := '00000000-0000-0000-0000-0000000715e1';
  fired   int := 0;
  first_id  uuid;
  second_id uuid;
begin
  -- ===================================================================
  -- A1. An agent row may not carry a score.
  -- Everything else about this row is impeccable.
  -- ===================================================================
  begin
    insert into public.listing_matches
      (client_id, listing_id, lead_id, origin, listing_status_at_match, score)
    values (CLIENT, LISTING, LEAD, 'agent', 'available', 0.9);
    raise exception 'A1 DID NOT FIRE: an agent row was accepted carrying a score';
  exception when check_violation then
    fired := fired + 1;
    raise notice 'OK A1 — agent_rows_claim_no_score refused a score';
  end;

  -- ===================================================================
  -- A2. And the one that protects the product's strongest claim:
  -- filter_would_find must be NULL on a row a human chose, never false.
  -- ===================================================================
  begin
    insert into public.listing_matches
      (client_id, listing_id, lead_id, origin, listing_status_at_match, filter_would_find)
    values (CLIENT, LISTING, LEAD, 'agent', 'available', false);
    raise exception 'A2 DID NOT FIRE: an agent row was accepted claiming filter_would_find';
  exception when check_violation then
    fired := fired + 1;
    raise notice 'OK A2 — agent_rows_claim_no_score refused filter_would_find=false';
  end;

  -- ===================================================================
  -- A3. A computed row that cannot show its working is not a match.
  -- ===================================================================
  begin
    insert into public.listing_matches
      (client_id, listing_id, lead_id, origin, listing_status_at_match,
       score, strength, reasoning)
    values (CLIENT, LISTING, LEAD, 'computed', 'available', 0.9, 'strong', null);
    raise exception 'A3 DID NOT FIRE: a computed row was accepted with no reasoning';
  exception when check_violation then
    fired := fired + 1;
    raise notice 'OK A3 — computed_rows_carry_their_reasoning refused null reasoning';
  end;

  -- ===================================================================
  -- A4. And 'none' is not a strength: a non-match is not a row here.
  -- ===================================================================
  begin
    insert into public.listing_matches
      (client_id, listing_id, lead_id, origin, listing_status_at_match,
       score, strength, reasoning)
    values (CLIENT, LISTING, LEAD, 'computed', 'available', 0, 'none', '{}'::jsonb);
    raise exception 'A4 DID NOT FIRE: strength=none was accepted';
  exception when check_violation then
    fired := fired + 1;
    raise notice 'OK A4 — a non-match cannot be stored as a result';
  end;

  -- ===================================================================
  -- THE NEIGHBOUR THAT MUST BE ACCEPTED.
  -- Every case above is a refusal, and a table that refused EVERYTHING would
  -- pass all of them identically (§7: a filter is proved by what it leaves
  -- alone). So: a legitimate computed row must go in.
  -- ===================================================================
  insert into public.listing_matches
    (client_id, listing_id, lead_id, origin, listing_status_at_match,
     score, strength, filter_would_find, reasoning)
  values (CLIENT, LISTING, LEAD, 'computed', 'available',
          0.75, 'possible', false,
          '{"reasons":["Cascais is exactly what they asked for"]}'::jsonb)
  returning id into first_id;
  raise notice 'OK — a legitimate computed row was accepted (%)', first_id;

  -- ===================================================================
  -- B1. THE PARTIAL UNIQUE INDEX. Two CURRENT rows for one pair, refused.
  -- This is the index's whole purpose and it has never been seen to fire.
  -- ===================================================================
  begin
    insert into public.listing_matches
      (client_id, listing_id, lead_id, origin, listing_status_at_match,
       score, strength, reasoning)
    values (CLIENT, LISTING, LEAD, 'computed', 'available',
            0.9, 'strong', '{"reasons":["a second current row"]}'::jsonb);
    raise exception 'B1 DID NOT FIRE: two current rows were accepted for one lead × listing';
  exception when unique_violation then
    fired := fired + 1;
    raise notice 'OK B1 — listing_matches_current_uniq refused a second current row';
  end;

  -- ===================================================================
  -- B2. And the case it must LEAVE ALONE: once the first row is history,
  -- the same pair inserts fine. An index that refused this too would pass
  -- B1 identically and make supersession impossible.
  -- ===================================================================
  update public.listing_matches set superseded_at = now() where id = first_id;

  insert into public.listing_matches
    (client_id, listing_id, lead_id, origin, listing_status_at_match,
     score, strength, reasoning, supersedes_id)
  values (CLIENT, LISTING, LEAD, 'computed', 'available',
          0.9, 'strong', '{"reasons":["the successor"]}'::jsonb, first_id)
  returning id into second_id;
  raise notice 'OK B2 — the successor was accepted once the first row was history (%)', second_id;

  if (select supersedes_id from public.listing_matches where id = second_id) is distinct from first_id then
    raise exception 'B2 DID NOT HOLD: the successor does not point at what it replaced';
  end if;
  raise notice 'OK B2b — the chain reads forwards';

  -- ===================================================================
  -- C. THE FREEZE. It needs a row that EXISTS and gets notified, which is
  -- why no constraint check could reach it.
  -- ===================================================================

  -- C0. Before notification a match is working state and corrects freely.
  update public.listing_matches set score = 0.95 where id = second_id;
  raise notice 'OK C0 — an un-notified match may still be corrected';

  update public.listing_matches set agent_notified_at = now() where id = second_id;
  raise notice 'OK C1 — the notification stamp itself is permitted';

  -- C2. And now the reasoning is a record of something that happened.
  begin
    update public.listing_matches set score = 0.1 where id = second_id;
    raise exception 'C2 DID NOT FIRE: a notified match accepted a change to its score';
  exception when raise_exception then
    -- Re-raise our own assertion; only the trigger's refusal counts as a pass.
    if sqlerrm like 'C2 DID NOT FIRE%' then raise; end if;
    fired := fired + 1;
    raise notice 'OK C2 — the freeze refused an edit to a notified match';
  end;

  begin
    update public.listing_matches set reasoning = '{"reasons":["rewritten"]}'::jsonb
     where id = second_id;
    raise exception 'C3 DID NOT FIRE: a notified match accepted rewritten reasoning';
  exception when raise_exception then
    if sqlerrm like 'C3 DID NOT FIRE%' then raise; end if;
    fired := fired + 1;
    raise notice 'OK C3 — the freeze refused rewritten reasoning';
  end;

  -- C4. The other direction, and the one that makes the freeze usable:
  -- the outcome fields and the supersession marker must still be writable,
  -- or a notified match could never record what came of it.
  update public.listing_matches
     set outcome = 'agent_sent', outcome_at = now()
   where id = second_id;
  raise notice 'OK C4 — a notified match still records its outcome';

  update public.listing_matches set superseded_at = now() where id = second_id;
  raise notice 'OK C5 — and may still be marked as history';

  if fired <> 7 then
    raise exception 'ONLY % OF 7 REFUSALS FIRED — something is not holding', fired;
  end if;
  raise notice 'ALL SEVEN REFUSAL CASES FIRED, and all six permitted cases were accepted';
end $$;

rollback;

-- Expect, in order:
--   OK A1, OK A2, OK A3, OK A4
--   OK — a legitimate computed row was accepted
--   OK B1, OK B2, OK B2b
--   OK C0, OK C1, OK C2, OK C3, OK C4, OK C5
--   ALL SEVEN REFUSAL CASES FIRED, and all six permitted cases were accepted
--
-- Any 'DID NOT FIRE' is a guard that is not holding. A missing OK on a
-- PERMITTED case is the opposite failure and matters just as much: a table
-- that refuses everything passes every refusal test there is.
