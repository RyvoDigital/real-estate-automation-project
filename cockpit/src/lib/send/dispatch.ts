import type { SendPermit } from '@/lib/send/permit'
import { isReservedTestNumber } from '@/lib/reserved-numbers'

/**
 * The dispatcher. The ONLY place in this repository that may talk to the
 * message provider, and the only place its credentials are in scope.
 *
 * `tests/one-sender.test.ts` asserts that: it fails, naming the offending file,
 * if the provider SDK or its credentials are referenced anywhere else. Of the
 * three mechanisms defending this path that is the weakest-looking and the most
 * valuable, because it is the only one a person can apply without knowing the
 * argument (engineering-lessons §12).
 *
 * IT OWNS NO IO, AND THAT IS THE THIRD TIME THIS LESSON HAS ARRIVED.
 * The first version imported the service-role client, which is `server-only`
 * for a load-bearing reason — it stops the key reaching a browser — and that
 * made this module unimportable from a test. Weakening that guard to test the
 * retry logic would have traded a real control for a convenience. So dispatch
 * takes its store AND its provider as arguments: it is orchestration, nothing
 * else, and every side effect is somebody else's module. engineering-lessons
 * §12 predicted this shape and it still happened twice; the defence is the
 * split, not the intention.
 *
 * IT DOES NOT TRUST THE PERMIT. A cast defeats any type, so the row is re-read
 * and checked before the provider exists in this scope. The permit is not a
 * token that can be forged: what it points at is a row that had to satisfy
 * 0015's constraints in order to exist.
 *
 * ---------------------------------------------------------------------------
 * RETRY: ONLY ON AN EXPLICIT "NOT NOW". NEVER ON SILENCE.
 * ---------------------------------------------------------------------------
 * The question is whether the provider ANSWERED.
 *
 *   4xx rejection     it answered "I did not accept this" -> failed, no retry:
 *                     the same content would be rejected identically
 *   429 / slow down   it answered "not now, try later" -> the ONE retryable
 *                     answer, bounded below
 *   timeout, socket   IT DID NOT ANSWER. It may have accepted and delivered
 *   error, bodiless   -> the row stays `intended` and the path stops
 *   5xx
 *
 * Silence is always ambiguous, and Twilio has no idempotency key on message
 * creation (checked 17 Sep 2026), so a retry after silence is not "probably
 * safe" — it is a second message. A visible `intended` row is a question
 * someone can answer; an invisible double send to somebody whose consent is the
 * entire product is not recoverable.
 *
 * THE 429 BOUND: 3 attempts, 2s then 8s then 32s, then stop.
 *   - Worst case adds ~42s. A reactivation message is not time-critical and
 *     under a minute is invisible to the recipient.
 *   - Three rides out a brief limit without becoming a retry storm. More
 *     attempts hold a row in flight for minutes while the process must stay
 *     alive, and a crash mid-retry leaves the same `intended` row — so the
 *     extra attempts buy nothing reconciliation does not already cover.
 *   - Quadrupling rather than doubling reaches a meaningful wait in few steps.
 *   - No jitter: the campaign sender is serial and capped at 30 a day, so there
 *     is no herd to spread.
 *   - Exhausting the bound leaves the row at `intended` deliberately. That is
 *     the correct failure: a question, not a lost send.
 *
 * A 429 is a property of the ACCOUNT, not of the message, so the caller is told
 * to HALT THE BATCH rather than move to the next contact — the next one would
 * be rate-limited too.
 */

export const RETRY_DELAYS_MS = [2_000, 8_000, 32_000] as const
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length

export type DispatchOutcome =
  | { kind: 'sent'; providerMessageId: string; bodySent: string }
  | { kind: 'failed'; error: string }
  | { kind: 'ambiguous'; error: string }
  | { kind: 'rate_limited'; error: string; haltBatch: true }

/**
 * The row as dispatch needs to see it, and the writes it needs to make.
 * Implemented over the service-role client in send-store.ts.
 */
export type SendStore = {
  read(sendId: string): Promise<{
    id: string
    status: string
    idempotency_key: string
    gate_verdict: string
    phone_e164: string
    attempts: number | null
  } | null>
  update(sendId: string, patch: Record<string, unknown>): Promise<void>
}

