import { budgetFlexibility, strengthOf, verifyQuote, type Requirement } from './criteria'
import { parseBedrooms, parseMoney } from '@/lib/import/normalise'
import { decomposeBedrooms } from './hedge'
import { resolveRequirements } from './recency'

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

/**
 * An agent is not a buyer, and must never be matched as one.
 *
 * F2's tie-break sends a listing message down the LEAD path when the sender's
 * number is also a lead — deliberately, because a prospect getting no reply is
 * worse than a listing needing re-sending. The consequence showed up here: the
 * listing text then becomes part of that lead's extracted requirements. The
 * operator's own number now looks like a buyer who wants a property in Estoril,
 * because of a test message.
 *
 * Excluding the lead entirely is the safer of the two options — flagging it as
 * test data leaves a real-looking lead in the matching set, and the next person
 * to add a matching surface has to remember the flag. This one cannot be
 * forgotten: the extractor refuses and says why.
 */
export type AgentExclusion = { excluded: true; reason: string }

export type Extraction = {
  requirements: Requirement[]
  budgetFlexible: boolean
  budgetEvidence: string | null
  /** Sentences that look like a requirement but could not be turned into one. */
  unparsed: string[]
  /** Set when this lead is an agent and must not be matched at all. */
  excluded?: AgentExclusion
}

/**
 * Digits only, with the international `00` prefix folded away.
 *
 * "00351933048230" and "+351933048230" are the same number, and `00` is how
 * most of Europe writes it — an operator entering the agent number that way
 * would have found the branch silently never firing. The same comparison lives
 * in the Concierge's IsAgentSender condition and had the same gap.
 *
 * A bare national number ("933048230") is deliberately NOT folded in: resolving
 * it needs a country, and guessing one could match a different person's number
 * in another country.
 */
const digits = (s: string) => String(s ?? '').replace(/\D/g, '').replace(/^00/, '')

