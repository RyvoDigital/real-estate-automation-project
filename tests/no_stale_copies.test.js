#!/usr/bin/env node
// No node carries its OWN copy of a function that src/ defines.
//
// A node may embed a src/ file VERBATIM (tests/embeds_current.test.js checks
// the copies match). What it may not do is define a function of the same name
// that is NOT that verbatim embed: an old copy, a hand edit, a partial paste.
// That copy drifts silently, and no test sees it, because the unit tests load
// src/, not the workflow.
//
// FOUND 21 Sep 2026 twice in one day:
//   * invariant 1 and the time guard enforced one rule from two copies of the
//     logic; only one was updated, and invariant 1 fired a false alarm live.
//   * ReadRecheck carries a stale, non-verbatim copy of src/slot_engine.js.
//
//   node tests/no_stale_copies.test.js
//   WORKFLOW=path/to/other.json node tests/no_stale_copies.test.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const WF = process.env.WORKFLOW || path.join(ROOT, 'workflows', 'ryvoInboundConc01.json');
let w = JSON.parse(fs.readFileSync(WF, 'utf8'));
w = Array.isArray(w) ? w[0] : w;

// 🔒 KNOWN EXCEPTIONS, each with its reason. A ratchet: an entry that is no
// longer true FAILS, so a fixed node cannot keep an exception it no longer
// needs, and nothing can be added here without a reason on the line.
const KNOWN = {
  ReadRecheck: {
    functions: ['computeSlots', 'extractPreferredDate', 'matchConfirmation', 'readFreeBusy'],
    reason: 'A stale, non-verbatim copy of src/slot_engine.js (extractPreferredDate lacks the "dia 12" fix; ' +
            'matchConfirmation differs by 91 lines). It calls ONLY readFreeBusy, which is identical to the source, ' +
            'so nothing stale runs today. Left unchanged on 21 Sep 2026 because the node sits on the ' +
            'double-booking path; the fix is to embed src/slot_engine.js verbatim, then delete this entry.',
  },
};

const srcFiles = fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js'));
const srcText = Object.fromEntries(srcFiles.map(f => [f, fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').replace(/\n+$/, '')]));
const srcFn = {};
for (const [f, t] of Object.entries(srcText)) for (const m of t.matchAll(/^function ([A-Za-z_$][\w$]*)\s*\(/gm)) srcFn[m[1]] = f;

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };

const found = {};
for (const n of w.nodes) {
  let own = (n.parameters && n.parameters.jsCode) || '';
  if (!own) continue;
  for (const t of Object.values(srcText)) own = own.split(t).join('');
  own = own.replace(/\/\/ >>> EMBED (\S+) >>>[\s\S]*?\/\/ <<< EMBED \1 <<</g, '');
  for (const m of own.matchAll(/^\s*(?:async\s+)?function ([A-Za-z_$][\w$]*)\s*\(/gm)) {
    if (srcFn[m[1]]) (found[n.name] = found[n.name] || []).push(m[1]);
  }
}

console.log('\nno node re-defines a src/ function outside a verbatim embed');
for (const [node, fns] of Object.entries(found)) {
  const known = KNOWN[node];
  const unexplained = fns.filter(f => !(known && known.functions.includes(f)));
  chk(`${node}: ${fns.join(', ')}`, unexplained.length === 0,
      unexplained.length ? `NOT the verbatim embed of ${[...new Set(unexplained.map(f => srcFn[f]))].join(', ')}: embed the file, or add a KNOWN entry WITH A REASON` : 'known exception');
}
if (!Object.keys(found).length) chk('no node carries a copy', true);

console.log('\n🔒 every known exception is still true (the ratchet)');
for (const [node, k] of Object.entries(KNOWN)) {
  const now = found[node] || [];
  const gone = k.functions.filter(f => !now.includes(f));
  chk(`${node}: the exception still describes the node`, gone.length === 0,
      gone.length ? `no longer re-defined: ${gone.join(', ')}. Delete them from KNOWN.` : '');
  chk(`${node}: the exception carries a reason`, typeof k.reason === 'string' && k.reason.length > 40);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
