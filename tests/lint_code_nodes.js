// Catches what `node --check` cannot: an identifier that is USED but never
// DECLARED in that node. Those are runtime ReferenceErrors, so they parse
// perfectly and then take the workflow down on the next real message.
//
// This exists because a hand-written rule did not hold. Twice in one session a
// patch inserted `ea.emailAlertOk` / `h.handoffLang` into a node where neither
// name existed -- once breaking every escalation until the next message. The
// rule said "assert every replacement"; the rule was written and then broken
// the same day. A check runs whether or not anyone remembers the rule.
const fs = require('fs');
const wf = JSON.parse(fs.readFileSync(process.argv[2] || __dirname + '/../workflows/ryvoInboundConc01.json', 'utf8'));

const GLOBALS = new Set([
  '$', '$input', '$json', '$env', '$node', '$workflow', '$execution', '$now',
  '$today', '$runIndex', '$itemIndex', '$prevNode', '$parameter', '$vars',
  'DateTime', 'Duration', 'Interval', 'JSON', 'Math', 'Date', 'Number', 'String',
  'Boolean', 'Object', 'Array', 'Set', 'Map', 'RegExp', 'Error', 'TypeError',
  'console', 'isNaN', 'parseInt', 'parseFloat', 'encodeURIComponent',
  'decodeURIComponent', 'Buffer', 'require', 'undefined', 'null', 'true',
  'false', 'Promise', 'Symbol', 'BigInt', 'Infinity', 'NaN', 'globalThis',
]);

let problems = 0, checked = 0;
for (const node of wf.nodes) {
  if (node.type !== 'n8n-nodes-base.code') continue;
  checked++;
  const raw = node.parameters.jsCode || '';
  // Strip comments and string/template literals first. Without this the scan
  // matches English prose -- "…take it. The next…" reads as `it.` -- and 376
  // false positives is the same as no linter at all.
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')      // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')     // line comments (not "http://")
    .replace(/`(?:\\.|[^`\\])*`/g, '``')      // template literals
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")   // single-quoted
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');  // double-quoted

  const declared = new Set();
  // const/let/var, including destructuring; function declarations; params;
  // catch bindings; for-of/in bindings.
  // Multiple declarators on one statement: `let a = 1, b = null;`
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([^;=\n]*(?:=[^;\n]*)?(?:,[^;\n]*)*)/g)) {
    for (const part of m[1].split(',')) {
      const nm = part.trim().split('=')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(nm)) declared.add(nm);
    }
  }
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  // Array destructuring: `const [wd, names] of ...`
  for (const m of code.matchAll(/\b(?:const|let|var)\s*\[([^\]]*)\]/g))
    for (const part of m[1].split(',')) {
      const nm = part.trim().split('=')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(nm)) declared.add(nm);
    }
  for (const m of code.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}/g))
    for (const part of m[1].split(',')) {
      const name = part.split(':').pop().trim().split('=')[0].trim();
      if (name) declared.add(name);
    }
  for (const m of code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of code.matchAll(/\bfunction\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g))
    for (const p of m[1].split(',')) { const nm = p.trim().split('=')[0].trim(); if (nm) declared.add(nm); }
  for (const m of code.matchAll(/\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>/g)) declared.add(m[1]);
  for (const m of code.matchAll(/\(([^)]*)\)\s*=>/g))
    for (const p of m[1].split(',')) { const nm = p.trim().split('=')[0].trim(); if (nm) declared.add(nm); }
  for (const m of code.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of code.matchAll(/\bfor\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);

  // Only flag `name.property` — a bare identifier has too many innocent forms
  // (labels, object keys), while a property access on an undefined name is
  // always a ReferenceError waiting for the next message.
  const used = new Map();
  for (const m of code.matchAll(/(^|[^\w$.'"`])([A-Za-z_$][\w$]*)\s*\./g)) {
    const name = m[2];
    if (GLOBALS.has(name) || declared.has(name)) continue;
    if (/^[A-Z]/.test(name)) continue;                 // constructors/classes
    used.set(name, (used.get(name) || 0) + 1);
  }
  for (const [name, count] of used) {
    console.log(`  [FAIL] ${node.name}: "${name}" is used (${count}x) but never declared`);
    problems++;
  }
}
console.log(problems
  ? `\n  lint: ${problems} undeclared identifier(s) across ${checked} Code nodes`
  : `\n  lint: ${checked} Code nodes, no undeclared identifiers`);
process.exit(problems ? 1 : 0);
