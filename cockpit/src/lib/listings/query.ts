import { MATCHABLE } from './status'

/**
 * THE MATCHING FILTER, defined once.
 *
 * Both the shipping query in store.ts and the probe that proves it excludes
 * things apply THIS function. A probe that wrote its own copy of the filter
 * would drift from the one that ships and go on reporting confidently from the
 * stale one (lesson 15) — and this is the filter whose failure mode is telling
 * a buyer about a house that sold last week.
 *
 * No `server-only` import here on purpose: the probe has to be able to load it.
 */

/** Structurally whatever supabase-js hands back from `.select()`. */
export type Filterable<T> = { eq(column: string, value: unknown): T }

export function applyMatchable<T extends Filterable<T>>(q: T): T {
  // An ALLOW-LIST of one. Not `.neq('status', 'sold')`, which would silently
  // admit every status invented later.
  if (MATCHABLE.length !== 1) {
    throw new Error(`applyMatchable assumes exactly one matchable status, found ${MATCHABLE.length} — decide deliberately before widening it`)
  }
  return q.eq('status', MATCHABLE[0]) as T
}