/** What a provider adapter must offer. The real one is not written yet. */
export type ProviderAdapter = {
  /**
   * Whether this adapter could send if asked.
   *
   * On the port rather than in the caller so that the ONLY file naming the
   * sending credential stays the one that holds it. An assembly that checked
   * `process.env.TWILIO_SEND_KEY_SID` itself would be a second file naming it,
   * and one-sender.test.ts would be right to fail — the assertion's whole value
   * is that the count stays one.
   */
  isConfigured(): boolean

  send(input: {
    to: string
    /** The client's own number. The adapter has no default sender. */
    from: string
    /** The approved template's id. Outside the window, only templates may go. */
    contentSid: string
    /** {"1": "Maria", "2": "Cascais"} — Twilio renders, so the wire is its copy. */
    variables?: Record<string, string>
    /** What we rendered, carried for the record rather than for sending. */
    body: string
    templateName: string
  }): Promise<
    | { accepted: true; providerMessageId: string; bodySent: string }
    | { accepted: false; retryable: 'never' | 'later'; error: string }
  >
}

/** Deliberately unimplemented, so the path is testable before a message can leave. */
export const notImplementedProvider: ProviderAdapter = {
  isConfigured: () => false,
  async send() {
    throw new Error('provider adapter not implemented: no message can physically be sent yet')
  },
}

export async function dispatch(
  permit: SendPermit,
  deps: {
    provider: ProviderAdapter
    store: SendStore
    sleep?: (ms: number) => Promise<void>
  },
): Promise<DispatchOutcome> {
  const { provider, store } = deps
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  // --- the permit is not trusted -------------------------------------------
  const row = await store.read(permit.sendId)
  if (!row) throw new Error(`dispatch: no send row for permit ${permit.sendId}`)
  if (row.status !== 'intended') throw new Error(`dispatch: row is "${row.status}", not "intended"`)
  if (row.idempotency_key !== permit.idempotencyKey) throw new Error('dispatch: idempotency key mismatch')
  if (row.gate_verdict !== 'permitted') throw new Error('dispatch: row does not carry a permission')
  if (isReservedTestNumber(row.phone_e164)) {
    throw new Error(`dispatch: ${row.phone_e164} is a reserved test number`)
  }

  let attempts = row.attempts ?? 0

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    attempts += 1
    let answer: Awaited<ReturnType<ProviderAdapter['send']>>
    try {
      answer = await provider.send({
        to: permit.to,
        from: permit.from,
        contentSid: permit.contentSid,
        variables: permit.variables,
        body: permit.body,
        templateName: permit.templateName,
      })
    } catch (e) {
      // NO ANSWER. This is the branch that must not retry.
      const message = e instanceof Error ? e.message : String(e)
      await store.update(permit.sendId, {
        attempts,
        last_attempt_at: new Date().toISOString(),
        last_error: `no answer from provider: ${message}`,
      })
      return { kind: 'ambiguous', error: message }
    }

    if (answer.accepted) {
      await store.update(permit.sendId, {
        status: 'sent',
        provider_message_id: answer.providerMessageId,
        body_sent: answer.bodySent,
        sent_at: new Date().toISOString(),
        attempts,
        last_attempt_at: new Date().toISOString(),
      })
      return { kind: 'sent', providerMessageId: answer.providerMessageId, bodySent: answer.bodySent }
    }

    if (answer.retryable === 'never') {
      await store.update(permit.sendId, {
        status: 'failed',
        failed_at: new Date().toISOString(),
        error: answer.error,
        attempts,
        last_attempt_at: new Date().toISOString(),
        last_error: answer.error,
      })
      return { kind: 'failed', error: answer.error }
    }

    // 'later' — the one retryable answer.
    await store.update(permit.sendId, {
      attempts,
      last_attempt_at: new Date().toISOString(),
      last_error: answer.error,
    })
    if (i < MAX_ATTEMPTS - 1) await sleep(RETRY_DELAYS_MS[i])
    else return { kind: 'rate_limited', error: answer.error, haltBatch: true }
  }

  // Unreachable; and if it is ever reached the row stays `intended`, which is
  // the right state to be unreachable into.
  return { kind: 'ambiguous', error: 'dispatch fell through its retry loop' }
}
