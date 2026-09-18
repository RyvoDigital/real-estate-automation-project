import type { CriterionKind, Requirement } from './criteria'

/**
 * What a lead requires NOW, out of everything they have ever said.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Between two statements we can order, the later one is the lead's        │
 * │ current position. Between two we cannot order, we take the one that     │
 * │ excludes the least — and we say that we did.                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Both halves come from one asymmetry, which is the same one §4.1 rests on:
 * **being too loose is visible and recoverable — the agent reads the reasoning
 * and discards the match. Being too tight is invisible.** The lead never learns
 * what they were not shown, and neither does the agent. So where we must guess,
 * we guess toward inclusion, and the guess is stated rather than absorbed.
 *
 * WHAT THIS FIXES, MEASURED AGAINST THE ENGINE ON 18 SEPTEMBER 2026
 *
 *   "ate 800 mil" then "afinal podemos ir ate 1 milhao"
 *     -> a €950,000 listing REFUSED — by the lead's own earlier sentence, with
 *        both facts printed in the reasoning side by side
 *
 *   "Procuro T3 em Cascais." then "Tambem estamos a ver em Estoril."
 *     -> NOTHING matched, anywhere: Cascais failed for not being Estoril and
 *        Estoril failed for not being Cascais
 *
 * The second is the one to keep in mind when editing this file. `scoreListing`
 * requires EVERY hard requirement to hold, so two requirements of the same kind
 * are an AND — and for a kind whose value is already a list of alternatives,
 * an AND is exactly backwards. Accumulating means ONE requirement holding both
 * values, never two requirements holding one each.
 */

/**
 * Kinds whose value is a set of ALTERNATIVES — any one of them satisfies it.
 *
 * `areaAccepted` takes `wanted: string[]` and passes if the listing matches any
 * of them; `property_type` compares against a list the same way. So two
 * statements about these merge into one requirement with the union of values.
 * Every other kind is a separate thing the lead wants, and two of them are a
 * genuine AND: a garden and a pool are two requirements, not one.
 */
const ALTERNATIVE_KINDS: CriterionKind[] = ['area', 'property_type']

/**
 * Kinds that can only have ONE true value at a time, so two statements about
 * them contradict rather than accumulate.
 *
 * `bedrooms` is here only when the requirement is HARD — a hard floor is a
 * single fact ("at least three"), while two bedroom PREFERENCES are how
 * `hedge.ts` deliberately represents "probably three, four would be better"
 * and must survive untouched.
 */
function isSingleValued(r: Requirement): boolean {
  return r.kind === 'budget' || (r.kind === 'bedrooms' && r.strength === 'hard')
}

type Budget = { min: number | null; max: number | null }

const STRONGEST = (a: Requirement, b: Requirement) =>
  a.strength === 'hard' || b.strength === 'hard' ? 'hard' : 'preference'

/** A stable key for "the lead said this same thing again". */
function duplicateKey(r: Requirement): string {
  return `${r.kind}:${JSON.stringify(r.value)}`
}

/**
 * Which of two readings excludes less?
 *
 * Only reached when nothing can be ordered. For a budget, the higher ceiling
 * and the lower floor; for a hard bedroom count, the lower floor.
 */
function widest(a: Requirement, b: Requirement): Requirement {
  if (a.kind === 'budget') {
    const x = a.value as Budget
    const y = b.value as Budget
    // A null max is no ceiling at all, which excludes nothing.
    if (x.max === null) return a
    if (y.max === null) return b
    return y.max > x.max ? b : a
  }
  return (b.value as number) < (a.value as number) ? b : a
}

/**
 * `rule` is the CODE and `why` is the English gloss.
 *
 * The renderer reads the code — a reason composed in Portuguese must not be
 * produced by parsing an English sentence, which is what "why" would force.
 * `why` survives for logs and for a reader of the raw row.
 */
function supersede(
  loser: Requirement,
  winner: Requirement,
  rule: 'later' | 'widest',
  why: string,
): Requirement {
  return { ...loser, supersededBy: { evidence: winner.evidence, why, rule } }
}

