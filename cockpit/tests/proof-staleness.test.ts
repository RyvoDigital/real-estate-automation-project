/*
 * Proofs that cannot run here must not be able to go quietly stale.
 *
 * Some checks need a real Postgres session -- a transaction, rolled back --
 * which PostgREST cannot give us, so they are run by hand in the SQL editor.
 * A check that depends on remembering is not a control (rule 13). This is the
 * cheapest thing that turns it into one: record a hash of the files each proof
 * covers, and fail the suite when they change and the proof has not been
 * re-blessed.
 *
 * WHAT THIS PROVES, STATED HONESTLY
 * Nothing about the database. It cannot run the SQL and it cannot know whether
 * you really ran it -- `npm run proof:bless` is one command and an impatient
 * person can type it without running anything. What it removes is SILENCE: the
 * view can no longer change while its proof sits untouched and nobody is told.
 * A stale alarm is not a proof; it is the difference between a note and a
 * control, and it is worth exactly that much.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Proof = {
  id: string
  what: string
  how: string
  watches: string[]
  hashes: Record<string, string>
  last_proved: string | null
  proved_by: string | null
  /**
   * A proof that CANNOT BE RUN YET, with the thing whose arrival unblocks it.
   *
   * Some rules are not constraints and cannot be proved by a rolled-back
   * transaction — they live in a caller that does not exist. Leaving them out
   * of the book means nobody wrote them down; putting them in with no hash
   * fails the suite forever, and the fix somebody reaches for is to bless a
   * proof they never ran.
   *
   * So a blocked proof is recorded, exempt from staleness, and carries
   * `runnable_when`: a path that does not exist today. THE MOMENT IT DOES, the
   * test below fails and says this proof is now runnable and has never been
   * run. That is the difference between a note and a control: an obligation
   * recorded and never discharged is worse than one nobody wrote down, because
   * the record proves you knew.
   */
  blocked?: { reason: string; runnable_when: string }
  /**
   * The obligation was DISCHARGED, and by what.
   *
   * A blocked proof that becomes provable in the suite has served its purpose,
   * and deleting it would lose the fact that the question was ever asked — the
   * next person sees no entry and cannot tell "nobody thought of it" from
   * "somebody thought of it and dealt with it".
   *
   * So it stays, pointing at the test that replaced it. `by` must exist: delete
   * that test and the entry stops being discharged, which is the whole point —
   * an obligation cannot be closed by removing the thing that closes it.
   */
  discharged?: { by: string[]; on: string; note: string }
}

const REPO = resolve(new URL('../..', import.meta.url).pathname)
const BOOK = resolve(REPO, 'db/tests/proofs.json')
const book = JSON.parse(readFileSync(BOOK, 'utf8')) as { proofs: Proof[] }

export function sha(path: string): string {
  return createHash('sha256').update(readFileSync(resolve(REPO, path))).digest('hex')
}

test('every out-of-suite proof covers files that have not moved since it was run', () => {
  const stale: string[] = []

  for (const p of book.proofs) {
    if (p.blocked || p.discharged) continue
    for (const file of p.watches) {
      const now = sha(file)
      const recorded = p.hashes[file]
      if (recorded === now) continue
      stale.push(
        recorded === undefined
          ? `${p.id}: ${file} has never been blessed — the proof has not been run against it`
          : `${p.id}: ${file} has changed since the proof was last run` +
            (p.last_proved ? ` (${p.last_proved})` : ''),
      )
    }
  }

  assert.deepEqual(
    stale, [],
    'A proof that runs outside this suite is out of date:\n\n' +
      stale.map((s) => `  • ${s}`).join('\n') +
      '\n\n' + book.proofs.map((p) => `  ${p.id}\n    ${p.how}`).join('\n') +
      '\n\n  Then: npm run proof:bless\n' +
      '  Blessing without running it is lying to the next person, who will be you.\n',
  )
})

