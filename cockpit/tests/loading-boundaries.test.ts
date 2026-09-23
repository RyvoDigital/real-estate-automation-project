/*
 * 🔴 EVERY FRAMED ROUTE ACKNOWLEDGES THE CLICK (23 Sep 2026).
 *
 * This file began as frame-skeleton.test.ts, guarding that no loading state
 * drew the RETIRED cockpit. It kept that job and took on the larger one, for a
 * reason measured rather than argued. Against production, median of five:
 *
 *     /onboarding          147ms to first byte, 325ms streamed after it
 *     /leads               120ms               294ms
 *     ------------------------------------------------------------------
 *     /ops/infrastructure  328ms               1ms
 *     /today               485ms               0ms
 *     /ops/expiries        529ms               0ms
 *     /clients            1018ms               1ms
 *
 * The split is exactly the boundary. A route with a loading.tsx flushes a
 * shell straight away and streams its body in behind it; a route without one
 * sends nothing at all until the render finishes — so a click on Clients left
 * the operator on the previous screen for a full second with no sign that
 * anything had happened.
 *
 * 🔴 AND THE GUARD THAT WAS SUPPOSED TO CATCH THAT COULD NOT FAIL. The test
 * here named "the boundary still exists" asserted only that a STRING LITERAL
 * appeared in tests/probe-timing.ts. It passed with the boundary present,
 * absent, or empty, and it passed on all 28 routes that had none. The comment
 * at the top of onboarding/loading.tsx claimed probe-timing.ts protected that
 * route; probe-timing.ts had never heard of it. Both were written on 22–23 Sep
 * by the same hand that is now replacing them.
 *
 * So: the rule is derived from src/app, never listed here.
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
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const files = walk(APP)
const pages = files.filter((f) => /\/page\.tsx?$/.test(f))
const layouts = files.filter((f) => /\/layout\.tsx?$/.test(f))
const loadings = files.filter((f) => f.endsWith('loading.tsx'))
const src = (f: string) => code(readFileSync(f, 'utf8'))

/** The directories from a file's own up to src/app, nearest first. */
function ancestors(file: string): string[] {
  const out: string[] = []
  let d = dirname(file)
  for (;;) {
    out.push(d)
    if (d === APP.replace(/\/$/, '') || d.length <= APP.length - 1) break
    d = dirname(d)
  }
  return out
}

/** The nearest ancestor directory holding a file of this name, or null. */
const nearest = (file: string, name: string): string | null =>
  ancestors(file).find((d) => files.includes(join(d, name))) ?? null

/** A page is FRAMED when a layout above it renders the cockpit's one frame. */
function framedBy(page: string): string | null {
  for (const d of ancestors(page)) {
    const l = layouts.find((f) => dirname(f) === d)
    if (l && /<Frame\b/.test(src(l))) return l
  }
  return null
}

const framedPages = pages.filter((p) => framedBy(p) !== null)

test('🔴 EVERY FRAMED ROUTE HAS A LOADING BOUNDARY — the rule, derived from src/app', () => {
  /*
   * Not a list. A screen added tomorrow under any framed layout is covered by
   * construction, which is the whole reason the old check was worthless: it
   * named four routes and the cockpit had forty-two.
   */
  assert.ok(framedPages.length >= 20, `only ${framedPages.length} framed pages found — the scan is broken`)

  const naked = framedPages.filter((p) => nearest(p, 'loading.tsx') === null).map((p) => relative(APP, p))
  assert.deepEqual(
    naked,
    [],
    'these screens send nothing until their whole render finishes, so a click on them does nothing visible:\n  ' +
      naked.join('\n  '),
  )
})

