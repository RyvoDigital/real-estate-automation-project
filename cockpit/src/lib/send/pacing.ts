/**
 * Pacing, expressed as REFUSALS rather than as filters.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ A FILTER REMOVES SOMEBODY SILENTLY. A REFUSAL LEAVES A ROW SAYING WHY.  │
 * │                                                                         │
 * │ "Why didn't this person get it?" must have an answer, and the answer    │
 * │ "they were messaged on Tuesday and the rule is one touch a week" is as  │
 * │ much of an answer as "they objected". Filtering the list before the     │
 * │ walk would produce the same behaviour and no record, and the operator   │
 * │ would be left inferring from an absence.                                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Pure: the caller supplies what it already fetched, and every rule below is a
 * test with no database.
 *
 * WHY THESE RULES EXIST, SO NOBODY RELAXES THEM CASUALLY
 * Specification §4 and §10, Enquadramento §9: thirty a day, never two touches
 * in a week, at most three touches then dormant for ninety days. They protect
 * the quality rating, which protects the number, which the Concierge runs on.
 */

export type PacingRefusal =
  | 'daily_cap_reached'
  | 'touched_this_week'
  | 'max_touches_reached'

export type PacingVerdict =
  | { permitted: true }
  | { permitted: false; reason: PacingRefusal; detail: string }

export const DAILY_CAP = 30
export const MIN_DAYS_BETWEEN_TOUCHES = 7
export const MAX_TOUCHES = 3
export const DORMANT_DAYS = 90

export const PACING_REFUSAL_MEANS: Record<PacingRefusal, string> = {
  daily_cap_reached:
    `This client has already sent ${DAILY_CAP} messages today, which is the cap that keeps the ` +
    'number below the volume WhatsApp reads as a burst. The contact is not refused — the day is.',
  touched_this_week:
    `This contact was messaged within the last ${MIN_DAYS_BETWEEN_TOUCHES} days. A second touch ` +
    'inside a week reads as pressure and is the fastest route to a block.',
  max_touches_reached:
    `This contact has had ${MAX_TOUCHES} touches, which is the sequence in full. They go dormant ` +
    `for ${DORMANT_DAYS} days: a fourth message is not supported by the data and the number ` +
    'cannot afford it.',
}

/** What the runner already knows about a contact, from `sends`. */
export type ContactHistory = {
  /** Timestamps of messages actually sent to this contact, any campaign. */
  sentAt: string[]
}

export function checkPacing(input: {
  history: ContactHistory
  /** Messages this client has already sent today, all campaigns. */
  sentToday: number
  now?: Date
}): PacingVerdict {
  const now = input.now ?? new Date()

  // The daily cap is about the CLIENT's day, not the contact, and it is checked
  // first because it refuses everybody equally — a contact refused for the cap
  // is one to retry tomorrow, while the others are refusals about the person.
  if (input.sentToday >= DAILY_CAP) {
    return {
      permitted: false,
      reason: 'daily_cap_reached',
      detail: `${input.sentToday} of ${DAILY_CAP} sent today. ${PACING_REFUSAL_MEANS.daily_cap_reached}`,
    }
  }

  const touches = input.history.sentAt
    .map((s) => new Date(s).getTime())
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a)

  if (touches.length >= MAX_TOUCHES) {
    const last = new Date(touches[0])
    return {
      permitted: false,
      reason: 'max_touches_reached',
      detail:
        `${touches.length} touches, the last on ${last.toISOString().slice(0, 10)}. ` +
        PACING_REFUSAL_MEANS.max_touches_reached,
    }
  }

  if (touches.length > 0) {
    const days = (now.getTime() - touches[0]) / (24 * 3600 * 1000)
    if (days < MIN_DAYS_BETWEEN_TOUCHES) {
      return {
        permitted: false,
        reason: 'touched_this_week',
        detail:
          `Last messaged ${days.toFixed(1)} days ago. ${PACING_REFUSAL_MEANS.touched_this_week}`,
      }
    }
  }

  return { permitted: true }
}

/**
 * Whether the cap refuses the rest of the day.
 *
 * The distinction matters to the runner: a contact refused for the daily cap is
 * not a contact that failed, it is a day that ended. Walking the remaining
 * three hundred contacts to refuse each one identically would write three
 * hundred rows saying the same thing about the clock.
 */
export function isDayEnding(v: PacingVerdict): boolean {
  return !v.permitted && v.reason === 'daily_cap_reached'
}
