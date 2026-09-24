#!/usr/bin/env node
// The code n8n runs is the code src/ says it runs.
//
// src/ is the source of record and the workflow carries COPIES, so an edit to a
// src file changes nothing live until it is re-embedded. Two copy styles exist:
//   * between `// >>> EMBED src/x.js >>>` and `// <<< EMBED src/x.js <<<` markers
//     (ai_disclosure.js), where the block must equal the file;
//   * pasted whole with no markers (booking_claim.js, into four nodes), where
//     the node must contain the file verbatim.
// Found 21 Sep 2026, fixing the "quedamos entonces para" miss: the claim guard's
// src file and its four embedded copies can drift apart silently. No check
// compared them, and the unit tests load src/, not the workflow.
//
//   node tests/embeds_current.test.js
//   WORKFLOW=path/to/other.json node tests/embeds_current.test.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const WF = process.env.WORKFLOW || path.join(ROOT, 'workflows', 'ryvoInboundConc01.json');
let w = JSON.parse(fs.readFileSync(WF, 'utf8'));
w = Array.isArray(w) ? w[0] : w;
const code = n => (n.parameters && n.parameters.jsCode) || '';

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };

console.log('\nmarker embeds equal their src file');
let markers = 0;
for (const n of w.nodes) {
  for (const m of code(n).matchAll(/\/\/ >>> EMBED (\S+) >>>\n([\s\S]*?)\/\/ <<< EMBED \1 <<</g)) {
    markers++;
    const f = path.join(ROOT, m[1]);
    const src = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
    chk(`${n.name} <- ${m[1]}`, src !== null && m[2].replace(/\n+$/, '') === src.replace(/\n+$/, ''),
        src === null ? 'src file missing' : '');
  }
}
chk('at least one marker embed was found (a check that reads nothing proves nothing)', markers > 0, `${markers} found`);

console.log('\nunmarked embeds contain their src file verbatim');
const UNMARKED = {
  'src/booking_claim.js': ['ParseClaude', 'ParseGuardRetry', 'AssertInvariants', 'AssertDelivery'],
  'src/time_guard.js': ['ParseClaude', 'ParseGuardRetry', 'AssertInvariants', 'AssertDelivery', 'AfterBooking'],
  'src/slot_engine.js': ['LostSlotReoffer'],
  'src/invariants.js': ['AssertInvariants', 'AssertDelivery'],
  'src/parse_reply.js': ['ParseClaude', 'ParseGuardRetry'],
  'src/system_reasons.js': ['PrepRunEscalated'],
  'src/language.js': ['BuildClaudeRequest', 'ParseClaude', 'ParseGuardRetry', 'DecideEscalation',
                      'AfterBooking', 'MediaReply', 'CatchInternal',
                      'BuildOperatorAlert', 'BuildOperatorAlertMedia', 'BuildOperatorAlertInternal'],
  // Pasted whole, and unchecked until 24 Sep 2026.
  'src/catch_internal.js': ['CatchInternal'],
};
for (const [file, nodes] of Object.entries(UNMARKED)) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\n+$/, '');
  for (const name of nodes) {
    const n = w.nodes.find(x => x.name === name);
    chk(`${name} <- ${file}`, !!n && code(n).includes(src), n ? '' : 'node missing');
  }
}

// The prompt is embedded as a JSON string literal, so neither check above sees
// it. Found 24 Sep 2026: SYSTEM_TEMPLATE had lacked cd3e42c's Art. 50 line since
// 17 Sep, so production answered "are you a bot?" with wording src had replaced,
// and prompt_suites.py (which reads src) measured a prompt production did not run.
console.log('\nthe system prompt the workflow sends IS src/concierge_system_prompt.txt');
{
  const n = w.nodes.find(x => x.name === 'BuildClaudeRequest');
  const m = code(n).match(/const SYSTEM_TEMPLATE = (".*?");\n/);
  const emb = m ? JSON.parse(m[1]) : null;
  const src = fs.readFileSync(path.join(ROOT, 'src', 'concierge_system_prompt.txt'), 'utf8');
  chk('BuildClaudeRequest SYSTEM_TEMPLATE === src/concierge_system_prompt.txt', emb === src,
      emb === null ? 'SYSTEM_TEMPLATE not found' : 'they differ');
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
