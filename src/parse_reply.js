// ============================================================================
// The shared steps of parsing a model reply. Shared source.
//
// Embedded verbatim into ParseClaude and ParseGuardRetry. Unit-tested
// standalone in tests/parse_reply.test.js, which loads THIS file.
//
// WHY IT EXISTS (2026-09-21): the two parser nodes carried the same code as two
// copies (fail(), replyLooksBroken(), the response parse, the shape check, the
// time guard's inputs, the viewing check, the budget check). A fix to one could
// miss the other, and did: the never-invent guard existed twice inline. What
// is left in each node is only where they genuinely DIFFER: the first attempt
// asks for a targeted retry, and the retry delivers, withholds or escalates.
// ============================================================================

// makeParseFail(b, durationMs, extra) -> fail(errorType, errorMessage), the
// node's failure return. `extra` is what distinguishes the retry
// ({ wasGuardRetry: true }).
function makeParseFail(b, durationMs, extra) {
  return function fail(errorType, errorMessage) {
    return [{ json: Object.assign({}, b, extra || {}, {
      ok: false, errorType, errorMessage, durationMs, usage: null, parsed: null }) }];
  };
}

// parseModelResponse(res) -> { ok: true, parsed, body } | { ok: false, errorType, errorMessage }
//
// Defensive parse. Structured outputs (output_config.format) already constrain
// the response to the schema at the API level, so this is a BACKSTOP, not the
// primary mechanism. But it is not dead code: structured outputs do NOT hold
// when stop_reason is 'refusal' or 'max_tokens'.
function parseModelResponse(res) {
  const bad = (errorType, errorMessage) => ({ ok: false, errorType, errorMessage });
  const code = (res || {}).statusCode;
  if (code === 401 || code === 403) return bad('claude_auth', 'HTTP ' + code);
  if (code >= 400 && code < 500)    return bad('claude_bad_request', 'HTTP ' + code);
  if (!(code >= 200 && code < 300)) return bad('claude_unavailable', 'HTTP ' + code);

  const body = (res || {}).body || {};
  if (body.stop_reason === 'refusal')    return bad('claude_refusal', 'model declined');
  if (body.stop_reason === 'max_tokens') return bad('claude_truncated', 'hit max_tokens');

  let text = '';
  for (const blk of (body.content || [])) if (blk.type === 'text') text += blk.text;
  // Strip fences / stray prose even though structured outputs should prevent them.
  text = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s !== -1 && e > s) text = text.slice(s, e + 1);

  let parsed;
  try { parsed = JSON.parse(text); } catch (err) { return bad('bad_json', String(err.message)); }
  return { ok: true, parsed, body };
}

// ---------------------------------------------------------------------------
// SEMANTIC guard on the reply.
//
// Structured outputs guarantee the response matches the SCHEMA. They do not
// guarantee the reply is a sensible sentence. On 2026-09-03 a schema-valid
// response carried reply = ": corrigir - vou responder corretamente.}" and it
// was DELIVERED to a real lead. Structural markers only; nothing
// language-specific, since replies are pt-PT / en / es.
//
// 2026-09-21: two more markers, from a reply that passed every guard:
//   "…hora de Lisbo,, si le viene bien.dígame para me confirma…"
// It was character-level corruption (fused words, a double comma, a full stop
// glued to the next word) in otherwise valid Spanish, with a promise drifting in
// ("lo dejo registado"). Measured against 65 good real replies: 0 false
// positives for either marker. A web address or a domain ("g.page",
// "ryvodigital.com", "hello@ryvodigital.com") is removed before the glued-stop
// test, since it is the one legitimate shape of a letter-dot-letter join.
// ---------------------------------------------------------------------------
const PR_DOMAIN_RX = /\b(?:https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|[\w-]+(?:\.[\w-]+)*\.(?:com|pt|es|net|org|io|co|uk|eu|page|app|gl|dev|ai|info|biz|me|tv|us|fr|de|link|ly)\b\S*)/gi;

