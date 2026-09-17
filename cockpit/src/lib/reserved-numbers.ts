/**
 * The reserved test range, and the refusal that makes it safe.
 *
 * +351 900 000 xxx exists because the consent ledger is append-only: a test
 * that writes a real objection cannot clean up after itself, and rollback needs
 * a Postgres session PostgREST does not give us. So the write path is proved
 * against numbers that are permanently reserved rather than against a real
 * client's contacts.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ "TREATED AS SYNTHETIC EVERYWHERE" IS A RULE THAT LIVES IN PEOPLE'S      │
 * │ HEADS. THIS IS THE REFUSAL THAT REPLACES IT.                            │
 * │                                                                         │
 * │ The send gate refuses this range outright, as its own check, before any  │
 * │ consent or jurisdiction question is asked. Not a convention — a          │
 * │ refusal. The day a real number falls inside it, or a test range leaks    │
 * │ into an import, the machinery would otherwise do exactly what it was     │
 * │ told to do.                                                             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * RECORDING IS ALLOWED; SENDING IS NOT. The tests must be able to write
 * objections, claims and consents for these numbers — that is the whole point
 * of them. It is the outbound path, and only the outbound path, that refuses.
 *
 * WHY 900 000 xxx. Portuguese mobiles are 91/92/93/96; the 900 series is
 * service and premium-rate numbering in ANACOM's plan, so no individual's
 * mobile — and therefore no WhatsApp account — will ever be inside it. A
 * reserved range carved out of a real mobile block would eventually be assigned
 * to somebody, and the gate would then silently refuse to contact a real
 * person.
 *
 * NOTE, because an earlier version of this comment said otherwise:
 * libphonenumber considers +351900000001 VALID and Portuguese. Checked, not
 * assumed. So the protection here is the numbering plan plus the gate's
 * refusal, NOT the resolver rejecting it — nothing downstream may be written as
 * though these numbers fail to parse.
 *
 * IF THE GATE MOVES TO n8n (the piece-4 decision), THIS MOVES TO src/ AS
 * dependency-free JS. It does not get copied — two definitions of which numbers
 * are fake is precisely the kind of pair that drifts, and the stale one keeps
 * answering confidently (lesson 15).
 */

/** Matches +351900000000 … +351900000999. */
export const RESERVED_TEST_PATTERN = /^\+351900000\d{3}$/

export const RESERVED_TEST_REASON =
  'reserved test number (+351900000xxx) — fixtures for the append-only ledger, never messaged'

export function isReservedTestNumber(phone: string | null | undefined): boolean {
  return RESERVED_TEST_PATTERN.test(String(phone ?? '').trim())
}

/**
 * Stable fixtures, so the ledger gains a BOUNDED number of rows however often
 * the suite runs. Every write against these is write-once: a test checks
 * whether the row is there before adding it.
 *
 * `objectedThenConsented` holds an objection followed by consents, which is the
 * end-to-end shape of rule 1. It carries three rows rather than two because the
 * first version of suppression.test.ts appended a consent on every run — a test
 * that passed on a virgin database and failed on the run after, caught by
 * running it twice. The rows cannot be deleted, so the fixture was named after
 * what it actually contains instead.
 */
export const RESERVED_FIXTURES = {
  /** Objection only. Nothing else may ever be written here. */
  objected: '+351900000005',
  /** Objection, then consents appended after it. Rule 1, end to end. */
  objectedThenConsented: '+351900000001',
  consented: '+351900000002',
  claimed: '+351900000003',
  /** Deliberately never written to: proves an unknown contact has NO row. */
  untouched: '+351900000900',
} as const
