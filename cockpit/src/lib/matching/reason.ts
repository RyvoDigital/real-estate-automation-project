/**
 * Why a listing suits somebody, as data rather than as a sentence.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THE ENGINE DECIDES. IT DOES NOT WRITE.                                  │
 * │                                                                         │
 * │ `score.ts` used to compose English prose — "Cascais is exactly what     │
 * │ they asked for" — one layer below anything that knew who was reading.   │
 * │ The agency is Portuguese. A Portuguese screen and a Portuguese          │
 * │ notification were therefore carrying English sentences produced four    │
 * │ files away, and the place that would have been discovered is an agent   │
 * │ reading their own screen in a meeting.                                  │
 * │                                                                         │
 * │ So the engine emits a REASON: a code and its values. This file is the   │
 * │ only place any of it becomes words, and it does so in a language the    │
 * │ caller names.                                                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * It is not a translation task, which is why it is a seam and not a lookup
 * table bolted onto the old strings: "€2,200,000 is over their €2,000,000,
 * within the 15% they said they could stretch" has a number format, a
 * percentage, a possessive and a clause order that are all different in
 * Portuguese. Translating the finished sentence would produce something that
 * parses and reads translated. Composing from values reads like it was written
 * in the language.
 *
 * ⚠️ Every `Detail` variant must be rendered in EVERY language. `renderReason`
 * is exhaustive over the union with a `never` check, and reason.test.ts walks
 * the whole union against every language — so a new variant does not compile
 * until it can be said in all three, rather than silently falling back to
 * English in front of the one person who would notice.
 */

export type Lang = 'pt' | 'en' | 'es'

export const LANGS: Lang[] = ['pt', 'en', 'es']

const LOCALE: Record<Lang, string> = { pt: 'pt-PT', en: 'en-GB', es: 'es-ES' }

/** Feature identifiers are English in the extractor. They are not words. */
const FEATURE: Record<Lang, Record<string, string>> = {
  pt: {
    garden: 'jardim', pool: 'piscina', parking: 'garagem', terrace: 'terraço',
    'sea view': 'vista mar', balcony: 'varanda', lift: 'elevador',
    'south facing': 'virado a sul',
  },
  // English carries the BARE noun; the article is added by the branch that
  // needs one. "a garden" reads right after `has` and wrong after `no` —
  // "no a south aspect", which is what printing the output actually said. The
  // article belongs to the sentence, not to the word.
  en: {
    garden: 'garden', pool: 'pool', parking: 'parking', terrace: 'terrace',
    'sea view': 'sea view', balcony: 'balcony', lift: 'lift',
    'south facing': 'south aspect',
  },
  es: {
    garden: 'jardín', pool: 'piscina', parking: 'garaje', terrace: 'terraza',
    'sea view': 'vistas al mar', balcony: 'balcón', lift: 'ascensor',
    'south facing': 'orientado al sur',
  },
}

/** An unknown feature is shown as it is, never dropped and never guessed at. */
const feature = (f: string, lang: Lang) => FEATURE[lang][f] ?? f

/**
 * Features that take no article in English. `parking` is the whole list today,
 * and an unmapped feature joins it — guessing an article for a word we do not
 * know is how "a adega" happens.
 */
const NO_ARTICLE = new Set(['parking'])
const enFeature = (f: string) => {
  const noun = feature(f, 'en')
  return NO_ARTICLE.has(f) || !FEATURE.en[f] ? noun : `a ${noun}`
}

const money = (n: number, lang: Lang) => `€${n.toLocaleString(LOCALE[lang])}`

export type Detail =
  | { t: 'budget_inside'; price: number; max: number }
  | { t: 'budget_stretched'; price: number; max: number; pct: number; stated: boolean }
  | { t: 'budget_beyond'; price: number; ceiling: number }
  | { t: 'budget_nothing_to_compare' }
  | { t: 'area_exact'; area: string }
  | { t: 'area_adjacent'; area: string; near: string }
  | { t: 'area_none' }
  | { t: 'area_no'; area: string; wanted: string[] }
  | { t: 'bedrooms_ok'; has: number; want: number }
  | { t: 'bedrooms_no'; has: number; want: number }
  | { t: 'bedrooms_unknown' }
  | { t: 'type_ok'; type: string | null }
  | { t: 'type_no'; type: string | null; wanted: string[] }
  | { t: 'feature_has'; feature: string }
  | { t: 'feature_no'; feature: string }

