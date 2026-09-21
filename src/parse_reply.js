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
function checkReplyShape(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { errorType: 'bad_json', errorMessage: 'response is not an object' };
  const REQUIRED = ['reply', 'lead_type', 'stage', 'intent', 'wants_booking', 'needs_human'];
  for (const k of REQUIRED) if (!(k in p)) return { errorType: 'bad_json', errorMessage: 'missing key: ' + k };
  if (typeof p.reply !== 'string') return { errorType: 'bad_json', errorMessage: 'empty reply' };
  if (!p.reply.trim()) return { errorType: 'bad_reply', errorMessage: 'empty reply' };
  if (typeof p.needs_human !== 'boolean') return { errorType: 'bad_json', errorMessage: 'needs_human not boolean' };
  const broken = replyLooksBroken(p.reply);
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
