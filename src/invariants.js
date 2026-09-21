// ============================================================================
// The five invariants — shared source. Embedded verbatim into AssertInvariants
// (1, 2, 3, 3b, 5: before the send, on the row as the database returned it)
// and AssertDelivery (4: at the end of every run), after booking_claim.js,
// booking_stated.js and reply_name.js, whose detectors it reuses. Unit-tested
// standalone in tests/invariants.test.js, which loads THIS file.
//
// WHY THIS EXISTS  (improvements §0.2, §3.11)
// Every defect of 11–14 September 2026 was one shape: the reply asserted
// something the row did not hold. A guard catches the shape it was written
// for. An invariant is a property that must hold after every run whatever the
// shape, so a violation surfaces whether or not anyone anticipated it:
//
//   1  a time named in the text sent is in an offer the row holds
//   2  a booking confirmed in the text sent has a calendar event behind it
//   3  a booking on the row has a calendar event behind it
//   3b an event created this turn is on the row (the reverse of 3, and worse:
//      the lead is offered times again while a meeting sits in the diary)
//   4  a lead who sent a message was answered, or the silence was deliberate
//   5  a fact stated about the lead is on the row -- narrowed to the facts
//      that can be read deterministically: the name in direct address, money
//      amounts, and (via 1 and 2) the appointment time
//   6  a lead-facing message sent before any disclosure was on record actually
//      CARRIED the AI disclosure (EU AI Act Art. 50; src/ai_disclosure.js)
//
// POSTURE
// These checks OBSERVE. They never block the send and never change the text;
// the guards upstream are the gates, and any invariant firing before the send
// is by definition a guard miss worth knowing about. A violation is an event
// row, a WhatsApp to the operator and a block in the run payload. The text
// under test is the text the lead RECEIVES -- the handoff note on the
// escalation path, not the model's discarded reply -- because checking a
// draft nobody was sent is the same class of error these checks exist for.
//
// A check that cannot run says so (`unverified`, or a check error recorded by
// the node) rather than throwing: a check that throws would route into
// CatchInternal and turn a good reply into a handoff.
// ============================================================================

const INVARIANT_SLUGS = {
  '1': 'time_without_offer',
  '2': 'booking_confirmed_without_event',
  '3': 'row_booking_without_event',
  '3b': 'event_without_row_booking',
  '4': 'inbound_without_outbound',
  '5': 'fact_not_on_row',
  '6': 'undisclosed_first_contact',
};
// 2, 3, 3b and 4 are a lead being told, or a diary holding, something untrue
// about their own appointment or being left unanswered. 1 and 5 are form.
// 6 is critical and is the only one that is critical for a legal rather than
// an operational reason: an undisclosed first interaction is an Article 50
// breach, exposure up to EUR 15M or 3% of worldwide turnover.
const INVARIANT_SEVERITY = { '1': 'warning', '2': 'critical', '3': 'critical', '3b': 'critical', '4': 'critical', '5': 'warning', '6': 'critical' };

function deaccentInv(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// timesNamedIn(text) -> ['9:00', '14:30'], normalised H:MM, deduplicated.
// 🔒 ONE RULE, ONE PLACE (2026-09-21): the extraction is src/time_guard.js's
// tgTimesIn(), which the parsers' never-invent guard uses too. Until then this
// file carried its own copy of the regex AND its own times-only rule for
// invariant 1, so when the guard learned that DECLINING the lead's own time is
// not inventing one, invariant 1 did not, and it fired a false alarm on the
// correct reply "11:00 isn't available I'm afraid, João - Thursday morning we
// only have 09:00 or 10:00" (live check 2, 21 Sep). time_guard.js must be
// embedded BEFORE this file.
function timesNamedIn(text) {
  const found = [];
  for (const t of tgTimesIn(text)) if (found.indexOf(t) === -1) found.push(t);
  return found;
}

// hhmmOf(slot) -> 'H:MM' from whichever local string the slot carries. The
// slot engine emits `startLocal`, the stored offer and the booking carry
// `local`, the guard's list carries `timeLocal`.
function hhmmOf(slot) {
  if (!slot) return null;
  const local = String(slot.local || slot.startLocal || '');
  let m = local.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/);
  if (!m) m = String(slot.timeLocal || '').match(/^(\d{1,2}):(\d{2})$/);
  return m ? String(Number(m[1])) + ':' + m[2] : null;
}

