/*
 * The weekly report's figures.
 *
 * The property: a person is counted once in every category they genuinely
 * belong to, and the report never sums categories that overlap. The lie enters
 * at the sum.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { weeklyFigures, renderWeekly, type AttributedMessage, type LeadOutcome } from '../src/lib/report/attribution'

const msg = (leadId: string | null, state: AttributedMessage['attributionState']): AttributedMessage =>
  ({ leadId, attributionState: state, createdAt: '2026-09-22T09:00:00Z' })
const out = (leadId: string, qualified: boolean, meetingBooked = false): LeadOutcome =>
  ({ leadId, qualified, meetingBooked })

test('a reactivated contact who qualifies is counted in BOTH, deliberately', () => {
  const f = weeklyFigures({
    messages: [msg('a', 'campaign'), msg('b', 'organic')],
    outcomes: [out('a', true), out('b', true)],
  })
  assert.equal(f.conversations, 2)
  assert.equal(f.conversationsFromCampaign, 1)
  assert.equal(f.qualified, 2)
  assert.equal(f.qualifiedFromCampaign, 1,
    'the reactivated contact is in the qualified figure AND in its reactivated subset')
})

test('THE SUBSET NEVER EXCEEDS ITS PARENT, which is what makes the sum a lie', () => {
  const f = weeklyFigures({
    messages: [msg('a', 'campaign'), msg('b', 'campaign'), msg('c', 'organic')],
    outcomes: [out('a', true), out('b', true), out('c', false)],
  })
  assert.ok(f.conversationsFromCampaign <= f.conversations)
  assert.ok(f.qualifiedFromCampaign <= f.qualified)
  assert.ok(f.meetingsFromCampaign <= f.meetings)
  // And the relationship is declared, so a renderer cannot lay them out as peers.
  assert.equal(f.subsetOf.qualifiedFromCampaign, 'qualified')
})

test('one conversation per LEAD, not per message', () => {
  // A talkative person is not six conversations, and counting messages would
  // inflate every figure in proportion to how much somebody typed.
  const f = weeklyFigures({
    messages: [msg('a', 'campaign'), msg('a', 'campaign'), msg('a', 'organic'), msg('a', 'unknown')],
    outcomes: [],
  })
  assert.equal(f.conversations, 1)
  assert.equal(f.conversationsFromCampaign, 1)
})

test('campaign wins over organic within one conversation', () => {
  // The first inbound is attributed; later ones in the same thread may not be.
  // If any message in the conversation came from a send, the conversation did.
  for (const messages of [
    [msg('a', 'campaign'), msg('a', 'organic')],
    [msg('a', 'organic'), msg('a', 'campaign')],
  ]) {
    const f = weeklyFigures({ messages, outcomes: [] })
    assert.equal(f.conversationsFromCampaign, 1)
  }
})

test('UNKNOWN IS NEVER FOLDED INTO EITHER FIGURE', () => {
  // The failure this exists to prevent: an attribution lookup that failed
  // becoming an organic lead, which is improvements §3.19 through another door.
  const f = weeklyFigures({
    messages: [msg('a', 'campaign'), msg('b', 'organic'), msg('c', 'unknown')],
    outcomes: [out('a', true), out('b', true), out('c', true)],
  })
  assert.equal(f.conversations, 2, 'the unknown conversation is not counted as organic')
  assert.equal(f.conversationsFromCampaign, 1)
  assert.equal(f.conversationsUnattributed, 1)
  assert.notEqual(f.conversations, 3)
})

test('unknown never overwrites a real answer for the same lead', () => {
  const f = weeklyFigures({ messages: [msg('a', 'organic'), msg('a', 'unknown')], outcomes: [] })
  assert.equal(f.conversations, 1)
  assert.equal(f.conversationsUnattributed, 0, 'one unattributed message does not unattribute a conversation')
})

test('a qualified lead whose conversation was unknown is NOT credited to the campaign', () => {
  const f = weeklyFigures({ messages: [msg('a', 'unknown')], outcomes: [out('a', true)] })
  assert.equal(f.qualified, 1, 'they did qualify, and that is true')
  assert.equal(f.qualifiedFromCampaign, 0, 'but we do not know where they came from, so nothing claims them')
})

test('the rendering nests the subsets and names the unknowns', () => {
  const f = weeklyFigures({
    messages: [msg('a', 'campaign'), msg('b', 'organic'), msg('c', 'unknown')],
    outcomes: [out('a', true, true), out('b', true)],
  })
  const text = renderWeekly(f)
  assert.match(text, /^Conversas recebidas/m)
  assert.match(text, /^ {2}das quais reactivações/m, 'the subset must be indented under its parent')
  assert.match(text, /^Conversas sem origem determinada/m)
  assert.match(text, /não entra em nenhum dos números acima/)
  assert.equal(/novo/i.test(text), false,
    'nothing is called "new" — a reactivated contact is returning, and the agency knows that')
})

test('a clean week does not mention unattributed conversations at all', () => {
  const f = weeklyFigures({ messages: [msg('a', 'organic')], outcomes: [out('a', false)] })
  assert.equal(/sem origem/.test(renderWeekly(f)), false,
    'a line reading "0 unattributed" invites a reader to wonder what it means')
})

test('an empty week renders without inventing anything', () => {
  const f = weeklyFigures({ messages: [], outcomes: [] })
  assert.equal(f.conversations, 0)
  assert.match(renderWeekly(f), /Conversas recebidas\s+0/)
})