test('🔴 a proof nobody has run is an alarm, whatever its hashes say', () => {
  /*
   * ⚠️ FOUND BY GETTING IT WRONG, 19 September 2026.
   *
   * Registering `0033-closes` I pre-filled its hash from the file on disk. The
   * staleness check above compares recorded to current, they matched, and the
   * suite went green over a proof with `last_proved: null` — an obligation
   * recorded, never run, and never mentioned again. Which is the exact silence
   * the proof book exists to break.
   *
   * The hash answers "has the file moved since it was proved". It cannot answer
   * "was it ever proved", and reading one as the other is how a registration
   * becomes a receipt. So that question gets asked separately.
   *
   * A proof is exempt only by being BLOCKED — recorded, with a reason and a
   * trigger — which is a different claim from silence.
   */
  const unrun = book.proofs
    .filter((p) => !p.blocked && !p.discharged && !p.last_proved)
    .map((p) => `${p.id}\n    ${p.how}`)

  assert.deepEqual(
    unrun, [],
    'These proofs are recorded and have never been run:\n\n' +
      unrun.map((s) => `  • ${s}`).join('\n') +
      '\n\n  Run it, then: npm run proof:bless <id>\n' +
      '  If it cannot be run yet, mark it `blocked` with a reason and a trigger.\n' +
      '  Pre-filling a hash is not a proof — it is a claim with the evidence removed.\n',
  )
})

test('a blocked proof becomes an alarm the moment the thing it needs exists', () => {
  const arrived: string[] = []
  for (const p of book.proofs) {
    if (!p.blocked || p.discharged) continue
    if (!existsSync(resolve(REPO, p.blocked.runnable_when))) continue
    arrived.push(
      `${p.id}: ${p.blocked.runnable_when} now exists, so this proof is runnable ` +
      `and has never been run.\n      ${p.how}`,
    )
  }
  assert.deepEqual(
    arrived, [],
    'A proof that was waiting for something is no longer waiting:\n\n' +
      arrived.map((s) => `  • ${s}`).join('\n') +
      '\n\n  Run it, then: npm run proof:bless <id>\n' +
      '  If it genuinely still cannot run, say why in `blocked.reason` and point\n' +
      '  `runnable_when` at whatever it is actually waiting for. Do not delete it.\n',
  )
})

test('the proof book itself is well formed, so a typo cannot silently watch nothing', () => {
  // A `watches` list that is empty, or names a file that does not exist, would
  // make this whole guard pass while covering nothing at all -- §5c's vacuous
  // success in miniature.
  assert.ok(book.proofs.length > 0, 'proofs.json lists no proofs')
  for (const p of book.proofs) {
    assert.ok(p.watches.length > 0, `${p.id} watches no files`)
    for (const f of p.watches) {
      assert.doesNotThrow(() => sha(f), `${p.id} watches ${f}, which does not exist`)
    }
    assert.ok(p.how?.trim(), `${p.id} does not say how to run the proof`)
    if (p.discharged) {
      // A discharge that names nothing, or names a file that has since been
      // deleted, is an obligation closed by removing what closed it.
      assert.ok(p.discharged.by.length > 0, `${p.id} is discharged by nothing`)
      for (const f of p.discharged.by) {
        assert.ok(
          existsSync(resolve(REPO, f)),
          `${p.id} says it was discharged by ${f}, which no longer exists. ` +
            'The obligation is open again.',
        )
      }
      assert.ok(p.discharged.note?.trim(), `${p.id} does not say what discharged it`)
      continue
    }
    if (p.blocked) {
      // A blocked proof with no trigger is a silence with extra steps.
      assert.ok(p.blocked.reason?.trim(), `${p.id} is blocked and does not say why`)
      assert.ok(
        p.blocked.runnable_when?.trim(),
        `${p.id} is blocked and does not say what would unblock it`,
      )
      assert.equal(
        p.last_proved, null,
        `${p.id} is marked blocked but claims to have been proved on ${p.last_proved}`,
      )
    }
  }
})
