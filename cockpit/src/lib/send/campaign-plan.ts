import 'server-only'

import { admin } from '@/lib/supabase/admin'
import { evaluateCampaign, isTerminalRefusal, type Contact, type Evaluation } from '@/lib/send/evaluate'
import { resolveJurisdiction } from '@/lib/jurisdiction'
import type { ConsentFacts } from '@/lib/gate'
import type { PolicyRow } from '@/lib/jurisdiction-policy'
import { walkOrder, type RunnerContact } from '@/lib/send/runner'

/**
 * Phase 1, assembled: read every fact in bulk, decide purely, return the shape.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THIS FILE IS READ-ONLY BY CONSTRUCTION AND HAS NO ROUTE TO A SEND.      │
 * │                                                                         │
 * │ It imports no adapter, no dispatcher and no permit, so the dry run can  │
 * │ exercise a real campaign against production without anything being able │
 * │ to leave. Writing the plan and running the walk live in campaign-run.ts │
 * │ — a separate file, so "plan it and look" cannot become "plan it and go" │
 * │ by an edit to one line (§12).                                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * TWO QUERIES AND N PURE DECISIONS, which is the dividend of decideGate being
 * pure (§12b): every consent state in one `in (…)`, every distinct country in
 * another, then the whole list decided in memory.
 */

export type PlanDiagnostics = {
  clientId: string
  clientNumber: string | null
  contactsFound: number
  contactsWithPhone: number
  consentRowsFound: number
  countriesSeen: string[]
  policiesFound: string[]
  policiesConfirmed: string[]
  terminalAlready: number
  templatesRecorded: number
  /** Why a zero forecast is a zero, in words an operator can act on. */
  notes: string[]
}

export type CampaignPlan = {
  evaluation: Evaluation
  /** In the order phase 2 will walk them. */
  walk: RunnerContact[]
  diagnostics: PlanDiagnostics
}

export async function planCampaign(clientId: string): Promise<CampaignPlan> {
  const db = admin()
  const notes: string[] = []

  const { data: client } = await db
    .from('clients').select('whatsapp_number').eq('id', clientId).maybeSingle()
  const clientNumber = (client?.whatsapp_number as string | undefined) ?? null
  if (!clientNumber) notes.push('This client has no whatsapp_number, so nothing could be sent from anywhere.')

  // ---- the target list -----------------------------------------------------
  const { data: leads, error: leadErr } = await db
    .from('leads')
    .select('id, phone, last_contact_at')
    .eq('client_id', clientId)
  if (leadErr) throw new Error(`planCampaign: leads read failed: ${leadErr.message}`)

  const withPhone = (leads ?? []).filter((l) => l.phone)
  const contacts: Contact[] = withPhone.map((l) => ({ phone: l.phone as string, leadId: l.id as string }))
  if (contacts.length === 0) {
    notes.push('No leads with a phone number. A campaign needs an imported list before it needs anything else.')
  }

  // ---- one query for consent ----------------------------------------------
  const phones = contacts.map((c) => c.phone)
  const consentByPhone = new Map<string, ConsentFacts>()
  if (phones.length > 0) {
    const { data: consent, error } = await db
      .from('consent_by_contact')
      .select('phone_e164, state, segment, occurred_at, event_id')
      .eq('client_id', clientId)
      .in('phone_e164', phones)
    if (error) throw new Error(`planCampaign: consent read failed: ${error.message}`)
    for (const r of consent ?? []) {
      consentByPhone.set(r.phone_e164 as string, {
        state: r.state as NonNullable<ConsentFacts>['state'],
        segment: (r.segment as NonNullable<ConsentFacts>['segment']) ?? null,
        occurred_at: (r.occurred_at as string) ?? null,
        event_id: (r.event_id as string) ?? null,
      })
    }
  }
  if (contacts.length > 0 && consentByPhone.size === 0) {
    notes.push(
      'Not one contact has a row in the consent ledger. Every one of them will be refused for ' +
      'having no basis — see improvements §3.18: classifying a list is an operator action and ' +
      'cannot be closed from a keyboard.',
    )
  }

  // ---- one query for policy ------------------------------------------------
  const countries: string[] = [...new Set(
    contacts
      .map((c) => { const j = resolveJurisdiction(c.phone); return j.ok ? (j.country as string) : null })
      .filter((c): c is string => c !== null),
  )].sort()

  const policyByCountry = new Map<string, PolicyRow>()
  if (countries.length > 0) {
    const { data: policies, error } = await db
      .from('jurisdiction_policy').select('*').in('country', countries)
    if (error) throw new Error(`planCampaign: policy read failed: ${error.message}`)
    for (const p of policies ?? []) policyByCountry.set(p.country as string, p as PolicyRow)
  }
  const confirmed: string[] = [...policyByCountry.values()]
    .filter((p) => p.confirmed_at && p.confirmed_by)
    .map((p) => p.country)
  const unconfirmed = countries.filter((c) => !confirmed.includes(c))
  if (unconfirmed.length > 0) {
    notes.push(
      `No confirmed policy for ${unconfirmed.join(', ')}. An unconfirmed row permits nothing, so ` +
      'every contact in those countries is refused however good their consent is.',
    )
  }

  // ---- contacts already carrying a terminal refusal ------------------------
  const { data: priorRefusals } = await db
    .from('sends')
    .select('phone_e164, gate_reason')
    .eq('client_id', clientId)
    .eq('status', 'refused')
  const alreadyTerminal = new Set(
    (priorRefusals ?? [])
      .filter((r) => r.gate_reason && isTerminalRefusal(r.gate_reason as string))
      .map((r) => r.phone_e164 as string),
  )

  // ---- context that decides whether a campaign could run at all -------------
  const { count: templates } = await db
    .from('message_templates')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
  if (!templates) {
    notes.push(
      'No approved template is recorded for this client. Outside the 24-hour window WhatsApp ' +
      'carries templates only, and 0020 refuses a sent row that names none.',
    )
  }

  const evaluation = evaluateCampaign({ contacts, consentByPhone, policyByCountry, alreadyTerminal })

  const walk = walkOrder(evaluation.permitted.map(({ contact }) => {
    const lead = withPhone.find((l) => l.phone === contact.phone)
    return {
      phone: contact.phone,
      leadId: contact.leadId,
      lastContactAt: (lead?.last_contact_at as string | undefined) ?? null,
    }
  }))

  return {
    evaluation,
    walk,
    diagnostics: {
      clientId,
      clientNumber,
      contactsFound: (leads ?? []).length,
      contactsWithPhone: contacts.length,
      consentRowsFound: consentByPhone.size,
      countriesSeen: countries,
      policiesFound: [...policyByCountry.keys()].sort(),
      policiesConfirmed: confirmed.sort(),
      terminalAlready: alreadyTerminal.size,
      templatesRecorded: templates ?? 0,
      notes,
    },
  }
}
