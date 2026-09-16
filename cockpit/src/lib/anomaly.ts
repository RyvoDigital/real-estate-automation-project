/**
 * Anomalies — the invariant violations and run errors, shaped for the screen.
 *
 * Improvements §4.8. The invariants (§3.11) write `invariant.violated` and
 * `invariant.check_failed`, and the error workflow (§3.7 Layer 1) writes
 * `run.errored`. All three landed in `events` and in the operator's WhatsApp
 * and appeared in the cockpit nowhere at all — which is the one interface
 * anyone opens in the morning, and the record an agent needs when a lead
 * complains about something the system got wrong.
 *
 * Pure functions only, so the shaping is unit-testable without a database.
 * The query lives in `data.ts`.
 *
 * THE SUMMARY IS NOT REFORMATTED HERE. The event's `summary` is the same
 * sentence the WhatsApp carried, and it was judged readable on a phone at
 * 1am; a second formatter in the cockpit would drift from it and the two
 * would disagree about the same event. All this does is drop the trailing
 * phone number, which is context on a phone and noise on a screen that is
 * already showing the lead.
 */

export const ANOMALY_TYPES = ['invariant.violated', 'invariant.check_failed', 'run.errored'] as const

export type AnomalySeverity = 'critical' | 'warning'

export type AnomalyRow = {
  id: string
  at: string
  type: string
  severity: AnomalySeverity
  /** '1' | '2' | '3' | '3b' | '4' | '5' for a violated invariant, else null. */
  invariant: string | null
  /**
   * The stable identity of *what went wrong*, not of this occurrence. Two
   * rows share a kind when a human would read them as the same fault
   * happening twice. This is what the list collapses on.
   */
  kind: string
  /** Short badge text. */
  label: string
  /** The WhatsApp's sentence, minus the trailing phone. */
  summary: string
  /** What the lead was sent, as stored (the event keeps 200 chars). */
  textSent: string | null
  leadId: string | null
  clientId: string | null
  /** 'pre_send' | 'run_end' for invariants; null for a run error. */
  stage: string | null
  /** n8n execution link, for a run error. */
  executionUrl: string | null
}

export type AnomalyGroup = {
  /** The most recent occurrence; the row the screen renders. */
  latest: AnomalyRow
  /** How many occurrences share this kind inside the window. */
  count: number
  /** When the oldest of them fired. */
  oldestAt: string
}

/** The raw `events` row this module accepts. */
export type AnomalyEvent = {
  id: string
  created_at: string
  type: string
  severity: string | null
  summary: string | null
  data: unknown
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/**
 * The event summaries end with " | +351933048230" because on a phone the
 * number is the only thing identifying the lead. On a screen that shows the
 * lead's name it is noise, so it comes off — and only when it really is a
 * phone number, never by cutting at the last separator, which would eat a
 * summary that legitimately contains one.
 */
export function stripTrailingPhone(summary: string): string {
  return summary.replace(/\s*\|\s*\+?[\d\s()-]{6,}\s*$/, '').trim()
}

export function shapeAnomaly(e: AnomalyEvent): AnomalyRow {
  const d = (e.data ?? {}) as Record<string, unknown>
  const invariant = e.type === 'invariant.violated' ? str(d.invariant) : null

  let kind: string
  let label: string
  if (e.type === 'run.errored') {
    // A run error repeats per workflow+node, and that pair IS the fault.
    kind = `run.errored:${str(d.workflow) ?? '?'}:${str(d.node) ?? '?'}`
    label = 'Run error'
  } else if (e.type === 'invariant.check_failed') {
    kind = `invariant.check_failed:${str(d.stage) ?? '?'}`
    label = 'Check failed'
  } else {
    kind = `invariant:${invariant ?? '?'}`
    label = invariant ? `Invariant ${invariant}` : 'Invariant'
  }

  return {
    id: e.id,
    at: e.created_at,
    type: e.type,
    // A severity the writer did not set is treated as critical, not as fine.
    severity: e.severity === 'warning' ? 'warning' : 'critical',
    invariant,
    kind,
    label,
    summary: stripTrailingPhone(e.summary ?? '(no summary)'),
    textSent: str(d.text_sent),
    leadId: str(d.lead_id),
    clientId: null,
    stage: str(d.stage),
    executionUrl: str(d.execution_url),
  }
}

/**
 * Collapse by kind, newest first.
 *
 * WHY THIS AND NOT PAGINATION. At zero clients these fire once or twice and a
 * flat list is right. The volume case is not "many different anomalies" — it
 * is ONE fault firing on every run, because a guard regressed. A flat list
 * then shows the same sentence forty times and the second distinct fault is
 * below the fold. Collapsing keeps the newest occurrence of each fault on
 * screen with a count beside it, so a new kind can never be buried by an old
 * one however loud the old one is.
 *
 * Input must be newest-first; the caller's query orders it.
 */
export function groupAnomalies(rows: AnomalyRow[]): AnomalyGroup[] {
  const byKind = new Map<string, AnomalyRow[]>()
  for (const r of rows) {
    const list = byKind.get(r.kind)
    if (list) list.push(r)
    else byKind.set(r.kind, [r])
  }

  const groups: AnomalyGroup[] = []
  for (const list of byKind.values()) {
    groups.push({ latest: list[0], count: list.length, oldestAt: list[list.length - 1].at })
  }

  // Map iteration is insertion-ordered, which is already newest-first by
  // first occurrence; sorting explicitly says so rather than relying on it.
  groups.sort((a, b) => Date.parse(b.latest.at) - Date.parse(a.latest.at))
  return groups
}

/** Absolute, in the operator's zone. Never relative: a screen left open all
 *  night keeps saying "5 minutes ago" (the health screen's lesson, §5.6). */
export function anomalyClock(iso: string, timeZone = 'Europe/Lisbon'): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  })
}
