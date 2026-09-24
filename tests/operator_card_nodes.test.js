#!/usr/bin/env node
// The handoff card as the WORKFLOW runs it: each builder node's jsCode, and each
// Notify node's Body/To expressions, executed against mocked n8n inputs taken
// from the 24 Sep 2026 demo escalation. tests/operator_card.test.js proves the
// module; this proves the nodes read the right fields and that the fallback in
// the Body expression produces the old three-line alert when the builder left
// nothing behind.
//
//   node tests/operator_card_nodes.test.js
//   WORKFLOW=path/to/other.json node tests/operator_card_nodes.test.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { DateTime } = require(path.join(ROOT, 'cockpit', 'node_modules', 'luxon'));
const WF = process.env.WORKFLOW || path.join(ROOT, 'workflows', 'ryvoInboundConc01.json');
let w = JSON.parse(fs.readFileSync(WF, 'utf8'));
w = Array.isArray(w) ? w[0] : w;
const node = name => w.nodes.find(n => n.name === name);

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d && !c ? '  ' + d : ''}`); };

// $('X') the way n8n behaves: a node that did not run THROWS.
const mock = (fixtures) => (name) => {
  if (!(name in fixtures)) throw new Error(`Referenced node is unexecuted: ${name}`);
  return { first: () => ({ json: fixtures[name] }) };
};
const runCode = (name, fixtures) =>
  new Function('$', 'DateTime', node(name).parameters.jsCode)(mock(fixtures), DateTime)[0].json;
const param = (name, p) => node(name).parameters.bodyParameters.parameters.find(x => x.name === p).value;
// An n8n "={{ expr }}" value, evaluated as the expression it is.
const evalExpr = (v, $json, fixtures) => {
  const m = v.match(/^=(.*)\{\{ ([\s\S]*) \}\}$/);
  return m[1] + new Function('$', '$json', 'return (' + m[2] + ');')(mock(fixtures), $json);
};

const TO = '+351900000001';
const LEGACY_DEMO = 'Ryvo escalation\n+351912345230\nReason: needs_human:I want to talk to a human. | high_value:3000000>=2000000\nLast msg: "I want to talk to a human."';

// ---------------------------------------------------------------------------
console.log('\nBuildOperatorAlert, on the 24 Sep 15:06 escalation of …230');
const MAIN = {
  AfterHandoff: { from: '+351912345230', body: 'I want to talk to a human.', escalateTo: TO,
    escalationReasons: ['needs_human:I want to talk to a human.', 'high_value:3000000>=2000000'],
    escalationReason: 'needs_human:I want to talk to a human. | high_value:3000000>=2000000',
    escalationKind: 'person_request', handoffOk: true, bookingRetiredNote: null },
  AfterLead: { config: { timezone: 'Europe/Lisbon', escalate_to: TO }, priorLead: { full_name: 'stale' } },
  AfterLeadUpdate: { leadAfter: { full_name: 'João', lead_type: 'buyer', budget_min: null, budget_max: '3000000',
    timeline: null, area: 'Cascais or Estoril',
    qualification: { bedrooms: 3, booking: { startUtc: '2026-09-25T16:00:00.000Z', zone: 'Europe/Lisbon' } } } },
  BuildClaudeRequest: { leadLang: 'en', leadLangSource: 'history', propertyRefs: [] },
  AfterBooking: { disclosure: { handoffApplied: false }, promisedButFailed: false },
  ReadDisclosureState: { statusCode: 200, body: [{ created_at: '2026-09-24T14:49:28.000Z' }] },
};
let o = runCode('BuildOperatorAlert', MAIN);
chk('a card', o.alertFormat === 'card', o.alertLegacyReason);
chk('to the configured number', o.alertTo === TO);
chk('the exact card, from the row AFTER the merge (not priorLead)', o.alertBody === [
  '*Passagem para uma pessoa*',
  '*Contacto:* João · +351 912 345 230',
  '*Idioma:* inglês',
  '*Procura:* compra · Cascais ou Estoril · T3',
  '*Orçamento:* até 3.000.000 €',
  '*Prazo:* não indicado',
  '*Motivo:* pediu para falar com uma pessoa; valor acima do limiar (3.000.000 €)',
  '*Já dito:* o cliente foi informado de que fala com um assistente de IA (24 set, 15:49); tem reunião marcada para sexta, 25 set, às 17:00 (Lisboa); o cliente foi informado de que um colega entra em contacto em breve',
].join('\n'), '\n' + o.alertBody);
chk('NotifyOperator sends what the node built', evalExpr(param('NotifyOperator', 'Body'), o, MAIN) === o.alertBody);
chk('... to the node\'s recipient', evalExpr(param('NotifyOperator', 'To'), o, MAIN) === 'whatsapp:' + TO);

console.log('\nthe note actually sent decides the promise');
o = runCode('BuildOperatorAlert', Object.assign({}, MAIN, {
  AfterBooking: { disclosure: {}, promisedButFailed: true, bookingResult: 'slot_taken' } }));
chk('a lost race: the slot-taken note', /horário escolhido ficou ocupado/.test(o.alertBody));
o = runCode('BuildOperatorAlert', Object.assign({}, MAIN, {
  AfterHandoff: Object.assign({}, MAIN.AfterHandoff, { bookingRetiredNote: 'A marcação…', handoffOk: false }) }));
chk('a retired-booking note that failed to deliver says so', /NÃO foi entregue/.test(o.alertBody));
o = runCode('BuildOperatorAlert', Object.assign({}, MAIN, { AfterBooking: { disclosure: { handoffApplied: true }, promisedButFailed: false } }));
chk('the disclosure went with THIS handoff: the card says so, with the time of the card',
  /informado de que fala com um assistente de IA \(\d+ \w+, \d\d:\d\d\)/.test(o.alertBody));

console.log('\nlayer 2: the builder left nothing -> NotifyOperator still sends the OLD alert');
chk('Body with an error item as $json is the three-line alert, byte for byte',
  evalExpr(param('NotifyOperator', 'Body'), { error: 'boom' }, MAIN) === LEGACY_DEMO,
  JSON.stringify(evalExpr(param('NotifyOperator', 'Body'), { error: 'boom' }, MAIN)));
chk('To falls back to escalateTo', evalExpr(param('NotifyOperator', 'To'), { error: 'boom' }, MAIN) === 'whatsapp:' + TO);
chk('NotifyOperatorPlain is always the three-line alert',
  evalExpr(param('NotifyOperatorPlain', 'Body'), {}, MAIN) === LEGACY_DEMO);
o = runCode('BuildOperatorAlert', {});
chk('every upstream node missing: the node still returns something to send', typeof o.alertBody === 'string' && o.alertBody.length > 0);

console.log('\nlayer 3: Twilio refused the card -> one plain retry, and only then');
const rej = (name, fx) => evalExpr('={{ ' + node(name).parameters.conditions.conditions[0].leftValue.slice(4, -3) + ' }}', {}, fx);
chk('card refused (400) -> retry', rej('IsCardRejected', Object.assign({}, MAIN, { NotifyOperator: { statusCode: 400 }, BuildOperatorAlert: { alertFormat: 'card' } })) === 'true');
chk('card accepted (201) -> no retry', rej('IsCardRejected', Object.assign({}, MAIN, { NotifyOperator: { statusCode: 201 }, BuildOperatorAlert: { alertFormat: 'card' } })) === 'false');
chk('the plain alert refused -> no retry of the same thing', rej('IsCardRejected', Object.assign({}, MAIN, { NotifyOperator: { statusCode: 400 }, BuildOperatorAlert: { alertFormat: 'legacy' } })) === 'false');
chk('the builder failed (no output) -> no retry, the Body already fell back', rej('IsCardRejected', Object.assign({}, MAIN, { NotifyOperator: { statusCode: 400 } })) === 'false');

// ---------------------------------------------------------------------------
console.log('\nBuildOperatorAlertMedia: a second voice note');
const MEDIA = {
  AfterLead: { from: '+351912345230', body: '[voice note]', mediaKind: 'audio',
    config: { timezone: 'Europe/Lisbon', escalate_to: TO },
    priorLead: { full_name: 'João', lead_type: 'buyer', area: 'Cascais', qualification: {} }, priorQualification: {} },
  AfterMediaSend: { mediaSendOk: true, mediaLang: 'pt', mediaLangSource: 'history', disclosure: { applied: false } },
  ReadDisclosureState: { statusCode: 200, body: [{ created_at: '2026-09-24T21:58:00.000Z' }] },
};
o = runCode('BuildOperatorAlertMedia', MEDIA);
chk('a card, to the configured number', o.alertFormat === 'card' && o.alertTo === TO, o.alertLegacyReason);
chk('Motivo: the voice note, in Portuguese', /\*Motivo:\* enviou de novo uma mensagem de voz/.test(o.alertBody), o.alertBody);
chk('Já dito: the media note\'s commitment', /a conversa passa para um colega/.test(o.alertBody));
chk('Idioma: português, from the lead\'s earlier words', /\*Idioma:\* português/.test(o.alertBody));
chk('NotifyOperatorMedia Body falls back to the three-line alert',
  evalExpr(param('NotifyOperatorMedia', 'Body'), { error: 'x' }, MEDIA) === 'Ryvo escalation\n+351912345230\nReason: media_unprocessable:audio\nLast msg: "[voice note]"');
chk('NotifyOperatorMedia To falls back to the config', evalExpr(param('NotifyOperatorMedia', 'To'), { error: 'x' }, MEDIA) === 'whatsapp:' + TO);

// ---------------------------------------------------------------------------
console.log('\nBuildOperatorAlertInternal: a Code node threw');
const INT = (zone, canReply, sendStatus) => {
  const fx = {
    CatchInternal: { zone, canReply, from: '+351912345230', body: 'Olá, queria ver casas em Cascais',
      errorType: 'internal_error:ParseClaude', priorQualification: {},
      disclosure: { applied: true, state: { everDisclosed: false, failsafe: false } } },
    AfterLead: { config: { timezone: 'Europe/Lisbon', escalate_to: TO }, priorLead: { full_name: 'João' } },
  };
  if (sendStatus) fx.SendInternalHandoff = { statusCode: sendStatus };
  return fx;
};
o = runCode('BuildOperatorAlertInternal', INT(2, true, 201));
chk('zone 2, handoff sent: a card to the operator', o.alertFormat === 'card' && o.alertTo === TO, o.alertLegacyReason);
chk('Motivo: a technical failure, in Portuguese', /\*Motivo:\* falha técnica interna/.test(o.alertBody));
chk('Idioma resolved from the lead\'s own words', /\*Idioma:\* português/.test(o.alertBody));
chk('Já dito: told a colleague is coming, and the disclosure that went with it',
  /colega entra em contacto/.test(o.alertBody) && /informado de que fala com um assistente de IA/.test(o.alertBody));
o = runCode('BuildOperatorAlertInternal', INT(2, false, null));
chk('zone 2, NO reply possible: still a card, saying the lead got nothing', o.alertTo === TO && /o cliente não recebeu resposta/.test(o.alertBody) && /nada foi prometido/.test(o.alertBody));
chk('zone 4 (the lead already had their reply): no card', runCode('BuildOperatorAlertInternal', INT(4, false, null)).alertTo === null);
chk('zone 1 (no client): no card', runCode('BuildOperatorAlertInternal', Object.assign(INT(1, false, null), { AfterLead: undefined })).alertTo === null);
chk('HasInternalAlertTo gates on the recipient', node('HasInternalAlertTo').parameters.conditions.conditions[0].leftValue === '={{ !!$json.alertTo }}');
chk('NotifyOperatorInternal Body falls back to the three-line alert',
  evalExpr(param('NotifyOperatorInternal', 'Body'), { alertTo: TO }, INT(2, true, 201))
  === 'Ryvo escalation\n+351912345230\nReason: internal_error:ParseClaude\nLast msg: "Olá, queria ver casas em Cascais"');
o = runCode('BuildOperatorAlertInternal', {});
chk('nothing readable at all: no recipient, and it does not throw', o.alertTo === null);

// ---------------------------------------------------------------------------
console.log('\nwiring');
const outs = (n, i) => ((w.connections[n] || {}).main || [])[i] || [];
chk('StoreHandoffMessage -> BuildOperatorAlert -> NotifyOperator', outs('StoreHandoffMessage', 0).some(c => c.node === 'BuildOperatorAlert') && outs('BuildOperatorAlert', 0).some(c => c.node === 'NotifyOperator'));
chk('BuildOperatorAlert\'s ERROR output still reaches NotifyOperator (and the handler)', outs('BuildOperatorAlert', 1).some(c => c.node === 'NotifyOperator') && outs('BuildOperatorAlert', 1).some(c => c.node === 'CatchInternal'));
chk('BuildOperatorAlertMedia\'s ERROR output still reaches NotifyOperatorMedia', outs('BuildOperatorAlertMedia', 1).some(c => c.node === 'NotifyOperatorMedia'));
chk('the media email still goes after the card', outs('IsMediaCardRejected', 1).some(c => c.node === 'EmailMediaEscalation') && outs('NotifyOperatorMediaPlain', 0).some(c => c.node === 'EmailMediaEscalation'));
chk('the internal email still goes on every branch', outs('HasInternalAlertTo', 1).some(c => c.node === 'EmailInternalFailure') && outs('IsInternalCardRejected', 1).some(c => c.node === 'EmailInternalFailure') && outs('NotifyOperatorInternalPlain', 0).some(c => c.node === 'EmailInternalFailure'));
chk('both internal entries reach the builder', outs('NeedsLeadReply', 1).some(c => c.node === 'BuildOperatorAlertInternal') && outs('MarkInternalEscalated', 0).some(c => c.node === 'BuildOperatorAlertInternal'));
for (const n of ['NotifyOperator', 'NotifyOperatorPlain', 'NotifyOperatorMedia', 'NotifyOperatorMediaPlain', 'NotifyOperatorInternal', 'NotifyOperatorInternalPlain'])
  chk(`${n}: survives its own error, never throws on a 4xx`, node(n).onError === 'continueRegularOutput' && node(n).parameters.options.response.response.neverError === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
