import type { Requirement } from './criteria'

/**
 * Replacing a lead's derived requirements without destroying the one thing that
 * cannot be derived.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ A RECOMPUTE DELETES BY SOURCE. IT MUST NEVER DELETE EVERYTHING.         │
 * │                                                                         │
 * │ `source = 'agent'` is the agent's own answer to "why them?" in the      │
 * │ triage flow. It exists nowhere else, it is the only way a name-and-     │
 * │ phone list acquires any structure at all, and it is not reproducible    │
 * │ from messages, from the import, or from anything else we hold.          │
 * │                                                                         │
 * │ The obvious recompute — "delete every row for this lead, reinsert what  │
 * │ the extractor produced" — destroys it AND LOOKS LIKE IT WORKED, because │
 * │ every derived row comes back. Nothing errors, the count is plausible,   │
 * │ and the sentence is gone.                                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * WHY THIS IS A PURE PLANNER RATHER THAN A DELETE STATEMENT
 *
 * The rule is not a constraint and the database cannot enforce it — it is a
 * property of the statement the caller writes. So the caller does not get to
 * write one. This function is the ONLY thing that produces ids to delete, it
 * takes rows and returns a plan, and the whole rule is a test with no database
 * (`0026-recompute-preserves-agent-rows` in the proof book was registered as
 * blocked precisely because it had no caller to be proved against; this is that
 * caller, and the proof is now an ordinary test).
 *
 * The store applies the plan by id. A delete scoped to ids that came from here
 * cannot widen into a delete scoped to the lead.
 */

export type StoredRequirement = {
  id: string
  source: Requirement['source']
}

/** Sources the extractor OWNS and may therefore replace wholesale. */
const DERIVED: Requirement['source'][] = ['field', 'conversation', 'note']

/** Sources a person authored. Never replaced by a recompute. */
const AUTHORED: Requirement['source'][] = ['agent']

export type RecomputePlan = {
  /** Exactly the rows to delete. Never a predicate, never "all for this lead". */
  deleteIds: string[]
  insert: Requirement[]
  /** What was left alone, and why — reported, so a zero is a fact not a guess. */
  preserved: { id: string; source: Requirement['source'] }[]
}

export function planRecompute(
  existing: StoredRequirement[],
  derived: Requirement[],
): RecomputePlan {
  const preserved = existing.filter((r) => !DERIVED.includes(r.source))

  /*
   * A source we have never seen is PRESERVED, not deleted.
   *
   * The two lists are exhaustive over today's union, and the `never` check
   * below makes adding a source to `Requirement['source']` a compile error
   * here — because the default that would otherwise absorb it is the one that
   * DELETES, and a new source is far more likely to be something a person
   * authored than something the extractor owns. Deny-by-default pointed at a
   * deletion (lesson 6f: a deletion's blast radius is a property of the
   * statement, not of the intent).
   */
  for (const s of [...DERIVED, ...AUTHORED]) {
    const exhaustive: 'field' | 'conversation' | 'note' | 'agent' = s
    void exhaustive
  }

  return {
    deleteIds: existing.filter((r) => DERIVED.includes(r.source)).map((r) => r.id),
    insert: derived,
    preserved: preserved.map((r) => ({ id: r.id, source: r.source })),
  }
}
