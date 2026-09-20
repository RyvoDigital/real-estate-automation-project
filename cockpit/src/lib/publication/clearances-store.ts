import 'server-only'
import { admin } from '../supabase/admin'
import type { SatisfiedRequirement } from './gate'

/**
 * Reading and writing `clearances` — 0039.
 *
 * 🔒 NOTHING HERE DECIDES ANYTHING. The decision is `decidePublication`, and
 * the only caller of `recordClearance` is the decision path in `decide.ts`.
 * A clearance recorded by something other than the thing that decided it is a
 * second source of truth about the same act.
 */

export type StandingClearance = {
  id: string
  listingId: string
  country: string
  region: string | null
  satisfied: SatisfiedRequirement[]
  decidedAt: string
  noticeSentAt: string | null
}

export type RecordOutcome =
  /** Written now. The gate said yes and nothing stood before. */
  | { kind: 'recorded'; decidedAt: string }
  /**
   * A clearance already stands for this property in this jurisdiction, and it
   * is LEFT ALONE.
   *
   * 🔴 This is the whole reason the write is insert-if-absent rather than an
   * upsert. A clearance records what was true WHEN the property was cleared,
   * and the re-check's entire job is to compare that against what is true now.
   * Refreshing `decided_at` on every look would make "then" always equal "now",
   * and recheckClearances would find nothing, forever — a check that cannot
   * fail, built out of an ordinary-looking upsert.
   */
  | { kind: 'already_stood'; decidedAt: string }
  /**
   * The gate decided and the decision could not be kept.
   *
   * 🔴 Rendered, never swallowed. Today this is what a missing `clearances`
   * table looks like — 0039 is written and not yet applied — and a screen that
   * showed a clean verdict while silently failing to record it would be
   * exactly the shape §3.22 is about.
   */
  | { kind: 'not_recorded'; why: string }

/** Every standing clearance for a client. The re-check's input, when it runs. */
export async function standingClearances(clientId: string): Promise<StandingClearance[]> {
  const { data, error } = await admin()
    .from('clearances')
    .select('id, listing_id, country, region, satisfied, decided_at, notice_sent_at')
    .eq('client_id', clientId)
  if (error) throw new Error(`clearances read failed: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    listingId: r.listing_id as string,
    country: r.country as string,
    region: (r.region as string) ?? null,
    satisfied: (r.satisfied ?? []) as SatisfiedRequirement[],
    decidedAt: r.decided_at as string,
    noticeSentAt: (r.notice_sent_at as string) ?? null,
  }))
}

/**
 * Keep a decision. Called only from the decision path.
 *
 * Insert-if-absent, for the reason on `already_stood` above.
 */
export async function recordClearance(input: {
  clientId: string
  listingId: string
  country: string
  region: string | null
  satisfied: SatisfiedRequirement[]
}): Promise<RecordOutcome> {
  if (input.satisfied.length === 0) {
    // 0039 refuses this too, and refusing here as well means the reason is a
    // sentence rather than a constraint name.
    return {
      kind: 'not_recorded',
      why: 'the gate cleared this property against an empty set of requirements, which no analysed jurisdiction produces — the snapshot would have kept no evidence',
    }
  }

  try {
    const { data: existing, error: readErr } = await admin()
      .from('clearances')
      .select('id, decided_at')
      .eq('listing_id', input.listingId)
      .eq('country', input.country)
      .is('region', input.region)
      .maybeSingle()
    if (readErr) throw new Error(readErr.message)

    if (existing) {
      return { kind: 'already_stood', decidedAt: existing.decided_at as string }
    }

    const decidedAt = new Date().toISOString()
    const { error } = await admin().from('clearances').insert({
      client_id: input.clientId,
      listing_id: input.listingId,
      country: input.country,
      region: input.region,
      satisfied: input.satisfied,
      decided_at: decidedAt,
      // 🔴 notice_sent_at is NOT set here. It records that the agency was told,
      // which is a different act by a different person at a different time —
      // and it never means an advertisement came down.
    })
    if (error) throw new Error(error.message)
    return { kind: 'recorded', decidedAt }
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    return {
      kind: 'not_recorded',
      why: /relation .*clearances.* does not exist|could not find the table/i.test(why)
        ? 'the clearances table does not exist yet — 0039 is written and has not been applied, so the gate decided and the decision was not kept'
        : why,
    }
  }
}
