#!/usr/bin/env node
// Unit tests for src/slot_engine.js. Loads the SHIPPING source rather than a
// copy, so the tests cannot drift from what the workflow embeds.
//
//   docker exec -i -e NODE_PATH=/usr/local/lib/node_modules/n8n/node_modules \
//     "$N8N_CID" node /tmp/slot_engine.test.js
//
// Luxon comes from n8n's node_modules -- the same DateTime the Code node gets.
const fs = require('fs');
const path = require('path');
const { DateTime } = require('luxon');
global.DateTime = DateTime;

const SRC = process.env.SLOT_ENGINE_SRC ||
            path.join(__dirname, '..', 'src', 'slot_engine.js');
eval(fs.readFileSync(SRC, 'utf8'));

const WH = { start:'09:00', end:'19:00', days:[1,2,3,4,5,6] };
const base = { workingHours:WH, bookingWindowDays:14, minHoursNotice:24,
               durationMinutes:60, busy:[], maxSlots:3, slotStepMinutes:60 };
const NOW = '2026-09-07T06:00:00Z';           // Monday
let pass=0, fail=0;
const chk=(n,c,d)=>{c?pass++:fail++;console.log(`  [${c?'PASS':'FAIL'}] ${n}${d?'  '+d:''}`)};
const S = o => computeSlots({...base, nowISO:NOW, tz:'Europe/Lisbon', ...o});

// ---- regression: everything from the previous 23 still holds ---------------
const lis=S({}), mad=computeSlots({...base,nowISO:NOW,tz:'Europe/Madrid'});
chk('REGRESSION Madrid/Lisbon still differ', lis.slots[0].startUtc!==mad.slots[0].startUtc);
chk('REGRESSION shape is now {slots,preferDate,preferStatus}',
    Array.isArray(lis.slots) && 'preferStatus' in lis, `status=${lis.preferStatus}`);
chk('REGRESSION no preference -> spread across distinct days',
    new Set(lis.slots.map(s=>s.dateLocal)).size===lis.slots.length,
    lis.slots.map(s=>`${s.dateLocal} ${s.timeLocal}`).join(' | '));

// ---- preferDate: happy path ----------------------------------------------
const thu = S({ preferDate:'2026-09-10' });   // Thursday
chk('preferDate used -> status "used"', thu.preferStatus==='used', thu.preferStatus);
chk('preferred day appears FIRST', thu.slots[0].dateLocal==='2026-09-10', thu.slots[0].dateLocal);
chk('takes 2 from the preferred day, then offers an alternative',
    thu.slots.filter(s=>s.dateLocal==='2026-09-10').length===2 &&
    thu.slots.some(s=>s.dateLocal!=='2026-09-10'),
    thu.slots.map(s=>`${s.dateLocal} ${s.timeLocal}`).join(' | '));

// ---- preferDate guards: each must fall back SILENTLY ----------------------
// Each guard reports WHY it rejected the day. The reply says "we are closed on
// Sundays" or "that is too soon" out of this, so a wrong label is an invented
// fact -- the same rule that governs inventory.
const guards = [
  ['not a real date',        'not-a-date',  'invalid'],
  ['nonsense date',          '2026-13-45',  'invalid'],
  ['in the past',            '2026-09-01',  'too_soon'],
  ['today, inside notice',   '2026-09-07',  'too_soon'],
  ['beyond booking window',  '2026-10-30',  'out_of_window'],
  ['a Sunday (non-working)', '2026-09-13',  'closed_day'],
];
for (const [label, pd, want] of guards) {
  const r = S({ preferDate: pd });
  const fellBack = r.preferStatus!=='used' && r.preferDate===null && r.slots.length>0;
  chk(`guard: ${label} -> silent fallback`, fellBack, `status=${r.preferStatus} slots=${r.slots.length}`);
  chk(`guard: ${label} -> reports the real reason`, r.preferStatus===want,
      `want=${want} got=${r.preferStatus}`);
  chk(`guard: ${label} -> keeps the requested day for the reply`,
      r.preferRequested===pd, String(r.preferRequested));
}

// ---- "full" and "too soon" must not be confused --------------------------
// A day whose slots are all inside min_hours_notice is NOT booked up. Saying
// "fully booked" there asserts something about the calendar we never checked.
const tooSoonDay = S({ preferDate:'2026-09-08', minHoursNotice:37 });
chk('valid day, every slot inside notice -> "too_soon", not "full"',
    tooSoonDay.preferStatus==='too_soon', tooSoonDay.preferStatus);
const bookedDay = S({ preferDate:'2026-09-08',
  busy:[{start:'2026-09-08T00:00:00Z', end:'2026-09-09T00:00:00Z'}] });
chk('valid day, genuinely blocked -> "full", not "too_soon"',
    bookedDay.preferStatus==='full', bookedDay.preferStatus);

