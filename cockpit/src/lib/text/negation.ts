/**
 * Is a matched phrase negated?
 *
 * ONE implementation, shared. This guard was written for listing status
 * changes — "not sold" must not read as `sold` — and then NOT applied to the
 * matching engine's hard/preference markers, in the same session. The result:
 *
 *   "O jardim não é obrigatório mas faz muita diferença para nós."
 *   -> HARD constraint: garden
 *
 * The lead said a garden is NOT required. We recorded it as non-negotiable and
 * would have excluded every listing without one — showing them fewer
 * properties, with nothing to indicate why.
 *
 * Two copies of a rule diverge; one copy applied in one place and forgotten in
 * another is the same failure arriving sooner (lesson 15). Both callers import
 * this.
 */

/** Words that invert whatever follows them, in the three languages we serve. */
export const NEGATORS = [
  'not', 'no', 'never', "isn't", 'isnt', "aren't", "don't", 'dont', "doesn't", 'doesnt',
  'não', 'nao', 'nem', 'sem', 'nunca',
  'ni', 'ya no', 'todavía no', 'todavia no', 'tampoco',
]

/** Phrases that read as indifference — "not fussed about", "don't mind". */
export const DISMISSALS = [
  'not fussed', 'not bothered', 'not important', "doesn't matter", 'does not matter',
  "don't mind", 'dont mind', 'no big deal', 'not a priority', 'not essential',
  'não importa', 'nao importa', 'tanto faz', 'indiferente', 'não faz diferença',
  'no importa', 'da igual', 'no es importante',
]

const APOSTROPHES = /[‘’ʼ´`]/g

/** Length-preserving, so an index into the normalised text still lines up. */
export function normaliseForMatching(s: string): string {
  return s.toLowerCase().normalize('NFC').replace(APOSTROPHES, "'").replace(/[‐-―]/g, '-')
}

/**
 * Does a negator appear in the ~28 characters before `index`, in the same clause?
 *
 * A window rather than the whole sentence: "we don't want a pool, but the
 * garden is essential" must not have `essential` negated by the `don't` at the
 * start.
 *
 * AND THE WINDOW STOPS AT A CLAUSE BOUNDARY, which the first version did not:
 *
 *   "Na verdade não, precisamos mesmo de um jardim."
 *
 * The `não` refutes what the lead said BEFORE — it is the "actually, no" of a
 * correction — and the clause after the comma is the requirement being stated.
 * Read across the comma, the lead's clearest possible upgrade of a wish into a
 * requirement is silently inverted into no requirement at all. A negator in a
 * different clause negates a different thing, and the punctuation is the only
 * evidence of that we get.
 */
const CLAUSE_END = /[,;:]/g

export function negatedAt(text: string, index: number, window = 28): boolean {
  let before = normaliseForMatching(text).slice(Math.max(0, index - window), index)
  let cut = -1
  for (const m of before.matchAll(CLAUSE_END)) cut = m.index
  if (cut !== -1) before = before.slice(cut + 1)
  return NEGATORS.some((n) => new RegExp(`(?:^|[^\\p{L}])${n}(?![\\p{L}])`, 'iu').test(before))
}

/** Is this sentence dismissing the thing rather than asking for it? */
export function isDismissal(sentence: string): boolean {
  const s = normaliseForMatching(sentence)
  return DISMISSALS.some((d) => s.includes(normaliseForMatching(d)))
}
