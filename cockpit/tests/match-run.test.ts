import test from 'node:test'
import assert from 'node:assert/strict'

import { planMatchRun } from '../src/lib/matching/run'
import { planRecompute } from '../src/lib/matching/recompute'
import { extractFromMessages } from '../src/lib/matching/extract'
import type { Listing, Thresholds } from '../src/lib/matching/score'
import type { Requirement } from '../src/lib/matching/criteria'
import { renderReasons } from '../src/lib/matching/reason'

/**
 * The matching run, and the recompute rule that could destroy the only thing
 * in lead_requirements nobody can reproduce.
 *
 * The recompute case here is the discharge of what the proof book carried as
 * `0026-recompute-preserves-agent-rows`, registered BLOCKED because it had no
 * caller to be proved against. It has one now, and the rule is a pure planner
 * precisely so the proof is an ordinary test rather than a session in a SQL
 * editor.
 */

const T: Thresholds = {
  budget_stretch: 0.05,
  budget_stretch_with_evidence: 0.15,
  bedrooms_tolerance: 1,
  area_adjacency: { Cascais: ['Estoril'] },
  min_score_strong: 0.8,
  min_score_possible: 0.5,
}

const listing = (over: Partial<Listing> = {}): Listing & { statusChangedAt: string | null } => ({
  id: 'l1',
  reference: 'A-1042',
  area: 'Cascais',
  price: 900_000,
  bedrooms: 3,
  property_type: null,
  features: ['garden'],
  status: 'available',
  statusChangedAt: null,
  ...over,
})

const candidate = (leadId: string, messages: string[]) => {
  const e = extractFromMessages(messages, ['Cascais', 'Estoril', 'Faro'])
  return {
    leadId,
    requirements: e.requirements,
    budgetFlexible: e.budgetFlexible,
    fields: { budget_max: null, area: null, bedrooms: null },
  }
}

// ---------------------------------------------------------------------------
// The refusal, which is the honest first output of this whole automation
// ---------------------------------------------------------------------------

test('an unconfigured client produces a refusal naming every missing threshold', () => {
  const plan = planMatchRun({
    listing: listing(),
    candidates: [candidate('lead-1', ['Procuro T3 em Cascais ate 900 mil.'])],
    config: {},
  })

  assert.equal(plan.ran, false)
  if (plan.ran) return
  assert.equal(plan.refusal.reason, 'thresholds_not_configured')
  assert.deepEqual(
    'missing' in plan.refusal ? [...plan.refusal.missing].sort() : [],
    ['area_adjacency', 'bedrooms_tolerance', 'budget_stretch',
     'budget_stretch_with_evidence', 'min_score_possible', 'min_score_strong'],
    'the refusal names what is absent — an operator cannot act on "not configured"',
  )
  // §4.6: any value chosen now is a guess, and the calibration is half an hour
  // with a real agent. The refusal must SAY that, not just report a state.
  assert.match(plan.refusal.detail, /real agent/)
})

test('a partly configured client is still a refusal, and names only what is missing', () => {
  const plan = planMatchRun({
    listing: listing(),
    candidates: [],
    config: { ...T, min_score_strong: undefined },
  })
  assert.equal(plan.ran, false)
  if (plan.ran) return
  assert.deepEqual('missing' in plan.refusal ? plan.refusal.missing : [], ['min_score_strong'])
})

test('a listing that is not available is refused before any lead is considered', () => {
  for (const status of ['reserved', 'under_offer', 'sold', 'withdrawn']) {
    const plan = planMatchRun({
      listing: listing({ status }),
      candidates: [candidate('lead-1', ['Procuro T3 em Cascais ate 900 mil.'])],
      config: T,
    })
    assert.equal(plan.ran, false, `${status} must not match`)
    if (plan.ran) continue
    assert.equal(plan.refusal.reason, 'listing_not_matchable')
    assert.match(plan.refusal.detail, new RegExp(status))
  }
})

// ---------------------------------------------------------------------------
// The run itself
// ---------------------------------------------------------------------------

test('a lead with nothing binding is reported separately, never as a weak match', () => {
  // "We want four bedrooms" alone is a preference, so nothing HAS to be true of
  // a listing -- and "every hard constraint held" is vacuously true of nothing.
  const plan = planMatchRun({
    listing: listing({ bedrooms: 1 }),
    candidates: [candidate('lead-nothing', ['We want four bedrooms.'])],
    config: T,
  })
  assert.equal(plan.ran, true)
  if (!plan.ran) return
  assert.deepEqual(plan.matches, [], 'a one-bedroom flat is not a match for anybody here')
  assert.deepEqual(plan.unmatchableNoRequirements, ['lead-nothing'])
  assert.equal(plan.considered, 1)
})