// ---- preferDate valid but the day is FULL --------------------------------
const fullDay = S({ preferDate:'2026-09-10',
  busy:[{start:'2026-09-10T00:00:00Z', end:'2026-09-11T00:00:00Z'}] });
chk('valid but full day -> status "full", not "used"', fullDay.preferStatus==='full', fullDay.preferStatus);
chk('full day still returns alternatives (does not go silent)', fullDay.slots.length>0, `${fullDay.slots.length} slots`);
chk('no slot is on the full day', fullDay.slots.every(s=>s.dateLocal!=='2026-09-10'));

// ---- preferDate must NEVER create eligibility -----------------------------
const sundayPref = S({ preferDate:'2026-09-13' });
chk('preferring a Sunday does NOT make Sunday eligible',
    sundayPref.slots.every(s=>DateTime.fromISO(s.startUtc).setZone('Europe/Lisbon').weekday!==7));
const busyAll = S({ preferDate:'2026-09-10',
  busy:[{start:'2026-09-07T00:00:00Z', end:'2026-09-30T00:00:00Z'}] });
chk('preferring a day cannot conjure a slot when nothing is free',
    busyAll.slots.length===0, `${busyAll.slots.length} slots`);
const near = S({ preferDate:'2026-09-08', minHoursNotice:24 });
chk('preferred day still respects min_hours_notice',
    near.slots.every(s=>DateTime.fromISO(s.startUtc) >= DateTime.fromISO(NOW).plus({hours:24})));
const win = S({ preferDate:'2026-09-10', bookingWindowDays:14, maxSlots:10 });
chk('preferred slots still inside the booking window',
    win.slots.every(s=>DateTime.fromISO(s.endUtc) <= DateTime.fromISO(NOW).plus({days:14})));

// ---- preferDate honours a non-Lisbon zone --------------------------------
const madPref = computeSlots({...base, nowISO:NOW, tz:'Europe/Madrid', preferDate:'2026-09-10'});
chk('preferDate resolves in the CLIENT zone, not UTC',
    madPref.preferStatus==='used' && madPref.slots[0].dateLocal==='2026-09-10' &&
    madPref.slots[0].startUtc.includes('T07:00'),
    `${madPref.slots[0].startUtc} (Madrid 09:00)`);

// ---- free/busy validator --------------------------------------------------
const CAL='c_abc@group.calendar.google.com';
const okRes={statusCode:200,body:{calendars:{[CAL]:{busy:[{start:'2026-09-08T09:00:00Z',end:'2026-09-08T10:00:00Z'}]}}}};
const r1=readFreeBusy(okRes,CAL);
chk('freebusy: healthy response parses', r1.ok && r1.busy.length===1);
const notFound={statusCode:200,body:{calendars:{[CAL]:{errors:[{domain:'global',reason:'notFound'}],busy:[]}}}};
const r2=readFreeBusy(notFound,CAL);
chk('freebusy: 200 + errors[] is NOT treated as "free"', !r2.ok, r2.error);
chk('freebusy: the notFound reason is surfaced', r2.error.includes('notFound'), r2.error);
const missing={statusCode:200,body:{calendars:{}}};
chk('freebusy: calendar absent from response is an error', !readFreeBusy(missing,CAL).ok,
    readFreeBusy(missing,CAL).error);
chk('freebusy: non-2xx is an error', !readFreeBusy({statusCode:403,body:{}},CAL).ok);
chk('freebusy: transport failure (no statusCode) is an error', !readFreeBusy({},CAL).ok);
const genuinelyFree={statusCode:200,body:{calendars:{[CAL]:{busy:[]}}}};
chk('freebusy: a GENUINELY free calendar is still ok', readFreeBusy(genuinelyFree,CAL).ok===true);

console.log(`\n  engine + freebusy: ${pass}/${pass+fail} passed`);
if (fail) process.exit(1);

// ============================================================================
// C2: confirmation matching. The asymmetry here is the whole point -- failing
// to match costs one clarifying question, matching wrongly books a real agent
// into a real slot nobody agreed to. Every ambiguous case below must NOT book.
// ============================================================================
console.log('\n  -- confirmation matching (C2)');
const Z = 'Europe/Lisbon';
const mk = (iso) => ({ startUtc: iso, endUtc: DateTime.fromISO(iso).plus({hours:1}).toUTC().toISO(),
                       local: DateTime.fromISO(iso).setZone(Z).toISO(), zone: Z });
// Offered: Thu 10 Sep 09:00, Thu 10 Sep 10:00, Sat 05 Sep 09:00 (Lisbon, +01)
const OFFER = [mk('2026-09-10T08:00:00Z'), mk('2026-09-10T09:00:00Z'), mk('2026-09-05T08:00:00Z')];
const C = (txt, offer) => matchConfirmation(txt, offer || OFFER, Z, NOW);
const hourOf = (s) => DateTime.fromISO(s.startUtc).setZone(Z).toFormat('ccc HH:mm');