export type Reason =
  /** Nothing the lead said has to be true of a listing. */
  | { role: 'nothing_binding' }
  /** A hard constraint that held. */
  | { role: 'met'; detail: Detail; evidence: string | null }
  /** A preference the listing misses. Confidence, never admission. */
  | { role: 'missed'; detail: Detail; evidence: string | null }
  /** A hard constraint that failed. */
  | { role: 'failed'; detail: Detail; evidence: string | null }
  /** An earlier statement a later or wider one replaced. */
  | { role: 'superseded'; rule: 'later' | 'widest'; evidence: string | null; instead: string | null }

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

function detailWords(d: Detail, lang: Lang): string {
  const m = (n: number) => money(n, lang)
  switch (d.t) {
    case 'budget_inside':
      return {
        pt: `${m(d.price)} cabe nos ${m(d.max)} que indicou`,
        en: `${m(d.price)} is inside their ${m(d.max)}`,
        es: `${m(d.price)} entra en los ${m(d.max)} que indicó`,
      }[lang]
    case 'budget_stretched':
      return {
        pt: `${m(d.price)} passa os ${m(d.max)}, dentro dos ${d.pct}% ${d.stated ? 'que disse poder esticar' : 'de margem'}`,
        en: `${m(d.price)} is over their ${m(d.max)}, within the ${d.pct}% ${d.stated ? 'they said they could stretch' : 'allowance'}`,
        es: `${m(d.price)} supera los ${m(d.max)}, dentro del ${d.pct}% ${d.stated ? 'que dijo poder estirar' : 'de margen'}`,
      }[lang]
    case 'budget_beyond':
      return {
        pt: `${m(d.price)} passa o limite de ${m(d.ceiling)}`,
        en: `${m(d.price)} is beyond ${m(d.ceiling)}`,
        es: `${m(d.price)} supera el límite de ${m(d.ceiling)}`,
      }[lang]
    case 'budget_nothing_to_compare':
      return {
        pt: 'não há preço ou não há orçamento para comparar',
        en: 'no price or no budget to compare',
        es: 'no hay precio o no hay presupuesto para comparar',
      }[lang]
    case 'area_exact':
      return {
        pt: `${d.area} é exactamente onde procura`,
        en: `${d.area} is exactly what they asked for`,
        es: `${d.area} es exactamente donde busca`,
      }[lang]
    case 'area_adjacent':
      return {
        pt: `${d.area} fica ao lado de ${d.near}, que esta agência trata como equivalente`,
        en: `${d.area} is next to ${d.near}, which this agency treats as interchangeable`,
        es: `${d.area} está al lado de ${d.near}, que esta agencia trata como equivalente`,
      }[lang]
    case 'area_none':
      return { pt: 'o imóvel não tem zona indicada', en: 'the listing has no area', es: 'el inmueble no tiene zona indicada' }[lang]
    case 'area_no': {
      const w = d.wanted.join(lang === 'en' ? ' or ' : ' ou ')
      return {
        pt: `${d.area} não é ${w}, nem fica ao lado`,
        en: `${d.area} is not ${d.wanted.join(' or ')}, and not adjacent to them`,
        es: `${d.area} no es ${d.wanted.join(' o ')}, ni está al lado`,
      }[lang]
    }
    case 'bedrooms_ok':
      return {
        pt: `T${d.has} para os T${d.want} que pediu`,
        en: `${d.has} bedrooms against ${d.want} asked for`,
        es: `${d.has} dormitorios para los ${d.want} que pidió`,
      }[lang]
    case 'bedrooms_no':
      return {
        pt: `é T${d.has} e pediu T${d.want}`,
        en: `${d.has} bedrooms, and they asked for ${d.want}`,
        es: `tiene ${d.has} dormitorios y pidió ${d.want}`,
      }[lang]
    case 'bedrooms_unknown':
      return {
        pt: 'o imóvel não diz quantos quartos tem',
        en: 'the listing does not say how many bedrooms',
        es: 'el inmueble no dice cuántos dormitorios tiene',
      }[lang]
    case 'type_ok':
      return {
        pt: `${d.type ?? 'o tipo'} é o que procura`,
        en: `${d.type ?? 'unspecified'} is what they wanted`,
        es: `${d.type ?? 'el tipo'} es lo que busca`,
      }[lang]
    case 'type_no':
      return {
        pt: `é ${d.type ?? 'outro tipo'} e procura ${d.wanted.join(' ou ')}`,
        en: `it is a ${d.type ?? 'different type'}, they asked for ${d.wanted.join(' or ')}`,
        es: `es ${d.type ?? 'otro tipo'} y busca ${d.wanted.join(' o ')}`,
      }[lang]
    case 'feature_has':
      return {
        pt: `tem ${feature(d.feature, 'pt')}`,
        en: `has ${enFeature(d.feature)}`,
        es: `tiene ${feature(d.feature, 'es')}`,
      }[lang]
    case 'feature_no':
      return {
        pt: `não tem ${feature(d.feature, 'pt')}`,
        en: `no ${feature(d.feature, 'en')}`,
        es: `no tiene ${feature(d.feature, 'es')}`,
      }[lang]
    default: {
      // Exhaustive. A new Detail does not compile until it can be said in
      // every language — rather than falling back to English in front of the
      // one person who would notice.
      const never: never = d
      return never
    }
  }
}

