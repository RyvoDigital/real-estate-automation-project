#!/usr/bin/env node
// Unit tests for src/booking_check.js. Loads the SHIPPING source rather than a
// copy, so the tests cannot drift from what the workflow embeds.
//
//   node tests/booking_check.test.js
const fs = require('fs');
const path = require('path');
const SRC = process.env.BOOKING_CHECK_SRC || path.join(__dirname, '..', 'src', 'booking_check.js');
eval(fs.readFileSync(SRC, 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };

const NOW = Date.parse('2026-09-11T15:00:00Z');
const FUTURE = { event_id: 'rvc1', startUtc: '2026-09-16T08:00:00.000Z', endUtc: '2026-09-16T09:00:00.000Z' };
const PAST   = { event_id: 'rvc0', startUtc: '2026-09-11T09:00:00.000Z', endUtc: '2026-09-11T10:00:00.000Z' };
const ok = (status) => ({ statusCode: 200, body: { id: 'rvc1', status } });

console.log('\nthe 2026-09-11 phantom: a 5 September booking for a slot that has passed');
let r = resolveBookingCheck(PAST, ok('confirmed'), NOW);
chk('past slot is retired even when Google still has it', r.check === 'past' && r.retire === true);
r = resolveBookingCheck(PAST, { statusCode: 404, body: {} }, NOW);
chk('past slot is retired when Google has lost it too', r.check === 'past' && r.retire === true);
r = resolveBookingCheck(PAST, { statusCode: 503, body: {} }, NOW);
chk('past slot needs no calendar to be retired', r.check === 'past' && r.retire === true && r.error === null);
r = resolveBookingCheck(PAST, null, NOW);
chk('past slot with no response at all is still past', r.check === 'past');

console.log('\nthe calendar as the source of truth for an upcoming booking');
r = resolveBookingCheck(FUTURE, ok('confirmed'), NOW);
chk('confirmed and upcoming -> keep', r.check === 'confirmed' && r.retire === false);
r = resolveBookingCheck(FUTURE, ok('tentative'), NOW);
chk('tentative is not cancelled -> keep', r.check === 'confirmed' && r.retire === false);
r = resolveBookingCheck(FUTURE, ok('cancelled'), NOW);
chk('deleted by the agent -> cancelled, retired', r.check === 'cancelled' && r.retire === true);
r = resolveBookingCheck(FUTURE, { statusCode: 404, body: {} }, NOW);
chk('gone from the calendar -> missing, retired', r.check === 'missing' && r.retire === true);
r = resolveBookingCheck(FUTURE, { statusCode: 410, body: {} }, NOW);
chk('410 is treated like 404', r.check === 'missing' && r.retire === true);
r = resolveBookingCheck(FUTURE, { statusCode: 404, body: {} }, NOW, { calendarReadable: true });
chk('404 with a readable calendar -> missing', r.check === 'missing' && r.retire === true);

console.log('\na 404 is only "gone" when the calendar itself could be read');
r = resolveBookingCheck(FUTURE, { statusCode: 404, body: {} }, NOW, { calendarReadable: false });
chk('404 while free/busy also failed -> unreadable, NOT retired', r.check === 'unreadable' && r.retire === false && /calendar_unreadable/.test(r.error));
r = resolveBookingCheck(FUTURE, ok('cancelled'), NOW, { calendarReadable: false });
chk('an explicit cancelled still retires even if free/busy failed', r.check === 'cancelled' && r.retire === true);
r = resolveBookingCheck(PAST, { statusCode: 404, body: {} }, NOW, { calendarReadable: false });
chk('past still wins over an unreadable calendar', r.check === 'past');

console.log('\nwhen the calendar cannot be read, keep the booking and SAY so');
r = resolveBookingCheck(FUTURE, { statusCode: 503, body: { error: { message: 'Backend Error' } } }, NOW);
chk('5xx -> unreadable, NOT retired', r.check === 'unreadable' && r.retire === false);
chk('the reason names the status and the message', r.error === 'events_get_http_503:Backend Error', r.error);
r = resolveBookingCheck(FUTURE, { statusCode: 401, body: {} }, NOW);
chk('an auth failure is unreadable, not missing', r.check === 'unreadable' && r.retire === false);
r = resolveBookingCheck(FUTURE, { statusCode: 403, body: {} }, NOW);
chk('a permission failure is unreadable, not missing', r.check === 'unreadable' && r.retire === false);
r = resolveBookingCheck(FUTURE, null, NOW);
chk('no response at all is unreadable, not missing', r.check === 'unreadable' && r.retire === false && /http_none/.test(r.error));
r = resolveBookingCheck(FUTURE, { statusCode: 200, body: null }, NOW);
chk('2xx with an empty body is treated as confirmed (Google answered)', r.check === 'confirmed');

console.log('\nedges');
r = resolveBookingCheck({ event_id: 'x' }, ok('confirmed'), NOW);
chk('a booking with no times cannot be past; falls through to the calendar', r.check === 'confirmed');
r = resolveBookingCheck({ event_id: 'x', startUtc: '2026-09-11T14:30:00.000Z' }, ok('confirmed'), NOW);
chk('startUtc alone is used when endUtc is absent', r.check === 'past');
r = resolveBookingCheck(FUTURE, ok('confirmed'), Date.parse('2026-09-16T09:00:00Z'));
chk('exactly at the end time counts as past', r.check === 'past');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
