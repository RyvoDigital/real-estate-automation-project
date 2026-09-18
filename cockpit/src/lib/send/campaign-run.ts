import 'server-only'

import { admin } from '@/lib/supabase/admin'
import type { CampaignPlan } from '@/lib/send/campaign-plan'
import { SendPermit } from '@/lib/send/permit'
import { dispatch, type ProviderAdapter } from '@/lib/send/dispatch'
import { sendStore } from '@/lib/send/send-store'
import { twilioAdapter } from '@/lib/send/twilio-adapter'
import type { RunnerPorts, RunnerContact } from '@/lib/send/runner'
import type { ConsentFacts, GateVerdict } from '@/lib/gate'
import type { PolicyRow } from '@/lib/jurisdiction-policy'
import { resolveJurisdiction } from '@/lib/jurisdiction'

/**
 * The write half: recording a plan, and assembling the ports phase 2 walks.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ASSERT AT STARTUP THAT EVERY IDENTIFIER A CHECK DEPENDS ON IS PRESENT.  │
 * │                                                                         │
 * │ Not as a fact about the Sender SID — as the habit. A check that cannot  │
 * │ reach its subject reports exactly what a clean check reports            │
 * │ (engineering-lessons §5g), and the code consuming the missing value is  │
 * │ correct, so nothing about reading it reveals the absence.               │
 * │                                                                         │
 * │ Three instances in one week: a query missing an address prefix          │
 * │ returned "0 messages, all accounted for"; a matcher with an empty       │
 * │ vocabulary returned "0 orphans"; a halt reading an identifier no column │
 * │ held would have returned "quality unreadable" and stopped the first     │
 * │ campaign for a reason that named the wrong system.                      │
 * │                                                                         │
 * │ So `assertRunnable` refuses to assemble rather than letting a check run │
 * │ blind. THE NEXT DEPENDENCY ON AN IDENTIFIER ADDS ITS ASSERTION HERE,    │
 * │ before the code that consumes it is written.                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

export type Runnable = {
  clientId: string
  clientNumber: string
  senderSid: string
  automation: string
}

export type RunnableRefusal = { ok: false; missing: string[]; detail: string }

/**
 * Every identifier phase 2 will reach for, checked before anything is assembled.
 *
 * It does NOT check whether a campaign would send to anybody — that is the
 * forecast's job and a zero there is a legitimate answer. This checks only that
 * each moving part can reach the thing it reads.
 */
export async function assertRunnable(
  clientId: string,
  automation: string,
  adapter: ProviderAdapter = twilioAdapter(),
): Promise<{ ok: true; runnable: Runnable } | RunnableRefusal> {
  const { data: client, error } = await admin()
    .from('clients')
    .select('whatsapp_number, whatsapp_sender_sid')
    .eq('id', clientId)
    .maybeSingle()
  if (error) throw new Error(`assertRunnable: ${error.message}`)

  const missing: string[] = []
  if (!client) missing.push('the client row itself')
  if (!client?.whatsapp_number) missing.push('clients.whatsapp_number — nothing could be sent from anywhere')
  if (!client?.whatsapp_sender_sid) {
    missing.push(
      'clients.whatsapp_sender_sid — the quality halt reads /v2/Channels/Senders/{Sid}, and without ' +
      'it the halt would report "quality unreadable" and stop the campaign for a reason that names ' +
      'the wrong system (§5g)',
    )
  }
  // Asked of the adapter rather than read from the environment: the only file
  // that names the sending credential is the one that holds it.
  if (!adapter.isConfigured()) {
    missing.push('the sending credential is not configured in this environment')
  }

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      detail:
        `Cannot assemble a campaign for ${clientId}: ${missing.length} identifier(s) absent. ` +
        'Refusing to assemble rather than letting a check run blind, because a check that cannot ' +
        'reach its subject reports exactly what a clean one does.',
    }
  }

  return {
    ok: true,
    runnable: {
      clientId,
      clientNumber: client!.whatsapp_number as string,
      senderSid: client!.whatsapp_sender_sid as string,
      automation,
    },
  }
}

