#!/usr/bin/env node
// Unit tests for src/lead_stage.js. Loads the SHIPPING source rather than a
// copy, so the tests cannot drift from what the workflow embeds.
//
//   node tests/lead_stage.test.js
const fs = require('fs');
const path = require('path');
const SRC = process.env.LEAD_STAGE_SRC || path.join(__dirname, '..', 'src', 'lead_stage.js');
eval(fs.readFileSync(SRC, 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };
const AT = '2026-09-12T03:00:00.000Z';
const RETIRED = { event_id: 'rvc1', retired_reason: 'cancelled' };
let r;

console.log('\nthe 2026-09-12 night: four bookings retired, stage never moved');
r = nextStage({ before: 'viewing_booked', proposed: 'qualified', retired: RETIRED, at: AT });
chk('a retired booking regresses viewing_booked to qualified', r.stage === 'qualified');
chk('the regression is on the trail', r.signals.length === 1 && r.signals[0].regressed === 'viewing_booked -> qualified' && /cancelled/.test(r.signals[0].reason));
chk('a regression is not a new qualification -- lead.qualified must not fire again', r.becameQualified === false);
r = nextStage({ before: 'viewing_booked', proposed: 'nurturing', retired: RETIRED, at: AT });
chk('after regression, nurturing is still recorded rather than applied', r.stage === 'qualified' && r.signals.some(s => s.suppressed_from === 'qualified'));
r = nextStage({ before: 'qualified', proposed: 'qualified', retired: RETIRED, at: AT });
chk('a retirement from any other stage changes nothing', r.stage === 'qualified' && r.signals.length === 0);

console.log('\ncancel and rebook in the same turn (B3)');
r = nextStage({ before: 'viewing_booked', proposed: 'qualified', retired: RETIRED, booked: true, at: AT });
chk('a booking created this turn wins over the retirement', r.stage === 'viewing_booked');

console.log('\nforward only, on the model\'s proposal');
r = nextStage({ before: null, proposed: 'contacted' });
chk('new -> contacted', r.stage === 'contacted' && r.becameQualified === false);
r = nextStage({ before: 'contacted', proposed: 'qualified' });
chk('contacted -> qualified fires lead.qualified', r.stage === 'qualified' && r.becameQualified === true);
r = nextStage({ before: 'qualified', proposed: 'qualified' });
chk('qualified -> qualified does not fire it again', r.becameQualified === false && r.kept === null);
r = nextStage({ before: 'qualified', proposed: 'contacted' });
chk('the model cannot demote (Gate B2)', r.stage === 'qualified' && /regression/.test(r.kept));
r = nextStage({ before: 'viewing_booked', proposed: 'qualified' });
chk('viewing_booked is not left on a proposal alone', r.stage === 'viewing_booked');
r = nextStage({ before: 'qualified', proposed: null, booked: true });
chk('an event created this turn enters viewing_booked', r.stage === 'viewing_booked');

console.log('\nnurturing');
r = nextStage({ before: 'contacted', proposed: 'nurturing' });
chk('applied below qualified', r.stage === 'nurturing');
r = nextStage({ before: 'qualified', proposed: 'nurturing', at: AT });
chk('recorded, not applied, at qualified', r.stage === 'qualified' && r.signals[0].signal === 'nurturing' && r.signals[0].suppressed_from === 'qualified');
r = nextStage({ before: 'nurturing', proposed: 'qualified' });
chk('nurturing -> qualified fires lead.qualified', r.stage === 'qualified' && r.becameQualified === true);

console.log('\nlost: derived from the lead\'s words, never from the model\'s stage');
r = nextStage({ before: 'qualified', proposed: 'qualified', intent: 'not_interested', at: AT });
chk('not_interested marks a qualified lead lost', r.stage === 'lost' && r.signals[0].signal === 'lost' && r.signals[0].from === 'qualified');
r = nextStage({ before: 'viewing_booked', proposed: 'qualified', intent: 'not_interested' });
chk('even a booked lead can be lost', r.stage === 'lost');
r = nextStage({ before: 'qualified', proposed: 'qualified', intent: 'not_interested', wantsBooking: true });
chk('a lead asking for a time is not lost', r.stage === 'qualified');
r = nextStage({ before: 'qualified', proposed: 'qualified', intent: 'not_interested', booked: true });
chk('an event created this turn is not lost', r.stage === 'viewing_booked');
r = nextStage({ before: 'lost', proposed: 'qualified', intent: 'question', at: AT });
chk('a lost lead who writes back is revived to what the model sees', r.stage === 'qualified' && r.signals[0].revived === 'qualified');
chk('revival into qualified fires lead.qualified', r.becameQualified === true);
r = nextStage({ before: 'lost', proposed: 'contacted' });
chk('revival can land below qualified', r.stage === 'contacted' && r.becameQualified === false);
r = nextStage({ before: 'lost', proposed: null, intent: 'not_interested' });
chk('lost stays lost, silently', r.stage === 'lost' && r.signals.length === 0);
r = nextStage({ before: 'lost', proposed: 'nurturing' });
chk('revival to nurturing is not suppressed', r.stage === 'nurturing');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
