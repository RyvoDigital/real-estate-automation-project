-- ============ the two facts an advertisement may not lack ============
--
-- Automation 04, §8.A of the Enquadramento de Conformidade.
--
-- Since 2013 every sale or rental advertisement in Portugal must state the
-- property's ENERGY RATING, and the agency's AMI LICENCE NUMBER must appear in
-- all of its publicity and documentation (Lei n.º 15/2013, supervised by
-- IMPIC). Fines run €250–€3,741 and fall on whoever puts the property on the
-- market — which can be the mediator, so on our client.
--
-- Neither fact exists anywhere in this schema today. The gate §8.A demands has
-- nothing to refuse on, which is why this migration comes before the gate.
--
-- ---------------------------------------------------------------------------
-- AN EXPIRED CERTIFICATE IS AN ABSENT ONE, SO THE DATE IS NOT OPTIONAL
-- ---------------------------------------------------------------------------
-- §8.A: "Um certificado caducado é tratado como ausente."
--
-- That single sentence is why `energy_certificate_expires_at` exists and why
-- it is checked rather than displayed. **A listing lawfully advertised in March
-- is unlawfully advertised in December with no data having changed and nobody
-- having acted.** Publication is a state, not a moment — and the general form
-- is worth keeping: a permission that can expire without anyone acting is a
-- permission that has to be RE-ASKED rather than granted.
--
-- The constraint below therefore refuses a class with no expiry date. A rating
-- we cannot date is a rating we cannot defend, and storing it would produce a
-- gate that passes on a certificate nobody can prove is current.
--
-- ---------------------------------------------------------------------------
-- ⚖️ EXEMPTION IS A DECLARATION, NOT A CHECKBOX
-- ---------------------------------------------------------------------------
-- Not every building is subject to certification. The exact scope is with the
-- lawyer (question 2, legal/fonte/nota-questoes-automacao-04.md) and the design
-- consequence does not depend on the answer:
--
--   IGNORE exemptions  -> a legitimately exempt property can never be published
--                         through us, and the agency routes around the system.
--                         Worse than not having the feature.
--   A CHECKBOX         -> it becomes the door everything walks through, and the
--                         obligation has no practical effect at all.
--
-- So an exemption is a person at the agency saying so, in their own words, with
-- their name and the date — the SAME ARTEFACT as the segment declaration in
-- `consent_events`, pointed at a different regulator. The system does not
-- qualify the exemption; it records who invoked it and on what ground, and that
-- record is what answers an IMPIC inspection.
--
-- The CHECK makes the shape structural: an exemption without an author or
-- without a basis is not a declaration, it is a blank cheque, and the database
-- refuses it. Compare `declaration_has_its_author` in 0024 — same rule, and it
-- is deliberate that they read the same, because an agency that has done one
-- will recognise the other.

alter table public.listings
  add column if not exists energy_class                  text,
  add column if not exists energy_certificate_number     text,
  add column if not exists energy_certificate_expires_at date,
  add column if not exists energy_exemption              jsonb;

-- A rating we cannot date is a rating we cannot defend.
alter table public.listings
  drop constraint if exists energy_class_is_dated;
alter table public.listings
  add constraint energy_class_is_dated
  check (energy_class is null or energy_certificate_expires_at is not null);

-- An exemption with no author or no basis is not a declaration.
alter table public.listings
  drop constraint if exists exemption_is_a_declaration;
alter table public.listings
  add constraint exemption_is_a_declaration
  check (
    energy_exemption is null
    or (
      coalesce(energy_exemption ->> 'declared_by', '') <> ''
      and coalesce(energy_exemption ->> 'basis', '') <> ''
      and coalesce(energy_exemption ->> 'at', '') <> ''
    )
  );

-- ⚠️ NOT constrained: that a listing has EITHER a class OR an exemption. That
-- is the GATE's job, not the table's. A listing arrives from a WhatsApp message
-- long before anybody has looked up its certificate, and refusing the row would
-- mean an agent cannot record a property at all until they have the paperwork —
-- which is the constraint that makes them stop using the system. The table
-- accepts an incomplete property; the gate refuses to ADVERTISE one.

comment on column public.listings.energy_class is
  'A+..F. Required in every advertisement since 2013. Null means not yet recorded, not exempt.';
comment on column public.listings.energy_exemption is
  '{declared_by, basis, at} — an agency person saying why this property needs no rating. Never inferred.';

-- The gate's query: everything currently advertisable, and everything whose
-- certificate is about to stop being current.
create index if not exists listings_certificate_expiry_idx
  on public.listings (client_id, energy_certificate_expires_at)
  where energy_certificate_expires_at is not null;

-- ---------------------------------------------------------------------------
-- The agency's own licence number
-- ---------------------------------------------------------------------------
-- On `clients` rather than on each listing: it is a property of the agency and
-- it appears on EVERY piece they publish. One per client, wrong in one place
-- rather than wrong in three hundred.

alter table public.clients
  add column if not exists ami_licence text;

comment on column public.clients.ami_licence is
  'IMPIC mediation licence (Lei 15/2013). Must appear in all publicity. Null blocks publication.';

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING -- through PostgREST, not psql alone (0002, 0003)
-- ---------------------------------------------------------------------------
--   select has_table_privilege('service_role','public.listings','UPDATE');  -- t
--
-- Each constraint proven by TRYING TO BREAK IT, the way 0009's status typo was:
--
--   -- a rating with no date must be refused
--   update listings set energy_class = 'B' where id = '<a listing>';
--   -- expect: violates "energy_class_is_dated"
--
--   -- and the same rating WITH a date must be accepted
--   update listings set energy_class = 'B',
--          energy_certificate_expires_at = '2031-01-01' where id = '<a listing>';
--   -- expect: ok  ← the neighbour. A table that refused everything would pass
--   --               the case above identically (§7b)
--
--   -- an exemption with no basis must be refused
--   update listings set energy_exemption = '{"declared_by":"A. Ferreira"}'::jsonb ...
--   -- expect: violates "exemption_is_a_declaration"
--
--   -- an exemption with all three must be accepted
--   update listings set energy_exemption =
--     '{"declared_by":"A. Ferreira","basis":"Imóvel em ruína, sem uso","at":"2026-09-18"}'::jsonb ...
--   -- expect: ok
--
-- Roll all of it back. Nothing here should survive the check.
