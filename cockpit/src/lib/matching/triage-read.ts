import 'server-only'

import { admin } from '@/lib/supabase/admin'
import { groupForTriage, type TriageContact, type TriageGroup } from './triage'

/**
 * The contacts a listing cannot be ranked against.
 *
 * "Cannot be ranked" means EXACTLY ONE THING: this lead has no hard
 * requirement on record, so `scoreListing` would refuse them — with no hard
 * constraint, "every hard constraint held" is vacuously true and every listing
 * matches (§4.1). It is not a judgement about the person and not a data-quality
 * grade; it is the absence of anything to compare.
 *
 * ⚠️ NO CONSENT, NO LEDGER, NO SUPPRESSION IS READ HERE. See triage.ts for why,
 * and matching-boundary.test.ts for the assertion that keeps it true.
 */

export type TriageScreen = {
  listing: { id: string; reference: string | null; area: string | null; price: number | null; status: string } | null
  clientId: string | null
  groups: TriageGroup[]
  total: number
  chosen: number
  /**
   * 🔴 Reads that FAILED, named (checkpoint 2, 22 Sep 2026). A failed
   * requirements read would have put rankable contacts on the floor; a failed
   * picks read would have shown every contact as not yet chosen. When either
   * fails, the screen says so and offers no picks.
   */
  failures: { listing?: string; requirements?: string; picks?: string }
}

export async function readTriage(listingId: string): Promise<TriageScreen> {
  const db = admin()
  const failures: TriageScreen['failures'] = {}
  const { data: listing, error: lErr } = await db
    .from('listings')
    .select('id, client_id, reference, area, price, status')
    .eq('id', listingId)
    .maybeSingle()
  if (lErr) failures.listing = lErr.message
  if (!listing) return { listing: null, clientId: null, groups: [], total: 0, chosen: 0, failures }

  const clientId = listing.client_id as string

  const { data: leads, error } = await db
    .from('leads')
    .select('id, full_name, last_contact_at, area, qualification')
    .eq('client_id', clientId)
  if (error) throw new Error(`triage: leads read failed: ${error.message}`)

  // Leads that DO have something binding are ranked elsewhere and must not
  // appear here — the two lists are the same rule seen from opposite sides,
  // so a lead in both would be offered twice for the same listing.
  const { data: reqs, error: rErr } = await db
    .from('lead_requirements')
    .select('lead_id')
    .eq('client_id', clientId)
    .eq('strength', 'hard')
    .is('superseded_by', null)
  if (rErr) failures.requirements = rErr.message
  const rankable = new Set((reqs ?? []).map((r) => r.lead_id as string))

  const { data: picked, error: pErr } = await db
    .from('listing_matches')
    .select('lead_id')
    .eq('listing_id', listingId)
    .eq('origin', 'agent')
    .is('superseded_at', null)
  if (pErr) failures.picks = pErr.message
  const chosenIds = new Set((picked ?? []).map((r) => r.lead_id as string))

  const contacts: TriageContact[] = (leads ?? [])
    .filter((l) => !rankable.has(l.id as string))
    .map((l) => {
      const q = (l.qualification as { imported?: { batch_id?: string } } | null) ?? {}
      return {
        leadId: l.id as string,
        name: (l.full_name as string) ?? null,
        lastContactAt: (l.last_contact_at as string) ?? null,
        area: (l.area as string) ?? null,
        batchId: q.imported?.batch_id ?? null,
        batchFilename: null,
        alreadyChosen: chosenIds.has(l.id as string),
      }
    })

  // The batch's own filename, so a group reads "contactos-antigos.xlsx" rather
  // than a uuid — which is the whole reason the batch is the strongest cue.
  const batchIds = [...new Set(contacts.map((c) => c.batchId).filter(Boolean))] as string[]
  if (batchIds.length) {
    const { data: batches } = await db.from('import_batches').select('id, filename').in('id', batchIds)
    const nameOf = new Map((batches ?? []).map((b) => [b.id as string, b.filename as string]))
    for (const c of contacts) if (c.batchId) c.batchFilename = nameOf.get(c.batchId) ?? null
  }

  return {
    listing: {
      id: listing.id as string,
      reference: (listing.reference as string) ?? null,
      area: (listing.area as string) ?? null,
      price: (listing.price as number) ?? null,
      status: listing.status as string,
    },
    clientId,
    groups: groupForTriage(contacts),
    total: contacts.length,
    chosen: contacts.filter((c) => c.alreadyChosen).length,
    failures,
  }
}
