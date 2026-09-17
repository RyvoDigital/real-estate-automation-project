-- ============ jurisdiction_policy — Stage 1, piece 2 ============
--
-- One row per country. What is permitted there, on what statutory basis, and
-- whether a lawyer has actually confirmed it.
--
-- THE STRUCTURE IS TECHNICAL; THE CONTENT IS A LAWYER'S. That sentence is in
-- the Enquadramento §8.3 and it is the reason for `confirmed_at` and
-- `confirmed_by` below: a row nobody has confirmed is present, readable and
-- INERT. The eight rows seeded here carry the research behind the framework and
-- not one of them is confirmed, so on the day this is applied the table permits
-- nothing at all. That is the intended initial state.
--
-- AN EMPTY TABLE FAILS SAFE BY CONSTRUCTION
-- The gate's question is "does this country have a CONFIRMED row permitting
-- this segment". No row, or an unconfirmed row, answers no. So the table cannot
-- be wrong in the dangerous direction by being incomplete -- only by being
-- confirmed wrongly, which takes a human act that leaves a name and a date.
--
-- WHY A TABLE AND NOT CODE
-- "One table changes and every client is compliant the next day" (spec §6.3) is
-- only true if the policy lives in data. Ireland's route lapses at twelve
-- months, Spain's segment C is off pending advice, the ePrivacy Regulation will
-- land eventually: each of those is an UPDATE here, not a deploy.
--
-- THIS TABLE IS MUTABLE, DELIBERATELY, UNLIKE THE LEDGER
-- consent_events is append-only because it records what happened. This records
-- what we currently believe the law to be, which changes -- so it is an
-- ordinary table with an ordinary UPDATE. The audit trail that matters is the
-- ledger's record of what was sent under which policy, not a history of our
-- beliefs. `confirmed_at` moving backwards is the signal that a row needs
-- re-reading, and §5.12's compliance watch is what will move it.

create table if not exists public.jurisdiction_policy (
  country text primary key,                        -- ISO-3166-1 alpha-2, from the dialling prefix

  -- The existing-customer route (segment A). The three-way answer matters:
  -- 'unavailable' is a legal conclusion, 'unknown' is an absence of analysis,
  -- and collapsing them would let an unanalysed country look decided.
  existing_customer text not null default 'unknown'
    check (existing_customer in ('available', 'unavailable', 'unknown')),

  -- Segment C: may consent be REQUESTED over this channel at all? Spain is the
  -- known 'no'; the Gate A question may make it 'no' everywhere.
  consent_request text not null default 'unknown'
    check (consent_request in ('permitted', 'prohibited', 'unknown')),

  -- Consent expiry in months, where the jurisdiction imposes one. Ireland: 12.
  -- Null means no expiry is known, NOT that consent is eternal -- the gate
  -- treats an unconfirmed row as permitting nothing, so null is never relied on.
  consent_expiry_months integer check (consent_expiry_months is null or consent_expiry_months > 0),

  -- Platform-level facts, which are not law and are not negotiable either.
  platform_blocked boolean not null default false,  -- Meta refuses marketing templates here
  platform_note text,

  statute text,                                    -- the diploma, by name and article
  authority text,                                  -- the supervisory authority
  traps text,                                      -- what specifically bites here
  list_obligation text,                            -- e.g. Portugal's art. 13.º-B lists

  -- THE FIELDS THAT DECIDE WHETHER THIS ROW DOES ANYTHING
  confirmed_at timestamptz,                        -- null = inert
  confirmed_by text,                               -- the lawyer, by name
  confirmed_note text,

  researched_at timestamptz default now(),         -- when WE read the sources
  source_note text,                                -- where the unconfirmed content came from
  updated_at timestamptz default now(),

  -- A confirmation must say who gave it. A date with no name is not a
  -- confirmation, it is a date.
  constraint jurisdiction_confirmed_has_author
    check ((confirmed_at is null) = (confirmed_by is null)),
  constraint jurisdiction_country_iso check (country ~ '^[A-Z]{2}$')
);

alter table public.jurisdiction_policy enable row level security;
revoke all on public.jurisdiction_policy from anon, authenticated;
grant select, insert, update on public.jurisdiction_policy to service_role;

comment on table public.jurisdiction_policy is
  'One row per country: what is permitted, on what basis, and whether a lawyer confirmed it. An unconfirmed row is inert -- see Enquadramento §8.3.';
comment on column public.jurisdiction_policy.confirmed_at is
  'NULL means this row permits nothing. The gate requires a confirmation, not a row.';
