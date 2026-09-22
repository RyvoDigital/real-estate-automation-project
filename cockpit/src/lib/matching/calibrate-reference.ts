import { CALIBRATE } from './screen-copy'
import type { Answers } from './thresholds'
import type { Thresholds } from './score'

/**
 * The previous sitting, as the calibration screen shows it BESIDE the fields
 * (checkpoint 2, 22 Sep 2026): read-only reference, in the agent's units, with
 * its date and who answered. Never a default value: the fields start empty.
 * PURE, so the screen, the preview and the tests read one formatter.
 */

export type PreviousSitting = {
  answers: Answers
  answeredBy: string
  recordedBy: string
  /** ISO timestamp */
  recordedAt: string
  thresholds: Thresholds
}

const euro = (n: number) => `€${n.toLocaleString('pt-PT')}`
const num = (n: number) => n.toLocaleString('pt-PT')

/** What the agency said last time, per field, as text. An unanswered field says so. */
export function referenceLines(a: Answers): Record<keyof Answers, string> {
  const or = <T,>(v: T | null, f: (v: T) => string) => (v === null || v === undefined ? CALIBRATE.noAnswerThen : f(v))
  return {
    budgetSaid: or(a.budgetSaid, euro),
    budgetMost: or(a.budgetMost, euro),
    budgetStretchMost: or(a.budgetStretchMost, euro),
    showsOneFewerBedroom: or(a.showsOneFewerBedroom, (b) => (b ? CALIBRATE.yes : CALIBRATE.no)),
    ofHowMany: or(a.ofHowMany, num),
    strongAtLeast: or(a.strongAtLeast, num),
    possibleAtLeast: or(a.possibleAtLeast, num),
    adjacency: a.adjacency?.trim() ? a.adjacency.trim().split('\n').map((l) => l.trim()).filter(Boolean).join('; ') : CALIBRATE.noAreasThen,
  }
}

/** "22 Sep 2026", in Lisbon, as the screen dates everything. */
export function sittingDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Lisbon' })
}
