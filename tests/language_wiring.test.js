#!/usr/bin/env node
// The language fallback is WIRED, not only written.
//
// tests/language.test.js proves resolveLeadLanguage() and systemMessage()'s
// history fallback against src/. This proves the workflow calls them with the
// lead's history: a function that exists and is never passed history changes
// nothing, and every unit test still passes. (21 Sep 2026: "Ok let's go with
// Thursday morning" -> no language stated -> 4 of 5 replies in Portuguese.)
//
//   node tests/language_wiring.test.js
//   WORKFLOW=path/to/other.json node tests/language_wiring.test.js
const fs = require('fs');
const path = require('path');
const WF = process.env.WORKFLOW || path.join(__dirname, '..', 'workflows', 'ryvoInboundConc01.json');
let w = JSON.parse(fs.readFileSync(WF, 'utf8'));
w = Array.isArray(w) ? w[0] : w;
const code = name => { const n = w.nodes.find(x => x.name === name); return n ? n.parameters.jsCode || '' : ''; };

let pass = 0, fail = 0;
const chk = (n, c) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}`); };

const bcr = code('BuildClaudeRequest');
console.log('\nBuildClaudeRequest states the RESOLVED language, from the lead\'s own messages');
chk('resolves with history: resolveLeadLanguage(a.body, priorInbound)', /const leadLangResolved = resolveLeadLanguage\(a\.body \|\| '', priorInbound\);/.test(bcr));
chk('the note is rendered from the resolved language', /const leadLang = leadLangResolved\.lang;/.test(bcr) && /renderReplyLanguageNote\(leadLang,/.test(bcr));
chk('history is INBOUND only, newest first', /ordered\.filter\(r => r && r\.direction === 'inbound' && r\.body\)\s*\.map\(r => String\(r\.body\)\)\.reverse\(\)/.test(bcr));
chk('leadLang and the prior messages are passed downstream', /\bleadLang,/.test(bcr) && /leadPriorInbound: priorInbound/.test(bcr));

console.log('\nthe parsers\' retry check inherits it');
for (const p of ['ParseClaude', 'ParseGuardRetry']) {
  chk(`${p} passes BuildClaudeRequest's leadLang to replyLanguageMismatch`,
      code(p).includes("replyLanguageMismatch(b.body, p.reply, { name: (b.priorLead || {}).full_name, leadLang: b.leadLang || null })"));
}

console.log('\nthe handoff note inherits it');
const de = code('DecideEscalation');
chk('DecideEscalation: the handoff note is picked WITH history', /systemMessage\(cfg, 'handoff', a\.body, deePrior\)/.test(de));
chk('DecideEscalation: the booking-retired note too', /'booking_retired', a\.body, deePrior\)/.test(de));
chk('DecideEscalation reads the history from BuildClaudeRequest', /deePrior = \$\('BuildClaudeRequest'\)\.first\(\)\.json\.leadPriorInbound/.test(de));
const ab = code('AfterBooking');
chk('AfterBooking: the race notes are picked WITH history',
    /systemMessage\(cfgAB, 'slot_taken', leadText, abPrior\)/.test(ab) && /systemMessage\(cfgAB, 'handoff', leadText, abPrior\)/.test(ab));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
