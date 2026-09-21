import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMonth, cents, eur, phaseOf, lisbonToday, costLineFor, addMonths,
  type MonthInputs, type ContractRow, type CostRow, type PaymentRow,
} from '../src/lib/month/model'

/*
 * The Month's rules, one test each (brief I §2.10–2.11). Fixture names are
 * fictional by the design's own rule: a sample amount never sits beside a real
 * client's name.
 */

const OCT = { y: 2026, m: 10 }
const SEP = { y: 2026, m: 9 }

const contract = (o: Partial<ContractRow>): ContractRow => ({
  id: 'k1', automation_client_id: null, web_client_id: 'w1', monthly_eur: 250, setup_eur: null, setup_terms: null,
  starts_on: '2026-03-01', ends_on: null, automations: null, signed_by: 'Sample', recorded_by: 'op', recorded_at: '2026-03-01T10:00:00Z',
  created_at: '2026-03-01T10:00:00Z', supersedes_id: null, ...o,
})
const cost = (o: Partial<CostRow>): CostRow => ({
  id: 'c1', label: 'Server', category: 'infrastructure', side: 'automation', amount_eur: 18.5, cadence: 'monthly', started_on: '2026-01-01', ended_on: null, ...o,
})
const payment = (o: Partial<PaymentRow>): PaymentRow => ({
  id: 'p1', automation_client_id: null, web_client_id: 'w1', kind: 'project', amount_eur: 600, settled_on: '2026-10-11', settled_amount_eur: 600, written_off_on: null, ...o,
})
const base = (o: Partial<MonthInputs> = {}): MonthInputs => ({
  contracts: [],
  automationClients: [
    { id: 'a1', name: 'ZZ rehearsal', status: 'active', rehearsal: true },
  ],
  webClients: [{ id: 'w1', name: 'Alfaiataria Exemplo', status: 'active', rehearsal: false, started_on: '2023-03-01', ended_on: null }],
  payments: [],
  costs: [],
  ...o,
})

test('money: numeric to cents, and the design\'s own format', () => {
  assert.equal(cents(18.5), 1850)
  assert.equal(cents('0.1'), 10)
  assert.equal(cents(null), null)
  assert.throws(() => cents('abc'))
  assert.equal(eur(123450), '€1 234,50')
  assert.equal(eur(-500), '−€5,00')
})

test('the month\'s phase comes from the Lisbon date, not the server\'s', () => {
  assert.deepEqual(phaseOf(OCT, '2026-10-03'), { kind: 'in_progress', day: 3, days: 31 })
  assert.deepEqual(phaseOf(SEP, '2026-10-03'), { kind: 'closed', days: 30 })
  assert.equal(phaseOf(OCT, '2026-09-30').kind, 'future')
  // 23:30 UTC on 30 Sep is already 1 Oct in Lisbon (WEST, +1)
  assert.equal(lisbonToday(new Date('2026-09-30T23:30:00Z')), '2026-10-01')
})

test('S2: nothing recorded at all is the primary state, and no half invents revenue', () => {
  const m = buildMonth(base(), OCT, '2026-10-03')
  assert.equal(m.neverAnything, true)
  assert.equal(m.halves.automation.recurringCents, 0)
  assert.equal(m.halves.automation.everContracted, false)
  // 🔒 no line for a series that has never existed: every month of the year is null, not 0
  assert.ok(m.halves.automation.year!.every((p) => p.cents === null))
  // 🔒 and no false zero anywhere: nothing was recorded, so nothing is "left" and no net exists,
  // for this month or for the last closed one (found on the first real render, 21 Sep 2026)
  assert.equal(m.halves.web.leaves.kind, 'nothing')
  assert.equal(m.halves.automation.leaves.kind, 'nothing')
  assert.equal(m.sums.net.kind, 'nothing')
  assert.equal(m.sums.anythingRecorded, false)
})

