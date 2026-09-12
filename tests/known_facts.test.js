#!/usr/bin/env node
// Unit tests for src/known_facts.js. Loads the SHIPPING source rather than a
// copy, so the tests cannot drift from what the workflow embeds.
//
//   node tests/known_facts.test.js
const fs = require('fs');
const path = require('path');
const SRC = process.env.KNOWN_FACTS_SRC || path.join(__dirname, '..', 'src', 'known_facts.js');
eval(fs.readFileSync(SRC, 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };

const ROW = { full_name: 'João Ferreira', lead_type: 'buyer', budget_min: 1200000, budget_max: 1500000,
              timeline: 'next three months', area: 'Cascais' };
const Q = { name_source: 'stated', bedrooms: 4, financing: 'pre-approved with Millennium', purpose: 'relocation, family home' };

console.log('\nthe 2026-09-12 lead: everything known, nothing should be asked again');
let s = renderKnownFacts(ROW, Q);
chk('has the header', /WHAT OUR RECORDS ALREADY HOLD/.test(s));
chk('name, when stated', /- Name: João Ferreira/.test(s));
chk('lead type in plain words', /- Looking to: buy/.test(s));
chk('budget as a range with thousands separators', /- Budget: 1,200,000 EUR to 1,500,000 EUR/.test(s));
chk('timeline and area', /- Timeline: next three months/.test(s) && /- Area: Cascais/.test(s));
chk('qualification facts', /- Bedrooms: 4/.test(s) && /- Financing: pre-approved with Millennium/.test(s) && /- Purpose: relocation, family home/.test(s));
chk('tells the model not to ask again and that new words win', /Do not ask again/.test(s) && /overrides the record/.test(s));
chk('tells the model to return only the new figure on a change', /return only what they said now/.test(s));

console.log('\nthe profile name is not a fact');
s = renderKnownFacts({ full_name: 'Manuel', budget_max: 900000 }, {});
chk('a name without name_source=stated is left out', !/Name:/.test(s));
s = renderKnownFacts({ full_name: 'Manuel', budget_max: 900000 }, { name_source: 'profile' });
chk('an explicit profile source is left out too', !/Name:/.test(s));

console.log('\nbudget shapes');
chk('max only', /- Budget: up to 900,000 EUR/.test(renderKnownFacts({ budget_max: 900000 }, {})));
chk('min only', /- Budget: from 2,000,000 EUR/.test(renderKnownFacts({ budget_min: 2000000 }, {})));
chk('point range', /- Budget: about 1,100,000 EUR/.test(renderKnownFacts({ budget_min: 1100000, budget_max: 1100000 }, {})));
chk('zero and null are not a budget', !/Budget/.test(renderKnownFacts({ budget_min: 0, budget_max: null }, {})));

console.log('\nnothing known');
chk('empty row renders nothing at all', renderKnownFacts({}, {}) === '');
chk('null inputs render nothing', renderKnownFacts(null, null) === '');
chk('unknown lead_type is not a line', !/Looking to/.test(renderKnownFacts({ lead_type: 'unknown', area: 'X' }, {})));
chk('blank strings are not facts', renderKnownFacts({ timeline: '  ', area: '' }, { purpose: ' ' }) === '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
