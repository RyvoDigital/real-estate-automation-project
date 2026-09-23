/*
 * 🔴 NO REMNANT OF THE OLD COCKPIT, AT ANY MOMENT — including the moment
 * between one screen and the next (23 Sep 2026).
 *
 * /onboarding was rebuilt on the Frame and kept its old loading.tsx, which drew
 * SkeletonShell: the Queue / Leads / Report tab bar, plus a five-step wizard
 * that no longer exists. Next paints a loading boundary over the whole viewport
 * when the shared layout is the root, so every navigation into onboarding
 * flashed the retired cockpit first.
 *
 * Nothing caught it, because every other test reads PAGES. A loading state is a
 * screen the operator sees and no test had ever looked at one.
 *
 * This pairs each loading.tsx with the chrome its own pages render. A Frame
 * route must not have an old-chrome fallback; an old-direction route may, and
 * the ledger below says which those are and when they go.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { pageFile } from './lib/routes'

const APP = new URL('../src/app/', import.meta.url).pathname

/**
 * Loading states that legitimately draw the OLD chrome, because the pages they
 * cover still render it. Each goes when its route does.
 */
const OLD_BY_DESIGN: Record<string, string> = {
  'queue/loading.tsx': 'the old escalation path, kept deliberately (route map §7)',
  'leads/loading.tsx': 'the old lead list, replaced by /c/<client>/contacts but not retired',
  'leads/[id]/loading.tsx': 'the old lead record, still the hand-back path from the contact record',
  'report/loading.tsx': 'the old report, kept until the client-level one is the only one',
  'import/loading.tsx': 'the only working import flow, kept deliberately (route map §7)',
  'import/[id]/loading.tsx': 'the batch record inside that same flow',
}

/**
 * 🔒 READ THE CODE, NEVER THE PROSE. Three guards in one day were tripped by
 * their own comments — a file that explains what it must NOT do contains those
 * words by design. Every source check here strips comments first.
 */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const files = walk(APP)
const loadings = files.filter((f) => f.endsWith('loading.tsx'))
/** Which chrome the pages under a directory render: the real answer for that route. */
const chromeUnder = (dir: string): 'frame' | 'shell' | 'none' => {
  const pages = files.filter((f) => f.startsWith(dir + '/') && f.endsWith('page.tsx'))
  const src = code(pages.map((p) => readFileSync(p, 'utf8')).join('\n'))
  if (/<Frame\b/.test(src)) return 'frame'
  if (/<Shell\b/.test(src)) return 'shell'
  return 'none'
}

test('🔴 no loading state on a Frame route may draw the old chrome', () => {
  assert.ok(loadings.length > 5, `only ${loadings.length} loading states found — the scan is broken`)
  const offences: string[] = []
  for (const f of loadings) {
    const rel = relative(APP, f)
    const src = code(readFileSync(f, 'utf8'))
    // The OLD module, exactly: FrameSkeleton is a different file and a different chrome.
    const drawsOld = /from '@\/components\/Skeleton'|from '@\/components\/Shell'|\bSkeletonShell\b/.test(src)
    if (!drawsOld) continue
    if (rel in OLD_BY_DESIGN) continue
    const chrome = chromeUnder(dirname(f))
    offences.push(`${rel} draws the OLD chrome over pages that render ${chrome === 'frame' ? 'the FRAME' : chrome}`)
  }
  assert.deepEqual(offences, [], `a navigation into these routes flashes the retired cockpit:\n  ${offences.join('\n  ')}`)
})

test('🔒 the ledger is honest: every exemption is a route that really is old', () => {
  for (const [rel, why] of Object.entries(OLD_BY_DESIGN)) {
    const f = join(APP, rel)
    assert.ok(files.includes(f), `OLD_BY_DESIGN names ${rel}, which no longer exists — remove it`)
    assert.equal(chromeUnder(dirname(f)), 'shell', `${rel} is exempt as an old route, but its pages no longer render the old Shell`)
    assert.ok(why.length > 20, `${rel} needs a reason, not a word`)
  }
})

