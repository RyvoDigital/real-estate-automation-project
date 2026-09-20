import 'server-only'
import { admin } from '../supabase/admin'
import type { PolicyRow, Requirement } from './requirements'

/**
 * Reading `advertising_policy`.
 *
 * 🔴 THERE WAS NO READER FOR THIS TABLE. The gate receives rows from its
 * caller and `resolveRequirements` is pure, so nothing in the cockpit had ever
 * read the table directly — which is why the screen that shows it had to start
 * here.
 *
 * ⚠️ NAME COLLISION, STATED SO NOBODY IMPORTS THE WRONG ONE. There are two
 * types called `PolicyRow` in this codebase, about two different tables
 * answering two different questions:
 *
 *   publication/requirements.ts  `advertising_policy` — what an ADVERTISEMENT
 *                                must carry. This file.
 *   jurisdiction-policy.ts       `jurisdiction_policy` — whom we may WRITE TO.
 *
 * They are not interchangeable and a wrong import would typecheck in neither
 * direction, which is the one mercy.
 */

/** Every analysed jurisdiction. The table is global, not per client. */
export async function allAdvertisingPolicy(): Promise<PolicyRow[]> {
  const { data, error } = await admin()
    .from('advertising_policy')
    .select(
      'country, region, requires, regions_exhaustive, region_required, statute, authority, traps, confirmed_at, confirmed_by, confirmed_note, researched_at, source_note',
    )
    .order('country')
  if (error) throw new Error(`advertising policy read failed: ${error.message}`)
  return (data ?? []).map((r) => ({
    country: r.country as string,
    region: (r.region as string) ?? null,
    requires: (r.requires ?? []) as Requirement[],
    regions_exhaustive: Boolean(r.regions_exhaustive),
    region_required: Boolean(r.region_required),
    confirmed_at: (r.confirmed_at as string) ?? null,
    confirmed_by: (r.confirmed_by as string) ?? null,
  }))
}

/** The columns the screen shows that the gate has no use for. */
export type PolicyContext = {
  country: string
  region: string | null
  statute: string | null
  authority: string | null
  traps: string | null
  confirmed_note: string | null
  researched_at: string | null
  source_note: string | null
}

export async function policyContext(): Promise<PolicyContext[]> {
  const { data, error } = await admin()
    .from('advertising_policy')
    .select('country, region, statute, authority, traps, confirmed_note, researched_at, source_note')
    .order('country')
  if (error) throw new Error(`advertising policy context read failed: ${error.message}`)
  return (data ?? []).map((r) => ({
    country: r.country as string,
    region: (r.region as string) ?? null,
    statute: (r.statute as string) ?? null,
    authority: (r.authority as string) ?? null,
    traps: (r.traps as string) ?? null,
    confirmed_note: (r.confirmed_note as string) ?? null,
    researched_at: (r.researched_at as string) ?? null,
    source_note: (r.source_note as string) ?? null,
  }))
}
