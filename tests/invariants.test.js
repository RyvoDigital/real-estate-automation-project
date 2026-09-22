#!/usr/bin/env node
// Unit tests for src/invariants.js. Loads the SHIPPING sources rather than a
// copy, in the order the nodes embed them, so the tests cannot drift from what
// the workflow runs.
//
//   node tests/invariants.test.js
//
// Every invariant has a DELIBERATELY BROKEN case (improvements §0.7: a test
// that cannot fail proves nothing), reconstructed from the 11–14 September
// defects, and a passing case for the same shape once the row holds the fact.
const fs = require('fs');
const path = require('path');
const SRC = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
eval(SRC('booking_claim.js'));
eval(SRC('booking_stated.js'));
eval(SRC('reply_name.js'));
eval(SRC('time_guard.js'));   // invariants.js calls its timesNotSupplied/tgTimesIn (one rule, one place)
eval(SRC('invariants.js'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const MON = { startUtc: '2026-09-14T08:00:00.000Z', endUtc: '2026-09-14T09:00:00.000Z', local: '2026-09-14T09:00:00.000+01:00', zone: 'Europe/Lisbon' };
const TUE = { startUtc: '2026-09-15T14:00:00.000Z', endUtc: '2026-09-15T15:00:00.000Z', local: '2026-09-15T15:00:00.000+01:00', zone: 'Europe/Lisbon' };
const THU = { startUtc: '2026-09-17T10:00:00.000Z', endUtc: '2026-09-17T11:00:00.000Z', local: '2026-09-17T11:00:00.000+01:00', zone: 'Europe/Lisbon' };
const OFFER = { at: '2026-09-14T10:00:00.000Z', slots: [MON, TUE, THU] };
const NAME_ALLOW = ['Marco Silva', 'Cascais Homes', 'Cascais', 'Estoril'];

// A context with nothing going on; each test overrides what it needs.
function ctx(over) {
  return Object.assign({
    textSent: '', sentKind: 'reply', escalating: false,
    row: { full_name: 'João Ferreira', budget_min: null, budget_max: null, qualification: {} },
    leadUpdateOk: true,
    bookingResult: 'not_attempted', bookedEventId: null, bookingSlot: null,
    bookingIntent: 'none', existingBooking: null, bookingCheck: 'none', bookingRetired: null,
    rejectedBudgets: [], parsedBudget: { min: null, max: null }, nameAllow: NAME_ALLOW,
  }, over || {});
}
const run = (over) => checkInvariants(ctx(over));
const violated = (r, k) => r.violated.indexOf(k) !== -1;
const unverified = (r, k) => r.unverified.indexOf(k) !== -1;

console.log('\ntimesNamedIn');
chk('H:MM and HhMM, deduplicated, normalised', same(timesNamedIn('às 09:00 ou 9:00, ou 14h30'), ['9:00', '14:30']));
chk('a money figure is not a time', same(timesNamedIn('1.100.000€'), []));

console.log('\nmoneyAmountsIn');
chk('€1.100.000', same(moneyAmountsIn('Registei €1.100.000 como máximo'), [1100000]));
chk('1.100.000,00€ with cents', same(moneyAmountsIn('até 1.100.000,00€'), [1100000]));
chk('1,1M read once, not also as €1', same(moneyAmountsIn('cerca de €1,1M'), [1100000]));
chk('1,2 milhões and 1,5 milhões', same(moneyAmountsIn('entre 1,2 milhões e 1,5 milhões'), [1200000, 1500000]));
chk('1.2 million (en)', same(moneyAmountsIn('around 1.2 million'), [1200000]));
chk('800k and 800 mil', same(moneyAmountsIn('800k, ou seja 800 mil euros'), [800000]));
chk('500 euros -- below the parser floor, still read', same(moneyAmountsIn('o seu orçamento de 500 euros'), [500]));
chk('EUR 500', same(moneyAmountsIn('EUR 500 per month'), [500]));
chk('bare 800.000', same(moneyAmountsIn('perto de 800.000'), [800000]));
chk('120 m² is not money', same(moneyAmountsIn('um T3 com 120 m² e 2 metros de pé-direito'), []));
chk('5 min is not money', same(moneyAmountsIn('a 5 min da praia'), []));
chk('a phone number is not money', same(moneyAmountsIn('ligue para +351 933 048 230'), []));
chk('a year is not money', same(moneyAmountsIn('14 de setembro de 2026'), []));
chk('a time is not money', same(moneyAmountsIn('às 15:00 ou 16:00'), []));

console.log('\ninvariant 1 -- a time named is in an offer the row holds');
{
  const text = 'Tenho terça às 15:00 ou quinta às 11:00. Qual prefere?';
  const broken = run({ textSent: text });                                     // 2026-09-14: shown, never stored
  chk('BROKEN: times shown, row holds no offer -> violated', violated(broken, '1'), JSON.stringify(broken.detail['1'].missing));
  chk('  the missing times are named', same(broken.detail['1'].missing, ['15:00', '11:00']));
  const ok = run({ textSent: text, row: { qualification: { proposed_slots: OFFER } } });
  chk('PASS: same reply, offer on the row -> holds', !violated(ok, '1'));
  const failedWrite = run({ textSent: text, leadUpdateOk: false, row: { qualification: {} } });
  chk('BROKEN: the write failed and the row as it was holds nothing -> violated', violated(failedWrite, '1'));
  const retired = run({ textSent: 'A marcação que tínhamos para segunda-feira, 14 de setembro às 09:00 já não está na nossa agenda.',
                        bookingRetired: Object.assign({ event_id: 'e1', retired_reason: 'cancelled' }, MON), row: { qualification: {} } });
  chk('PASS: the retired note names the retired time -> holds', !violated(retired, '1'));
  const booked = run({ textSent: 'Confirmado para segunda-feira, dia 14, às 09:00.', bookingResult: 'created', bookedEventId: 'e9', bookingSlot: MON,
                       row: { qualification: { booking: Object.assign({ event_id: 'e9' }, MON) } } });
  chk('PASS: a booked time is on the row -> holds', !violated(booked, '1'));
  chk('PASS: no time named -> holds', !violated(run({ textSent: 'Que tipo de imóvel procura?' }), '1'));
}

console.log('\ninvariant 1 -- declining the lead\'s own time is not naming one (one rule, src/time_guard.js)');
{
  // Live check 2, 21 Sep 2026, WORD FOR WORD. The guard kept this reply; the
  // invariant carried its own times-only copy of the rule and fired a false
  // "time_without_offer: named 11:00; offer holds 9:00, 10:00" alarm.
  const T9 = { local: '2026-09-24T09:00:00.000+01:00', zone: 'Europe/Lisbon' };
  const T10 = { local: '2026-09-24T10:00:00.000+01:00', zone: 'Europe/Lisbon' };
  const row = { qualification: { proposed_slots: { at: '2026-09-21T16:04:00.000Z', slots: [T9, T10] } } };
  const CHECK2 = "11:00 isn't available I'm afraid, João - Thursday morning we only have 09:00 or 10:00 Lisbon time. Would either of those work for you?";
  const live = run({ textSent: CHECK2, leadText: '11:00?', row });
  chk('PASS: check 2\'s reply, the lead asked "11:00?" -> invariant 1 holds', !violated(live, '1'), JSON.stringify(live.detail['1']));
  const noLead = run({ textSent: CHECK2, row });
  chk('CONTROL: the same reply with no lead text -> fires (the exemption needs the lead\'s own time)', violated(noLead, '1'));
  const accepted = run({ textSent: 'Great, 11:00 it is on Thursday!', leadText: '11:00?', row });
  chk('BROKEN: ACCEPTING the lead\'s unoffered 11:00 still fires', violated(accepted, '1') && same(accepted.detail['1'].missing, ['11:00']));
  const flip = run({ textSent: "11:00 isn't possible on Wednesday, but Thursday at 11:00 works", leadText: '11:00?', row });
  chk('BROKEN: declined in one clause, affirmed in the next -> fires', violated(flip, '1'));
  const other = run({ textSent: "12:00 isn't available, but 09:00 is.", leadText: '11:00?', row });
  chk('BROKEN: declining a time the lead never named -> fires', violated(other, '1'));
}

console.log('\ninvariant 1 -- the booking gate, run 9 (22 Sep): a "just taken" decline is not naming a time');
{
  // CAPTURED OUTPUT, word for word, in the turn's context: B asked for 16:00, A had
  // just booked it, so 16:00 has left the stored offer. It fired critical on 21 Sep.
  const S17 = { local: '2026-09-23T17:00:00.000+01:00', zone: 'Europe/Lisbon' }, S18 = { local: '2026-09-23T18:00:00.000+01:00', zone: 'Europe/Lisbon' }, T09 = { local: '2026-09-24T09:00:00.000+01:00', zone: 'Europe/Lisbon' };
  const r9 = run({ textSent: "¡Vaya, lo siento mucho! Ese horario de las 16:00 se acaba de ocupar. Puedo ofrecerte el miércoles 23 de septiembre a las 17:00, a las 18:00, o el jueves 24 de septiembre a las 09:00, hora de Lisboa. ¿Cuál te viene bien?", leadText: 'El miércoles a las 16:00, por favor',
                   bookingIntent: 'taken', row: { qualification: { proposed_slots: { at: '2026-09-21T23:22:00.000Z', slots: [S17, S18, T09] } } } });
  chk('PASS (run 9): "Ese horario de las 16:00 se acaba de ocupar" -> invariant 1 holds', !violated(r9, '1'), JSON.stringify(r9.detail['1']));
  const conf = run({ textSent: 'Perfecto, la cita quedó reservada a las 16:00.', leadText: 'El miércoles a las 16:00, por favor',
                     row: { qualification: { proposed_slots: { at: '2026-09-21T23:22:00.000Z', slots: [S17, S18, T09] } } } });
  chk('BROKEN: CONFIRMING the unoffered 16:00 still fires', violated(conf, '1'));
}

console.log('\ninvariant 2 -- a booking confirmed in the text has an event behind it');
{
  const claim = run({ textSent: 'Já tem uma reunião marcada para terça-feira às 15:00.', row: { qualification: { proposed_slots: OFFER } } });
  chk('BROKEN (12 Sep): "já tem uma reunião marcada", nothing held -> violated', violated(claim, '2'), claim.detail['2'].claim);
  const promise = run({ textSent: "I'll get that first meeting set for Tuesday.", row: { qualification: { proposed_slots: OFFER } } });
  chk('BROKEN (14 Sep): the future-tense promise, nothing being booked -> violated', violated(promise, '2'));
  const stated = 'Confirmado! A sua primeira reunião fica marcada para segunda-feira, dia 14 de setembro, às 09:00.';
  const failedCreate = run({ textSent: stated, bookingSlot: MON, bookingResult: 'failed', bookedEventId: null, row: { qualification: { proposed_slots: OFFER } } });
  chk('BROKEN: the reply states the slot, the create failed -> violated', violated(failedCreate, '2'));
  const created = run({ textSent: stated, bookingSlot: MON, bookingResult: 'created', bookedEventId: 'e9',
                        row: { qualification: { booking: Object.assign({ event_id: 'e9' }, MON) } } });
  chk('PASS: the reply states the slot, the event was created -> holds', !violated(created, '2'));
  const heldOk = run({ textSent: 'Your meeting is confirmed for Monday at 09:00, see you then.', bookingIntent: 'already_booked',
                       existingBooking: Object.assign({ event_id: 'e1' }, MON), bookingCheck: 'confirmed',
                       row: { qualification: { booking: Object.assign({ event_id: 'e1' }, MON) } } });
  chk('PASS: restating a booking verified this turn -> holds', !violated(heldOk, '2'));
  const heldUnread = run({ textSent: 'Your meeting is confirmed for Monday at 09:00.', bookingIntent: 'already_booked',
                           existingBooking: Object.assign({ event_id: 'e1' }, MON), bookingCheck: 'unreadable',
                           row: { qualification: { booking: Object.assign({ event_id: 'e1' }, MON) } } });
  chk('UNVERIFIED: restating a booking the calendar could not confirm -> unverified, not violated', unverified(heldUnread, '2') && !violated(heldUnread, '2'));
  for (const [lang, note] of [
    ['pt', 'A marcação que tínhamos para segunda-feira, 14 de setembro às 09:00 já não está na nossa agenda. Peço desculpa pelo incómodo. Um colega da equipa vai entrar em contacto consigo em breve para combinar uma nova hora.'],
    ['en', 'The appointment we had booked for Monday 14 September at 09:00 is no longer in our diary. I am sorry for the inconvenience. A member of our team will be in touch with you shortly to arrange a new time.'],
    ['es', 'La cita que teníamos para lunes 14 de septiembre a las 09:00 ya no está en nuestra agenda. Disculpe las molestias. Un compañero del equipo se pondrá en contacto con usted en breve para acordar una nueva hora.'],
  ]) {
    const r = run({ textSent: note, sentKind: 'handoff', escalating: true, bookingRetired: Object.assign({ event_id: 'e1' }, MON), row: { qualification: { past_bookings: [Object.assign({ event_id: 'e1' }, MON)] } } });
    chk('PASS: the ' + lang + ' retired note is not a confirmation -> holds', !violated(r, '2') && !violated(r, '1'));
  }
  chk('PASS: an offer with a question mark is not a confirmation', !violated(run({ textSent: 'Fica então para terça às 15:00?', row: { qualification: { proposed_slots: OFFER } } }), '2'));

  // 2026-09-22: the booking gate. Lead B chose a slot lead A had just taken; the
  // workflow declined it at the intent and the model apologised with alternatives.
  // The old rule counted a NAMED slot as a confirmation, and fired critical on
  // both of these (gate exec 5096 and 5134). Word for word, in the turn's context.
  const W09 = { startUtc: '2026-09-23T08:00:00.000Z', endUtc: '2026-09-23T09:00:00.000Z', local: '2026-09-23T09:00:00.000+01:00', zone: 'Europe/Lisbon' };
  const W13 = { startUtc: '2026-09-23T12:00:00.000Z', endUtc: '2026-09-23T13:00:00.000Z', local: '2026-09-23T13:00:00.000+01:00', zone: 'Europe/Lisbon' };
  const declined = (text, slot) => run({ textSent: text, bookingIntent: 'taken', bookingSlot: slot, bookingResult: 'not_attempted', bookedEventId: null });
  chk('PASS (gate exec 5096): "that slot was just taken. We still have ... Thursday 24 September at 09:00" -> holds',
      !violated(declined('So sorry, João — that slot was just taken. We still have Wednesday 23 September at 10:00, Wednesday 23 September at 11:00, or Thursday 24 September at 09:00, Lisbon time — would any of those suit you?', W09), '2'));
  chk('PASS (gate exec 5134): "esse horário das 13:00 acabou de ficar indisponível" -> holds',
      !violated(declined('Peço desculpa, João, mas esse horário das 13:00 acabou de ficar indisponível. Ainda temos quarta-feira, 23 de setembro às 14:00, quarta-feira, 23 de setembro às 15:00, ou quinta-feira, 24 de setembro às 09:00, horário de Lisboa. Qual destes prefere?', W13), '2'));
  // The dangerous direction, and the reason the declined turn is NOT skipped: a
  // "you're booked" on it, or on any turn with no event, fires in every language.
  for (const [lang, text] of [
    ['en', "You're booked for Thursday at 09:00, see you then."],
    ['pt', 'Ficou marcada a sua reunião para quinta-feira às 09:00.'],
    ['es', 'Queda confirmada su cita para el jueves a las 09:00.'],
  ]) {
    chk(`BROKEN (${lang}): "you're booked for Thursday 09:00", no event -> violated`, violated(run({ textSent: text }), '2'));
    chk(`BROKEN (${lang}): the same claim on a DECLINED turn -> violated`, violated(declined(text, W09), '2'));
    chk(`BROKEN (${lang}): the same claim under a failed create -> violated`, violated(run({ textSent: text, bookingSlot: W09, bookingResult: 'failed', bookedEventId: null }), '2'));
  }
}

console.log('\ninvariant 3 -- a booking on the row has an event behind it');
{
  const rowB = { qualification: { booking: Object.assign({ event_id: 'e1' }, MON) } };
  const stale = run({ row: rowB, bookingCheck: 'none' });
  chk('BROKEN: booking on the row, nothing verified it this turn -> violated', violated(stale, '3'), stale.detail['3'].reason);
  const retiredStill = run({ row: rowB, bookingIntent: 'none', bookingCheck: 'cancelled', bookingRetired: Object.assign({ event_id: 'e1' }, MON) });
  chk('BROKEN: retired this turn but still on the row -> violated', violated(retiredStill, '3') && retiredStill.detail['3'].reason === 'retired_but_still_on_row');
  const verified = run({ row: rowB, bookingIntent: 'already_booked', existingBooking: Object.assign({ event_id: 'e1' }, MON), bookingCheck: 'confirmed' });
  chk('PASS: verified this turn -> holds', !violated(verified, '3'));
  const created = run({ row: { qualification: { booking: Object.assign({ event_id: 'e9' }, MON) } }, bookingResult: 'created', bookedEventId: 'e9', bookingSlot: MON });
  chk('PASS: created this turn -> holds', !violated(created, '3'));
  const unread = run({ row: rowB, bookingIntent: 'already_booked', existingBooking: Object.assign({ event_id: 'e1' }, MON), bookingCheck: 'unreadable' });
  chk('UNVERIFIED: calendar unreadable -> unverified, not violated', unverified(unread, '3') && !violated(unread, '3'));
  chk('PASS: no booking on the row -> nothing to check', !violated(run({}), '3'));
}

console.log('\ninvariant 3b -- an event created this turn is on the row');
{
  const writeFailed = run({ bookingResult: 'created', bookedEventId: 'e9', bookingSlot: MON, leadUpdateOk: false, row: { qualification: {} } });
  chk('BROKEN: event created, row write failed -> violated', violated(writeFailed, '3b') && writeFailed.detail['3b'].reason === 'row_write_failed');
  const replay = run({ bookingResult: 'duplicate_replay', bookedEventId: 'e9', bookingSlot: MON, row: { qualification: {} } });
  chk('BROKEN: our own event already in the diary, row never learned -> violated', violated(replay, '3b') && replay.detail['3b'].reason === 'row_lacks_booking');
  const ok = run({ bookingResult: 'created', bookedEventId: 'e9', bookingSlot: MON, row: { qualification: { booking: Object.assign({ event_id: 'e9' }, MON) } } });
  chk('PASS: created and on the row -> holds', !violated(ok, '3b'));
  chk('PASS: nothing created -> nothing to check', !violated(run({ bookingResult: 'slot_taken' }), '3b'));
}

console.log('\ninvariant 5 -- a stated fact is on the row');
{
  const stated = { full_name: 'João Ferreira', budget_min: 1200000, budget_max: 1500000, qualification: { name_source: 'stated' } };
  const john = run({ textSent: 'Hi John, thanks for the details.', row: stated });
  chk('BROKEN (12 Sep): "Hi John", row holds João -> violated', violated(john, '5') && john.detail['5'].name.used === 'John');
  chk('PASS: "Olá João" -> holds', !violated(run({ textSent: 'Olá João, obrigado.', row: stated }), '5'));
  chk('PASS: the agent\'s own name in address position -> holds', !violated(run({ textSent: 'Thanks, Marco!', row: stated }), '5'));
  const profile = run({ textSent: 'Hi John, thanks.', row: { full_name: 'John F', qualification: { name_source: 'profile' } } });
  chk('PASS: a profile name is not a fact, nothing checked', !violated(profile, '5'));

  const rejectedEcho = run({ textSent: 'Registei o seu orçamento máximo de 1.100.000€.', row: stated, rejectedBudgets: [1100000], parsedBudget: { min: null, max: null } });
  chk('BROKEN (11 Sep): "€1.1M recorded", the parser rejected it -> violated', violated(rejectedEcho, '5') && rejectedEcho.detail['5'].reasons.indexOf('money_rejected_stated') !== -1);
  const collapsed = run({ textSent: 'Perfeito, fica registado 1,1 milhões como máximo.', row: stated, parsedBudget: { min: 1200000, max: 1100000 } });
  chk('BROKEN: the model returned a budget, the reply states a figure the row does not hold -> violated', violated(collapsed, '5') && collapsed.detail['5'].reasons.indexOf('money_not_on_row') !== -1);
  const onRow = run({ textSent: 'Registei entre 1,2 e 1,5 milhões.', row: stated, parsedBudget: { min: 1200000, max: 1500000 } });
  chk('PASS: the stated range is on the row -> holds', !violated(onRow, '5'));
  const listing = run({ textSent: 'Temos um T3 em Cascais por 850.000€.', row: stated, parsedBudget: { min: null, max: null } });
  chk('PASS: a figure with no budget parsed this turn is recorded, not alerted', !violated(listing, '5') && listing.detail['5'].money.unattributed === true);
  const small = run({ textSent: 'Um orçamento de 500 euros não chega para comprar em Cascais.', row: stated, rejectedBudgets: [500], parsedBudget: { min: null, max: null } });
  chk('BROKEN: a rejected 500 echoed back -> violated', violated(small, '5'));
}

console.log('\ninvariant 4 -- a lead who sent a message was answered, or the silence was deliberate');
{
  const r = (payload, error_type) => checkDelivery({ status: 'success', error_type: error_type || null, payload });
  const handoffLost = r({ checkpoint: 'B3', escalated: true, handoff_sent: false, operator_notified: true });
  chk('BROKEN (the live gap): handoff not sent, operator notified, run logged success -> violated', violated(handoffLost, '4') && handoffLost.detail['4'].reason === 'nothing_sent');
  const sendFailed = r({ checkpoint: 'B1', twilio_sid: null, outbound_row_status: 201 }, 'whatsapp_send_failed');
  chk('BROKEN: the reply send failed -> violated', violated(sendFailed, '4'));
  const notStored = r({ checkpoint: 'B1', twilio_sid: 'SM1', outbound_row_status: 401 });
  chk('BROKEN: sent, but the outbound row was refused -> violated (sent_not_stored)', violated(notStored, '4') && notStored.detail['4'].reason === 'sent_not_stored');
  chk('PASS: reply sent and stored -> holds', !violated(r({ checkpoint: 'B1', twilio_sid: 'SM1', outbound_row_status: 201 }), '4'));
  chk('PASS: handoff sent -> holds', !violated(r({ checkpoint: 'B3', escalated: true, handoff_sent: true, operator_notified: false }), '4'));
  chk('PASS: escalated lead, deliberate silence flagged -> holds', !violated(r({ checkpoint: 'B3', silenced_escalated_lead: true, sent_to_lead: false }), '4'));
  chk('PASS: duplicate delivery flagged -> holds', !violated(r({ checkpoint: 'B1', duplicate_delivery: true, sent_to_lead: false }), '4'));
  chk('PASS: media reply sent -> holds', !violated(r({ checkpoint: 'D3', non_text: true }), '4'));
  chk('BROKEN: media reply failed -> violated', violated(r({ checkpoint: 'D3', non_text: true }, 'media_reply_send_failed'), '4'));
  const unknown = r({ checkpoint: 'Z9' });
  chk('UNVERIFIED: a payload shape the check does not know -> unverified, not violated', unverified(unknown, '4') && !violated(unknown, '4'));
}

console.log('\nrecording');
{
  const res = run({ textSent: 'Hi John, I have Tuesday at 15:00.', row: { full_name: 'João Ferreira', qualification: { name_source: 'stated' } } });
  const rows = invariantEventRows(res, { clientId: 'c1', leadId: 'l1', from: '+351900000000', stage: 'pre_send', sentKind: 'reply', textSent: 'Hi John, I have Tuesday at 15:00.' });
  chk('one event row per violated invariant', rows.length === 2 && rows.every(r => r.type === 'invariant.violated'));
  chk('severity: 1 warning, 5 warning', rows.every(r => r.severity === 'warning'));
  chk('the row names the invariant, the lead and the text sent', rows[0].data.invariant === '1' && rows[0].data.lead_id === 'l1' && rows[0].data.text_sent.indexOf('15:00') !== -1);
  const crit = invariantEventRows(mergeInvariantResults(res, checkDelivery({ payload: { handoff_sent: false } })), { stage: 'run_end' });
  chk('4 is critical', crit.find(r => r.data.invariant === '4').severity === 'critical');
  const body = invariantAlertBody(res, { from: '+351900000000', stage: 'pre_send' });
  chk('the alert names each violation on its own line', body.split('\n').length === 4 && body.indexOf('15:00') !== -1 && body.indexOf('John') !== -1);
  chk('no alert when nothing fired', invariantAlertBody(run({ textSent: 'Olá!' }), { stage: 'pre_send' }) === null);
  // A sent message carries a disclosure decision since 16 Sep (EU AI Act Art. 50).
  // Omitting the block is not "no opinion": checkDelivery reads a lead-facing send
  // with no decision recorded as a path somebody forgot to wire, and says so.
  const DISC_OK = { required: false, reason: null, ever_before: true, last_origin: 'ai' };
  const merged = mergeInvariantResults(res, checkDelivery({ payload: { twilio_sid: 'SM1', outbound_row_status: 201, disclosure: DISC_OK } }));
  chk('merged results list every check once', same(merged.checked, ['1', '2', '3', '3b', '5', '4', '6']) && same(merged.violated, ['1', '5']));
  const unwired = checkDelivery({ payload: { twilio_sid: 'SM1', outbound_row_status: 201 } });
  chk('a send with no disclosure decision recorded violates 6', unwired.violated.indexOf('6') !== -1 && unwired.detail['6'].reason === 'disclosure_not_recorded');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
