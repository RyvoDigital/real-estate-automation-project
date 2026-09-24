#!/usr/bin/env node
// A lost slot as the WORKFLOW runs it: LostSlotCheck, LostSlotReoffer, AfterBooking,
// the parsers' time rule and MergeLeadFields' stored offer, each node's own jsCode
// executed against mocked n8n inputs. tests/lost_slot.test.js proves the module;
// this proves the nodes feed it the right things and send what it decides.
//
//   node tests/lost_slot_nodes.test.js
//   WORKFLOW=path/to/other.json node tests/lost_slot_nodes.test.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { DateTime } = require(path.join(ROOT, 'cockpit', 'node_modules', 'luxon'));
const WF = process.env.WORKFLOW || path.join(ROOT, 'workflows', 'ryvoInboundConc01.json');
let w = JSON.parse(fs.readFileSync(WF, 'utf8'));
w = Array.isArray(w) ? w[0] : w;
const node = name => w.nodes.find(n => n.name === name);

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d && !c ? '  ' + d : ''}`); };

const mock = (fx, input) => {
  const $ = (name) => {
    if (!(name in fx)) throw new Error(`Referenced node is unexecuted: ${name}`);
    return { first: () => ({ json: fx[name] }) };
  };
  return { $, $input: { first: () => ({ json: input }) } };
};
const run = (name, fx, input) => {
  const m = mock(fx, input);
  return new Function('$', '$input', 'DateTime', node(name).parameters.jsCode)(m.$, m.$input, DateTime)[0].json;
};

const Z = 'Europe/Lisbon';
const NOW = DateTime.utc().startOf('hour');
const iso = (h) => NOW.plus({ hours: h }).toISO();
const SLOT = (h) => ({ startUtc: iso(h), endUtc: iso(h + 1), startLocal: DateTime.fromISO(iso(h)).setZone(Z).toISO(), zone: Z });
const LOST = SLOT(50);
const CFG = { timezone: Z, calendar_id: 'gate@cal', default_language: 'pt', agent_name: 'Sofia', agency_name: 'Gate',
              working_hours: { start: '00:00', end: '23:59', days: [1, 2, 3, 4, 5, 6, 7] }, min_hours_notice: 24, booking_window_days: 14 };
const base = (over) => Object.assign({
  AfterLead: { config: CFG, body: 'Sexta às 16:00', priorQualification: {}, clientName: 'Gate' },
  BuildClaudeRequest: { leadLang: 'pt', leadPriorInbound: [] },
  ReadDisclosureState: { statusCode: 200, body: [{ created_at: '2026-09-24T10:00:00Z', disclosure: { v: 1 } }] },
  LoadHistory: { statusCode: 200, body: [] },
}, over || {});
const FRESH = (remaining, ok = true) => ({ readOk: ok, error: ok ? null : 'freebusy_http_500', status: ok ? 200 : 500,
                                          busyCount: 1, readAt: NOW.toISO(), remaining });

// ---------------------------------------------------------------------------
console.log('\nLostSlotCheck marks the two paths, and nothing else');
const seqItem = { bookingIntent: 'taken', bookingSlot: LOST, escalating: false, bookingBranch: 'not_attempted', replyText: '{{LOST_SLOT}}', leadLang: 'pt' };
chk('sequential', run('LostSlotCheck', {}, seqItem).lostSlotPath === 'sequential');
chk('race (409, another lead)', run('LostSlotCheck', {}, { bookingBranch: 'conflict_resolved', httpStatus: 409, conflict: 'other' }).lostSlotPath === 'race');
chk('a created booking is not a loss', run('LostSlotCheck', {}, { bookingBranch: 'create_attempted', httpStatus: 200 }).lostSlotPath === null);
chk('the item passes through untouched', run('LostSlotCheck', {}, seqItem).replyText === '{{LOST_SLOT}}');

console.log('\nLostSlotReoffer: the slots from a calendar read taken NOW');
const fbRes = (busy, code = 200) => ({ statusCode: code, body: { calendars: { 'gate@cal': { busy } } } });
let r = run('LostSlotReoffer', { LostSlotCheck: Object.assign({}, seqItem, { lostSlotPath: 'sequential' }), AfterLead: { config: CFG } },
            fbRes([{ start: LOST.startUtc, end: LOST.endUtc }]));
chk('a successful read yields remaining slots', r.lostSlotFresh.readOk === true && r.lostSlotFresh.remaining.length === 3, JSON.stringify(r.lostSlotFresh).slice(0, 200));
chk('the lost slot is never among them', !r.lostSlotFresh.remaining.some(s => s.startUtc === LOST.startUtc));
chk('the notice period holds (the same checks as any offer)', r.lostSlotFresh.remaining.every(s => DateTime.fromISO(s.startUtc) >= NOW.plus({ hours: 24 })));
const remainingFromRead = r.lostSlotFresh.remaining;
r = run('LostSlotReoffer', { LostSlotCheck: seqItem, AfterLead: { config: CFG } }, fbRes([], 500));
chk('a failed read yields NOTHING (no fallback to the earlier offer)', r.lostSlotFresh.readOk === false && r.lostSlotFresh.remaining.length === 0);

// ---------------------------------------------------------------------------
console.log('\nAfterBooking, sequential: re-offered with the template, never the model\'s sentence');
let o = run('AfterBooking', base(), Object.assign({}, seqItem, { lostSlotFresh: FRESH(remainingFromRead) }));
chk('re-offered, not escalated', o.lostSlot.outcome === 'reoffer' && o.escalating === false, JSON.stringify(o.lostSlot).slice(0, 200));
chk('the text sent is the Portuguese template', /^Esse horário acabou de ser reservado por outra pessoa\. Ainda temos /.test(o.sendBody), o.sendBody);
chk('replyText (what the invariants read) is the same sentence', o.replyText === o.lostSlot.text && o.sendBody.endsWith(o.replyText));
chk('it lists exactly the fresh read\'s slots', o.lostSlot.offer.map(s => s.startUtc).join() === remainingFromRead.map(s => s.startUtc).join());

console.log('\nSABOTAGE: the model writes its own lost-race sentence; the template still wins');
const GATE_24_SEP = 'Peço desculpa, João, mas esse horário das 16:00 não está correto da minha parte - as opções disponíveis são sábado às 17:00.';
o = run('AfterBooking', base(), Object.assign({}, seqItem, { replyText: GATE_24_SEP, lostSlotFresh: FRESH(remainingFromRead) }));
chk('what goes out is the template alone', o.sendBody === o.lostSlot.text && /^Esse horário acabou/.test(o.sendBody), o.sendBody);
chk('... not a word of the apology', !/desculpa|correto/.test(o.sendBody));
chk('... and a warning is recorded', o.lostSlot.warnings.includes('lost_slot_prose_named_a_time') && o.lostSlot.prose_used === false);

console.log('\nno loop: the second loss in a row hands over, with the card');
o = run('AfterBooking', base({ AfterLead: { config: CFG, body: 'x', priorQualification: { lost_slot_streak: 1 } } }),
        Object.assign({}, seqItem, { lostSlotFresh: FRESH(remainingFromRead) }));
chk('escalated, although slots were left', o.escalating === true && o.lostSlot.detail === 'second_in_a_row');
chk('reason booking_lost_race:second_in_a_row', (o.escalationReasons || []).includes('booking_lost_race:second_in_a_row'), JSON.stringify(o.escalationReasons));
chk('the handoff is the system\'s sentence', o.handoffBody === o.lostSlot.text && /também acabou de ser reservado/.test(o.handoffBody), o.handoffBody);
o = run('AfterBooking', base(), Object.assign({}, seqItem, { lostSlotFresh: FRESH([], false) }));
chk('a failed calendar read hands over (none_left), never re-offers old slots', o.escalating === true && o.lostSlot.detail === 'none_left');

console.log('\nAfterBooking, race: the confirmation the model wrote is discarded');
const raceItem = { bookingIntent: 'confirm', bookingSlot: LOST, bookReady: true, escalating: false, escalationReasons: [],
                   bookingBranch: 'conflict_resolved', httpStatus: 409, conflict: 'other', httpBody: {},
                   replyText: 'Confirmado! A sua reunião está marcada para sexta às 16:00.', leadLang: 'en' };
o = run('AfterBooking', base({ BuildClaudeRequest: { leadLang: 'en', leadPriorInbound: [] } }), Object.assign({}, raceItem, { lostSlotFresh: FRESH(remainingFromRead) }));
chk('race, slots left: re-offered, NOT escalated (was: always a hand-over)', o.lostSlot.path === 'race' && o.lostSlot.outcome === 'reoffer' && o.escalating === false,
    JSON.stringify({ ls: o.lostSlot && o.lostSlot.outcome, esc: o.escalating, r: o.escalationReasons }));
chk('no booking_lost_race reason left behind', !(o.escalationReasons || []).some(x => /booking_lost_race/.test(x)));
chk('the English template, never the model\'s "Confirmado"', /^That time has just been taken by someone else\./.test(o.replyText) && !/Confirmado/.test(o.sendBody), o.sendBody);
o = run('AfterBooking', base(), Object.assign({}, raceItem, { lostSlotFresh: FRESH([]) }));
chk('race, nothing left: handed over (none_left)', o.escalating === true && (o.escalationReasons || []).includes('booking_lost_race:none_left'));

// ---------------------------------------------------------------------------
console.log('\nthe parsers: a time in the prose is not a rejection on a lost-slot turn');
for (const n of ['ParseClaude', 'ParseGuardRetry']) {
  const c = node(n).parameters.jsCode;
  chk(`${n}: the invented-time rejection skips 'taken'`, c.includes("if (invented.length && b.bookingIntent !== 'taken') {"));
}
for (const n of ['ParseClaude', 'ParseGuardRetry'])
  chk(`${n}: judges a lost-slot reply as sent (the 24 Sep gate: "{{LOST_SLOT}}" alone was rejected as too short)`,
    node(n).parameters.jsCode.includes("const shape = checkReplyShape(p, { lostSlot: b.bookingIntent === 'taken' });"));
chk('the prompt no longer says "apologise"', !/Apologise plainly, say it has just gone/.test(node('BuildClaudeRequest').parameters.jsCode));
chk('the prompt asks for the placeholder', node('BuildClaudeRequest').parameters.jsCode.includes("'{{LOST_SLOT}}'"));

console.log('\nthe parsers, run for real on the replies the 24 Sep gate rejected (every lost slot became bad_reply_twice)');
{
  const S = (d) => ({ startUtc: `2026-10-0${d}T08:00:00.000Z`, endUtc: `2026-10-0${d}T09:00:00.000Z`, startLocal: `2026-10-0${d}T09:00:00.000+01:00`,
                      zone: Z, timeLocal: '09:00', dateLocal: `2026-10-0${d}` });
  const B = (intent) => ({ bookingIntent: intent, bookingSlot: S(1), slots: [S(2), S(3)], slotLines: ['x'], body: 'Quinta às 09:00, por favor',
    priorLead: { full_name: 'João' }, statedName: 'João', leadLang: 'pt', config: { agent_name: 'Sofia', agency_name: 'Gate', areas: ['Cascais'] },
    claudeBody: { system: 's', messages: [] }, claudeStartedAt: new Date().toISOString(), appointmentKind: 'meeting', propertyRefs: [] });
  const parse = (nodeName, reply, intent) => {
    const parsed = { reply, lead_type: 'buyer', full_name: 'João', budget_min: null, budget_max: null, timeline: null, area: 'Cascais',
      qualification_notes: { financing: null, bedrooms: 3, purpose: null }, stage: 'qualified', intent: 'booking', wants_booking: true,
      proposed_times: [], needs_human: false, escalation_reason: null, escalation_kind: null };
    const res = { statusCode: 200, body: { content: [{ type: 'text', text: JSON.stringify(parsed) }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } };
    const b = B(intent);
    const fx = { BuildClaudeRequest: b, DecideEscalation: b, CallClaudeGuardRetry: res, IsRetryableReply: Object.assign({}, b, { retryBody: b.claudeBody }) };
    return run(nodeName, fx, res);
  };
  for (const n of ['ParseClaude', 'ParseGuardRetry']) {
    let j;
    try { j = parse(n, '{{LOST_SLOT}}', 'taken'); } catch (e) { j = { ok: false, errorMessage: 'threw: ' + e.message }; }
    chk(`${n}: "{{LOST_SLOT}}" alone on a lost-slot turn is accepted`, j.ok === true, j.errorMessage);
    try { j = parse(n, 'Olá João! {{LOST_SLOT}}', 'taken'); } catch (e) { j = { ok: false, errorMessage: 'threw: ' + e.message }; }
    chk(`${n}: prose around it is accepted`, j.ok === true, j.errorMessage);
    try { j = parse(n, '{{LOST_SLOT}}', 'none'); } catch (e) { j = { ok: true, errorMessage: 'threw: ' + e.message }; }
    chk(`${n}: the same text on any other turn is still rejected`, j.ok === false, j.errorMessage);
  }
}

console.log('\nwiring');
const outs = (n, i) => ((w.connections[n] || {}).main || [])[i] || [];
for (const n of ['SkipBooking', 'BlockedBooking', 'ResolveConflict'])
  chk(`${n} -> LostSlotCheck`, outs(n, 0).some(c => c.node === 'LostSlotCheck') && !outs(n, 0).some(c => c.node === 'AfterBooking'));
chk('IsConflict (created) -> LostSlotCheck', outs('IsConflict', 1).some(c => c.node === 'LostSlotCheck'));
chk('IsSlotLost: yes -> the fresh read, no -> AfterBooking', outs('IsSlotLost', 0).some(c => c.node === 'LostSlotFreeBusy') && outs('IsSlotLost', 1).some(c => c.node === 'AfterBooking'));
chk('LostSlotFreeBusy -> LostSlotReoffer -> AfterBooking', outs('LostSlotFreeBusy', 0).some(c => c.node === 'LostSlotReoffer') && outs('LostSlotReoffer', 0).some(c => c.node === 'AfterBooking'));
chk('LostSlotFreeBusy asks Google exactly as QueryFreeBusy does', JSON.stringify(node('LostSlotFreeBusy').parameters) === JSON.stringify(node('QueryFreeBusy').parameters));
chk('LostSlotFreeBusy survives its own error (a failed read hands over)', node('LostSlotFreeBusy').onError === 'continueRegularOutput');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
