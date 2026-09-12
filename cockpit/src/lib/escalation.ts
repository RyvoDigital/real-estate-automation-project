/**
 * Escalation vocabulary — the single place the cockpit decides what an
 * escalation IS. Deliberately free of React and of `server-only` so it can
 * be unit-tested directly (tests/escalation.test.mjs).
 *
 * The reason values are not invented here. They are the strings the
 * Concierge writes, read out of workflows/ryvoInboundConc01.json:
 *
 *   claude_failed:<errorType>        bad_reply_twice
 *   booking_failed:<result>[:<err>]  no_availability:<slotError|window_full>
 *   booking_retired:<cancelled|missing>
 *   media_unprocessable:<kind>       high_value:<budget>>=<threshold>
 *   needs_human[:<free text from the model>]
 *
 * `needs_human` carries FREE TEXT the model wrote. Anything that treats
 * escalation_reason as a closed enum renders a blank the first time the
 * model phrases something new, so unknown values fall through to the raw
 * string rather than to an empty label.
 */

export type EscalationClass = 'system' | 'high_value' | 'person'

/** The system set, matching SYSTEM_REASONS in the workflow exactly. */
const SYSTEM = /^(claude_failed|bad_reply_twice|booking_failed|booking_retired|no_availability|media_unprocessable)/

export type Escalated = {
  at: string | null
  reasons: string[]
  /** The lead's message that was being answered when the escalation was
   *  decided. Stored so the reason can be read against the words it claims
   *  to describe: on 2026-09-11 a reason cited a price question from forty
   *  minutes earlier as if it were the current message. */
  triggeredBy: string | null
}

/**
 * Read `qualification.escalated`.
 *
 * `reasons[]` is the authority, not `reason`. Both writers store the same
 * shape — MarkLeadEscalated on the main path and MarkMediaEscalated on the
 * media path — but `reason` only ever carries reasons[0]. A lead that is
 * BOTH high-value AND booking-failed has two, and reading `reason` silently
 * drops one of them.
 *
 * `reason` is still read as a fallback, for any row written before both
 * paths agreed on the shape.
 */
export function parseEscalated(qualification: unknown): Escalated | null {
  if (!qualification || typeof qualification !== 'object') return null
  const esc = (qualification as Record<string, unknown>).escalated
  if (!esc || typeof esc !== 'object') return null

  const e = esc as Record<string, unknown>
  const list = Array.isArray(e.reasons)
    ? e.reasons.map((r) => String(r)).filter(Boolean)
    : []
  const single = typeof e.reason === 'string' && e.reason ? [e.reason] : []

  return {
    at: typeof e.at === 'string' ? e.at : null,
    reasons: list.length > 0 ? list : single,
    triggeredBy: typeof e.triggered_by === 'string' && e.triggered_by.trim() ? e.triggered_by : null,
  }
}

export function classOf(reason: string): EscalationClass {
  if (SYSTEM.test(reason)) return 'system'
  if (reason.startsWith('high_value')) return 'high_value'
  return 'person'
}

/**
 * Every class present on a lead, in display order, plus the primary one.
 *
 * A lead with two reasons gets two chips. That is the visible form of the
 * reasons[] rule — if the screen only ever showed one, nothing would tell
 * you the second was being dropped.
 *
 * Primary precedence is system > high_value > person: if something broke,
 * the fact that something broke is the headline, whatever else is true.
 */
export function classify(reasons: string[]): {
  primary: EscalationClass
  classes: EscalationClass[]
} {
  const present = new Set(reasons.map(classOf))
  const order: EscalationClass[] = ['system', 'high_value', 'person']
  const classes = order.filter((c) => present.has(c))
  return { primary: classes[0] ?? 'person', classes }
}

export const CLASS_LABEL: Record<EscalationClass, string> = {
  system: 'System',
  high_value: 'High value',
  person: 'Asked for a person',
}

