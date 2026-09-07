import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixedReply, guardDraft, mustUseFixedReply } from '../src/lib/draft'

/*
 * §11 item 13: the draft assistant never proposes a time, never drafts a
 * negotiating position, and never invents a figure. These are guards rather
 * than prompt instructions, so they are testable — and they are tested
 * against the exact things a model plausibly writes, not against strawmen.
 */

const NOTHING = 'Boa tarde, tenho interesse na moradia.'

test('a reasonable draft passes', () => {
  const r = guardDraft(
    'Boa tarde Sofia, obrigado pela mensagem. Um colega vai entrar em contacto consigo para tratar disto pessoalmente.',
    NOTHING,
  )
  assert.equal(r.ok, true)
})

test('NEVER proposes a time — every shape a model actually writes', () => {
  const bad = [
    'Posso marcar a visita para as 10:00.',
    'Tenho disponibilidade às 15 horas.',
    'Would 3pm work for you?',
    'Podemos marcar para quinta-feira.',
    'Can we do Tuesday?',
    '¿Le viene bien el martes?',
    'Marcamos para amanhã?',
    'I could do tomorrow.',
    'Que tal dia 12 de setembro?',
  ]
  for (const d of bad) {
    const r = guardDraft(d, NOTHING)
    assert.equal(r.ok, false, `should have been refused: ${d}`)
    if (!r.ok) assert.equal(r.reason, 'proposed_a_time', d)
  }
})

test('a time the LEAD mentioned is still refused in the draft', () => {
  // The lead saying "quinta às 10" does not license the assistant to confirm
  // it. The workflow owns slots; the draft has none.
  const r = guardDraft(
    'Confirmo a visita para quinta às 10:00.',
    'Queria visitar quinta às 10:00',
  )
  assert.equal(r.ok, false)
})

test('NEVER invents a figure, but may repeat one the lead used', () => {
  const conversation = 'O meu orçamento é até 900.000 euros.'

  const invented = guardDraft('Temos opções a partir de €750.000.', conversation)
  assert.equal(invented.ok, false)
  if (!invented.ok) assert.equal(invented.reason, 'invented_a_figure')

  const repeated = guardDraft(
    'Registei o seu orçamento de 900.000 euros e um colega entra em contacto.',
    conversation,
  )
  assert.equal(repeated.ok, true, 'quoting the lead back to themselves is fine')
})

test('an empty draft is a failure, not an empty reply', () => {
  assert.equal(guardDraft('   ', NOTHING).ok, false)
})

test('a high-value escalation never reaches the model at all', () => {
  // §7: this is the most likely draft request and exactly where a drafted
  // negotiating position does the most damage. The control is not a better
  // prompt — it is not asking.
  const r = mustUseFixedReply(['high_value:3200000>=1500000'], NOTHING)
  assert.equal(r.fixed, true)
})

test('a conversation about price never reaches the model either', () => {
  for (const c of [
    'Há margem para negociação?',
    'Can you do a better price?',
    '¿Hay algún descuento?',
    'Qual é a vossa melhor proposta?',
  ]) {
    assert.equal(mustUseFixedReply(['needs_human:x'], c).fixed, true, c)
  }
})

test('an ordinary escalation does reach the model', () => {
  const r = mustUseFixedReply(
    ['needs_human:wants to speak to someone'],
    'Bom dia, posso falar com uma pessoa?',
  )
  assert.equal(r.fixed, false)
})

test('the fixed reply is the client’s own handoff note, in the lead’s language', () => {
  const handoff = { pt: 'Um colega entra em contacto.', en: 'A colleague will be in touch.', es: 'Un compañero le contactará.' }
  assert.equal(fixedReply(handoff, 'es', 'pt'), 'Un compañero le contactará.')
  // Falls back to the client's default rather than to English-by-accident.
  assert.equal(fixedReply(handoff, 'fr', 'pt'), 'Um colega entra em contacto.')
  assert.equal(fixedReply(undefined, 'pt', 'pt'), null)
})
