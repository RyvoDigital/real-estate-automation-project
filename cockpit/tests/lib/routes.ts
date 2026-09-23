import { readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'

/**
 * The app's routes, DERIVED FROM THE APP.
 *
 * Every probe used to carry its own hand-written list. On 2026-09-08 an edit
 * adding /import to one of them half-applied, and the probe went on reporting
 * "All checks passed" over a list that no longer contained the screens being
 * added — 56 passes over the wrong routes, indistinguishable from 56 over the
 * right ones. Four probes held such a list, and two of them were probe:dod's
 * security items: "no unauthenticated route exposes lead data" was not
 * checking the new screens at all.
 *
 * This is lesson 15 applied to a route list: never let a test hold its own
 * copy of something the product also holds. A new page under src/app is now
 * covered by construction, and this RAISES rather than returning a short list,
 * because a fallback to fewer routes reinstates exactly the defect.
 */

const APP = new URL('../../src/app/', import.meta.url).pathname

function walk(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      // Route groups (auth) and private folders (_lib) are not URL segments.
      if (entry.startsWith('_')) continue
      const seg = entry.startsWith('(') ? '' : `/${entry}`
      out.push(...walk(full, prefix + seg))
    } else if (entry === 'page.tsx' || entry === 'page.ts') {
      out.push(prefix || '/')
    }
  }
  return out
}

/**
 * The FILE behind a URL, found rather than typed.
 *
 * 🔒 The same lesson as `appRoutes`, one level down. Five tests held a literal
 * path to a page — `'../src/app/clients/page.tsx'` — and moving those six
 * screens into the `(operator)` route group on 23 Sep 2026 broke all five at
 * once, because a route group is a directory that is NOT part of the URL. The
 * route did not change; only the shelf it sits on did.
 *
 * A test that names a shelf is asserting where a file lives. A test should
 * assert what a screen does, so it takes the URL and this finds the file — and
 * THROWS when there is no such route, because a check that silently reads
 * nothing is the vacuous pass this directory exists to prevent.
 */
export function pageFile(route: string, kind: 'page' | 'loading' | 'layout' = 'page'): string {
  const want = route === '/' ? [] : route.replace(/^\//, '').split('/')
  const hunt = (dir: string, rest: string[]): string | null => {
    if (rest.length === 0) {
      for (const ext of ['tsx', 'ts']) {
        const f = join(dir, `${kind}.${ext}`)
        try { if (statSync(f).isFile()) return f } catch {}
      }
    }
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      let isDir = false
      try { isDir = statSync(full).isDirectory() } catch { continue }
      if (!isDir || entry.startsWith('_')) continue
      // A group directory spends no URL segment; a named one must match.
      if (entry.startsWith('(')) {
        const hit = hunt(full, rest)
        if (hit) return hit
      } else if (rest.length > 0 && entry === rest[0]) {
        const hit = hunt(full, rest.slice(1))
        if (hit) return hit
      }
    }
    return null
  }
  const found = hunt(APP, want)
  if (!found) {
    throw new Error(
      `pageFile: no ${kind} file for the route ${route} under src/app. ` +
        `Either the route was removed and this check is now vacuous, or it moved and the URL changed.`,
    )
  }
  return found
}

/**
 * The NEAREST layout above a route — the one that draws its chrome.
 *
 * Distinct from `pageFile(route, 'layout')`, which wants a layout at exactly
 * that segment: /ops/expiries has none of its own and is framed by the
 * `(operator)` group's, two directories up.
 */
export function layoutFor(route: string): string {
  let dir = dirname(pageFile(route))
  const root = APP.replace(/\/$/, '')
  for (;;) {
    for (const ext of ['tsx', 'ts']) {
      const f = join(dir, `layout.${ext}`)
      try { if (statSync(f).isFile()) return f } catch {}
    }
    if (dir === root || dir.length <= root.length) {
      throw new Error(`layoutFor: ${route} has no layout above it, not even the root one — the scan is wrong`)
    }
    dir = dirname(dir)
  }
}