// moneyAmountsIn(text) -> EUR amounts the text states, as numbers.
//
// Three shapes, tried in order, each blanked from the text before the next so
// "€1,5M" is read once as 1.5M and not again as €1:
//   1. a figure with a magnitude word: 1,1M · 1.2 million · 800k · 800 mil ·
//      1,2 milhões · 1,5 millones. "120 m²", "2 metros" and "5 min" do not
//      match: the unit must end the word.
//   2. a currency-marked figure: €1.100.000 · 1.100.000,00€ · 500 euros · EUR 500
//   3. a bare figure grouped in thousands with . or , : 800.000 · 1,100,000.
//      Space-grouped bare figures are NOT read -- "933 048 230" is a phone.
function moneyAmountsIn(text) {
  let t = ' ' + deaccentInv(text) + ' ';
  const found = [];
  const push = (n) => { if (Number.isFinite(n) && n > 0 && found.indexOf(n) === -1) found.push(n); };
  const grouped = (s) => Number(String(s).replace(/[.,\s]/g, ''));
  const blank = (rx, fn) => { t = t.replace(rx, (...m) => { fn(m); return ' '.repeat(m[0].length); }); };

  const MULT = { k: 1e3, mil: 1e3, m: 1e6, milhao: 1e6, milhoes: 1e6, millon: 1e6, millones: 1e6, million: 1e6, millions: 1e6 };
  blank(/(?<![\d.,])(\d{1,3}(?:[.,]\d{1,3})?)\s*(milhoes|milhao|millones|millon|millions|million|mil|k|m)(?![\w²])/g,
    (m) => push(parseFloat(m[1].replace(',', '.')) * MULT[m[2]]));
  blank(/(?<![\d.,])(\d{1,3}(?:[.,\s]\d{3})*|\d+)(?:[.,]\d{1,2})?\s*(?:€|euros?(?![\w])|eur(?![\w]))/g,
    (m) => push(grouped(m[1])));
  blank(/(?:€|(?<![\w])eur(?![\w]))\s*(\d{1,3}(?:[.,\s]\d{3})*|\d+)(?:[.,]\d{1,2})?(?![\d.,])/g,
    (m) => push(grouped(m[1])));
  blank(/(?<![\d+.,])(\d{1,3}(?:[.,]\d{3}){1,3})(?![\d.,])/g,
    (m) => push(grouped(m[1])));
  return found;
}

function approxEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) <= Math.max(1, 0.005 * Math.abs(Number(b)));
}

