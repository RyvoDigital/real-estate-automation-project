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

// ---- the clock change: Lisbon leaves WEST (+01:00) for WET (+00:00) --------
// Sunday 25 Oct 2026, 02:00 local -> 01:00. Working hours are LOCAL: 09:00 in
// Lisbon is 08:00 UTC on Friday and 09:00 UTC on Monday. An engine adding fixed
// offsets would offer Monday at 10:00, or 08:00, local; this is the proof it does
// not, written before the first change it would have to survive (22 Sep 2026).
console.log('\n  -- DST: Fri 23 Oct to Mon 26 Oct 2026, +01:00 then +00:00');
{
  const DSTNOW = '2026-10-22T06:00:00Z';                        // Thu; 24h notice -> from Fri
  const all = (days) => computeSlots({ ...base, nowISO:DSTNOW, tz:'Europe/Lisbon', bookingWindowDays:5,
                                       maxSlots:200, workingHours:{ start:'09:00', end:'19:00', days } }).slots;
  const sl = all([1,2,3,4,5,6]);
  const on = (date) => sl.filter(s => s.dateLocal === date).sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  const fri = on('2026-10-23'), sat = on('2026-10-24'), mon = on('2026-10-26');
  chk('DST: Fri 23 Oct 09:00 Lisbon is 08:00 UTC, +01:00',
      fri[0] && fri[0].timeLocal==='09:00' && fri[0].startUtc==='2026-10-23T08:00:00.000Z' && fri[0].startLocal.endsWith('+01:00'),
      fri[0] && `${fri[0].timeLocal} ${fri[0].startUtc} ${fri[0].startLocal}`);
  chk('DST: Sat 24 Oct, the last day of summer time, is still +01:00',
      sat[0] && sat[0].startUtc==='2026-10-24T08:00:00.000Z' && sat.every(s => s.startLocal.endsWith('+01:00')));
  chk('DST: Mon 26 Oct 09:00 Lisbon is 09:00 UTC, +00:00 (09:00 local stays 09:00 local)',
      mon[0] && mon[0].timeLocal==='09:00' && mon[0].startUtc==='2026-10-26T09:00:00.000Z' && mon[0].startLocal.endsWith('+00:00'),
      mon[0] && `${mon[0].timeLocal} ${mon[0].startUtc} ${mon[0].startLocal}`);
  // The engine spreads one slot per day; a day's whole list comes back only when
  // it is the one day with anything free. So each day is isolated by marking
  // everything outside it busy, and its full list read.
  const dayOnly = (date, days) => {
    const d0 = DateTime.fromISO(date, { zone:'Europe/Lisbon' }).startOf('day'), d1 = d0.plus({ days:1 });
    const busy = [{ start:'2026-10-01T00:00:00Z', end:d0.toUTC().toISO() }, { start:d1.toUTC().toISO(), end:'2026-11-30T00:00:00Z' }];
    return computeSlots({ ...base, nowISO:DSTNOW, tz:'Europe/Lisbon', bookingWindowDays:5, maxSlots:200, busy,
                          workingHours:{ start:'09:00', end:'19:00', days: days || [1,2,3,4,5,6] } }).slots;
  };
  const HOURS = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];
  for (const [date, off, utc9] of [['2026-10-23','+01:00','08'], ['2026-10-24','+01:00','08'], ['2026-10-26','+00:00','09']]) {
    const d = dayOnly(date);
    chk(`DST: ${date} offers 09:00..18:00 local, ten slots, all ${off}, 09:00 local = ${utc9}:00 UTC`,
        d.length===10 && d.every((x, i) => x.timeLocal===HOURS[i] && x.dateLocal===date && x.startLocal.endsWith(off))
          && d[0].startUtc===`${date}T${utc9}:00:00.000Z`,
        `${d.length}: ${d.map(x => x.timeLocal + x.startLocal.slice(-6)).join(',')}`);
  }
  chk('DST: no slot outside working hours in LOCAL time (no 08:00, no 19:00)',
      sl.every(s => s.timeLocal >= '09:00' && s.timeLocal <= '18:00'), sl.map(s => s.timeLocal).join(','));
  chk('DST: Sunday is closed here, so nothing on the day of the change', on('2026-10-25').length===0);
  // A client open on Sundays: the change day itself. 02:00 happens twice; the
  // working day starts long after, so it is a plain +00:00 day.
  const sun = dayOnly('2026-10-25', [1,2,3,4,5,6,7]);
  chk('DST: open on Sunday 25 Oct: 09:00 local is 09:00 UTC, +00:00, ten slots',
      sun.length===10 && sun[0].startUtc==='2026-10-25T09:00:00.000Z' && sun.every(s => s.startLocal.endsWith('+00:00')),
      `${sun.length} ${sun[0] && sun[0].startUtc}`);
  // Confirming across the change: "segunda às 9" must book Monday 09:00 LOCAL.
  const offer = [fri[0], mon[0]].map(s => ({ startUtc:s.startUtc, endUtc:s.endUtc, local:s.startLocal, zone:'Europe/Lisbon' }));
  const m = matchConfirmation('segunda às 9 pode ser', offer, 'Europe/Lisbon', '2026-10-22T10:00:00Z');
  chk('DST: "segunda às 9" across the change matches Monday 09:00 local (09:00 UTC)',
      m.status==='matched' && m.slot && m.slot.startUtc==='2026-10-26T09:00:00.000Z', JSON.stringify(m));
}

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
