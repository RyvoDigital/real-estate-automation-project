#!/usr/bin/env node
// Unit tests for src/lost_slot.js: a lead loses a slot to another lead, and the
// sentence is the system's (operator, 24 Sep 2026). Loads the SHIPPING sources.
//
//   node tests/lost_slot.test.js          (luxon from cockpit/node_modules)
//
// The sabotage the operator asked for is here: the model writes its own
// lost-race sentence (the 24 Sep gate's, word for word) and the template still
// wins. Plus: every template in three languages passes the workflow's own
// checks, never apologises, and renders times through the timezone database on
// both sides of 25 Oct; remaining slots come from a calendar read taken now,
// never from the earlier offer; a second loss in a row hands over.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { DateTime } = require(path.join(ROOT, 'cockpit', 'node_modules', 'luxon'));
const S = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const SRC = S('lost_slot.js');
const load = (src) => new Function('DateTime', [
  S('booking_claim.js'), S('booking_stated.js'), S('reply_name.js'), S('time_guard.js'), S('invariants.js'),
  S('language.js'), S('slot_engine.js'), src,
  'return { decideLostSlot, renderLostSlot, assembleLostSlotReply, remainingSlotsNow, isSlotLost, lsSlot,',
  '  LS_TEXT, LS_PLACEHOLDER, tgTimesIn, bookingClaim, checkInvariants, detectLanguage, computeSlots };',
].join('\n'))(DateTime);
const M = load(SRC);

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d && !c ? '  ' + d : ''}`); };
const Z = 'Europe/Lisbon';
const slot = (iso) => ({ startUtc: iso, endUtc: DateTime.fromISO(iso).plus({ hours: 1 }).toUTC().toISO(),
                         startLocal: DateTime.fromISO(iso, { zone: 'utc' }).setZone(Z).toISO(), zone: Z });
const R = [slot('2026-10-01T08:00:00.000Z'), slot('2026-10-01T09:00:00.000Z'), slot('2026-10-02T13:00:00.000Z')];
const offerDecision = { outcome: 'reoffer', detail: 'reoffered', offer: R };

// ---------------------------------------------------------------------------
console.log('\nthe templates: three languages, plain, and never an apology');
const RENDERED = {};
for (const lang of ['en', 'pt', 'es']) {
  const t = M.renderLostSlot(offerDecision, lang, Z);
  RENDERED[lang] = t;
  chk(`${lang}: says it was taken by someone else`, /someone else|outra pessoa|otra persona/.test(t), t);
  chk(`${lang}: lists the three remaining slots`, (t.match(/\d\d:\d\d/g) || []).length === 3, t);
  chk(`${lang}: read as ${lang} by the workflow's own detector`, M.detectLanguage(t).lang === lang, JSON.stringify(M.detectLanguage(t)));
  for (const k of ['offer', 'none_left', 'second_in_a_row']) {
    const x = k === 'offer' ? t : M.LS_TEXT[lang][k];
    // Our OWN fixed text, checked once, here: no phrase list judges the model.
    chk(`${lang} ${k}: no apology, no admission of an error`,
      !/sorry|apolog|mistake|error|incorrect|desculp|lament|erro|engano|correct|disculp|perd[oó]n|equivoc/i.test(x), x);
    chk(`${lang} ${k}: not read as a booking claim`, !M.bookingClaim(x), M.bookingClaim(x));
  }
}
chk('en, exactly', RENDERED.en === 'That time has just been taken by someone else. We still have Thursday 1 October at 09:00, Thursday 1 October at 10:00 or Friday 2 October at 14:00 (Lisbon time). Which one suits you?', RENDERED.en);
chk('pt, exactly', RENDERED.pt === 'Esse horário acabou de ser reservado por outra pessoa. Ainda temos quinta-feira, 1 de outubro, às 09:00, quinta-feira, 1 de outubro, às 10:00 ou sexta-feira, 2 de outubro, às 14:00 (hora de Lisboa). Qual prefere?', RENDERED.pt);
chk('an unknown language falls back to English, never to nothing', M.renderLostSlot(offerDecision, 'fr', Z) === RENDERED.en);

console.log('\ninvariant 1 holds on every rendered offer, once the row stores what was offered');
for (const lang of ['en', 'pt', 'es']) {
  const row = { full_name: 'João Ferreira', qualification: { proposed_slots: { at: '2026-09-30T10:00:00Z',
    slots: R.map(s => ({ startUtc: s.startUtc, endUtc: s.endUtc, local: s.startLocal, zone: s.zone })) } } };
  const r = M.checkInvariants({ textSent: RENDERED[lang], sentKind: 'reply', escalating: false, row, leadUpdateOk: true,
    bookingResult: 'not_attempted', bookedEventId: null, bookingSlot: null, bookingIntent: 'taken', existingBooking: null,
    bookingCheck: 'none', bookingRetired: null, rejectedBudgets: [], parsedBudget: { min: null, max: null }, nameAllow: [] });
  chk(`${lang}: no invariant fires`, !(r.violated || []).length, JSON.stringify(r.violated));
}

