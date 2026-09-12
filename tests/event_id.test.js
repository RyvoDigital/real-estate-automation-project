#!/usr/bin/env node
// Unit tests for src/event_id.js. Loads the SHIPPING source rather than a copy.
//   node tests/event_id.test.js
const fs = require('fs');
const path = require('path');
const SRC = process.env.EVENT_ID_SRC || path.join(__dirname, '..', 'src', 'event_id.js');
eval(fs.readFileSync(SRC, 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };
const BASE = 'rvc99e66fba61fe0ee20260916080000000';
const ev = (id, status) => ({ id, status: status || 'confirmed' });

console.log('\ngeneration');
let r = nextEventId(BASE, []);
chk('nothing ever used the slot -> the base id, generation 0 (unchanged behaviour)', r.id === BASE && r.generation === 0);
r = nextEventId(BASE, [ev(BASE, 'cancelled')]);
chk('the 2026-09-12 case: base id burned by a deletion -> base+g1', r.id === BASE + 'g1' && r.generation === 1, r.id);
r = nextEventId(BASE, [ev(BASE, 'cancelled'), ev(BASE + 'g1', 'cancelled')]);
chk('two burned generations -> g2', r.id === BASE + 'g2');
r = nextEventId(BASE, [ev(BASE + 'g1', 'cancelled')]);
chk('g1 burned but base free -> base (smallest free wins, so racers agree)', r.id === BASE);
r = nextEventId(BASE, [ev(BASE, 'confirmed')]);
chk('a LIVE event on the base id still yields g1; free/busy should have blocked this, and the create will 409 if not', r.id === BASE + 'g1');

console.log('\nwhat does not count');
r = nextEventId(BASE, [ev('rvc99e66fba61fe0ee20260916090000000', 'cancelled')]);
chk('another slot\'s id is ignored', r.id === BASE && r.seen === 0);
r = nextEventId(BASE, [ev(BASE + 'x', 'cancelled'), ev(BASE + 'gx', 'cancelled'), ev(BASE + 'g', 'cancelled')]);
chk('near-misses are ignored (suffix must be g<digits>)', r.id === BASE && r.seen === 0);
r = nextEventId(BASE, [ev('someone-elses-event'), { id: null }, null, {}]);
chk('foreign and malformed items are ignored', r.id === BASE && r.seen === 0);
r = nextEventId(BASE, null);
chk('no items at all -> base', r.id === BASE);

console.log('\nthe race');
const listing = [ev(BASE, 'cancelled')];
chk('two leads listing the same calendar compute the same id', nextEventId(BASE, listing).id === nextEventId(BASE, listing.slice()).id);
chk('the id stays base32hex', /^[a-v0-9]+$/.test(nextEventId(BASE, [ev(BASE, 'cancelled')]).id));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
