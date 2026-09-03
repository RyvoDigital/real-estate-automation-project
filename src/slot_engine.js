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
// ---------------------------------------------------------------------------
// Google free/busy returns HTTP 200 for a calendar it cannot read, with an
// `errors` array and an EMPTY `busy` list. An unreachable or misconfigured
// calendar is therefore indistinguishable from a totally free one unless the
// errors array is read. Unguarded, that offers every slot in the window as
// available. Verified against the live API on 2026-09-03.
function readFreeBusy(httpResponse, calendarId) {
  const res = httpResponse || {};
  const code = res.statusCode;
  if (!(code >= 200 && code < 300)) {
    return { ok: false, busy: [], error: 'freebusy_http_' + code };
  }
  const cals = (res.body && res.body.calendars) || null;
  if (!cals) return { ok: false, busy: [], error: 'freebusy_malformed' };
  const entry = cals[calendarId];
  if (!entry) return { ok: false, busy: [], error: 'freebusy_calendar_absent' };
  if (Array.isArray(entry.errors) && entry.errors.length) {
    const reason = entry.errors.map(e => e.reason || 'unknown').join(',');
    return { ok: false, busy: [], error: 'freebusy_calendar_error:' + reason };
  }
  return { ok: true, busy: Array.isArray(entry.busy) ? entry.busy : [], error: null };
}

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

  // ---------------------------------------------------------------------
  // preferDate comes from the MODEL (it extracts "quinta-feira" from the
  // lead's message), so it is validated before it is allowed to influence
  // anything. It affects ORDERING and INCLUSION only -- never eligibility.
  // A slot that is not genuinely free can never be surfaced by preferring it.
  // Any failed check falls back silently to spreading.
  // ---------------------------------------------------------------------
  let preferStatus = 'none';
  let prefer = null;
  if (preferDate) {
    preferStatus = 'invalid';
    const d = DateTime.fromISO(String(preferDate), { zone });
    if (d.isValid) {
      const dayKey = d.toFormat('yyyy-LL-dd');
      const dayStartUtc = d.startOf('day').toUTC();
      const dayEndUtc = d.endOf('day').toUTC();
      const inWindow = dayEndUtc >= now && dayStartUtc <= windowEnd;
      const notPast = dayEndUtc > now;
      const afterNotice = dayEndUtc > earliest;
      const workingDay = allowedDays.has(d.weekday);
      if (inWindow && notPast && afterNotice && workingDay) {
        prefer = dayKey;
        // Valid, but the day may simply be full. That is a different outcome
        // from an invalid request and the reply should be able to say so.
        preferStatus = perDay.some(x => x.date === dayKey) ? 'used' : 'full';
      }
    }
  }

  const out = [];
  if (prefer && preferStatus === 'used') {
    // Listen to what was asked for: take up to 2 from the requested day, then
    // spread the remainder, so an alternative is still offered.
    const day = perDay.find(x => x.date === prefer);
    for (const s of day.free.slice(0, Math.min(2, max))) out.push(s);
  }
  for (const d of perDay) {
    if (out.length >= max) break;
    if (prefer && d.date === prefer) continue;          // already taken from
    out.push(d.free[0]);
  }
  // If only one day has availability at all, fill from it rather than
  // under-offering.
  if (out.length < max && perDay.length === 1) {
    for (const s of perDay[0].free) {
      if (out.length >= max) break;
      if (!out.some(o => o.startUtc === s.startUtc)) out.push(s);
    }
  }
  return { slots: out, preferDate: prefer, preferStatus };
}
