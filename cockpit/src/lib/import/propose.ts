import type { ParsedRow } from './parse'
import type { Proposal, ProposedColumn, Target } from './types'

/**
 * Proposing a mapping from headers AND sample rows.
 *
 * §2.3 is explicit that headers alone are insufficient — "a column called
 * `Notes` tells you nothing, and its contents tell you everything". So this
 * looks at both, and where the header is uninformative the CONTENT decides.
 *
 * This is the deterministic half. The model refines it (it is far better at
 * "this column of free text is where the buyer's motivation lives"), but the
 * deterministic half always runs, so an unreachable model degrades the
 * proposal's quality and never the operator's ability to do the import. §2.4's
 * no-silent-degradation rule applied to our own dependency.
 */

/** Header synonyms. Portuguese and Spanish first — that is the market. */
const HEADER_HINTS: [RegExp, Target][] = [
  [/^(nome completo|full ?name|nombre completo|contact ?name|cliente)$/i, 'full_name'],
  [/^(nome|name|nombre)$/i, 'full_name'],
  [/^(primeiro nome|first ?name|nombre de pila|given)$/i, 'first_name'],
  [/^(apelido|sobrenome|last ?name|surname|apellidos?)$/i, 'last_name'],
  // SPECIFIC BEFORE GENERAL, and it is not a style preference. "Último
  // Contacto" is a DATE column, and it contains "contacto" — so a greedy phone
  // pattern claimed it and the operator would have been shown a date column
  // proposed as a phone number. Order fixed, and bare "contacto" removed from
  // the phone alternation entirely: a column called just "Contacto" is
  // genuinely ambiguous, so it falls through to the value sniffer, which can
  // actually tell a phone number from a date. §2.3's point exactly.
  [/([uú]ltimo contacto|last ?contact(ed)?|last ?seen|fecha de contacto)/i, 'last_contact_at'],
  [/(telem[oó]vel|telefone|tel[eé]fono|phone|mobile|m[oó]vil|whatsapp)/i, 'phone'],
  [/(e-?mail|correo)/i, 'email'],
  [/(or[cç]amento|presupuesto|budget|price ?range|faixa)/i, 'budget_range'],
  [/(budget ?min|m[ií]n(imo)?)/i, 'budget_min'],
  [/(budget ?max|m[aá]x(imo)?)/i, 'budget_max'],
  [/(zona|area|área|localiza|location|ubicaci|concelho|freguesia|city|cidade)/i, 'area'],
  [/(tipologia|bedrooms?|quartos|dormitorios|habitaciones|beds?)/i, 'bedrooms'],
  [/(tipo de im[oó]vel|property ?type|tipo de propiedad|tipo)/i, 'property_type'],
  [/(prazo|timeline|horizonte|when|quando|plazo)/i, 'timeline'],
  [/^(data|date|fecha)$/i, 'last_contact_at'],
  [/(consent|consentimento|rgpd|gdpr|opt.?in|marketing|subscri)/i, 'consent'],
  [/(notas?|notes?|observa|coment|remarks|descripci)/i, 'notes'],
  [/(origem|source|proced|enquiry ?channel|lead ?source|canal)/i, 'source'],
]

const looksLikePhone = (v: string) => /^[+\d][\d\s().-]{6,}$/.test(v.trim())
const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
const looksLikeMoney = (v: string) => /^[€$£]?\s?[\d.,]+\s?(k|m|mil|eur)?\b/i.test(v.trim()) && /\d/.test(v)
const looksLikeTypology = (v: string) => /^(t|v)\s?\d{1,2}$/i.test(v.trim())
const looksLikeDate = (v: string) => /^\d{1,4}[/.\-]\d{1,2}[/.\-]\d{2,4}$/.test(v.trim())
const looksLikeConsent = (v: string) =>
  /^(y|n|yes|no|sim|n[aã]o|s[ií]|true|false|1|0|opt.?in|opt.?out)$/i.test(v.trim())

export function proposeMapping(headers: string[], rows: ParsedRow[]): Proposal {
  const sampleOf = (h: string) =>
    rows
      .slice(0, 25)
      .map((r) => (r.values[h] ?? '').trim())
      .filter(Boolean)

  const columns: ProposedColumn[] = headers.map((header) => {
    const samples = sampleOf(header)
    const show = samples.slice(0, 3)

    const byHeader = HEADER_HINTS.find(([re]) => re.test(header.trim()))
    if (byHeader) {
      return {
        column: header,
        target: byHeader[1],
        confidence: 'high',
        why: `the header "${header}" names it`,
        samples: show,
      }
    }

    // The header said nothing useful, so read the values. This is the half a
    // header-only mapper cannot do, and it is where a column called "Coluna3"
    // full of "+351 9.." gets recognised.
    if (samples.length >= 2) {
      const frac = (f: (v: string) => boolean) => samples.filter(f).length / samples.length
      // Annotated element-wise: an array literal of arrays widens to
      // (string|number)[][] and stops being a tuple, which tsc catches and
      // the test runner does not — tsx strips types without checking them.
      const guesses = ([
        [frac(looksLikeEmail), 'email', 'the values are email addresses'],
        [frac(looksLikePhone), 'phone', 'the values look like phone numbers'],
        [frac(looksLikeTypology), 'bedrooms', 'the values are typologies like T3'],
        [frac(looksLikeDate), 'last_contact_at', 'the values are dates'],
        [frac(looksLikeConsent), 'consent', 'the values are yes/no'],
        [frac(looksLikeMoney), 'budget_range', 'the values look like amounts'],
      ] as [number, Target, string][]).sort((a, b) => b[0] - a[0])

      const [score, target, why] = guesses[0]
      if (score >= 0.7) {
        return { column: header, target, confidence: 'high', why: `${why} (${Math.round(score * 100)}% of samples)`, samples: show }
      }

      // Long free text is where §4.2's evidence lives. Worth proposing as
      // notes rather than ignoring, because a column of sentences is exactly
      // what a CRM throws away and what this product is built on.
      const avg = samples.reduce((a, s) => a + s.length, 0) / samples.length
      if (avg > 25) {
        return { column: header, target: 'notes', confidence: 'low', why: `free text, averaging ${Math.round(avg)} characters — this is where a buyer's reasons live`, samples: show }
      }
    }

    return {
      column: header,
      target: 'ignore',
      confidence: 'low',
      why: samples.length ? 'nothing recognisable in the header or the values' : 'the column is empty',
      samples: show,
    }
  })

  return { by: 'headers', columns }
}