const matches = [
  ['explicit time picks one',            'as 10:00 por favor',        'Thu 10:00'],
  ['weekday plus time',                  'quinta-feira as 9 entao',   'Thu 09:00'],
  ['English weekday plus time',          'Thursday at 10 works',      'Thu 10:00'],
  ['day of month plus time',             'dia 10 as 9 esta otimo',    'Thu 09:00'],
  ['explicit date narrows to one day',   '05/09 entao',               'Sat 09:00'],
  ['ordinal first',                      'a primeira opcao',          'Thu 09:00'],
  ['ordinal last',                       'a ultima',                  'Sat 09:00'],
];
for (const [label, txt, want] of matches) {
  const r = C(txt);
  const got = r.slot ? hourOf(r.slot) : r.status;
  chk(`confirm: ${label}`, r.status==='matched' && got===want, `${r.status} -> ${got} (${r.matchedBy})`);
}

// Ambiguity must never book.
const ambiguous = [
  ['weekday alone with two slots that day', 'quinta-feira'],
  ['a bare hour shared by two slots',       'pode ser 9h'],
  ['bare yes with three on offer',          'sim, pode ser'],
  ['bare ok',                               'ok'],
];
for (const [label, txt] of ambiguous) {
  const r = C(txt);
  chk(`confirm: ${label} -> ambiguous, no booking`, r.status==='ambiguous' && r.slot===null,
      `${r.status} (${r.matchedBy})`);
}

// A day we never offered is a NEW request, not a confirmation.
for (const [label, txt] of [['a weekday not offered','e na terca-feira?'],
                            ['a date not offered','pode ser 12/09?']]) {
  const r = C(txt);
  chk(`confirm: ${label} -> none, C1 owns it`, r.status==='none' && r.slot===null, `${r.status} (${r.matchedBy})`);
}

// A time we never offered must not snap to the nearest slot, and must not be
// rescued by the affirmative in the same sentence. With ONE slot on offer this
// is the difference between asking a question and booking the wrong hour.
const wrongTime = C('as 14:00 pode ser?');
chk('confirm: an unoffered TIME is not a confirmation',
    wrongTime.status==='none' && wrongTime.matchedBy==='time_not_offered',
    `${wrongTime.status} (${wrongTime.matchedBy})`);
const wrongTimeSingle = matchConfirmation('as 14:00 pode ser?', [OFFER[0]], Z, NOW);
chk('confirm: unoffered time + affirmative + a SINGLE offer still does not book',
    wrongTimeSingle.status==='none',
    `${wrongTimeSingle.status} (${wrongTimeSingle.matchedBy})`);

// "segunda" is Monday AND "the second one". Never guess during a booking.
const segunda = C('a segunda');
chk('confirm: bare "segunda" never books', segunda.status!=='matched', segunda.status);

// A single-slot offer is the only case where a bare yes is safe.
const one = [OFFER[0]];
chk('confirm: bare yes books when exactly one slot was offered',
    C('sim', one).status==='matched' && hourOf(C('sim', one).slot)==='Thu 09:00');
chk('confirm: no stored offer -> no_offer, never a match',
    C('sim', []).status==='no_offer');
chk('confirm: unrelated question is not a confirmation',
    C('tem estacionamento?').status==='none');
chk('confirm: accented input is handled (as quinta as 9)',
    C('quinta-feira às 9').status==='matched');

// ---- "dia N": a day-of-month must beat a bare weekday ---------------------
// "sabado dia 12" used to resolve to the NEXT Saturday (the 5th), so the lead
// was offered slots for a different day than the one they named -- and the
// model then invented times for the day it had been asked about.
console.log('\n  -- day-of-month extraction');
const EX = (txt) => extractPreferredDate(txt, 'Europe/Lisbon', NOW);   // NOW = Mon 7 Sep
chk('dia: "sabado dia 12" -> the 12th, not the next Saturday',
    EX('e no sabado dia 12?')==='2026-09-12', String(EX('e no sabado dia 12?')));
chk('dia: "no dia 9" -> the 9th', EX('pode ser no dia 9?')==='2026-09-09', String(EX('pode ser no dia 9?')));
chk('dia: rolls into next month when the day has passed',
    EX('dia 3 entao')==='2026-10-03', String(EX('dia 3 entao')));
chk('dia: a bare weekday still works', EX('na quinta-feira')==='2026-09-10', String(EX('na quinta-feira')));
chk('dia: an explicit date still wins', EX('12/09')==='2026-09-12', String(EX('12/09')));
