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
  // --- 2026-09-14: the promise, in the future tense --------------------------
  // "I'll get that first meeting set for Tuesday", "they'll be in touch to
  // confirm", "vou marcar", "voy a agendar": the model arranging a meeting the
  // workflow is not arranging. Same class as the phantom booking, one tense on.
  { rx: /\bi(?:'ll| will) (?:get|have) (?:that|this|it|the|your|a) [^.!?\n]{0,30}?(?:set|booked|arranged|scheduled|in the diary)\b/, label: "I'll get that set" },
  { rx: /\bi(?:'ll| will) (?:book|schedule|arrange|set up|lock in|pencil in) (?:that|this|it|the|your|a)\b/, label: "I'll book that" },
  { rx: /\b(?:will|'ll) be in touch to confirm\b/, label: 'will be in touch to confirm' },
  { rx: /\bvou (?:marcar|agendar|reservar|tratar de marcar)\b/, label: 'vou marcar' },
  { rx: /\bfica (?:entao |assim |ja )?(?:marcad|agendad|reservad)[ao] para\b/, label: 'fica marcado para' },
  { rx: /\bvoy a (?:agendar|reservar|programar|marcar)\b/, label: 'voy a agendar' },
  { rx: /\bse pondr[aá]n? en contacto para confirmar\b/, label: 'se pondra en contacto para confirmar' },
  // The shapes suite 7 produced on 2026-09-14 with the rule already in the prompt (6/12):
  { rx: /\bi(?:'ll| will) (?:set|get|book|put) you (?:up|down|in) (?:for|on|with)\b/, label: "I'll set you up for" },
  { rx: /\b(?:consider it|that's|that is) (?:booked|set|arranged|done)\b/, label: "consider it booked" },
  { rx: /\bvamos (?:marcar|agendar|reservar) (?:para|na|no|a|as|o) (?:segunda|terca|quarta|quinta|sexta|sabado|domingo|dia \d|\d)/, label: 'vamos marcar para <dia>' },
  { rx: /\b(?:ja )?vou tratar (?:disso|de tudo|da marcacao)\b/, label: 'vou tratar disso' },
  { rx: /\bdejo (?:propuest|reservad|agendad|apuntad)/, label: 'dejo propuesto' },
  { rx: /\bquedamos (?:para|el|en) (?:el |la |lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d)/, label: 'quedamos para' },
  { rx: /\b(?:reservamos|agendamos|programamos) (?:para |el |la )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo|el dia|\d)/, label: 'reservamos el' },
  { rx: /\bte lo dejo (?:agendad|reservad|apuntad)/, label: 'te lo dejo agendado' },
  // --- 2026-09-14, the present tense used as a future --------------------------
  // The guard covered "vou marcar" and not "marco entao quinta-feira": the
  // future tense, not the present-as-future that is ordinary Portuguese. Suite 7
  // produced it twice in twelve. The same neighbour exists in Spanish ("reservo
  // el jueves", "te agendo") and English ("I'm booking you in for Thursday").
  // Each pattern needs a day, a time or the appointment after the verb, so
  // "Marco, o nosso colega" (a name) and "o marco historico" never match.
  { rx: /\b(?:marco|agendo|reservo|anoto|registo) (?:entao |ja |assim |desde ja )?(?:para |a |o |na |no |nа |as |às )?(?:segunda|terca|quarta|quinta|sexta|sabado|domingo|dia \d|\d{1,2}[:h]|a sua |a tua |a reuniao|a visita|a primeira|essa|esse)/, label: 'marco entao <dia>' },
  { rx: /\bdeixo (?:entao |ja )?(?:marcad|agendad|reservad)[ao]s? (?:para|a|o|na|no)\b/, label: 'deixo marcado para' },
  { rx: /\b(?:reservo|agendo|programo|anoto|apunto) (?:entonces |ya )?(?:para |el |la |te |le |su |tu )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo|el dia|\d{1,2}[:h]|\d|reunion|cita|visita|primera)/, label: 'reservo el jueves' },
  { rx: /\b(?:te|le|les|os) (?:agendo|reservo|programo|apunto|anoto)\b/, label: 'te agendo' },
  { rx: /\bqueda (?:entonces |ya )?(?:reservad|agendad|programad|confirmad|apuntad)[ao]s? (?:el |la |para |su |tu )/, label: 'queda reservado el' },
  { rx: /\bi(?:'m| am) (?:booking|scheduling|putting|pencil+ing|locking|setting) you (?:in |down |up )?(?:for|on|with)\b/, label: "I'm booking you in for" },
  { rx: /\bi(?:'m| am) (?:booking|scheduling|arranging|setting up|reserving|locking in) (?:that|this|it|the|your|a)\b/, label: "I'm booking that" },
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
