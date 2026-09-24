// ============================================================================
// A lead loses a slot to another lead: the sentence is the SYSTEM's, never the
// model's. Shared source.
//
// Embedded between markers into AfterBooking (after src/time_guard.js, whose
// tgTimesIn() it uses) and LostSlotReoffer. Unit-tested standalone in
// tests/lost_slot.test.js, which loads THIS file rather than a copy.
//
// WHY THIS EXISTS
// On the 24 Sep gate a lead picked 16:00 seconds after another lead had booked
// it. The model was told "the time was taken, apologise plainly" and wrote:
// "Peço desculpa, João, mas esse horário das 16:00 não está correto da minha
// parte". That is false (nobody erred; someone else booked it), it apologises
// for an error we did not make, and the time guard could not read it as a
// decline, so invariant 1 fired. A phrase list would have caught this wording
// and missed the next one (docs/concierge-structural-guards-plan.md: nine
// misses, all of them a guard deciding what prose means).
//
// THE RULE (operator, 24 Sep 2026), and the first piece of the structural
// rebuild built its way (plan §1: the workflow writes every sentence that
// carries a time):
//   - the sentence is a fixed template per language (pt, en, es), rendered by
//     the workflow in the language already resolved for the reply;
//   - it says plainly that the time was just taken by someone else, and never
//     apologises for an error we did not make;
//   - it offers the remaining REAL slots, computed by the slot engine from a
//     calendar read taken at that moment, never from the earlier offer;
//   - if none are left, or this lead lost a slot the time before as well, it
//     hands over to a person (with the card), so there is no loop of re-offers;
//   - the model's prose is the second line only: it may carry {{LOST_SLOT}}
//     where the sentence goes; prose that names any time of its own is
//     dropped, and the template goes alone. The template always wins.
// Both paths use it: the sequential one (the slot was already busy when the
// lead picked it) and the race (two leads confirmed at once).
// ============================================================================

const LS_PLACEHOLDER = '{{LOST_SLOT}}';
const LS_LOOSE_TIME_RX = /\b(?:[01]?\d|2[0-3])\s?(?:h\b(?!\d)|[ap]\.?\s?m\.?(?![a-z]))/i;
// Anything that looks like an attempt at the placeholder but is not exactly it:
// {{LOST SLOT}}, {LOST_SLOT}, {{ LOST_SLOT }}, {{lost_slot}}, [[LOST_SLOT]].
const LS_MANGLED_RX = /[{[]{1,2}\s*lost[\s_-]?slot\s*[}\]]{1,2}/gi;

const LS_TEXT = {
  en: {
    offer: 'That time has just been taken by someone else. We still have {slots} ({city} time). Which one suits you?',
    none_left: 'That time has just been taken by someone else, and there are no other times free at the moment. A colleague will be in touch shortly to find one with you.',
    second_in_a_row: 'That time has also just been taken by someone else. A colleague will be in touch shortly to find a time with you.',
    or: ' or ', at: ' at ', city: { Lisbon: 'Lisbon' },
  },
  pt: {
    offer: 'Esse horário acabou de ser reservado por outra pessoa. Ainda temos {slots} (hora de {city}). Qual prefere?',
    none_left: 'Esse horário acabou de ser reservado por outra pessoa e, de momento, não há outros horários livres. Um colega entra em contacto consigo em breve para encontrar um.',
    second_in_a_row: 'Esse horário também acabou de ser reservado por outra pessoa. Um colega entra em contacto consigo em breve para encontrar um horário.',
    or: ' ou ', at: ', às ', city: { Lisbon: 'Lisboa' },
  },
  es: {
    offer: 'Ese horario acaba de reservarlo otra persona. Aún tenemos {slots} (hora de {city}). ¿Cuál le viene mejor?',
    none_left: 'Ese horario acaba de reservarlo otra persona y ahora mismo no hay otros horarios libres. Un compañero se pondrá en contacto con usted en breve para encontrar uno.',
    second_in_a_row: 'Ese horario también acaba de reservarlo otra persona. Un compañero se pondrá en contacto con usted en breve para encontrar un horario.',
    or: ' o ', at: ' a las ', city: { Lisbon: 'Lisboa' },
  },
};
const LS_DAYS = {
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  pt: ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'],
  es: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'],
};
const LS_MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
};