// checkInvariants(ctx) -> { checked, violated, unverified, detail }
//
//   ctx.textSent        the text the lead receives this turn (reply or handoff)
//   ctx.row             the lead row as the database returned it after this
//                       turn's write -- or the row as it was, if the write
//                       failed, which is exactly when 1 and 3b matter
//   ctx.leadUpdateOk    whether the write succeeded
//   ctx.bookingResult / bookedEventId / bookingSlot   AfterBooking
//   ctx.bookingIntent / existingBooking               the verified state
//   ctx.bookingCheck    ResolveBooking: none|confirmed|past|cancelled|missing|unreadable
//   ctx.bookingRetired  the booking retired this turn, if any
//   ctx.rejectedBudgets figures the parser rejected this turn
//   ctx.parsedBudget    { min, max } the model returned this turn
//   ctx.nameAllow       agent name, agency name, configured areas
//   ctx.leadText        the lead's own message this turn (invariant 1's decline exemption)
function checkInvariants(ctx) {
  const out = { checked: [], violated: [], unverified: [], detail: {} };
  const text = String(ctx.textSent || '');
  const row = ctx.row || {};
  const q = row.qualification || {};
  const bookedThisTurn = (ctx.bookingResult === 'created' || ctx.bookingResult === 'duplicate_replay') && !!ctx.bookedEventId;
  const held = ctx.bookingIntent === 'already_booked' && !!ctx.existingBooking;
  const heldVerified = held && ctx.bookingCheck === 'confirmed';
  const heldUnreadable = held && ctx.bookingCheck === 'unreadable';
  const rowBooking = q.booking || null;

  // --- 1: a time named is in an offer the row holds -------------------------
  {
    const named = timesNamedIn(text);
    const allowed = [];
    const add = (s) => { const h = hhmmOf(s); if (h && allowed.indexOf(h) === -1) allowed.push(h); };
    for (const s of (((q.proposed_slots || {}).slots) || [])) add(s);
    if (rowBooking) add(rowBooking);
    for (const s of (q.past_bookings || [])) add(s);
    if (bookedThisTurn && ctx.bookingSlot) add(ctx.bookingSlot);
    if (ctx.existingBooking) add(ctx.existingBooking);
    if (ctx.bookingRetired) add(ctx.bookingRetired);   // the retired note names it
    // The guard's own rule, not a copy of it: a time the lead named may appear
    // in a clause that DECLINES it (src/time_guard.js). Without ctx.leadText
    // there is no exemption, which is the pre-2026-09-21 behaviour.
    const missing = timesNotSupplied(text, allowed.map(h => ({ timeLocal: h })), ctx.leadText);
    out.checked.push('1');
    out.detail['1'] = { named, allowed, missing };
    if (missing.length) out.violated.push('1');
  }

  // --- 2: a booking confirmed in the text has an event behind it ------------
  {
    const claim = bookingClaim(text);
    // The slot matched this turn, whether or not the create then succeeded:
    // a reply stating it under a failed create is the worst output there is.
    const statesNew = !!(ctx.bookingSlot && replyStatesSlot(text, ctx.bookingSlot));
    const statesHeld = held && replyStatesSlot(text, ctx.existingBooking);
    const confirms = !!claim || statesNew || statesHeld;
    out.checked.push('2');
    out.detail['2'] = { confirms, claim, states_new_slot: statesNew, states_held_booking: statesHeld,
                        event_this_turn: bookedThisTurn, held_verified: heldVerified, booking_check: ctx.bookingCheck || 'none' };
    if (confirms && !bookedThisTurn && !heldVerified) {
      if (heldUnreadable) out.unverified.push('2'); else out.violated.push('2');
    }
  }

  // --- 3: a booking on the row has an event behind it -----------------------
  {
    out.checked.push('3');
    if (rowBooking) {
      const id = rowBooking.event_id || null;
      const createdMatch = bookedThisTurn && id === ctx.bookedEventId;
      const verifiedMatch = heldVerified && ctx.existingBooking.event_id === id;
      const unreadableMatch = heldUnreadable && ctx.existingBooking.event_id === id;
      let reason = null;
      if (createdMatch) reason = 'created_this_turn';
      else if (verifiedMatch) reason = 'verified_this_turn';
      else if (unreadableMatch) reason = 'calendar_unreadable';
      else if (ctx.bookingRetired && ctx.bookingRetired.event_id === id) reason = 'retired_but_still_on_row';
      else reason = 'not_verified_this_turn';
      out.detail['3'] = { event_id: id, reason, booking_check: ctx.bookingCheck || 'none' };
      if (reason === 'calendar_unreadable') out.unverified.push('3');
      else if (!createdMatch && !verifiedMatch) out.violated.push('3');
    } else {
      out.detail['3'] = { event_id: null, reason: 'no_booking_on_row' };
    }
  }

  // --- 3b: an event created this turn is on the row -------------------------
  {
    out.checked.push('3b');
    if (bookedThisTurn) {
      const onRow = !!(rowBooking && rowBooking.event_id === ctx.bookedEventId);
      const reason = onRow ? 'on_row' : (ctx.leadUpdateOk === false ? 'row_write_failed' : 'row_lacks_booking');
      out.detail['3b'] = { event_id: ctx.bookedEventId, booking_result: ctx.bookingResult, reason };
      if (!onRow) out.violated.push('3b');
    } else {
      out.detail['3b'] = { event_id: null, booking_result: ctx.bookingResult || null, reason: 'no_event_this_turn' };
    }
  }

  // --- 5: a stated fact is on the row (name, money) -------------------------
  {
    const d = { reasons: [] };
    const stored = q.name_source === 'stated' ? (row.full_name || null) : null;
    const nm = nameMismatch(text, stored, { allow: ctx.nameAllow || [] });
    d.name = { used: nm.used, stored, candidates: nm.candidates };
    if (nm.mismatch) d.reasons.push('name_not_on_row');

    const amounts = moneyAmountsIn(text);
    const rejected = (ctx.rejectedBudgets || []).map(Number);
    const bounds = [row.budget_min, row.budget_max].filter(v => v !== null && v !== undefined).map(Number);
    const pb = ctx.parsedBudget || {};
    const modelReturnedBudget = (pb.min !== null && pb.min !== undefined) || (pb.max !== null && pb.max !== undefined);
    const echoedRejected = amounts.filter(a => rejected.some(r => approxEqual(a, r)));
    const notOnRow = amounts.filter(a => !bounds.some(b => approxEqual(a, b)));
    d.money = { stated: amounts, row: bounds, rejected, model_returned_budget: modelReturnedBudget,
                echoed_rejected: echoedRejected, not_on_row: notOnRow };
    if (echoedRejected.length) d.reasons.push('money_rejected_stated');
    else if (modelReturnedBudget && notOnRow.length) d.reasons.push('money_not_on_row');
    else if (notOnRow.length) d.money.unattributed = true;   // a listing price, perhaps; recorded, not alerted

    out.checked.push('5');
    out.detail['5'] = d;
    if (d.reasons.length) out.violated.push('5');
  }

  return out;
}

