#!/usr/bin/env node
// Unit tests for the PrepRunEscalated node: what an escalated run's row says.
//
// Loads the node's code out of the SHIPPING workflow, not a copy, so it cannot
// drift from what n8n runs. Upstream nodes are stubbed through `$()`, and a
// stub that is absent throws, exactly as n8n does for a node that did not
// execute (AfterEmailAlert, on every run where the WhatsApp notify worked).
//
//   node tests/prep_run_escalated.test.js
//   WORKFLOW=path/to/other.json node tests/prep_run_escalated.test.js
//
// THE DEFECT (remaining-defects-session-2, 16 Sep 2026): a run where
// SendHandoffNote FAILED but NotifyOperator succeeded was written as
// status='success', with handoff_sent:false buried in the payload. The lead who
// asked for a human heard nothing and the row said all was well. Invariant 4
// caught it, but the run row did not.
const fs = require('fs');
const path = require('path');
const WF = process.env.WORKFLOW || path.join(__dirname, '..', 'workflows', 'ryvoInboundConc01.json');
let w = JSON.parse(fs.readFileSync(WF, 'utf8'));
w = Array.isArray(w) ? w[0] : w;
const node = w.nodes.find(n => n.name === 'PrepRunEscalated');
if (!node) { console.error('PrepRunEscalated not found in ' + WF); process.exit(2); }
const body = node.parameters.jsCode;

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };

function runNode({ handoffOk, notifyOk = true, reasons = ['lead_asked_for_human'], emailAlert = undefined }) {
  const notify = {
    clientAutomationId: 'ca-1', startedAt: '2026-09-21T10:00:00.000Z',
    escalationReasons: reasons, escalationReason: reasons.join(','),
    notifyOk, notifyErrorCode: notifyOk ? null : 63016, notifyErrorMessage: notifyOk ? null : 'outside window',
    handoffErrorCode: handoffOk === true ? null : 21211, handoffLang: 'pt', modelUsed: 'm', durationMs: 5,
  };
  if (handoffOk !== undefined) notify.handoffOk = handoffOk;
  const stubs = {
    AfterBooking: { disclosure: null },
    AfterNotify: notify,
    AfterLeadUpdate: { stageAfter: 'qualified', changed: [], leadUpdateOk: true },
  };
  if (emailAlert) stubs.AfterEmailAlert = emailAlert;
  const $ = name => {
    if (!(name in stubs)) throw new Error(`Node '${name}' hasn't been executed`);
    return { first: () => ({ json: stubs[name] }) };
  };
  const $input = { first: () => ({ json: { statusCode: 201 } }) };
  return new Function('$', '$input', body)($, $input)[0].json.run;
}

console.log('\nthe defect, kept as a permanent case');
{
  const r = runNode({ handoffOk: false, notifyOk: true });
  chk('BROKEN (the live gap): handoff failed, operator notified -> the run is an ERROR',
      r.status === 'error' && r.error_type === 'handoff_send_failed', `status=${r.status} error_type=${r.error_type}`);
  chk('  and the payload still says handoff_sent:false, which invariant 4 reads',
      r.payload.handoff_sent === false);
  chk('  and the message says the lead was not told, and that the operator was',
      /lead not told/.test(r.error_message) && /operator notified/.test(r.error_message), r.error_message);
}

console.log('\nthe resting case: a successful handoff is still a success');
{
  const r = runNode({ handoffOk: true, notifyOk: true });
  chk('handoff sent, operator notified, a person was asked for -> success, no error_type',
      r.status === 'success' && r.error_type === null && r.error_message === null, `status=${r.status} error_type=${r.error_type}`);
  chk('  handoff_sent:true in the payload', r.payload.handoff_sent === true);
}

console.log('\nprecedence, and the cases that were already errors');
{
  const both = runNode({ handoffOk: false, notifyOk: false });
  chk('handoff AND notify failed -> handoff_send_failed, message names both',
      both.error_type === 'handoff_send_failed' && /operator ALSO not reached/.test(both.error_message), both.error_message);
  const sys = runNode({ handoffOk: false, reasons: ['claude_failed:api_error'] });
  chk('handoff failed during a model outage -> handoff_send_failed; the outage stays in the payload',
      sys.error_type === 'handoff_send_failed' && sys.payload.system_failure === true);
  const n = runNode({ handoffOk: true, notifyOk: false });
  chk('UNCHANGED: handoff ok, notify failed -> escalation_notify_failed',
      n.status === 'error' && n.error_type === 'escalation_notify_failed' && /^operator not reached/.test(n.error_message), n.error_type);
  const s = runNode({ handoffOk: true, reasons: ['claude_failed:api_error'] });
  chk('UNCHANGED: handoff ok, model outage -> the system reason',
      s.status === 'error' && s.error_type === 'claude_failed:api_error', s.error_type);
}

console.log('\nmissing evidence is not a delivery');
{
  const r = runNode({ handoffOk: undefined });
  chk('handoffOk absent -> error, matching invariant 4 (handoff_sent === true or nothing was sent)',
      r.status === 'error' && r.error_type === 'handoff_send_failed', `status=${r.status}`);
}

console.log('\na lost race is not a system failure; a failed calendar still is (22 Sep 2026)');
{
  // The booking gate, 21 Sep: four in four races wrote the loser's run as an
  // error, with system_failure:true, although the calendar had done its job.
  const race = runNode({ handoffOk: true, reasons: ['booking_lost_race:slot_taken_since_offer'] });
  chk('a lost race (the re-check) -> not an error, not a system failure',
      race.status !== 'error' && race.payload.system_failure === false, `status=${race.status} system_failure=${race.payload.system_failure}`);
  const r409 = runNode({ handoffOk: true, reasons: ['booking_lost_race:another lead confirmed this slot first (409)'] });
  chk('a lost race (Google\'s 409) -> not an error', r409.status !== 'error' && r409.payload.system_failure === false, `status=${r409.status}`);
  for (const reason of ['booking_failed:failed:create_http_500:backend error', 'booking_failed:recheck_failed:freebusy_http_503', 'booking_failed:conflict_burned_id:the identifier for this slot belongs to a deleted event']) {
    const r = runNode({ handoffOk: true, reasons: [reason] });
    chk(`a failed calendar is still an error: ${reason.split(':')[1]}`, r.status === 'error' && r.payload.system_failure === true, `status=${r.status}`);
  }
}

console.log('\nevery run records its model calls (22 Sep 2026, Defect D)');
{
  const r = runNode({ handoffOk: true, reasons: ['needs_human'] });
  chk('payload.model_calls is present and a list (empty here: no model node ran in the stub)', Array.isArray(r.payload.model_calls), JSON.stringify(r.payload.model_calls));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