// ---------------------------------------------------------------------------
// Recording the plan
// ---------------------------------------------------------------------------

export type RecordedPlan = {
  runId: string
  refusalsWritten: number
  exclusionsWritten: number
  forecastPermitted: number
}

/**
 * The shape on disk BEFORE the first message.
 *
 * Written in three steps on purpose: the run row first with the target count,
 * then the refusals, then the counts and the permitted list. A crash between
 * them leaves a row at `evaluating` — visibly incomplete, which is the right
 * failure. A run that recorded its refusals as it went and died at contact 140
 * leaves no answer to how many there were.
 */
export async function recordPlan(input: {
  clientId: string
  automation: string
  plan: CampaignPlan
  campaignId?: string | null
}): Promise<RecordedPlan> {
  const db = admin()
  const e = input.plan.evaluation
  const now = new Date().toISOString()

  const { data: run, error: runErr } = await db
    .from('campaign_runs')
    .insert({
      client_id: input.clientId,
      automation: input.automation,
      campaign_id: input.campaignId ?? null,
      status: 'evaluating',
      target_count: e.targetCount,
    })
    .select('id')
    .single()
  if (runErr) throw new Error(`recordPlan: run row refused: ${runErr.message}`)
  const runId = run!.id as string

  // Refusals, in one insert. A contact already carrying a terminal refusal from
  // an earlier run is NOT written again — it was recorded once, which is the
  // whole point of the terminal/provisional split.
  const rows = [
    ...e.refused.map(({ contact, verdict }) => ({ contact, verdict, kind: 'refused' as const })),
    ...e.excluded
      .filter(({ verdict }) => verdict.reason !== 'objected' || true)
      .filter(({ verdict }) => (verdict as { reason: string }).reason !== 'already_terminal')
      .map(({ contact, verdict }) => ({ contact, verdict, kind: 'excluded' as const })),
  ].map(({ contact, verdict }) => ({
    client_id: input.clientId,
    lead_id: contact.leadId ?? null,
    phone_e164: contact.phone,
    automation: input.automation,
    campaign_id: input.campaignId ?? null,
    // The RUN, which is what phase 2's interruption cursor reads. Distinct from
    // campaign_id: a halted campaign is re-evaluated into a new run, and a
    // second run must not read the first's rows as its own (0022).
    campaign_run_id: runId,
    // Deterministic, so re-evaluating the same run cannot duplicate a refusal.
    idempotency_key: `ref:${runId}:${contact.phone}`,
    status: 'refused',
    gate_verdict: 'refused',
    gate_layer: verdict.layer,
    gate_reason: verdict.reason,
    gate_detail: verdict.detail,
    gate_decided_at: now,
  }))

  let written = 0
  for (let i = 0; i < rows.length; i += 200) {
    const slice = rows.slice(i, i + 200)
    const { error } = await db.from('sends').insert(slice)
    if (error) throw new Error(`recordPlan: refusal rows refused: ${error.message}`)
    written += slice.length
  }

  const { error: updErr } = await db
    .from('campaign_runs')
    .update({
      status: 'evaluated',
      excluded_count: e.excludedCount,
      excluded_breakdown: e.excludedBreakdown,
      forecast_permitted: e.forecastPermitted,
      forecast_refused: e.forecastRefused,
      refusal_breakdown: e.refusalBreakdown,
      permitted_contacts: input.plan.walk,
      evaluated_at: now,
    })
    .eq('id', runId)
  if (updErr) throw new Error(`recordPlan: could not complete the run row: ${updErr.message}`)

  return {
    runId,
    refusalsWritten: written,
    exclusionsWritten: e.excludedCount,
    forecastPermitted: e.forecastPermitted,
  }
}

// ---------------------------------------------------------------------------
// The ports
// ---------------------------------------------------------------------------