function lsLang(lang) { return LS_TEXT[lang] ? lang : 'en'; }
function lsZone(z) { return (typeof z === 'string' && z.indexOf('/') !== -1) ? z : 'Europe/Lisbon'; }

// One slot, from its stored UTC instant, in the client's zone through the
// timezone database (never an offset: Lisbon changes on 25 Oct).
//   en "Thursday 1 October at 09:00"   pt "quinta-feira, 1 de outubro, às 09:00"
//   es "jueves 1 de octubre a las 09:00"
function lsSlot(startUtc, lang, zone) {
  const L = lsLang(lang);
  const dt = DateTime.fromISO(String(startUtc), { zone: 'utc' }).setZone(lsZone(zone));
  if (!dt.isValid) return null;
  const day = LS_DAYS[L][dt.weekday - 1], mon = LS_MONTHS[L][dt.month - 1], hm = dt.toFormat('HH:mm');
  if (L === 'pt') return day + ', ' + dt.day + ' de ' + mon + LS_TEXT.pt.at + hm;
  if (L === 'es') return day + ' ' + dt.day + ' de ' + mon + LS_TEXT.es.at + hm;
  return day + ' ' + dt.day + ' ' + mon + LS_TEXT.en.at + hm;
}

function lsJoin(items, L) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + LS_TEXT[L].or + items[items.length - 1];
}

// decideLostSlot({ remaining, streakBefore }) -> { outcome, detail, offer }
//   remaining     the slots the slot engine found free in a calendar read taken
//                 NOW ([] when that read failed: never fall back to an old offer)
//   streakBefore  how many slots this lead had lost in a row before this one
function decideLostSlot(o) {
  const remaining = Array.isArray(o && o.remaining) ? o.remaining : [];
  const streak = Number(o && o.streakBefore) || 0;
  if (streak >= 1) return { outcome: 'handover', detail: 'second_in_a_row', offer: [] };
  if (!remaining.length) return { outcome: 'handover', detail: 'none_left', offer: [] };
  return { outcome: 'reoffer', detail: 'reoffered', offer: remaining.slice(0, 3) };
}

// renderLostSlot(decision, lang, zone) -> the sentence the lead receives.
function renderLostSlot(decision, lang, zone) {
  const L = lsLang(lang);
  const T = LS_TEXT[L];
  if (decision.outcome !== 'reoffer') return T[decision.detail] || T.none_left;
  const slots = decision.offer.map(s => lsSlot(s.startUtc, L, zone)).filter(Boolean);
  if (!slots.length) return T.none_left;
  const cityEn = lsZone(zone).split('/').pop().replace(/_/g, ' ');
  return T.offer.replace('{slots}', lsJoin(slots, L)).replace('{city}', T.city[cityEn] || cityEn);
}

