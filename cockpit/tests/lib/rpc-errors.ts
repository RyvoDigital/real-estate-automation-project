/**
 * Telling a broken rule from a broken wire.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ON 18 SEPTEMBER 2026, `RULE 1: an objection is permanent` WENT RED ONCE  │
 * │ AND NEVER AGAIN.                                                        │
 * │                                                                         │
 * │ Tests that call the database over the network report a dropped          │
 * │ connection under the name of whatever rule they were checking. That     │
 * │ one is the most important rule in the codebase, and somebody reading    │
 * │ the line will believe consent handling broke.                           │
 * │                                                                         │
 * │ The cause of that red was never confirmed — which is the argument,      │
 * │ not a weakness in it. A failure whose cause cannot be read off the      │
 * │ output costs an hour before it costs nothing.                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Nothing here suppresses a failure. The suite goes red either way; what
 * changes is whether the red says what happened.
 */

export class TransportFailure extends Error {}

export const NOT_A_RULE_FAILURE =
  '⚠️ THIS IS NOT A RULE FAILURE.\n' +
  'The call never reached the database, so the rule below was NEVER EVALUATED. ' +
  'Nothing here says anything about whether the rule holds.\n' +
  'Transport error: '

/**
 * ⚠️ THE DISCRIMINATOR IS THE PRESENCE OF A CODE, AND THAT IS A CHOICE.
 *
 * PostgREST and Postgres answer with a `code` — 42883 for a missing function,
 * 42501 for a privilege, 23514 for a constraint. A dropped connection, a DNS
 * failure and a TLS error carry a message and no code, because nothing on the
 * far side ever formed a reply.
 *
 * So: no code means the call did not arrive, and a rule that was not reached
 * was not tested. A code means the database answered, and an answer — even a
 * refusal — is about the function.
 *
 * The failure mode of getting this wrong is worth naming: a transport error
 * that DID carry a code would be reported as a function problem, which sends
 * somebody to read SQL. That is a wasted hour. The other direction — a real
 * function fault reported as transport — would send somebody to check the
 * network, and they would come back and read the SQL anyway, because the test
 * stays red. Neither hides a defect, and the cheaper mistake is the one this
 * rule makes.
 */
export function classifyRpcError(
  fn: string,
  error: { code?: string | null; message: string },
): Error {
  if (!error.code) return new TransportFailure(NOT_A_RULE_FAILURE + error.message)
  return new Error(
    `${fn} rejected the call (${error.code}): ${error.message}\n` +
    'This IS about the function: it answered, so it exists and refused the arguments — or it ' +
    'is missing and the migration that creates it has not been applied.',
  )
}
