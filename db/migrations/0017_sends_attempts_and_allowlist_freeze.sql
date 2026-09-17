-- ============ 0017 — retry bookkeeping, and the freeze inverted ============
--
-- Additive to 0015. Two changes, and the second is the one that matters.

-- ---------------------------------------------------------------------------
-- 1. Retry bookkeeping for the ONE retryable failure
-- ---------------------------------------------------------------------------
-- The send path never retries an ambiguous outcome, and silence is always
-- ambiguous (docs/send-path-design.md §3). The only retryable answer is an
-- explicit "I did not accept this, try later" -- a 429 -- and it must be
-- bounded, because an unbounded retry against a provider with NO idempotency
-- support is a machine for sending the same message twice.
alter table public.sends
  add column if not exists attempts integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error text;

comment on column public.sends.attempts is
  'Dispatch attempts. Only a 429 increments it; every other failure is terminal or ambiguous. Bounded at 3 -- see docs/send-path-design.md §3.2.';
comment on column public.sends.last_error is
  'The most recent attempt''s error, distinct from `error`, which is the final one.';

-- ---------------------------------------------------------------------------
-- 2. THE FREEZE BECOMES AN ALLOWLIST, BECAUSE A DENYLIST FAILS OPEN
-- ---------------------------------------------------------------------------
-- 0015's trigger listed the frozen columns and refused an UPDATE that touched
-- any of them. That is a DENYLIST, and it means every column added afterwards
-- is mutable by default -- including the three added above, and including
-- whatever a future migration adds to carry part of an authorisation.
--
-- The property was "the authorisation cannot be rewritten after the fact". The
-- next obvious step -- adding a column -- silently weakens it, with nothing
-- failing and nobody told. That is engineering-lessons §12 arriving inside the
-- mechanism built to defend against §11b, two days after it was written.
--
-- So the rule is inverted: ONLY the outcome columns may change. Everything
-- else, existing or not yet invented, is frozen. A future column is frozen
-- until someone deliberately adds it to this list, which is a decision they
-- have to make rather than one they make by omission.
create or replace function public.sends_freeze_authorisation()
returns trigger language plpgsql as $$
declare
  -- The outcome genuinely arrives later. Everything here is a fact about what
  -- happened AFTER the decision; nothing here is part of the decision.
  mutable constant text[] := array[
    'status',
    'provider', 'provider_message_id', 'body_sent',
    'sent_at', 'delivered_at', 'failed_at', 'error',
    'attempts', 'last_attempt_at', 'last_error',
    'reconciled_at',
    'updated_at'
  ];
  changed text[];
begin
  select array_agg(key order by key) into changed
  from jsonb_each(to_jsonb(new)) n
  where not (n.key = any(mutable))
    and n.value is distinct from (to_jsonb(old) -> n.key);

  if changed is not null then
    raise exception
      'sends: the authorisation is frozen once written. Refused change to: %. '
      'Only the outcome columns may change (%). A row recording a send that '
      'should not have happened is the only row anyone would be tempted to '
      'edit (engineering-lessons 11b), and a column added later is frozen by '
      'default on purpose (this migration''s header).',
      array_to_string(changed, ', '), array_to_string(mutable, ', ');
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- The trigger itself is unchanged and still bound to this function name.

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
-- The three columns:
--   select column_name from information_schema.columns
--    where table_name = 'sends'
--      and column_name in ('attempts','last_attempt_at','last_error');   -- 3 rows
--
-- The inversion, which is the point. Inside a transaction:
--   begin;
--     insert into public.sends (client_id, phone_e164, automation, idempotency_key,
--       gate_verdict, gate_decided_at, status)
--     select id, '+351911111111', 'proof', 'proof-0017', 'permitted', now(), 'intended'
--       from public.clients limit 1;
--
--     -- an outcome column: ALLOWED
--     update public.sends set attempts = 1, last_attempt_at = now(),
--            last_error = '429 slow down' where idempotency_key = 'proof-0017';
--     -- expect: UPDATE 1
--
--     -- an authorisation column: REFUSED, by name
--     update public.sends set gate_decided_at = now() where idempotency_key = 'proof-0017';
--     -- expect: ERROR ... Refused change to: gate_decided_at
--
--     -- and a column 0015's denylist never mentioned, now frozen:
--     update public.sends set campaign_id = gen_random_uuid()
--      where idempotency_key = 'proof-0017';
--     -- expect: ERROR ... Refused change to: campaign_id
--     -- (0015's version would have ALLOWED this. That is the defect being fixed.)
--   rollback;
