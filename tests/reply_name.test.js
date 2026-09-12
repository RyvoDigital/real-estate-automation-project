#!/usr/bin/env node
// Unit tests for src/reply_name.js. Loads the SHIPPING source rather than a
// copy, so the tests cannot drift from what the workflow embeds.
//
//   node tests/reply_name.test.js
const fs = require('fs');
const path = require('path');
eval(fs.readFileSync(process.env.REPLY_NAME_SRC || path.join(__dirname, '..', 'src', 'reply_name.js'), 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };
const NAME = 'João Ferreira';
let r;

console.log('\nthe 2026-09-12 replies');
r = nameMismatch('Happy to help, John! Just to clarify, this would be a first meeting with one of our colleagues.', NAME);
chk('"Happy to help, John!" is a mismatch naming John', r.mismatch === true && r.used === 'John');
r = nameMismatch('No problem at all, John! Just let me know whenever you are ready.', NAME);
chk('"No problem at all, John!"', r.mismatch === true);
r = nameMismatch('Noted, John — up to €1,300,000 if the right property comes along.', NAME);
chk('a dash after the name still counts', r.mismatch === true);
r = nameMismatch('Claro, João! Está registado como João Ferreira.', NAME);
chk('"Claro, João!" is the stored name', r.mismatch === false);
r = nameMismatch('¡Claro, João! Podemos agendar una primera reunión el martes a las 09:00, hora de Lisboa.', NAME);
chk('Spanish reply with the stored name passes', r.mismatch === false);
r = nameMismatch('Hi Joao, thanks for getting back to me.', NAME);
chk('the stored name without its accent is still the stored name', r.mismatch === false);
r = nameMismatch('Hi John, thanks for getting back to me.', NAME);
chk('"Hi John," after a greeting word', r.mismatch === true && r.used === 'John');
r = nameMismatch('Good to hear from you, Mr Ferreira.', NAME);
chk('the surname is a token of the stored name', r.mismatch === false);

console.log('\nwhat must not match');
chk('"Great!" at the start is an interjection, not a name', nameMismatch('Great! Here are the times we have.', NAME).mismatch === false);
chk('"Sure, Monday works" has no punctuation after the word', nameMismatch('Sure, Monday works well for us.', NAME).mismatch === false);
chk('"Noted, Monday." is a weekday', nameMismatch('Noted, Monday. See you then.', NAME).mismatch === false);
chk('"Yes, Cascais." is a place', nameMismatch('Yes, Cascais. A colleague will confirm.', NAME).mismatch === false);
chk('"Of course, Sofia!" is the assistant when allowed', nameMismatch('You can call me Sofia. Of course, Sofia! is how leads address me.', NAME, { allow: ['Sofia'] }).mismatch === false);
chk('an area from config is allowed', nameMismatch('Absolutely, Quinta! Lovely area.', NAME, { allow: ['Quinta da Marinha'] }).mismatch === false);
chk('a reply that names nobody passes', nameMismatch('Of course! We have Tuesday at 09:00 Lisbon time. Which suits you?', NAME).mismatch === false);
chk('lowercase after a comma is not a name', nameMismatch('Thanks, that works!', NAME).mismatch === false);
chk('no stored name, no check', nameMismatch('Happy to help, John!', null).mismatch === false && nameMismatch('Hi John,', '').mismatch === false);
chk('"Thanks, I" is too short to be a name', nameMismatch('Thanks, I. will do.', NAME).mismatch === false);

console.log('\nanother lead entirely');
r = nameMismatch('Hello Mary, welcome back!', 'Maria Silva');
chk('Mary for Maria is a mismatch', r.mismatch === true && r.used === 'Mary');
r = nameMismatch('Olá Maria, bem-vinda de volta!', 'Maria Silva');
chk('Maria for Maria is not', r.mismatch === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
