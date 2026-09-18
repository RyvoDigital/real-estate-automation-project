'use server'

import { revalidatePath } from 'next/cache'
import { admin } from '@/lib/supabase/admin'
import { requireOperator } from '@/lib/auth'
import { planPick } from './triage'

/**
 * The agent picks somebody for this listing.
 *
 * TWO WRITES, AND THEY ARE DIFFERENT KINDS OF RECORD (see triage.ts).
 *
 * The MATCH is always written: origin 'agent', carrying who chose and their
 * sentence. 0025 refuses an agent row that claims a score or `filter_would_find`
 * — a person's pick and a computed match are different claims and the database
 * will not let them blur.
 *
 * REQUIREMENTS are written only when the sentence gave the engine something to
 * match on. 0026 refuses an agent requirement with no words and no author, so
 * both travel with it: the sentence is the evidence and the person is the
 * author, for the reason a declaration carries a name — an assertion about
 * somebody else with nobody's name on it is a guess the system made.
 */

/** The areas this client's buyers actually talk about — §4.3, never a gazetteer. */
async function knownAreas(clientId: string): Promise<string[]> {
  const { data } = await admin()
    .from('client_automations')
    .select('config, automations!inner(key)')
    .eq('client_id', clientId)
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

export async function pickForListingAction(formData: FormData): Promise<void> {
  const who = await requireOperator()
  const listingId = String(formData.get('listingId') ?? '')
  const leadId = String(formData.get('leadId') ?? '')
  const declaredBy = String(formData.get('declaredBy') ?? '').trim()
  const reason = String(formData.get('reason') ?? '').trim() || null
  if (!listingId || !leadId) throw new Error('pick: listing and lead are both required')

  /*
   * THE AGENCY DECIDES; WE RECORD. Two people, two names.
   *
   * `chosen_by` is the person at the agency who said this listing suits this
   * contact. It is not the operator driving the screen — collapsing them would
   * put our name on their judgement, which is backwards for the same reason it
   * is on the segmentation screen: the knowledge is theirs and the
   * responsibility follows the knowledge.
   */
  if (!declaredBy) throw new Error('pick: whose judgement this is must be recorded')

  const db = admin()
  const { data: listing } = await db
    .from('listings')
    .select('client_id, status, status_changed_at')
    .eq('id', listingId)
    .maybeSingle()
  if (!listing) throw new Error(`pick: no listing ${listingId}`)

  const clientId = listing.client_id as string

  const { error: mErr } = await db.from('listing_matches').insert({
    client_id: clientId,
    listing_id: listingId,
    lead_id: leadId,
    origin: 'agent',
    chosen_by: declaredBy,
    chosen_at: new Date().toISOString(),
    chosen_reason: reason,
    listing_status_at_match: listing.status,
    listing_status_changed_at_at_match: listing.status_changed_at,
    // score, strength and filter_would_find are LEFT UNSET. Nobody computed
    // them, and 0025 refuses the row if they are present.
  })
  if (mErr) throw new Error(`pick: could not record the choice: ${mErr.message}`)

  const plan = planPick({ reason, knownAreas: await knownAreas(clientId) })
  if (plan.requirements.length > 0) {
    const { error } = await db.from('lead_requirements').insert(
      plan.requirements.map((r) => ({
        client_id: clientId,
        lead_id: leadId,
        kind: r.kind,
        value: r.value,
        strength: r.strength,
        source: 'agent',
        evidence: reason,
        why: r.why,
        stated_at: null,
        unordered: 'an agent said this, and nothing says where it sits against what the lead said',
        authored_by: declaredBy,
        superseded_by: r.supersededBy ?? null,
      })),
    )
    // LOUD. A requirement that failed to write leaves the match recorded and
    // the learning silently lost, which is the shape where the next listing is
    // no better than this one and nobody knows why.
    if (error) throw new Error(`pick: the choice was recorded but its reasons were not: ${error.message}`)
  }

  // The operator is recorded too, distinctly from the agency person, so the
  // row says who drove the screen as well as whose judgement it was.
  await db.from('events').insert({
    client_id: clientId,
    type: 'listing.chosen_by_agent',
    severity: 'info',
    summary: `${declaredBy} chose a contact for this listing`,
    data: { listing_id: listingId, lead_id: leadId, chosen_by: declaredBy, recorded_by: who.email,
            requirements_learned: plan.requirements.length },
  })

  revalidatePath(`/listings/${listingId}/triage`)
  revalidatePath(`/listings/${listingId}`)
}
