/*
 * 🔴 THE NAV MUST NOT LIE ABOUT WHERE YOU ARE (23 Sep 2026).
 *
 * Reported by the operator after Stage 1 shipped: "the sidebar highlight is
 * stuck on Clients. I click another page, the new page's content renders, and
 * the nav still shows Clients as current."
 *
 * THE CAUSE WAS NOT THE MAPPING. `operatorScreenFor` was right. The frame was
 * told which item was current by a request header, read with `headers()` in the
 * layout — and **a layout is not re-rendered on a client navigation**. That is
 * the whole point of moving the frame into one, and it is why the chrome now
 * persists instead of blinking. So the header was read ONCE, on the first
 * render of the session, and the answer froze there. Clients was simply the
 * first screen opened.
 *
 * The CLIENT frame had the same defect before any of this work and nobody had
 * noticed: moving between two screens of one client keeps the layout, so the
 * highlight stayed on whichever was opened first.
 *
 * So there are two things to hold, and only one of them is the mapping:
 *
 *   1. the pathname → slug function answers correctly for every route;
 *   2. 🔴 the highlight is DERIVED FROM THE LIVE URL, in a component that
 *      re-renders on navigation — never from a value the server read once.
 *
 * A test of (1) alone would have passed happily throughout the defect.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { frameSide, slugForPath, operatorScreenFor, CLIENT_SCREENS } from '../src/lib/frame'
import { appRoutes } from './lib/routes'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('🔴 every operator screen highlights ITS OWN nav item, and exactly one', () => {
  const items = frameSide('operator').items
  assert.ok(items.length >= 6, 'the operator nav shrank; check this is intended')

  for (const item of items) {
    const got = slugForPath(item.href, 'operator')
    assert.equal(got, item.slug, `${item.href} should highlight "${item.slug}" and highlights "${got}"`)
    // And exactly one item claims it.
    const claiming = items.filter((i) => i.slug === got)
    assert.equal(claiming.length, 1, `${item.href} is claimed by ${claiming.length} nav items`)
  }
})

test('🔴 EVERY operator ROUTE in the app resolves, including the ones with no nav item of their own', () => {
  /*
   * Derived from src/app, so a screen added tomorrow is covered. A sub-screen
   * marks its parent — /onboarding/new is Onboarding — and that is deliberate:
   * the nav is a map of sections, not of pages.
   */
  const operatorRoutes = appRoutes()
    .filter((r) => !r.startsWith('SKIPPED:'))
    .filter((r) => r === '/' || ['/today', '/clients', '/onboarding', '/onboarding/new', '/ops/expiries', '/ops/infrastructure'].includes(r))
  assert.ok(operatorRoutes.length >= 7, `only ${operatorRoutes.length} operator routes found — the scan is broken`)

  const slugs = new Set(frameSide('operator').items.map((i) => i.slug))
  for (const route of operatorRoutes) {
    const got = slugForPath(route, 'operator')
    assert.ok(got, `${route} highlights nothing at all — the operator would see no current item`)
    assert.ok(slugs.has(got), `${route} highlights "${got}", which is not in the sidebar`)
  }
  assert.equal(slugForPath('/onboarding/new', 'operator'), 'onboarding', 'a sub-screen marks its section')
})

test('🔒 a path that is not an operator screen highlights NOTHING, rather than the landing', () => {
  /*
   * The Month's href is `/`, a prefix of every path in the cockpit. A
   * prefix match that did not exclude it would mark The Month current on every
   * screen — the same symptom the operator reported, from the other direction.
   */
  for (const outside of ['/login', '/queue', '/leads', '/c/abc/escalations', '/listings/1/triage']) {
    assert.equal(operatorScreenFor(outside), null, `${outside} must not claim an operator nav item`)
  }
  assert.equal(operatorScreenFor('/'), 'month')
})

test('🔒 the client frame resolves its own screens, and a landing is the empty slug', () => {
  assert.equal(slugForPath('/c/abc', 'client'), '')
  for (const s of CLIENT_SCREENS.filter((c) => c.slug !== '')) {
    assert.equal(slugForPath(`/c/abc/${s.slug}`, 'client'), s.slug, `/c/<id>/${s.slug} should highlight ${s.slug}`)
  }
  // A sub-screen resolves to ITSELF, which is what keeps a presented gate from
  // inheriting the listings screen's answer (tests/proxy-screen.test.ts).
  assert.equal(slugForPath('/c/abc/listings/9/publish', 'client'), 'publish')
})

test('🔴 THE HIGHLIGHT COMES FROM THE LIVE URL, never from something read once', () => {
  /*
   * The guard for the actual defect. A layout renders once per session; the
   * sidebar has to answer a question that changes on every click, so the answer
   * cannot come from the server render that drew the sidebar.
   */
  const nav = read('../src/components/FrameNav.tsx')
  assert.match(nav, /^'use client'/, 'the highlight needs a component that re-renders on navigation')
  assert.match(nav, /usePathname\(\)/, 'it must read the live URL')
  assert.match(nav, /aria-current=/, 'and it is the thing that sets aria-current')

  const tabs = read('../src/components/FrameTabs.tsx')
  assert.match(tabs, /usePathname\(\)/, 'the phone bar had the same defect and needs the same answer')

  // 🔴 And nothing else may set it from a value handed down the tree.
  const frame = read('../src/components/Frame.tsx')
  assert.doesNotMatch(
    frame,
    /aria-current=/,
    'the frame is rendered by a layout, which does not re-render on navigation — it must not decide the highlight',
  )
})

test('🔴 no layout hands a screen slug to the frame for the HIGHLIGHT', () => {
  /*
   * The header is still read, and still legitimately: `frameSide` uses it to
   * decide what presented mode CONTAINS (§1.4 — one item, so no other screen's
   * name reaches the HTML), and the switcher uses it to aim at the same screen
   * on another client. Neither changes on a client navigation within one frame.
   *
   * 🔒 What must never come back is using it for the current-item bold. This
   * asserts the one component that could, and the assertion above on Frame.tsx
   * is the other half.
   */
  const frameLib = read('../src/lib/frame.ts')
  assert.match(frameLib, /export function slugForPath/, 'the one mapping, shared by the sidebar and the phone bar')
  // It takes a pathname. A version taking a header would reintroduce the defect.
  const fn = frameLib.slice(frameLib.indexOf('export function slugForPath'), frameLib.indexOf('export function slugForPath') + 300)
  assert.match(fn, /pathname: string/)
  assert.doesNotMatch(fn, /headers|SCREEN_HEADER/)
})