comment on column public.jurisdiction_policy.existing_customer is
  '"unavailable" is a legal conclusion; "unknown" is an absence of analysis. Never collapse them.';

-- ---------------------------------------------------------------------------
-- THE EIGHT ROWS OF §8.3. NOT ONE OF THEM IS CONFIRMED.
-- ---------------------------------------------------------------------------
-- Content is the research behind the Enquadramento, carried here so the gate
-- has something to read and so a lawyer has something to correct. Every
-- confirmed_at is null, so applying this migration grants no permission
-- whatsoever.
insert into public.jurisdiction_policy
  (country, existing_customer, consent_request, consent_expiry_months,
   platform_blocked, platform_note, statute, authority, traps, list_obligation, source_note)
values
  ('PT', 'unknown', 'unknown', null, false, null,
   'Lei n.º 41/2004, arts. 13.º-A e 13.º-B', 'CNPD',
   'Art. 13.º-A covers "outros tipos de aplicações similares", which includes WhatsApp. Lista Robinson (Lei 6/99) should be screened.',
   'Art. 13.º-B: maintain lists of those who consented AND of customers who did not object',
   'Enquadramento §8.3, research 17 Sep 2026. CNPD Diretriz 2022/1.'),

  ('ES', 'unknown', 'unknown', null, false, null,
   'Ley 34/2002 (LSSI), art. 21', 'AEPD',
   'AEPD reads the existing-customer exception so narrowly that practitioners treat it as unusable. B2B gets the same protection as B2C. Segment C is to stay disabled here pending advice.',
   null,
   'Enquadramento §8.3, research 17 Sep 2026.'),

  ('IE', 'unknown', 'unknown', 12, false, null,
   'S.I. 336/2011 (ePrivacy Regulations)', 'DPC',
   'Soft opt-in lapses 12 months after the sale or the last compliant message. An undated consent can therefore never be honoured here, which is why consent_events requires occurred_at on consent_given.',
   null,
   'Enquadramento §8.3, research 17 Sep 2026.'),

  ('DE', 'unknown', 'unknown', null, false, null,
   'UWG §7', 'BfDI and the Länder authorities',
   'Advertising without prior express consent is treated as harassment. Single opt-in has been held insufficient as evidence; double opt-in is the de facto standard. Same rule B2B and B2C.',
   null,
   'Enquadramento §8.3, research 17 Sep 2026.'),

  ('FR', 'unknown', 'unknown', null, false, null,
   'Code des postes et des communications électroniques, art. L34-5', 'CNIL',
   'CNIL requires separate consent for marketing and restricts reuse of data collected for another purpose.',
   null,
   'Enquadramento §8.3, research 17 Sep 2026.'),

  ('NL', 'unknown', 'unknown', null, false, null,
   'Telecommunicatiewet art. 11.7', 'Autoriteit Persoonsgegevens',
   'Strict prior opt-in. Fines issued for using purchased lists without verifying the consent behind them.',
   null,
   'Enquadramento §8.3, research 17 Sep 2026.'),

  ('GB', 'unknown', 'unknown', null, false, null,
   'PECR 2003, reg. 22', 'ICO',
   'Soft opt-in for similar products, with an opt-out offered at collection and in every message. WARNING: +44 is shared with GG, JE and IM, which are NOT the United Kingdom for data protection purposes and are not covered by this row.',
   null,
   'Enquadramento §8.3, research 17 Sep 2026. Crown Dependencies finding, findings log 17 Sep.'),

  ('US', 'unavailable', 'prohibited', null, true,
   'Meta does not deliver marketing templates to +1 numbers. Utility and authentication only.',
   'TCPA and state law, unanalysed', 'FTC and state attorneys general',
   'Blocked at the platform before any legal question arises. +1 is also shared with Canada and some twenty Caribbean countries, which have their own rows and their own law.',
   null,
   'Enquadramento §8.3, research 17 Sep 2026. Platform fact, not a legal conclusion.')
on conflict (country) do nothing;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select count(*) from public.jurisdiction_policy;                  -- expect 8
--   select count(*) from public.jurisdiction_policy
--    where confirmed_at is not null;                                  -- expect 0
--
-- The US row is the only one carrying a hard 'unavailable' before any legal
-- confirmation, because a platform refusal is not a legal conclusion and does
-- not need a lawyer:
--   select country, existing_customer, platform_blocked
--     from public.jurisdiction_policy where platform_blocked;          -- expect US
--
-- And the constraint that a confirmation names someone:
--   begin;
--     update public.jurisdiction_policy set confirmed_at = now() where country = 'PT';
--     -- expect: ERROR ... jurisdiction_confirmed_has_author
--   rollback;
