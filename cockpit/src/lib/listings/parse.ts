import { parseBedrooms, parseMoney } from '@/lib/import/normalise'
import { statusFromText, type ListingStatus } from './status'

/**
 * A listing out of a WhatsApp message.
 *
 * §3: the entry point is WhatsApp, because it is the number the agent already
 * uses and there is nothing new to log into. What arrives is a sentence, not a
 * form:
 *
 *   "Novo: Ref A-1042, T4 moradia em Cascais com jardim e piscina, 320m2,
 *    1.950.000€"
 *
 * The money and bedroom readers are IMPORTED from the CSV importer rather than
 * rewritten. Same market, same conventions — "1.950.000" and "T4" mean the same
 * thing whether they arrive in a spreadsheet cell or a WhatsApp message — and a
 * second copy would drift from the tested one (lesson 15).
 *
 * Everything here is a best effort that reports its own confidence. The raw
 * message is stored alongside, so a wrong parse is visible as a wrong parse
 * rather than as a listing that quietly says the wrong price.
 */

export type ParsedListing = {
  reference: string | null
  property_type: string | null
  bedrooms: number | null
  area: string | null
  price: number | null
  size_sqm: number | null
  features: string[]
  /** A status change rather than a new listing, e.g. "A-1042 vendido". */
  statusChange: ListingStatus | null
  /** Fields the parser could not fill. The operator is shown these, not a
   *  confident-looking listing with silent gaps. */
  missing: string[]
}

const TYPES: [RegExp, string][] = [
  [/\b(moradia|villa|house|casa|chalet)\b/i, 'house'],
  [/\b(apartamento|apartment|flat|piso|andar)\b/i, 'apartment'],
  [/\b(terreno|plot|land|solar)\b/i, 'plot'],
  [/\b(loja|escrit[óo]rio|commercial|office|retail)\b/i, 'commercial'],
  [/\b(quinta|farm|estate|herdade)\b/i, 'estate'],
]

const FEATURES: [RegExp, string][] = [
  [/\b(jardim|garden|jard[íi]n)\b/i, 'garden'],
  [/\b(piscina|pool)\b/i, 'pool'],
  [/\b(garagem|garage|parking|estacionamento)\b/i, 'parking'],
  [/\b(terra[çc]o|terrace|terraza)\b/i, 'terrace'],
  [/\b(vista mar|sea view|vistas? ao mar|vista para o mar)\b/i, 'sea view'],
  [/\b(varanda|balcony|balc[óo]n)\b/i, 'balcony'],
  [/\b(elevador|lift|elevator)\b/i, 'lift'],
  [/\b(remodelad[oa]|renovated|reformad[oa])\b/i, 'renovated'],
]

/** "Ref A-1042", "refª 7781", or a bare code like A-1042 among the words. */
function reference(text: string): string | null {
  const labelled = text.match(/\b(?:ref|refª|ref\.|refer[êe]ncia|reference)\s*[:.º#-]?\s*([A-Za-z0-9][A-Za-z0-9/-]{1,19})\b/i)
  if (labelled) return labelled[1].toUpperCase()
  // A bare code: at least one letter and one digit, or 4+ digits. Deliberately
  // narrow — "T4" and "320m2" must not be mistaken for a reference.
  const bare = text.match(/(?:^|[\s,;·])([A-Z]{1,3}-?\d{3,6}|\d{5,8})(?=[\s,;.·]|$)/)
  return bare ? bare[1].toUpperCase() : null
}

function size(text: string): number | null {
  // No trailing \b: `²` is not a word character, so "320m²" has no boundary
  // after it and the unit went unrecognised — which lost the size AND let the
  // price reader treat "320m" as 320 million.
  const m = text.match(/(\d[\d.,]{0,8})\s*(?:m2|m²|m³|mts?2|sqm|metros quadrados)/i)
  if (!m) return null
  const n = Number(m[1].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 && n < 100_000 ? Math.round(n) : null
}

/**
 * Price. Only a token that actually looks like money — a currency mark, a
 * scale suffix, or six-plus digits.
 *
 * "320m2" and "T4" are numbers in the same sentence and must never be read as
 * a price. A listing with a wrong price is worse than one with no price: the
 * first is matched against budgets and put in front of buyers, the second is
 * reported as missing.
 */
function price(text: string): number | null {
  const re = /(?:[€$£]\s?[\d.,]+(?:\s?[kmKM])?|[\d.,]+\s?(?:[€$£]|eur|euros)|[\d.,]+\s?[kmKM]\b|\b\d{1,3}(?:[.,]\d{3}){2,}\b|\b\d{6,9}\b)/g

  for (const m of text.matchAll(re)) {
    const token = m[0]
    const after = text.slice((m.index ?? 0) + token.length, (m.index ?? 0) + token.length + 2)

    // THE UNIT CAN FALL OUTSIDE THE MATCHED TOKEN. In "320m²" the candidate is
    // "320m" and the "²" is the next character, so a guard that only inspected
    // the token found nothing wrong and parseMoney read it as 320 MILLION —
    // beating a real price of 1.950.000€ later in the same sentence. The first
    // version of this guard checked only the token, had a test, and the test
    // passed because "320m2" never became a candidate at all: the mechanism
    // was never exercised (lessons §1, #7). Found by removing the guard and
    // watching nothing fail.
    if (/^[²³2]/.test(after)) continue
    if (/m2|m²|sqm|mts/i.test(token)) continue

    const v = parseMoney(token)
    // A price under €10k in this market is a fee, a deposit or a misread.
    if (v !== null && v >= 10_000) return v
  }
  return null
}

/** §4.3: areas come from the client's config. No gazetteer of Portugal. */
function area(text: string, knownAreas: string[]): string | null {
  const t = text.toLowerCase()
  const hit = knownAreas
    .map((a) => a.trim())
    .filter(Boolean)
    .filter((a) => new RegExp(`(?:^|[^\\p{L}])${a.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(t))
    // Longest first, so "Quinta da Marinha" wins over "Marinha".
    .sort((a, b) => b.length - a.length)
  return hit[0] ?? null
}

export function parseListingMessage(text: string, knownAreas: string[] = []): ParsedListing {
  const s = (text ?? '').trim()

  const out: ParsedListing = {
    reference: reference(s),
    property_type: TYPES.find(([re]) => re.test(s))?.[1] ?? null,
    bedrooms: (s.match(/\b[TtVv]\s?\d{1,2}\b/) || s.match(/\b\d{1,2}\s*(?:bed|bedroom|quarto|dorm|hab)/i))
      ? parseBedrooms((s.match(/\b[TtVv]\s?\d{1,2}\b/) ?? s.match(/\b\d{1,2}\s*(?:bed|bedroom|quarto|dorm|hab)\w*/i))![0])
      : null,
    area: area(s, knownAreas),
    price: price(s),
    size_sqm: size(s),
    features: FEATURES.filter(([re]) => re.test(s)).map(([, f]) => f),
    statusChange: null,
    missing: [],
  }

  // A short message naming a reference and a status is a STATUS CHANGE, not a
  // new listing. "A-1042 vendido" must not create a second listing that then
  // matches nothing while the original goes on matching everything.
  const status = statusFromText(s)
  if (status && out.reference && !out.price && !out.bedrooms) {
    out.statusChange = status
  }

  for (const [k, v] of Object.entries(out)) {
    if (k === 'missing' || k === 'statusChange' || k === 'features') continue
    if (v === null) out.missing.push(k)
  }
  if (out.features.length === 0) out.missing.push('features')

  return out
}
