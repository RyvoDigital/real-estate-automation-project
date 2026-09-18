import 'server-only'

import { admin } from '@/lib/supabase/admin'
import { planMatchRun, type MatchRunPlan } from './run'
import { bindingRequirementsForClient } from './requirements-store'
import type { Listing } from './score'

/**
 * Running the matcher against real rows, and writing what it found.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ A REFUSAL WRITES NOTHING.                                               │
 * │                                                                         │
 * │ If the client has no thresholds, or the listing is not available, this  │
 * │ returns the refusal and touches no table. A run that half-wrote before  │
 * │ noticing it could not decide would leave matches computed from a        │
 * │ partially-configured client, which is worse than no matches because     │
 * │ they would look like results.                                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * The decision is entirely in run.ts, which is pure. This file reads three
 * things, calls it, and applies the outcome.
 */

export type MatchRunOutcome =
  | { ran: false; refusal: Extract<MatchRunPlan, { ran: false }>['refusal'] }
  | { ran: true; written: number; skippedFrozen: number; plan: Extract<MatchRunPlan, { ran: true }> }

/** The matching thresholds live on the lead_nurture automation's config row. */
async function matchingConfig(clientId: string): Promise<unknown> {
  const { data, error } = await admin()
    .from('client_automations')
    .select('config, automations!inner(key)')
    .eq('client_id', clientId)
  if (error) throw new Error(`match run: config read failed: ${error.message}`)
  const rows = (data ?? []) as unknown as { config: Record<string, unknown>; automations: { key: string } }[]
  const row = rows.find((r) => r.automations?.key === 'lead_nurture')
  // An ABSENT config is `{}` and not `null`, so `missingThresholds` names all
  // six keys rather than the caller having to distinguish "no row" from "no
  // values". Both mean the same thing to a run: there is nothing to decide with.
  return row?.config ?? {}
}

export async function runMatchForListing(input: {
  clientId: string
  listingId: string
}): Promise<MatchRunOutcome> {
  const db = admin()

  const { data: listing, error: lErr } = await db
    .from('listings')
    .select('id, reference, area, price, bedrooms, property_type, features, status, status_changed_at')
    .eq('id', input.listingId)
    .maybeSingle()
  if (lErr) throw new Error(`match run: listing read failed: ${lErr.message}`)
  if (!listing) throw new Error(`match run: no listing ${input.listingId}`)

  const config = await matchingConfig(input.clientId)
  const candidates = await bindingRequirementsForClient(input.clientId)

  const shaped: Listing & { statusChangedAt: string | null } = {
    id: listing.id as string,
    reference: (listing.reference as string) ?? null,
    area: (listing.area as string) ?? null,
    price: (listing.price as number) ?? null,
    bedrooms: (listing.bedrooms as number) ?? null,
    property_type: (listing.property_type as string) ?? null,
    features: ((listing.features as string[]) ?? []).map(String),
    status: listing.status as string,
    statusChangedAt: (listing.status_changed_at as string) ?? null,
  }

  const plan = planMatchRun({
    listing: shaped,
    candidates: candidates.map((c) => ({
      leadId: c.leadId,
      requirements: c.requirements,
      budgetFlexible: c.budgetFlexible,
      fields: c.fields,
    })),
    config,
  })

  if (!plan.ran) return { ran: false, refusal: plan.refusal }

  /*
   * A NOTIFIED MATCH IS NEVER OVERWRITTEN.
   *
   * 0025's freeze refuses the update at the database, so this is not the
   * control -- it is the code declining to attempt something the database
   * would reject, and counting it, so a re-run reports "4 written, 2 left
   * frozen" rather than throwing halfway through.
   *
   * The successor path -- insert a new row carrying supersedes_id and stamp
   * superseded_at on the old one -- belongs with F4, because a successor only
   * makes sense once there is a notification for it to succeed. Until then a
   * frozen row is left alone and SAID, never silently skipped.
   */
  const { data: current, error: curErr } = await db
    .from('listing_matches')
    .select('id, lead_id, agent_notified_at')
    .eq('listing_id', input.listingId)
    .is('superseded_at', null)
  if (curErr) throw new Error(`match run: existing matches read failed: ${curErr.message}`)

  const frozen = new Set(
    (current ?? []).filter((r) => r.agent_notified_at).map((r) => r.lead_id as string),
  )
  const existingByLead = new Map(
    (current ?? []).filter((r) => !r.agent_notified_at).map((r) => [r.lead_id as string, r.id as string]),
  )

  let written = 0
  for (const m of plan.matches) {
    if (frozen.has(m.leadId)) continue

    const row = {
      client_id: input.clientId,
      listing_id: input.listingId,
      lead_id: m.leadId,
      origin: 'computed' as const,
      score: m.score,
      strength: m.strength,
      filter_would_find: m.filterWouldFind,
      reasoning: m.reasoning,
      listing_status_at_match: m.listingStatusAtMatch,
      listing_status_changed_at_at_match: m.listingStatusChangedAtAtMatch,
    }

    const id = existingByLead.get(m.leadId)
    // Update by id, insert otherwise. Never an upsert: 0025's index is PARTIAL
    // (one CURRENT row per pair) and PostgREST would emit `ON CONFLICT` with no
    // predicate, which a partial index cannot satisfy -- 42P10, the defect from
    // 0003 and 0004.
    const { error } = id
      ? await db.from('listing_matches').update(row).eq('id', id)
      : await db.from('listing_matches').insert(row)
    if (error) throw new Error(`match run: write failed for lead ${m.leadId}: ${error.message}`)
    written += 1
  }

  return {
    ran: true,
    written,
    skippedFrozen: plan.matches.filter((m) => frozen.has(m.leadId)).length,
    plan,
  }
}
