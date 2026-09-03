// ============================================================================
// Slot engine — shared source. Embedded verbatim into the ProposeSlots Code
// node, and unit-tested standalone against non-Lisbon timezones.
//
// §4: the test environment has calendar, config and cron all agreeing on
// Europe/Lisbon. That agreement HIDES timezone bugs rather than revealing them,
// so nothing here may hardcode a zone and every case below is exercised against
// Europe/Madrid (+1 vs Lisbon) as well.
//
// Everything is computed and stored in UTC. The client timezone is used at
// exactly three edges: filtering to working hours, formatting for the lead, and
// setting the calendar event's zone.
// ============================================================================
function computeSlots(opts) {
  const {
    nowISO,                    // UTC instant, ISO
    tz,                        // IANA zone from client config -- never a literal
    workingHours,              // {start:'09:00', end:'19:00', days:[1..6]}
    bookingWindowDays,
    minHoursNotice,
    durationMinutes,
    busy,                      // [{start,end}] ISO UTC, from free/busy
    maxSlots,
    preferDate,                // optional 'YYYY-MM-DD' in tz; soft preference
    slotStepMinutes,
  } = opts;

  const step = slotStepMinutes || 60;
  const max = maxSlots || 3;
  const now = DateTime.fromISO(nowISO, { zone: 'utc' });
  if (!now.isValid) throw new Error('bad nowISO');

  const zone = tz;
  const earliest = now.plus({ hours: minHoursNotice });     // never "in 20 minutes"
  const windowEnd = now.plus({ days: bookingWindowDays });

  const busyIv = (busy || []).map(b => ({
    s: DateTime.fromISO(b.start, { zone: 'utc' }),
    e: DateTime.fromISO(b.end, { zone: 'utc' }),
  })).filter(x => x.s.isValid && x.e.isValid);

  const overlaps = (s, e) => busyIv.some(b => s < b.e && e > b.s);

  const [sh, sm] = String(workingHours.start).split(':').map(Number);
  const [eh, em] = String(workingHours.end).split(':').map(Number);
  const allowedDays = new Set(workingHours.days || [1, 2, 3, 4, 5, 6]);

  // Walk calendar days in the CLIENT's zone, not UTC -- a day boundary in
  // Lisbon is not a day boundary in Madrid.
  const perDay = [];
  let cursor = now.setZone(zone).startOf('day');
  const lastDay = windowEnd.setZone(zone).endOf('day');

  while (cursor <= lastDay) {
    if (allowedDays.has(cursor.weekday)) {          // Luxon: 1=Mon .. 7=Sun
      const dayStart = cursor.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
      const dayEnd = cursor.set({ hour: eh, minute: em, second: 0, millisecond: 0 });
      const free = [];
      // Re-derive from the day, so a DST transition inside the day is applied
      // by Luxon rather than by adding fixed offsets.
      for (let t = dayStart; t.plus({ minutes: durationMinutes }) <= dayEnd; t = t.plus({ minutes: step })) {
        const sUtc = t.toUTC();
        const eUtc = t.plus({ minutes: durationMinutes }).toUTC();
        if (sUtc < earliest) continue;              // past, or inside notice period
        if (eUtc > windowEnd) continue;             // beyond the booking window
        if (overlaps(sUtc, eUtc)) continue;         // busy
        free.push({
          startUtc: sUtc.toISO(),
          endUtc: eUtc.toISO(),
          startLocal: t.toISO(),
          dateLocal: t.toFormat('yyyy-LL-dd'),
          timeLocal: t.toFormat('HH:mm'),
          zone,
        });
      }
      if (free.length) perDay.push({ date: cursor.toFormat('yyyy-LL-dd'), free });
    }
    cursor = cursor.plus({ days: 1 });
  }

  // Spread across days rather than offering three consecutive morning slots.
  // A soft date preference (from what the lead asked for) is honoured by
  // ordering only -- the workflow still supplies every time.
  if (preferDate) {
    perDay.sort((a, b) => (a.date === preferDate ? -1 : 0) - (b.date === preferDate ? -1 : 0));
  }
  const out = [];
  for (const d of perDay) {
    if (out.length >= max) break;
    out.push(d.free[0]);
  }
  // If only one day has availability, fill from that day rather than under-offering.
  if (out.length < max && perDay.length === 1) {
    for (const s of perDay[0].free.slice(1)) {
      if (out.length >= max) break;
      out.push(s);
    }
  }
  return out;
}