test('🔒 onboarding — the route this was found on — draws the frame, and reads nothing to do it', () => {
  // 🔒 By ROUTE, not by shelf: /onboarding moved into the (operator) route
  // group on 23 Sep 2026 without its URL changing. See lib/routes.ts pageFile.
  const loading = code(readFileSync(pageFile('/onboarding', 'loading'), 'utf8'))
  assert.match(loading, /FrameSkeleton/)
  assert.doesNotMatch(loading, /\bSkeletonShell\b|from '@\/components\/(Skeleton|Shell)'/)

  const skeleton = code(readFileSync(new URL('../src/components/FrameSkeleton.tsx', import.meta.url), 'utf8'))
  // 🔒 It reads nothing: a loading state that awaited would be the thing it covers for.
  assert.doesNotMatch(skeleton, /await |async |readCounts|requireOperator|admin\(\)/)
  // No counts and no switcher: both would need a read.
  assert.doesNotMatch(skeleton, /ClientSwitcher|badge\(|counts/)
})

test('🔴 THE SKELETON\'S NAV IS THE FRAME\'S NAV, generated — so it cannot drift', () => {
  /*
   * The first screenshot of this skeleton was taken before /clients existed and
   * showed five destinations where the frame now has six. It was stale, not
   * wrong — but "the skeleton lists the right screens" is only true by accident
   * unless the list comes from ONE place. It does: frameSide('operator'), the
   * same call the Frame makes.
   *
   * 🔒 So this asserts the mechanism, not a snapshot: no nav label may be
   * written in this file at all. A hardcoded "Today" would pass a snapshot test
   * on the day it was written and drift the day after.
   */
  const raw = readFileSync(new URL('../src/components/FrameSkeleton.tsx', import.meta.url), 'utf8')
  const skeleton = code(raw)
  assert.match(skeleton, /frameSide\('operator'/, 'the nav must come from the frame\'s own function')
  assert.match(skeleton, /side\.items\.map/, 'it must render that list, not a copy of it')
  assert.match(skeleton, /\{item\.label\}/, 'each label comes from the list')
  assert.match(skeleton, /from '\.\/Frame\.module\.css'/, 'the same geometry, so nothing shifts when the real screen lands')

  // 🔴 Not one destination's name may be typed here.
  const { frameSide } = require('../src/lib/frame') as typeof import('../src/lib/frame')
  for (const item of frameSide('operator').items) {
    assert.ok(
      !new RegExp(`['\"\`]${item.label}['\"\`]`).test(skeleton),
      `FrameSkeleton hardcodes the nav label "${item.label}" — it must only ever render what frameSide returns`,
    )
  }
  assert.ok(frameSide('operator').items.length >= 6, 'the operator nav shrank; check this is intended')
})

test('🔒 the boundary still exists: probe-timing asserts the page streams', () => {
  // Deleting the file would have been the smaller change and the wrong one.
  const probe = readFileSync(new URL('./probe-timing.ts', import.meta.url), 'utf8')
  assert.match(probe, /has loading\.tsx been removed\?/)
})

test('🔴 THE SKELETON RESERVES THE CHROME\'S OWN SPACE, or it guarantees a jump', () => {
  /*
   * Fixed 23 Sep 2026, after the flash was gone and the jump was not: the
   * skeleton's sidebar had TWO children where the real frame has FOUR — the
   * "Open a client" control (44px) and the operator's line were missing — so
   * the nav sat 58px too high and the whole sidebar dropped when the screen
   * arrived. Measured in a browser: navDelta 58 before, 0 after.
   *
   * The frame's sidebar is chrome: it is the one part of the screen that must
   * not move while the content beneath it is still being read.
   */
  const skeleton = code(readFileSync(new URL('../src/components/FrameSkeleton.tsx', import.meta.url), 'utf8'))
  const frame = code(readFileSync(new URL('../src/components/Frame.tsx', import.meta.url), 'utf8'))

  // Both draw the same four boxes down the side, in the same order.
  const order = (src: string) => [
    src.indexOf('styles.brand'),
    // 🔒 Where it RENDERS, not where it is imported: the import sits at the top
    // of the file and would make every order look wrong.
    Math.max(src.indexOf('<ClientSwitcher'), src.indexOf('switcherSlot')),
    src.indexOf('styles.nav'),
    src.indexOf('styles.foot'),
  ]
  for (const [i, where] of order(skeleton).entries()) {
    assert.ok(where > 0, `the skeleton is missing sidebar box ${i + 1}: it will jump when the real frame lands`)
  }
  const s = order(skeleton)
  assert.deepEqual([...s].sort((a, b) => a - b), s, 'the skeleton draws the sidebar in a different order from the frame')
  const f = order(frame)
  assert.deepEqual([...f].sort((a, b) => a - b), f)

  // The reserved control is a BLANK, never a control: this component reads nothing.
  assert.match(skeleton, /switcherSlot/)
  assert.doesNotMatch(skeleton, /<button|aria-haspopup|onClick/)
})
