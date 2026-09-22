import 'server-only'
import { admin } from '@/lib/supabase/admin'
import { alreadyRated, listingFacts } from './facts-store'

/**
 * What the exemption screen reads (listing screens checkpoint 2, 22 Sep 2026).
 *
 * 🔴 A FAILED READ IS A FAILURE. The page this replaces took `{ data }` only: a
 * failed listing read was a 404, and a failed policy read silently resolved no
 * requirement, so the form simply was not there. Each failure is now named and
 * the form is withheld only because of what it says.
 */
export type ExemptionScreen = {
  listing: { id: string; reference: string | null; area: string | null } | null
  /** the one exemptible requirement the policy names; null when none or more than one */
  requirementId: string | null
  /** more than one exemptible requirement: a choice is needed, never a silent first */
  ambiguous: boolean
  rated: boolean
  /** the exemption in force, if any */
  current: { declaredBy: string; basis: string; at: string } | null
  failures: { listing?: string; policy?: string; facts?: string }
}

export async function readExemptionScreen(listingId: string): Promise<ExemptionScreen> {
  const db = admin()
  const failures: ExemptionScreen['failures'] = {}
  const empty = { requirementId: null, ambiguous: false, rated: false, current: null }

  const { data: listing, error: lErr } = await db.from('listings').select('id, reference, area').eq('id', listingId).maybeSingle()
  if (lErr) failures.listing = lErr.message
  if (!listing) return { listing: null, ...empty, failures }

  // WHICH requirement: from the policy row, never known by id here (see the gate).
  const { data: policy, error: pErr } = await db.from('advertising_policy').select('requires')
    .eq('country', 'PT').is('region', null).maybeSingle()
  if (pErr) failures.policy = pErr.message
  const exemptible = ((policy?.requires ?? []) as { id: string; exemptible?: boolean }[]).filter((r) => r.exemptible)
  const requirementId = exemptible.length === 1 ? exemptible[0].id : null

  let rated = false
  let current: ExemptionScreen['current'] = null
  if (requirementId) {
    try {
      const facts = await listingFacts(listingId)
      rated = alreadyRated(facts, requirementId)
      const ex = facts.find((f) => f.requirementId === requirementId)?.exemption as { declared_by?: string; basis?: string; at?: string } | null | undefined
      current = ex?.declared_by ? { declaredBy: ex.declared_by, basis: ex.basis ?? '', at: String(ex.at ?? '') } : null
    } catch (e) {
      failures.facts = e instanceof Error ? e.message : String(e)
    }
  }
  return {
    listing: { id: listing.id as string, reference: (listing.reference as string) ?? null, area: (listing.area as string) ?? null },
    requirementId, ambiguous: exemptible.length > 1, rated, current, failures,
  }
}