/** Human-readable text for one reason. Unknown values return themselves. */
export function humanise(reason: string): string {
  const [head, ...rest] = reason.split(':')
  const tail = rest.join(':')

  switch (head) {
    case 'claude_failed':
      return 'AI unavailable — the model call failed'
    case 'bad_reply_twice':
      return 'AI reply rejected twice'
    case 'booking_failed':
      return tail === 'conflict_burned_id'
        ? 'Booking failed — calendar id burned'
        : `Booking failed${tail ? ` — ${tail.replace(/_/g, ' ')}` : ''}`
    case 'booking_retired':
      // The lead HAS been told, by a fixed note, before this reached the queue.
      return tail === 'cancelled'
        ? 'Appointment removed from the calendar — lead told, needs rebooking'
        : 'Appointment no longer in the calendar — lead told, needs rebooking'
    case 'no_availability':
      return tail === 'window_full'
        ? 'No free slots in the booking window'
        : `No availability${tail ? ` — ${tail.replace(/_/g, ' ')}` : ''}`
    case 'media_unprocessable':
      return `${tail ? tail.replace(/_/g, ' ') : 'Media'} — nothing for the AI to read`
    case 'high_value': {
      const m = tail.match(/^(\d+)>=(\d+)$/)
      if (!m) return 'Budget above the high-value threshold'
      return `Budget ${money(Number(m[1]))} against a ${money(Number(m[2]))} threshold`
    }
    case 'needs_human':
      return tail ? `Asked for a person — ${tail}` : 'Asked for a person'
    default:
      return reason
  }
}

function money(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `€${(Math.round(m * 10) / 10).toString().replace(/\.0$/, '')}M`
  }
  if (n >= 1_000) return `€${Math.round(n / 1000)}k`
  return `€${n}`
}

/**
 * Ageing tiers. Thresholds are §2.2 of the spec, and 240 minutes is the
 * four-hour line the queue exists to prevent someone crossing.
 */
export type Tier = 0 | 1 | 2 | 3

export function tierFor(minutes: number): Tier {
  if (minutes >= 240) return 3
  if (minutes >= 90) return 2
  if (minutes >= 30) return 1
  return 0
}

export const TIER_WORD: Record<Tier, string> = {
  0: 'Settled',
  1: 'Ageing',
  2: 'Late',
  3: 'Breach',
}

export function minutesSince(iso: string | null, now: number = Date.now()): number {
  if (!iso) return 0
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((now - t) / 60000))
}

export function formatWait(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m < 10 ? '0' : ''}${m}m` : `${m}m`
}

/**
 * An outage is a CLUSTER of system escalations in a short window, not a
 * single one. Three leads dropped by claude_failed in four minutes is a
 * different fact from one booking that failed, and the screen has to say
 * so — otherwise a total outage reads as a busy day, which is instance 9
 * of the lessons file wearing a new costume. §11 item 16.
 */
export function detectOutage(
  rows: { at: string | null; reasons: string[] }[],
  now: number = Date.now(),
  windowMinutes = 15,
  threshold = 3,
): { active: boolean; count: number; reason: string | null } {
  const recent = rows.filter((r) => {
    if (!r.at) return false
    if (minutesSince(r.at, now) > windowMinutes) return false
    return r.reasons.some((x) => classOf(x) === 'system')
  })

  // Cluster by the reason HEAD (claude_failed, booking_failed…). Three
  // unrelated system faults is a bad afternoon; three of the same one is
  // a dependency being down.
  const byHead = new Map<string, number>()
  for (const r of recent) {
    for (const reason of r.reasons) {
      if (classOf(reason) !== 'system') continue
      const head = reason.split(':')[0]
      byHead.set(head, (byHead.get(head) ?? 0) + 1)
    }
  }

  let best: { head: string; n: number } | null = null
  for (const [head, n] of byHead) {
    if (!best || n > best.n) best = { head, n }
  }

  if (!best || best.n < threshold) return { active: false, count: 0, reason: null }
  return { active: true, count: best.n, reason: best.head }
}
