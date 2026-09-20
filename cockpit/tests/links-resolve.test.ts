import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { CLIENT_SCREENS } from '../src/lib/frame'

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * A DOOR THAT OPENS ONTO A 404 IS WORSE THAN NO DOOR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Brief III: on the client landing *every number is a door*, and `bands.ts`
 * states the rule in its own type — *"Null only where the thing to open does
 * not exist, and then the item says so rather than rendering a link to
 * nowhere."*
 *
 * 🔴 I WROTE THAT RULE AND BROKE IT IN THE SAME FILE. Band 1 links
 * configuration gaps to `/c/<client>/settings` and critical anomalies to
 * `/c/<client>/anomalies`. Neither page exists. An operator clicking the one
 * thing the page says is theirs to fix gets a 404 — which reads as the cockpit
 * being broken, at exactly the moment it was telling them something true.
 *
 * Nothing could have caught it: `href` is a string, Next resolves routes from
 * the filesystem at build time, and a `<Link>` to a missing route builds and
 * renders perfectly. Same shape as lesson 1p — a string the language cannot
 * check, describing a structure that IS in the repository in another form.
 * So read the filesystem.
 */

const APP = join(import.meta.dirname, '..', 'src', 'app')
const REPO = join(import.meta.dirname, '..', '..')

/** Every route the app actually serves, as a matchable pattern. */
function routes(): string[] {
  const found: string[] = []
  const walk = (dir: string, url: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (!statSync(p).isDirectory()) {
        if (name === 'page.tsx') found.push(url === '' ? '/' : url)
        continue
      }
      // Route groups `(x)` do not appear in the URL.
      const segment = /^\(.*\)$/.test(name) ? '' : `/${name}`
      walk(p, url + segment)
    }
  }
  walk(APP, '')
  return found
}

const ROUTES = routes()

