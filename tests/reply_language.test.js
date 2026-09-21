#!/usr/bin/env node
// Unit tests for src/reply_language.js. Loads the SHIPPING sources (language.js
// first, as the nodes embed them) rather than copies.
//
//   node tests/reply_language.test.js
const fs = require('fs');
const path = require('path');
eval(fs.readFileSync(path.join(__dirname, '..', 'src', 'language.js'), 'utf8'));
eval(fs.readFileSync(process.env.REPLY_LANGUAGE_SRC || path.join(__dirname, '..', 'src', 'reply_language.js'), 'utf8'));

let pass = 0, fail = 0;
const chk = (n, c, d) => { c ? pass++ : fail++; console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${d ? '  ' + d : ''}`); };
let r;
const EN_Q = 'Can I book a viewing?';

console.log('\nthe 2026-09-12 leak: English question, Portuguese reply');
r = replyLanguageMismatch(EN_Q, 'Claro! Posso agendar uma primeira reunião com o nosso colega para conversar sobre o que procura. Temos disponibilidade na terça-feira às 09:00, hora de Lisboa.');
chk('a Portuguese reply to an English lead is a mismatch', r.mismatch === true && r.leadLang === 'en' && r.replyLang === 'pt');
r = replyLanguageMismatch(EN_Q, 'Claro! Neste momento seria uma primeira conversa com um dos nossos colegas, já que ainda não temos um imóvel específico.');
chk('the meeting explanation in Portuguese is a mismatch', r.mismatch === true);
r = replyLanguageMismatch('Posso visitar na quinta-feira?', 'Of course! At this stage it would be a first meeting with one of our colleagues. Would Thursday at 11:00 Lisbon time suit you?');
chk('and the reverse', r.mismatch === true && r.leadLang === 'pt' && r.replyLang === 'en');

console.log('\nwhat must pass');
r = replyLanguageMismatch(EN_Q, 'Of course! We have availability on Tuesday 15 September at 09:00 (Lisbon time) or Thursday at 11:00. Which works best for you?');
chk('an English reply to an English lead', r.mismatch === false);
r = replyLanguageMismatch('Can I come this week?', 'Understood, João! Noted your maximum at 1,100,000€. Would you like to hear about next steps?', { name: 'João Ferreira' });
chk('the name is masked: one ã in João does not make an English reply Portuguese', r.mismatch === false);
r = replyLanguageMismatch('Can I come this week?', 'Understood, João! Noted your maximum at 1,100,000€.');
chk('even unmasked, one accented name is below the bar', r.mismatch === false);
r = replyLanguageMismatch('Ok', 'Claro! Temos disponibilidade na terça-feira às 09:00, hora de Lisboa.');
chk('an undetectable lead message never rejects', r.mismatch === false && r.leadLang === null);
r = replyLanguageMismatch(EN_Q, 'Sure!');
chk('an undetectable reply never rejects', r.mismatch === false);
r = replyLanguageMismatch(EN_Q, 'Of course! Our colleague Sofia can meet you in Cascais or Estoril; a first meeting, as we say here, "uma primeira reunião".');
chk('an English reply quoting a Portuguese phrase passes (English scores)', r.mismatch === false);
r = replyLanguageMismatch('', 'Claro! Posso agendar uma primeira reunião com o nosso colega na terça-feira às 09:00, hora de Lisboa.', { leadLang: 'en' });
chk('an upstream leadLang is honoured even when the lead text is empty', r.mismatch === true && r.leadLang === 'en');
r = replyLanguageMismatch(EN_Q, 'Claro! Temos disponibilidade na terça-feira às 09:00.');
chk('a SHORT wrong-language reply is below the bar and passes: this guard is for the leak, not every edge', r.mismatch === false);

console.log('\nthe note and the retry hint');
chk('note names the language and forbids translating a name', /REPLY LANGUAGE: English/.test(renderReplyLanguageNote('en')) && /never translated/.test(renderReplyLanguageNote('en')));
chk('no note when the language is unknown', renderReplyLanguageNote(null) === '' && renderReplyLanguageNote('de') === '');
chk('the retry hint names both languages', /written in Portuguese, but the lead wrote in English/.test(retryLanguageHint('en', 'pt')));
chk('the note spells the stated name out as data (21/24 on the John transcript; the override sentence scored 18/24 and is left out)', /name is "João Ferreira": if you address them, write "João"/.test(renderReplyLanguageNote('en', 'João Ferreira')) && !/outranks any name/.test(renderReplyLanguageNote('en', 'João Ferreira')));
chk('without a stated name the note keeps the general rule', /never translated/.test(renderReplyLanguageNote('en', null)) && !/outranks any name/.test(renderReplyLanguageNote('en', '')));
chk('the name retry hint names what was used and what is stored', /addressed the lead as "John"/.test(retryNameHint('John', 'João Ferreira')) && /write "João"/.test(retryNameHint('John', 'João Ferreira')));
r = replyLanguageMismatch('¿Puedo visitar el jueves?', 'Claro! Posso agendar uma primeira reunião com o nosso colega na quinta-feira às 11:00, hora de Lisboa.');
chk('Spanish lead, Portuguese reply is a mismatch', r.mismatch === true && r.leadLang === 'es' && r.replyLang === 'pt');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
