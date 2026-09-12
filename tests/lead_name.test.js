#!/usr/bin/env node
// Unit tests for src/lead_name.js. Loads the SHIPPING source rather than a
// copy, so the tests cannot drift from what the workflow embeds.
//
//   node tests/lead_name.test.js
const fs = require('fs');
const path = require('path');
const SRC = process.env.LEAD_NAME_SRC || path.join(__dirname, '..', 'src', 'lead_name.js');
eval(fs.readFileSync(SRC, 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };
let r;

console.log('\nthe 2026-09-11 refusal: "My name is João Ferreira" against a profile name');
r = mergeName('Manuel', undefined, 'João Ferreira');
chk('a stated name beats the profile name', r.changed === true && r.name === 'João Ferreira' && r.source === 'stated');
r = mergeName('Manuel Vale', 'profile', 'João');
chk('even a shorter stated name beats a longer profile name', r.changed === true && r.name === 'João');
r = mergeName('João', 'profile', 'João Ferreira');
chk('a profile name the model has already improved once is still beaten', r.changed === true);

console.log('\nnothing to do');
r = mergeName('Manuel', undefined, null);
chk('null incoming keeps the row and says so', r.changed === false && r.name === 'Manuel' && /incoming was null/.test(r.kept));
r = mergeName('Manuel', undefined, '   ');
chk('blank incoming is null', r.changed === false);
r = mergeName('João Ferreira', 'stated', 'joao ferreira');
chk('the same name with different case and accents is no change', r.changed === false && r.kept === null);
r = mergeName('João Ferreira', 'profile', 'João  Ferreira');
chk('the same name does not flip the source to stated', r.changed === false && r.source === 'profile');
r = mergeName(null, undefined, 'Ana Costa');
chk('an empty row takes the stated name', r.changed === true && r.name === 'Ana Costa' && r.source === 'stated');

console.log('\nstated against stated');
r = mergeName('João Ferreira', 'stated', 'João');
chk('a shorter form keeps the stored name', r.changed === false && r.name === 'João Ferreira' && /shorter form/.test(r.kept));
r = mergeName('João Ferreira', 'stated', 'Ferreira');
chk('the surname alone is a shorter form too', r.changed === false);
r = mergeName('João Ferreira', 'stated', 'João Miguel Ferreira');
chk('a longer form wins', r.changed === true && r.name === 'João Miguel Ferreira');
r = mergeName('João Ferreira', 'stated', 'Maria Silva');
chk('a different name is the lead restating it, and wins', r.changed === true && r.name === 'Maria Silva');
r = mergeName('João Ferreira', 'stated', 'Ferreira João');
chk('the same tokens in another order are not a change', r.changed === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
