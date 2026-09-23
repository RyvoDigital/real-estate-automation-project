/*
 * /clients checkpoint 2 (23 Sep 2026): the screen.
 *
 *   🔒 the order is STATED on the page, so it is never a mystery;
 *   🔒 rehearsals are marked, in the operator's own word;
 *   🔴 an unread figure is a word, never a zero, and never a missing chip;
 *   🔒 it lists and does not act: no form, no button, no action import;
 *   🔒 colour only through the state components, never a token;
 *   🔒 the empty state is the real one — no sample agency, ever.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pageFile } from './lib/routes'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
/** The file behind a URL, found not typed — see tests/lib/routes.ts pageFile. */
const readRoute = (route: string) => readFileSync(pageFile(route), 'utf8')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
const VIEW = code(read('../src/components/clients/ClientsView.tsx'))
const PAGE = code(readRoute('/clients'))
const CSS = read('../src/components/clients/clients.module.css')

test('🔒 the order is stated on the screen, in the words it actually sorts by', () => {
  assert.match(VIEW, /Most needing attention first; rehearsals last; then alphabetical\./)
  // And the model really does that — the sentence is not decoration.
  const model = code(read('../src/lib/clients/model.ts'))
  const sort = model.slice(model.indexOf('rows.sort('), model.indexOf('rows.sort(') + 260)
  assert.match(sort, /standing === 'rehearsal' \? 1 : 0/)
  assert.ok(sort.indexOf("standing === 'rehearsal'") < sort.indexOf('RANK['), 'rehearsals must be the FIRST key, or they are not always last')
  assert.match(sort, /localeCompare/)
})

test('🔒 a rehearsal is marked in the operator’s own word, and "not answered" is its own mark', () => {
  assert.match(VIEW, /standing === 'rehearsal' &&[\s\S]{0,80}>rehearsal</)
  assert.match(VIEW, /standing === 'not_answered' &&[\s\S]{0,80}>not answered</)
  assert.doesNotMatch(VIEW, /\btest\b|\bdemo\b|\bfake\b/i, 'a rehearsal is not a "test client" on the screen')
})

test('🔴 an unread figure is a WORD, never a zero and never a silently missing chip', () => {
  // Every count that can be unknown renders something when it is.
  for (const field of ['waiting', 'gateRefusingEverything', 'onboarded', 'automationsOn', 'lastActivity']) {
    assert.match(VIEW, new RegExp(`${field} === 'unknown'`), `${field} must have an unknown branch on the screen`)
  }
  assert.match(VIEW, /not read/)
  // The Num helper refuses to print a count it does not have.
  const num = VIEW.slice(VIEW.indexOf('function Num'), VIEW.indexOf('function Row'))
  assert.match(num, /n === 'unknown'/)
  assert.doesNotMatch(num, /\?\? 0|\|\| 0/, 'no fallback may turn "not read" into a zero')
})

test('🔒 it lists, it does not act', () => {
  assert.doesNotMatch(VIEW, /<form|<button|use server|Action\b/)
  assert.doesNotMatch(PAGE, /<form|<button|use server|Action\b/)
  assert.match(VIEW, /Nothing here sends, enables or contacts anybody/)
})

test('🔒 colour arrives through the state components, never through a token', () => {
  assert.doesNotMatch(CSS, /var\(--(through|held|clock|red|handled)\b/, 'a screen may not reach for a semantic colour (tokens.test.ts)')
  assert.doesNotMatch(CSS, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, 'no colour literal outside tokens.css')
  assert.match(VIEW, /StateChip|StateMark|StateSurface/)
})

test('🔴 THE EMPTY STATE IS THE REAL ONE: no sample agency anywhere on this screen', () => {
  assert.match(VIEW, /list\.empty \?/)
  assert.match(VIEW, /No agency yet/)
  // 🔒 Nothing invented: the screen prints what the model gave it.
  assert.doesNotMatch(VIEW + PAGE, /Marbella|Casa Atlântica|Quinta|Example|Acme|sample|placeholder/i)
})

test('🔒 rows are a sequence of like things: a hairline between them, and none above the first', () => {
  assert.match(CSS, /\.row \{ border-top: 1px solid var\(--edge\); \}/)
  assert.match(CSS, /\.row:first-child \{ border-top: 0; \}/)
  assert.doesNotMatch(CSS, /border-top: 1px solid var\(--edge-2\)/, '--edge-2 is reserved for a pressable thing')
})

test('the page is operator-only, reads once, and sits in the operator frame', () => {
  assert.match(PAGE, /await requireOperator\(\)/)
  assert.match(PAGE, /readClientList\(new Date\(\)\)/)
  assert.match(PAGE, /<Frame mode="operator" current="clients"/)
})

test('🔒 Clients is above Today in the sidebar, and the switcher offers the whole list', () => {
  const frame = code(read('../src/lib/frame.ts'))
  const items = frame.slice(frame.indexOf("slug: 'clients'"), frame.indexOf("slug: 'expiries'"))
  assert.ok(items.indexOf("slug: 'clients'") < items.indexOf("slug: 'today'"), 'Clients must come before Today')
  const switcher = code(read('../src/components/ClientSwitcher.tsx'))
  assert.match(switcher, /href="\/clients"[\s\S]{0,80}See all clients|See all clients/)
})