test('🔴 THE BOUNDARY IS BELOW THE FRAME, so the chrome never blinks', () => {
  /*
   * The bug this whole piece of work started from. While a page rendered
   * <Frame> itself the boundary sat ABOVE the chrome, so navigating to
   * Onboarding blanked the sidebar and the content together — and the root
   * layout is a bare <body>, so "above the chrome" meant the whole viewport.
   *
   * Two things make that impossible now, and both are asserted: the frame is
   * only ever rendered by a layout, and each boundary is at or below the
   * layout that renders it.
   */
  const inPage = pages.filter((p) => /<Frame\b/.test(src(p))).map((p) => relative(APP, p))
  assert.deepEqual(inPage, [], `the frame belongs to a layout; these pages render it themselves:\n  ${inPage.join('\n  ')}`)

  const above: string[] = []
  for (const p of framedPages) {
    const frameLayout = framedBy(p)!
    const boundary = nearest(p, 'loading.tsx')
    if (!boundary) continue // reported by the test before this one
    // Nearer to the page means longer path; the boundary must not sit outside
    // the directory whose layout draws the frame.
    if (boundary.length < dirname(frameLayout).length) {
      above.push(`${relative(APP, p)}: boundary at ${relative(APP, boundary) || '.'} is outside the frame at ${relative(APP, frameLayout)}`)
    }
  }
  assert.deepEqual(above, [], `a boundary above the chrome repaints the chrome:\n  ${above.join('\n  ')}`)
})

test('🔴 A SKELETON ASSERTS NOTHING IT HAS NOT READ: no literal text, ever', () => {
  /*
   * The operator's own constraint, 23 Sep 2026. A skeleton that guessed at
   * content would assert something it has not read — to the one person who
   * came to the screen in order to find out. It is also how a surface comes to
   * hardcode a count: see tests/infrastructure.test.ts, where five screens
   * said "Twelve checks" while the producer published thirteen.
   *
   * 🔴 REFINED THE SAME DAY, after the operator walked it: "each click flashes
   * an empty shape and then fills in… the swap reads as content disappearing
   * rather than as the page arriving." The first rule banned ALL text, which
   * banned the one thing that makes a destination recognisable — its NAME. A
   * screen's name is true before any query runs, so showing it asserts nothing.
   *
   * So the rule is not "no words", it is "no LITERAL words": text must come
   * from an expression, and navLabel() is the only source the skeletons use, so
   * the title cannot drift from the screen's own <h1>. The scan below rejects
   * anything between tags that is not an expression, which is exactly that.
   */
  const offences: string[] = []
  for (const f of loadings) {
    const rel = relative(APP, f)
    if (rel in OLD_BY_DESIGN) continue // the retired chrome carries its own words; it goes when its route does
    const s = src(f)
    // Any text rendered between tags, and any bare number in the JSX.
    for (const m of s.matchAll(/>([^<>{}\n]*[A-Za-z0-9][^<>{}]*)</g)) {
      const text = m[1].trim()
      if (text) offences.push(`${rel}: renders the text "${text}"`)
    }
  }
  assert.deepEqual(offences, [], `a loading state is asserting something it has not read:\n  ${offences.join('\n  ')}`)
})

test('🔒 A SKELETON READS NOTHING — it would be the thing it is covering for', () => {
  const offences: string[] = []
  for (const f of [...loadings, new URL('../src/components/PageSkeleton.tsx', import.meta.url).pathname]) {
    const rel = relative(APP, f)
    if (rel in OLD_BY_DESIGN) continue
    const s = src(f)
    for (const bad of [/\bawait\b/, /\basync\b/, /readCounts/, /requireOperator/, /admin\(\)/, /\bcookies\(/, /\bheaders\(/]) {
      if (bad.test(s)) offences.push(`${rel}: ${bad.source}`)
    }
  }
  assert.deepEqual(offences, [], `a loading state that waits for something is not a loading state:\n  ${offences.join('\n  ')}`)
})

/**
 * The component families a screen is built from, e.g. `@/components/today`.
 *
 * 🔒 ANY import from the family, not only its stylesheet. /clients imports
 * `@/components/clients/ClientsView` and no CSS at all — the view brings its
 * own — so a check that looked only for `.module.css` found nothing to compare
 * and skipped the screen. Proved by sabotage: pointing the /clients boundary
 * at Today's stylesheet raised no failure at all until this was widened.
 */
const families = (text: string): Set<string> =>
  new Set([...text.matchAll(/from '(@\/components\/[^'/]+)\/[^']+'/g)].map((m) => m[1]))

/** The one family a boundary takes its geometry from, or null when neutral. */
const geometryOf = (text: string): string | null => {
  const m = /from '(@\/components\/[^']+)\.module\.css'/.exec(text)
  return m ? m[1].replace(/\/[^/]+$/, '') : null
}

