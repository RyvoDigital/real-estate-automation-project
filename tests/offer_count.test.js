#!/usr/bin/env node
// Unit tests for src/offer_count.js. Loads the SHIPPING source rather than a
// copy, so the tests cannot drift from what the workflow embeds.
//
//   node tests/offer_count.test.js
const fs = require('fs');
const path = require('path');
const SRC = process.env.OFFER_COUNT_SRC || path.join(__dirname, '..', 'src', 'offer_count.js');
eval(fs.readFileSync(SRC, 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };
const inb = (b) => ({ direction: 'inbound', body: b, ai_generated: false, origin: 'lead' });
const ai = (b) => ({ direction: 'outbound', body: b, ai_generated: true, origin: 'ai' });
const human = (b) => ({ direction: 'outbound', body: b, ai_generated: false, origin: 'human' });
const TIC = 'Quer que lhe proponha alguns horários para essa primeira conversa com o nosso colega?';

console.log('\nthe 2026-09-12 transcript: six identical closings');
let rows = [inb('E qual é o próximo passo?'), ai('O próximo passo é uma primeira conversa. ' + TIC),
            inb('Já agora, o meu nome é João Ferreira.'), ai('Prazer, João! ' + TIC),
            inb('Pode tratar-me só por João.'), ai('Combinado, João! ' + TIC),
            inb('Afinal o meu orçamento máximo é 1.1M.'), ai('Entendido. ' + TIC)];
chk('four unanswered offers are counted', countPendingOffers(rows) === 4);
chk('the count is stated for the NEXT turn, so it is the number already made', countPendingOffers(rows.slice(0, 2)) === 1);

console.log('\nthe lead raising booking restarts the count');
rows = [ai('Bom dia! ' + TIC), inb('Sim, que horários têm?'), ai('Temos segunda às 09:00 ou terça às 09:00. Qual destes horários prefere?')];
chk('a lead asking for times takes the offer up; the slot question after it is one new offer', countPendingOffers(rows) === 1);
rows = [ai('Bom dia! ' + TIC), inb('Pode ser terça às 09:00'), ai('Ficou confirmado! Até lá!')];
chk('a lead naming a time restarts, and a confirmation is not an offer', countPendingOffers(rows) === 0);
rows = [ai(TIC), inb('Can I come see it this week?')];
chk('English booking words restart too', countPendingOffers(rows) === 0);

console.log('\nwhat is not an offer');
chk('a qualifying question is not an offer', countPendingOffers([ai('Qual é o orçamento que tem em mente?')]) === 0);
chk('an offer that is not the last sentence does not count', countPendingOffers([ai(TIC + ' Entretanto, qual a zona?')]) === 0);
chk('a statement about times is not an offer', countPendingOffers([ai('Um colega vai confirmar os horários disponíveis.')]) === 0);
chk('a colleague offering from the cockpit is not the assistant repeating itself', countPendingOffers([human('Quer que marquemos uma reunião?')]) === 0);
chk('a handoff note is not the assistant', countPendingOffers([{ direction: 'outbound', body: 'Um colega vai continuar a conversa. Quer marcar uma reunião?', ai_generated: false, origin: 'handoff' }]) === 0);
chk('rows without origin fall back to ai_generated', countPendingOffers([{ direction: 'outbound', body: TIC, ai_generated: true }]) === 1);

console.log('\nthree languages');
chk('English offer', countPendingOffers([ai('Would you like me to suggest some times for a first meeting with our colleague?')]) === 1);
chk('Spanish offer', countPendingOffers([ai('¿Quiere que le proponga algunos horarios para una primera reunión?')]) === 1);
chk('empty and null are zero', countPendingOffers([]) === 0 && countPendingOffers(null) === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