export function buildRunnerPorts(input: {
  runnable: Runnable
  runId: string
  templateApprovalId: string
  templateName: string
  templateLanguage: string
  /** Rendered per contact by the caller, which holds the template. */
  render: (contact: RunnerContact) => { body: string; variables: Record<string, string> }
  adapter?: ProviderAdapter
}): RunnerPorts {
  const db = admin()
  const { runnable } = input
  const adapter = input.adapter ?? twilioAdapter()

  return {
    async consentFor(phone) {
      const { data } = await db
        .from('consent_by_contact')
        .select('state, segment, occurred_at, event_id')
        .eq('client_id', runnable.clientId).eq('phone_e164', phone).maybeSingle()
      return (data as ConsentFacts) ?? null
    },

    async policyFor(phone) {
      const j = resolveJurisdiction(phone)
      if (!j.ok) return null
      const { data } = await db.from('jurisdiction_policy').select('*').eq('country', j.country).maybeSingle()
      return (data as PolicyRow | null) ?? null
    },

    async history(phone) {
      const { data } = await db
        .from('sends').select('sent_at')
        .eq('client_id', runnable.clientId).eq('phone_e164', phone)
        .not('sent_at', 'is', null)
      return { sentAt: (data ?? []).map((r) => r.sent_at as string) }
    },

    async sentToday() {
      const since = new Date(); since.setUTCHours(0, 0, 0, 0)
      const { count } = await db
        .from('sends').select('id', { count: 'exact', head: true })
        .eq('client_id', runnable.clientId).gte('sent_at', since.toISOString())
      return count ?? 0
    },

    async alreadyHandled(phone) {
      // ANY row from this run, in any status. A row at `intended` may already
      // have been accepted by a provider with no idempotency, so re-dispatching
      // is how one person receives two messages.
      const { count } = await db
        .from('sends').select('id', { count: 'exact', head: true })
        .eq('campaign_run_id', input.runId).eq('phone_e164', phone)
      return (count ?? 0) > 0
    },

    async qualityRating() {
      const { qualityRating } = await import('@/lib/send/provider-reader')
      return qualityRating(runnable.senderSid)
    },

    async recordRefusal(r) {
      const { error } = await db.from('sends').insert({
        client_id: runnable.clientId,
        lead_id: r.leadId ?? null,
        phone_e164: r.phone,
        automation: runnable.automation,
        campaign_run_id: input.runId,
        idempotency_key: `ref:${input.runId}:${r.phone}`,
        status: 'refused',
        gate_verdict: 'refused',
        gate_layer: r.layer,
        gate_reason: r.reason,
        gate_detail: r.detail,
        gate_decided_at: new Date().toISOString(),
      })
      if (error) throw new Error(`recordRefusal: ${error.message}`)
    },

    async send({ contact, verdict }) {
      const rendered = input.render(contact)
      const permit = await SendPermit.record(verdict as Extract<GateVerdict, { permitted: true }>, {
        clientId: runnable.clientId,
        leadId: contact.leadId,
        to: contact.phone,
        from: runnable.clientNumber,
        automation: runnable.automation,
        campaignRunId: input.runId,
        templateName: input.templateName,
        templateLanguage: input.templateLanguage,
        templateApprovalId: input.templateApprovalId,
        variables: rendered.variables,
        body: rendered.body,
      })
      const out = await dispatch(permit, { provider: adapter, store: sendStore })
      return out.kind === 'sent' ? { kind: 'sent' }
        : out.kind === 'failed' ? { kind: 'failed' }
        : out.kind === 'rate_limited' ? { kind: 'rate_limited' }
        : { kind: 'ambiguous' }
    },

    async halt(reason) {
      const { error } = await db
        .from('campaign_runs')
        .update({ status: 'halted', halted_reason: reason, finished_at: new Date().toISOString() })
        .eq('id', input.runId)
      if (error) throw new Error(`halt: ${error.message}`)
    },
  }
}
