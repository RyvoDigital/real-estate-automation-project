// Opt-out recognition (Stage 1, piece 1).
//
// The asymmetry here is NOT the usual one. Writing an objection is permanent --
// rule 1 of the derivation never lets a later consent overturn it, and the
// ledger refuses UPDATE and DELETE -- so a false positive is irreversible,
// while a false negative sends one more message. That is why the module answers
// in three tiers and why the negative cases below matter as much as the
// positive ones.
//
// Every negative case is a sentence that CONTAINS an opt-out word while meaning
// something else. A lead writing "não quero perder esta oportunidade" who gets
// suppressed for ever would look exactly like the system working.
const fs = require('fs');
const SRC = process.env.OPT_OUT_SRC || __dirname + '/../src/opt_out.js';
eval(fs.readFileSync(SRC, 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };
const v = (t) => optOutVerdict(t);

console.log('  -- unambiguous: halt AND record');
[
  'SAIR', 'sair', ' Sair ', 'STOP', 'stop', 'Parar', 'PARE', 'baja', 'BAJA',
  'unsubscribe', 'Unsubscribe', 'remove', 'cancel', 'quit', 'opt out',
  'Não quero receber mais mensagens',
  'nao quero receber nada',
  'Não quero ser contactado',
  'Deixem-me em paz',
  'deixe de me enviar mensagens',
  'parem de me contactar',
  'Não me contactem mais',
  'Tirem-me da vossa lista',
  'No quiero recibir mensajes',
  'Déjenme en paz',
  'dejen de escribirme',
  'No me contacten más',
  'bórrenme de la lista',
  'Leave me alone',
  'stop sending me these',
  'please take me off your list',
  'remove me from your database',
  "I don't want to receive messages",
  'unsubscribe me please',
].forEach((t) => {
  const r = v(t);
  chk(`opt_out: "${t}"`, r.verdict === 'opt_out' && r.halt && r.record, r.verdict);
});

console.log('  -- typographic apostrophes (21 Sep 2026): already caught by "do ?n.?t"; this holds it');
['Please don’t message me again', 'I don’t want any more messages', 'Don’t contact me'].forEach((t) => {
  const r = v(t);
  chk(`opt_out, U+2019: "${t}"`, r.verdict === 'opt_out' && r.halt && r.record, r.verdict);
});

console.log('  -- THE FALSE POSITIVES. A keyword inside a sentence that means the opposite');
[
  ['Não quero perder esta oportunidade', 'the operator\'s own example: a HOT lead'],
  ['não quero uma casa com jardim', 'a preference, not an objection'],
  ['Não quero nada muito grande, T2 chega', 'THE DEFECT this test found: a size, read as an objection'],

  ['Não quero gastar mais de 800 mil', 'a budget'],
  ['No quiero algo tan lejos del centro', 'Spanish preference'],
  ["I don't want to waste your time", 'politeness'],

  ['Olá, procuro casa em Cascais', 'an ordinary enquiry'],
  ['Quero falar com uma pessoa por favor', 'an escalation, not an objection'],
  ['Posso visitar na quinta-feira?', 'a booking'],
].forEach(([t, why]) => {
  const r = v(t);
  chk(`not_opt_out: "${t}"`, r.verdict === 'not_opt_out' && !r.halt && !r.record, `${r.verdict} · ${why}`);
});

console.log('  -- the middle tier: halt, escalate, record NOTHING');
[
  'stop, quero a outra casa',
  'Basta',
  'chega',
  'enough',
  'pare',            // bare imperative, could be about anything
  'cancelar a visita de sexta',
  // Both of these were written as not_opt_out expectations and both were wrong.
  // A loose keyword cannot be cleared by context that a machine can see: "stop
  // me if I am wrong" and "can you stop?" are indistinguishable by punctuation,
  // by length, or by the presence of a question -- and the second must not slip
  // through. So they halt and a human reads them. The cost is a pause on a live
  // conversation, which is what the middle tier is FOR; the alternative is
  // either a permanent objection on a guess or a missed "can you stop?".
  'stop me if I am wrong, is it still available?',
  'I want to remove the garage from the search',
  'nao quero nada',
].forEach((t) => {
  const r = v(t);
  const okTier = (r.verdict === 'unclear' && r.halt && !r.record)
              || (r.verdict === 'opt_out' && r.halt && r.record && t === 'pare');
  // The property that matters for this whole tier: NOTHING PERMANENT.
  if (r.verdict === 'unclear') chk(`  └─ and records nothing`, !r.record);
  chk(`middle: "${t}"`, okTier, `${r.verdict} halt=${r.halt} record=${r.record}`);
});

console.log('  -- INVARIANT: nothing permanent is ever written on a maybe');
{
  const corpus = [
    'SAIR', 'stop', 'Não quero perder esta oportunidade', 'stop me if I am wrong',
    'Basta', 'Olá, procuro casa em Cascais', 'no quiero recibir mensajes', '', null, undefined,
    'cancelar a visita de sexta', 'I want to remove the garage from the search',
  ];
  let bad = [];
  for (const t of corpus) {
    const r = v(t);
    if (r.record && !r.halt) bad.push(`recorded without halting: ${t}`);
    if (r.verdict === 'unclear' && r.record) bad.push(`unclear but recorded: ${t}`);
    if (r.verdict === 'not_opt_out' && (r.halt || r.record)) bad.push(`not_opt_out but acted: ${t}`);
    if (r.verdict === 'opt_out' && !(r.halt && r.record)) bad.push(`opt_out but did not act: ${t}`);
  }
  chk('every verdict implies exactly its own two actions', bad.length === 0, bad.join(' | '));
  chk('the corpus was not empty (§5c)', corpus.length > 5);
}

console.log('  -- robustness: the same intent however it is typed');
[
  ['SAIR!!!', 'opt_out'], ['sair.', 'opt_out'], ['  STOP  ', 'opt_out'],
  ['Sair 👋', 'opt_out'], ['¡BAJA!', 'opt_out'],
  ['Deixem me em paz', 'opt_out'],          // no hyphen
  ['DEIXEM-ME EM PAZ', 'opt_out'],
  ['deixem-me em paz', 'opt_out'],
  ['Nao quero receber mensagens', 'opt_out'],  // no cedilla/tilde
].forEach(([t, want]) => {
  const r = v(t);
  chk(`robust: "${t}"`, r.verdict === want, r.verdict);
});

console.log('  -- a platform block needs no text');
{
  const r = optOutFromBlock();
  chk('block is an objection', r.verdict === 'opt_out' && r.halt && r.record);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