/** Does `href` match a route, treating `[param]` as one segment? */
function resolves(href: string): boolean {
  const path = href.split(/[?#]/)[0].replace(/\/$/, '') || '/'
  const parts = path.split('/').filter(Boolean)
  return ROUTES.some((r) => {
    const rp = r.split('/').filter(Boolean)
    if (rp.length !== parts.length) return false
    return rp.every((seg, i) => /^\[.*\]$/.test(seg) || seg === parts[i])
  })
}

type Found = { file: string; line: number; href: string }

/**
 * Internal hrefs written as literals, including the template shapes this repo
 * uses — `/c/${clientId}/settings` becomes `/c/[x]/settings`.
 */
function linksInSource(): Found[] {
  const out: Found[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) {
        walk(p)
        continue
      }
      if (!/\.tsx?$/.test(p)) continue
      const text = readFileSync(p, 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')

      for (const m of text.matchAll(/href[:=]\s*[{]?\s*[`'"](\/[^`'"$]*(?:\$\{[^}]*\}[^`'"]*)*)[`'"]/g)) {
        const raw = m[1]
        // Anything interpolated is one opaque segment.
        const href = raw.replace(/\$\{[^}]*\}/g, '[x]')
        // A wholly dynamic tail (`/leads/${id}`) still names its parent route.
        out.push({
          file: relative(REPO, p).split(sep).join('/'),
          line: text.slice(0, m.index).split('\n').length,
          href,
        })
      }
    }
  }
  walk(join(import.meta.dirname, '..', 'src'))
  return out
}

test('the route reader found the app', () => {
  // 🔴 A walker that found nothing would make every link resolve vacuously.
  assert.ok(ROUTES.length >= 15, `only ${ROUTES.length} routes found`)
  assert.ok(ROUTES.includes('/today'), '/today is missing from the parse')
  assert.ok(ROUTES.includes('/c/[client]'), 'the client landing is missing from the parse')
  assert.ok(ROUTES.includes('/c/[client]/contacts/[phone]'))
  // And it does NOT invent ones that are not built yet.
  assert.ok(!ROUTES.includes('/c/[client]/settings'), 'settings is not built; the parser thinks it is')
})

test('the resolver matches dynamic segments, and refuses the wrong shape', () => {
  assert.ok(resolves('/c/[x]/contacts'))
  assert.ok(resolves('/c/abc/contacts/%2B351912345678'))
  assert.ok(resolves('/today'))
  assert.ok(!resolves('/c/[x]/settings'), 'an unbuilt route resolved')
  assert.ok(!resolves('/c/[x]/contacts/[y]/extra'), 'a too-long path resolved')
})

/*
 * 🔒 Two hrefs are GENERATED over a known set rather than written.
 *
 * `frame.ts` builds `/c/${client.id}/${s.slug}` and `/p/${client.id}/${s.slug}`
 * by mapping CLIENT_SCREENS, so the static form is `/c/[x]/[x]` — which cannot
 * resolve and should not be expected to. Every MEMBER of that set is checked
 * individually by the nav test below, which is the stronger check: it fails
 * both when a screen is unbuilt and when one is built and left marked unbuilt.
 *
 * Named by file and line rather than skipped by shape, so a third generated
 * link has to be looked at rather than inheriting an exemption.
 */
const GENERATED_OVER_A_KNOWN_SET = new Set(['cockpit/src/lib/frame.ts'])

test('🔴 every link in the cockpit opens a route that exists', () => {
  const dead = linksInSource()
    .filter((l) => !(GENERATED_OVER_A_KNOWN_SET.has(l.file) && /\/\[x\]\/\[x\]$/.test(l.href)))
    .filter((l) => !resolves(l.href))
  assert.deepEqual(
    dead,
    [],
    `\n\n  🔴 ${dead.length} link(s) point at a route that does not exist.\n\n` +
      dead.map((d) => `    ${d.file}:${d.line} → ${d.href}`).join('\n') +
      '\n\n  A <Link> to a missing route builds and renders perfectly, and 404s\n' +
      '  when somebody clicks it — which reads as the cockpit being broken at\n' +
      '  the moment it was telling them something true.\n\n' +
      '  Either build the screen, or say what is missing instead of linking:\n' +
      '  bands.ts carries `opens: null` for exactly this.\n',
  )
})

test('🔴 a nav item whose screen is not built is marked, not silently dead', () => {
  /*
   * The sidebar lists every client screen, and most are not built yet. That is
   * legitimate — the nav is the map of the cockpit, not of today's progress —
   * but a plain link to a 404 tells the operator nothing about WHICH of the
   * two it is: not built, or broken.
   *
   * So `CLIENT_SCREENS` carries `built`, and the frame renders an unbuilt item
   * as a non-link. §0.4-7: a greyed control is not a refusal — here the item is
   * not a control at all, which is the honest rendering of "there is nothing
   * to open yet".
   */
  // 🔒 Collected, not asserted in the loop. An assert inside the loop stops at
  // the first mismatch and hides the rest, so a five-line fix arrives as five
  // separate red runs — which is how a guard becomes a thing people dread.
  const wrong = CLIENT_SCREENS.filter((s) => s.built !== ROUTES.includes(`/c/[client]${s.slug ? `/${s.slug}` : ''}`)).map(
    (s) =>
      `${s.slug || '(landing)'}: registered built=${s.built}, but the route ${
        ROUTES.includes(`/c/[client]${s.slug ? `/${s.slug}` : ''}`) ? 'EXISTS' : 'does not exist'
      }`,
  )
  assert.deepEqual(wrong, [], `\n    ${wrong.join('\n    ')}\n`)
})

test('the control: the link checker can see a dead link', () => {
  /*
   * Without this, "no dead links" and "the regex found none" are one green.
   *
   * 🔴 THE FIRST VERSION NAMED /c/[x]/anomalies AS ITS KNOWN-MISSING ROUTE,
   * AND THEN THAT SCREEN WAS BUILT — an hour later, by me. The control went red
   * for the best possible reason and was still a false alarm, because it had
   * pinned its negative case to a fact about today's progress.
   *
   * A control asserting a specific ABSENCE rots as soon as somebody fills it.
   * So the negative case is now a path that cannot ever be a route, and the
   * positive case is the landing — which, if it ever stops existing, is a
   * failure worth having.
   */
  assert.ok(!resolves('/c/[x]/__not-a-route__/definitely-not'), 'an impossible path resolved')
  assert.ok(!resolves('/nowhere-at-all'), 'a top-level path that does not exist resolved')
  assert.ok(resolves('/c/[x]'), 'the client landing must resolve, or the reader is broken')
  assert.ok(resolves('/today'))
})
