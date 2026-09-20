import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * A PROOF THAT TESTS A TRANSCRIPTION PROVES THINGS ABOUT THE TRANSCRIPTION.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `db/tests/*.test.sql` cannot run a migration's body directly — it has to set
 * up a case, run the body WITHOUT the file's begin/commit, and roll back. So
 * the body gets copied into the proof, and from that moment there are two
 * copies of the thing under test.
 *
 * 🔴 THE FAILURE IS SILENT AND IT INVERTS THE PROOF'S MEANING. If the proof's
 * copy of a matcher drifts from the migration's, all three cases pass, the
 * proof is blessed, and the migration then does something nobody tested. The
 * green result is not merely uninformative — it is evidence FOR a claim that
 * was never checked.
 *
 * 0037 is where this bites hardest, because its matchers ARE its logic: two
 * literals deciding which rows get classified. A proof matching on the right
 * phone number while the migration matches on a typo'd one would pass case 3
 * happily and leave a row unclassified on the day it ran.
 *
 * `proof-staleness.test.ts` asks a different question — has the migration
 * MOVED since it was proved. It cannot see this, because both files can sit
 * unchanged for months while disagreeing with each other from the start.
 */

const ROOT = join(import.meta.dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8')

/** Every single-quoted literal in a file, which is what a matcher is made of. */
function literals(sql: string): Set<string> {
  return new Set([...sql.matchAll(/'([^']*)'/g)].map((m) => m[1]))
}

test('🔴 0037: every matcher the proof tests is a matcher the migration uses', () => {
  const migration = read('db/migrations/0037_clients_rehearsal.sql')
  const proof = read('db/tests/0037_clients_rehearsal.test.sql')

  /*
   * The two literals that decide which rows are classified. They are named
   * here rather than discovered, because the point is to fail when one of them
   * changes in only one file — and a check that derived both lists from the
   * files would agree with itself no matter what they said.
   */
  const MATCHERS = [
    '20e5c7ec-eaa6-4f5d-bf38-49e9ab24fc12', // ZZ TEST — Cascais Demo, by id
    '+14155238886', // Ryvo Test Client, by the Twilio sandbox number
  ]

  for (const m of MATCHERS) {
    assert.ok(migration.includes(m), `0037 no longer matches on ${m} — is the proof still testing the right rows?`)
    assert.ok(proof.includes(m), `the proof does not exercise ${m}, which the migration classifies on`)
  }

  // And nothing in the migration's update clause matches on a literal the
  // proof has never seen. This is the direction that actually drifts: somebody
  // adds a third rehearsal row to the migration and not to the proof.
  /*
   * 🔴 Anchored on the STATEMENT, not on the phrase. The first
   * `update public.clients` in the file sits in the header prose, explaining
   * how to classify a row by hand — so slicing from it swept the whole comment
   * block in and the check failed on the column comment's own English. Found
   * by this test on its first run, which is the argument for writing the
   * control before believing the green.
   */
  const start = migration.indexOf('update public.clients\n   set rehearsal = true')
  assert.notEqual(start, -1, 'the migration no longer has the classifying update in the shape this expects')
  const clause = migration.slice(start, migration.indexOf('do $$', start))
  for (const lit of literals(clause)) {
    assert.ok(
      proof.includes(lit),
      `0037 classifies on '${lit}' and the proof never mentions it — the proof would pass without testing it`,
    )
  }
})

test('🔴 0037: the proof runs all three cases, and case 3 asserts NO refusal', () => {
  const proof = read('db/tests/0037_clients_rehearsal.test.sql')

  // Three transactions, three rollbacks. A proof that forgot a rollback would
  // leave the column behind on a real database.
  assert.equal((proof.match(/^begin;$/gm) ?? []).length, 3, 'the proof does not run exactly three cases')
  assert.equal((proof.match(/^rollback;$/gm) ?? []).length, 3, 'a case does not roll itself back')
  assert.ok(!/^commit;$/m.test(proof), '🔴 the proof COMMITS — it would apply the column for real')

  // Case 3 is the one that catches a guard firing on the resting state, which
  // is the mistake that was actually made here and in 0036.
  assert.match(proof, /CASE 3/, 'the proof has no resting-state case')
  assert.match(proof, /MUST NOT BE REFUSED/, 'case 3 does not say what it is asserting')
})

test('the control: the transcription detector can see a drifted matcher', () => {
  /*
   * Without this, "every matcher appears in both" and "the loop ran zero
   * times" are the same green — which is lesson 1n exactly.
   */
  const migration = read('db/migrations/0037_clients_rehearsal.sql')
  const drifted = read('db/tests/0037_clients_rehearsal.test.sql').replaceAll('+14155238886', '+14155238887')
  assert.notEqual(drifted, read('db/tests/0037_clients_rehearsal.test.sql'), 'the sabotage did not apply')

  assert.ok(migration.includes('+14155238886'), 'the migration no longer uses the sandbox number')
  assert.ok(!drifted.includes('+14155238886'), 'the detector would not notice the proof had drifted')
})
