import type { PublicationVerdict } from './gate'

/**
 * The prepared piece: what a person at the agency publishes.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ASSEMBLED FROM FIELDS, NEVER WRITTEN.                                   │
 * │                                                                         │
 * │ §8.A: "A automação não gera características, preços ou disponibilidades.│
 * │ Publica o que a agência forneceu, com as menções obrigatórias."         │
 * │                                                                         │
 * │ So the text is built by interpolating typed values into a fixed frame.  │
 * │ No figure can appear in it that was not interpolated, which is a        │
 * │ stronger property than any check over free text — there is nowhere for  │
 * │ an invented number to come from.                                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PREPARED, NEVER PUBLISHED
 * ───────────────────────────────────────────────────────────────────────────
 * This module returns A STRING. Not a post, not a request, not anything a
 * platform accepts. It imports no adapter, no credential and no dispatcher, and
 * `publication-boundary.test.ts` reads its source to prove it.
 *
 * **A prepared piece that can publish itself is the same failure as a match row
 * that knows its own audience** — the decision about whether to act moves into
 * the thing that only describes.
 *
 * That is not squeamishness. Holding a client's credentials to post public
 * commercial content under their brand, carrying their licence number, on the
 * platform the Concierge depends on, risks the asset every other automation
 * runs on — and we have already had one Meta account disabled with no appeal.
 */

export type PieceFacts = {
  reference: string | null
  propertyType: string | null
  area: string | null
  bedrooms: number | null
  sizeSqm: number | null
  /** The agency's price. Never computed, rounded or converted. */
  price: number | null
  features: string[]
}

export type Piece = {
  /** What gets published. The artefact — everything is checked on THIS. */
  text: string
  /** Every figure that was interpolated, as it appears. */
  figures: string[]
  /** The mandatory statements, rendered. Present in `text` by construction. */
  mentions: { energy: string; ami: string }
}

const euro = (n: number) => `€${n.toLocaleString('pt-PT')}`

/**
 * The mandatory statements, rendered from the clearance and nothing else.
 *
 * ⚖️ The EXEMPTION wording is a lawyer question (question 2). Saying "isento de
 * certificação" in an advertisement is us repeating the agency's declaration,
 * which is the only thing we may do with it — but whether that is the right
 * form of words in a published advertisement is not ours to decide, and it is
 * flagged rather than assumed.
 */
export function mandatoryMentions(
  evidence: Extract<PublicationVerdict, { cleared: true }>['evidence'],
): { energy: string; ami: string } {
  return {
    energy: evidence.exemption
      ? 'Imóvel isento de certificação energética.'
      : `Classe energética: ${evidence.energyClass}.`,
    ami: `AMI ${evidence.amiLicence.replace(/^AMI\s*/i, '')}`,
  }
}

/**
 * Assemble the piece.
 *
 * Takes a CLEARED verdict and nothing weaker: there is no way to prepare a
 * piece for a property that has not been through the gate, because a refusal
 * carries no evidence to render.
 */
export function assemblePiece(
  facts: PieceFacts,
  evidence: Extract<PublicationVerdict, { cleared: true }>['evidence'],
): Piece {
  const mentions = mandatoryMentions(evidence)

  // Every slot is a value or nothing. A slot that is absent leaves no gap and
  // no placeholder — a piece saying "T null" is worse than one that does not
  // mention the typology.
  const figures: string[] = []
  const head: string[] = []
  if (facts.reference) head.push(`Ref. ${facts.reference}`)
  if (facts.propertyType) head.push(facts.propertyType)
  if (facts.bedrooms !== null) { head.push(`T${facts.bedrooms}`); figures.push(String(facts.bedrooms)) }
  if (facts.area) head.push(facts.area)

  const body: string[] = []
  if (facts.sizeSqm !== null) { body.push(`${facts.sizeSqm} m²`); figures.push(String(facts.sizeSqm)) }
  if (facts.features.length > 0) body.push(facts.features.join(', '))

  // The price, exactly as the agency supplied it.
  const priceLine = facts.price === null ? null : euro(facts.price)
  if (facts.price !== null) figures.push(String(facts.price))

  const text = [
    head.join(' · '),
    body.length ? body.join(' · ') : null,
    priceLine,
    '',
    // The mandatory statements are PART OF THE PIECE, not a footer somebody
    // trims. The invariant below reads the assembled text, so a piece that
    // loses them is not a piece with a formatting problem — it is not a piece.
    mentions.energy,
    mentions.ami,
  ]
    .filter((l) => l !== null)
    .join('\n')
    .trim()

  return { text, figures, mentions }
}

// ---------------------------------------------------------------------------
// THE INVARIANT — read on the artefact, never on the intention
// ---------------------------------------------------------------------------

/**
 * §8.A: "Nenhuma peça publicada sem classe energética e sem número AMI."
 *
 * ⚠️ CHECKED ON THE TEXT THAT WOULD BE PUBLISHED, not on a flag saying the
 * mentions were added. The same rule as the AI-disclosure invariant, which
 * reads the message that actually reached the wire rather than the branch that
 * was supposed to add it — and for the same reason: this codebase has eighteen
 * recorded instances of something reporting success while the underlying thing
 * failed.
 *
 * A boolean saying "mentions: true" is a claim about a code path. This is a
 * fact about the artefact.
 */
export function missingMandatoryMentions(
  text: string,
  evidence: Extract<PublicationVerdict, { cleared: true }>['evidence'],
): string[] {
  const want = mandatoryMentions(evidence)
  const missing: string[] = []
  // Compared on the normalised text so spacing and case cannot hide a
  // difference — and on the WHOLE phrase, because a bare "B" appears in any
  // Portuguese sentence and would make this pass on nothing.
  const flat = text.replace(/\s+/g, ' ').toLowerCase()
  if (!flat.includes(want.energy.replace(/\s+/g, ' ').toLowerCase())) missing.push('energy')
  if (!flat.includes(want.ami.replace(/\s+/g, ' ').toLowerCase())) missing.push('ami')
  return missing
}

// ---------------------------------------------------------------------------
// FIGURES — nothing the agency did not supply
// ---------------------------------------------------------------------------

/** Every digit-run in a text, separators stripped, as the guard compares them. */
export function figuresIn(text: string): string[] {
  return [...text.matchAll(/\d[\d.,\s]*\d|\d/g)]
    .map((m) => m[0].replace(/\D/g, ''))
    .filter(Boolean)
}

/**
 * A phrased version may not contain a figure the assembled one did not.
 *
 * For the day a model is allowed to rephrase what was assembled. The set it is
 * compared against is the ASSEMBLED PIECE's own figures — not "the listing's
 * fields", which is the widening that was measured on 18 September to let a
 * floor area of 320 license a price of "320 mil".
 *
 * The comparison is on digits with separators stripped, so €1.950.000 and
 * €1,950,000 are the same figure. It is deliberately NOT normalised across
 * magnitudes: "1,95M" is a different digit-run from "1950000" and is refused,
 * because normalising representations is how two numbers start being treated as
 * one fact.
 */
export function inventedFigures(phrased: string, assembled: Piece): string[] {
  const allowed = new Set(figuresIn(assembled.text))
  return figuresIn(phrased).filter((f) => !allowed.has(f))
}
