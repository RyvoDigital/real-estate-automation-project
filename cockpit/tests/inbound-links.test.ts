/*
 * 🔴 EVERY BUILT SCREEN CAN BE REACHED BY CLICKING (22 Sep 2026).
 *
 * The cockpit redesign built screens and did not join them up. Mapped on the
 * evening of 22 September, the live cockpit had:
 *   - login landing on /queue, the OLD screen, whose chrome links to no new one;
 *   - /review, /silence and /listings/<id>/exemption with no inbound link at all;
 *   - /segmentation and /calibrate reachable ONLY while their onboarding step
 *     was unfinished — the screen that writes a consent declaration vanished
 *     the moment it had been used once;
 *   - /ops/expiries reachable only from the sidebar, with no page pointing at it;
 *   - The Month's only way onward hidden above 760px.
 *
 * A screen nobody can click is not built for the person using it, and every one
 * of those passed every other test in this suite. So this test reads the app's
 * own routes, reads every href the app renders, and fails on a route with no
 * way in.
 *
 * 🔒 WHAT IT DOES NOT CATCH, said plainly: it reads path literals, so a
 * screen's OWN redirect back to itself after a form counts as a way in. It
 * proves a route is written down somewhere reachable, not that a person can
 * find it. The map in docs is the other half.
 *
 * 🔒 IT IS NOT A LEDGER. The exceptions below are screens with a REASON not to
 * be linked, each named. Anything else is a defect, and the message says which
 * route and what it means.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { appRoutes, pageFile } from './lib/routes'

/**
 * The route PATTERNS, dynamic ones included. appRoutes() reports an unfilled
 * dynamic route as `SKIPPED:<pattern>` rather than dropping it — deliberately,
 * so coverage cannot disappear quietly — and a pattern is exactly what this
 * test wants, since a link to it is written with a parameter too.
 */
const routePatterns = (): string[] =>
  appRoutes().map((r) => (r.startsWith('SKIPPED:') ? r.slice(8) : r))

const SRC = new URL('../src/', import.meta.url).pathname

/**
 * Not reached by a link, each for a stated reason. A route may sit here only
 * because being unlinked is the DESIGN, never because nothing links to it yet.
 */
const NO_LINK_NEEDED: Record<string, string> = {
  '/login': 'where an unauthenticated person is sent; linking to it from inside would be circular',
  '/health': 'a redirect to /ops/infrastructure, kept for bookmarks and the runbook (22 Sep 2026)',
  '/p/[client]/notice': 'presented mode: opened deliberately, with the laptop turned around. A link to it from an operator screen is a click away from showing an agency the wrong thing',
  '/c/[client]/policy': 'reached from a property in the gate in depth, which is where the question arises; brief §1.2 also gives it an operator-level home that is not built',
  '/c/[client]/templates': "Meta's review state, read when a send is being set up; its operator-level home (/ops/templates) is not built",
  '/c/[client]/notice': 'the operator half of a presented pair, read before the notice is read aloud',
}

