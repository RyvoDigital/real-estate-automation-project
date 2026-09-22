/*
 * The per-lead hand-back on /c/<client>/escalations (§5.3; 22 Sep 2026).
 *
 *   🔒 ONE LEAD, ASKED TWICE, and the second answer checked on the SERVER.
 *   🔒 STILL NO BULK HAND-BACK, and the screen still says so.
 *   🔴 EVERY OUTCOME HAS ITS OWN SENTENCE — including the one where the lead
 *      went back but the audit event did not write, which is not a clean
 *      hand-back and must not read like one.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HANDBACK } from '../src/lib/escalations/copy'

const code = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
const HB = code('../src/components/escalations/HandBack.tsx')
const ACTION = code('../src/lib/escalations/actions.ts')
const PAGE = code('../src/app/c/[client]/escalations/page.tsx')

test('🔒 the hand-back asks a second time, naming the lead, with nothing ticked in advance', () => {
  assert.match(HB, /Hand \{name\} back to the AI\?/)
  assert.match(HB, /will not know what was discussed anywhere but here/)
  const box = HB.match(/<input type="checkbox"[^>]*>/)?.[0] ?? ''
  assert.match(box, /name="confirm" value="yes"/)
  assert.match(box, /\brequired\b/)
  assert.doesNotMatch(box, /\b(defaultChecked|checked|autoFocus)\b/)
  // It is closed until it is opened: the list still reads as a list.
  assert.match(HB, /<details className=\{styles\.handback\}>/)
  assert.doesNotMatch(HB, /<details[^>]*\bopen\b/)
})

test('🔒 the SERVER refuses an unconfirmed hand-back: a form that only asks in the browser asks nobody', () => {
  assert.match(ACTION, /text\('confirm'\) !== 'yes'/)
  const guard = ACTION.slice(ACTION.indexOf("text('confirm')"), ACTION.indexOf('const result'))
  assert.match(guard, /redirect\(`\$\{back\}\?handback=unconfirmed`\)/)
  // The refusal happens BEFORE the write.
  assert.ok(ACTION.indexOf("text('confirm') !== 'yes'") < ACTION.indexOf('await handBackToAI'), 'the confirmation is checked after the write')
})

test('🔒 one lead at a time: the form carries a single leadId, and nothing iterates', () => {
  assert.match(HB, /name="leadId" value=\{leadId\}/)
  assert.doesNotMatch(ACTION, /getAll|leadIds|\.map\(/, 'the action learned to take more than one lead')
  assert.match(PAGE, /No bulk hand-back/)
  assert.match(PAGE, /<HandBack leadId=\{row\.id\} clientId=\{row\.clientId\} name=\{row\.name\} \/>/)
})

test('🔒 the form sits BESIDE the row, never inside the link', () => {
  // A <form> inside an <a> is invalid, and its clicks navigate instead of submitting.
  const row = PAGE.slice(PAGE.indexOf('function Row('), PAGE.indexOf('export default'))
  const linkEnd = row.indexOf('</Link>')
  assert.ok(linkEnd > 0)
  assert.ok(row.indexOf('<HandBack') > linkEnd, 'the hand-back is inside the row link')
  assert.doesNotMatch(row.slice(0, linkEnd), /<form|<button/)
})

test('🔴 the key travels, never a sentence, and every key the action can send has words', () => {
  // Every redirect the action writes must be a key this screen can say.
  const keys = [...ACTION.matchAll(/\?handback=([a-zA-Z]+)`/g)].map((m) => m[1])
  const dynamic = /handback=\$\{[^}]*'([a-zA-Z]+)'[^}]*:[^}]*'([a-zA-Z]+)'/g
  for (const m of ACTION.matchAll(dynamic)) keys.push(m[1], m[2])
  assert.ok(keys.length >= 5, `only ${keys.length} outcomes found — this guard would pass vacuously`)
  for (const k of keys) assert.ok(HANDBACK[k], `the action can redirect with "${k}", and no sentence exists for it`)
  // And nothing about the lead travels in the URL.
  assert.doesNotMatch(ACTION, /handback=\$\{(leadId|result\.message|name)/)
})

test('🔴 a hand-back whose audit event failed is NOT reported as a clean one', () => {
  assert.notEqual(HANDBACK.done.says, HANDBACK.doneNoEvent.says)
  assert.equal(HANDBACK.doneNoEvent.meaning, 'red')
  assert.match(HANDBACK.doneNoEvent.says, /audit event did not write/)
  assert.match(ACTION, /audit event failed/i, 'the action must tell the two apart')
  // "Already cleared by somebody else" is its own outcome, not a failure and not a success.
  assert.equal(HANDBACK.notEscalated.meaning, 'grey')
  assert.match(HANDBACK.notEscalated.says, /Nothing was changed/)
})

test('the screen says what happened, from the key, and revalidates itself', () => {
  assert.match(PAGE, /const said = HANDBACK\[/)
  assert.match(PAGE, /\{said && <StateSurface meaning=\{said\.meaning\}/)
  assert.match(ACTION, /revalidatePath\(back\)/)
  assert.match(ACTION, /revalidatePath\('\/today'\)/)
})
