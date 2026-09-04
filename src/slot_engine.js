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

// ---------------------------------------------------------------------------
// A lightweight, workflow-side date HINT.
//
// The slots must be in Claude's prompt before it replies, and Checkpoint C2
// needs the workflow to know exactly which slots were offered -- so the model
// cannot be the one choosing them. That rules out taking the preferred day from
// the model's output on the same turn.
//
// This produces a CANDIDATE date only. Every guard in computeSlots still
// applies, and anything unrecognised or invalid falls back silently to
// spreading. The worst failure is an uneven spread, never a wrong or
// unavailable time.
const WEEKDAYS = {
  1: ['segunda', 'monday', 'lunes'],
  2: ['terca', 'tuesday', 'martes'],
  3: ['quarta', 'wednesday', 'miercoles'],
  4: ['quinta', 'thursday', 'jueves'],
  5: ['sexta', 'friday', 'viernes'],
  6: ['sabado', 'saturday'],
  7: ['domingo', 'sunday'],
};
function extractPreferredDate(text, tz, nowISO) {
  if (!text) return null;
  // Strip diacritics first. A JS \\b after "ã" never matches, because an accented
  // character is not a word character -- so "amanhã?" failed while "tomorrow"
  // worked. Normalising also removes the need to enumerate accented variants.
  const t = String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const now = DateTime.fromISO(nowISO, { zone: 'utc' }).setZone(tz);

  if (/\b(hoje|today|hoy)\b/.test(t)) return now.toFormat('yyyy-LL-dd');
  if (/\b(amanha|tomorrow|manana)\b/.test(t)) {
    return now.plus({ days: 1 }).toFormat('yyyy-LL-dd');
  }
  // Explicit dd/mm or dd-mm, year optional.
  const m = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
  if (m) {
    const day = Number(m[1]), mon = Number(m[2]);
    let year = m[3] ? Number(m[3]) : now.year;
    if (year < 100) year += 2000;
    const d = DateTime.fromObject({ year, month: mon, day }, { zone: tz });
    if (d.isValid) {
      // A bare dd/mm already past this year means next year.
      return (!m[3] && d < now.startOf('day') ? d.plus({ years: 1 }) : d).toFormat('yyyy-LL-dd');
    }
    return null;
  }
  for (const [wd, names] of Object.entries(WEEKDAYS)) {
    if (names.some(n => t.includes(n))) {
      const target = Number(wd);
      // "next <weekday>" means the coming one; today does not count, because a
      // same-day request will fail min_hours_notice anyway.
      let d = now.plus({ days: 1 }).startOf('day');
      for (let i = 0; i < 7; i++) {
        if (d.weekday === target) return d.toFormat('yyyy-LL-dd');
        d = d.plus({ days: 1 });
      }
    }
  }
  return null;
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
  const perDayAll = [];
  let cursor = now.setZone(zone).startOf('day');
  const lastDay = windowEnd.setZone(zone).endOf('day');

  while (cursor <= lastDay) {
    if (allowedDays.has(cursor.weekday)) {          // Luxon: 1=Mon .. 7=Sun
      const dayStart = cursor.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
      const dayEnd = cursor.set({ hour: eh, minute: em, second: 0, millisecond: 0 });
      const free = [];
      let eligible = 0;
      // Re-derive from the day, so a DST transition inside the day is applied
      // by Luxon rather than by adding fixed offsets.
      for (let t = dayStart; t.plus({ minutes: durationMinutes }) <= dayEnd; t = t.plus({ minutes: step })) {
        const sUtc = t.toUTC();
        const eUtc = t.plus({ minutes: durationMinutes }).toUTC();
        if (sUtc < earliest) continue;              // past, or inside notice period
        if (eUtc > windowEnd) continue;             // beyond the booking window
        eligible++;                                 // would be offerable if free
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
      // `eligible` counts slots that clear the past/notice/window tests but
      // ignores busy. It is the only way to tell "that day is booked up" from
      // "that day is too soon" -- and saying the wrong one is asserting a cause
      // the system does not actually know.
      if (eligible || free.length) {
        perDayAll.push({ date: cursor.toFormat('yyyy-LL-dd'), free, eligible });
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
      // Each failure gets its own status. They all fall back to spreading, but
      // the reply should be able to say WHICH thing was true -- "we are closed
      // on Sundays" and "that is too soon" are different sentences to a lead,
      // and picking the wrong one is an invented fact.
      if (!workingDay) preferStatus = 'closed_day';
      else if (!notPast || !afterNotice) preferStatus = 'too_soon';
      else if (!inWindow) preferStatus = 'out_of_window';
      if (inWindow && notPast && afterNotice && workingDay) {
        prefer = dayKey;
        // Valid, but the day may yield nothing -- and there are two different
        // reasons for that. "Full" means the calendar is genuinely blocked;
        // "too soon" means every slot on that day sits inside min_hours_notice.
        // Reporting one as the other is asserting a cause we did not check.
        if (perDay.some(x => x.date === dayKey)) {
          preferStatus = 'used';
        } else {
          const rec = perDayAll.find(x => x.date === dayKey);
          preferStatus = (rec && rec.eligible > 0) ? 'full' : 'too_soon';
        }
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
  return { slots: out, preferDate: prefer,
           preferRequested: preferDate || null, preferStatus };
}

// ============================================================================
// Checkpoint C2 — does this message confirm one of the slots we offered?
//
// The WORKFLOW decides, for the same reason it chose the slots in C1: an event
// is about to be created, and "which one did they mean" must be answerable from
// stored data rather than from a model's paraphrase. The model still phrases
// the outcome -- it is just told the outcome rather than asked for it.
//
// Deciding this before the Claude call, rather than after, is what keeps the
// booking turn to ONE model call: by the time Claude writes, the event either
// exists or it does not, so it never confirms a booking that failed.
//
// The bias is deliberate and one-directional: when in doubt, do NOT book. An
// ambiguous message costs the lead one clarifying question. A wrong match puts
// a real appointment in a real agent's calendar at a time nobody agreed to.
// ============================================================================
const AFFIRMATIVE = /\b(sim|yes|si|ok|okay|claro|perfeito|perfect|combinado|pode ser|works|great|otimo|vale|de acuerdo)\b/;

// "segunda" is deliberately absent from the ordinals. In Portuguese it is both
// "the second one" and "Monday", and a booking is not the place to guess.
const ORDINALS = [
  { rx: /\b(primeir[oa]|first|primer[oa]|1o|1a|1º|1ª)\b/, idx: 0 },
  { rx: /\b(terceir[oa]|third|tercer[oa]|3o|3a)\b/, idx: 2 },
  { rx: /\b(ultim[oa]|last)\b/, idx: -1 },
];

function matchConfirmation(text, storedSlots, tz, nowISO) {
  const out = (status, slot, by) => ({ status, slot: slot || null, matchedBy: by || null });
  const slots = Array.isArray(storedSlots) ? storedSlots : [];
  if (!slots.length) return out('no_offer');
  if (!text) return out('none');

  const t = String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Describe each offered slot in the client's zone, so every comparison below
  // is against what the lead was actually shown.
  const desc = slots.map((s, i) => {
    const d = DateTime.fromISO(s.startUtc).setZone(s.zone || tz);
    return { i, slot: s, weekday: d.weekday, date: d.toFormat('yyyy-LL-dd'),
             day: d.day, month: d.month, hour: d.hour, minute: d.minute };
  });

  const signals = [];
  let pool = desc;
  const narrow = (fn, name) => {
    const next = pool.filter(fn);
    if (next.length) { pool = next; signals.push(name); }
    return next.length;
  };

  // --- an explicit clock time: "9h", "09:00", "as 10", "10h30" ---------------
  const hours = new Set();
  let m;
  const explicitRx = /\b(\d{1,2})[:h](\d{2})\b|\b(\d{1,2})\s*h\b|\bas\s+(\d{1,2})\b|\bat\s+(\d{1,2})\b/g;
  while ((m = explicitRx.exec(t)) !== null) {
    const h = Number(m[1] || m[3] || m[4] || m[5]);
    if (h >= 0 && h <= 23) hours.add(h);
  }
  if (hours.size) {
    // Same rule as an unoffered weekday, and it matters more here: with a
    // single slot on offer, "as 14:00 pode ser?" would otherwise fall through
    // to the affirmative branch and book the 09:00 nobody asked for.
    if (!desc.some(x => hours.has(x.hour))) return out('none', null, 'time_not_offered');
    narrow(x => hours.has(x.hour), 'time');
  }

  // --- a weekday name -------------------------------------------------------
  const wanted = new Set();
  for (const [wd, names] of Object.entries(WEEKDAYS)) {
    if (names.some(n => t.includes(n))) wanted.add(Number(wd));
  }
  if (wanted.size) {
    // A weekday we never offered is a NEW request, not a confirmation. C1's
    // preferDate path owns that; booking must keep its hands off it.
    if (!desc.some(x => wanted.has(x.weekday))) return out('none', null, 'weekday_not_offered');
    narrow(x => wanted.has(x.weekday), 'weekday');
  }

  // --- "dia 10", or an explicit 10/09 --------------------------------------
  const dm = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})\b/);
  if (dm) {
    const day = Number(dm[1]), mon = Number(dm[2]);
    if (!desc.some(x => x.day === day && x.month === mon)) return out('none', null, 'date_not_offered');
    narrow(x => x.day === day && x.month === mon, 'date');
  } else {
    const dia = t.match(/\bdia\s+(\d{1,2})\b/);
    if (dia) {
      const day = Number(dia[1]);
      if (!desc.some(x => x.day === day)) return out('none', null, 'date_not_offered');
      narrow(x => x.day === day, 'day_of_month');
    }
  }

  // --- "a primeira", "the last one" ----------------------------------------
  if (pool.length > 1) {
    for (const o of ORDINALS) {
      if (o.rx.test(t)) {
        const target = o.idx === -1 ? desc[desc.length - 1] : desc[o.idx];
        if (target && pool.includes(target)) { pool = [target]; signals.push('ordinal'); }
        break;
      }
    }
  }

  if (signals.length && pool.length === 1) {
    return out('matched', pool[0].slot, signals.join('+'));
  }
  if (signals.length && pool.length > 1) {
    return out('ambiguous', null, signals.join('+'));
  }

  // --- a bare "sim" only works when there is nothing to be ambiguous about ---
  if (AFFIRMATIVE.test(t)) {
    if (desc.length === 1) return out('matched', desc[0].slot, 'affirmative_single_offer');
    return out('ambiguous', null, 'affirmative_multiple_offers');
  }
  return out('none');
}