// checkDelivery(run) -> { checked: ['4', '6'], violated, unverified, detail }
//
// Reads the run row every PrepRun* node builds, so it sees every path that
// reaches LogRun. Deliberate silence is a FLAG on the payload, never inferred.
function checkDelivery(run) {
  const out = { checked: ['4'], violated: [], unverified: [], detail: {} };
  const p = (run && run.payload) || {};
  const silence = !!(p.silenced_escalated_lead || p.duplicate_delivery);
  let sent = null, how = 'unknown_path';
  if (silence) { sent = false; how = 'deliberate_silence'; }
  else if (Object.prototype.hasOwnProperty.call(p, 'twilio_sid')) { sent = !!p.twilio_sid; how = 'reply'; }
  else if (Object.prototype.hasOwnProperty.call(p, 'handoff_sent')) { sent = p.handoff_sent === true; how = 'handoff'; }
  else if (p.non_text) { sent = (run && run.error_type) !== 'media_reply_send_failed'; how = 'media'; }
  const hasStore = Object.prototype.hasOwnProperty.call(p, 'outbound_row_status');
  const stored = hasStore ? (Number(p.outbound_row_status) >= 200 && Number(p.outbound_row_status) < 300) : null;
  let reason = 'ok';
  if (sent === null) reason = 'unknown_path';
  else if (!sent && !silence) reason = 'nothing_sent';
  else if (sent && stored === false) reason = 'sent_not_stored';
  out.detail['4'] = { sent, how, silence, stored, reason, error_type: (run && run.error_type) || null };
  if (reason === 'unknown_path') out.unverified.push('4');
  else if (reason !== 'ok') out.violated.push('4');

  // --- 6: a first interaction carried the AI disclosure ---------------------
  //
  // EU AI Act Article 50. Everything else about the disclosure records what we
  // INTENDED; this is the check on what reached the wire. The text under test
  // is `payload.disclosure.sent_head` -- the leading segment of the body the
  // PrepRun* node actually handed to Twilio -- read through disclosureIn(),
  // which asks the question the regulation asks rather than comparing against
  // the string we meant to send. A flag set by the sender, verified by the
  // sender, would prove nothing (§0.7).
  //
  // Only checked when a disclosure was REQUIRED and something was actually
  // sent. Required-but-nothing-sent is invariant 4's business, not this one:
  // a lead who received no message was not undisclosed to, they were unanswered.
  out.checked.push('6');
  {
    const disc = p.disclosure || null;
    const outbound = sent === true;
    if (!outbound) {
      out.detail['6'] = { reason: 'nothing_sent', required: disc ? !!disc.required : null };
    } else if (!disc) {
      // A lead-facing path that sends without recording a disclosure decision
      // is a path we forgot to wire. Fail loud: this is exactly the hole that
      // would otherwise stay invisible until an auditor found it.
      out.detail['6'] = { reason: 'disclosure_not_recorded', required: null, how };
      out.violated.push('6');
    } else if (!disc.required) {
      out.detail['6'] = { reason: 'already_disclosed', required: false,
                          ever_before: disc.ever_before === true, last_origin: disc.last_origin || null };
    } else {
      const head = String(disc.sent_head || '');
      const carried = disclosureIn(head);
      out.detail['6'] = { reason: carried ? 'disclosed' : 'required_but_absent',
                          required: true, why: disc.reason || null, lang: disc.lang || null,
                          v: disc.v || null, applied: disc.applied === true,
                          over_limit: disc.over_limit === true,
                          head: head.slice(0, 200) };
      if (!carried) out.violated.push('6');
    }
  }
  return out;
}

