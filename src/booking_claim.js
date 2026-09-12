// ============================================================================
// Does the reply assert an appointment the workflow does not hold? — shared
// source. Embedded verbatim into ParseClaude and ParseGuardRetry. Unit-tested
// standalone in tests/booking_claim.test.js, which loads THIS file.
//
// WHY THIS EXISTS
// On 2026-09-12 a lead whose booking had been retired asked for a meeting and
// was told "Ja tem uma reuniao marcada para terca-feira, dia 15 ... as 09:00".
// The workflow held no booking. The model read its own confirmation twenty
// lines up the transcript and repeated it. The time was on the offered list,
// so the invented-time guard passed; "reuniao" is not "visita", so the
// viewing-claim guard passed. Nothing checked the claim itself.
//
// SECOND LINE OF DEFENCE, NOT THE FIRST
// The prompt now states the absence of a booking every turn, with the retired
// one named. That is the fix. Phrase matching across three languages will miss
// paraphrases -- "a reuniao fica entao para terca" is an assertion that no
// short list anticipates completely -- so this guard exists to fail loudly on
// the common shapes, never to justify a weaker prompt. Same posture as
// viewingClaim: a backstop that tried to be complete would start rejecting
// honest sentences.
//
// SHAPE
// Statements only: a sentence ending in "?" is an offer or a question, never
// an assertion, so it is skipped. Negations ("ja nao esta marcada", "is no
// longer in the diary") do not match by construction -- every pattern needs
// the affirmative form. Applied ONLY when the workflow holds no booking and is
// not creating one this turn; an honest confirmation is never tested.
// ============================================================================

function deaccentClaim(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const BOOKING_CLAIMS = [
  // --- pt ------------------------------------------------------------------
  // "ja tem uma reuniao marcada", "ja esta confirmada", "ja fica agendada"
  { rx: /\bja (?:tem|temos|esta|fica|ficou) [^.!?\n]{0,40}?(?:marcad|confirmad|agendad|reuniao|visita)/, label: 'ja tem ... marcada' },
  // "a reuniao fica entao para terca", "a sua visita esta marcada", "a reuniao continua para"
  { rx: /\b(?:reuniao|visita|marcacao|conversa|encontro) (?:fica|esta|ficou|continua|mantem-se) (?:entao |assim |portanto |sempre )?(?:marcad|confirmad|agendad|para\b|na\b|no\b|as\b)/, label: 'a reuniao fica para' },
  // "esta marcada para terca-feira", "ficou confirmada para dia 15"
  { rx: /\b(?:esta|ficou|fica|estao|ficam) (?:entao |assim )?(?:marcad[ao]s?|confirmad[ao]s?|agendad[ao]s?) para (?:o |a |as |os |o dia |dia |segunda|terca|quarta|quinta|sexta|sabado|domingo|\d)/, label: 'esta marcada para <dia>' },
  // "temos a reuniao marcada", "mantemos a visita marcada"
  { rx: /\b(?:temos|mantemos) (?:a |uma |essa |esta )?(?:reuniao|visita|marcacao|conversa) (?:marcad|confirmad|agendad)/, label: 'temos a reuniao marcada' },
  // --- es ------------------------------------------------------------------
  { rx: /\bya (?:tiene|tenemos|esta|queda) [^.!?\n]{0,40}?(?:cita|reunion|visita|confirmad|agendad|reservad|programad)/, label: 'ya tiene ... cita' },
  { rx: /\b(?:cita|reunion|visita) (?:queda|esta|sigue|se mantiene) (?:entonces )?(?:confirmad|agendad|reservad|programad|para\b|el\b|la\b|los\b|las\b)/, label: 'la cita queda para' },
  { rx: /\b(?:esta|queda|quedo|quedan) (?:entonces )?(?:confirmad[ao]s?|agendad[ao]s?|reservad[ao]s?|programad[ao]s?) para (?:el |la |las |los |lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d)/, label: 'queda confirmada para <dia>' },
  // --- en ------------------------------------------------------------------
  { rx: /\byou(?:'re| are)? already (?:have|booked|down|set|confirmed)\b/, label: 'you already have' },
  { rx: /\b(?:your|the) (?:meeting|viewing|appointment|call) (?:is|remains|stays|is still) (?:set |booked |confirmed |scheduled |in the diary |on )?(?:for|on|at)\b/, label: 'your meeting is for' },
  { rx: /\b(?:is|are|remains|stays) (?:already |still |now )?(?:booked|confirmed|scheduled|in the diary) for (?:the |mon|tue|wed|thu|fri|sat|sun|\d|next|this|tomorrow)/, label: 'is booked for <day>' },
  { rx: /\bwe have you (?:booked|down) for\b/, label: 'we have you booked for' },
  { rx: /\bi(?:'ve| have) (?:got )?you (?:booked|down) for\b/, label: 'I have you booked for' },
];

// bookingClaim(reply) -> the offending phrase (label), or null.
function bookingClaim(reply) {
  const raw = String(reply == null ? '' : reply);
  if (!raw.trim()) return null;
  // Sentence by sentence, so a question is never read as an assertion.
  const sentences = raw.split(/(?<=[.!?\n])\s+|\n+/);
  for (const sentence of sentences) {
    const s = sentence.trim();
    if (!s || s.endsWith('?')) continue;
    const t = deaccentClaim(s);
    for (const c of BOOKING_CLAIMS) {
      const m = t.match(c.rx);
      if (m) return m[0];
    }
  }
  return null;
}