// 2026-09-22, DEFECT D: a first attempt came back corrupted end to end and was
// DELIVERED (gate exec 5780): " only be2509:00 September25:00 09Lisbon time, 09:00
// on 26 September, or 09:00 on 28 September - which which is closest.」use
// دdireidply,". None of the markers above fired. Three structural ones, each
// measured on the 538-text corpus (tests/fixtures/lead_texts_2026-09-22.json):
//   - a clock time fused to a letter on either side ("be2509:00", "09:00Lisbon"),
//     or digits fused to a capitalised word ("09Lisbon");
//   - a character outside the set a pt/en/es reply can contain: PR_ALLOWED_CHAR
//     below, defined explicitly (Latin with its accents, typographic punctuation,
//     currency, arrows and emoji). "」" and "د" are outside it;
//   - the same word twice in a row ("which which"), for words of 3+ letters.
const PR_ALLOWED_CHAR = new RegExp('^[' + [
  '\\t\\n\\r\\u0020-\\u007E',   // printable ASCII
  '\\u00A0-\\u00FF',             // Latin-1: NBSP, ¡ ¿ « » º ª °, accented letters
  '\\u0100-\\u017F',             // Latin Extended-A: names like Łukasz, Ōta
  '\\u0300-\\u036F',             // combining accents (decomposed text)
  '\\u2000-\\u206F',             // general punctuation: – — ‘ ’ “ ” … • and the zero-width joiner
  '\\u20A0-\\u20CF',             // currency symbols, €
  '\\u2100-\\u214F',             // letterlike: ™ №
  '\\u2190-\\u21FF',             // arrows
  '\\u2300-\\u23FF',             // technical: ⌚ ⏰
  '\\u2600-\\u27BF',             // misc symbols and dingbats: ☀ ✓ ✅ ❤
  '\\u2B00-\\u2BFF',             // ⭐ and arrows
  '\\uFE0E\\uFE0F',              // emoji variation selectors
].join('') + ']$');
const PR_EMOJI_RX = /\p{Extended_Pictographic}|\p{Emoji_Component}/u;
// "10:00h" is legitimate Portuguese, so a lone trailing h is not a fused word.
const PR_FUSED_TIME_RX = /[A-Za-zÀ-ÿ]\d{1,4}:\d{2}\b|\b\d{1,2}:\d{2}(?!h\b)[A-Za-zÀ-ÿ]|\b\d{1,2}[A-Z][a-z]{2,}/;
const PR_DOUBLED_WORD_RX = /(?<![\p{L}\p{N}])([\p{L}]{3,})\s+\1(?![\p{L}\p{N}])/iu;

function prForeignChar(t) {
  for (const ch of t) {
    if (PR_ALLOWED_CHAR.test(ch)) continue;
    if (PR_EMOJI_RX.test(ch)) continue;            // emoji beyond the BMP ranges above (🤖, 🏡)
    return ch;
  }
  return null;
}

function replyLooksBroken(s) {
  const t = (s || '').trim();
  if (t.length < 15) return 'too short (' + t.length + ' chars)';
  if (':;,.})]>'.includes(t[0])) return 'starts with punctuation: ' + JSON.stringify(t[0]);
  if (t.includes('{') || t.includes('}')) return 'contains a brace - JSON leaked into the reply';
  if (t.split(/\s+/).filter(Boolean).length < 3) return 'fewer than 3 words';
  if (!/[a-zA-ZÀ-ÿ]/.test(t)) return 'contains no letters';
  const m1 = t.match(/[,;]\s*[,;]/);
  if (m1) return 'doubled punctuation: ' + JSON.stringify(m1[0]);
  const m2 = t.replace(PR_DOMAIN_RX, ' ').match(/[a-zà-ÿ]{2}\.[a-zà-ÿ]{2}/);
  if (m2) return 'a full stop glued to the next word: ' + JSON.stringify(m2[0]);
  const m3 = t.match(PR_FUSED_TIME_RX);
  if (m3) return 'a time fused to a word: ' + JSON.stringify(m3[0]);
  const ch = prForeignChar(t);
  if (ch) return 'a character outside the reply alphabet: ' + JSON.stringify(ch) + ' (U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + ')';
  const m4 = t.match(PR_DOUBLED_WORD_RX);
  if (m4) return 'the same word twice: ' + JSON.stringify(m4[0]);
  return null;
}