// assembleLostSlotReply(prose, rendered, timesIn) -> { text, proseUsed, warnings }
// The model's prose around the placeholder is the SECOND line: the rendered
// sentence always goes, and the prose goes with it only when it names no time
// of its own. `timesIn` is src/time_guard.js's tgTimesIn (extraction, which
// converges; never a reading of what the prose means).
function assembleLostSlotReply(prose, rendered, timesIn) {
  const warnings = [];
  let p = String(prose == null ? '' : prose);
  const extract = typeof timesIn === 'function' ? timesIn : () => [];
  const bare = p.split(LS_PLACEHOLDER).join(' ');
  // tgTimesIn reads "16:00" and "16h00"; "4pm", "4 p.m." and a bare "16h" are
  // times too. Still extraction: a time's FORMAT, never what the prose means.
  if (extract(bare).length || LS_LOOSE_TIME_RX.test(bare)) {
    // Its own lost-slot sentence, or a time of any kind: the template wins alone.
    return { text: rendered, proseUsed: false, warnings: ['lost_slot_prose_named_a_time'] };
  }
  const n = p.split(LS_PLACEHOLDER).length - 1;
  if (n > 1) warnings.push('lost_slot_placeholder_repeated');
  // Mangled attempts are removed, and the sentence is then placed as if missing.
  const mangled = (p.replace(/\{\{LOST_SLOT\}\}/g, '').match(LS_MANGLED_RX) || []).length;
  if (mangled) { warnings.push('lost_slot_placeholder_mangled'); p = p.replace(/\{\{LOST_SLOT\}\}/g, '\u0000').replace(LS_MANGLED_RX, '').replace(/\u0000/g, LS_PLACEHOLDER); }
  let text;
  if (n >= 1) {
    const i = p.indexOf(LS_PLACEHOLDER);
    text = p.slice(0, i) + rendered + p.slice(i + LS_PLACEHOLDER.length).split(LS_PLACEHOLDER).join('');
  } else {
    if (!mangled && p.trim()) warnings.push('lost_slot_placeholder_missing');
    // The sentence the lead is waiting for goes first; any prose follows it.
    text = p.trim() ? rendered + '\n\n' + p.trim() : rendered;
  }
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  return { text, proseUsed: !!p.replace(LS_PLACEHOLDER, '').trim(), warnings };
}

// isSlotLost(item) -> 'sequential' | 'race' | null
// Read once, by LostSlotCheck, from the item the booking branch produced:
//   sequential  the slot the lead picked was already busy in this turn's read
//               (MatchConfirmation's 'taken'), and nothing else is escalating;
//   race        the re-check just before the create found it taken, or Google
//               refused the create with 409 because another lead's event holds
//               the id (not our own replay, not a burned id).
// AfterBooking classifies the same item again for its bookingResult;
// tests/lost_slot.test.js holds the two to the same cases. If they ever
// disagree, AfterBooking finds no fresh read and hands over: the safe side.
function isSlotLost(item) {
  const x = item || {};
  if (x.bookingIntent === 'taken' && x.bookingSlot && !x.escalating) return 'sequential';
  if (x.bookingBranch === 'blocked' && x.recheckError === 'slot_taken_since_offer') return 'race';
  if ((x.bookingBranch === 'create_attempted' || x.bookingBranch === 'conflict_resolved') && x.httpStatus === 409
      && x.conflict !== 'ours' && x.conflict !== 'burned_id') return 'race';
  return null;
}

// The slot engine, run on a calendar read taken NOW: the same checks as any
// offer (working hours, notice, window, busy), never the earlier offer.
// `busy` null means the read failed: nothing is offered. `compute` is
// src/slot_engine.js's computeSlots, passed in so this file never names a
// function its host node may not embed.
function remainingSlotsNow(cfg, busy, nowISO, lostSlot, compute) {
  if (!Array.isArray(busy) || typeof compute !== 'function') return [];
  const c = cfg || {};
  const out = compute({
    nowISO, tz: c.timezone || 'Europe/Lisbon',
    workingHours: c.working_hours || { start: '09:00', end: '19:00', days: [1, 2, 3, 4, 5, 6] },
    bookingWindowDays: c.booking_window_days || 14,
    minHoursNotice: c.min_hours_notice == null ? 24 : c.min_hours_notice,
    durationMinutes: c.viewing_duration_minutes || 60,
    busy, maxSlots: 3, preferDate: null, slotStepMinutes: 60,
  });
  const lost = lostSlot && lostSlot.startUtc ? DateTime.fromISO(lostSlot.startUtc).toMillis() : null;
  return (out.slots || []).filter(s => lost === null || DateTime.fromISO(s.startUtc).toMillis() !== lost);
}
