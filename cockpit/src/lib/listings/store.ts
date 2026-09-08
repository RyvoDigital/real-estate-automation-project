import 'server-only'

import { admin } from '@/lib/supabase/admin'
import { parseListingMessage, type ParsedListing } from './parse'
import { applyMatchable } from './query'
import { STATUS_LABEL, isMatchable, type ListingStatus } from './status'

/**
 * Storing a listing, and the query the matching engine will use.
 *
 * The parse lives in ONE place — src/lib/listings/parse.ts, in TypeScript,
 * with tests. n8n forwards the agent's message here rather than parsing it
 * itself, because two copies of a parser that has already produced two defects
 * is how the fixed one and the broken one diverge (lesson 15).
 */

export type Listing = {
  id: string
  client_id: string
  reference: string | null
  title: string | null
  property_type: string | null
  area: string | null
  price: number | null
  bedrooms: number | null
  size_sqm: number | null
  features: string[]
  status: ListingStatus
  status_changed_at: string
  source: string | null
  raw_message: string | null
  created_at: string
}

/**
 * THE MATCHING QUERY.
 *
 * Only `available`. §3: a listing that goes under offer must stop matching,
 * because telling a buyer about a house that sold last week is the worst
 * output this automation can produce.
 *
 * Filtered through applyMatchable() — the SAME function the exclusion probe
 * applies, so the probe cannot drift from what ships — rather than a `neq` on
 * the statuses we happen to know about — a deny-list admits every status added
 * later, silently, and the failure would be a buyer hearing about a house that
 * is no longer for sale. tests/probe-listing-excludes.ts proves the exclusion
 * by inserting one listing of EVERY status and asserting which come back.
 */
export async function matchableListings(clientId: string): Promise<Listing[]> {
  const base = admin().from('listings').select('*').eq('client_id', clientId)
  const { data, error } = await applyMatchable(base).order('created_at', { ascending: false })
  if (error) throw new Error(`matchable listings query failed: ${error.message}`)
  return (data ?? []) as unknown as Listing[]
}

export async function listListings(clientId?: string): Promise<Listing[]> {
  let q = admin().from('listings').select('*').order('created_at', { ascending: false }).limit(100)
  if (clientId) q = q.eq('client_id', clientId)
  const { data, error } = await q
  if (error) throw new Error(`listings query failed: ${error.message}`)
  return (data ?? []) as unknown as Listing[]
}

/** The areas this client's buyers actually talk about — §4.3, from config. */
export async function knownAreas(clientId: string): Promise<string[]> {
  const { data } = await admin().from('client_automations').select('config, automations!inner(key)').eq('client_id', clientId)
  const rows = (data ?? []) as unknown as { config: Record<string, unknown>; automations: { key: string } }[]
  const areas = new Set<string>()
  for (const r of rows) {
    const cfg = r.config ?? {}
    for (const a of ((cfg.areas as string[]) ?? [])) areas.add(String(a))
    const li = (cfg.listing_ingest ?? {}) as { areas?: string[] }
    for (const a of (li.areas ?? [])) areas.add(String(a))
  }
  return [...areas]
}

export type InboundOutcome =
  | { kind: 'created'; listing: Listing; parsed: ParsedListing }
  | { kind: 'updated'; listing: Listing; parsed: ParsedListing }
  | { kind: 'status_changed'; listing: Listing; from: ListingStatus; to: ListingStatus }
  | { kind: 'unmatched_reference'; reference: string; status: ListingStatus }
  | { kind: 'not_understood'; parsed: ParsedListing }

/**
 * One inbound message from an agent.
 *
 * Every outcome is NAMED and returned, including the ones where nothing
 * happened. A message the parser could not read must produce a reply saying so
 * — an agent who sends a listing and hears nothing assumes it landed, and the
 * listing that was never created is invisible until a match does not happen.
 */