/**
 * Collapse duplicates, union the alternatives, resolve the contradictions.
 *
 * Called by the extractor, so the only producer of conversation requirements
 * cannot skip it. `scoreListing` then refuses to judge anything carrying
 * `supersededBy`, which is what makes the marking load-bearing rather than
 * decorative.
 */
export function resolveRequirements(reqs: Requirement[]): Requirement[] {
  /*
   * ORDER IN IS ORDER OUT.
   *
   * The resolved list is what the agent reads — `scoreListing` builds its
   * reasons by walking it — so a requirement must not move just because it
   * happened to be resolved in a later pass. Caught by an existing hedge test
   * whose contents were identical and whose ORDER had changed, which is the
   * cheapest possible way to find out that a list has a meaning.
   */
  const firstSeen = new Map<string, number>()
  reqs.forEach((r, i) => {
    const k = duplicateKey(r)
    if (!firstSeen.has(k)) firstSeen.set(k, i)
  })
  const at = (r: Requirement) => firstSeen.get(duplicateKey(r)) ?? Number.MAX_SAFE_INTEGER

  // ---- 1. the same wish, stated twice ------------------------------------
  // Not a conflict — a duplicate. Two requirements for one wish distort the
  // preference ratio, which is what `strength` is computed from, so a lead who
  // mentioned the garden twice would score differently from one who mentioned
  // it once and meant the same thing.
  const byDuplicate = new Map<string, Requirement>()
  for (const r of reqs) {
    const k = duplicateKey(r)
    const seen = byDuplicate.get(k)
    if (!seen) {
      byDuplicate.set(k, r)
      continue
    }
    byDuplicate.set(k, {
      ...(seen.strength === 'hard' ? seen : r),
      strength: STRONGEST(seen, r),
      evidence: (seen.strength === 'hard' ? seen.evidence : r.evidence) ?? seen.evidence ?? r.evidence,
    })
  }
  const deduped = [...byDuplicate.values()]

  // ---- 2. alternatives accumulate into ONE requirement --------------------
  const out: Requirement[] = []
  for (const kind of ALTERNATIVE_KINDS) {
    const group = deduped.filter((r) => r.kind === kind)
    if (group.length === 0) continue
    if (group.length === 1) {
      out.push(group[0])
      continue
    }
    const values = [...new Set(group.flatMap((r) => r.value as string[]))]
    const strongest = group.some((r) => r.strength === 'hard') ? 'hard' : 'preference'
    const anchor = group.find((r) => r.strength === strongest) ?? group[0]
    const merged: Requirement = {
      ...anchor,
      value: values,
      strength: strongest,
      why: `named ${values.join(' and ')} — a place is where they will live, not a preference`,
    }
    // The union sits where the FIRST of its parts was said.
    firstSeen.set(duplicateKey(merged), Math.min(...group.map(at)))
    out.push(merged)
  }

  // ---- 3. single-valued kinds contradict, and are resolved ----------------
  const rest = deduped.filter((r) => !ALTERNATIVE_KINDS.includes(r.kind))
  const contested = new Map<string, Requirement[]>()
  for (const r of rest) {
    if (!isSingleValued(r)) {
      out.push(r)
      continue
    }
    const k = `${r.kind}:${r.strength}`
    contested.set(k, [...(contested.get(k) ?? []), r])
  }

  for (const group of contested.values()) {
    if (group.length === 1) {
      out.push(group[0])
      continue
    }

    const orderable = group.every((r) => typeof r.order === 'number')
    if (orderable) {
      const winner = group.reduce((a, b) => ((b.order as number) > (a.order as number) ? b : a))
      for (const r of group) {
        out.push(r === winner ? r : supersede(r, winner, 'later', 'a later statement replaced it'))
      }
      continue
    }

    const winner = group.reduce((a, b) => widest(a, b))
    for (const r of group) {
      out.push(
        r === winner
          ? r
          : supersede(
              r,
              winner,
              'widest',
              'two statements could not be ordered, so the one excluding least was used',
            ),
      )
    }
  }

  return out
    .map((r, i) => ({ r, pos: at(r), i }))
    .sort((a, b) => a.pos - b.pos || a.i - b.i)
    .map(({ r }) => r)
}
