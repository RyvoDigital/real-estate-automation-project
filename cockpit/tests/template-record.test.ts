/*
 * Recording an approved template. The validation is pure, so every refusal is a
 * test with no database.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validate, type RecordInput } from '../src/lib/send/template-record'

const base: RecordInput = {
  clientId: 'c1', name: 'reactivacao_a_1', language: 'pt_PT',
  body: 'Olá {{1}}, fala a Sofia da [Agência]. Já passou algum tempo desde que tratámos da sua casa em {{2}}.',
  category: 'marketing',
  approvalId: 'HX0123456789abcdef0123456789abcdef',
}

test('a well-formed approval is accepted', () => {
  assert.equal(validate(base), null)
})

test('a mistyped approval id is refused HERE rather than by Twilio on the first send', () => {
  for (const approvalId of ['HX_FIXTURE', 'HX123', 'MG0123456789abcdef0123456789abcdef', '', 'HX0123456789abcdef0123456789abcdeZ']) {
    const r = validate({ ...base, approvalId })
    assert.ok(r, `"${approvalId}" was accepted`)
    assert.match(r!, /Twilio Content SID/)
  }
})

test('a real Content SID shape passes, in either case', () => {
  assert.equal(validate({ ...base, approvalId: 'HX0123456789ABCDEF0123456789ABCDEF' }), null)
})

test('non-contiguous variables are refused, because Meta rejects them', () => {
  const r = validate({ ...base, body: 'Olá {{1}}, sobre {{3}}.' })
  assert.match(r!, /not contiguous/)
  assert.match(r!, /\[1,3\]/, 'the refusal names what it found')
})

test('an empty body is refused', () => {
  assert.match(validate({ ...base, body: '   ' })!, /body is empty/)
})

test('a malformed language tag is refused', () => {
  for (const language of ['pt', 'PT_pt', 'portuguese', 'pt-PT']) {
    assert.match(validate({ ...base, language })!, /language tag/, language)
  }
  assert.equal(validate({ ...base, language: 'es_ES' }), null)
})

test('a body with no variables at all is fine', () => {
  assert.equal(validate({ ...base, body: 'Uma mensagem sem variáveis nenhumas, perfeitamente válida.' }), null)
})

test('RECORDING IS NOT A SEND: the module has no route to one', () => {
  const src = readFileSync(new URL('../src/lib/send/template-record.ts', import.meta.url), 'utf8')
    .split('\n').filter((l) => {
      const s = l.trimStart()
      return !s.startsWith('//') && !s.startsWith('*') && !s.startsWith('/*')
    }).join('\n')
  for (const forbidden of [/dispatch/, /SendPermit/, /twilioAdapter/, /TWILIO_/]) {
    assert.equal(forbidden.test(src), false,
      `template-record.ts references ${forbidden} — recording an approval must not be a route to a send`)
  }
})

test('loadVocabulary does not select status, so nothing downstream can filter on it', () => {
  // §4e, structurally: the query does not fetch the column and the returned
  // type has no field for it. A future edit wanting to filter would have to
  // widen the select AND the type — two visible acts rather than one plausible
  // `.eq('status', 'approved')`.
  const src = readFileSync(new URL('../src/lib/send/template-record.ts', import.meta.url), 'utf8')
  const select = src.match(/\.select\('([^']*)'\)\s*\n\s*\.eq\('client_id'/)
  assert.ok(select, 'loadVocabulary\'s select could not be found — has it been rewritten?')
  assert.equal(/status/.test(select![1]), false,
    `loadVocabulary selects "${select![1]}" — status must not be among them`)
  assert.equal(/\.eq\('status'/.test(src), false, 'loadVocabulary must not filter by status')
})