test('🔒 a withheld net names the last closed month only if something was recorded in it', () => {
  // the first contract starts this month: September had nothing, so there is no "September left €0,00"
  const m = buildMonth(base({ contracts: [contract({ starts_on: '2026-10-01' })] }), OCT, '2026-10-03')
  assert.equal(m.sums.net.kind, 'withheld')
  assert.equal(m.sums.net.kind === 'withheld' && m.sums.net.lastClosed, null)
})

test('🔒 the year has no value before the first contract, and a value (even 0) after it', () => {
  const m = buildMonth(base({ contracts: [contract({ starts_on: '2026-06-01', ends_on: '2026-07-31' })] }), OCT, '2026-10-03')
  const y = m.halves.web.year!
  assert.equal(y.find((p) => p.month.m === 5)!.cents, null) // before the first contract: nothing drawn
  assert.equal(y.find((p) => p.month.m === 6)!.cents, 25000)
  assert.equal(y.find((p) => p.month.m === 9)!.cents, 0) // after it ended: a true zero
})

test('🔒 recurring comes from the contracts covering the month, never from a status', () => {
  const inp = base({ contracts: [contract({ ends_on: '2026-08-31' })] })
  assert.equal(buildMonth(inp, { y: 2026, m: 8 }, '2026-10-03').halves.web.recurringCents, 25000)
  assert.equal(buildMonth(inp, SEP, '2026-10-03').halves.web.recurringCents, 0)
})

test('a contract starting mid-month: the month\'s figures are prorated by days, the run rate is not', () => {
  // operator, 21 Sep 2026: prorate, say so on the row, keep the headline at the full fee
  const m = buildMonth(base({ contracts: [contract({ starts_on: '2026-10-17' })] }), OCT, '2026-10-20')
  assert.equal(m.halves.web.recurringCents, 25000) // the run rate: a month's fee
  assert.equal(m.halves.web.monthCents, Math.round((25000 * 15) / 31)) // 17–31 Oct is 15 of 31 days
  assert.equal(m.halves.web.clients![0].monthCents, 12097)
  assert.equal(m.halves.web.clients![0].note, 'from 17 Oct · 15 of 31 days')
  assert.equal(m.halves.web.year!.at(-1)!.cents, 12097) // the month's figure, not the run rate
})

test('a contract ending mid-month, and one inside a month, are prorated the same way', () => {
  const ends = buildMonth(base({ contracts: [contract({ ends_on: '2026-10-10' })] }), OCT, '2026-11-02')
  assert.equal(ends.halves.web.clients![0].note, 'until 10 Oct · 10 of 31 days')
  assert.equal(ends.halves.web.monthCents, Math.round((25000 * 10) / 31))
  const inside = buildMonth(base({ contracts: [contract({ starts_on: '2026-10-05', ends_on: '2026-10-11' })] }), OCT, '2026-11-02')
  assert.equal(inside.halves.web.clients![0].note, '5–11 Oct · 7 of 31 days')
})

test('🔒 what a business leaves and the net use the month\'s figure, not the run rate', () => {
  const m = buildMonth(base({ contracts: [contract({ starts_on: '2026-09-16' })], costs: [cost({ side: 'web', amount_eur: 20 })] }), SEP, '2026-10-03')
  const earned = Math.round((25000 * 15) / 30)
  assert.deepEqual(m.halves.web.leaves, { kind: 'value', cents: earned - 2000, completeFromDayOne: false })
  assert.deepEqual(m.sums.net, { kind: 'value', cents: earned - 2000, completeFromDayOne: false })
  assert.equal(m.sums.recurringCents, 25000)
  assert.equal(m.sums.monthCents, earned)
})

