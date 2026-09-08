import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeRevert, planRevert } from '../src/lib/import/revert'

const present = new Map<string, string | null>([
  ['a', 'Untouched Lead'],
  ['b', 'Has Messages'],
  ['c', 'Has Events'],
  ['d', 'Has Both'],
])

const base = {
  createdLeadIds: ['a', 'b', 'c', 'd', 'gone'],
  present,
  withMessages: new Set(['b', 'd']),
  withEvents: new Set(['c', 'd']),
}

test('only a lead untouched since the import is removed', () => {
  const p = planRevert(base)
  assert.deepEqual(p.removable, ['a'])
})

test('every retained lead is named with a reason the operator can act on', () => {
  const p = planRevert(base)
  assert.equal(p.retained.length, 3)
  for (const r of p.retained) {
    assert.ok(r.name, 'a retained lead must be identifiable')
    assert.ok(r.reason.length > 10, 'and must say why')
  }
  assert.match(p.retained.find((r) => r.id === 'b')!.reason, /messaged since/)
  assert.match(p.retained.find((r) => r.id === 'c')!.reason, /events/)
})

test('a lead already deleted by someone else is reported, not treated as removed', () => {
  const p = planRevert(base)
  assert.deepEqual(p.alreadyGone, ['gone'])
  assert.ok(!p.removable.includes('gone'))
})

/*
 * The one that matters. messages.lead_id is `on delete set null`, so removing
 * a lead that has messages would not delete a single row — it would silently
 * null the link and leave a conversation with no subject. A revert that only
 * refused to CASCADE would still do that.
 */
test('a lead with messages is never removable, however the cascade is configured', () => {
  const p = planRevert({
    createdLeadIds: ['b'],
    present: new Map([['b', 'Has Messages']]),
    withMessages: new Set(['b']),
    withEvents: new Set(),
  })
  assert.deepEqual(p.removable, [], 'nothing may be removed')
  assert.equal(p.retained.length, 1)
})

test('the summary never overstates what was undone', () => {
  const line = describeRevert(planRevert(base))
  assert.match(line, /1 lead\(s\) removed/)
  assert.match(line, /3 kept/)
  assert.match(line, /1 were already gone/)
  assert.match(line, /no message or event was deleted/)
})

test('an empty batch reverts to nothing, and says so honestly', () => {
  const p = planRevert({ createdLeadIds: [], present: new Map(), withMessages: new Set(), withEvents: new Set() })
  assert.deepEqual(p, { removable: [], retained: [], alreadyGone: [] })
  assert.match(describeRevert(p), /0 lead\(s\) removed/)
})
