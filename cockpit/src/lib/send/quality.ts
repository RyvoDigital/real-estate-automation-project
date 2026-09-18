/**
 * The quality-rating halt.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THE NUMBER A CAMPAIGN RISKS IS THE NUMBER THE CONCIERGE RUNS ON.        │
 * │                                                                         │
 * │ A reactivation campaign that degrades the rating does not damage the     │
 * │ campaign — it throttles the automation that already works and already    │
 * │ has a client depending on it. The cost of halting early is a delayed     │
 * │ campaign; the cost of halting late is the Concierge. Those are not       │
 * │ comparable, which is why the threshold below is not a judgement call.    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Pure: it takes a rating and returns a verdict. The reading is somebody else's
 * module, so every threshold here is a test with no network.
 */

export type QualityVerdict =
  | { proceed: true; rating: string }
  | { proceed: false; rating: string | null; severity: 'warning' | 'critical'; reason: string }

/**
 * Meta's vocabulary is GREEN/YELLOW/RED and Twilio surfaces HIGH/MEDIUM/LOW.
 * The documentation gives examples rather than a closed set, so BOTH are
 * accepted and anything else is a halt — see `assess`.
 */
const GOOD = new Set(['HIGH', 'GREEN'])
const DEGRADED = new Set(['MEDIUM', 'YELLOW'])
const BAD = new Set(['LOW', 'RED'])

/**
 * `null` means the rating could not be read at all — the API failed, the field
 * was absent, the sender was not found. That is a halt, not a pass: a rating we
 * cannot read is not a rating we may ignore, and "the check broke" must never
 * be quieter than "the check said no" (§5b).
 */
export function assessQuality(rating: string | null | undefined): QualityVerdict {
  if (rating == null || rating.trim() === '') {
    return {
      proceed: false, rating: null, severity: 'critical',
      reason:
        'The sender quality rating could not be read. A rating we cannot read is not a rating we ' +
        'may ignore — halting is the only answer that cannot be wrong in the expensive direction.',
    }
  }

  const r = rating.trim().toUpperCase()
  if (GOOD.has(r)) return { proceed: true, rating: r }

  if (DEGRADED.has(r)) {
    return {
      proceed: false, rating: r, severity: 'warning',
      reason:
        `Quality is ${r}. Enquadramento §9 and specification §10 both require halting on any drop ` +
        'below green: the cost of halting early is a delayed campaign, and the cost of halting ' +
        'late is the number the Concierge runs on.',
    }
  }

  if (BAD.has(r)) {
    return {
      proceed: false, rating: r, severity: 'critical',
      reason:
        `Quality is ${r}. The sender is at or near a messaging-limit reduction, and every further ` +
        'message makes it worse. Nothing resumes without a person.',
    }
  }

  // An unrecognised value. Meta and Twilio may add one, and the documentation
  // does not enumerate them — so the default is refusal, not optimism.
  return {
    proceed: false, rating: r, severity: 'critical',
    reason:
      `Unrecognised quality rating "${r}". The provider's documented values are examples rather ` +
      'than a closed set, so an unknown rating halts: treating it as good would make every future ' +
      'value Meta invents a silent pass.',
  }
}

// ---------------------------------------------------------------------------
// The two moments it is consulted
// ---------------------------------------------------------------------------

export type SenderReader = {
  /** From the Senders API v2: properties.quality_rating. Null if unreadable. */
  qualityRating(senderSid: string): Promise<string | null>
}

export type HaltDecision = {
  halt: boolean
  verdict: QualityVerdict
  /** For campaign_runs.halted_reason, which 0018 requires a halted run to have. */
  haltedReason: string | null
}

/**
 * Before every batch, and again on a schedule.
 *
 * The batch check is tight where the risk is: a batch is at most thirty
 * messages, so the rating can never be more than one batch stale. The scheduled
 * check exists because the batch check is one a caller REMEMBERS to make, and a
 * check that runs because somebody remembered is not a control (§12) — it
 * covers a run that stalls mid-batch and a loop written next year by someone who
 * has not read this file.
 */
export async function checkBeforeBatch(input: {
  senderSid: string
  reader: SenderReader
  at?: Date
}): Promise<HaltDecision> {
  let rating: string | null
  try {
    rating = await input.reader.qualityRating(input.senderSid)
  } catch (e) {
    // A failure to read is a halt, and it says so rather than becoming a null
    // that looks like an absence of rating.
    rating = null
    const verdict = assessQuality(null)
    return {
      halt: true,
      verdict,
      haltedReason:
        `quality unreadable at ${(input.at ?? new Date()).toISOString()}: ` +
        `${e instanceof Error ? e.message : String(e)}`,
    }
  }

  const verdict = assessQuality(rating)
  return {
    halt: !verdict.proceed,
    verdict,
    haltedReason: verdict.proceed
      ? null
      : `quality ${verdict.rating ?? 'unreadable'} at ${(input.at ?? new Date()).toISOString()} — ${verdict.reason}`,
  }
}

/**
 * Whether a halted run may be resumed. It may not.
 *
 * The staleness argument is real but weaker than it looks: phase 2 re-runs the
 * gate immediately before every send, so a resumed run could not message
 * somebody who objected in the interim — safety is already covered. What breaks
 * is the RECORD: the forecast described a moment that has passed.
 *
 * The stronger argument is structural. A resume path is a send path that
 * skipped phase 1, and once it exists it is available to every future caller,
 * including the ones written after everybody has forgotten why evaluation comes
 * first.
 *
 * And a quality drop is evidence about the content or the audience rather than
 * weather. Re-evaluating is the cheapest way to make the second run's shape
 * true, and the operator reading the new forecast is where somebody notices the
 * audience was wrong.
 *
 * A function rather than a comment, so the answer is reachable from code and a
 * future "resume" button has something to call that says no.
 */
export function mayResumeHaltedRun(): { may: false; reason: string } {
  return {
    may: false,
    reason:
      'A halted run cannot be resumed. Re-evaluate: a new run, which may reference the halted one. ' +
      'Its forecast described a moment that has passed, and a resume path would be a send path that ' +
      'skipped evaluation. Contacts already messaged are refused by the pacing rule — never two ' +
      'touches in a week — reading `sends`, not by special-casing the halt.',
  }
}
