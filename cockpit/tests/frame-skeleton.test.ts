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
  const loading = code(readFileSync(join(APP, 'onboarding/loading.tsx'), 'utf8'))
  assert.match(loading, /FrameSkeleton/)
  assert.doesNotMatch(loading, /\bSkeletonShell\b|from '@\/components\/(Skeleton|Shell)'/)

  const skeleton = code(readFileSync(new URL('../src/components/FrameSkeleton.tsx', import.meta.url), 'utf8'))
  // 🔒 It reads nothing: a loading state that awaited would be the thing it covers for.
  assert.doesNotMatch(skeleton, /await |async |readCounts|requireOperator|admin\(\)/)
  // The same geometry and the same nav, from the same module, so nothing shifts.
  assert.match(skeleton, /from '@\/lib\/frame'/)
  assert.match(skeleton, /from '\.\/Frame\.module\.css'/)
  // No counts and no switcher: both would need a read.
  assert.doesNotMatch(skeleton, /ClientSwitcher|badge\(|counts/)
})

test('🔒 the boundary still exists: probe-timing asserts the page streams', () => {
  // Deleting the file would have been the smaller change and the wrong one.
  const probe = readFileSync(new URL('./probe-timing.ts', import.meta.url), 'utf8')
  assert.match(probe, /has loading\.tsx been removed\?/)
})
