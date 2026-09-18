import type { SatisfiedRequirement } from './gate'

/**
 * The mandatory statements an advertisement must carry, rendered per
 * requirement.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ A REGISTRY KEYED BY REQUIREMENT ID, NOT A FUNCTION THAT KNOWS PORTUGAL. │
 * │                                                                         │
 * │ "Classe energética: B" is one jurisdiction's sentence for one           │
 * │ requirement. Spain's is two ratings in Spanish; a third country's is    │
 * │ something else. Rendering has to live where the words are guarded, and  │
 * │ a requirement without words must fail LOUDLY rather than render         │
 * │ nothing — a piece silently missing its mandatory statement is exactly   │
 * │ the §8.A invariant's failure.                                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ NOT IN THE POLICY ROW. Putting the sentence in the database would take it
 * out of reach of the vocabulary guard and out of git, and the text an
 * advertisement legally must carry is the last thing that should be editable
 * without review.
 *
 * `mentions.test.ts` asserts that every requirement id the seeded policy
 * references has a renderer here — so a jurisdiction added without words fails
 * at the suite rather than at an agency.
 */

export type Mention = { requirementId: string; text: string }

type Renderer = (r: SatisfiedRequirement) => string

const RENDERERS: Record<string, Renderer> = {
  /** Portugal: one letter, or the agency's own declaration that none is due. */
  pt_energy_class: (r) =>
    r.exemption
      ? 'Imóvel isento de certificação energética.'
      : `Classe energética: ${String(r.values.class ?? '').trim()}.`,

  /** Portugal: the mediation licence, normalised so it reads once. */
  pt_ami: (r) => `AMI ${String(r.number ?? '').replace(/^AMI\s*/i, '').trim()}`,
}

/** Which requirement ids we can say out loud. */
export const RENDERABLE = Object.keys(RENDERERS)

export class UnrenderableRequirement extends Error {
  constructor(readonly requirementId: string) {
    super(
      `No mandatory-statement wording exists for requirement "${requirementId}". A piece cannot ` +
      'be prepared without it: an advertisement missing a statement the law requires is the ' +
      'failure the §8.A invariant exists to catch, and rendering nothing would produce one ' +
      'silently. Add a renderer in src/lib/publication/mentions.ts.',
    )
  }
}

/**
 * The statements for one cleared property.
 *
 * THROWS on a requirement it cannot say. That is deliberate and it is the
 * opposite of a fallback: a piece prepared without a mandatory statement looks
 * finished, and somebody publishes it.
 */
export function mentionsFor(satisfied: SatisfiedRequirement[]): Mention[] {
  return satisfied.map((r) => {
    const render = RENDERERS[r.requirementId]
    if (!render) throw new UnrenderableRequirement(r.requirementId)
    return { requirementId: r.requirementId, text: render(r) }
  })
}
