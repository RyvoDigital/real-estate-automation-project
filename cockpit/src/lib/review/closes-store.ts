import 'server-only'

import { admin } from '@/lib/supabase/admin'
import { partyRecord, type CloseReport, type PartyDeclaration } from './close-intake'

/**
 * Writing a close, and writing who to ask.
 *
 * ⚠️ NOTHING HERE SENDS. It records what the agency told us and stops.
 */

export async function recordClose(r: CloseReport): Promise<{ id: string }> {
  const { data, error } = await admin()
    .from('closes')
    .insert({
      client_id: r.clientId,
      listing_id: r.listingId,
      closed_on: r.closedOn,
      reported_by: r.reportedBy,
      source: r.source,
      raw_message: r.rawMessage,
    })
    .select('id')
    .single()

  // The same sale reported twice is the agent sending "A-1042 vendido" again,
  // which is ordinary and must not look like a failure. `closes_client_listing_day`
  // refuses it; we read the existing row back instead.
  if (error?.code === '23505') {
    const { data: existing, error: rErr } = await admin()
      .from('closes').select('id')
      .eq('client_id', r.clientId).eq('listing_id', r.listingId).eq('closed_on', r.closedOn)
      .single()
    if (rErr) throw new Error(`close re-read failed: ${rErr.message}`)
    return { id: existing.id as string }
  }
  if (error) throw new Error(`close write failed: ${error.message}`)
  return { id: data.id as string }
}

/** We asked the agency who. Their silence from here is theirs, and recorded. */
export async function markAgentAsked(closeId: string, now: Date = new Date()): Promise<void> {
  const { error } = await admin()
    .from('closes')
    .update({ agent_asked_who_at: now.toISOString(), updated_at: now.toISOString() })
    .eq('id', closeId)
    .is('agent_asked_who_at', null)   // the FIRST asking is the one that counts
  if (error) throw new Error(`close ask-marker failed: ${error.message}`)
}

/**
 * Record which party to ask — which is also a segment A declaration.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ 🔴 THE ORDER OF THE TWO WRITES IS CHOSEN FOR ITS FAILURE MODE.          │
 * │                                                                         │
 * │ This is two writes and there is no transaction across PostgREST calls,  │
 * │ so one of them can land alone. Which one lands alone is therefore a     │
 * │ decision, not an accident:                                              │
 * │                                                                         │
 * │   BASIS FIRST, then the party. If the second fails, there is a          │
 * │   declaration on the ledger and the close still has no party — so       │
 * │   nothing is sent, and a person sees `party_not_named` and re-enters    │
 * │   it. The cost is a duplicate ledger row, which is append-only and      │
 * │   harmless.                                                             │
 * │                                                                         │
 * │   THE OTHER WAY ROUND, a failure leaves a close with a party and NO     │
 * │   RECORDED BASIS — a person the automation believes it may message,     │
 * │   with nothing on the ledger saying why. That is the single worst row   │
 * │   this system can hold.                                                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export async function recordParty(
  d: PartyDeclaration,
  clientId: string,
  now: Date = new Date(),
): Promise<void> {
  const db = admin()
  const rec = partyRecord(d, now)

  // The ledger needs the number in E.164, and a lead without one cannot carry a
  // declaration. Refuse rather than write half of it: the close stays
  // `party_not_named`, which is true and visible, and the operator is told the
  // actual problem instead of finding a party that can never be messaged.
  const { data: lead, error: lErr } = await db
    .from('leads').select('phone').eq('id', d.leadId).eq('client_id', clientId).maybeSingle()
  if (lErr) throw new Error(`party lead read failed: ${lErr.message}`)
  const phone = (lead?.phone as string) ?? ''
  if (!/^\+[1-9][0-9]{6,14}$/.test(phone)) {
    throw new Error(
      'This person has no usable phone number on file, so the declaration cannot be recorded ' +
      'against them. Fix the number first — recording it without one would create a party we ' +
      'could never lawfully message and no ledger entry explaining why.',
    )
  }

  // 1. the basis
  const { error: cErr } = await db.from('consent_events').insert({
    client_id: clientId,
    phone_e164: phone,
    lead_id: d.leadId,
    kind: 'declared',
    segment: 'A',
    source: 'close_report',
    occurred_at: rec.at,
    declared_by: rec.declared_by,
    evidence: { close_id: d.closeId, role: rec.role, recorded_by: rec.recorded_by },
    note: 'Parte numa venda concluída, indicada pela agência.',
  })
  if (cErr) throw new Error(`party declaration failed: ${cErr.message}`)

  // 2. the party
  const { error: pErr } = await db.from('closes').update({
    party_lead_id: rec.lead_id,
    party_role: rec.role,
    party_declared_by: rec.declared_by,
    party_declared_at: rec.at,
    updated_at: rec.at,
  }).eq('id', d.closeId).eq('client_id', clientId)
  if (pErr) throw new Error(`party write failed: ${pErr.message}`)
}
