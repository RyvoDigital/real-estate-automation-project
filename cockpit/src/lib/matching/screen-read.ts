import 'server-only'

import { admin } from '@/lib/supabase/admin'
import { missingThresholds, type Thresholds } from './score'
import { explainSaved } from './thresholds'

/**
 * What the three screens read. Reads only — nothing here writes.
 *
 * Separate from run-store.ts deliberately: a SCREEN must never trigger a
 * matching run as a side effect of being opened. An operator refreshing a page
 * would otherwise rewrite match rows, and on a notified listing that is an
 * attempt to change a record somebody has already acted on. The run happens
 * when a listing arrives; the screen shows what it found.
 */

export type ListingRow = {
  id: string
  reference: string | null
  area: string | null
  price: number | null
  bedrooms: number | null
  status: string
  createdAt: string | null
  matchCount: number
}

export async function readListings(clientId: string): Promise<ListingRow[]> {
  const db = admin()
  const { data, error } = await db
    .from('listings')
    .select('id, reference, area, price, bedrooms, status, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(`listings read failed: ${error.message}`)

  const ids = (data ?? []).map((l) => l.id as string)
  const counts = new Map<string, number>()
  if (ids.length) {
    const { data: m } = await db
      .from('listing_matches')
      .select('listing_id')
      .in('listing_id', ids)
      .is('superseded_at', null)
    for (const r of m ?? []) {
      counts.set(r.listing_id as string, (counts.get(r.listing_id as string) ?? 0) + 1)
    }
  }

  return (data ?? []).map((l) => ({
    id: l.id as string,
    reference: (l.reference as string) ?? null,
    area: (l.area as string) ?? null,
    price: (l.price as number) ?? null,
    bedrooms: (l.bedrooms as number) ?? null,
    status: l.status as string,
    createdAt: (l.created_at as string) ?? null,
    matchCount: counts.get(l.id as string) ?? 0,
  }))
}

export type MatchRow = {
  leadId: string
  name: string | null
  origin: 'computed' | 'agent'
  strength: string | null
  filterWouldFind: boolean | null
  reasons: string[]
  chosenBy: string | null
  chosenReason: string | null
  monthsSinceContact: number | null
}

export type MatchesScreen = {
  listing: { id: string; reference: string | null; area: string | null; price: number | null; status: string } | null
  clientId: string | null
  /** Absent thresholds, named. The screen turns this into a sentence. */
  missingThresholds: string[]
  matches: MatchRow[]
}

function monthsSince(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24 * 30.44)))
}

export async function readMatches(listingId: string): Promise<MatchesScreen> {
  const db = admin()
  const { data: listing } = await db
    .from('listings')
    .select('id, client_id, reference, area, price, status')
    .eq('id', listingId)
    .maybeSingle()
  if (!listing) return { listing: null, clientId: null, missingThresholds: [], matches: [] }

  const clientId = listing.client_id as string
  const { data: rows } = await db
    .from('listing_matches')
    .select('lead_id, origin, strength, filter_would_find, reasoning, chosen_by, chosen_reason, score')
    .eq('listing_id', listingId)
    .is('superseded_at', null)
    .order('score', { ascending: false, nullsFirst: false })

  const leadIds = (rows ?? []).map((r) => r.lead_id as string)
  const { data: leads } = leadIds.length
    ? await db.from('leads').select('id, full_name, last_contact_at').in('id', leadIds)
    : { data: [] as { id: string; full_name: string | null; last_contact_at: string | null }[] }
  const byId = new Map((leads ?? []).map((l) => [l.id as string, l]))

  const { data: cas } = await db
    .from('client_automations')
    .select('config, automations!inner(key)')
    .eq('client_id', clientId)
  const caRows = (cas ?? []) as unknown as { config: Record<string, unknown>; automations: { key: string } }[]
  const cfg = caRows.find((r) => r.automations?.key === 'lead_nurture')?.config ?? {}

  return {
    listing: {
      id: listing.id as string,
      reference: (listing.reference as string) ?? null,
      area: (listing.area as string) ?? null,
      price: (listing.price as number) ?? null,
      status: listing.status as string,
    },
    clientId,
    missingThresholds: missingThresholds(cfg),
    matches: (rows ?? []).map((r) => {
      const l = byId.get(r.lead_id as string)
      const reasoning = (r.reasoning ?? {}) as { reasons?: string[] }
      return {
        leadId: r.lead_id as string,
        name: l?.full_name ?? null,
        origin: r.origin as 'computed' | 'agent',
        strength: (r.strength as string) ?? null,
        filterWouldFind: (r.filter_would_find as boolean) ?? null,
        reasons: reasoning.reasons ?? [],
        chosenBy: (r.chosen_by as string) ?? null,
        chosenReason: (r.chosen_reason as string) ?? null,
        monthsSinceContact: monthsSince(l?.last_contact_at ?? null),
      }
    }),
  }
}

export type SavedCalibration =
  | { saved: false; missing: string[] }
  | { saved: true; thresholds: Thresholds; explained: ReturnType<typeof explainSaved> }

export async function readCalibration(clientId: string): Promise<SavedCalibration> {
  const { data } = await admin()
    .from('client_automations')
    .select('config, automations!inner(key)')
    .eq('client_id', clientId)
  const rows = (data ?? []) as unknown as { config: Record<string, unknown>; automations: { key: string } }[]
  const cfg = rows.find((r) => r.automations?.key === 'lead_nurture')?.config ?? {}
  const missing = missingThresholds(cfg)
  if (missing.length > 0) return { saved: false, missing }
  const t = cfg as unknown as Thresholds
  return { saved: true, thresholds: t, explained: explainSaved(t) }
}
