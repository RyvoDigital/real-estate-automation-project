#!/usr/bin/env node
// Unit tests for src/transcript.js. Loads the SHIPPING source rather than a
// copy, so the tests cannot drift from what the workflow embeds.
//
//   node tests/transcript.test.js
const fs = require('fs');
const path = require('path');
const SRC = process.env.TRANSCRIPT_SRC || path.join(__dirname, '..', 'src', 'transcript.js');
eval(fs.readFileSync(SRC, 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };

const at = (m) => `2026-09-11T15:${String(m).padStart(2, '0')}:00.000Z`;
const IN  = (m, body) => ({ direction: 'inbound',  body, ai_generated: false, approved_by_human: null, origin: 'lead',    created_at: at(m) });
const AI  = (m, body) => ({ direction: 'outbound', body, ai_generated: true,  approved_by_human: null, origin: 'ai',      created_at: at(m) });
const HUM = (m, body) => ({ direction: 'outbound', body, ai_generated: false, approved_by_human: true, origin: 'human',   created_at: at(m) });
const HND = (m, body) => ({ direction: 'outbound', body, ai_generated: false, approved_by_human: null, origin: 'handoff', created_at: at(m) });

console.log('\noriginOf — the column wins, flags are the fallback');
chk('origin column respected', originOf({ origin: 'handoff', direction: 'outbound', ai_generated: true }) === 'handoff');
chk('inbound without column -> lead', originOf({ direction: 'inbound' }) === 'lead');
chk('ai_generated without column -> ai', originOf({ direction: 'outbound', ai_generated: true }) === 'ai');
chk('approved_by_human without column -> human', originOf({ direction: 'outbound', ai_generated: false, approved_by_human: true }) === 'human');
chk('unknown outbound -> system (fail-safe: labelled as not yours)', originOf({ direction: 'outbound', ai_generated: false }) === 'system');
chk('garbage origin value falls back', originOf({ origin: 'bot', direction: 'outbound', ai_generated: true }) === 'ai');

// ---- the 2026-09-11 conversation, replayed --------------------------------
console.log('\nthe 2026-09-11 conversation, replayed');
const rows = [
  IN (42, 'Quero falar com uma pessoa'),
  HND(43, 'Um colega da nossa equipa vai continuar a conversa consigo e entra em contacto em breve.'),
  IN (43, 'Olá?'),
  HUM(45, 'hello'),
  IN (46, 'Qual é o próximo passo?'),
];
const t = shapeTranscript(rows, { escalationClearedAt: at(45) });
const txt = t.map((x) => x.role + ': ' + x.content).join('\n');
chk('starts with a user turn', t[0].role === 'user');
chk('ends with the current lead message', t[t.length - 1].role === 'user' && /próximo passo/.test(t[t.length - 1].content));
chk('roles alternate', t.every((x, i) => i === 0 || x.role !== t[i - 1].role), t.map((x) => x.role).join(','));
chk('handoff note is labelled as not written by the assistant', /\[Automatic handoff note[^\]]*Not written by you\.\]\nUm colega/.test(txt));
chk('human reply is labelled as a colleague', /\[Written by a human colleague[^\]]*\]\nhello/.test(txt));
chk('hand-back note present, after the human reply, before the next lead message',
    txt.indexOf('[System note: at 2026-09-11 15:45 UTC') > txt.indexOf('hello') &&
    txt.indexOf('[System note') < txt.indexOf('próximo passo'));
chk('hand-back note says not to escalate for what is above it', /Do not set needs_human again for anything above it/.test(txt));
chk('lead turns are never labelled', !/\[[^\]]*\]\nQuero falar/.test(txt));

// ---- hand-back edge cases ---------------------------------------------------
console.log('\nhand-back note placement');
chk('no hand-back -> no note', !/System note/.test(shapeTranscript(rows, {}).map((x) => x.content).join('\n')));
chk('hand-back older than the whole window -> no note (nothing left to close)',
    !/System note/.test(shapeTranscript(rows, { escalationClearedAt: at(30) }).map((x) => x.content).join('\n')));
chk('hand-back newer than every row -> no note (nothing below it yet)',
    !/System note/.test(shapeTranscript(rows, { escalationClearedAt: at(59) }).map((x) => x.content).join('\n')));
chk('hand-back without a human reply still gets the note',
    (() => {
      const r2 = [IN(42, 'Quero falar com uma pessoa'), HND(43, 'Um colega vai continuar.'), IN(50, 'Que zonas trabalham?')];
      const s = shapeTranscript(r2, { escalationClearedAt: at(47) }).map((x) => x.role + ': ' + x.content).join('\n');
      return /System note/.test(s) && s.indexOf('System note') < s.indexOf('Que zonas');
    })());
chk('unparseable clear time -> treated as no hand-back',
    !/System note/.test(shapeTranscript(rows, { escalationClearedAt: 'garbage' }).map((x) => x.content).join('\n')));

// ---- shape guarantees -------------------------------------------------------
console.log('\nshape guarantees');
chk('leading assistant turns are dropped', shapeTranscript([AI(1, 'Olá!'), IN(2, 'Olá')], {})[0].role === 'user');
chk('empty bodies are skipped', shapeTranscript([IN(1, '  '), IN(2, 'hi')], {}).length === 1);
chk('consecutive lead messages merge into one user turn',
    (() => { const s = shapeTranscript([IN(1, 'a'), IN(2, 'b')], {}); return s.length === 1 && s[0].content === 'a\n\nb'; })());
chk('an ordinary AI reply is passed through unlabelled',
    shapeTranscript([IN(1, 'hi'), AI(2, 'Hello!'), IN(3, 'x')], {})[1].content === 'Hello!');
chk('a media system reply is labelled generically',
    /\[Automatic system message, not written by you\.\]\nGot your file/.test(
      shapeTranscript([IN(1, '[image]'), { direction: 'outbound', body: 'Got your file', ai_generated: false, origin: 'system', created_at: at(2) }, IN(3, 'x')], {})[1].content));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
