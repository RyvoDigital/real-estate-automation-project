import { decideGate, type ConsentFacts, type GateVerdict } from '@/lib/gate'
import type { PolicyRow } from '@/lib/jurisdiction-policy'
import { checkPacing, isDayEnding, type ContactHistory, type PacingVerdict } from '@/lib/send/pacing'
import { assessQuality, type QualityVerdict } from '@/lib/send/quality'

/**
 * The campaign runner: phase 2.
 *
 * Pure orchestration. Every side effect is an injected port, so the whole walk
 * — including every refusal, the halt, and the interruption case — is a test
 * with no database and no network.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 1. INTERRUPTION IS NOT RESUMPTION, AND THERE IS NO SECOND CODE PATH
 * ───────────────────────────────────────────────────────────────────────────
 * The process dies at contact 14 of 30. The run says `sending`; fourteen
 * contacts have send rows and sixteen do not.
 *
 * `runCampaign` is IDEMPOTENT and is simply called again. For each contact it
 * asks whether a send row already exists for (this run, this contact); if one
 * does, it skips — whatever that row's status. There is no resume function, no
 * `startFrom` argument and no checkpoint: the record of what was done IS the
 * cursor, and a re-invocation continues because everything already done is
 * already refused.
 *
 * That is why this is not a resume path by another name: a resume path is a
 * distinct route that skips phase 1, and this is the same route, which cannot.
 * A HALTED run is refused at the top by its status — `mayResumeHaltedRun`
 * exists to say no — and a halted run is a DECISION where an interruption is an
 * accident.
 *
 * A contact whose row is `intended` is skipped rather than retried. Twilio has
 * no idempotency on message creation, so re-dispatching a row that may already
 * have been accepted is how one person receives two messages. That row belongs
 * to reconciliation.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 2. PACING IS A REFUSAL, NOT A FILTER (see pacing.ts)
 * ───────────────────────────────────────────────────────────────────────────
 * A contact skipped for pacing gets a row with a reason, exactly like a
 * jurisdiction refusal, so "why didn't this person get it" has an answer
 * rather than an absence.
 *
 * The one exception is the daily cap, which is a fact about the CLOCK rather
 * than about a person: when it refuses, the run stops for the day instead of
 * writing an identical row about every remaining contact.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 3. THE ORDER IS DELIBERATE AND RECORDED
 * ───────────────────────────────────────────────────────────────────────────
 * Contacts are walked MOST RECENTLY ENGAGED FIRST, ties broken by phone so the
 * order is total and reproducible.
 *
 * Not arbitrary, because "which fourteen got it" is a question somebody will
 * ask after a halt. And most-recent-first rather than the reverse because the
 * first messages of a campaign are the ones that set the quality rating: the
 * warmest contacts are the least likely to block, and the specification's
 * "first send to 10–20% of the list" is only protective if that tranche is the
 * one most likely to go well.
 *
 * The order is fixed at evaluation and stored on the run, so the answer to
 * "which fourteen" is the first fourteen of a list that has not moved.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 4. A LATE REFUSAL IS EXPECTED. A PATTERN OF THEM IS EVIDENCE.
 * ───────────────────────────────────────────────────────────────────────────
 * Phase 1 forecast a contact as permitted; phase 2's gate refuses it. That is
 * the design working — the forecast authorises nothing and the gate re-decides
 * — and for one contact it is the seconds-wide race the invariant exists for.
 *
 * But it is also the ONLY moment the system learns its forecast was wrong, and
 * that is not noise. So every late refusal is counted BY REASON, and when they
 * pass a threshold the run HALTS:
 *
 *     late refusals > max(3, 10% of the forecast)  ->  halt
 *
 * The floor of three keeps a five-contact campaign from halting on one race.
 * The proportion catches the case that matters: fifteen of twenty refused late
 * is not a race, it is the world having moved — a policy row un-confirmed, a
 * template paused, a suppression list imported — and continuing would be
 * sending under assumptions that have been falsified.
 *
 * The halt names the DOMINANT reason, because "12 late refusals, 11 of them
 * not_confirmed" points at a person un-confirming a jurisdiction, while "12,
 * 11 of them objected" points at a bulk import. Different causes, different
 * afternoons.
 */

export type RunnerContact = {
  phone: string
  leadId?: string | null
  /** For ordering. Null sorts last: never engaged is coldest. */
  lastContactAt?: string | null
}

export type RunnerPorts = {
  /** Consent facts for one contact, already resolved by the caller. */
  consentFor(phone: string): Promise<ConsentFacts>
  policyFor(phone: string): Promise<PolicyRow | null>
  history(phone: string): Promise<ContactHistory>
  sentToday(): Promise<number>
  /** Has this run already produced a row for this contact, in any status? */
  alreadyHandled(phone: string): Promise<boolean>
  /** The sender's current quality rating, or null if unreadable. */
  qualityRating(): Promise<string | null>
  /** Write a refusal row. Layer is 'gate' | 'pacing'. */
  recordRefusal(input: {
    phone: string; leadId?: string | null; layer: string; reason: string; detail: string
  }): Promise<void>
  /** Mint the permit and dispatch. Returns what happened. */
  send(input: { contact: RunnerContact; verdict: Extract<GateVerdict, { permitted: true }> }): Promise<
    { kind: 'sent' } | { kind: 'failed' } | { kind: 'ambiguous' } | { kind: 'rate_limited' }
  >
  halt(reason: string): Promise<void>
}

