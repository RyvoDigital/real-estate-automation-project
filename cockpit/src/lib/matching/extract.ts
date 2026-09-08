import { budgetFlexibility, strengthOf, verifyQuote, type Requirement } from './criteria'
import { parseBedrooms, parseMoney } from '@/lib/import/normalise'

/**
 * Turning a lead's own messages into requirements.
 *
 * The deterministic half. It runs always, so an unreachable model degrades the
 * quality of the extraction and never the ability to match at all — the same
 * shape as the import mapping (§2.4, no silent degradation).
 *
 * What it deliberately does NOT do is guess. A criterion it cannot find is
 * absent, and absent is reported. A CRM that invents a bedroom count from a
 * sentence that never mentioned one is worse than one with a blank field.
 */

export type Extraction = {
  requirements: Requirement[]
  budgetFlexible: boolean
  budgetEvidence: string | null
  /** Sentences that look like a requirement but could not be turned into one. */
  unparsed: string[]
}

/**
 * People write numbers as words. "three bedrooms" is at least as common as
 * "T3", and the digit-only pattern extracted NOTHING from every hedged phrasing
 * tried — which is the phrasing a real lead actually uses.
 */
const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  um: 1, uma: 1, dois: 2, duas: 2, três: 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8,
  uno: 1, dos: 2, cuatro: 4, cinco_es: 5,
}
const WORD_NUM_RE = new RegExp(`\\b(${Object.keys(WORD_NUMBERS).filter((k) => !k.includes('_')).join('|')})\\s+(?:bed|bedroom|quarto|dorm|hab)\\w*`, 'iu')

const AREA_HINT = /\b(em|in|na|no|around|perto de|zona de)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\p{L}]+(?:\s+[a-zdel]+\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\p{L}]+)?)/u

const FEATURE_WORDS: [RegExp, string][] = [
  [/\b(jardim|garden|jard[íi]n)\b/i, 'garden'],
  [/\b(piscina|pool)\b/i, 'pool'],
  [/\b(garagem|garage|parking|estacionamento)\b/i, 'parking'],
  [/\b(terra[çc]o|terrace|terraza)\b/i, 'terrace'],
  [/\b(vista mar|sea view|vista para o mar)\b/i, 'sea view'],
  [/\b(varanda|balcony|balc[óo]n)\b/i, 'balcony'],
  [/\b(elevador|lift|elevator)\b/i, 'lift'],
  [/\b(sul|south[- ]facing|orientado a sul)\b/i, 'south facing'],
]

/** Split on sentence ends so each requirement carries its own sentence. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?\n])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
}

export function extractFromMessages(leadMessages: string[], knownAreas: string[]): Extraction {
  const requirements: Requirement[] = []
  const unparsed: string[] = []
  const flex = budgetFlexibility(leadMessages)

  for (const message of leadMessages) {
    for (const s of sentences(message)) {
      const { strength, evidence, dismissed } = strengthOf(s)
      // "Not fussed about a pool" mentions a pool and asks for nothing.
      if (dismissed) { unparsed.push(`${s}  (read as indifference, not a requirement)`); continue }
      let found = false

      for (const [re, feature] of FEATURE_WORDS) {
        if (!re.test(s)) continue
        found = true
        requirements.push({
          kind: 'feature', value: feature, strength,
          evidence: evidence ?? s,
          source: 'conversation',
          why: evidence ? 'stated with a phrase that marks its strength' : 'mentioned, with nothing marking it as essential',
        })
      }

      const wordBeds = s.match(WORD_NUM_RE)
      const beds = s.match(/\b[TtVv]\s?\d{1,2}\b/) ?? s.match(/\b\d{1,2}\s*(?:bed|bedroom|quarto|dorm|hab)\w*/i) ?? wordBeds
      if (beds) {
        const n = wordBeds && beds === wordBeds
          ? WORD_NUMBERS[wordBeds[1].toLowerCase()] ?? null
          : parseBedrooms(beds[0])
        if (n !== null) {
          found = true
          requirements.push({ kind: 'bedrooms', value: n, strength, evidence: evidence ?? s, source: 'conversation', why: `said ${beds[0]}` })
        }
      }

      // `mil` is Portuguese for thousand and the only real lead in the database
      // wrote "ate 900 mil". The first version of this regex had no `mil`, so the
      // one real budget we hold was missed.
      const money = s.match(/(?:[€$£]\s?[\d.,]+(?:\s?[kmKM])?|[\d.,]+\s?(?:[€$£]|eur|euros|mil|milh[õo]es|milhao|million)\b|[\d.,]+\s?[kmKM]\b)/i)
      if (money) {
        const v = parseMoney(money[0].replace(/milh[õo]es|milhao|million/i, 'M'))
        if (v !== null) {
          found = true
          requirements.push({ kind: 'budget', value: { min: null, max: v }, strength: 'hard', evidence: flex.evidence ?? evidence ?? s, source: 'conversation', why: `said ${money[0].trim()}` })
        }
      }

      const area = s.match(AREA_HINT)
      const named = knownAreas.find((a) => new RegExp(`(?:^|[^\\p{L}])${a}(?![\\p{L}])`, 'iu').test(s))
      if (named) {
        found = true
        /*
         * AREA IS HARD BY DEFAULT, unlike a feature.
         *
         * "An unmarked wish is a preference" is right for a garden and wrong
         * for a place. A lead naming a town is defining the SEARCH SPACE, not
         * expressing a hope, and treating it as a preference had a measurable
         * consequence: a lead who wrote "T3 em Cascais ate 900 mil" matched a
         * listing in FARO as "possible" — 500km away, presented as plausible,
         * because the only hard constraint left was the budget. §1: too loose
         * and the agency spams its own database and stops trusting the system.
         *
         * Adjacency (§4.3) is what gives this the flexibility it needs, and it
         * is configured per client rather than inferred from a hedge.
         */
        requirements.push({ kind: 'area', value: [named], strength: 'hard', evidence: evidence ?? s, source: 'conversation', why: `named ${named} — a place is where they will live, not a preference` })
      } else if (area) {
        // A place we were not told about. Reported, never invented into a
        // requirement — §4.3, no hardcoded gazetteer.
        unparsed.push(`${s}  (mentions "${area[2]}", which is not in this client's configured areas)`)
      }

      if (!found && /\b(quer|procur|looking|want|need|precis|busco|gostar)\w*/i.test(s)) {
        unparsed.push(s)
      }
    }
  }

  // Every quote must survive verification even here, where WE produced it —
  // the sentence splitter can hand back a fragment that is not literally in
  // the message once whitespace is normalised.
  const verified = requirements.map((r) =>
    r.evidence && !verifyQuote(r.evidence, leadMessages) ? { ...r, evidence: null } : r,
  )

  return { requirements: verified, budgetFlexible: flex.flexible, budgetEvidence: flex.evidence, unparsed }
}
