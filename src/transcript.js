// ============================================================================
// Who wrote what — shaping stored messages into the model's transcript.
//
// Embedded verbatim into BuildClaudeRequest. Unit-tested standalone in
// tests/transcript.test.js, which loads THIS file rather than a copy.
//
// WHY THIS EXISTS
// On 2026-09-11 a lead asked for a person, was escalated, got the fixed handoff
// note, was answered by a human from the cockpit, and was handed back to the
// AI. Their next message -- "Qual e o proximo passo?" -- was escalated again,
// with the reason "asked to speak to a person and asked about price
// negotiation". Neither was in that message. Both were earlier in the window.
//
// The model could not have done otherwise: the transcript it was given mapped
// EVERY outbound row to an assistant turn. The handoff note read as Sofia
// promising a colleague; the human's "hello" read as Sofia saying hello; and
// nothing anywhere said the earlier request had been dealt with. Read as a
// single unbroken conversation, the lead had asked for a person and nobody had
// come. Escalating again was the consistent answer to the wrong transcript.
//
// THE RULE
// Every row carries a durable `origin`, set by the node that wrote it. Rows the
// assistant did not write are labelled as such, in the turn itself, so the
// model does not inherit their tone or repeat their promises. A hand-back is
// stated as a note at the point in time it happened, so "already handled" is a
// fact in the transcript rather than something the model has to infer.
//
// `origin` is a COLUMN, not a body match against the configured strings. A
// client customising their handoff note must not silently turn every note back
// into Sofia's own words -- silent failure is this project's documented
// dominant risk. Rows written before the column existed were backfilled by
// migration 0010; the flag fallback below is for a row that somehow has none,
// and it resolves an unknown outbound row to 'system' (labelled as not yours),
// which is the fail-safe direction.
// ============================================================================

const ORIGINS = ['lead', 'ai', 'human', 'handoff', 'system'];

// originOf(row) -> 'lead' | 'ai' | 'human' | 'handoff' | 'system'
function originOf(r) {
  if (r && ORIGINS.indexOf(r.origin) !== -1) return r.origin;
  if (!r || r.direction === 'inbound') return 'lead';
  if (r.ai_generated === true) return 'ai';
  if (r.approved_by_human === true) return 'human';
  return 'system';
}

// The label is INSIDE the assistant turn. It has to travel with the words it
// describes; a note elsewhere in the prompt would have to be matched back to
// the right line by the model, which is the inference this file exists to
// remove.
const TURN_LABEL = {
  human:   '[Written by a human colleague from the agency, not by you. Their words and promises are theirs, not yours.]',
  handoff: '[Automatic handoff note, sent by the system when this conversation was passed to a human colleague. Not written by you.]',
  system:  '[Automatic system message, not written by you.]',
};

function whenUtc(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return 'an earlier point';
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

function handBackNote(clearedAtIso) {
  return '[System note: at ' + whenUtc(clearedAtIso) + ' a human colleague finished '
    + 'handling this lead\'s earlier request and handed the conversation back to you. '
    + 'Everything above this note was dealt with by a person. Do not set needs_human '
    + 'again for anything above it; only what the lead says below this note can '
    + 'justify a new escalation.]';
}

// shapeTranscript(rows, opts) -> [{role, content}]
//
// `rows` are message rows, OLDEST FIRST:
//   {direction, body, ai_generated, approved_by_human, origin, created_at}
// `opts.escalationClearedAt` is the ISO time of the most recent hand-back, or
// null. The note is inserted before the first row after that time, and only
// when at least one row precedes it -- a hand-back older than the whole window
// has nothing left to close.
//
// Consecutive turns with the same role are merged, so the request never
// depends on the API accepting two assistant turns in a row. A labelled note
// followed by a human reply becomes one assistant turn with both labels.
function shapeTranscript(rows, opts) {
  const o = opts || {};
  const clearedAt = o.escalationClearedAt ? Date.parse(o.escalationClearedAt) : NaN;
  const turns = [];
  let noteDone = !Number.isFinite(clearedAt);
  let sawEarlier = false;

  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r) continue;
    const body = String(r.body == null ? '' : r.body).trim();
    if (!body) continue;

    const t = Date.parse(r.created_at || '');
    if (!noteDone && Number.isFinite(t) && t > clearedAt) {
      if (sawEarlier) turns.push({ role: 'assistant', content: handBackNote(o.escalationClearedAt) });
      noteDone = true;
    }
    if (!noteDone && Number.isFinite(t) && t <= clearedAt) sawEarlier = true;

    const origin = originOf(r);
    if (origin === 'lead')    turns.push({ role: 'user', content: body });
    else if (origin === 'ai') turns.push({ role: 'assistant', content: body });
    else                      turns.push({ role: 'assistant', content: TURN_LABEL[origin] + '\n' + body });
  }

  const merged = [];
  for (const t of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) last.content += '\n\n' + t.content;
    else merged.push({ role: t.role, content: t.content });
  }
  // Anthropic requires the conversation to start with a user turn.
  while (merged.length && merged[0].role !== 'user') merged.shift();
  return merged;
}
