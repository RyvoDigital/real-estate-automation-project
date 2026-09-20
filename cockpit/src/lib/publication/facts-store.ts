import 'server-only'

import { admin } from '@/lib/supabase/admin'

/**
 * Reading and writing the facts that satisfy a jurisdiction's requirements.
 *
 * Replaces the flat columns 0028 added and 0032 drops. The shape moved for a
 * reason that is not cosmetic: `listings.energy_class` could hold Portugal's
 * single letter and nothing else, and `clients.ami_licence` could hold one
 * registration when a Spanish agency holds several — one per region, and one
 * does not satisfy another's requirement.
 *
 * ⚠️ REQUIREMENT IDS ARE PASSED IN, NEVER HARDCODED HERE. The moment this file
 * knows that Portugal's rating is called `pt_energy_class`, the generality the
 * whole redesign bought is spent: the caller resolves the requirements from the
 * policy row and asks for the facts that satisfy THEM.
 */

export type PropertyFact = {
  id: string
  requirementId: string
  values: Record<string, unknown>
  certificateNumber: string | null
  validUntil: string | null
  registrationStatus: 'not_required' | 'registered' | 'not_registered' | 'unknown'
  exemption: { declared_by: string; basis: string; at: string } | null
  source: 'typed' | 'lookup_confirmed'
}

export type AgencyFact = {
  id: string
  requirementId: string
  country: string
  region: string | null
  number: string
  status: 'valid' | 'suspended' | 'cancelled' | 'unknown'
  statusCheckedAt: string | null
}

export async function listingFacts(listingId: string): Promise<PropertyFact[]> {
  const { data, error } = await admin()
    .from('listing_facts')
    .select('id, requirement_id, values, certificate_number, valid_until, registration_status, exemption, source')
    .eq('listing_id', listingId)
  if (error) throw new Error(`listing facts read failed: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    requirementId: r.requirement_id as string,
    values: (r.values ?? {}) as Record<string, unknown>,
    certificateNumber: (r.certificate_number as string) ?? null,
    validUntil: (r.valid_until as string) ?? null,
    registrationStatus: r.registration_status as PropertyFact['registrationStatus'],
    exemption: (r.exemption as PropertyFact['exemption']) ?? null,
    source: r.source as PropertyFact['source'],
  }))
}

/**
 * Every property fact this client holds, across all of their listings.
 *
 * `listingFacts` reads one listing at a time, which is what the gate needs —
 * it is deciding about one property. A screen that asks "what is still good"
 * is asking across the whole client, and doing that by calling the per-listing
 * read in a loop would be one query per property.
 *
 * 🔒 `listing_facts` carries `client_id` itself (0030), so this is one filter
 * rather than a join through `listings`. The reference comes back separately,
 * because a fact for a listing that has since been deleted should still be
 * visible rather than silently dropped by an inner join.
 */
export async function clientFacts(clientId: string): Promise<(PropertyFact & { listingId: string })[]> {
  const { data, error } = await admin()
    .from('listing_facts')
    .select(
      'id, listing_id, requirement_id, values, certificate_number, valid_until, registration_status, exemption, source',
    )
    .eq('client_id', clientId)
  if (error) throw new Error(`client facts read failed: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    listingId: r.listing_id as string,
    requirementId: r.requirement_id as string,
    values: (r.values ?? {}) as Record<string, unknown>,
    certificateNumber: (r.certificate_number as string) ?? null,
    validUntil: (r.valid_until as string) ?? null,
    registrationStatus: r.registration_status as PropertyFact['registrationStatus'],
    exemption: (r.exemption as PropertyFact['exemption']) ?? null,
    source: r.source as PropertyFact['source'],
  }))
}

/** listing id → the agency's own reference, for naming a property readably. */
export async function listingReferences(clientId: string): Promise<Map<string, string | null>> {
  const { data, error } = await admin().from('listings').select('id, reference').eq('client_id', clientId)
  if (error) throw new Error(`listing references read failed: ${error.message}`)
  return new Map((data ?? []).map((r) => [r.id as string, (r.reference as string) ?? null]))
}

export async function agencyFacts(clientId: string): Promise<AgencyFact[]> {
  const { data, error } = await admin()
    .from('agency_facts')
    .select('id, requirement_id, country, region, number, status, status_checked_at')
    .eq('client_id', clientId)
  if (error) throw new Error(`agency facts read failed: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    requirementId: r.requirement_id as string,
    country: r.country as string,
    region: (r.region as string) ?? null,
    number: r.number as string,
    status: r.status as AgencyFact['status'],
    statusCheckedAt: (r.status_checked_at as string) ?? null,
  }))
}

/**
 * Record an exemption against ONE requirement.
 *
 * Which requirement is the caller's to decide, from the policy row — and
 * whether that requirement is exemptible at all is the jurisdiction's answer,
 * not this function's. That is the whole point of the move: the old column
 * presumed exemption was a property of the PROPERTY.
 *
 * `valid_until` is deliberately left null, which 0030's `fact_values_are_dated`
 * permits only because an exemption is present. An exemption has no expiry
 * because it has no certificate to expire.
 */
export async function recordExemption(input: {
  clientId: string
  listingId: string
  requirementId: string
  exemption: { declared_by: string; basis: string; at: string; recorded_by: string }
}): Promise<void> {
  const existing = await admin()
    .from('listing_facts')
    .select('id')
    .eq('listing_id', input.listingId)
    .eq('requirement_id', input.requirementId)
    .maybeSingle()

  const row = {
    client_id: input.clientId,
    listing_id: input.listingId,
    requirement_id: input.requirementId,
    values: {},
    exemption: input.exemption,
    registration_status: 'not_required',
    source: 'typed' as const,
    updated_at: new Date().toISOString(),
  }

  // Update by id, insert otherwise. Never an upsert: `listing_facts_current` is
  // a plain unique index today, but the caller reading first and deciding keeps
  // this path free of ON CONFLICT entirely — 42P10 is the defect from 0003/0004
  // and the cheapest way not to meet it again is not to emit the clause.
  const { error } = existing.data?.id
    ? await admin().from('listing_facts').update(row).eq('id', existing.data.id)
    : await admin().from('listing_facts').insert(row)
  if (error) throw new Error(`exemption write failed: ${error.message}`)
}

/** Does this listing already hold a rating for this requirement? */
export function alreadyRated(facts: PropertyFact[], requirementId: string): boolean {
  const f = facts.find((x) => x.requirementId === requirementId)
  return Boolean(f && !f.exemption && Object.keys(f.values).length > 0)
}