/**
 * Does a navigation to this route flush a shell before its data is ready?
 *
 * 🔴 The question tests/probe-timing.ts used to answer from a list of four
 * route names typed into it — which said `/ops/infrastructure` streamed while
 * that route had no boundary at all, and said nothing about the other 27 that
 * also had none. Derived here from src/app, so a route added without a
 * boundary is caught rather than simply unmentioned.
 *
 * A `loading.tsx` covers its own segment and everything nested below it, so
 * this walks from the route's own directory up to src/app.
 */
export function hasLoadingBoundary(route: string): boolean {
  let dir = dirname(pageFile(route))
  const root = APP.replace(/\/$/, '')
  for (;;) {
    for (const ext of ['tsx', 'ts']) {
      try { if (statSync(join(dir, `loading.${ext}`)).isFile()) return true } catch {}
    }
    if (dir === root || dir.length <= root.length) return false
    dir = dirname(dir)
  }
}

export type RouteOpts = {
  /**
   * Values PER ROUTE PATTERN, e.g. { '/leads/[id]': leadId }.
   *
   * Keyed by the pattern rather than the segment name because both dynamic
   * routes here are called `[id]` and they are not the same id. Filling
   * /import/[id] with a LEAD id produced a 404 page that passed every layout
   * check — a vacuous pass, and the same family as the near-miss this file
   * exists for.
   */
  byRoute?: Record<string, string>
  /** Routes to leave out, e.g. '/login' when listing protected pages. */
  exclude?: string[]
}

export function appRoutes(opts: RouteOpts = {}): string[] {
  const found = walk(APP)
  if (found.length < 5) {
    throw new Error(`appRoutes found only ${found.length} pages under src/app — the scan is wrong, and a short list is how coverage disappears silently`)
  }

  const byRoute = opts.byRoute ?? {}
  const exclude = new Set(opts.exclude ?? [])
  const out: string[] = []

  for (const r of found) {
    if (exclude.has(r)) continue
    const dynamic = r.match(/\[([^\]]+)\]/g)
    if (!dynamic) {
      out.push(r)
      continue
    }
    const v = byRoute[r]
    // A dynamic route with no value supplied is SKIPPED, and the caller is
    // told which — silently dropping it is the thing this file exists for,
    // and quietly substituting the WRONG id is worse than dropping it.
    if (!v) { out.push(`SKIPPED:${r}`); continue }
    let filled = r
    for (const d of dynamic) filled = filled.replace(d, v)
    out.push(filled)
  }

  return out.sort()
}

/**
 * Every route as BOTH the pattern it is and the URL to fetch for it.
 *
 * `appRoutes` fills a pattern and throws the pattern away, which is fine for a
 * caller that only fetches. A caller that then wants to ask something about
 * the route — does it have a loading boundary? — needs the pattern back, and
 * reconstructing it from a filled URL is guesswork.
 */
export function appRoutePairs(opts: RouteOpts = {}): { pattern: string; url: string | null }[] {
  const found = walk(APP)
  if (found.length < 5) {
    throw new Error(`appRoutePairs found only ${found.length} pages under src/app — the scan is wrong, and a short list is how coverage disappears silently`)
  }
  const byRoute = opts.byRoute ?? {}
  const exclude = new Set(opts.exclude ?? [])
  return found
    .filter((r) => !exclude.has(r))
    .map((pattern) => {
      const dynamic = pattern.match(/\[([^\]]+)\]/g)
      if (!dynamic) return { pattern, url: pattern }
      const v = byRoute[pattern]
      if (!v) return { pattern, url: null }
      let filled = pattern
      for (const d of dynamic) filled = filled.replace(d, v)
      return { pattern, url: filled }
    })
    .sort((a, b) => a.pattern.localeCompare(b.pattern))
}

/** Routes actually usable, plus the ones skipped for want of a parameter. */
export function splitRoutes(opts: RouteOpts = {}): { usable: string[]; skipped: string[] } {
  const all = appRoutes(opts)
  return {
    usable: all.filter((r) => !r.startsWith('SKIPPED:')),
    skipped: all.filter((r) => r.startsWith('SKIPPED:')).map((r) => r.slice(8)),
  }
}
