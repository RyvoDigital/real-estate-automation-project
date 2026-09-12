// ============================================================================
// How many times have we already offered to propose times? — shared source.
//
// Embedded verbatim into BuildClaudeRequest. Unit-tested standalone in
// tests/offer_count.test.js, which loads THIS file rather than a copy.
//
// WHY THIS EXISTS
// On 2026-09-12 six consecutive replies ended with the identical sentence,
// "Quer que lhe proponha alguns horarios para essa primeira conversa com o
// nosso colega?". The lead had not declined and had not taken it up; the model
// had nothing left to qualify and used the offer as its way of moving forward,
// every turn. The same shape as "a colleague will follow up" (2.3) and the
// same fix: the workflow counts, the model phrases.
//
// THE RULE
// An offer to propose meeting times is made once. Count the assistant's own
// turns that ended with such an offer since the lead last raised booking
// themselves; a lead who asks for a time has taken the offer up, so the count
// restarts there. Only the assistant's own words count -- a colleague's reply
// or a system note is not the assistant repeating itself. The count is stated
// to the model; the prompt tells it what to do with it.
// ============================================================================

function deaccentOffer(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// The lead raising booking: asking for, accepting, or naming a time or a day.
const LEAD_RAISES = new RegExp(
  '\\b(marcar|agendar|reuniao|visita|visitar|horario|horarios|hora|horas|quando|amanha|semana|'
  + 'book|booking|schedule|meeting|viewing|appointment|available|availability|times?|slot|when|come|see|visit|week|tomorrow|'
  + 'cita|reunion|cuando|manana|'
  + 'segunda|terca|quarta|quinta|sexta|sabado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|'
  + 'lunes|martes|miercoles|jueves|viernes)\\b|\\b\\d{1,2}[:h]\\d{2}\\b');
// The assistant offering to propose times, as the LAST sentence, as a question.
const OFFER_WORDS = /\b(horario|horarios|hora|horas|proponha|propor|agendar|marcar|reuniao|conversa|encontro|times?|slots?|schedule|scheduling|meeting|appointment|availability|available|book|cita|reunion|horarios|agendarla)\b/;

function lastSentence(text) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return '';
  const parts = t.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  return parts[parts.length - 1] || '';
}

function isOffer(body) {
  const s = deaccentOffer(lastSentence(body)).trim();
  return s.endsWith('?') && OFFER_WORDS.test(s);
}

// countPendingOffers(rows) -> number
//   rows  message rows in CHRONOLOGICAL order: { direction, body, ai_generated, origin }
function countPendingOffers(rows) {
  let n = 0;
  const list = Array.isArray(rows) ? rows : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i] || {};
    if (r.direction === 'inbound') {
      if (LEAD_RAISES.test(deaccentOffer(r.body))) break;   // the lead took it up, or asked
      continue;
    }
    const assistantOwn = r.origin ? r.origin === 'ai' : r.ai_generated === true;
    if (assistantOwn && isOffer(r.body)) n++;
  }
  return n;
}
