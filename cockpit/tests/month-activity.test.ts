import { test } from 'node:test'
import assert from 'node:assert/strict'
import { automationLines, countsFor, firstFullMonth, firstsFor, type EventRow, type MessageRow } from '../src/lib/month/activity'
import type { ContractRow } from '../src/lib/month/model'

/*
 * What the system did, what is holding it, and Firsts (brief I §2.10).
 * Real clients only; measured, never estimated; the business's Lisbon month.
 */

const SEP = { y: 2026, m: 9 }
const REAL = new Set(['r1'])
const ev = (type: string, created_at: string, client_id = 'r1'): EventRow => ({ type, created_at, client_id })
const msg = (direction: string, origin: string | null, created_at: string, lead_id = 'L1', client_id = 'r1'): MessageRow => ({ direction, origin, created_at, lead_id, client_id })

test('the month is Lisbon\'s: 23:30 UTC on 31 Aug is already 1 Sep there', () => {
  const c = countsFor([ev('lead.created', '2026-08-31T23:30:00Z'), ev('lead.created', '2026-08-31T22:30:00Z')], [], REAL, SEP)
  assert.equal(c.leads, 1)
})

test('🔒 replies by the system are origin ai, never every outbound row', () => {
  const c = countsFor([], [
    msg('outbound', 'ai', '2026-09-02T10:00:00Z'),
    msg('outbound', 'handoff', '2026-09-02T10:01:00Z'),
    msg('outbound', 'human', '2026-09-02T10:02:00Z'),
  ], REAL, SEP)
  assert.equal(c.systemReplies, 1)
  assert.equal(c.personReplies, 1)
})

test('🔒 rehearsals are out of scope: another client\'s rows never count', () => {
  const c = countsFor([ev('lead.created', '2026-09-02T10:00:00Z', 'rehearsal')], [msg('outbound', 'ai', '2026-09-02T10:00:00Z', 'L9', 'rehearsal')], REAL, SEP)
  assert.deepEqual([c.leads, c.systemReplies, c.clients], [0, 0, 0])
})

test('median time to first reply: per lead, the first inbound then the first outbound after it', () => {
  const c = countsFor([], [
    msg('inbound', 'lead', '2026-09-02T10:00:00Z', 'A'), msg('outbound', 'ai', '2026-09-02T10:00:06Z', 'A'),
    msg('inbound', 'lead', '2026-09-03T10:00:00Z', 'B'), msg('outbound', 'ai', '2026-09-03T10:00:10Z', 'B'),
    msg('inbound', 'lead', '2026-09-04T10:00:00Z', 'C'), // never answered: not a sample, not a zero
  ], REAL, SEP)
  assert.equal(c.medianFirstReplySeconds, 8)
  assert.equal(c.firstReplySamples, 2)
  assert.equal(countsFor([], [], REAL, SEP).medianFirstReplySeconds, null)
})

test('what holds an automation comes from the ledger, with its age', () => {
  const lines = automationLines(new Map([['inbound_concierge', 0]]), '2026-09-19')
  const reactivation = lines.find((l) => l.key === 'db_reactivation')!
  assert.ok(reactivation.heldBy, '02 is held by an open gate in lib/gates.ts')
  assert.equal(reactivation.heldBy!.since, '2026-09-03')
  assert.equal(reactivation.heldBy!.days, 16)
  assert.equal(lines.length, 5)
})

const contract = (o: Partial<ContractRow>): ContractRow => ({
  id: 'k', automation_client_id: 'r1', web_client_id: null, monthly_eur: 650, setup_eur: null, setup_terms: null,
  starts_on: '2026-10-17', ends_on: null, automations: null, signed_by: 's', recorded_by: 'o', recorded_at: '2026-10-01T00:00:00Z',
  created_at: '2026-10-01T00:00:00Z', supersedes_id: null, ...o,
})

test('the first FULL month of recurring revenue is the first closed month a contract covers whole', () => {
  assert.equal(firstFullMonth([contract({})], REAL, '2026-11-15'), null) // Nov not closed yet; Oct was partial
  assert.equal(firstFullMonth([contract({})], REAL, '2026-12-02'), '2026-11-01')
  assert.equal(firstFullMonth([contract({ starts_on: '2026-10-01' })], REAL, '2026-11-02'), '2026-10-01')
  assert.equal(firstFullMonth([contract({ automation_client_id: 'rehearsal' })], REAL, '2027-01-01'), null)
})

test('Firsts: Never until it happens; the Meta-gated ones say what holds them', () => {
  const f = firstsFor({ firstClient: null, firstLead: null, firstSystemReply: null, firstMeeting: null, contracts: [], payments: [], realParties: REAL }, '2026-09-22')
  assert.equal(f.length, 9)
  assert.ok(f.slice(0, 7).every((x) => x.kind === 'never'))
  const campaign = f.find((x) => x.label === 'First campaign send')!
  assert.equal(campaign.kind, 'held')
  const g = campaign.kind === 'held' ? campaign : null
  assert.equal(g!.since, '2026-09-03')
  const happened = firstsFor({ firstClient: '2026-10-01', firstLead: null, firstSystemReply: null, firstMeeting: null, contracts: [contract({})], payments: [], realParties: REAL }, '2026-10-20')
  assert.deepEqual(happened.find((x) => x.label === 'First contract'), { kind: 'happened', label: 'First contract', on: '2026-10-17' })
})