test('🔒 rehearsal clients are never counted: not in revenue, not in unknown, only counted apart', () => {
  const m = buildMonth(
    base({ contracts: [contract({ automation_client_id: 'a1', web_client_id: null, monthly_eur: 650 })], payments: [payment({ web_client_id: null, automation_client_id: 'a1', kind: 'setup' })] }),
    OCT, '2026-10-03',
  )
  assert.equal(m.halves.automation.recurringCents, 0)
  assert.equal(m.halves.automation.everContracted, false)
  assert.deepEqual(m.halves.automation.unknown, [])
  assert.equal(m.halves.automation.oneOffCents, 0)
  assert.equal(m.halves.automation.rehearsals, 1)
})

test('S3: a real client with no terms is unknown, not €0', () => {
  const m = buildMonth(base(), OCT, '2026-10-03')
  assert.deepEqual(m.halves.web.unknown, ['Alfaiataria Exemplo'])
})

test('S3: status says it left but the contract has no end — a conflict, shown and never counted', () => {
  const inp = base({
    webClients: [{ id: 'w1', name: 'Loja Modelo', status: 'paused', rehearsal: false, started_on: '2025-06-01', ended_on: null }],
    contracts: [contract({})],
  })
  const m = buildMonth(inp, OCT, '2026-10-03')
  assert.equal(m.halves.web.recurringCents, 0)
  assert.equal(m.halves.web.conflicts.length, 1)
  assert.match(m.halves.web.conflicts[0].why, /paused.*no end date/)
})

test('🔒 recurring and one-off are never summed into one figure', () => {
  const m = buildMonth(base({ contracts: [contract({})], payments: [payment({})] }), OCT, '2026-10-20')
  assert.equal(m.sums.recurringCents, 25000)
  assert.equal(m.sums.oneOffCents, 60000)
  // no field anywhere carries their sum
  assert.ok(!JSON.stringify(m.sums).includes('85000'))
})

test('a monthly receipt is not a second revenue: recurring comes from the contract only', () => {
  const m = buildMonth(base({ contracts: [contract({})], payments: [payment({ kind: 'monthly', settled_amount_eur: 250, amount_eur: 250 })] }), OCT, '2026-10-20')
  assert.equal(m.sums.oneOffCents, 0)
  assert.equal(m.sums.recurringCents, 25000)
})

test('🔒 no net for a month in progress: withheld, with the last CLOSED month\'s net beneath it', () => {
  const inp = base({ contracts: [contract({})], costs: [cost({ side: 'web', amount_eur: 20 }), cost({ id: 'c2', side: 'automation', amount_eur: 18.5 })] })
  const m = buildMonth(inp, OCT, '2026-10-03')
  assert.equal(m.sums.net.kind, 'withheld')
  assert.deepEqual(m.sums.net.kind === 'withheld' && m.sums.net.lastClosed, { month: SEP, cents: 25000 - 2000 - 1850 })
  assert.equal(m.halves.automation.leaves.kind, 'withheld')
  const closed = buildMonth(inp, SEP, '2026-10-03')
  assert.deepEqual(closed.sums.net, { kind: 'value', cents: 21150, completeFromDayOne: false })
})

test('the one stated exception: the web half\'s leaves is complete from day one', () => {
  const m = buildMonth(base({ contracts: [contract({})], costs: [cost({ side: 'web', amount_eur: 20 })] }), OCT, '2026-10-03')
  assert.deepEqual(m.halves.web.leaves, { kind: 'value', cents: 23000, completeFromDayOne: true })
})

test('🔒 last month\'s costs never stand in for this month\'s: a cost that ended is gone', () => {
  const inp = base({ costs: [cost({ ended_on: '2026-09-30' })] })
  assert.equal(buildMonth(inp, SEP, '2026-10-03').halves.automation.costCents, 1850)
  assert.equal(buildMonth(inp, OCT, '2026-10-03').halves.automation.costCents, 0)
})