test('🔒 THE SKELETON A SCREEN ACTUALLY GETS IS SHAPED LIKE THAT SCREEN', () => {
  /*
   * A skeleton whose measurements are typed in by hand drifts from the screen
   * it stands in for, and the drift is invisible until something jumps.
   * Measured on 23 Sep: a sidebar with two boxes where the frame had four put
   * the nav 58px too high, and everything dropped when the screen arrived. So
   * each boundary takes its geometry from the same CSS module its screen uses.
   *
   * 🔴 ASKED PER PAGE, NOT PER FILE, and that distinction is the whole test.
   * The first version of this walked the loading.tsx files and asked whether
   * each matched its neighbour — which passed happily when today/loading.tsx
   * was DELETED, because /today then fell back to the group boundary and the
   * group boundary is exempt. Proved by sabotage the same hour: deleting a
   * boundary produced zero failures. Asking "what does THIS page get?" catches
   * it, because what /today then gets is The Month's desk.
   */
  /*
   * The three that cover many screens at once and cannot inherit one geometry.
   * Each says why in its own file, which the next test checks.
   */
  const NEUTRAL = ['c/[client]/loading.tsx', 'p/[client]/loading.tsx']

  const offences: string[] = []
  for (const p of framedPages) {
    const wants = families(readFileSync(p, 'utf8'))
    const dir = nearest(p, 'loading.tsx')
    if (!dir) continue // reported by the boundary test above
    const boundary = join(dir, 'loading.tsx')
    const rel = relative(APP, boundary)
    const gets = geometryOf(src(boundary))
    if (gets === null) {
      // A boundary with no geometry of its own is only allowed where it is
      // deliberately neutral, and only then.
      if (!NEUTRAL.includes(rel)) offences.push(`${relative(APP, p)} is covered by ${rel}, which takes its shape from nothing`)
      continue
    }
    // A screen built from no component family (the client screens keep their
    // stylesheets beside their pages) has nothing to compare against.
    if (wants.size === 0) continue
    if (!wants.has(gets)) {
      offences.push(
        `${relative(APP, p)} is built from ${[...wants].join(', ')} but its boundary ${rel} draws from ${gets}`,
      )
    }
  }
  assert.deepEqual(offences, [], `these screens are stood in for by a shape that is not theirs:\n  ${offences.join('\n  ')}`)
})

test('🔒 every boundary that is deliberately neutral says so where the next person looks', () => {
  /*
   * Three cover many screens at once and cannot inherit one geometry: the
   * operator group's fallback, the eighteen client screens, and the presented
   * frame. Each is allowed to be neutral and each has to say why in its own
   * file — the ledger is in the files, not in a list here that can go stale.
   */
  const NEUTRAL = ['c/[client]/loading.tsx', 'p/[client]/loading.tsx']
  for (const rel of NEUTRAL) {
    const raw = readFileSync(join(APP, rel), 'utf8')
    assert.match(raw, /🔒/, `${rel} is neutral by choice and must say why`)
  }
})

test('🔴 no loading state on a framed route may draw the old chrome', () => {
  assert.ok(loadings.length > 5, `only ${loadings.length} loading states found — the scan is broken`)
  const offences: string[] = []
  for (const f of loadings) {
    const rel = relative(APP, f)
    const s = src(f)
    // The OLD modules, exactly.
    const drawsOld = /from '@\/components\/Skeleton'|from '@\/components\/Shell'|\bSkeletonShell\b/.test(s)
    if (!drawsOld) continue
    if (rel in OLD_BY_DESIGN) continue
    offences.push(`${rel} draws the retired cockpit`)
  }
  assert.deepEqual(offences, [], `a navigation into these routes flashes the retired cockpit:\n  ${offences.join('\n  ')}`)
})