test('a match is produced, carries its reasoning, and a near-miss is rejected with its reason', () => {
  const plan = planMatchRun({
    listing: listing({ price: 900_000, bedrooms: 3, area: 'Cascais', features: ['garden'] }),
    candidates: [
      candidate('lead-yes', ['Procuro T3 em Cascais ate 900 mil.']),
      candidate('lead-no', ['Procuro T3 em Faro ate 900 mil.']),
    ],
    config: T,
  })
  assert.equal(plan.ran, true)
  if (!plan.ran) return

  assert.deepEqual(plan.matches.map((m) => m.leadId), ['lead-yes'])
  assert.ok(plan.matches[0].reasoning.reasons.length > 0, 'a match without reasoning has failed')
  assert.equal(plan.matches[0].listingStatusAtMatch, 'available')

  const missed = plan.rejected.find((r) => r.leadId === 'lead-no')
  assert.ok(missed, 'the near-miss is reported, not silently dropped')
  assert.match(renderReasons(missed.reasons, 'en').join(' '), /Faro|not Cascais|not Faro/)
})

test('matches are ordered strongest first, and ties are total so a run is reproducible', () => {
  const plan = planMatchRun({
    listing: listing(),
    candidates: [
      candidate('lead-b', ['Procuro T3 em Cascais ate 900 mil.']),
      candidate('lead-a', ['Procuro T3 em Cascais ate 900 mil.']),
    ],
    config: T,
  })
  assert.equal(plan.ran, true)
  if (!plan.ran) return
  assert.deepEqual(plan.matches.map((m) => m.leadId), ['lead-a', 'lead-b'],
    '"which ones did it find" is a question somebody asks after the fact')
})

test('a superseded requirement never binds a match', () => {
  // The recency rule end to end, through the run rather than the scorer.
  const plan = planMatchRun({
    listing: listing({ price: 950_000, area: 'Cascais', bedrooms: 3 }),
    candidates: [candidate('lead-raised', [
      'Procuramos T3 em Cascais ate 800 mil.',
      'Afinal podemos ir ate 1 milhao.',
    ])],
    config: T,
  })
  assert.equal(plan.ran, true)
  if (!plan.ran) return
  assert.deepEqual(plan.matches.map((m) => m.leadId), ['lead-raised'],
    'the lead raised their budget; their earlier sentence must not refuse them')
})

// ---------------------------------------------------------------------------
// The recompute rule — the discharge of 0026-recompute-preserves-agent-rows
// ---------------------------------------------------------------------------

const stored = (id: string, source: Requirement['source']) => ({ id, source })

test('a recompute deletes every derived row and NO agent row', () => {
  const plan = planRecompute(
    [
      stored('req-conv-1', 'conversation'),
      stored('req-conv-2', 'conversation'),
      stored('req-note-1', 'note'),
      stored('req-field-1', 'field'),
      stored('req-agent-1', 'agent'),
    ],
    [],
  )

  assert.deepEqual(
    [...plan.deleteIds].sort(),
    ['req-conv-1', 'req-conv-2', 'req-field-1', 'req-note-1'],
  )
  assert.ok(!plan.deleteIds.includes('req-agent-1'), "the agent's own sentence is not derived")
  assert.deepEqual(plan.preserved, [{ id: 'req-agent-1', source: 'agent' }])
})

test('the agent row keeps its ORIGINAL id — a delete and reinsert is the same defect', () => {
  // A recompute that removed the row and wrote an equivalent one back would
  // satisfy any "is there an agent row" check while destroying the record: a
  // new primary key, a new created_at, and no link to whatever referenced it.
  const plan = planRecompute([stored('req-agent-1', 'agent')], [])
  assert.deepEqual(plan.deleteIds, [])
  assert.deepEqual(plan.insert, [])
  assert.deepEqual(plan.preserved.map((p) => p.id), ['req-agent-1'])
})

test('a lead with only derived rows is fully replaced, so the rule is not "delete nothing"', () => {
  // The neighbour. A planner that preserved EVERYTHING would pass both cases
  // above identically and quietly stop the extraction ever taking effect.
  const derived = extractFromMessages(['Procuro T3 em Cascais.'], ['Cascais']).requirements
  const plan = planRecompute([stored('old-1', 'conversation'), stored('old-2', 'note')], derived)
  assert.deepEqual([...plan.deleteIds].sort(), ['old-1', 'old-2'])
  assert.equal(plan.insert.length, derived.length)
  assert.ok(derived.length > 0, 'the fixture must actually produce requirements')
  assert.deepEqual(plan.preserved, [])
})
