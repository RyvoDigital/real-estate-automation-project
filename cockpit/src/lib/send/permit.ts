import 'server-only'

import { admin } from '@/lib/supabase/admin'
import type { GateVerdict } from '@/lib/gate'
import { OBLIGATIONS, type ObligationCode } from '@/lib/obligations'
import { isReservedTestNumber } from '@/lib/reserved-numbers'

/**
 * The permit: the only thing `dispatch()` accepts, and the only way it comes
 * into existence is by inserting the send row.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THE INSERT DOES NOT PRECEDE THE SEND. IT PRODUCES THE ARGUMENT THE     │
 * │ SEND REQUIRES.                                                          │
 * │                                                                         │
 * │ "insert, then call" is a convention, and a path that inserts and then   │
 * │ calls is one edited line away from calling without inserting. Nothing   │
 * │ about a provider call needs the row to exist: a number and a body are   │
 * │ available before it. So the ordering is not merely written correctly —  │
 * │ the wrong order does not typecheck.                                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * The constructor is private, so `new SendPermit(...)` outside this module is a
 * compile error and `SendPermit.record()` is the only factory. A cast can still
 * forge the object, which is why `dispatch()` does not trust it and re-reads
 * the row.
 */
export type SendPlan = {
  clientId: string
  leadId?: string | null
  to: string
  /** The client's WhatsApp number. Supplied, never looked up by the sender. */
  from: string
  variables?: Record<string, string>
  automation: string
  campaignId?: string | null
  campaignRunId?: string | null
  templateName: string
  templateLanguage: string
  /** Required: 0020 refuses a sent row that names no template. */
  templateApprovalId: string
  body: string
}

export class SendPermit {
  private constructor(
    readonly sendId: string,
    readonly idempotencyKey: string,
    readonly to: string,
    readonly from: string,
    readonly contentSid: string,
    readonly variables: Record<string, string>,
    readonly body: string,
    readonly templateName: string,
  ) {}

  /**
   * Insert the intent row, then mint the permit for it.
   *
   * Takes a verdict that is already `permitted`: the type makes a refused
   * verdict unpassable, so a refusal cannot accidentally become a send.
   */
  static async record(
    gate: Extract<GateVerdict, { permitted: true }>,
    plan: SendPlan,
  ): Promise<SendPermit> {
    // Belt on top of the gate's first layer and the database's constraint.
    // Three refusals of the same thing, because the fixtures of an append-only
    // ledger must never be messageable.
    if (isReservedTestNumber(plan.to)) {
      throw new Error(`SendPermit.record: ${plan.to} is a reserved test number and is never sendable`)
    }

    // Generated HERE, before the send, because Twilio has no idempotency of its
    // own: checked 17 Sep 2026 — the Idempotency-Key header covers
    // configuration operations, not the Messages resource. So this key is OUR
    // handle on the attempt. It makes a duplicate intent row impossible and
    // gives reconciliation a stable name for what it is chasing. It does NOT
    // make the provider call idempotent and nothing may assume it does.
    const idempotencyKey = `snd:${crypto.randomUUID()}`

    const { data, error } = await admin()
      .from('sends')
      .insert({
        client_id: plan.clientId,
        lead_id: plan.leadId ?? null,
        phone_e164: plan.to,
        automation: plan.automation,
        campaign_id: plan.campaignId ?? null,
        campaign_run_id: plan.campaignRunId ?? null,
        idempotency_key: idempotencyKey,
        status: 'intended',

        gate_verdict: 'permitted',
        gate_basis: gate.basis,
        gate_obligations: gate.obligations,
        gate_decided_at: new Date().toISOString(),
        country: gate.evidence.country,
        segment: gate.evidence.segment,
        consent_event_id: gate.evidence.consentEventId,
        consent_occurred_at: gate.evidence.consentOccurredAt,
        policy_country: gate.evidence.country,
        policy_confirmed_at: gate.evidence.policyConfirmedAt,
        policy_confirmed_by: gate.evidence.policyConfirmedBy,
        policy_statute: obligationSources(gate.obligations),

        template_name: plan.templateName,
        template_language: plan.templateLanguage,
        template_approval_id: plan.templateApprovalId,
        body_intended: plan.body,
      })
      .select('id, idempotency_key')
      .single()

    if (error) {
      // 0015's constraints refuse a row that is not properly authorised, so a
      // failure here is the database declining to record a send — which means
      // no send may happen. Loud, never swallowed.
      throw new Error(`SendPermit.record: the database refused the intent row: ${error.message}`)
    }

    return new SendPermit(
      data!.id as string,
      data!.idempotency_key as string,
      plan.to,
      plan.from,
      plan.templateApprovalId,
      plan.variables ?? {},
      plan.body,
      plan.templateName,
    )
  }
}

/** The statutes behind whatever obligations the permission carried. */
function obligationSources(codes: string[]): string | null {
  const sources = codes
    .filter((c): c is ObligationCode => Object.prototype.hasOwnProperty.call(OBLIGATIONS, c))
    .map((c) => OBLIGATIONS[c].source)
  return sources.length ? [...new Set(sources)].join(' · ') : null
}
