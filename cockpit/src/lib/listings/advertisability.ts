import { STATUS_LABEL, type ListingStatus } from './status'

/*
 * ═════════════════════════════════════════════════════════════════════════════
 * TWO COLUMNS, TWO VOCABULARIES, AND THEY MAY NEVER SHARE A WORD.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Brief III §5, and the rule that stops §6's confusion being a matter of care.
 *
 *   ESTADO (diz a agência)          what the agent told us, a stored fact
 *   PODE SER ANUNCIADO? (diz a lei) what the gate answers, a computed one
 *
 * 🔴 A LISTING'S ADVERTISABILITY IS NOT ITS STATUS. A `Disponível` property the
 * law refuses and a `Reservado` property the law permits are both ordinary, and
 * a reader who has seen the two columns share a word will merge them forever
 * after.
 *
 * 🔒 SO THE SETS ARE DISJOINT BY CONSTRUCTION AND A TEST ASSERTS IT. Not "we
 * were careful with the wording" — the test fails if any word appears in both,
 * which is what makes the separation survive somebody improving the copy.
 */

/** 🔒 The legal column's four words. None of them appears in STATUS_LABEL. */
export const ADVERTISABILITY_LABEL = {
  can: 'Pode ser anunciado',
  cannot: 'Não pode ser anunciado',
  region_unknown: 'Não sabemos o que a região exige',
  not_asked: 'Não perguntámos',
} as const

export type Advertisability = keyof typeof ADVERTISABILITY_LABEL

/** The operator-facing half, for `/c/<client>/listings`. */
export const ADVERTISABILITY_EN: Record<Advertisability, string> = {
  can: 'May be advertised',
  cannot: 'May not be advertised',
  region_unknown: 'We do not know what the region requires',
  not_asked: 'We did not ask',
}

/**
 * §0.5, and only these four.
 *
 * 🔒 `not_asked` and `region_unknown` are BOTH GREY. One is an absence of a
 * question and the other an absence of an answer; neither is a clock and
 * neither is a refusal, and colouring either would state a conclusion nobody
 * reached.
 */
export const ADVERTISABILITY_TONE: Record<Advertisability, 'through' | 'red' | 'grey'> = {
  can: 'through',
  cannot: 'red',
  region_unknown: 'grey',
  not_asked: 'grey',
}

/**
 * 🔴 WHICH STATUSES ARE NEVER ASKED ABOUT.
 *
 * A sold or withdrawn property reads *we did not ask*, never a verdict.
 * Rendering a computed-looking refusal for a property nobody would advertise
 * states a conclusion nobody reached — it was true and beside the point, and it
 * was found in the render rather than in the source.
 *
 * 🔒 Reserved and under-offer ARE asked. They are held back by the agency, not
 * ended, and the whole argument of this screen is that the two columns move
 * independently — so the case where the law permits a reserved property has to
 * be reachable, or the separation is only asserted.
 */
export const NEVER_ASKED: readonly ListingStatus[] = ['sold', 'withdrawn']

export function isAsked(status: ListingStatus): boolean {
  return !NEVER_ASKED.includes(status)
}

/**
 * Map a gate refusal to the legal column's vocabulary.
 *
 * 🔒 The gate's own reasons, translated once, here. A screen doing this inline
 * would be a second translation that drifts from this one — §1s, a fact
 * changing meaning between functions.
 */
export function advertisabilityFrom(input: {
  status: ListingStatus
  /** Null when nobody has recorded a country for this property. */
  country: string | null
  /** The gate's verdict, or null when it was not asked. */
  verdict: { cleared: boolean; reason?: string } | null
}): Advertisability {
  if (!isAsked(input.status)) return 'not_asked'
  // Nobody said which country. Not a refusal: the gate was never asked, and
  // asking it with a null would produce "we have not analysed this country",
  // which is false about a country we have analysed.
  if (!input.country) return 'not_asked'
  if (!input.verdict) return 'not_asked'
  if (input.verdict.cleared) return 'can'

  const r = input.verdict.reason ?? ''
  // An unresolved jurisdiction is not a refusal about this property. It is the
  // absence of a rule to judge it by.
  if (r === 'no_policy_row' || r === 'region_required' || r === 'region_not_listed') return 'region_unknown'
  return 'cannot'
}

/**
 * 🔒 Every word either column can render, for the disjointness check.
 *
 * Exported so the test drives the SAME values the screen does, rather than a
 * copy of them written in the test — which would pass while the screen
 * disagreed with it.
 */
export function statusWords(): string[] {
  return Object.values(STATUS_LABEL)
}
export function advertisabilityWords(): string[] {
  return [...Object.values(ADVERTISABILITY_LABEL), ...Object.values(ADVERTISABILITY_EN)]
}
