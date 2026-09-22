#!/usr/bin/env node
// Unit tests for src/model_calls.js. Loads the SHIPPING source.
//
//   node tests/model_calls.test.js
const fs = require('fs');
const path = require('path');
eval(fs.readFileSync(process.env.MODEL_CALLS_SRC || path.join(__dirname, '..', 'src', 'model_calls.js'), 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };
const stub = (nodes) => (name) => { if (!(name in nodes)) throw new Error(`Node '${name}' hasn't been executed`); return nodes[name]; };

const resp = (text, stop, out, think) => ({ statusCode: 200, body: {
  stop_reason: stop, model: 'claude-sonnet-5',
  usage: { input_tokens: 5436, output_tokens: out, output_tokens_details: { thinking_tokens: think } },
  content: [{ type: 'thinking', thinking: '…' }, { type: 'text', text }] } });
const REQ = { model: 'claude-sonnet-5', max_tokens: 1024, system: 'x'.repeat(12950), messages: [{}, {}, {}] };

console.log('\nthe Defect D shape: the first attempt degenerated and was delivered');
{
  const r = modelCallsRecord(stub({
    ParseClaude: { ok: true, claudeBody: REQ },
    CallClaude: resp('{"reply":" only be2509:00 …"}', 'end_turn', 405, 30),
  }));
  chk('one record, for the first call', Array.isArray(r) && r.length === 1 && r[0].call === 'first', JSON.stringify(r));
  chk('  stop_reason, output and thinking tokens, text length', r[0].stop_reason === 'end_turn' && r[0].output_tokens === 405 && r[0].thinking_tokens === 30 && r[0].text_chars > 0);
  chk('  the request shape: 3 messages, 12950-char system, max_tokens 1024', r[0].request.messages === 3 && r[0].request.system_chars === 12950 && r[0].request.max_tokens === 1024, JSON.stringify(r[0].request));
  chk('  not rejected', r[0].rejected === null);
}

console.log('\na rejected first attempt and its retry: both recorded, the rejection kept');
{
  const r = modelCallsRecord(stub({
    ParseClaude: { ok: false, errorMessage: 'reply named times the workflow never supplied: 11:00', claudeBody: REQ, retryBody: Object.assign({}, REQ, { messages: [{}, {}, {}, {}, {}] }) },
    CallClaude: resp('{"reply":"11:00 isn\'t on the calendar"}', 'end_turn', 302, 22),
    ParseGuardRetry: { ok: true },
    CallClaudeGuardRetry: resp('{"reply":"11:00 isn\'t available"}', 'end_turn', 305, 13),
  }));
  chk('two records, first then retry', r.length === 2 && r[0].call === 'first' && r[1].call === 'retry', JSON.stringify(r.map(x => x.call)));
  chk('  the first call says why it was rejected', /never supplied: 11:00/.test(r[0].rejected || ''), r[0].rejected);
  chk('  the retry records its own request (5 messages)', r[1].request.messages === 5, JSON.stringify(r[1].request));
  chk('  and was not rejected', r[1].rejected === null);
}

console.log('\nnever throws: a node that did not run, or a malformed body');
{
  const none = modelCallsRecord(stub({}));
  chk('no model call this turn (the media path) -> an empty list, not an error', Array.isArray(none) && none.length === 0, JSON.stringify(none));
  const weird = modelCallsRecord(stub({ ParseClaude: null, CallClaude: { body: 'not json' } }));
  chk('a string body -> a record with nulls, not a throw', Array.isArray(weird), JSON.stringify(weird));
  const thrower = modelCallsRecord(() => { throw new Error('boom'); });
  chk('a getter that always throws -> an empty list', Array.isArray(thrower) && thrower.length === 0, JSON.stringify(thrower));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
