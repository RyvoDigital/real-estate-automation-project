import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TIER_LABEL, TIER_MEANS } from '../src/lib/import/types'

const dir = join(import.meta.dirname, '..', 'src', 'app', 'c', '[client]', 'import')
const LIST = readFileSync(join(dir, 'page.tsx'), 'utf-8')
const ONE = readFileSync(join(dir, '[batch]', 'page.tsx'), 'utf-8')

/*
 * Brief III §10. The one screen in the cockpit where a mistake costs something
 * rather than displays wrongly.
 */

test('🔴 the batch list is scoped to the client, and the batch view refuses another one', () => {
  /*
   * `listBatches` is shared with the operator-level /import, which legitimately
   * lists every batch. A client page that forgot the filter would render
   * another agency's filenames with nothing looking wrong — §1.8's cross-client
   * rule failing silently rather than loudly.
   */
  assert.match(LIST, /listBatches\(\d+, clientId\)/, 'the client import list is not scoped to the client')
  assert.match(ONE, /b\.client_id !== clientId/, 'a batch belonging to another client is not refused')
  assert.match(ONE, /notFound\(\)/)
})

test('🔒 the rail shows five steps and marks where the write happens', () => {
  // The operator should not have to learn from the code that steps one to
  // three can be abandoned and leave nothing behind.
  const steps = LIST.match(/\{ n: \d+, name: '[^']+'/g) ?? []
  assert.equal(steps.length, 5, `the rail shows ${steps.length} steps, not five`)
  assert.match(LIST, /writes: true/, 'no step is marked as the one that writes')
  assert.match(LIST, /Nothing reaches leads until step four/)
})

test('🔴 the revert report leads with what was NOT undone', () => {
  /*
   * The failure mode is a success line over a partly-undone import: "1 199
   * removed" reads as finished, and the leads kept because somebody has since
   * talked to them are the part that still needs a decision.
   */
  const removedAt = ONE.indexOf('revert.removed')
  const retainedAt = ONE.indexOf('revert.retained')
  assert.ok(retainedAt > -1 && removedAt > -1, 'the revert report is not rendered')
  assert.ok(retainedAt < removedAt, 'the removed count is rendered before the kept leads')
  assert.match(ONE, /No message and no event was deleted/, 'the report does not say evidence was preserved')
})

test('🔒 the tier is shown with what it MEANS, never as a bare label', () => {
  // It decides what may honestly be sold on top of this data.
  for (const page of [LIST, ONE]) {
    assert.match(page, /TIER_LABEL\[tier\]/)
    assert.match(page, /TIER_MEANS\[tier\]/, 'a tier is rendered as a label with no meaning beside it')
  }
  // And the meanings are real sentences, not repeats of the labels.
  for (const k of Object.keys(TIER_MEANS) as (keyof typeof TIER_MEANS)[]) {
    assert.ok(TIER_MEANS[k].length > 30, `${k}: the meaning is too short to be one`)
    assert.notEqual(TIER_MEANS[k], TIER_LABEL[k])
  }
})

test('🔴 every rejected row carries its reason, and duplicates say what they merged with', () => {
  // A rejected row that does not say why is a row nobody can fix.
  assert.match(ONE, /x\.reason/, 'rejected rows do not carry their reason')
  assert.match(ONE, /same \{d\.on\} as/, 'duplicates do not say what they merged with')
  assert.ok(!/silently/i.test(ONE) || /nothing collapses silently/i.test(ONE))
})

test('🔴 the absences name the two that are legally load-bearing', () => {
  // No consent from a spreadsheet cell; no revert that destroys evidence.
  assert.match(LIST, /No column may be mapped to consent/)
  assert.match(LIST, /quarantined/, 'the ledger kind that corrects that error is not named')
  assert.match(LIST, /A revert never destroys evidence/)
  assert.match(LIST, /nulls the link/, 'the actual mechanism is not explained')
})