console.log('\n25 Oct 2026: the timezone database, never an offset');
chk('24 Oct 09:00Z is 10:00 in Lisbon', M.lsSlot('2026-10-24T09:00:00Z', 'en', Z) === 'Saturday 24 October at 10:00');
chk('26 Oct 09:00Z is 09:00 in Lisbon', M.lsSlot('2026-10-26T09:00:00Z', 'pt', Z) === 'segunda-feira, 26 de outubro, às 09:00');
chk('es across the change', M.lsSlot('2026-10-26T09:00:00Z', 'es', Z) === 'lunes 26 de octubre a las 09:00');

// ---------------------------------------------------------------------------
console.log('\nthe decision: re-offer, or hand over, never a loop');
chk('first loss, slots left -> re-offer, at most three', (() => { const d = M.decideLostSlot({ remaining: R.concat(R), streakBefore: 0 }); return d.outcome === 'reoffer' && d.offer.length === 3; })());
chk('first loss, nothing left -> hand over', M.decideLostSlot({ remaining: [], streakBefore: 0 }).detail === 'none_left');
chk('SECOND loss in a row, slots left -> hand over anyway', (() => { const d = M.decideLostSlot({ remaining: R, streakBefore: 1 }); return d.outcome === 'handover' && d.detail === 'second_in_a_row'; })());
chk('the hand-over sentences say a colleague will be in touch (the card states that commitment)',
  ['en', 'pt', 'es'].every(l => /colleague|colega|compañero/.test(M.LS_TEXT[l].none_left) && /colleague|colega|compañero/.test(M.LS_TEXT[l].second_in_a_row)));

console.log('\nremaining slots: a calendar read taken NOW, the same checks as any offer');
const NOW = '2026-09-28T10:00:00.000Z';
const CFG = { timezone: Z, working_hours: { start: '09:00', end: '19:00', days: [1, 2, 3, 4, 5, 6] }, min_hours_notice: 24, booking_window_days: 14 };
const fresh = M.remainingSlotsNow(CFG, [], NOW, null, M.computeSlots);
chk('an empty calendar gives the engine\'s first three slots', fresh.length === 3, JSON.stringify(fresh.map(s => s.startUtc)));
const lost = fresh[0];
const busyNow = [{ start: lost.startUtc, end: lost.endUtc }, { start: fresh[1].startUtc, end: fresh[1].endUtc }];
const again = M.remainingSlotsNow(CFG, busyNow, NOW, lost, M.computeSlots);
chk('what the read now shows busy is not offered (the earlier offer is never consulted)',
  !again.some(s => s.startUtc === lost.startUtc || s.startUtc === fresh[1].startUtc), JSON.stringify(again.map(s => s.startUtc)));
chk('... and the engine still finds three', again.length === 3);
chk('a failed read (busy null) offers NOTHING, never an old offer', M.remainingSlotsNow(CFG, null, NOW, lost, M.computeSlots).length === 0);
chk('no engine passed -> nothing, never a guess', M.remainingSlotsNow(CFG, [], NOW, lost, undefined).length === 0);
chk('the notice period applies to a re-offer too', again.every(s => DateTime.fromISO(s.startUtc) >= DateTime.fromISO(NOW).plus({ hours: 24 })));

console.log('\nwhich path lost a slot');
chk('sequential: taken at the intent', M.isSlotLost({ bookingIntent: 'taken', bookingSlot: lost }) === 'sequential');
chk('sequential, but something else escalates: not handled here', M.isSlotLost({ bookingIntent: 'taken', bookingSlot: lost, escalating: true }) === null);
chk('race: the re-check found it taken', M.isSlotLost({ bookingBranch: 'blocked', recheckError: 'slot_taken_since_offer' }) === 'race');
chk('race: Google 409, another lead\'s event', M.isSlotLost({ bookingBranch: 'conflict_resolved', httpStatus: 409, conflict: 'other' }) === 'race');
chk('NOT a loss: our own replay', M.isSlotLost({ bookingBranch: 'conflict_resolved', httpStatus: 409, conflict: 'ours' }) === null);
chk('NOT a loss: a burned id', M.isSlotLost({ bookingBranch: 'conflict_resolved', httpStatus: 409, conflict: 'burned_id' }) === null);
chk('NOT a loss: a created event', M.isSlotLost({ bookingBranch: 'create_attempted', httpStatus: 200 }) === null);
chk('NOT a loss: a re-check that could not run', M.isSlotLost({ bookingBranch: 'blocked', recheckError: 'recheck_failed' }) === null);

