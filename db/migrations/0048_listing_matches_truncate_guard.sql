-- ====== listing_matches: the guarantee behind the belt ======
--
-- ALONE, in a transaction, with 0032's treatment.
--
-- ---------------------------------------------------------------------------
-- 🔴 WHAT 0047 LEFT, AND SAID IT WAS LEAVING
-- ---------------------------------------------------------------------------
-- `0025`'s freeze is `before update … for each row`. Verified 21 September:
-- `listing_matches` carries exactly one trigger, `listing_matches_freeze_trg`,
-- and there is no TRUNCATE trigger.
--
-- So TRUNCATE was unguarded entirely, and a row-level trigger cannot guard it:
-- TRUNCATE fires no row triggers, which is the hole `0012` names in as many
-- words — *"TRUNCATE does not fire a row-level trigger, and would empty the
-- ledger without tripping either guard."*
--
-- `0047` revoked the privilege, so the belt is on. But that leaves
-- listing_matches in the arrangement this project refuses in the other
-- direction: **a belt with no guarantee.** `0012`'s argument is symmetric —
-- a future default-privileges change can restore a revoked privilege, and
-- then nothing at all stands in the way.
--
-- ---------------------------------------------------------------------------
-- 🔒 A SEPARATE FUNCTION, NOT THE EXISTING ONE
-- ---------------------------------------------------------------------------
-- `listing_matches_freeze()` reads `old.agent_notified_at` and
-- `to_jsonb(new)`. A statement-level trigger has NEITHER — there is no row —
-- so reusing it would fail at run time with a null-record error rather than
-- with its own refusal, and the failure would look like a bug in the guard
-- instead of a guard doing its job.
--
-- `0012` has the same shape and solves it the same way: its append-only
-- function raises unconditionally and is therefore safe on both a row trigger
-- and a statement trigger.
--
-- ---------------------------------------------------------------------------
-- AND THE DELETE SIDE, WHICH IS THE SAME GAP ONE VERB ALONG
-- ---------------------------------------------------------------------------
-- The freeze is `before update` only. A NOTIFIED match could be DELETED
-- outright — the strongest possible version of "the record disagrees with what
-- happened", since the record stops existing while the agent still acted on it.
--
-- 🔒 But not every delete is wrong. An unnotified match is working material:
-- recomputed, discarded, never sent to anybody. So this refuses only what the
-- freeze already protects — a match somebody was told about — rather than
-- making the table undeletable and turning a cleanup into a migration.

begin;

do $$
declare n_table bigint; n_freeze bigint;
begin
  select count(*) into n_table from information_schema.tables
   where table_schema='public' and table_name='listing_matches';
  if n_table = 0 then
    raise exception 'REFUSING: public.listing_matches does not exist. 0025 comes first.';
  end if;

  select count(*) into n_freeze from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal and c.relname='listing_matches' and t.tgname='listing_matches_freeze_trg';
  if n_freeze = 0 then
    raise exception
      'REFUSING: listing_matches_freeze_trg is missing. This migration adds guards BESIDE '
      'the freeze, not instead of it — if the freeze itself is gone, that is the finding, '
      'and adding a truncate guard would hide it behind a partial fix.';
  end if;

  raise notice 'Preconditions proven, not assumed: table present, freeze trigger present.';
end $$;

-- ---------------------------------------------------------------------------
-- The truncate guard
-- ---------------------------------------------------------------------------
create or replace function public.listing_matches_no_truncate()
returns trigger language plpgsql as $$
begin
  -- Unconditional, and therefore safe on a statement trigger: it touches
  -- neither OLD nor NEW, which a statement-level invocation does not have.
  raise exception
    'listing_matches cannot be truncated: it is the record of what buyers were told '
    'about which properties. TRUNCATE fires no row trigger, so the freeze would not '
    'have seen it — and every notified match would vanish while the agents who acted '
    'on them would not.';
end;
$$;

drop trigger if exists listing_matches_no_truncate_trg on public.listing_matches;
create trigger listing_matches_no_truncate_trg
  before truncate on public.listing_matches
  for each statement execute function public.listing_matches_no_truncate();

-- ---------------------------------------------------------------------------
-- The delete guard, for notified matches only
-- ---------------------------------------------------------------------------
create or replace function public.listing_matches_no_delete_notified()
returns trigger language plpgsql as $$
begin
  if old.agent_notified_at is not null then
    raise exception
      'listing_matches: this match was sent to an agent at %, so it cannot be deleted. '
      'The agent acted on it; removing the row makes the record disagree with what '
      'happened, which is the same failure the update freeze exists to prevent, one verb '
      'along. Retire it by stamping superseded_at instead.',
      old.agent_notified_at;
  end if;
  return old;
end;
$$;

drop trigger if exists listing_matches_no_delete_notified_trg on public.listing_matches;
create trigger listing_matches_no_delete_notified_trg
  before delete on public.listing_matches
  for each row execute function public.listing_matches_no_delete_notified();

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select tgname, pg_get_triggerdef(oid) from pg_trigger
--    where tgrelid = 'public.listing_matches'::regclass and not tgisinternal
--    order by tgname;
--   -- expect THREE: listing_matches_freeze_trg (before update, row),
--   --   listing_matches_no_delete_notified_trg (before delete, row),
--   --   listing_matches_no_truncate_trg (before truncate, statement).
--
-- 🔒 The belt from 0047 stays. Both are needed, which is 0012's whole argument
-- and the reason this file exists at all.
