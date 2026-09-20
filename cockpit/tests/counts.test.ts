import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { badge, headline, type Counts } from '../src/lib/counts'

/*
 * A count that disagrees with the page it links to. docs/cockpit-build-plan.md
 * §1.1, and the third appearance of a defect that has now cost two design
 * rounds.
 *
 * Two kinds of check here, and the second is the one that lasts:
 *   - the formatters agree with each other for every shape of input;
 *   - nothing outside counts.ts computes a count for the frame.
 */

const at = '2026-09-20T09:20:05.000Z'
const C = (waiting: number, handledElsewhere = 0, capped = false): Counts => ({
  waiting,
  handledElsewhere,
  capped,
  at,
})

test('the badge and the headline never disagree about the number', () => {
  for (const n of [0, 1, 2, 7, 99, 100, 412]) {
    for (const capped of [false, true]) {
      const b = badge(C(n, 0, capped))
      const h = headline(C(n, 0, capped))
      if (n === 0) {
        assert.equal(b, '', 'zero shows no badge rather than a badge reading 0')
        assert.equal(h, 'Nobody is waiting')
        continue
      }
      // The badge is the number, possibly with a +. The headline must contain
      // exactly that string — not a differently formatted version of it.
      assert.ok(h.includes(b), `badge "${b}" does not appear in headline "${h}"`)
    }
  }
})

test('🔒 a capped read renders 100+ in both places, never a silent 100', () => {
  assert.equal(badge(C(100, 0, true)), '100+')
  assert.match(headline(C(100, 0, true)), /^100\+ waiting$/)
})

test('🔴 handledElsewhere is not counted as waiting', () => {
  // The lead somebody already replied to is neither open nor closed. Counting
  // it as waiting sends the operator to a handled lead; this is the number
  // that made the sidebar say 4 beside a page saying 5.
  const c = C(5, 1)
  assert.equal(badge(c), '5')
  assert.match(headline(c), /^5 waiting$/)
  assert.equal(c.handledElsewhere, 1, 'and it is still carried, rather than dropped')
})

test('🔴 a failed read is not zero', () => {
  assert.equal(badge(null), '—')
  assert.equal(headline(null), 'The queue could not be read')
  assert.notEqual(headline(null), headline(C(0)), 'a failed read must not read as a resting queue')
})

test('every figure carries the moment it was read', () => {
  assert.equal(C(5).at, at)
})

// ── the structural half ─────────────────────────────────────────────────────

const SRC = new URL('../src/', import.meta.url).pathname

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(tsx|ts)$/.test(name)) out.push(full)
  }
  return out
}

/*
 * THE RATCHET, same shape as the palette's.
 *
 * `rows.length` passed as a count to the frame is the pattern that produced
 * the fragility this module exists to remove. These are the files that still
 * do it; each is removed as its screen is rebuilt, and a NEW one fails.
 */
const LEGACY_COUNTERS: Record<string, string> = {
  'app/queue/page.tsx': 'C3 — replaced by the escalations rebuild, which reads counts.ts',
}

test('🔴 nothing outside counts.ts computes a count for the frame', () => {
  const offenders: string[] = []
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file)
    if (rel === 'lib/counts.ts' || rel in LEGACY_COUNTERS) continue
    const text = readFileSync(file, 'utf8')
    // 🔒 SCOPED TO THE FRAME BOUNDARY, deliberately.
    //
    // The first version flagged any `count={x.length}` and caught two counts
    // that are honest: the import batch's own created_lead_ids, and the
    // anomaly expander's hidden array. In both, the array IS the source and
    // the number appears once. A detector with false positives gets
    // suppressed rather than obeyed — the same argument as the colour
    // detector's refusal to match the word "red" in prose.
    //
    // What is actually being prevented is a count computed at the call site
    // and handed to the FRAME, where it sits beside a page that counted the
    // same thing separately. So: the frame's own props only.
    const bad = [...text.matchAll(/(?:openCount|counts|badge)=\{[^}]*\.length[^}]*\}/g)].map((m) => m[0])
    if (bad.length) offenders.push(`${rel} → ${bad.join(' , ')}`)
  }
  assert.deepEqual(
    offenders,
    [],
    'A count was computed where it was rendered:\n' +
      offenders.join('\n') +
      '\nRead it once with readCounts() and pass it down. Two code paths that agree today ' +
      'are two code paths that will disagree the first time one of them learns something.',
  )
})

test('the control: the counter detector flags the pattern it exists to find', () => {
  const RE = /(?:openCount|counts|badge)=\{[^}]*\.length[^}]*\}/g
  const sample = '<Shell active="queue" openCount={rows.length} email={e}>'
  assert.equal([...sample.matchAll(RE)].length, 1, 'the pattern this exists to find')
  const fine = '<Shell active="queue" openCount={counts} email={e}>'
  assert.equal([...fine.matchAll(RE)].length, 0, 'a count read once and passed down is the fix, not a finding')
  const honest = '<Expander count={hidden.length} />'
  assert.equal([...honest.matchAll(RE)].length, 0, 'a local count of the array it describes is not a second code path')
})