test('🔒 the ledger is honest: every exemption is a route that really is old', () => {
  const chromeUnder = (dir: string): 'frame' | 'shell' | 'none' => {
    const under = pages.filter((f) => f.startsWith(dir + '/') || dirname(f) === dir)
    const s = code(under.map((p) => readFileSync(p, 'utf8')).join('\n'))
    if (/<Frame\b/.test(s)) return 'frame'
    if (/<Shell\b/.test(s)) return 'shell'
    return 'none'
  }
  for (const [rel, why] of Object.entries(OLD_BY_DESIGN)) {
    const f = join(APP, rel)
    assert.ok(files.includes(f), `OLD_BY_DESIGN names ${rel}, which no longer exists — remove it`)
    assert.equal(chromeUnder(dirname(f)), 'shell', `${rel} is exempt as an old route, but its pages no longer render the old Shell`)
    assert.ok(why.length > 20, `${rel} needs a reason, not a word`)
  }
})

test('🔴 onboarding — the route this was found on — is covered, and by the new chrome', () => {
  const loading = src(pageFile('/onboarding', 'loading'))
  assert.doesNotMatch(loading, /\bSkeletonShell\b|from '@\/components\/(Skeleton|Shell)'/)
  assert.match(loading, /PageSkeleton/, 'it draws the content region, not a frame')
  assert.doesNotMatch(loading, /<Frame\b/, 'the frame is the layout\'s; a boundary that draws one is above the chrome')
})

test('🔴 THE DESTINATION IS DRAWN: each boundary shows the screen’s own name, from the screen’s own source', () => {
  /*
   * The fix for "the swap reads as content disappearing rather than as the page
   * arriving" (operator, 23 Sep 2026, having walked Stage 1).
   *
   * Every operator screen's <h1> is already exactly its nav label. The skeleton
   * renders that label through navLabel(), so the title is IDENTICAL in both
   * states and does not move when the data lands — the one part of the screen
   * that can be known before a read, drawn rather than blanked.
   *
   * 🔒 This holds the two together. A screen whose heading stops matching its
   * nav label fails here rather than quietly showing one name and then another.
   */
  const SCREENS: { slug: string; boundary: string; heading: string }[] = [
    { slug: 'today', boundary: '(operator)/today/loading.tsx', heading: '../src/app/(operator)/today/page.tsx' },
    { slug: 'clients', boundary: '(operator)/clients/loading.tsx', heading: '../src/components/clients/ClientsView.tsx' },
    { slug: 'expiries', boundary: '(operator)/ops/expiries/loading.tsx', heading: '../src/components/expiries/ExpiriesView.tsx' },
    { slug: 'infrastructure', boundary: '(operator)/ops/infrastructure/loading.tsx', heading: '../src/components/infrastructure/InfrastructureView.tsx' },
    { slug: 'onboarding', boundary: '(operator)/onboarding/loading.tsx', heading: '../src/app/(operator)/onboarding/page.tsx' },
    { slug: 'month', boundary: '(operator)/loading.tsx', heading: '../src/components/month/TheMonth.tsx' },
  ]
  const { navLabel, frameSide } = require('../src/lib/frame') as typeof import('../src/lib/frame')
  assert.equal(SCREENS.length, frameSide('operator').items.length, 'an operator screen was added or removed — give it a boundary here too')

  for (const { slug, boundary, heading } of SCREENS) {
    const label = navLabel(slug)
    assert.ok(label, `${slug} has no nav label`)

    // The boundary draws the name through navLabel, never as a literal.
    const b = src(join(APP, boundary))
    assert.match(b, new RegExp(`navLabel\\('${slug}'\\)`), `${boundary} must draw its screen's name from navLabel('${slug}')`)
    assert.match(b, /<h1 className=\{styles\.title\}>/, `${boundary} must use the screen's own title element`)
    assert.doesNotMatch(b, new RegExp(`>\\s*${label}\\s*<`), `${boundary} writes "${label}" as a literal — it must come from navLabel`)

    // And the screen really is called that.
    const h = readFileSync(new URL(heading, import.meta.url), 'utf8')
    const h1 = /<h1 className=\{styles\.title\}>([^<{]+)<\/h1>/.exec(h)
    assert.ok(h1, `${heading} has no plain <h1> to compare against`)
    assert.equal(h1![1].trim(), label, `${slug}: the screen says "${h1![1].trim()}" and the nav says "${label}" — the skeleton would show one and the screen the other`)
  }
})