/** Is this lead's own number configured as an agent for their client? */
export function isAgentNumber(phone: string | null, agentNumbers: string[]): boolean {
  const p = digits(phone ?? '')
  return Boolean(p) && agentNumbers.some((n) => digits(n) === p)
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

export function extractForLead(input: {
  phone: string | null
  messages: string[]
  knownAreas: string[]
  agentNumbers: string[]
}): Extraction {
  if (isAgentNumber(input.phone, input.agentNumbers)) {
    return {
      requirements: [],
      budgetFlexible: false,
      budgetEvidence: null,
      unparsed: [],
      excluded: {
        excluded: true,
        reason: `${input.phone} is configured as an agent number for this client, so its messages are listings, not requirements. An agent is not matched as a buyer.`,
      },
    }
  }
  return extractFromMessages(input.messages, input.knownAreas)
}

/**
 * One thing the lead — or their file — said, and whether it can be placed in a
 * sequence relative to the others.
 *
 * `conversation` statements are ordered by their position in the list, which
 * is the order they arrived in. Everything else is UNORDERABLE: a notes cell
 * is one statement written over years by several people with no inside order,
 * and nothing can be said about where an agent's remark sits relative to what
 * the lead said. See recency.ts for what each case does.
 *
 * An agent's remark is deliberately unorderable rather than "now". Treating it
 * as the latest word would let it narrow what the lead themselves said, and
 * whether an agent's reading outranks the lead's own words is a decision for
 * when the triage flow is built, not a side effect of a type.
 */
export type Statement = {
  text: string
  source: 'conversation' | 'note' | 'agent'
  /** Recorded, never used to order. Null where the moment is unknown. */
  at?: string | null
}

export function extractFromMessages(leadMessages: string[], knownAreas: string[]): Extraction {
  return extractFromStatements(
    leadMessages.map((text) => ({ text, source: 'conversation' as const })),
    knownAreas,
  )
}

export function extractFromStatements(statements: Statement[], knownAreas: string[]): Extraction {
  const requirements: Requirement[] = []
  const unparsed: string[] = []
  const leadMessages = statements.map((st) => st.text)
  const flex = budgetFlexibility(leadMessages)

  // Longest first, so "Quinta da Marinha" is found before "Marinha" and the
  // shorter name inside it is not reported as a second area. Same rule as the
  // listing parser, for the same reason.
  const areasByLength = [...knownAreas].sort((a, b) => b.length - a.length)

  let seq = 0
  for (const statement of statements) {
    const message = statement.text
    const ordered = statement.source === 'conversation'
    /** Requirements the PREVIOUS sentence produced, for the §1.4 attachment. */
    let previous: Requirement[] = []

    for (const s of sentences(message)) {
      const order = ordered ? seq++ : null
      const { strength, evidence, dismissed, marker } = strengthOf(s)
      // "Not fussed about a pool" mentions a pool and asks for nothing.
      if (dismissed) { unparsed.push(`${s}  (read as indifference, not a requirement)`); previous = []; continue }
      let found = false
      const mine: Requirement[] = []

      for (const [re, feature] of FEATURE_WORDS) {
        if (!re.test(s)) continue
        found = true
        mine.push({
          kind: 'feature', value: feature, strength,
          evidence: evidence ?? s,
          source: statement.source, order, statedAt: statement.at ?? null,
          why: evidence ? 'stated with a phrase that marks its strength' : 'mentioned, with nothing marking it as essential',
        })
      }

      /*
       * A hedged bedroom count is TWO requirements — see hedge.ts. The floor
       * is only hard when the lead said "minimum" or "pelo menos"; otherwise
       * both are preferences and the scorer does the rest: a listing at the
       * floor meets one of two, a listing at the preferred count meets both.
       */
      const hedge = decomposeBedrooms(s)
      if (hedge) {
        found = true
        mine.push({
          kind: 'bedrooms', value: hedge.floor,
          strength: hedge.floorIsHard ? 'hard' : strength,
          evidence: evidence ?? s,
          source: statement.source, order, statedAt: statement.at ?? null,
          why: hedge.floorIsHard ? `said at least ${hedge.floor}` : `said ${hedge.floor}`,
        })
        if (hedge.preferred !== null && hedge.preferred !== hedge.floor) {
          mine.push({
            kind: 'bedrooms', value: hedge.preferred,
            strength: 'preference',
            evidence: evidence ?? s,
            source: statement.source, order, statedAt: statement.at ?? null,
            why: `and said ${hedge.preferred} would be better`,
          })
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
          mine.push({ kind: 'budget', value: { min: null, max: v }, strength: 'hard', evidence: flex.evidence ?? evidence ?? s, source: statement.source, order, statedAt: statement.at ?? null, why: `said ${money[0].trim()}` })
        }
      }

      const area = s.match(AREA_HINT)
      /*
       * EVERY area named, not the first one found.
       *
       * This was `knownAreas.find(...)`, so "Procuro T3 em Cascais ou Estoril"
       * produced a hard constraint for Cascais and DROPPED Estoril — silently,
       * and in the invisible direction: the lead is shown fewer properties and
       * nothing reports the town that went missing. Longest-first so a name
       * contained inside a longer one is not counted twice.
       */
      const named: string[] = []
      for (const a of areasByLength) {
        if (!new RegExp(`(?:^|[^\\p{L}])${a}(?![\\p{L}])`, 'iu').test(s)) continue
        if (named.some((already) => already.toLowerCase().includes(a.toLowerCase()))) continue
        named.push(a)
      }
      if (named.length > 0) {
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
        mine.push({ kind: 'area', value: named, strength: 'hard', evidence: evidence ?? s, source: statement.source, order, statedAt: statement.at ?? null, why: `named ${named.join(' and ')} — a place is where they will live, not a preference` })
      } else if (area) {
        // A place we were not told about. Reported, never invented into a
        // requirement — §4.3, no hardcoded gazetteer.
        unparsed.push(`${s}  (mentions "${area[2]}", which is not in this client's configured areas)`)
      }

      if (!found && /\b(quer|procur|looking|want|need|precis|busco|gostar)\w*/i.test(s)) {
        unparsed.push(s)
      }

      /*
       * A MARKER-ONLY SENTENCE ATTACHES TO THE ONE BEFORE IT.
       *
       *   "Um jardim seria bom. É essencial."
       *
       * `strengthOf` runs per sentence, so "É essencial." had its strength
       * computed and then thrown away — it names no criterion for the strength
       * to attach to. The lead's clearest possible upgrade of a wish into a
       * requirement was read as having said it twice, weakly, and a preference
       * never decides admission.
       *
       * DIRECTIONAL AND ADJACENT-ONLY, deliberately. A sentence carrying its
       * own criterion does not absorb the previous sentence's marker, so
       * "Precisamos de garagem. Um jardim seria bom." keeps the garage hard
       * and leaves the garden a preference. Widening this into a general
       * window is how the garage's marker reaches the garden.
       */
      if (!found && marker && strength === 'hard' && previous.length > 0) {
        for (const r of previous) {
          if (r.strength === 'hard') continue
          r.strength = 'hard'
          // Both sentences, because the agent reading this needs the thing and
          // the words that made it binding. Joined as they appear, so the quote
          // still survives verification against the original message.
          r.evidence = r.evidence ? `${r.evidence} ${s}` : s
          r.why = `${r.why}, and the sentence after it said so`
        }
      }

      requirements.push(...mine)
      previous = found ? mine : []
    }
  }

  // Every quote must survive verification even here, where WE produced it —
  // the sentence splitter can hand back a fragment that is not literally in
  // the message once whitespace is normalised.
  const verified = requirements.map((r) =>
    r.evidence && !verifyQuote(r.evidence, leadMessages) ? { ...r, evidence: null } : r,
  )

  /*
   * RESOLVED HERE, so the only producer of conversation requirements cannot
   * skip it. Two statements about the same single-valued thing contradict, and
   * two about the same set of alternatives accumulate — `scoreListing` requires
   * every hard requirement to hold, so leaving them separate turns "Cascais or
   * Estoril" into "Cascais AND Estoril" and matches nothing anywhere.
   */
  return {
    requirements: resolveRequirements(verified),
    budgetFlexible: flex.flexible,
    budgetEvidence: flex.evidence,
    unparsed,
  }
}
