// ============================================================================
// Is there a property to view, or only a lead to meet? — shared source.
//
// Embedded verbatim into BuildClaudeRequest (which decides) and into
// ParseClaude / ParseGuardRetry (which check the reply). Unit-tested standalone
// in tests/appointment_kind.test.js, which loads THIS file rather than a copy.
//
// WHY THIS EXISTS
// On 2026-09-05 the Concierge sent a real lead:
//     "A sua visita esta confirmada para sexta-feira, dia 11 de setembro,
//      as 10:00, hora de Lisboa."
// The calendar half was correct: the slot was genuinely free, the event was
// created, the agent was notified. The CLAIM was not. Nobody -- not the lead,
// not an agent, not the Concierge -- had ever named a property. It booked a
// viewing of nothing, and the lead would have found out on the doorstep.
//
// engineering-lessons.md §0: never let a generated message narrate a future you
// have not secured. A property nobody has named is a future nobody has secured.
//
// THE RULE
// Unless a specific property has been named in the conversation, the
// appointment is a FIRST MEETING with an agent, and must be described as one.
// That is normal in this market and, unlike "visita", it is true. "visita" /
// "viewing" is reserved for when a property has a name.
//
// THE BIAS IS ONE-DIRECTIONAL, and deliberately so -- the same rule that
// governs matchConfirmation(). When in doubt it is a MEETING:
//   - calling a real viewing a meeting UNDER-describes an appointment that is
//     going to happen anyway. A human corrects it in one message.
//   - calling a meeting a viewing INVENTS a property. Nothing downstream can
//     correct that, because the lead has already been told.
// Every unknown below therefore resolves to 'meeting'.
//
// WHY NOT ASK THE MODEL
// Same reason the workflow picks the slots and the model only phrases them: the
// appointment kind decides what goes in a real agent's calendar and what a
// prospect is told. It has to be answerable from stored data. Asking the model
// "was a property discussed?" would make the guard depend on the judgement it
// exists to not trust.
// ============================================================================

// ---------------------------------------------------------------------------
// A listing reference is the only thing that counts as "a property has a name".
//
// An address or a house name ("a moradia na Rua das Flores") would need
// judgement to recognise, and judgement here means a model. So they are NOT
// detected, and such a conversation books a meeting. That is the safe
// direction and it is an honest under-description, not a wrong one.
//
// Two forms:
//   bare      A-1042, LX-2001            uppercase block, dash, 3-5 digits
//   keyword   Ref B-2001, referencia 10234, reference: LX88
// The bare form is case-SENSITIVE on purpose. Lowercase "t-3000" in prose is
// far more likely to be noise than a reference; a real one is written in caps
// or introduced by the word "ref".
// ---------------------------------------------------------------------------
const REF_BARE = /\b[A-Z]{1,3}-\d{3,5}\b/g;
const REF_KEYWORD =
  /\b(?:ref|refa|referencia|reference)\b\.?\s*[:#-]?\s*([A-Za-z]{0,4}-?\d{2,6}[A-Za-z]?)\b/gi;

function deaccent(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// findPropertyRefs(text) -> array of normalised reference strings (may be empty)
function findPropertyRefs(text) {
  const raw = String(text == null ? '' : text);
  if (!raw.trim()) return [];
  const found = [];
  const add = (v) => {
    const s = String(v).toUpperCase().replace(/\s+/g, '');
    if (s && found.indexOf(s) === -1) found.push(s);
  };

  // Bare form reads the ORIGINAL text: case is part of the signal.
  let m;
  REF_BARE.lastIndex = 0;
  while ((m = REF_BARE.exec(raw)) !== null) add(m[0]);

  // Keyword form reads the de-accented text so "referencia" and "referência"
  // are the same word.
  const flat = deaccent(raw);
  REF_KEYWORD.lastIndex = 0;
  while ((m = REF_KEYWORD.exec(flat)) !== null) add(m[1]);

  return found;
}

// ---------------------------------------------------------------------------
// appointmentKindFor(rows) -> {kind: 'viewing'|'meeting', refs: [...]}
//
// `rows` are message rows: {direction, body, ai_generated}.
//
// THE CONCIERGE'S OWN WORDS ARE NOT EVIDENCE. It has no inventory, so any
// reference it produced would be one it invented -- and trusting it would
// re-open exactly this defect one layer down. Outbound rows count only when
// they are explicitly marked as NOT ai_generated, which is a human agent
// replying from the cockpit (or a fixed config string, which never carries a
// reference). An outbound row whose origin cannot be established is ignored:
// if `ai_generated` is missing from the query, every conversation books a
// meeting, which is the fail-SAFE direction rather than the fail-open one.
// ---------------------------------------------------------------------------
function appointmentKindFor(rows) {
  const refs = [];
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r) continue;
    if (r.direction === 'outbound' && r.ai_generated !== false) continue;
    for (const ref of findPropertyRefs(r.body)) {
      if (refs.indexOf(ref) === -1) refs.push(ref);
    }
  }
  return { kind: refs.length ? 'viewing' : 'meeting', refs };
}

// ---------------------------------------------------------------------------
// viewingClaim(reply) -> the offending phrase, or null.
//
// The prompt tells the model which kind of appointment this is. This is the
// CHECK, not a better prompt -- §11 instance 11: when wording cannot hold a
// line reliably, replace it with something that fails loudly. The model wrote
// "a sua visita esta confirmada" under a prompt that already forbade asserting
// things it could not see.
//
// Applied only when the kind is 'meeting'. A rejection routes into the existing
// guard-retry; if the retry also claims a viewing, the turn escalates and NO
// booking is created -- a human holds a lead who is ready to book, which is a
// recoverable outcome, unlike the message this guard prevents.
//
// The list is not exhaustive and is not meant to be. It covers the words that
// NAME the appointment in the three languages the Concierge speaks. Paraphrases
// it misses are caught, if at all, by the prompt -- this is the backstop, and a
// backstop that tried to be complete would start rejecting honest sentences.
// ---------------------------------------------------------------------------
const VIEWING_WORDS = [
  // pt/es visita, visitas, visitar, visita-la; en visit, visits, visiting
  { rx: /\bvisit\w*/, label: 'visit*' },
  { rx: /\bviewings?\b/, label: 'viewing' },
  { rx: /\bview the\b/, label: 'view the' },
  { rx: /\bver (?:o|a|os|as|el|la|los|las) (?:imovel|imoveis|casa|moradia|apartamento|andar|vivienda|piso|propriedade|propiedad)\b/,
    label: 'ver o imovel' },
  { rx: /\bsee the (?:property|house|apartment|flat|villa)\b/, label: 'see the property' },
];

function viewingClaim(reply) {
  const t = deaccent(reply).toLowerCase();
  if (!t.trim()) return null;
  for (const w of VIEWING_WORDS) {
    const m = t.match(w.rx);
    if (m) return m[0];
  }
  return null;
}
