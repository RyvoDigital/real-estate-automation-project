/**
 * What a lead actually requires, derived from what they said.
 *
 * §4.1 is the whole product: "A CRM treats every criterion as a filter. That is
 * the flaw to exploit." People say "we couldn't live without a garden" and
 * "it'd be nice if it faced south" and mean entirely different things. A form
 * cannot tell them apart. A conversation can.
 *
 * So a requirement carries THREE things a CRM field does not:
 *   - strength: hard or preference
 *   - evidence: the lead's own words that established it
 *   - source:   a stored field, or something they said
 *
 * EVERY QUOTED PHRASE IS VERIFIED AGAINST THE LEAD'S ACTUAL MESSAGES before it
 * can be used. A model asked to justify a match will produce a plausible quote
 * whether or not one exists, and a fabricated quote in an agent's notification
 * is §0 of the lessons file — a generated message asserting something untrue,
 * which the agent then repeats to the lead in their own voice.
 */

export type CriterionKind = 'budget' | 'area' | 'bedrooms' | 'property_type' | 'feature'

export type Requirement = {
  kind: CriterionKind
  /** budget: {min,max} · area: string[] · bedrooms: number · feature: string */
  value: unknown
  strength: 'hard' | 'preference'
  /** The lead's own words. Null when it came from a stored field. */
  evidence: string | null
  source: 'field' | 'conversation'
  /** Why we read it that way — shown to the agent, never to the lead. */
  why: string
}

/** Budget flexibility stated in words: "we could stretch for the right place". */
export type Flexibility = { flexible: boolean; evidence: string | null }

const HARD_MARKERS = [
  // Portuguese
  'não abdico', 'nao abdico', 'não abdicamos', 'nao abdicamos', 'não abdicar', 'nao abdicar',
  'essencial', 'imprescindível', 'imprescindivel', 'obrigatório', 'obrigatorio',
  'tem de ter', 'tem que ter', 'tem mesmo de', 'sem isso não', 'sem isso nao',
  'não prescindo', 'nao prescindo', 'condição', 'condicao',
  // English
  "couldn't live without", "could not live without", "can't live without",
  'non-negotiable', 'nonnegotiable', 'must have', 'must be', 'essential',
  'deal breaker', 'dealbreaker', 'we need', 'has to have', 'have to have',
  // Spanish
  'imprescindible', 'innegociable', 'tiene que tener', 'no podemos vivir sin',
]

const PREFERENCE_MARKERS = [
  'seria bom', 'seria ótimo', 'seria otimo', 'preferia', 'preferíamos', 'preferiamos',
  'de preferência', 'de preferencia', 'idealmente', 'se possível', 'se possivel',
  'gostaríamos', 'gostariamos', 'se der', 'se houver',
  "it'd be nice", 'it would be nice', 'would be nice', 'ideally', 'if possible',
  'we would like', "we'd like", 'prefer', 'nice to have', 'bonus',
  'sería bueno', 'seria bueno', 'preferiría', 'preferiria', 'si es posible',
]

const FLEXIBLE_MARKERS = [
  'podemos esticar', 'podíamos esticar', 'podiamos esticar', 'há margem', 'ha margem',
  'flexível', 'flexivel', 'pelo sítio certo', 'pelo sitio certo', 'pela casa certa',
  'se for o sítio certo', 'se for o sitio certo', 'algum espaço', 'algum espaco',
  'could stretch', 'would stretch', 'can stretch', 'for the right place',
  'for the right property', 'some flexibility', 'a bit more', 'push to',
  'podríamos estirar', 'podriamos estirar', 'hay margen', 'flexible',
]

/**
 * Normalising before any comparison.
 *
 * THE APOSTROPHE IS NOT COSMETIC. iOS and Android autocorrect a typed
 * apostrophe to U+2019 (’), so a real lead writing "we couldn’t live without a
 * garden" would not have matched a marker list written with U+0027 ('). The
 * hard constraint would have been read as a preference and the engine would
 * have shown them houses with no garden — silently, because nothing reports a
 * constraint that was quietly downgraded.
 *
 * Same class as lessons §6c: a character-class assumption is a locale
 * assumption, and here it is a KEYBOARD assumption. Dashes get the same
 * treatment for the same reason.
 */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[\u2018\u2019\u02bc\u00b4`]/g, "'")
    .replace(/[\u2010-\u2015]/g, '-')

/** The sentence a marker appears in — the quote an agent will read. */
function sentenceAround(text: string, marker: string): string | null {
  // norm() must not change the LENGTH of the string, or the index it returns
  // would not line up with the original text and the quote would be sliced in
  // the wrong place. Every replacement above is one character for one.
  const t = norm(text)
  if (t.length !== text.length) return null
  const i = t.indexOf(norm(marker))
  if (i === -1) return null
  const before = text.lastIndexOf('.', i)
  const beforeQ = Math.max(before, text.lastIndexOf('?', i), text.lastIndexOf('!', i), text.lastIndexOf('\n', i))
  let end = text.length
  for (const p of ['.', '?', '!', '\n']) {
    const j = text.indexOf(p, i)
    if (j !== -1 && j < end) end = j + 1
  }
  return text.slice(beforeQ + 1, end).trim() || null
}

/**
 * Is a stated criterion hard or a preference?
 *
 * Defaults to PREFERENCE when nothing in the words says otherwise. Treating an
 * unmarked wish as a hard constraint would silently exclude listings the lead
 * would have wanted to see — a CRM's mistake, made by us.
 */
export function strengthOf(text: string): { strength: 'hard' | 'preference'; evidence: string | null; marker: string | null } {
  for (const m of HARD_MARKERS) {
    const s = sentenceAround(text, m)
    if (s) return { strength: 'hard', evidence: s, marker: m }
  }
  for (const m of PREFERENCE_MARKERS) {
    const s = sentenceAround(text, m)
    if (s) return { strength: 'preference', evidence: s, marker: m }
  }
  return { strength: 'preference', evidence: null, marker: null }
}

/** Did the lead say their budget has room in it? */
export function budgetFlexibility(texts: string[]): Flexibility {
  for (const t of texts) {
    for (const m of FLEXIBLE_MARKERS) {
      const s = sentenceAround(t, m)
      if (s) return { flexible: true, evidence: s }
    }
  }
  return { flexible: false, evidence: null }
}

/**
 * THE GUARD. A quote survives only if the lead really said it.
 *
 * Compared on normalised text so punctuation and case do not matter, but the
 * words themselves must be present. Anything else is discarded and the match
 * keeps its field-derived reasoning — a weaker notification is recoverable, an
 * invented one is not.
 */
export function verifyQuote(quote: string, leadMessages: string[]): boolean {
  const q = norm(quote).replace(/\s+/g, ' ').trim()
  if (q.length < 8) return false
  return leadMessages.some((m) => norm(m).replace(/\s+/g, ' ').includes(q))
}

export function keepOnlyVerifiedEvidence(reqs: Requirement[], leadMessages: string[]): Requirement[] {
  return reqs.map((r) =>
    r.evidence && !verifyQuote(r.evidence, leadMessages)
      ? { ...r, evidence: null, why: `${r.why} (a quoted phrase was discarded: it is not in this lead's messages)` }
      : r,
  )
}
