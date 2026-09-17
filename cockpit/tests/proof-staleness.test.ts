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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Proof = {
  id: string
  what: string
  how: string
  watches: string[]
  hashes: Record<string, string>
  last_proved: string | null
  proved_by: string | null
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
  }
})