test('🔒 nothing apportioned: a shared cost sits with the company only', () => {
  const m = buildMonth(base({ costs: [cost({ side: 'shared', label: 'Accountant', amount_eur: 60 })] }), OCT, '2026-10-03')
  assert.equal(m.company.costCents, 6000)
  assert.equal(m.halves.web.costCents, 0)
  assert.equal(m.halves.automation.costCents, 0)
  assert.equal(m.sums.costCents, 6000)
})

test('annual costs count one twelfth a month, and a renewal inside 30 days is a clock', () => {
  const line = costLineFor(cost({ cadence: 'annual', amount_eur: 15, started_on: '2024-10-28' }), OCT, '2026-10-03')!
  assert.equal(line.cents, 125)
  assert.equal(line.renewsWithin30, true)
  assert.match(line.note!, /one twelfth/)
  assert.equal(costLineFor(cost({ cadence: 'annual', amount_eur: 12, started_on: '2024-03-03' }), OCT, '2026-10-03')!.renewsWithin30, false)
})

test('a one-off cost counts only in its own month', () => {
  const c = cost({ cadence: 'one_off', started_on: '2026-10-05', amount_eur: 40 })
  assert.equal(costLineFor(c, OCT, '2026-10-06')!.cents, 4000)
  assert.equal(costLineFor(c, addMonths(OCT, 1), '2026-11-06'), null)
})

test('S4: one failed read takes down only its own panels', () => {
  const m = buildMonth(base({ costs: null, contracts: [contract({})] }), OCT, '2026-10-20')
  assert.equal(m.halves.web.recurringCents, 25000) // revenue still reads
  assert.equal(m.halves.web.costCents, null)
  assert.equal(m.sums.costCents, null)
  assert.equal(m.sums.net.kind, 'unreadable')
  assert.ok(m.failed.includes('costs'))
  assert.equal(m.neverAnything, false) // "nothing happened" and "something failed" never share the headline
})

test('setup outstanding is the contract\'s setup minus what has arrived', () => {
  const m = buildMonth(
    base({ contracts: [contract({ setup_eur: 1200 })], payments: [payment({ kind: 'setup', settled_amount_eur: 400, amount_eur: 400 })] }),
    OCT, '2026-10-20',
  )
  assert.deepEqual(m.halves.web.setupOutstanding, [{ name: 'Alfaiataria Exemplo', cents: 80000 }])
})

test('🔒 a client\'s own cost sits on its row, never in the business\'s costs, and still counts in what the business leaves', () => {
  const m = buildMonth(base({
    contracts: [contract({})],
    costs: [cost({ side: 'web', amount_eur: 20 }), cost({ id: 'c2', side: 'web', amount_eur: 12, cadence: 'annual', started_on: '2024-03-03', web_client_id: 'w1' })],
  }), SEP, '2026-10-03')
  const row = m.halves.web.clients![0]
  assert.equal(row.ownCents, 100) // €12 a year, one twelfth
  assert.equal(row.leavesCents, 25000 - 100)
  assert.deepEqual(m.halves.web.costs!.map((c) => c.label), ['Server']) // the business's own, not the client's
  assert.deepEqual(m.halves.web.leaves, { kind: 'value', cents: 25000 - 2000 - 100, completeFromDayOne: false })
  assert.equal(m.clientCostsRecordable, true)
  // the renewal clock goes where the cost sits: on the client's row
  const soon = buildMonth(base({ contracts: [contract({})], costs: [cost({ cadence: 'annual', amount_eur: 15, started_on: '2024-10-28', side: 'web', web_client_id: 'w1' })] }), OCT, '2026-10-03')
  assert.equal(soon.halves.web.clients![0].ownRenewsSoon, true)
})

test('before 0052, client costs are "not recordable yet" — said once, at the page level', () => {
  const m = buildMonth({ ...base({ contracts: [contract({})] }), clientCostsRecordable: false }, SEP, '2026-10-03')
  assert.equal(m.clientCostsRecordable, false)
  assert.equal(m.halves.web.clients![0].ownCents, null) // unknown, not €0
})

