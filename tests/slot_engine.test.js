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
const guards = [
  ['not a real date',        'not-a-date'],
  ['nonsense date',          '2026-13-45'],
  ['in the past',            '2026-09-01'],
  ['today, inside notice',   '2026-09-07'],
  ['beyond booking window',  '2026-10-30'],
  ['a Sunday (non-working)', '2026-09-13'],
];
for (const [label, pd] of guards) {
  const r = S({ preferDate: pd });
  const fellBack = r.preferStatus==='invalid' && r.slots.length>0;
  chk(`guard: ${label} -> silent fallback`, fellBack, `status=${r.preferStatus} slots=${r.slots.length}`);
}

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