function mergeInvariantResults(a, b) {
  const out = { checked: [], violated: [], unverified: [], detail: {} };
  for (const r of [a, b]) {
    if (!r) continue;
    for (const k of ['checked', 'violated', 'unverified']) for (const v of (r[k] || [])) if (out[k].indexOf(v) === -1) out[k].push(v);
    Object.assign(out.detail, r.detail || {});
  }
  return out;
}

// describeViolation(k, detail) -> one line a human reads on the phone.
function describeViolation(k, d) {
  d = d || {};
  if (k === '1') return 'named ' + (d.missing || []).join(', ') + '; offer holds ' + ((d.allowed || []).join(', ') || 'nothing');
  if (k === '2') return 'text confirms a booking (' + (d.claim || 'states the slot') + '); no event this turn, held booking ' + (d.booking_check || 'none');
  if (k === '3') return 'row holds event ' + (d.event_id || '?') + ' (' + (d.reason || '?') + ')';
  if (k === '3b') return 'event ' + (d.event_id || '?') + ' ' + (d.booking_result || 'created') + ', row lacks it (' + (d.reason || '?') + ')';
  if (k === '4') return (d.reason || '?') + ' via ' + (d.how || '?') + (d.error_type ? ' [' + d.error_type + ']' : '');
  if (k === '6') {
    if (d.reason === 'disclosure_not_recorded') return 'sent via ' + (d.how || '?') + ' with NO disclosure decision recorded -- unwired path';
    return 'AI disclosure required (' + (d.why || '?') + ') but not in the text sent: "' + String(d.head || '').slice(0, 80) + '"';
  }
  if (k === '5') {
    const parts = [];
    if ((d.reasons || []).indexOf('name_not_on_row') !== -1) parts.push('name "' + d.name.used + '" used, row holds "' + d.name.stored + '"');
    if ((d.reasons || []).indexOf('money_rejected_stated') !== -1) parts.push('money ' + d.money.echoed_rejected.join(', ') + ' stated, rejected this turn');
    if ((d.reasons || []).indexOf('money_not_on_row') !== -1) parts.push('money ' + d.money.not_on_row.join(', ') + ' stated, row holds ' + (d.money.row.join('-') || 'nothing'));
    return parts.join('; ') || 'fact not on row';
  }
  return JSON.stringify(d).slice(0, 120);
}

// invariantEventRows(res, ctx) -> rows for `events`, one per violated invariant.
function invariantEventRows(res, ctx) {
  const rows = [];
  for (const k of (res.violated || [])) {
    rows.push({
      client_id: ctx.clientId || null,
      type: 'invariant.violated',
      severity: INVARIANT_SEVERITY[k] || 'warning',
      summary: 'Invariant ' + k + ' violated (' + INVARIANT_SLUGS[k] + '): ' + describeViolation(k, res.detail[k]) + ' | ' + (ctx.from || '?'),
      data: { invariant: k, slug: INVARIANT_SLUGS[k], lead_id: ctx.leadId || null, stage: ctx.stage,
              sent_kind: ctx.sentKind || null, escalating: !!ctx.escalating,
              evidence: res.detail[k] || null,
              text_sent: String(ctx.textSent || '').slice(0, 200) },
    });
  }
  return rows;
}

// invariantAlertBody(res, ctx) -> the WhatsApp text, or null when nothing fired.
function invariantAlertBody(res, ctx) {
  if (!res.violated || !res.violated.length) return null;
  const lines = ['Ryvo invariant violated (' + ctx.stage + ')', String(ctx.from || 'unknown lead')];
  for (const k of res.violated) lines.push(k + ' ' + INVARIANT_SLUGS[k] + ': ' + describeViolation(k, res.detail[k]));
  return lines.join('\n').slice(0, 1500);
}
