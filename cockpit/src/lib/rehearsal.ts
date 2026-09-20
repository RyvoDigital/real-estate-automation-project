/*
 * ═════════════════════════════════════════════════════════════════════════════
 * IS THIS A REHEARSAL CLIENT — asked, never assumed, never pre-selected.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * `0037` adds `clients.rehearsal` with NO DEFAULT, on purpose. `default false`
 * would be a fallback asserting something (lesson 13): every row nobody
 * classified would read as a real agency, which is precisely the defect the
 * column exists to remove. `default true` fails the other way and quieter — a
 * real client nobody declared drops out of the business's own numbers.
 *
 * So the database will not answer for anybody, and this file is where the
 * answer comes from instead.
 *
 * 🔴 THE ORDER, AND IT IS 0036'S LESSON FOR THE SECOND TIME.
 *
 *   1. this file ships, and onboarding writes the column
 *   2. `0037` adds the column nullable and classifies the two known rehearsals
 *   3. `0038` proves no row is null, then sets NOT NULL
 *
 * The code deploy is a PRECONDITION of the migration, not a companion to it.
 * Running 0038 before onboarding writes the column breaks client creation: NOT
 * NULL with no default rejects every insert that does not name it, and the
 * violation lands on the operator halfway through onboarding a real agency.
 *
 * `db/tests/proofs.json` names THIS PATH as 0038's `runnable_when`, so the
 * suite goes red the day this file appears and says the proof is now runnable.
 * That is deliberate: the alarm rings when the precondition is met, rather
 * than waiting for somebody to remember.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔒 NOTHING IS PRE-SELECTED (§4.6)
 * ─────────────────────────────────────────────────────────────────────────────
 * A pre-filled field collects a click, not a decision. If either option were
 * checked when the form loads, the common path — fill the visible fields,
 * submit — would record an answer nobody gave, and it would be indistinguishable
 * from one somebody did give. The column would have a default again, written in
 * HTML instead of SQL.
 *
 * So the unanswered state is its own value, it is a validation error, and it
 * can never reach the database.
 */

/** What a person can say. There is no third answer and no "unknown". */
export type RehearsalAnswer = 'rehearsal' | 'real'

/**
 * 🔒 Null means UNANSWERED, and is never a synonym for either choice.
 *
 * Returning `false` for an unparseable value is the whole defect in one line:
 * a typo in a form field would silently declare a test client to be a real
 * agency, and The Month would count its leads as the business's history.
 */
export function parseRehearsal(raw: unknown): RehearsalAnswer | null {
  const v = typeof raw === 'string' ? raw.trim() : ''
  if (v === 'rehearsal') return 'rehearsal'
  if (v === 'real') return 'real'
  return null
}

/**
 * The column value. Total over the answer, so there is no branch here that can
 * invent one — the only way to get a boolean is to have an answer.
 */
export function rehearsalToColumn(answer: RehearsalAnswer): boolean {
  return answer === 'rehearsal'
}

/**
 * What the form says when nobody chose.
 *
 * It explains the consequence rather than scolding, because the consequence is
 * the reason the question exists and it is not obvious: the difference shows up
 * months later, in a figure on a different screen.
 */
export const REHEARSAL_UNANSWERED =
  'Say whether this is a rehearsal or a real agency. There is no default, on purpose: ' +
  'a rehearsal client is kept out of the business’s own figures, and a wrong answer here ' +
  'is only visible months later as a revenue or a first that never happened.'

/** The two options, with what each one means where it matters. */
export const REHEARSAL_OPTIONS: { value: RehearsalAnswer; label: string; means: string }[] = [
  {
    value: 'real',
    label: 'A real agency',
    means: 'counts towards revenue, the firsts, and everything The Month reports',
  },
  {
    value: 'rehearsal',
    label: 'A rehearsal, demo or test',
    means: 'works exactly the same, and is kept out of the business’s own figures',
  },
]
