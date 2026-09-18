import { CLAIM_QUESTION, SEGMENT_CHOICE, UI, scopeFor } from '@/lib/segmentation/copy'
import { sharedClaimCell, type ContactRow } from '@/lib/segmentation/groups'
import type { Segment } from '@/lib/segmentation/declare-types'

/**
 * Every sentence step 2 says, composed ONCE.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THE PAGE AND THE PROBE MUST NOT COMPOSE THIS SEPARATELY.                │
 * │                                                                         │
 * │ probe-segmentation.ts exists so the screen can be read before it is     │
 * │ shown to anyone, and every defect in this feature was found that way.   │
 * │ But it began as a SECOND implementation of the page's composition, and  │
 * │ within an hour it had drifted: the page had moved the evidence question │
 * │ onto the field that answers it, and the probe was still printing the    │
 * │ old arrangement. A predictor that duplicates what it predicts will      │
 * │ eventually predict something that does not exist — and it fails in the  │
 * │ worst direction, by looking right.                                      │
 * │                                                                         │
 * │ So the composition is pure and lives here. The page renders it, the     │
 * │ probe prints it, the tests assert on it. Three readers, one sentence.   │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

export type Step2View = {
  youSaid: string
  consequence: string
  /** The file note, or null when this group's file claimed nothing. */
  note: null | {
    heading: string
    body: string
    scope: string
    /** The reassurance belonging to this answer, when it has one. */
    extra: string | null
    count: string
  }
  /** What is still being asked. `basis` is required; `none` asks nothing. */
  ask:
    | { kind: 'basis'; question: string; hint: string }
    | { kind: 'none'; text: string }
}

export function presentStep2(input: {
  contacts: ContactRow[]
  segment: Segment
  /** From the policy table, for segment A. Never hardcoded here. */
  jurisdiction: string
}): Step2View {
  const { contacts, segment } = input
  const withClaim = contacts.filter((c) => c.hasClaim)
  const cell = sharedClaimCell(withClaim)
  const ask = scopeFor(segment)

  // Quoted only when the cell was actually retained — see read.ts.
  const heading = cell
    ? `${CLAIM_QUESTION.headingWithCell.before}«${cell}»${CLAIM_QUESTION.headingWithCell.after}`
    : CLAIM_QUESTION.headingCellNotKept
  const question = cell
    ? `${CLAIM_QUESTION.questionWithCell.before}«${cell}»${CLAIM_QUESTION.questionWithCell.after}`
    : CLAIM_QUESTION.questionCellNotKept

  return {
    youSaid: `${UI.youSaid} ${SEGMENT_CHOICE[segment].label}`,
    consequence: segment === 'A' ? input.jurisdiction : SEGMENT_CHOICE[segment].consequence,
    note: withClaim.length === 0 ? null : {
      heading,
      body: `${CLAIM_QUESTION.body}${cell ? '' : ` ${CLAIM_QUESTION.bodyCellNotKept}`}`,
      scope: ask.scope,
      extra: ask.note,
      count: UI.claimCount(withClaim.length, contacts.length),
    },
    ask: ask.basisRequired
      ? {
          kind: 'basis',
          question,
          hint: `${CLAIM_QUESTION.options.have_record.detailPrompt} ${CLAIM_QUESTION.options.have_record.note}`,
        }
      : { kind: 'none', text: UI.nothingMoreNeeded },
  }
}