const FRAME: Record<Lang, {
  nothingBinding: string
  missed: (s: string) => string
  failed: (s: string) => string
  said: (s: string) => string
  supersededLater: (earlier: string, instead: string) => string
  supersededWidest: (earlier: string, instead: string) => string
  supersededBare: string
}> = {
  pt: {
    nothingBinding: 'Nada do que esta pessoa disse tem de ser verdade sobre um imóvel, por isso ainda não há nada para comparar.',
    missed: (s) => `Falta: ${s}`,
    failed: (s) => `Não serve: ${s}`,
    said: (s) => ` — disse: «${s}»`,
    supersededLater: (earlier, instead) => `Não foi usado: também disse «${earlier}», e depois «${instead}»`,
    supersededWidest: (earlier, instead) => `Não foi usado: disse «${earlier}» e «${instead}», sem se saber o que veio primeiro, por isso usámos o que exclui menos`,
    supersededBare: 'Não foi usado: uma afirmação anterior foi substituída',
  },
  en: {
    nothingBinding: 'Nothing this lead said has to be true of a listing, so there is nothing to match on yet.',
    missed: (s) => `Misses: ${s}`,
    failed: (s) => `Fails: ${s}`,
    said: (s) => ` — they said: “${s}”`,
    supersededLater: (earlier, instead) => `Not judged — they also said “${earlier}”, and later “${instead}”`,
    supersededWidest: (earlier, instead) => `Not judged — they said “${earlier}” and “${instead}”, and nothing says which came first, so the one excluding least was used`,
    supersededBare: 'Not judged — an earlier statement was replaced',
  },
  es: {
    nothingBinding: 'Nada de lo que dijo esta persona tiene que ser cierto de un inmueble, así que todavía no hay nada que comparar.',
    missed: (s) => `Falta: ${s}`,
    failed: (s) => `No sirve: ${s}`,
    said: (s) => ` — dijo: «${s}»`,
    supersededLater: (earlier, instead) => `No se usó: también dijo «${earlier}», y después «${instead}»`,
    supersededWidest: (earlier, instead) => `No se usó: dijo «${earlier}» y «${instead}», sin saber qué vino antes, así que usamos lo que excluye menos`,
    supersededBare: 'No se usó: una afirmación anterior fue sustituida',
  },
}

export function renderReason(r: Reason, lang: Lang): string {
  const f = FRAME[lang]
  switch (r.role) {
    case 'nothing_binding':
      return f.nothingBinding
    case 'met':
      return `${detailWords(r.detail, lang)}${r.evidence ? f.said(r.evidence) : ''}`
    case 'missed':
      return `${f.missed(detailWords(r.detail, lang))}${r.evidence ? f.said(r.evidence) : ''}`
    case 'failed':
      return `${f.failed(detailWords(r.detail, lang))}${r.evidence ? f.said(r.evidence) : ''}`
    case 'superseded':
      if (!r.evidence || !r.instead) return f.supersededBare
      return r.rule === 'later'
        ? f.supersededLater(r.evidence, r.instead)
        : f.supersededWidest(r.evidence, r.instead)
    default: {
      const never: never = r
      return never
    }
  }
}

export function renderReasons(rs: Reason[], lang: Lang): string[] {
  return rs.map((r) => renderReason(r, lang))
}
