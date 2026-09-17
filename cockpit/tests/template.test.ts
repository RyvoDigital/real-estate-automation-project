/*
 * The approved-template compiler and the shape matcher.
 *
 * Bodies are the real ones from legal/modelos/modelos-whatsapp.md, because a
 * matcher tested only on invented text is tested on text chosen to match.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  render, variablesIn, variablesAreContiguous,
  compileTemplate, buildVocabulary, MIN_LITERAL_CHARS,
  type Template,
} from '../src/lib/send/template'

const t = (body: string, over: Partial<Template> = {}): Template => ({
  approvalId: 'HX1', clientId: 'c1', name: 'reactivacao_a_1', language: 'pt_PT',
  version: 1, body, ...over,
})

// Verbatim from §3.2 of the templates document.
const A1 = 'Olá {{1}}, fala a Sofia da [Agência]. Já passou algum tempo desde que tratámos da sua casa em {{2}}, e o mercado nessa zona mudou bastante desde então.'
const A3 = 'Olá {{1}}, não volto a insistir.'
const B1 = 'Olá {{1}}, fala a Sofia da [Agência]. Registou interesse em {{2}} e continuamos atentos a essa zona.'
const ES1 = 'Hola {{1}}, le escribe Sofía de [Agencia]. Mostró interés en {{2}} y seguimos atentos a esa zona.'

test('rendering substitutes one-based variables, as Meta numbers them', () => {
  assert.equal(
    render(A1, ['Maria', 'Cascais']),
    'Olá Maria, fala a Sofia da [Agência]. Já passou algum tempo desde que tratámos da sua casa em Cascais, e o mercado nessa zona mudou bastante desde então.',
  )
})

test('rendering with a missing variable throws rather than sending a placeholder', () => {
  // "Olá Maria, … da sua casa em {{2}}" reaching a real person is the failure
  // this refuses. A template rendered short must never go out.
  assert.throws(() => render(A1, ['Maria']), /only 1 variable\(s\) were supplied/)
})

test('variable numbering is read and contiguity is checked, as Meta requires', () => {
  assert.deepEqual(variablesIn(A1), [1, 2])
  assert.deepEqual(variablesIn(A3), [1])
  assert.equal(variablesAreContiguous(A1), true)
  assert.equal(variablesAreContiguous('Olá {{1}} em {{3}}'), false)
  assert.equal(variablesAreContiguous('sem variáveis'), true)
})

test('a rendered message matches the template it came from', () => {
  const c = compileTemplate(t(A1))
  assert.equal(c.ok, true)
  if (c.ok) assert.equal(c.test(render(A1, ['Maria', 'Cascais'])), true)
})

test('it matches whatever the variables were, which is the whole point', () => {
  const c = compileTemplate(t(A1))
  if (!c.ok) throw new Error('should compile')
  for (const vars of [
    ['Maria', 'Cascais'],
    ['João Pedro', 'Estoril'],
    ['Ana', 'São Domingos de Rana'],
    ['Lucía', 'Marbella'],
  ]) assert.equal(c.test(render(A1, vars)), true, vars.join('/'))
})

test('a Concierge reply does not match a template shape', () => {
  const c = compileTemplate(t(A1))
  if (!c.ok) throw new Error('should compile')
  for (const reply of [
    'Claro, qual é o seu horizonte temporal?',
    'Perfeito. Um colega da nossa equipa confirma consigo.',
    'Olá Maria, com certeza. Consigo confirmar amanhã.',   // starts the same way
  ]) assert.equal(c.test(reply), false, reply)
})

test('a DIFFERENT template does not match this one', () => {
  const a = compileTemplate(t(A1))
  if (!a.ok) throw new Error('should compile')
  assert.equal(a.test(render(B1, ['Maria', 'Cascais'])), false,
    'segment A and segment B messages must not be confused for one another')
})

test('THE TOO-VARIABLE REFUSAL: a body that is mostly variables is not compiled', () => {
  // A pattern this loose matches unrelated messages, and reporting "clean" from
  // it is worse than reporting nothing. Same family as the empty vocabulary and
  // the wrong channel prefix: a check that cannot fail, reporting success.
  const c = compileTemplate(t('{{1}} {{2}}'))
  assert.equal(c.ok, false)
  if (!c.ok) {
    assert.equal(c.reason, 'too_variable')
    assert.ok(c.literalChars < MIN_LITERAL_CHARS)
    assert.match(c.detail, /cannot vouch for/)
    assert.match(c.detail, /worse than reporting nothing/)
  }
})

test('the refusal threshold is about LITERAL text, not total length', () => {
  const padded = t('{{1}} {{2}} {{3}} {{4}} {{5}} {{6}} {{7}} {{8}}')
  const c = compileTemplate(padded)
  assert.equal(c.ok, false, 'a long body of nothing but variables is still unrecognisable')
})

test('a short but real template compiles if its literal text is enough', () => {
  const c = compileTemplate(t(A3))   // "Olá {{1}}, não volto a insistir."
  assert.equal(c.ok, true, `${A3} has enough literal text to be recognised`)
})

test('THE VOCABULARY IS NOT FILTERED BY STATUS, and that is deliberate', () => {
  // A message sent under a template Meta disabled yesterday is still one of
  // ours. Filtering the vocabulary to `approved` would make every orphan under
  // it invisible — on the check whose whole job is seeing them. buildVocabulary
  // takes templates, not statuses, so there is nothing to filter on.
  const v = buildVocabulary([t(A1, { approvalId: 'HXa' }), t(B1, { approvalId: 'HXb' })])
  assert.equal(v.usable, 2)
  assert.equal(v.matches(render(A1, ['Maria', 'Cascais'])), 'HXa')
  assert.equal(v.matches(render(B1, ['Maria', 'Cascais'])), 'HXb')
  assert.equal(v.matches('Combinado, até quinta!'), null)
})

test('a vocabulary reports what it refused, so a thin one is visible', () => {
  const v = buildVocabulary([t(A1, { approvalId: 'HXa' }), t('{{1}}', { approvalId: 'HXbad' })])
  assert.equal(v.usable, 1)
  assert.equal(v.refused.length, 1)
  assert.equal(v.refused[0].approvalId, 'HXbad')
  // An operator reading "0 orphans" must be able to see the vocabulary was one
  // template short of what it should have been.
})

test('Spanish and Portuguese templates do not match each other', () => {
  const pt = compileTemplate(t(B1))
  const es = compileTemplate(t(ES1, { language: 'es_ES', approvalId: 'HXes' }))
  if (!pt.ok || !es.ok) throw new Error('both should compile')
  assert.equal(pt.test(render(ES1, ['Lucía', 'Marbella'])), false)
  assert.equal(es.test(render(B1, ['Maria', 'Cascais'])), false)
})

test('regex metacharacters in the template are literal, not pattern', () => {
  // "[Agência]" is in the real bodies and would be a character class.
  const c = compileTemplate(t(A1))
  if (!c.ok) throw new Error('should compile')
  assert.equal(c.test(render(A1, ['Maria', 'Cascais'])), true)
  assert.equal(
    c.test(render(A1, ['Maria', 'Cascais']).replace('[Agência]', 'A')), false,
    'the brackets must match as characters, not as a class',
  )
})

test('a variable cannot swallow a newline, so a multi-line reply cannot pose as one', () => {
  const c = compileTemplate(t(B1))
  if (!c.ok) throw new Error('should compile')
  const sneaky = render(B1, ['Maria', 'Cascais\n\nE outra mensagem completamente diferente'])
  assert.equal(c.test(sneaky), false)
})