// ---------------------------------------------------------------------------
console.log('\nthe model\'s prose is the second line: the template always wins');
const T = RENDERED.pt;
let a = M.assembleLostSlotReply('Olá João! {{LOST_SLOT}}', T, M.tgTimesIn);
chk('placeholder once: the sentence goes where the model put it', a.text === 'Olá João! ' + T && !a.warnings.length, a.text);
a = M.assembleLostSlotReply('{{LOST_SLOT}}', T, M.tgTimesIn);
chk('placeholder alone: the sentence alone', a.text === T && !a.warnings.length);
a = M.assembleLostSlotReply('', T, M.tgTimesIn);
chk('no prose: the sentence alone', a.text === T);
a = M.assembleLostSlotReply('Obrigado pela mensagem.', T, M.tgTimesIn);
chk('no placeholder: sentence first, prose after, and a warning', a.text === T + '\n\nObrigado pela mensagem.' && a.warnings[0] === 'lost_slot_placeholder_missing', a.text);
a = M.assembleLostSlotReply('{{LOST_SLOT}} Até já. {{LOST_SLOT}}', T, M.tgTimesIn);
chk('placeholder twice: rendered once, a warning', a.text.split(T).length === 2 && !a.text.includes('{{') && a.warnings.includes('lost_slot_placeholder_repeated'), a.text);
a = M.assembleLostSlotReply('Olá! {LOST_SLOT} Até já.', T, M.tgTimesIn);
chk('a mangled placeholder is removed, the sentence placed, a warning', a.text.startsWith(T) && !/lost_slot/i.test(a.text) && a.warnings.includes('lost_slot_placeholder_mangled'), a.text);

console.log('\nSABOTAGE (operator, 24 Sep): the model writes its OWN lost-race sentence');
const GATE_24_SEP = 'Peço desculpa, João, mas esse horário das 16:00 não está correto da minha parte - as opções disponíveis são sábado, 26 de setembro, às 17:00 ou às 18:00, ou segunda-feira, 28 de setembro, às 09:00, hora de Lisboa.';
a = M.assembleLostSlotReply(GATE_24_SEP, T, M.tgTimesIn);
chk('the 24 Sep gate\'s sentence, word for word: the template goes ALONE', a.text === T && a.proseUsed === false, a.text);
chk('... nothing of the apology reaches the lead', !/desculpa|correto/.test(a.text));
chk('... and it is a visible warning', a.warnings[0] === 'lost_slot_prose_named_a_time');
a = M.assembleLostSlotReply('{{LOST_SLOT}} Sorry, the 4pm slot was my mistake.', RENDERED.en, M.tgTimesIn);
chk('a loose time ("4pm") beside the placeholder: the template alone', a.text === RENDERED.en, a.text);
a = M.assembleLostSlotReply('Lo siento, a las 16h ya no hay hueco. {{LOST_SLOT}}', RENDERED.es, M.tgTimesIn);
chk('"16h" in Spanish: the template alone', a.text === RENDERED.es, a.text);
{
  // Sabotage the assembler itself: stop dropping prose that names a time. The
  // 24 Sep sentence must then reach the text, i.e. the check above is what
  // stops it (a test that cannot fail proves nothing).
  const sab = SRC.replace('if (extract(bare).length || LS_LOOSE_TIME_RX.test(bare)) {', 'if (false) {');
  chk('sabotage applied', sab !== SRC && sab.includes('if (false) {'));
  const X = load(sab);
  const out = X.assembleLostSlotReply(GATE_24_SEP, T, X.tgTimesIn);
  chk('sabotaged: the model\'s apology reaches the lead, so the real check is load-bearing', /desculpa/.test(out.text), out.text);
}
{
  // Sabotage the timezone: a fixed +01:00 instead of Lisbon. 26 Oct must go wrong.
  const sab = SRC.replace(".setZone(lsZone(zone));\n  if (!dt.isValid) return null;", ".setZone('UTC+1');\n  if (!dt.isValid) return null;");
  chk('sabotage applied (fixed +01:00)', sab !== SRC);
  const X = load(sab);
  chk('sabotaged: 26 Oct renders 10:00, which the real test above rejects', X.lsSlot('2026-10-26T09:00:00Z', 'pt', Z).endsWith('10:00'));
}
{
  // Sabotage the streak: ignore it. A second loss must then re-offer, which the
  // real test above rejects: the loop the operator ruled out.
  const sab = SRC.replace("if (streak >= 1) return { outcome: 'handover', detail: 'second_in_a_row', offer: [] };", '');
  chk('sabotage applied (streak ignored)', sab !== SRC);
  chk('sabotaged: a second loss re-offers', load(sab).decideLostSlot({ remaining: R, streakBefore: 1 }).outcome === 'reoffer');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