export type RunOutcome = {
  considered: number
  skippedAlreadyHandled: number
  sent: number
  failed: number
  ambiguous: number
  refusedLate: number
  refusedPacing: number
  lateRefusalsByReason: Record<string, number>
  halted: boolean
  haltedReason: string | null
  dayEnded: boolean
}

/** most recently engaged first; never-engaged last; phone breaks every tie. */
export function walkOrder(contacts: RunnerContact[]): RunnerContact[] {
  return [...contacts].sort((a, b) => {
    const at = a.lastContactAt ? Date.parse(a.lastContactAt) : -Infinity
    const bt = b.lastContactAt ? Date.parse(b.lastContactAt) : -Infinity
    if (at !== bt) return bt - at
    return a.phone.localeCompare(b.phone)
  })
}

/** The threshold of §4 above. Exported so a test can state it rather than infer it. */
export function lateRefusalLimit(forecastPermitted: number): number {
  return Math.max(3, Math.ceil(forecastPermitted * 0.1))
}

export async function runCampaign(input: {
  contacts: RunnerContact[]
  forecastPermitted: number
  ports: RunnerPorts
  now?: Date
}): Promise<RunOutcome> {
  const { ports } = input
  const now = input.now ?? new Date()
  const out: RunOutcome = {
    considered: 0, skippedAlreadyHandled: 0, sent: 0, failed: 0, ambiguous: 0,
    refusedLate: 0, refusedPacing: 0, lateRefusalsByReason: {},
    halted: false, haltedReason: null, dayEnded: false,
  }

  const limit = lateRefusalLimit(input.forecastPermitted)

  for (const contact of walkOrder(input.contacts)) {
    // Quality is asked before EVERY batch; here, before every contact, because
    // the runner does not own batching and the check is one call. A halt stops
    // the walk immediately.
    const quality = assessQuality(await ports.qualityRating())
    if (!quality.proceed) {
      out.halted = true
      out.haltedReason = haltReason(quality)
      await ports.halt(out.haltedReason)
      break
    }

    // The cursor is the record. A contact with any row from this run is done.
    if (await ports.alreadyHandled(contact.phone)) {
      out.skippedAlreadyHandled += 1
      continue
    }
    out.considered += 1

    const pacing = checkPacing({
      history: await ports.history(contact.phone),
      sentToday: await ports.sentToday(),
      now,
    })
    if (!pacing.permitted) {
      if (isDayEnding(pacing)) {
        // A fact about the clock, not about this person. Stopping beats writing
        // the same row about everybody left.
        out.dayEnded = true
        break
      }
      out.refusedPacing += 1
      await ports.recordRefusal({
        phone: contact.phone, leadId: contact.leadId,
        layer: 'pacing', reason: pacing.reason, detail: pacing.detail,
      })
      continue
    }

    const verdict = decideGate({
      phone: contact.phone,
      consent: await ports.consentFor(contact.phone),
      policy: await ports.policyFor(contact.phone),
      now,
    })

    if (!verdict.permitted) {
      // THE FORECAST WAS WRONG ABOUT THIS CONTACT. Expected once; evidence in
      // quantity.
      out.refusedLate += 1
      out.lateRefusalsByReason[verdict.reason] = (out.lateRefusalsByReason[verdict.reason] ?? 0) + 1
      await ports.recordRefusal({
        phone: contact.phone, leadId: contact.leadId,
        layer: verdict.layer, reason: verdict.reason, detail: verdict.detail,
      })

      if (out.refusedLate > limit) {
        const [reason, count] = dominant(out.lateRefusalsByReason)
        out.halted = true
        out.haltedReason =
          `${out.refusedLate} contacts forecast as contactable were refused at send, past the ` +
          `threshold of ${limit} for a forecast of ${input.forecastPermitted}. ` +
          `${count} of them: ${reason}. A forecast this wrong is not the objection race — the ` +
          'world moved between evaluation and sending, and continuing would send under ' +
          'assumptions that have been falsified. Re-evaluate rather than resume.'
        await ports.halt(out.haltedReason)
        break
      }
      continue
    }

    const result = await ports.send({ contact, verdict })
    if (result.kind === 'sent') out.sent += 1
    else if (result.kind === 'failed') out.failed += 1
    else if (result.kind === 'ambiguous') out.ambiguous += 1
    else {
      // Rate limited: a property of the account, so the whole walk stops rather
      // than moving to the next contact, which would hit the same limit.
      out.halted = true
      out.haltedReason = 'the provider rate-limited the account; the batch halted rather than continuing into it'
      await ports.halt(out.haltedReason)
      break
    }
  }

  return out
}

function haltReason(q: QualityVerdict): string {
  return q.proceed ? '' : `quality ${q.rating ?? 'unreadable'} — ${q.reason}`
}

function dominant(counts: Record<string, number>): [string, number] {
  let best: [string, number] = ['none', 0]
  for (const [k, v] of Object.entries(counts)) if (v > best[1]) best = [k, v]
  return best
}
