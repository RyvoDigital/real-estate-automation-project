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

console.log('\n  -- 2026-09-21: short booking replies, which scored 0 in every language');
// "Ok let's go with Thursday morning" got no REPLY LANGUAGE note and 4 of 5
// replies in Portuguese (suite 7 on the live build). Word for word first.
for (const [want, text] of [
  ['en', "Ok let's go with Thursday morning"],
  ['en', 'Tuesday at 15:00 works'],
  ['en', 'Thursday works'],
  ['en', 'Sounds good, Friday afternoon'],
  ['en', 'What about next Monday?'],
  ['pt', 'Quinta de manhã'],
  ['pt', 'Pode ser terça às 15:00'],
  ['pt', 'Sexta à tarde, combinado'],
  ['es', 'El martes por la tarde'],
  ['es', 'Vale, el lunes'],
  ['es', 'El jueves a las 11 me viene bien'],
]) {
  const r = detectLanguage(text);
  chk(`${want}: ${JSON.stringify(text)}`, r.lang === want, `got=${r.lang} scores=${JSON.stringify(r.scores)}`);
}
for (const [label, text] of [
  ['a bare time', '15:00'],
  ['ok and a time', 'ok 15h'],
  ['a place name', 'Cascais'],
  ['a shared weekend word', 'sábado'],
]) {
  const r = detectLanguage(text);
  chk(`${label} is still undecided: ${JSON.stringify(text)}`, r.lang === null, `got=${r.lang}`);
}

console.log('\n  -- resolveLeadLanguage: an undecided message inherits, it does not go blank');
{
  const r1 = resolveLeadLanguage("Ok let's go with Thursday morning", []);
  chk('the current message decides when it can', r1.lang === 'en' && r1.source === 'message');
  const r2 = resolveLeadLanguage('ok 15h', ['Hi, do you have anything in Cascais under 1 million?']);
  chk('undecided -> the lead\'s last decided message', r2.lang === 'en' && r2.source === 'history');
  const r3 = resolveLeadLanguage('ok', ['15:00', 'Cascais', 'Quero falar com uma pessoa por favor', 'Hi there']);
  chk('skips undecided history, takes the NEWEST decided (list is newest first)', r3.lang === 'pt' && r3.source === 'history');
  const r4 = resolveLeadLanguage('ok', ['15:00']);
  chk('nothing decided anywhere -> null, and nothing is stated', r4.lang === null && r4.source === null);
  const r5 = resolveLeadLanguage('ok', null);
  chk('no history at all -> null, not a throw', r5.lang === null);
  const r6 = resolveLeadLanguage('Pode ser terça às 15:00', ['I would like to speak to a person please']);
  chk('a decided message beats history: a lead who switches language is followed', r6.lang === 'pt' && r6.source === 'message');
}

console.log('\n  -- 2026-09-21: the HANDOFF NOTE inherits too (systemMessage with history)');
{
  // The Ryvo Test Client's shape: a pt default, and a note in each language.
  const CFG = { default_language: 'pt', system_messages: { handoff: {
    pt: 'Um colega da nossa equipa vai continuar a conversa consigo.',
    en: 'A member of our team will take over from here.',
    es: 'Un compañero de nuestro equipo continuará la conversación.' } } };
  const EN_HISTORY = ["Ok let's go with Thursday morning", 'Hi, do you have anything in Cascais under 1 million?'];
  // "Talk to a human" scores 0 in every language, even with the 21 Sep lists.
  chk('precondition: "Talk to a human" is unreadable on its own', detectLanguage('Talk to a human').lang === null);
  const h = systemMessage(CFG, 'handoff', 'Talk to a human', EN_HISTORY);
  chk('an English lead asking for a person unreadably gets the ENGLISH note, not the pt default',
      h.lang === 'en' && /take over/.test(h.text) && h.source === 'history', `lang=${h.lang} source=${h.source}`);
  const without = systemMessage(CFG, 'handoff', 'Talk to a human');
  chk('CONTROL: the same message with no history falls back to the configured default (pt)',
      without.lang === 'pt' && without.source === null, `lang=${without.lang}`);
  const pt = systemMessage(CFG, 'handoff', 'Quero falar com uma pessoa', EN_HISTORY);
  chk('a readable message still decides: pt now beats English history', pt.lang === 'pt' && pt.source === 'message');
  const esHist = systemMessage(CFG, 'handoff', 'Human?', ['Hola, busco una casa en Cascais con vistas al mar']);
  chk('Spanish history -> the Spanish note', esHist.lang === 'es' && /compañero/.test(esHist.text));
  chk('`detected` still reports the CURRENT message only (null here), for the audit trail',
      h.detected === null);
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
