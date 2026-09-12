#!/usr/bin/env node
// Unit tests for src/budget_range.js. Loads the SHIPPING source rather than a
// copy, so the tests cannot drift from what the workflow embeds.
//
//   node tests/budget_range.test.js
const fs = require('fs');
const path = require('path');
const SRC = process.env.BUDGET_RANGE_SRC || path.join(__dirname, '..', 'src', 'budget_range.js');
eval(fs.readFileSync(SRC, 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };
let r;

console.log('\nthe 2026-09-11 row: 1.2M to 1.5M, then "consigo pagar 1.1M"');
r = reconcileBudget({ min: 1200000, max: 1500000 }, { min: 1200000, max: 1100000 }, { min: false, max: true });
chk('the minimum follows the new maximum', r.min === 1100000 && r.max === 1100000);
chk('it is reported as collapsed with a reason', r.collapsed === true && /budget_max=1100000/.test(r.reason));
chk('the replaced range is returned for the trail', r.replaced.budget_min === 1200000 && r.replaced.budget_max === 1500000);

console.log('\nthe mirror: "at least 2M" after "up to 1.5M"');
r = reconcileBudget({ min: null, max: 1500000 }, { min: 2000000, max: 1500000 }, { min: true, max: false });
chk('the maximum follows the new minimum', r.min === 2000000 && r.max === 2000000 && /budget_min=2000000/.test(r.reason));
chk('a null stored bound is archived as null', r.replaced.budget_min === null && r.replaced.budget_max === 1500000);

console.log('\nnothing to do');
r = reconcileBudget({ min: 1200000, max: 1500000 }, { min: 1200000, max: 1500000 }, { min: false, max: false });
chk('a valid range passes through untouched', r.collapsed === false && r.min === 1200000 && r.max === 1500000 && r.replaced === null);
r = reconcileBudget({ min: null, max: null }, { min: null, max: 900000 }, { min: false, max: true });
chk('one bound alone is not an inversion', r.collapsed === false && r.min === null && r.max === 900000);
r = reconcileBudget({}, {}, {});
chk('empty in, empty out', r.min === null && r.max === null && r.collapsed === false);
r = reconcileBudget({ min: 800000, max: 800000 }, { min: 800000, max: 800000 }, {});
chk('a point range is a range', r.collapsed === false);
r = reconcileBudget({ min: 1000000, max: 1500000 }, { min: 1500000, max: 1500000 }, { min: true, max: false });
chk('widening to the edge is not an inversion', r.collapsed === false && r.min === 1500000);

console.log('\ndefensive: both moved and inverted (ParseClaude should have caught it)');
r = reconcileBudget({ min: null, max: null }, { min: 1500000, max: 1200000 }, { min: true, max: true });
chk('sorted rather than dropped', r.min === 1200000 && r.max === 1500000 && r.collapsed === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
