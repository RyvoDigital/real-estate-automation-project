import { test } from 'node:test'
import assert from 'node:assert/strict'
import { budgetLabel, moneyShort } from '../src/lib/money'

test('the 2026-09-11 row: 1.2M to 1.5M renders as a range, not the max', () => {
  assert.equal(budgetLabel(1_200_000, 1_500_000), '€1.2M–€1.5M')
})

test('a single bound renders alone', () => {
  assert.equal(budgetLabel(null, 900_000), '€900k')
  assert.equal(budgetLabel(2_000_000, null), '€2M')
})

test('a point range renders once', () => {
  assert.equal(budgetLabel(1_100_000, 1_100_000), '€1.1M')
})

test('unknown is null, so the page can say "Not established"', () => {
  assert.equal(budgetLabel(null, null), null)
  assert.equal(budgetLabel(0, undefined), null)
})

test('an inverted row is shown as inverted rather than silently reordered', () => {
  assert.match(budgetLabel(1_200_000, 1_100_000) ?? '', /inverted/)
})

test('moneyShort rounding', () => {
  assert.equal(moneyShort(1_250_000), '€1.3M')
  assert.equal(moneyShort(1_000_000), '€1M')
  assert.equal(moneyShort(850_000), '€850k')
})
