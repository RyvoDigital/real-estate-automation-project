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

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