function files(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...files(p))
    else if (/\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

/**
 * Every href the app renders, as a ROUTE PATTERN: a template literal's `${…}`
 * becomes `[param]`, so `/c/${id}/report` matches the route `/c/[client]/report`.
 */
function renderedHrefs(): Set<string> {
  const found = new Set<string>()
  for (const f of files(SRC)) {
    const text = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    /*
     * 🔒 A URL IS NOT ALWAYS WRITTEN AT THE href. contactHref() builds the
     * contact record's URL and returns it; lib/escalations/actions.ts builds
     * its redirect into a variable. A scan that only read `href=` reported the
     * contact record as orphaned while two screens link to it (found by this
     * test's first run, 22 Sep 2026). So every path-shaped literal counts.
     *
     * 🔴 EXCEPT revalidatePath(): that names a cache entry, not a destination.
     * Counting it would let a screen nobody links to look reachable because
     * something writes to it.
     */
    const scannable = text.replace(/revalidatePath\([^)]*\)/g, '')
    const patterns = [
      /["'`](\/[a-z0-9\[$][^"'`\s>]*|\/)["'`]/gi,
    ]
    for (const re of patterns) {
      for (const m of scannable.matchAll(re)) {
        const raw = m[1]
        if (!raw.startsWith('/')) continue
        const route = raw
          .replace(/\$\{[^}]*\}/g, '[param]')       // a template hole is a parameter
          .replace(/[?#].*$/, '')                    // a query or anchor is the same screen
          .replace(/\/$/, '') || '/'
        found.add(route)
      }
    }
  }
  return found
}

/** Does any rendered href reach this route? Parameters match any single segment. */
function reached(route: string, hrefs: Set<string>): boolean {
  const want = route.split('/').filter(Boolean)
  for (const href of hrefs) {
    const got = href.split('/').filter(Boolean)
    if (got.length !== want.length) continue
    if (want.every((seg, i) => seg.startsWith('[') || got[i] === '[param]' || got[i] === seg)) return true
  }
  return false
}

test('🔴 every built screen has a way in: no route is reachable only by typing its URL', () => {
  const hrefs = renderedHrefs()
  // A scan that found nothing would pass this test over an empty question.
  assert.ok(hrefs.size > 20, `only ${hrefs.size} hrefs found — the scan is broken and this test would pass vacuously`)
  for (const known of ['/today', '/ops/expiries', '/ops/infrastructure', '/onboarding']) {
    assert.ok(hrefs.has(known), `the scan missed ${known}, which is in the sidebar — it is not reading hrefs properly`)
  }

  const orphans: string[] = []
  for (const route of routePatterns()) {
    if (route in NO_LINK_NEEDED) continue
    if (route.startsWith('/api') || route.startsWith('/auth')) continue
    if (reached(route, hrefs)) continue
    orphans.push(route)
  }
  assert.deepEqual(orphans, [], `these screens exist and NOTHING links to them, so only a typed URL reaches them:\n  ${orphans.join('\n  ')}\n\nEither link them from where the question arises, or add them to NO_LINK_NEEDED with the reason.`)
})

test('🔒 the exceptions are named, and none of them is a route that no longer exists', () => {
  const routes = new Set(routePatterns())
  for (const [route, why] of Object.entries(NO_LINK_NEEDED)) {
    assert.ok(routes.has(route), `NO_LINK_NEEDED names ${route}, which is not a route any more`)
    assert.ok(why.length > 30, `${route}'s exemption needs a reason, not a word`)
  }
})

test('🔴 signing in lands on the cockpit that is being built, not the one being retired', () => {
  /*
   * Until 22 Sep 2026 both redirects sent a signed-in operator to /queue — the
   * old screen, on the old Shell, whose tabs are queue/leads/report/import and
   * which links to NO new screen. Every session started in the retired cockpit
   * with no clickable way into the new one.
   */
  const callback = readFileSync(new URL('../src/app/auth/callback/route.ts', import.meta.url), 'utf8')
  const login = readFileSync(new URL('../src/app/login/page.tsx', import.meta.url), 'utf8')
  assert.match(callback, /redirect\(new URL\('\/today'/)
  assert.doesNotMatch(callback, /new URL\('\/queue'/)
  assert.match(login, /redirect\('\/today'\)/)
  assert.doesNotMatch(login, /redirect\('\/queue'\)/)
})

test('🔴 the contact record is linked BY PHONE: a lead id in that URL is a dead row', () => {
  /*
   * The contact record is scoped to (client_id, phone_e164). Both screens that
   * list waiting leads linked `contacts/<lead id>`, which the record correctly
   * refuses to guess at — so the rows landed on "that is not a number we can
   * look up". phone-url.ts owns the encoding; nothing else may build that URL.
   */
  for (const rel of ['../src/components/today/TodayView.tsx', '../src/app/c/[client]/escalations/page.tsx']) {
    const text = readFileSync(new URL(rel, import.meta.url), 'utf8')
    assert.match(text, /contactHref\(row\.clientId, row\.phone\)/, `${rel} must build the contact URL through contactHref`)
    assert.doesNotMatch(text, /contacts\/\$\{row\.id\}/, `${rel} still links the contact record by lead id`)
    // 🔒 No number, no link — rather than a link that cannot work.
    assert.match(text, /row\.phone \? contactHref/, `${rel} must not link a row with no number`)
  }
})

test('🔒 Today points at the screen its own expiry groups come from', () => {
  const view = readFileSync(new URL('../src/components/today/TodayView.tsx', import.meta.url), 'utf8')
  const links = [...view.matchAll(/href="\/ops\/expiries"/g)]
  assert.equal(links.length, 2, 'groups 3 and 4 each carry the link to /ops/expiries')
})

test('🔴 the declaration and the calibration can always be opened, done or not', () => {
  /*
   * These two links are the ONLY way to /segmentation and /calibrate. Rendering
   * them only while the step was unfinished meant the consent declaration —
   * the one screen that writes one — could not be reached by clicking as soon
   * as it had been used once.
   */
  const checklist = readFileSync(new URL('../src/components/onboarding/Checklist.tsx', import.meta.url), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  assert.match(checklist, /\{s\.href \? \(/)
  assert.doesNotMatch(checklist, /s\.state !== 'done'/, 'the way in disappears once the step is done')
  assert.match(checklist, /Open the declaration again/)
  assert.match(checklist, /Open the calibration again/)
})

test('🔒 The Month has a way onward on a desk, not only on a phone', () => {
  const page = readFileSync(pageFile('/'), 'utf8')
  const css = readFileSync(new URL('../src/components/month/month.module.css', import.meta.url), 'utf8')
  assert.match(page, /styles\.deskOn/)
  // The phone refusal keeps its own link, and stays hidden on a desk.
  assert.match(css, /\.refuse \{ display: none; \}/)
  const deskOn = css.slice(css.indexOf('.deskOn'), css.indexOf('/* The phone is refused'))
  assert.doesNotMatch(deskOn, /display:\s*none/, 'the desk link must not be hidden the way the phone refusal is')
})

/*
 * 🔴 AN INTERNAL LINK IS A <Link>, NEVER AN <a> (23 Sep 2026).
 *
 * A raw <a href="/…"> is a full document load: the browser throws away the
 * running app, re-downloads it, re-runs the proxy's session check and
 * re-renders the frame from nothing. It cannot be prefetched, so the loading
 * boundaries added today do not apply to it either.
 *
 * Twenty-two of them were in the cockpit when this was written, and they were
 * not obscure. The Month's only two exits to Today were both raw anchors; so
 * were the month's prev/next arrows, and both rehearsal toggles. The screens
 * felt bumpy because half the primary paths were not navigations at all.
 */
test('🔴 no internal navigation is a raw <a>: those are full page loads', () => {
  /*
   * A fragment (#group-2) and an external link (target=_blank, http…) are
   * genuinely anchors — the rule is about internal NAVIGATION.
   */
  const files: string[] = []
  const walk = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx$/.test(p)) files.push(p)
    }
  }
  walk(new URL('../src/', import.meta.url).pathname)
  assert.ok(files.length > 40, `only ${files.length} components found — the scan is broken`)

  const offences: string[] = []
  for (const f of files) {
    const text = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    for (const [n, line] of text.split('\n').entries()) {
      const m = /<a\b[^>]*\bhref=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/.exec(line)
      if (!m) continue
      if (/target=/.test(line)) continue
      const href = m[1] ?? m[2] ?? m[3] ?? ''
      if (href.startsWith('#') || /^https?:/.test(href)) continue
      // An href held in a variable is only safe if it can only be a fragment.
      if (m[3] && !/^['"`]?[/#]/.test(href) && !/href/i.test(href)) continue
      if (href.startsWith('/') || m[3]) {
        offences.push(`${relative(new URL('../src/', import.meta.url).pathname, f)}:${n + 1}: <a href=${href}>`)
      }
    }
  }
  /*
   * 🔒 ONE EXEMPTION, AND IT IS PROVED RATHER THAN ASSERTED. The client
   * landing renders `heldBy.href`, which is a variable, so the scan above
   * cannot see where it points. It is always the fragment `#nobodys-yet` —
   * the landing's own third band, because the waiting room is not built — and
   * the test below reads lib/landing/automations.ts to confirm that. If that
   * function ever returns a real route, this exemption fails rather than
   * quietly covering a full page load.
   */
  const EXEMPT = 'app/c/[client]/page.tsx'
  const left = offences.filter((o) => !o.startsWith(`${EXEMPT}:`))
  assert.deepEqual(left, [], `these are full page loads, not navigations — use next/link:\n  ${left.join('\n  ')}`)

  const automations = readFileSync(new URL('../src/lib/landing/automations.ts', import.meta.url), 'utf8')
  const fn = automations.slice(automations.indexOf('function heldBy'), automations.indexOf('export async function readAutomations'))
  const hrefs = [...fn.matchAll(/href:\s*'([^']*)'/g)].map((m) => m[1])
  assert.ok(hrefs.length > 0, 'heldBy no longer sets an href here — re-check the exemption above')
  for (const h of hrefs) {
    assert.ok(h.startsWith('#'), `heldBy now returns the route ${h}, so the client landing renders a real <a> to it — make it a <Link>`)
  }
})
