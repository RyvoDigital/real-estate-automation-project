// Deterministic language detection for SYSTEM messages (Checkpoint D2).
// The bar is asymmetric on purpose: being UNSURE is safe (we fall back to the
// client's configured default), being CONFIDENTLY WRONG sends a Portuguese
// lead a message in Spanish. So every case below that is not clearly one
// language must NOT produce a confident answer.
const fs = require('fs');
const SRC = process.env.LANGUAGE_SRC || __dirname + '/../src/language.js';
eval(fs.readFileSync(SRC, 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };

console.log('  -- real messages this project has actually received');
const CASES = [
  ['pt', 'Olá, procuro casa em Cascais'],
  ['pt', 'Quero falar com uma pessoa por favor'],
  ['pt', 'Posso visitar na quinta-feira?'],
  ['pt', 'Tem estacionamento?'],
  ['pt', 'Afinal posso mudar para sexta-feira?'],
  ['pt', 'O orçamento é até 1.5 milhões'],
  ['en', 'Hi, do you have anything in Cascais under 1 million?'],
  ['en', 'Can I come and see something on Friday morning?'],
  ['en', 'I would like to speak to a person please'],
  ['es', 'Hola, busco una casa en Cascais con vistas al mar'],
  ['es', '¿Puedo visitar el jueves?'],
  ['es', 'Quisiera hablar con una persona, gracias'],
];
for (const [want, text] of CASES) {
  const r = detectLanguage(text);
  chk(`${want}: ${JSON.stringify(text.slice(0, 38))}`, r.lang === want,
      `got=${r.lang} scores=${JSON.stringify(r.scores)}`);
}

console.log('\n  -- must NOT guess: an unsure answer falls back, a wrong one misleads');
for (const [label, text] of [
  ['empty', ''],
  ['a bare yes', 'ok'],
  ['a phone number', '+351 933 048 230'],
  ['one shared word', 'no'],
  ['an address fragment', 'Rua da Liberdade 42'],
]) {
  const r = detectLanguage(text);
  chk(`${label} -> undecided`, r.lang === null && !r.confident, `got=${r.lang}`);
}

console.log('\n  -- pt/es separation, the pair most likely to be confused');
chk('accented pt beats shared vocabulary', detectLanguage('Não, obrigado').lang === 'pt');
chk('ñ settles es', detectLanguage('mañana por favor').lang === 'es');
chk('inverted punctuation settles es', detectLanguage('¿Cuando?').lang === 'es');
chk('"por favor" alone decides nothing (shared)', detectLanguage('por favor').lang === null);

console.log('\n  -- message resolution');
const BAG = { pt: 'PT note', en: 'EN note', es: 'ES note' };
chk('detected language wins', pickMessage(BAG, 'pt', 'en') === 'PT note');
chk('falls back to the configured default when undecided',
    pickMessage(BAG, null, 'es') === 'ES note');
chk('falls back to English when the default is missing too',
    pickMessage({ en: 'EN note' }, null, 'fr') === 'EN note');
chk('a legacy single string still works', pickMessage('legacy', null, 'en') === 'legacy');
chk('an empty bag returns null, never ""', pickMessage({}, 'pt', 'en') === null);

console.log('\n  -- end to end through config');
const CFG = { default_language: 'pt', languages: ['pt', 'en', 'es'],
              handoff_note: 'LEGACY',
              system_messages: { handoff: BAG, slot_taken: { pt: 'PT taken', en: 'EN taken' } } };
chk('pt lead gets the pt handoff',
    systemMessage(CFG, 'handoff', 'Quero falar com uma pessoa').text === 'PT note');
chk('en lead gets the en handoff',
    systemMessage(CFG, 'handoff', 'I would like to speak to a person please').text === 'EN note');
chk('undecided text uses the configured default (pt)',
    systemMessage(CFG, 'handoff', 'ok').text === 'PT note');
chk('a missing language in a bag falls back, not blank',
    systemMessage(CFG, 'slot_taken', 'Hola, gracias').text === 'PT taken');
chk('an unknown message name falls back to the legacy note',
    systemMessage(CFG, 'nonexistent', 'Olá').text === 'LEGACY');

console.log(`\n  language: ${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
