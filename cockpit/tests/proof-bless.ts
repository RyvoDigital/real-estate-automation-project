/*
 * Record that an out-of-suite proof has been run. `npm run proof:bless`.
 *
 * Run the proof FIRST. This writes down that you did; it cannot check.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'

const REPO = resolve(new URL('../..', import.meta.url).pathname)
const BOOK = resolve(REPO, 'db/tests/proofs.json')
const book = JSON.parse(readFileSync(BOOK, 'utf8'))
const only = process.argv[2]

/**
 * An id, or an explicit --all. Never a bare `npm run proof:bless`.
 *
 * The first version blessed every proof when called with no argument, which is
 * the dangerous default: if one proof's file had changed and had NOT been
 * re-run, a blanket bless would have silently recorded it as proved — the exact
 * failure this whole mechanism exists to prevent, performed by the mechanism.
 *
 * Blessing is a claim that a human ran something. A claim made about four
 * things when one was intended is three lies, and the shortest command should
 * not be the one that tells them.
 */
if (!only) {
  console.error(
    'proof:bless needs an id, or --all if you really did run them all.\n\n' +
    'Available:\n' +
    (JSON.parse(readFileSync(BOOK, 'utf8')).proofs as { id: string }[])
      .map((p) => `  ${p.id}`).join('\n') +
    '\n\n  npm run proof:bless 0018-campaign-runs-constraints\n' +
    '\n"All of them" is almost never true: blessing a proof you did not run is\n' +
    'lying to the next person, who will be you.',
  )
  process.exit(2)
}

let who = 'unknown'
try { who = execSync('git config user.name', { encoding: 'utf8' }).trim() } catch {}

/**
 * An unknown id is an ERROR, not a no-op.
 *
 * The first version filtered on the id and blessed whatever matched — so a typo
 * matched nothing, printed nothing, and exited zero. It silently did nothing
 * while looking exactly like a successful run, which is §5c performed BY THE
 * TOOL BUILT TO PREVENT IT: the operator believed a proof was blessed, the
 * staleness alarm stayed red, and the two facts would have been reconciled by
 * someone eventually distrusting the alarm.
 *
 * Caught by an operator typing `0020-message-templates` instead of
 * `0020-templates-and-sends-fk`.
 */
const ids = (book.proofs as { id: string }[]).map((p) => p.id)
if (only !== '--all' && !ids.includes(only)) {
  console.error(
    `proof:bless: no proof with id "${only}".\n\nThe ids that exist:\n` +
    ids.map((i) => `  ${i}`).join('\n') +
    '\n\nNothing was blessed. A typo that blesses nothing and exits zero is how a\n' +
    'proof stays unrun while everybody believes it was run.',
  )
  process.exit(2)
}

let blessed = 0
for (const p of book.proofs) {
  if (only !== '--all' && p.id !== only) continue
  blessed += 1
  for (const f of p.watches) {
    p.hashes[f] = createHash('sha256').update(readFileSync(resolve(REPO, f))).digest('hex')
  }
  p.last_proved = new Date().toISOString().slice(0, 10)
  p.proved_by = who
  console.log(`blessed ${p.id} (${p.watches.length} file(s)) — ${p.last_proved}, ${who}`)
}

if (blessed === 0) {
  console.error('proof:bless: nothing matched, which should be unreachable. Not writing.')
  process.exit(2)
}
writeFileSync(BOOK, JSON.stringify(book, null, 2) + '\n')
