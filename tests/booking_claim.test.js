#!/usr/bin/env node
// Unit tests for src/booking_claim.js. Loads the SHIPPING source rather than a
// copy, so the tests cannot drift from what the workflow embeds.
//
//   node tests/booking_claim.test.js
const fs = require('fs');
const path = require('path');
const SRC = process.env.BOOKING_CLAIM_SRC || path.join(__dirname, '..', 'src', 'booking_claim.js');
eval(fs.readFileSync(SRC, 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };
const claims = (n, s) => chk(n, bookingClaim(s) !== null, `"${s}" -> ${bookingClaim(s)}`);
const passes = (n, s) => chk(n, bookingClaim(s) === null, `"${s}" -> ${bookingClaim(s)}`);

console.log('\nassertions that must be caught');
claims('the 2026-09-12 reply', 'Já tem uma reunião marcada para terça-feira, dia 15 de setembro de 2026, às 09:00 (hora de Lisboa). Deseja marcar outra reunião ou alterar essa data?');
claims('the paraphrase from the brief', 'A reunião fica então para terça.');
claims('pt: está marcada para', 'A sua visita está marcada para quarta-feira às 10:00.');
claims('pt: ficou confirmada para dia', 'Ficou confirmada para dia 16, às 09:00, hora de Lisboa.');
claims('pt: temos a reunião marcada', 'Temos a reunião marcada para segunda de manhã.');
claims('pt: já está confirmada', 'Sim, já está confirmada para terça.');
claims('pt: a reunião continua para', 'A reunião continua para terça-feira às 09:00.');
claims('es: ya tiene una cita', 'Ya tiene una cita el martes 15 a las 09:00.');
claims('es: la cita queda para', 'Su cita queda para el miércoles a las 10:00.');
claims('es: queda confirmada para el', 'Queda confirmada para el jueves a las 11:00.');
claims('en: you already have', 'You already have a meeting on Tuesday 15 September at 09:00 Lisbon time.');
claims('en: your meeting is set for', 'Your meeting is set for Tuesday at 09:00.');
claims('en: is booked for', 'The first meeting is booked for Wednesday 16 September at 09:00.');
claims('en: we have you down for', 'We have you down for Tuesday at 9.');
claims('en: I have you booked for', "I've got you booked for Monday morning.");
claims('mixed: assertion then question', 'A reunião fica para terça às 09:00. Quer que confirme?');

console.log('\nhonest replies that must pass');
passes('pt: an offer as a question', 'Quer que fique marcada para terça-feira às 09:00?');
passes('pt: a conditional offer', 'Assim que confirmar, fica marcada.');
passes('pt: offering times', 'Tenho disponibilidade na segunda às 09:00 ou na terça às 09:00, hora de Lisboa. Qual prefere?');
passes('pt: posso marcar', 'Posso marcar uma primeira reunião com um colega. Que dia lhe dá mais jeito?');
passes('pt: the negation - no booking', 'Neste momento não tem nenhuma reunião marcada.');
passes('pt: the negation - no longer', 'A reunião que tínhamos já não está na nossa agenda. Um colega vai entrar em contacto consigo.');
passes('pt: the retired note itself', 'A marcação que tínhamos para terça-feira, 15 de setembro às 09:00 (hora de Lisboa) já não está na nossa agenda. Peço desculpa pelo incómodo.');
passes('pt: vou verificar', 'Vou verificar a disponibilidade e volto a contactá-lo em breve.');
passes('es: an offer', '¿Le viene bien el martes a las 09:00 o el miércoles a las 10:00?');
passes('es: the negation', 'Ahora mismo no tiene ninguna cita programada.');
passes('es: puedo agendar', 'Puedo agendar una primera reunión con un compañero. ¿Qué día le conviene?');
passes('en: an offer', 'I can offer Monday at 09:00 or Tuesday at 09:00 Lisbon time. Which works for you?');
passes('en: the negation', "You don't have anything booked at the moment.");
passes('en: no longer in the diary', 'The earlier appointment is no longer in the diary; a colleague will be in touch.');
passes('en: will check', "I'll check availability and come back to you.");
passes('empty', '');


console.log('\n2026-09-14: the promise in the future tense');
chk('"I\'ll get that first meeting set for Tuesday" is a claim', bookingClaim("Perfect, I'll get that first meeting set for Tuesday, 15 September at 15:00 Lisbon time with our colleague.") !== null);
chk('"they\'ll be in touch to confirm" is a claim', bookingClaim("Our colleague will be in touch to confirm.") !== null);
chk('"vou marcar" is a claim', bookingClaim('Perfeito, vou marcar a reunião para terça às 15:00.') !== null);
chk('"voy a agendar" is a claim', bookingClaim('Perfecto, voy a agendar la reunión para el martes a las 15:00.') !== null);
chk('"I\'ll set you up for Thursday" (suite 7)', bookingClaim("Great choice! I'll set you up for Thursday, 10 September 2026 at 11:00 Lisbon time.") !== null);
chk('"vamos marcar para quinta-feira" (suite 7)', bookingClaim('Perfeito, vamos marcar para quinta-feira, dia 10 de setembro às 11:00. Já vou tratar disso.') !== null);
chk('"dejo propuesto el jueves" (suite 7)', bookingClaim('Perfecto, dejo propuesto el jueves 10 de septiembre a las 11:00.') !== null);
chk('"Quedamos para el jueves" (suite 7)', bookingClaim('¡Perfecto! Quedamos para el jueves 10 de septiembre a las 11:00, hora de Lisboa.') !== null);
chk('"reservamos el jueves" (suite 7)', bookingClaim('Perfecto, entonces reservamos el jueves 10 de septiembre a las 11:00.') !== null);
chk('offering times is not a promise', bookingClaim('Would any of these work for you: Tuesday at 15:00 or Wednesday at 09:00 Lisbon time?') === null);
chk('"vamos marcar de novo" followed by an offer is not a promise', bookingClaim('Essa reunião já não consta da nossa agenda, por isso vamos marcar de novo. Temos disponibilidade na segunda-feira às 09:00.') === null);
chk('"a colleague will confirm what is available" is about stock, not a booking', bookingClaim('A colleague will confirm what is currently available in Cascais.') === null);
console.log('\n2026-09-14: the present tense used as a future, in three languages');
chk('"marco então quinta-feira" (suite 7, twice)', bookingClaim('Perfeito, marco então quinta-feira, 10 de setembro de 2026, às 11:00 (hora de Lisboa).') !== null);
chk('"agendo já a sua reunião"', bookingClaim('Ótimo, agendo já a sua reunião para quinta às 11:00.') !== null);
chk('"deixo marcado para quinta"', bookingClaim('Combinado, deixo marcado para quinta-feira às 11:00.') !== null);
chk('"reservo el jueves"', bookingClaim('Perfecto, reservo el jueves 10 de septiembre a las 11:00.') !== null);
chk('"te agendo para el jueves"', bookingClaim('Genial, te agendo para el jueves a las 11:00.') !== null);
chk('"queda reservado el jueves"', bookingClaim('Perfecto, queda reservado el jueves a las 11:00, hora de Lisboa.') !== null);
chk('"I\'m booking you in for Thursday"', bookingClaim("Lovely, I'm booking you in for Thursday 10 September at 11:00 Lisbon time.") !== null);
chk('"I\'m putting you down for Thursday"', bookingClaim("I'm putting you down for Thursday at 11:00.") !== null);
chk('"I\'m setting up that first meeting"', bookingClaim("Great, I'm setting up that first meeting for Thursday.") !== null);

console.log('\n2026-09-21: an adverb between "quedamos" and the day, and its neighbours');
// CAPTURED OUTPUT, word for word: suite 7 re-run on 21 Sep 2026 against the
// deployed build (prompt and workflow identical to HEAD 9ba3d59e), judged FAIL.
// The first of the two 16 Sep misses, reproduced. The rule above it already caught
// this shape; it is kept as the verbatim record the 16 Sep run never saved.
claims('es: CAPTURED suite-7 output, 21 Sep', 'Perfecto, entonces quedamos el jueves 10 de septiembre de 2026 a las 11:00 (hora de Lisboa) para una primera reunión con nuestro colega. ¿Me confirmas que ese horario te va bien?');
// NOT CAPTURED OUTPUT. This is the wording of docs/remaining-defects-session-2.md,
// quoted there as truncated ("..."). The 21 Sep re-run (20 replies) did not
// reproduce this shape, and the 16 Sep output was never saved in full.
claims("es: the DOC'S WORDING of the 16 Sep miss, not captured output", 'Perfecto, quedamos entonces para el jueves');
// Constructed neighbours, the same shape in each language:
claims('es: quedamos ya para el', 'Muy bien, quedamos ya para el martes a las 10:00.');
claims('pt: ficamos entao para', 'Perfeito, ficamos então para quinta-feira às 11:00.');
claims('pt: ficamos combinados para', 'Combinado, ficamos combinados para quinta às 11:00.');
claims("en: we're set for", "Great, we're set for Thursday at 11:00 then.");
claims("en: we're on for", "So we're on for Tuesday at 15:00.");
passes('es: quedamos a la espera is not a booking', 'Quedamos a la espera de su respuesta.');
passes('pt: ficamos a aguardar is not a booking', 'Ficamos a aguardar a sua resposta.');
passes('pt: ficamos para ja is not a booking', 'Ficamos para já por aqui, obrigado.');
passes("en: we're on for a season is not a booking", "We're on for a busy season in Cascais.");
passes('es: the same words as a question are not a claim', '¿Quedamos entonces para el jueves?');

chk('a colleague called Marco is not a booking', bookingClaim('O Marco, o nosso colega, entra em contacto consigo em breve.') === null);
chk('"um marco histórico" is not a booking', bookingClaim('A Quinta da Marinha é um marco histórico da zona.') === null);
chk('"I\'m looking forward to it" is not a booking', bookingClaim("I'm looking forward to hearing which time suits you.") === null);
chk('"reservo o direito" style prose is not a booking', bookingClaim('Reservo a minha opinião até falar com um colega.') === null);

// Typographic apostrophes (21 Sep 2026). Every contraction pattern here is written
// with a straight quote, and a phone or a model can type ’ (U+2019). A missed claim
// is the dangerous direction: the lead believes in a booking nobody made.
claims('en, U+2019: "that’s booked"', 'Perfect, that’s booked for Thursday at 10:00.');
claims('en, U+2019: "we’re set for"', 'Great, we’re set for Thursday at 11:00 then.');
claims('en, U+2019: "we’re on for"', 'So we’re on for Tuesday at 15:00.');
claims('en, U+02BC: "weʼre all set for"', 'Brilliant, weʼre all set for Thursday.');
chk('en, U+2019: "I’m looking forward to it" is still not a booking', bookingClaim('I’m looking forward to hearing which time suits you.') === null);

console.log('\n2026-09-22: the model\'s own confirmations (invariant 2 reads this list and nothing else)');
// CAPTURED OUTPUT, word for word: the six real confirmations that matched no
// pattern before 22 Sep. Invariant 2 fires on a claim with no event behind it, so
// a confirmation shape this list cannot see is a phantom booking it cannot see.
claims('pt: "Fica confirmada a sua primeira reunião" (gate exec 5105)', 'Ótimo, João! Fica confirmada a sua primeira reunião com o nosso colega para quarta-feira, 23 de setembro de 2026, às 10:00, horário de Lisboa. Até lá!');
claims('pt: "Fica confirmada a nossa primeira reunião" (gate exec 5162)', 'Ótimo, João! Fica confirmada a nossa primeira reunião com o colega para quarta-feira, dia 23 de setembro de 2026, às 16:00 (horário de Lisboa). Até lá!');
claims('en: "You\'re all set for a first meeting" (gate exec 5180)', 'Great choice, João! You\'re all set for a first meeting with our colleague on Wednesday, 23 September 2026 at 18:00 Lisbon time. Looking forward to it!');
claims('en: "you\'re all set for Thursday" (gate exec 5190)', 'Perfect, João - you\'re all set for Thursday 24 September 2026 at 09:00 Lisbon time for a first meeting with our colleague. We\'ll take it from there and go through everything with you then!');
claims('es: "Confirmado: primera reunión" (gate exec 5210)', '¡Perfecto, João! Confirmado: primera reunión con nuestro colega el jueves 24 de septiembre de 2026 a las 11:00, hora de Lisboa. ¡Nos vemos entonces!');
claims('en: "you\'re booked in for", behind the disclosure banner (gate exec 5221)', '🤖 Sofia, ZZ GATE\'s virtual assistant. This conversation is answered by artificial intelligence, not by a person.\n\nGreat, you\'re booked in for a first meeting with our colleague on Thursday, 24 September 2026 at 12:00 Lisbon time, João.');
// Constructed: the invariant's own cases, "you're booked for Thursday 09:00" in each language.
claims('en: you\'re booked for Thursday 09:00', "You're booked for Thursday at 09:00.");
claims('pt: ficou marcada para quinta às 09:00', 'Ficou marcada a sua reunião para quinta-feira às 09:00.');
claims('pt: Ficou confirmado!', 'Ficou confirmado! Quinta-feira às 09:00.');
claims('es: queda confirmada su cita', 'Queda confirmada su cita para el jueves a las 09:00.');
claims('es: Confirmado!', '¡Confirmado! El jueves a las 09:00.');
// CAPTURED OUTPUT, the false alarms: every one names a slot and claims nothing.
passes('en: the booking gate\'s apology (gate exec 5096, fired invariant 2 on 21 Sep)', 'So sorry, João — that slot was just taken. We still have Wednesday 23 September at 10:00, Wednesday 23 September at 11:00, or Thursday 24 September at 09:00, Lisbon time — would any of those suit you?');
passes('pt: the booking gate\'s apology (gate exec 5134, fired invariant 2 on 21 Sep)', 'Peço desculpa, João, mas esse horário das 13:00 acabou de ficar indisponível. Ainda temos quarta-feira, 23 de setembro às 14:00, quarta-feira, 23 de setembro às 15:00, ou quinta-feira, 24 de setembro às 09:00, horário de Lisboa. Qual destes prefere?');
passes('en: the race note', "I'm sorry — that time was taken just as we were confirming it. A member of our team will be in touch to arrange another one with you.");
passes('pt: the race note', 'Peço desculpa — esse horário ficou ocupado mesmo enquanto o confirmávamos. Um colega da equipa entra em contacto consigo para combinar outro.');
passes('es: the race note', 'Lo siento — esa hora se ocupó justo mientras la confirmábamos. Un compañero del equipo se pondrá en contacto para acordar otra con usted.');
passes('pt: a bare "Combinado," opens an offer (exec 1643)', 'Combinado, João! Quer que lhe proponha alguns horários para essa primeira conversa com o nosso colega?');
passes('en: a promise that waits on the lead (exec 1684)', "No problem at all, John, take your time. Just let me know whenever you're ready and I'll get it arranged.");
passes('en: a promise that waits on the lead (exec 1692)', "No problem at all, John! Whenever you're ready to confirm, just let me know and I'll get it arranged.");
claims('en: a condition that is NOT the lead\'s still claims', "Once our colleague sees it, you're all set for Thursday at 09:00.");
passes('pt: "ainda não ficou confirmado" is a negation', 'Ainda não ficou confirmado, João.');
passes('en: "you\'re set to receive" is not a booking', "You're set to receive a call from our colleague about the listing.");

console.log('\nEVERY lead-facing text captured by 22 Sep (tests/fixtures/lead_texts_2026-09-22.json)');
// 536 texts: 36 claims (25 confirmations, 2 restated held bookings, 9 phantoms or
// discarded drafts) and 500 that claim nothing. Invariant 2's false-alarm and miss
// counts are these two numbers.
{
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'lead_texts_2026-09-22.json'), 'utf8')).texts;
  const misses = fx.filter(t => t.claim && bookingClaim(t.text) === null);
  const alarms = fx.filter(t => !t.claim && bookingClaim(t.text) !== null);
  chk(`all ${fx.length} texts, ${fx.filter(t => t.claim).length} claims: 0 misses`, fx.length === 536 && misses.length === 0,
      misses.map(t => t.source + ': ' + t.text.slice(0, 70)).join(' | '));
  chk(`and 0 false alarms on the ${fx.filter(t => !t.claim).length} that claim nothing`, alarms.length === 0,
      alarms.map(t => t.source + ' [' + bookingClaim(t.text) + ']: ' + t.text.slice(0, 70)).join(' | '));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
