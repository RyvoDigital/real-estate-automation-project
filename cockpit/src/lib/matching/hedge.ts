import { normaliseForMatching } from '@/lib/text/negation'

/**
 * A hedged requirement is TWO requirements.
 *
 * "We'd probably want three bedrooms but four would be better" is the phrasing
 * a real lead uses. "We couldn't live without a garden" is the phrasing a demo
 * uses. An engine that only reads the second works in the demo.
 *
 * The decomposition: the LOWER number is the floor, the HIGHER is what they
 * would rather have. Both are emitted, and the existing scorer already does
 * the right thing with two requirements of the same kind:
 *
 *   "probably three, four would be better"  -> preference 3 + preference 4
 *      a 3-bed meets one of two   -> possible
 *      a 4-bed meets both         -> strong
 *
 *   "two minimum, three if the price works" -> HARD 2 + preference 3
 *      a 1-bed is excluded outright
 *      a 2-bed matches, missing the preference
 *      a 3-bed matches strongly
 *
 * The floor is only HARD when the lead said so — "minimum", "at least", "pelo
 * menos". Without that, a hedge is a hedge, and promoting it to a hard
 * constraint would exclude listings on the strength of the word "probably".
 */

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, 'três': 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8,
  uno: 1, dos: 2, cuatro: 4,
}

const FLOOR_MARKERS = [
  'minimum', 'at least', 'no less than', 'nothing under',
  'no mínimo', 'no minimo', 'pelo menos', 'mínimo', 'minimo',
  'al menos', 'como mínimo', 'como minimo',
]

/** Anything that introduces the better option rather than a second subject. */
const UPGRADE_MARKERS = [
  'but', 'though', 'although', 'ideally', 'preferably', 'better', 'rather',
  'or ', 'if ',
  'mas', 'embora', 'idealmente', 'de preferência', 'de preferencia', 'melhor', 'ou ',
  'pero', 'aunque', 'mejor', 'preferiblemente',
]

export type Hedge = {
  floor: number
  preferred: number | null
  /** The lead said the floor is a floor, not a hope. */
  floorIsHard: boolean
}

/**
 * Bedroom counts in one sentence, in order, however they are written.
 *
 * Only counts that sit near a bedroom word, so "three bedrooms under 900" does
 * not read 900 as a second bedroom count.
 */
function bedroomNumbers(sentence: string): number[] {
  const s = normaliseForMatching(sentence)
  const out: (number | null)[] = []
  const unit = '(?:bed|bedroom|quarto|dorm|hab)\\w*'
  const num = `(?:\\d{1,2}|${Object.keys(WORDS).join('|')})`

  // "three bedrooms", "T3", and a bare number that follows one of those.
  for (const m of s.matchAll(new RegExp(`\\b(${num})\\s*${unit}`, 'giu'))) out.push(toNum(m[1]))
  for (const m of s.matchAll(/\b[tv]\s?(\d{1,2})\b/giu)) out.push(Number(m[1]))
  /*
   * A bare number beside an upgrade marker, with no unit of its own. It sits
   * on EITHER side, and the first version only looked on one:
   *
   *   "three bedrooms but four would be better"   -> marker, then number
   *   "two bedrooms minimum, three if the price"  -> number, then marker
   *
   * The second is the phrasing that lost its preference entirely.
   */
  if (out.length) {
    const markers = UPGRADE_MARKERS.map((u) => u.trim()).join('|')
    for (const m of s.matchAll(new RegExp(`(?:${markers})\\s+(${num})\\b`, 'giu'))) {
      const n = toNum(m[1])
      if (n !== null && !out.includes(n)) out.push(n)
    }
    for (const m of s.matchAll(new RegExp(`\\b(${num})\\s+(?:${markers})\\b`, 'giu'))) {
      const n = toNum(m[1])
      if (n !== null && !out.includes(n)) out.push(n)
    }
  }
  return out.filter((n): n is number => n !== null && n >= 0 && n <= 20)
}

function toNum(token: string): number | null {
  const t = token.toLowerCase()
  if (/^\d+$/.test(t)) return Number(t)
  return WORDS[t] ?? null
}

export function decomposeBedrooms(sentence: string): Hedge | null {
  const nums = [...new Set(bedroomNumbers(sentence))].sort((a, b) => a - b)
  if (nums.length === 0) return null

  const s = normaliseForMatching(sentence)
  const floorIsHard = FLOOR_MARKERS.some((f) => s.includes(normaliseForMatching(f)))

  if (nums.length === 1) return { floor: nums[0], preferred: null, floorIsHard }
  return { floor: nums[0], preferred: nums[nums.length - 1], floorIsHard }
}
