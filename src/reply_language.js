// ============================================================================
// Did the reply come back in the lead's language? — shared source.
//
// Embedded verbatim into ParseClaude and ParseGuardRetry, AFTER
// src/language.js (it calls detectLanguage). Unit-tested standalone in
// tests/reply_language.test.js, which loads both files.
//
// WHY THIS EXISTS
// On 2026-09-12 the prompt suite failed English booking requests with
// Portuguese replies, 3 to 6 times in 24 depending on the prompt variant. The
// leak lives in one place: the explanation that the appointment is a first
// meeting rather than a viewing, whose vocabulary in the prompt is Portuguese.
// Rewording the example moved the rate; nothing removed it. The prompt is not
// the guard (§11): BuildClaudeRequest now STATES the reply language it
// detected, and this is the check behind it -- the same posture as
// bookingClaim and viewingClaim. A wrong-language reply is rejected, retried
// once, and escalates on a second failure. A lead told "a colleague will be in
// touch" in their own language is a recoverable outcome; a Portuguese reply
// to an English lead in the middle of a demo is not.
//
// THE BAR IS DELIBERATELY HIGHER THAN detectLanguage's OWN CONFIDENCE.
// The detector was tuned for short lead messages. On a reply it can be sure
// for the wrong reason: "Understood, João! Noted your maximum." scored
// Portuguese on the strength of one ã in a name. So the lead's stored name is
// masked before detection, and a mismatch needs the wrong language to score
// well past a single accented word while the lead's language scores next to
// nothing. Where either side is unsure, the reply passes: this guard is for
// the reply that is plainly in the other language, not for edge cases.
// ============================================================================

// pt and es carry hard markers worth 5-6 each (ã, ç, ñ, ¿), so one accented
// word already scores 6 and the bar must sit above two of them. English has no
// hard markers -- every word is worth 2 -- so three English function words is
// already unmistakable.
const REPLY_LANG_MIN_WRONG = { pt: 10, es: 10, en: 6 };
const REPLY_LANG_MAX_RIGHT = 2;    // at most one incidental function word

function maskName(text, name) {
  let t = String(text == null ? '' : text);
  const parts = String(name == null ? '' : name).split(/\s+/).filter(p => p.length > 1);
  for (const p of parts) {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(esc, 'gi'), ' ');
  }
  return t;
}

// replyLanguageMismatch(leadText, replyText, opts) ->
//   { mismatch, leadLang, replyLang, replyScores }
//
//   leadText   the lead's most recent message (what the reply answers)
//   replyText  the model's reply
//   opts.name  leads.full_name, masked out of the reply before detection
//   opts.leadLang  a language already detected upstream, to save a second pass
function replyLanguageMismatch(leadText, replyText, opts) {
  const o = opts || {};
  const lead = o.leadLang ? { lang: o.leadLang, confident: true } : detectLanguage(leadText);
  const reply = detectLanguage(maskName(replyText, o.name));
  const out = { mismatch: false, leadLang: lead.lang, replyLang: reply.lang, replyScores: reply.scores };
  if (!lead.lang || !reply.lang || reply.lang === lead.lang) return out;
  const wrong = reply.scores[reply.lang] || 0;
  const right = reply.scores[lead.lang] || 0;
  out.mismatch = wrong >= (REPLY_LANG_MIN_WRONG[reply.lang] || 10) && right <= REPLY_LANG_MAX_RIGHT;
  return out;
}

// renderReplyLanguageNote(lang) -> the line BuildClaudeRequest appends when the
// lead's language was detected with confidence, or '' when it was not. Stated,
// not asked for: the model is told which language this reply is in.
const REPLY_LANG_NAMES = { en: 'English', pt: 'Portuguese', es: 'Spanish' };
function renderReplyLanguageNote(lang) {
  const name = REPLY_LANG_NAMES[lang];
  if (!name) return '';
  return '\n\nREPLY LANGUAGE: ' + name + '. The lead\'s most recent message is in ' + name
    + ', so the whole reply is written in ' + name + ' - every sentence, including any '
    + 'explanation of what kind of appointment this is. Words in other languages that appear '
    + 'in these instructions are examples, not the language to reply in. A person\'s name is '
    + 'written exactly as recorded, never translated.';
}

// retryLanguageHint(leadLang, replyLang) -> the line appended to the system
// prompt for the ONE targeted retry after a mismatch. A resample of the same
// request is a second draw from the same distribution; this names the fault.
function retryLanguageHint(leadLang, replyLang) {
  const want = REPLY_LANG_NAMES[leadLang] || leadLang;
  const got = REPLY_LANG_NAMES[replyLang] || replyLang;
  return '\n\nYOUR PREVIOUS DRAFT WAS REJECTED: it was written in ' + got + ', but the lead wrote in '
    + want + '. Write the reply again, entirely in ' + want + '. Keep the same content.';
}
