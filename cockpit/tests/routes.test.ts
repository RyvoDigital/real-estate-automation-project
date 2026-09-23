import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { appRoutes, splitRoutes, pageFile } from './lib/routes'

test('every page under src/app is discovered', () => {
  const r = appRoutes({ byRoute: { '/leads/[id]': 'X', '/import/[id]': 'Y' } })
  for (const expected of ['/', '/queue', '/leads', '/leads/X', '/onboarding', '/health', '/report', '/login', '/import', '/import/Y']) {
    assert.ok(r.includes(expected), `${expected} must be discovered — a probe that misses it stops covering it`)
  }
})

test('a dynamic route with no parameter is reported, never dropped', () => {
  const { usable, skipped } = splitRoutes()
  assert.ok(skipped.includes('/leads/[id]'), 'the caller must be told what was skipped')
  assert.ok(skipped.includes('/import/[id]'))
  assert.ok(!usable.some((r) => r.includes('[')), 'no unfilled route is handed out as usable')
})

test('exclusions are explicit', () => {
  const r = appRoutes({ byRoute: { '/leads/[id]': 'X' }, exclude: ['/login'] })
  assert.ok(!r.includes('/login'))
  assert.ok(r.includes('/queue'))
})

/*
 * 🔴 pageFile: THE FILE BEHIND A URL, FOUND RATHER THAN TYPED (23 Sep 2026).
 *
 * Six operator screens moved into the `(operator)` route group. Not one URL
 * changed — a route group is a directory that spends no URL segment — and six
 * tests broke anyway, because each held a literal path to a shelf. The route
 * map was identical before and after; the tests were asserting where files
 * live, which is not a thing about the product.
 */
test('🔒 pageFile finds a route THROUGH a route group, so a move cannot break a test', () => {
  // These six live under (operator); the rest do not. Both must resolve.
  for (const route of ['/', '/today', '/clients', '/ops/expiries', '/ops/infrastructure', '/onboarding']) {
    const f = pageFile(route)
    assert.match(f, /\(operator\)/, `${route} is expected to sit in the (operator) group`)
    assert.ok(readFileSync(f, 'utf8').length > 0)
  }
  for (const route of ['/login', '/queue', '/leads', '/health']) {
    const f = pageFile(route)
    assert.doesNotMatch(f, /\(operator\)/)
    assert.ok(readFileSync(f, 'utf8').length > 0)
  }
})

test('🔒 pageFile resolves the RIGHT file, not merely a file', () => {
  /*
   * A finder that returned the first page.tsx it met would pass every check
   * above and read the wrong screen — the exact shape of the near-miss
   * `byRoute` exists for (a LEAD id filling /import/[id]).
   */
  assert.match(readFileSync(pageFile('/today'), 'utf8'), /readToday/)
  assert.match(readFileSync(pageFile('/clients'), 'utf8'), /readClientList/)
  assert.match(readFileSync(pageFile('/ops/infrastructure'), 'utf8'), /readInfrastructure/)
  // A nested route resolves to its own page, not its parent's.
  assert.notEqual(pageFile('/onboarding'), pageFile('/onboarding/new'))
  assert.match(pageFile('/onboarding/new'), /onboarding\/new\/page\.tsx$/)
})

test('🔒 pageFile finds the other file conventions at a route, not only its page', () => {
  assert.match(pageFile('/onboarding', 'loading'), /onboarding\/loading\.tsx$/)
  assert.match(pageFile('/c/[client]', 'layout'), /c\/\[client\]\/layout\.tsx$/)
})

test('🔴 pageFile THROWS on a route that is not there — it never returns a wrong file', () => {
  /*
   * This is the whole point. A helper that returned null, or fell back to some
   * other page, would turn "this screen no longer exists" into a silent pass —
   * which is the defect tests/lib/routes.ts was written to prevent, one level
   * down. Deleting a screen must break the checks that cover it, loudly.
   */
  assert.throws(() => pageFile('/no-such-screen'), /no page file for the route \/no-such-screen/)
  assert.throws(() => pageFile('/today/deeper'), /\/today\/deeper/)
  // A convention that does not exist at a real route is just as loud. /login
  // is the cockpit's one deliberately unstreamed screen — it touches no
  // database and is probe-timing.ts's control for "not streaming".
  assert.throws(() => pageFile('/login', 'loading'), /no loading file for the route \/login/)
})
