import 'server-only'

import { admin } from '@/lib/supabase/admin'
import { resolveJurisdiction } from '@/lib/jurisdiction'
import type { ContactRow } from '@/lib/segmentation/groups'
import type { JurisdictionFact } from '@/lib/segmentation/copy'

/**
 * Everything the segmentation screen reads. Read-only: no insert, no update.
 *
 * The declaration is written by declare.ts through a server action, so this
 * file has no route to a write and none to a send.
 */

export type ScreenData = {
  contacts: ContactRow[]
  jurisdictions: JurisdictionFact[]
  /** Declarations already made, newest first, for the history panel. */
  history: Array<{
    phone: string
    segment: string | null
    declaredBy: string | null
    recordedAt: string
    wording: string | null
    group: string | null
    uncertain: boolean
  }>
}

export async function readScreen(clientId: string): Promise<ScreenData> {
  const db = admin()

  const { data: leads, error } = await db
    .from('leads')
    .select('id, phone, full_name, last_contact_at, area, qualification')
    .eq('client_id', clientId)
    .not('phone', 'is', null)
  if (error) throw new Error(`readScreen: leads: ${error.message}`)

  const phones = (leads ?? []).map((l) => l.phone as string)

  const states = new Map<string, string>()
  const claims = new Map<string, string | null>()
  if (phones.length > 0) {
    const { data: consent } = await db
      .from('consent_by_contact').select('phone_e164, state')
      .eq('client_id', clientId).in('phone_e164', phones)
    for (const r of consent ?? []) states.set(r.phone_e164 as string, r.state as string)

    // The exact cell the agency's file held, from the quarantine record. It is
    // shown back to them verbatim, because "your file said sim" is a much
    // better question than "your file claimed consent".
    const { data: events } = await db
      .from('consent_events')
      .select('phone_e164, kind, wording, evidence')
      .eq('client_id', clientId).in('phone_e164', phones)
      .in('kind', ['quarantined', 'claimed'])
    for (const e of events ?? []) {
      const ev = e.evidence as { claimed_consent?: { raw?: string } } | null
      claims.set(e.phone_e164 as string, (e.wording as string) ?? ev?.claimed_consent?.raw ?? 'sim')
    }
  }

  // Batch names, so a group can be called by the file the agency chose.
  const batchIds = [...new Set(
    (leads ?? []).map((l) => (l.qualification as { imported?: { batch_id?: string } })?.imported?.batch_id)
      .filter((b): b is string => !!b),
  )]
  const batches = new Map<string, { filename: string; committedAt: string | null }>()
  if (batchIds.length > 0) {
    const { data: rows } = await db
      .from('import_batches').select('id, filename, committed_at').in('id', batchIds)
    for (const b of rows ?? []) {
      batches.set(b.id as string, {
        filename: b.filename as string,
        committedAt: (b.committed_at as string) ?? null,
      })
    }
  }

  const contacts: ContactRow[] = (leads ?? []).map((l) => {
    const batchId = (l.qualification as { imported?: { batch_id?: string } })?.imported?.batch_id ?? null
    const batch = batchId ? batches.get(batchId) : undefined
    return {
      id: l.id as string,
      phone: l.phone as string,
      fullName: (l.full_name as string) ?? null,
      lastContactAt: (l.last_contact_at as string) ?? null,
      area: (l.area as string) ?? null,
      batchId,
      batchFilename: batch?.filename ?? null,
      batchCommittedAt: batch?.committedAt ?? null,
      state: states.get(l.phone as string) ?? 'undetermined',
      claimRaw: claims.get(l.phone as string) ?? null,
    }
  })

  // The countries these contacts are actually in — so the jurisdiction sentence
  // describes THIS list rather than the world.
  const countries = [...new Set(
    contacts.map((c) => { const j = resolveJurisdiction(c.phone); return j.ok ? (j.country as string) : null })
      .filter((c): c is string => c !== null),
  )]
  const jurisdictions: JurisdictionFact[] = []
  if (countries.length > 0) {
    const { data: policies } = await db
      .from('jurisdiction_policy')
      .select('country, existing_customer, confirmed_at, confirmed_by, platform_blocked')
      .in('country', countries)
    const byCountry = new Map((policies ?? []).map((p) => [p.country as string, p]))
    for (const country of countries) {
      const p = byCountry.get(country)
      jurisdictions.push({
        country,
        existingCustomer: (p?.existing_customer as JurisdictionFact['existingCustomer']) ?? 'unknown',
        confirmed: Boolean(p?.confirmed_at && p?.confirmed_by),
        platformBlocked: Boolean(p?.platform_blocked),
      })
    }
  }

  const { data: declared } = await db
    .from('consent_events')
    .select('phone_e164, segment, declared_by, recorded_at, wording, evidence')
    .eq('client_id', clientId).eq('kind', 'declared')
    .order('recorded_at', { ascending: false })
    .limit(200)

  return {
    contacts,
    jurisdictions,
    history: (declared ?? []).map((d) => {
      const ev = d.evidence as { declared_as_group?: { label?: string }; uncertainty?: boolean } | null
      return {
        phone: d.phone_e164 as string,
        segment: (d.segment as string) ?? null,
        declaredBy: (d.declared_by as string) ?? null,
        recordedAt: d.recorded_at as string,
        wording: (d.wording as string) ?? null,
        group: ev?.declared_as_group?.label ?? null,
        uncertain: ev?.uncertainty === true,
      }
    }),
  }
}
