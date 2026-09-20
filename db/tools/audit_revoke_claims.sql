-- ====== READ-ONLY. Every revoke a migration CLAIMS, against what is true. ======
--
-- 🔴 THIS WRITES NOTHING. Paste it and hand back the output.
--
-- It is not a grant listing. It is a COMPARISON: the expected set below was
-- extracted from the `revoke` statements in db/migrations, so every row it
-- returns is a migration whose claim is not in force.
--
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS
-- ---------------------------------------------------------------------------
-- 0042 revokes update, delete and truncate on client_contracts from
-- service_role. The grant listing of 21 September shows service_role holding
-- all three. The revoke is not in force, and append-only was resting on the
-- trigger alone — the arrangement 0012 explicitly refused.
--
-- Six other migrations claim revokes of their own. If those did not apply
-- either, the belt is off on the CONSENT LEDGER and on SENDS, which is more
-- serious than it was on an empty contracts table: consent_events is the
-- record of who may lawfully be messaged, and a deletable ledger is one whose
-- absence of an objection means nothing.
--
-- 🔒 A TRIGGER STILL GUARDS EACH OF THEM. This audit is about the belt, not
-- about whether the guarantee is holding.

with claimed(migration, relation, grantee, privilege) as (values
  -- 0012 — the consent ledger
  ('0012', 'consent_events', 'service_role',  'UPDATE'),
  ('0012', 'consent_events', 'service_role',  'DELETE'),
  ('0012', 'consent_events', 'service_role',  'TRUNCATE'),
  ('0012', 'consent_events', 'authenticated', 'UPDATE'),
  ('0012', 'consent_events', 'authenticated', 'DELETE'),
  ('0012', 'consent_events', 'authenticated', 'TRUNCATE'),
  ('0012', 'consent_events', 'anon',          'UPDATE'),
  ('0012', 'consent_events', 'anon',          'DELETE'),
  ('0012', 'consent_events', 'anon',          'TRUNCATE'),

  -- 0013 — revoke ALL on the two consent views
  ('0013', 'consent_by_contact', 'anon',          'SELECT'),
  ('0013', 'consent_by_contact', 'authenticated', 'SELECT'),
  ('0013', 'leads_consent',      'anon',          'SELECT'),
  ('0013', 'leads_consent',      'authenticated', 'SELECT'),

  -- 0014, 0015, 0016, 0018, 0020 — revoke ALL from anon and authenticated
  ('0014', 'jurisdiction_policy', 'anon',          'SELECT'),
  ('0014', 'jurisdiction_policy', 'authenticated', 'SELECT'),
  ('0015', 'sends',               'anon',          'SELECT'),
  ('0015', 'sends',               'authenticated', 'SELECT'),
  ('0016', 'invariant_send_after_objection', 'anon',          'SELECT'),
  ('0016', 'invariant_send_after_objection', 'authenticated', 'SELECT'),
  ('0018', 'campaign_runs',       'anon',          'SELECT'),
  ('0018', 'campaign_runs',       'authenticated', 'SELECT'),
  ('0020', 'message_templates',   'anon',          'SELECT'),
  ('0020', 'message_templates',   'authenticated', 'SELECT'),

  -- 0042
  ('0042', 'client_contracts', 'service_role', 'UPDATE'),
  ('0042', 'client_contracts', 'service_role', 'DELETE'),
  ('0042', 'client_contracts', 'service_role', 'TRUNCATE'),

  -- ═══════════════════════════════════════════════════════════════════════
  -- 🔴 THE CONTROL. NOT A CLAIM — a privilege that MUST be found present.
  -- ═══════════════════════════════════════════════════════════════════════
  --
  -- The first version of this audit used 0042's three rows as its control,
  -- on the reasoning that they were known not to be in force. They turned out
  -- to BE in force, the whole result came back 'ok', and by the file's own
  -- stated criterion that read as "the query is not matching" — a false alarm
  -- produced by a control whose premise was wrong.
  --
  -- §1q, a third time: **a control pinned to a specific absence decays the
  -- moment the absence is filled** — including by having been mistaken about
  -- it. So the control is now a presence that cannot be revoked without
  -- breaking the product:
  --
  --   service_role MUST hold SELECT on clients. The cockpit cannot read a
  --   single screen without it. Nobody will ever revoke it, so this row must
  --   ALWAYS come back '🔴 STILL GRANTED'.
  --
  -- 🔒 IF IT DOES NOT, THE JOIN IS BROKEN AND EVERY 'ok' ABOVE MEANS NOTHING.
  -- That is the only reading of a clean result that is worth anything.
  ('CONTROL — must read STILL GRANTED', 'clients', 'service_role', 'SELECT')
)
select c.migration,
       c.relation,
       c.grantee,
       c.privilege                     as should_be_revoked,
       case when g.privilege_type is null then 'ok — revoked'
            else '🔴 STILL GRANTED' end as state
  from claimed c
  left join information_schema.table_privileges g
    on g.table_schema = 'public'
   and g.table_name   = c.relation
   and g.grantee      = c.grantee
   and g.privilege_type = c.privilege
 order by (g.privilege_type is null), c.migration, c.relation, c.grantee, c.privilege;

-- ---------------------------------------------------------------------------
-- HOW TO READ IT
-- ---------------------------------------------------------------------------
-- Rows marked 🔴 STILL GRANTED are revokes that are not in force. Every one is
-- a migration whose file says a privilege was removed and whose database
-- disagrees.
--
-- 🔴 FIRST, FIND THE CONTROL ROW. `clients / service_role / SELECT` must read
-- 🔴 STILL GRANTED. It is not a claim and not a problem: it is the privilege
-- the whole cockpit depends on, and it exists precisely because it can never
-- be revoked.
--
-- If the control reads 'ok — revoked', the join is not matching and EVERY
-- OTHER ROW IS MEANINGLESS. A clean audit is only worth something when the
-- control is dirty. (§1n, and §1q for why the control is a presence rather
-- than an absence.)
--
-- ---------------------------------------------------------------------------
-- AND THE ONE THIS CANNOT SEE
-- ---------------------------------------------------------------------------
-- 0025 (listing_matches) has a freeze trigger and NO revoke at all — so there
-- is no claim to audit. Its belt was never written rather than never applied,
-- which is a different finding and is not in the table above.
