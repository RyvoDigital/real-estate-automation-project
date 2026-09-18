import { extractFromStatements } from './extract'
import type { Requirement } from './criteria'

/**
 * The triage floor: who a listing is for, when nothing can be ranked.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THIS IS THE PRODUCT FOR AN AGENCY WITH NO STRUCTURED DATA, WHICH IS     │
 * │ MOST OF THE SEGMENT. It is not a fallback.                              │
 * │                                                                         │
 * │ 03 normally asks "which leads match this listing?". On a name-and-phone │
 * │ list that question has no answer, and `scoreListing` is right to refuse │
 * │ it. So the question is inverted: the system brings the names, grouped   │
 * │ the way the agency remembers them, and the agent decides — and then the │
 * │ system KEEPS WHAT THEY DECIDED.                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * IT NEEDS NO THRESHOLDS. Every other part of 03 refuses until the calibration
 * conversation has happened; this works today, on real rows, with nothing
 * configured. That is the point of it being the floor.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TWO DEPARTURES FROM §2.1 AS WRITTEN, BOTH DELIBERATE
 * ───────────────────────────────────────────────────────────────────────────
 *
 * **1. Reachability is not shown, and nothing is filtered by it.** §2.1 said
 * the screen shows the *reachable* contacts. It does not, for three reasons.
 * The matching side must not consult the gate, the ledger or the suppression
 * list — that boundary is asserted in matching-boundary.test.ts and a screen
 * reaching around it is the same hole with a nicer view. The agent's next act
 * is to write to their own client personally, which is the agency's
 * communication and not ours to gate. And a consent state shown beside a name
 * invites an agent to self-censor on a word they have not been taught, which is
 * worse than the send path refusing later with a reason.
 *
 * **2. Grouping is written here rather than reused from segmentation.**
 * `groups.ts` groups contacts *awaiting a declaration* and its row type carries
 * consent facts — importing it would mean fabricating a ledger state to ask a
 * question that has nothing to do with consent. Same idea, different subject.
 * The IDEA is what was worth reusing: an agency remembers "the export from the
 * old website form" and "the people from the 2023 open days", not `area =
 * 'Cascais'`.
 */

export type TriageContact = {
  leadId: string
  name: string | null
  /** For the group labels, never rendered on its own. */
  lastContactAt: string | null
  area: string | null
  batchId: string | null
  batchFilename: string | null
  /** Already picked for THIS listing, so the screen does not offer it twice. */
  alreadyChosen: boolean
}

export type TriageGroup = {
  id: string
  kind: 'batch' | 'year' | 'area' | 'rest'
  /** Built from the agency's own data, never from our vocabulary. */
  label: string
  contacts: TriageContact[]
}

const YEAR = (iso: string | null) => (iso ? new Date(iso).getUTCFullYear() : null)

/**
 * Group in the order most likely to jog a memory, and put each contact in
 * EXACTLY ONE group.
 *
 * Not "every group a contact belongs to": a person appearing under their import
 * batch and again under their area is the same person offered twice, and an
 * agent who picks them in both places has not made two decisions. One home
 * each, strongest cue first.
 */
export function groupForTriage(contacts: TriageContact[]): TriageGroup[] {
  const left = new Set(contacts.map((c) => c.leadId))
  const groups: TriageGroup[] = []
  const take = (id: string, kind: TriageGroup['kind'], label: string, pick: (c: TriageContact) => boolean) => {
    const members = contacts.filter((c) => left.has(c.leadId) && pick(c))
    if (members.length === 0) return
    for (const m of members) left.delete(m.leadId)
    groups.push({ id, kind, label, contacts: members })
  }

  // 1. The import batch. The strongest cue, because they chose the file.
  const batches = [...new Set(contacts.map((c) => c.batchId).filter(Boolean))] as string[]
  for (const b of batches) {
    const name = contacts.find((c) => c.batchId === b)?.batchFilename ?? b
    take(`batch:${b}`, 'batch', name, (c) => c.batchId === b)
  }

  // 2. The year they were last spoken to.
  const years = [...new Set(contacts.map((c) => YEAR(c.lastContactAt)).filter((y): y is number => y !== null))]
    .sort((a, b) => b - a)
  for (const y of years) take(`year:${y}`, 'year', String(y), (c) => YEAR(c.lastContactAt) === y)

  // 3. The area, where the import carried one.
  const areas = [...new Set(contacts.map((c) => c.area).filter(Boolean))] as string[]
  for (const a of areas.sort()) take(`area:${a}`, 'area', a, (c) => c.area === a)

  // 4. And everyone else, NAMED rather than dropped. A contact with no batch,
  //    no date and no area is exactly the name-and-phone row this screen exists
  //    for, and leaving them out of the grouping would leave them out of the
  //    product.
  take('rest', 'rest', '', () => true)

  return groups
}

/**
 * What one pick produces.
 *
 * Two writes, and they are different kinds of record:
 *
 *   the MATCH   — always. `listing_matches`, origin 'agent', carrying who
 *                 chose and their sentence. This is the decision, and it is
 *                 kept whether or not the sentence says anything the engine
 *                 can use.
 *
 *   REQUIREMENTS — only when the sentence contains something matchable.
 *                 "quer jardim em Cascais" yields a feature and an area;
 *                 "she looked at the house two doors down last spring" yields
 *                 nothing, and that is fine. The sentence is still on the match
 *                 row, where it belongs.
 *
 * ⚠️ SO THE LIST DOES NOT NECESSARILY IMPROVE WITH EVERY PICK, and the screen
 * must not claim it does. §2.1 step 7 — "next listing: those contacts can be
 * ranked" — holds only for picks whose reason was criteria-shaped. Overclaiming
 * here would be the tier ladder's own rule broken by the feature built to
 * honour it.
 */
export type PickPlan = {
  requirements: Requirement[]
  /** True when the agent's sentence gave the engine nothing to match on. */
  reasonWasNotCriteria: boolean
}

export function planPick(input: {
  reason: string | null
  knownAreas: string[]
}): PickPlan {
  const reason = (input.reason ?? '').trim()
  if (!reason) return { requirements: [], reasonWasNotCriteria: false }

  // `source: 'agent'` and no clock: nothing says where an agent's remark sits
  // relative to what the lead said, so it takes the excludes-least branch of
  // the recency rule rather than overriding the lead's own words.
  const e = extractFromStatements([{ text: reason, source: 'agent', at: null }], input.knownAreas)
  return {
    requirements: e.requirements,
    reasonWasNotCriteria: e.requirements.length === 0,
  }
}