export async function ingestListingMessage(input: {
  clientId: string
  from: string
  text: string
}): Promise<InboundOutcome> {
  const areas = await knownAreas(input.clientId)
  const parsed = parseListingMessage(input.text, areas)

  // A status change: "A-1042 vendido".
  if (parsed.statusChange && parsed.reference) {
    const { data: existing } = await admin()
      .from('listings')
      .select('*')
      .eq('client_id', input.clientId)
      .eq('reference', parsed.reference)
      .maybeSingle()

    if (!existing) {
      // Named, not swallowed. A status change for a reference we do not hold
      // means either a typo or a listing that never arrived, and both need the
      // agent to know.
      return { kind: 'unmatched_reference', reference: parsed.reference, status: parsed.statusChange }
    }

    const before = (existing as unknown as Listing).status
    const { data: updated, error } = await admin()
      .from('listings')
      .update({ status: parsed.statusChange, status_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', (existing as { id: string }).id)
      .select('*')
      .single()
    if (error) throw new Error(`status update failed: ${error.message}`)

    // The record of when a listing stopped being matchable, in the
    // append-only table, so "why did this stop matching?" has an answer.
    await admin().from('events').insert({
      client_id: input.clientId,
      type: 'listing.status_changed',
      severity: 'info',
      summary: `${parsed.reference} ${before} → ${parsed.statusChange}`,
      data: { listing_id: (existing as { id: string }).id, reference: parsed.reference, from: before, to: parsed.statusChange, by: input.from, via: 'whatsapp' },
    })

    return { kind: 'status_changed', listing: updated as unknown as Listing, from: before, to: parsed.statusChange }
  }

  // Too little to be a listing. A reference alone is not a property.
  if (!parsed.price && parsed.bedrooms === null && !parsed.area) {
    return { kind: 'not_understood', parsed }
  }

  const row = {
    client_id: input.clientId,
    reference: parsed.reference,
    property_type: parsed.property_type,
    area: parsed.area,
    price: parsed.price,
    bedrooms: parsed.bedrooms,
    size_sqm: parsed.size_sqm,
    features: parsed.features,
    source: 'whatsapp',
    raw_message: input.text,
    created_by: input.from,
    updated_at: new Date().toISOString(),
  }

  // An agent re-sending a corrected listing under the same reference updates
  // it. Non-partial unique index on (client_id, reference), so PostgREST's
  // ON CONFLICT works — the 42P10 defect from 0003/0004.
  if (parsed.reference) {
    const { data: prior } = await admin()
      .from('listings').select('id').eq('client_id', input.clientId).eq('reference', parsed.reference).maybeSingle()
    const { data, error } = await admin()
      .from('listings')
      .upsert(row, { onConflict: 'client_id,reference' })
      .select('*')
      .single()
    if (error) throw new Error(`listing upsert failed: ${error.message}`)
    return { kind: prior ? 'updated' : 'created', listing: data as unknown as Listing, parsed }
  }

  const { data, error } = await admin().from('listings').insert(row).select('*').single()
  if (error) throw new Error(`listing insert failed: ${error.message}`)
  return { kind: 'created', listing: data as unknown as Listing, parsed }
}

/**
 * What the agent is told back.
 *
 * Written here rather than by a model, for the same reason the handoff note is
 * a fixed string: this is the confirmation an agent relies on to know their
 * listing landed, and it must state exactly what was stored — including what
 * was NOT understood. A generated summary could round "€1.95M" into "around
 * two million" and the agent would never know the stored figure was different.
 */
export function replyFor(outcome: InboundOutcome): string {
  switch (outcome.kind) {
    case 'created':
    case 'updated': {
      const l = outcome.listing
      const bits = [
        l.reference ? `Ref ${l.reference}` : null,
        l.bedrooms !== null ? `T${l.bedrooms}` : null,
        l.property_type,
        l.area,
        l.price ? `€${l.price.toLocaleString('en-GB')}` : null,
        l.size_sqm ? `${l.size_sqm}m²` : null,
      ].filter(Boolean)
      const head = outcome.kind === 'created' ? 'Listing saved' : 'Listing updated'
      const missing = outcome.parsed.missing.filter((m) => m !== 'features')
      const tail = missing.length ? `\n\nNot read from your message: ${missing.join(', ')}. Send it again with those, or fix it in the cockpit.` : ''
      const match = isMatchable(l.status) ? '' : `\n\nIt is ${STATUS_LABEL[l.status].toLowerCase()}, so it will not be matched to any lead.`
      return `${head}: ${bits.join(' · ')}${match}${tail}`
    }
    case 'status_changed':
      return `${outcome.listing.reference}: ${STATUS_LABEL[outcome.from]} → ${STATUS_LABEL[outcome.to]}.${
        isMatchable(outcome.to) ? ' It will be matched to leads again.' : ' It will no longer be matched to any lead.'
      }`
    case 'unmatched_reference':
      return `I do not have a listing with reference ${outcome.reference}, so nothing was changed. Send the listing first, or check the reference.`
    case 'not_understood':
      return 'I could not read a listing in that. Send at least an area and either a price or a number of bedrooms — for example: "Ref A-1042, T4 Cascais, 1.950.000€".'
  }
}
