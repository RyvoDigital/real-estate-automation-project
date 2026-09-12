#!/usr/bin/env node
// Unit tests for matchConfirmation() in src/slot_engine.js -- the SHIPPING
// source, which ProposeSlots and MatchConfirmation embed verbatim.
//
//   node tests/match_confirmation.test.js      (luxon from cockpit/node_modules)
const fs = require('fs');
const path = require('path');
const { DateTime } = require(path.join(__dirname, '..', 'cockpit', 'node_modules', 'luxon'));
eval(fs.readFileSync(process.env.SLOT_ENGINE_SRC || path.join(__dirname, '..', 'src', 'slot_engine.js'), 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };
const TZ = 'Europe/Lisbon', NOW = '2026-09-12T23:00:00Z';
const slot = (iso) => ({ startUtc: iso, endUtc: DateTime.fromISO(iso).plus({ hours: 1 }).toUTC().toISO(), zone: TZ });
// The offer that was open on 2026-09-12 at 23:45: Mon 14 09:00, Tue 15 09:00, Wed 16 09:00 Lisbon
const OFFER = [slot('2026-09-14T08:00:00.000Z'), slot('2026-09-15T08:00:00.000Z'), slot('2026-09-16T08:00:00.000Z')];
const mc = (text, offer) => matchConfirmation(text, offer || OFFER, TZ, NOW);
let r;

console.log('\nthe 2026-09-12 phantom: our own phrase booked the first slot');
r = mc('Hi, quick question. What should I bring to the first meeting?');
chk('"the first meeting" is the appointment, not the first slot', r.status === 'none', r.matchedBy);
r = mc('A primeira reunião é onde?');
chk('"a primeira reunião" in Portuguese', r.status === 'none');
r = mc('¿La primera cita es en la oficina?');
chk('"la primera cita" in Spanish', r.status === 'none');
r = mc('Thanks. Is Tuesday still available?', [OFFER[1]]);
chk('"Is Tuesday still available?" with ONE Tuesday on offer does not book it', r.status === 'none' && r.matchedBy === 'question_not_acceptance');
r = mc('Tem alguma coisa na terça?', [OFFER[1]]);
chk('a Portuguese question about a day does not book it', r.status === 'none');

console.log('\nwhat must still book');
r = mc('the first one please');
chk('"the first one" is a choice', r.status === 'matched' && r.slot.startUtc === OFFER[0].startUtc);
r = mc('a primeira opção');
chk('"a primeira opção"', r.status === 'matched' && r.slot.startUtc === OFFER[0].startUtc);
r = mc('pode ser a terça às 9?');
chk('a question that says yes still books ("pode ser ... ?")', r.status === 'matched' && r.slot.startUtc === OFFER[1].startUtc);
r = mc('Tuesday at 09:00 works');
chk('an affirmative with a time', r.status === 'matched' && r.slot.startUtc === OFFER[1].startUtc);
r = mc('pode ser na terça-feira, dia 15 de setembro de 2026, às 09:00');
chk('the rehearsal acceptance, verbatim', r.status === 'matched' && r.slot.startUtc === OFFER[1].startUtc);
r = mc('Quarta-feira, dia 16, às 09:00');
chk('a bare slot restated', r.status === 'matched' && r.slot.startUtc === OFFER[2].startUtc);
r = mc('the last one');
chk('"the last one"', r.status === 'matched' && r.slot.startUtc === OFFER[2].startUtc);
r = mc('sim', [OFFER[0]]);
chk('a bare yes with a single offer', r.status === 'matched');

console.log('\nunchanged guards');
chk('a bare yes with several offers is ambiguous', mc('sim').status === 'ambiguous');
chk('a weekday never offered is not a confirmation', mc('sexta-feira às 9').status === 'none');
chk('a time never offered is not a confirmation', mc('terça às 14:00').status === 'none');
chk('no offer, nothing to match', mc('the first one', []).status === 'no_offer');
chk('empty text', mc('').status === 'none');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
