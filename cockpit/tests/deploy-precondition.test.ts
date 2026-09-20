import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * A MIGRATION'S DEPLOY PRECONDITION IS CHECKED, NOT REMEMBERED.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 0036's lesson — the code deploy is a precondition of the migration, not a
 * companion to it — has now been got wrong TWICE, by the person who wrote it
 * down both times. On both occasions the ordering held anyway, and on both
 * occasions the step skipped was the one that would have caught it.
 *
 * 🔴 A rule remembered correctly and applied wrongly is not a rule. It is a
 * habit, and a habit fails silently on the morning somebody is in a hurry.
 *
 * So `proof:bless` REFUSES a proof carrying `deploy_precondition` unless
 * somebody names the commit they saw serving — and then checks that claim
 * against git, which catches the two ways it goes wrong without anybody lying:
 * a sha that does not contain the required file, and a sha never pushed.
 *
 * It cannot see Vercel, and does not pretend to. It makes the observation
 * EXPLICIT and then falsifies what it can, which is the most an offline script
 * honestly can do — and far more than a sentence in a header achieved twice.
 */

const REPO = join(import.meta.dirname, '..', '..')
const BOOK = JSON.parse(readFileSync(join(REPO, 'db/tests/proofs.json'), 'utf8')) as {
  proofs: {
    id: string
    last_proved: string | null
    deploy_precondition?: { path: string; breaks: string; attested?: { sha: string } }
  }[]
}

/** Runs the real script and returns its exit code and output. */
function bless(args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync('npx', ['tsx', 'tests/proof-bless.ts', ...args], {
      cwd: join(import.meta.dirname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out }
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string }
    return { code: err.status, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

const WITH_PRECONDITION = BOOK.proofs.filter((p) => p.deploy_precondition && !p.deploy_precondition.attested)

test('every deploy precondition names a real path and what breaks', () => {
  const all = BOOK.proofs.filter((p) => p.deploy_precondition)
  assert.ok(all.length > 0, 'no proof carries a deploy precondition — has the field been dropped?')
  for (const p of all) {
    const d = p.deploy_precondition!
    assert.ok(d.path.length > 10, `${p.id}: no path`)
    // 🔒 It says what BREAKS, not that an order exists. "Do this first" is the
    // sentence that was already in two headers and got ignored twice.
    assert.ok(d.breaks.length > 40, `${p.id}: does not say what breaks if the migration lands first`)
  }
})

test('🔴 blessing without naming a deployed commit is REFUSED', () => {
  if (WITH_PRECONDITION.length === 0) return // all attested; nothing left to refuse
  const p = WITH_PRECONDITION[0]
  const { code, out } = bless([p.id])
  assert.equal(code, 3, `bless exited ${code} — it did not refuse`)
  assert.match(out, /DEPLOY PRECONDITION/)
  assert.match(out, /--deployed=/, 'the refusal does not say how to satisfy it')
  assert.match(out, new RegExp(p.deploy_precondition!.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('🔴 a commit that does not contain the required file is REFUSED', () => {
  /*
   * The actual failure: a deploy that predates the code the migration depends
   * on. `b34ef69` is the gated-ledger commit, before rehearsal.ts existed.
   */
  if (WITH_PRECONDITION.length === 0) return
  const p = WITH_PRECONDITION[0]
  const { code, out } = bless([p.id, '--deployed=b34ef69'])
  assert.equal(code, 3, 'a deploy predating the precondition was accepted')
  assert.match(out, /does NOT contain/)
  assert.match(out, /Nothing has been blessed/)
})

test('the control: a rubbish sha is refused as a rubbish sha, not as a missing file', () => {
  // Two different refusals. If both said the same thing, the check would be
  // passing for a reason other than the one it claims.
  if (WITH_PRECONDITION.length === 0) return
  const p = WITH_PRECONDITION[0]
  const { code, out } = bless([p.id, '--deployed=deadbeef'])
  assert.equal(code, 3)
  assert.match(out, /is not a commit in this repository/)
  assert.doesNotMatch(out, /does NOT contain/)
})

test('🔴 nothing was blessed by any of the above', () => {
  // The refusals must not have written to the book on their way out.
  const now = JSON.parse(readFileSync(join(REPO, 'db/tests/proofs.json'), 'utf8')) as typeof BOOK
  for (const p of WITH_PRECONDITION) {
    const after = now.proofs.find((x) => x.id === p.id)!
    assert.equal(after.last_proved, p.last_proved, `${p.id} was blessed by a test that was meant to be refused`)
    assert.equal(after.deploy_precondition?.attested, undefined, `${p.id} acquired an attestation from a refusal`)
  }
})
