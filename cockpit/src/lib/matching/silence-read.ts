import 'server-only'

import { admin } from '@/lib/supabase/admin'
import { findSilence, type Silence, type SilenceInput } from './silence'

/**
 * Reading the silence. Reads only; nothing here writes and nothing is sent.
 *
 * ⚠️ NO CONSENT, NO LEDGER, NO SUPPRESSION. This screen tells an agency about
 * its own contacts; whether any of them may be MESSAGED is a question asked at
 * send time, by the gate, and answering it here would build a second quieter
 * gate out of a report. Asserted in silence.test.ts.
 */

export async function readSilence(
  clientId: string,
  opts: { thresholdDays?: number } = {},
): Promise<Silence & { totalLeads: number }> {
  const db = admin()

  const { data: leads, error } = await db
    .from('leads')
    .select('id, full_name, last_contact_at')
    .eq('client_id', clientId)
  if (error) throw new Error(`silence: leads read failed: ${error.message}`)

  const ids = (leads ?? []).map((l) => l.id as string)
  const sources = new Map<string, string[]>()
  const lastMessage = new Map<string, string>()

  if (ids.length) {
    const { data: reqs } = await db
      .from('lead_requirements')
      .select('lead_id, source')
      .eq('client_id', clientId)
      .is('superseded_by', null)
    for (const r of reqs ?? []) {
      const k = r.lead_id as string
      sources.set(k, [...(sources.get(k) ?? []), r.source as string])
    }

    // EITHER DIRECTION. "Nobody has spoken to them" is false if they wrote to
    // us yesterday and nobody replied — that is a different and worse problem,
    // and it is not this screen's claim.
    const { data: msgs } = await db
      .from('messages')
      .select('lead_id, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(2000)
    for (const m of msgs ?? []) {
      const k = m.lead_id as string | null
      if (!k) continue
      if (!lastMessage.has(k)) lastMessage.set(k, m.created_at as string)
    }
  }

  const input: SilenceInput[] = (leads ?? []).map((l) => ({
    leadId: l.id as string,
    name: (l.full_name as string) ?? null,
    lastContactAt: (l.last_contact_at as string) ?? null,
    lastMessageAt: lastMessage.get(l.id as string) ?? null,
    requirementSources: sources.get(l.id as string) ?? [],
  }))

  return { ...findSilence(input, opts), totalLeads: input.length }
}
