/*
 * ⚠️ A FIXTURE. NOT A MATCH. NOTHING IN src/ MAY IMPORT THIS FILE.
 *
 * `tests/matching-boundary.test.ts` asserts that, by reading every file under
 * src/ — so this is a boundary rather than a comment somebody is trusted to
 * honour.
 *
 * WHY THAT GUARD EXISTS
 * There are no real matches yet: no client has matching thresholds, so every
 * run refuses (§4.6 — the values are a judgement and the calibration is half an
 * hour with a real agent). F4's structure does not depend on a real match, so
 * it is built against this. But a fixture that quietly becomes the thing
 * everyone develops against is how the first real listing surprises everybody:
 * the shapes here are ones I INVENTED, the names are invented, the evidence
 * quotes are invented, and the moment any of that is reachable from shipping
 * code it stops being obviously invented.
 *
 * The numbers below come from the spec's own worked example (handoff §5 and the
 * F3 engine commit), so they are at least a shape somebody argued about rather
 * than one I made up twice.
 */
import type { ChosenMatch, NotifiableMatch } from '../../src/lib/matching/notify'
import type { MatchRunPlan } from '../../src/lib/matching/run'

export const FIXTURE_LISTING = {
  reference: 'A-1042',
  area: 'Cascais',
  price: 2_200_000,
}

/** The spec's worked example: the match a field-only CRM filter would miss. */
export const MARIA: NotifiableMatch = {
  leadId: 'fixture-lead-maria',
  name: 'Maria Santos',
  monthsSinceContact: 5,
  strength: 'weak',
  filterWouldFind: false,
  reasons: [
    { role: 'met', detail: { t: 'budget_stretched', price: 2_200_000, max: 2_000_000, pct: 15, stated: true },
      evidence: 'We could stretch for the right place.' },
    { role: 'met', detail: { t: 'area_exact', area: 'Cascais' }, evidence: null },
    { role: 'met', detail: { t: 'bedrooms_ok', has: 4, want: 4 }, evidence: null },
    { role: 'met', detail: { t: 'feature_has', feature: 'garden' },
      evidence: 'And we couldn’t live without a garden — the kids need somewhere to play.' },
    { role: 'missed', detail: { t: 'feature_no', feature: 'south facing' },
      evidence: 'It’d be nice if it faced south.' },
  ],
}

export const JOAO: NotifiableMatch = {
  leadId: 'fixture-lead-joao',
  name: 'João Ferreira',
  monthsSinceContact: null,
  strength: 'strong',
  filterWouldFind: true,
  reasons: [
    { role: 'met', detail: { t: 'area_exact', area: 'Cascais' }, evidence: null },
    { role: 'met', detail: { t: 'feature_has', feature: 'garden' }, evidence: null },
  ],
}

export const CHOSEN_BY_AGENT: ChosenMatch = {
  leadId: 'fixture-lead-silva',
  name: 'Ana Silva',
  chosenBy: 'A. Ferreira',
  chosenReason: 'she looked at the house two doors down last spring',
}

export function fixturePlan(over: Partial<Extract<MatchRunPlan, { ran: true }>> = {}) {
  return {
    ran: true as const,
    matches: [],
    rejected: [],
    unmatchableNoRequirements: [],
    considered: 12,
    ...over,
  }
}