// checkReplyShape(p) -> null | { errorType, errorMessage }
//
// 2026-09-21: an EMPTY reply is 'bad_reply', not 'bad_json'. Only bad_reply
// takes the one guard retry (IsRetryableReply), so an empty reply used to
// escalate the lead at once. It happened live: execution 4569 returned valid
// JSON with "reply": "" and everything else right, and the lead who had asked
// "11:00?" got the handoff note. Now it is re-asked once, and a second empty
// reply escalates as bad_reply_twice. A reply that is not a string at all, a
// missing key or a non-boolean needs_human is still bad_json: that is the
// schema failing, not the model leaving a field blank.
// On a lost-slot turn (src/lost_slot.js) the model is told to write {{LOST_SLOT}}
// where the system's sentence goes, and may write that alone. The reply is judged
// as the lead will receive it: the placeholder, and the mangled attempts at it
// that the assembler removes, stand for a well-formed sentence. Found on the
// 24 Sep gate: "{{LOST_SLOT}}" alone was "too short", and any reply carrying it
// "contains a brace", so every lost slot escalated as bad_reply_twice. A brace
// anywhere ELSE is still what it always was. tests/parse_reply.test.js holds
// these two constants equal to src/lost_slot.js's.
const PR_LOST_SLOT = '{{LOST_SLOT}}';
const PR_LOST_SLOT_MANGLED_RX = /[{[]{1,2}\s*lost[\s_-]?slot\s*[}\]]{1,2}/gi;
const PR_LOST_SLOT_STAND_IN = 'That time has just been taken by someone else.';

// checkReplyShape(p, opts) -> null | { errorType, errorMessage }
//   opts.lostSlot  true on a lost-slot turn (bookingIntent 'taken')
function checkReplyShape(p, opts) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { errorType: 'bad_json', errorMessage: 'response is not an object' };
  const REQUIRED = ['reply', 'lead_type', 'stage', 'intent', 'wants_booking', 'needs_human'];
  for (const k of REQUIRED) if (!(k in p)) return { errorType: 'bad_json', errorMessage: 'missing key: ' + k };
  if (typeof p.reply !== 'string') return { errorType: 'bad_json', errorMessage: 'empty reply' };
  if (!p.reply.trim()) return { errorType: 'bad_reply', errorMessage: 'empty reply' };
  if (typeof p.needs_human !== 'boolean') return { errorType: 'bad_json', errorMessage: 'needs_human not boolean' };
  const judged = (opts && opts.lostSlot)
    ? p.reply.split(PR_LOST_SLOT).join(' ' + PR_LOST_SLOT_STAND_IN + ' ').replace(PR_LOST_SLOT_MANGLED_RX, ' ' + PR_LOST_SLOT_STAND_IN + ' ')
    : p.reply;
  const broken = replyLooksBroken(judged);
  if (broken) return { errorType: 'bad_reply', errorMessage: 'reply rejected: ' + broken };
  return null;
}

// allowedTimesFor(b) -> [{ timeLocal }] the time guard (src/time_guard.js)
// accepts. A booked viewing is restated from what we stored, so its time is
// legitimate even once the offer list has been cleared.
function allowedTimesFor(b) {
  const bookedTime = (b.bookingIntent === 'already_booked' && b.existingBooking) ? [b.existingBooking] : [];
  return (b.slots || []).concat((b.bookingSlot ? [b.bookingSlot] : []), bookedTime).map(s => ({
    timeLocal: s.timeLocal || (s.local ? String(s.local).slice(11, 16) : null) }));
}

// viewingClaimFailure(b, reply) -> null | { errorType, errorMessage }
//
// §0, and the instance that reached a real prospect. If no property has been
// named, the reply may not call the appointment a viewing -- "a sua visita esta
// confirmada" about a property nobody had ever identified. The condition is
// `!== 'viewing'`, not `=== 'meeting'`: if the field is ever missing the guard
// stays ON, which costs a retry; the other way round it silently stops running.
// Needs viewingClaim() from src/appointment_kind.js, embedded before this file.
function viewingClaimFailure(b, reply) {
  if (b.appointmentKind === 'viewing') return null;
  const vc = viewingClaim(reply);
  return vc ? { errorType: 'bad_reply',
                errorMessage: 'reply called the appointment a viewing when no property has been named: "' + vc + '"' } : null;
}

// saneBudgets(p) -> { rejected, budgetInconsistent }. MUTATES p.budget_min/max.
//
// Sanity-check extracted money before it is ever trusted downstream (spec 4.3):
// bad structured data is worse than absent structured data. An inverted pair
// is NOT nulled here (2026-09-12): the parser cannot interpret it without the
// row, MergeLeadFields can (src/budget_range.js), so both bounds go through
// with a flag.
function saneBudgets(p) {
  const rejected = [];
  const sane = (v) => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (n < 1000 || n > 50000000) { rejected.push(n); return null; }
    return n;
  };
  p.budget_min = sane(p.budget_min);
  p.budget_max = sane(p.budget_max);
  const budgetInconsistent = p.budget_min !== null && p.budget_max !== null && p.budget_min > p.budget_max;
  return { rejected, budgetInconsistent };
}
