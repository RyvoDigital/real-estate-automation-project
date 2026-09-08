import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

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

/** Routes actually usable, plus the ones skipped for want of a parameter. */
export function splitRoutes(opts: RouteOpts = {}): { usable: string[]; skipped: string[] } {
  const all = appRoutes(opts)
  return {
    usable: all.filter((r) => !r.startsWith('SKIPPED:')),
    skipped: all.filter((r) => r.startsWith('SKIPPED:')).map((r) => r.slice(8)),
  }
}
