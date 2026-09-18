import { THRESHOLD_KEYS, type Thresholds } from './score'

/**
 * Turning the calibration conversation into six numbers.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THE SCREEN ASKS QUESTIONS AN AGENT CAN ANSWER. IT DOES NOT ASK FOR      │
 * │ NUMBERS.                                                                │
 * │                                                                         │
 * │ "budget_stretch: 0.05" is not a thing anybody has an opinion about.     │
 * │ "Someone said up to €2,000,000 — what is the most you would still show  │
 * │ them?" is a question an agent answers in two seconds and has answered a │
 * │ hundred times before. The percentage is DERIVED from the answer.        │
 * │                                                                         │
 * │ That is the whole point of the screen existing: §4.6 says any value     │
 * │ chosen now is a guess and the method is half an hour with a real agent. │
 * │ A form of six numeric inputs turns that half hour into an interrogation │
 * │ about units.                                                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * NOTHING IS PRE-FILLED. Not a default, not a suggestion, not a placeholder
 * holding a plausible number. The same rule as the segmentation screen's
 * proposals: a pre-filled field collects a click rather than a decision, and
 * here the click would be recorded as an agency's judgement about their own
 * market. An empty form that refuses to submit is the honest state.
 */

/** What the screen asks, in the agent's units. */
export type Answers = {
  /** "Someone said up to €X. What is the most you would still show them?" */
  budgetSaid: number | null
  budgetMost: number | null
  /** The same, for someone who said they could stretch. */
  budgetStretchMost: number | null
  /** "Someone asked for a T3. Would you show them a T2?" */
  showsOneFewerBedroom: boolean | null
  /** "Of N things someone asked for, how many must it have to be…" */
  ofHowMany: number | null
  strongAtLeast: number | null
  possibleAtLeast: number | null
  /** "Cascais: Estoril, Parede" — one line per area. */
  adjacency: string
}

export const EMPTY_ANSWERS: Answers = {
  budgetSaid: null,
  budgetMost: null,
  budgetStretchMost: null,
  showsOneFewerBedroom: null,
  ofHowMany: null,
  strongAtLeast: null,
  possibleAtLeast: null,
  adjacency: '',
}

/**
 * "Cascais: Estoril, Parede" per line, into the map the scorer uses.
 *
 * SYMMETRIC, because the agent means it symmetrically. An agent who says
 * Cascais buyers will take Estoril is not also going to write the Estoril line,
 * and a one-way adjacency would silently show the Cascais lead an Estoril house
 * while refusing the Estoril lead the Cascais one — a difference nobody
 * intended and nobody would see.
 */
export function parseAdjacency(text: string): Record<string, string[]> {
  const out: Record<string, Set<string>> = {}
  const add = (a: string, b: string) => {
    if (!a || !b || a.toLowerCase() === b.toLowerCase()) return
    ;(out[a] ??= new Set()).add(b)
  }
  for (const line of text.split('\n')) {
    const [head, rest] = line.split(':')
    if (!rest) continue
    const from = head.trim()
    for (const to of rest.split(',').map((s) => s.trim()).filter(Boolean)) {
      add(from, to)
      add(to, from)
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]))
}

export type Problem = { field: keyof Answers; why: string }

/**
 * What is wrong with the answers, in the agent's terms.
 *
 * Returns problems rather than throwing, and NAMES THE FIELD, because this runs
 * with somebody sitting next to the operator and "invalid input" is not a thing
 * to say out loud in that room.
 */
export function problemsWith(a: Answers): Problem[] {
  const p: Problem[] = []
  const pos = (n: number | null) => n !== null && Number.isFinite(n) && n > 0

  if (!pos(a.budgetSaid)) p.push({ field: 'budgetSaid', why: 'missing' })
  if (!pos(a.budgetMost)) p.push({ field: 'budgetMost', why: 'missing' })
  if (pos(a.budgetSaid) && pos(a.budgetMost) && a.budgetMost! < a.budgetSaid!) {
    p.push({ field: 'budgetMost', why: 'below' })
  }
  if (!pos(a.budgetStretchMost)) p.push({ field: 'budgetStretchMost', why: 'missing' })
  // Somebody who SAID they could stretch cannot be shown less than somebody who
  // said nothing. If that reads as true to the agent, one of the two answers is
  // about a different question than the one they think.
  if (pos(a.budgetMost) && pos(a.budgetStretchMost) && a.budgetStretchMost! < a.budgetMost!) {
    p.push({ field: 'budgetStretchMost', why: 'below_plain' })
  }
  if (a.showsOneFewerBedroom === null) p.push({ field: 'showsOneFewerBedroom', why: 'missing' })

  if (!pos(a.ofHowMany)) p.push({ field: 'ofHowMany', why: 'missing' })
  if (!pos(a.strongAtLeast)) p.push({ field: 'strongAtLeast', why: 'missing' })
  if (!pos(a.possibleAtLeast)) p.push({ field: 'possibleAtLeast', why: 'missing' })
  if (pos(a.ofHowMany) && pos(a.strongAtLeast) && a.strongAtLeast! > a.ofHowMany!) {
    p.push({ field: 'strongAtLeast', why: 'over_total' })
  }
  if (pos(a.ofHowMany) && pos(a.possibleAtLeast) && a.possibleAtLeast! > a.ofHowMany!) {
    p.push({ field: 'possibleAtLeast', why: 'over_total' })
  }
  if (pos(a.strongAtLeast) && pos(a.possibleAtLeast) && a.possibleAtLeast! > a.strongAtLeast!) {
    p.push({ field: 'possibleAtLeast', why: 'above_strong' })
  }
  // Adjacency may legitimately be empty — an agency whose buyers treat no two
  // areas as interchangeable is a real agency, and §4.3 says only they know.
  return p
}

export function deriveThresholds(a: Answers): Thresholds {
  const said = a.budgetSaid as number
  return {
    budget_stretch: round4((a.budgetMost as number) / said - 1),
    budget_stretch_with_evidence: round4((a.budgetStretchMost as number) / said - 1),
    bedrooms_tolerance: a.showsOneFewerBedroom ? 1 : 0,
    area_adjacency: parseAdjacency(a.adjacency),
    min_score_strong: round4((a.strongAtLeast as number) / (a.ofHowMany as number)),
    min_score_possible: round4((a.possibleAtLeast as number) / (a.ofHowMany as number)),
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/**
 * What was saved, read back in the agent's units.
 *
 * So the screen can show "you said you'd stretch to €2,100,000" rather than
 * "0.05" — the number is ours and the sentence is theirs, and the agency should
 * be able to recognise their own answer six months later.
 */
export function explainSaved(t: Thresholds, reference = 2_000_000): {
  plainCeiling: number
  statedCeiling: number
  bedrooms: boolean
  areas: [string, string[]][]
} {
  return {
    plainCeiling: Math.round(reference * (1 + t.budget_stretch)),
    statedCeiling: Math.round(reference * (1 + t.budget_stretch_with_evidence)),
    bedrooms: t.bedrooms_tolerance >= 1,
    areas: Object.entries(t.area_adjacency).sort(([a], [b]) => a.localeCompare(b)),
  }
}

/** Is a stored config complete? Re-exported so screens do not reach past this. */
export { THRESHOLD_KEYS }
export type { Thresholds }
