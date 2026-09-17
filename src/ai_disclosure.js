// ============================================================================
// AI disclosure — Article 50, Regulation (EU) 2024/1689. Shared source.
//
// Embedded verbatim into AfterBooking, MediaReply and CatchInternal (which
// prepend it), into BuildClaudeRequest (which tells the model a line is coming
// so it does not introduce itself twice), and after invariants.js into
// AssertDelivery (which checks it was actually in the text sent). Unit-tested
// standalone in tests/ai_disclosure.test.js, which loads THIS file.
//
// WHY THIS EXISTS
// Article 50(1) has been directly applicable since 2 August 2026. A person
// must be informed that they are interacting with an AI system "in a clear and
// distinguishable manner, at the latest at the time of the first interaction."
// The Commission reads it as a duty of DESIGN, not a duty of notice: the
// system must be built so the person knows. Until now the Concierge disclosed
// only when asked directly, which does not meet that standard. The duty sits
// with the provider — us, not the agency and not the model vendor. Clause 12
// of the DPA and Clause 10.5 of the service agreement already state that the
// system complies; this file is what makes that true.
//
// WHY IT IS CODE AND NOT A PROMPT RULE (improvements §0.4)
// Two reasons, and the second is the one that settles it.
//
//   1. A prompt rule would ask the model to classify "is this the first turn
//      of this conversation?" — a judgement about conversational state it can
//      only make from a transcript window that is empty on first contact and
//      truncated at 20 messages afterwards. The workflow already knows the
//      answer from a database row. The same category error sank the name rule
//      and the language leak: the model does not perceive its own output as
//      falling under the category.
//   2. THREE OF THE FOUR PATHS THAT REACH A LEAD NEVER CALL THE MODEL. A voice
//      note as a first message is answered by MediaReply; a model failure by
//      SendHandoffNote; an internal throw by SendInternalHandoff. A prompt
//      rule cannot disclose on any of them, by construction.
//
// So: code carries the duty, the prompt carries the taste.
//
// A CLIENT CANNOT CONFIGURE THEMSELVES OUT OF IT
// Unlike system_messages.handoff, where a missing string means fall back, a
// missing or malformed ai_disclosure must NOT mean "no disclosure". The
// defaults below live in code; config may REPLACE the wording per language,
// and a replacement that does not actually disclose is rejected in favour of
// the built-in. The liability is ours, not the client's, so the failure
// direction is fixed.
// ============================================================================

// Bump when the wording changes. Stored on every disclosed message row, so
// "what exactly did you disclose in November" has an answer that does not
// depend on reading config history.
const DISCLOSURE_VERSION = 1;

// Own line, then a blank line, then the message. "Clear and distinguishable"
// is most defensible when the disclosure is VISUALLY distinguishable from the
// conversation: a regulator reading a screenshot sees it at once. It is also
// what makes invariant 6 and the audit query trivial, and it does not compete
// with the model's own greeting the way an in-voice opener does.
const DISCLOSURE_SEP = '\n\n';

// Twilio rejects a WhatsApp body over 1600 characters. A rejected send is no
// disclosure AND no reply, which is worse than either.
const DISCLOSURE_MAX_BODY = 1600;

// Not required by Article 50 — once is legally sufficient — but a lead
// returning after months has plausibly forgotten, and it is cheap.
const DISCLOSURE_GAP_DAYS_DEFAULT = 30;

// {agent} and {agency} are filled from client_automations.config, the same
// values BuildClaudeRequest puts into __AGENT__ and __AGENCY__.
//
// Every language says "not a person" explicitly. That is blunter than a
// marketing instinct would like and it is exactly what Clause 12.3 committed
// us to ("não se apresenta como pessoa humana"). "Virtual assistant" on its
// own is not enough: the term is routinely used of human VAs.
const DEFAULT_DISCLOSURE = {
  pt: '🤖 {agent}, assistente virtual da {agency}. Esta conversa é respondida por '
    + 'inteligência artificial, não por uma pessoa.',
  en: '🤖 {agent}, {agency}’s virtual assistant. This conversation is answered by '
    + 'artificial intelligence, not by a person.',
  es: '🤖 {agent}, asistente virtual de {agency}. Esta conversación la responde una '
    + 'inteligencia artificial, no una persona.',
};

const DISCLOSURE_LANGS = ['pt', 'en', 'es'];

// Why a reason code and not a boolean: the events row and the run payload have
// to say WHICH duty fired, because they are different arguments. first_contact
// is Article 50 itself; handback and gap are ours.
const DISCLOSURE_REASONS = ['first_contact', 'handback', 'gap', 'failsafe'];

function deaccentDisc(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Terms that constitute a disclosure. Checked on the deaccented, lowercased
// text, so "inteligência" and "inteligencia" both land.
const AI_TERMS_FLAT = [
  'inteligencia artificial',      // pt + es
  'artificial intelligence',      // en
  'artificial-intelligence',
  'assistente virtual',           // pt
  'asistente virtual',            // es
  'virtual assistant',            // en
  'assistente automatic',         // pt: automático / automática
  'asistente automatic',          // es
  'automated assistant',          // en
  'sistema automatic',            // pt + es
  'automatic system',
  'chatbot',
  'bot automatic',
];

// The two-letter acronyms are checked CASE-SENSITIVELY on the raw text: a
// case-insensitive \bai\b matches the Portuguese "ai" and the English "Ai" in
// a name, and would let a message that discloses nothing pass invariant 6.
const AI_TERMS_RAW = [/\bAI\b/, /\bIA\b/];

// How much of a message counts as "clear and distinguishable". The banner is
// one line terminated by a blank line; a fixed system note prefixed by it may
// itself run to several lines. Reading only the leading segment is the point:
// an AI term buried in paragraph four is not a disclosure at the time of the
// first interaction.
const DISCLOSURE_LEAD_CHARS = 400;

function disclosureLead(text) {
  const t = String(text == null ? '' : text);
  const para = t.indexOf('\n\n');
  const seg = para > 0 ? t.slice(0, para) : t;
  return seg.slice(0, DISCLOSURE_LEAD_CHARS);
}

// disclosureIn(text) -> boolean. Does the LEADING segment of this text tell
// the reader they are talking to an AI system?
//
// Deliberately matched on terms rather than on the exact configured string:
// migration 0010 wrote down why a body match against config is not a runtime
// mechanism — a client customising their wording must not silently turn the
// check off. This asks the question the regulation asks.
function disclosureIn(text) {
  const seg = disclosureLead(text);
  if (!seg.trim()) return false;
  const flat = deaccentDisc(seg);
  for (const term of AI_TERMS_FLAT) if (flat.indexOf(term) !== -1) return true;
  for (const rx of AI_TERMS_RAW) if (rx.test(seg)) return true;
  return false;
}

// A config override is accepted only if it would itself satisfy invariant 6.
function isValidDisclosure(s) {
  return typeof s === 'string' && s.trim().length > 0 && disclosureIn(s);
}

// disclosureText(cfg, lang, names) -> the banner for ONE language.
//
// Resolution is per-language and NEVER crosses languages: config[lang] if it
// is a real disclosure, else the built-in for that same language. This is
// deliberately different from language.js pickMessage, which falls back to
// another language rather than send nothing. Here there is always something to
// send, so falling back to English for a Portuguese lead would be a worse
// outcome chosen for no reason — an English disclosure to a Portuguese speaker
// is not "clear".
function disclosureText(cfg, lang, names) {
  const c = cfg || {};
  const n = names || {};
  const key = DISCLOSURE_LANGS.indexOf(lang) === -1 ? 'en' : lang;
  const bag = (c.system_messages || {}).ai_disclosure;
  const override = bag && typeof bag === 'object' ? bag[key] : null;
  const raw = isValidDisclosure(override) ? override : DEFAULT_DISCLOSURE[key];
  const agent = String(n.agent || c.agent_name || 'Sofia').trim();
  const agency = String(n.agency || c.agency_name || n.clientName || 'the agency').trim();
  return String(raw).replace(/\{agent\}/g, agent).replace(/\{agency\}/g, agency);
}

// gapExceeded(lastOutboundAt, now, days) -> boolean
function gapExceeded(lastOutboundAt, now, days) {
  if (!lastOutboundAt) return false;
  const then = new Date(lastOutboundAt).getTime();
  const at = new Date(now || Date.now()).getTime();
  if (!Number.isFinite(then) || !Number.isFinite(at)) return false;
  const span = Number(days);
  if (!Number.isFinite(span) || span <= 0) return false;
  return (at - then) >= span * 24 * 60 * 60 * 1000;
}

// shouldDisclose(state) -> { required, reason }
//
//   state.failsafe            the disclosure state could not be read this run
//   state.everDisclosed       a disclosed outbound row exists for this lead
//   state.lastOutboundAt      created_at of the most recent outbound, or null
//   state.lastOutboundOrigin  messages.origin of that row
//   state.gapDays             config.disclosure_gap_days
//   state.now                 clock, injectable for tests
//
// THE PREDICATE IS "HAS A DISCLOSURE BEEN DELIVERED", NOT "IS THIS A NEW LEAD".
// The obvious hook is AfterLead.isNewLead, and it is wrong for the reason §0.1
// exists: it asserts that this run is the first contact rather than verifying
// that the lead has been told. If the very first outbound fails to send, the
// lead row still exists, isNewLead is false forever, and that lead is never
// disclosed to again — a permanent, silent compliance gap. Same family as
// assert-before-verify.
function shouldDisclose(state) {
  const s = state || {};
  const no = { required: false, reason: null };
  // Read failed, or we are on a path that runs before the read. Over-
  // disclosing is cosmetic; under-disclosing is the violation, so the failure
  // direction is fixed here rather than left to the caller.
  if (s.failsafe) return { required: true, reason: 'failsafe' };
  if (!s.everDisclosed) return { required: true, reason: 'first_contact' };
  // A lead who has been talking to a person from the cockpit and is handed
  // back has a demonstrably wrong belief about who is replying. messages.origin
  // already records it, so the trigger is free. Note 'handoff' is NOT a
  // handback: the fixed note is the AI system's own output, not a human's.
  if (s.lastOutboundOrigin === 'human') return { required: true, reason: 'handback' };
  const days = Number.isFinite(Number(s.gapDays)) && Number(s.gapDays) > 0
    ? Number(s.gapDays) : DISCLOSURE_GAP_DAYS_DEFAULT;
  if (gapExceeded(s.lastOutboundAt, s.now, days)) return { required: true, reason: 'gap' };
  return no;
}

// withDisclosure(banner, body, max) ->
//   { text, applied, overLimit, droppedChars }
//
// The banner is prepended, never merged. Keeping it in its own field until the
// send is deliberate: concatenating earlier would push our own constant through
// AssertInvariants, whose detectors (timesNamedIn, moneyAmountsIn, nameMismatch)
// would then read it as if the model had written it.
//
// On the 1600-character limit the order of sacrifice is fixed: the disclosure
// is a legal duty and the reply is the model's, which is specified to be one
// to three short sentences. So the BODY is trimmed at a word boundary and the
// caller is told, loudly, via overLimit. If this ever fires in production
// something upstream is wrong and the warning event is how we find out.
function withDisclosure(banner, body, max) {
  const b = String(body == null ? '' : body);
  const pre = String(banner == null ? '' : banner).trim();
  const cap = Number.isFinite(Number(max)) && Number(max) > 0 ? Number(max) : DISCLOSURE_MAX_BODY;
  if (!pre) return { text: b, applied: false, overLimit: false, droppedChars: 0 };

  const full = pre + DISCLOSURE_SEP + b;
  if (full.length <= cap) return { text: full, applied: true, overLimit: false, droppedChars: 0 };

  const room = cap - pre.length - DISCLOSURE_SEP.length - 1;   // 1 for the ellipsis
  if (room <= 0) {
    // Pathological: the banner alone fills the message. Send the banner.
    return { text: pre.slice(0, cap), applied: true, overLimit: true, droppedChars: b.length };
  }
  let cut = b.slice(0, room);
  const sp = cut.lastIndexOf(' ');
  if (sp > room * 0.6) cut = cut.slice(0, sp);
  cut = cut.replace(/[\s,;:.–—-]+$/, '') + '…';
  return { text: pre + DISCLOSURE_SEP + cut, applied: true, overLimit: true,
           droppedChars: b.length - cut.length + 1 };
}

// disclosureRecord(reason, lang) -> the value for messages.disclosure and the
// events row. Small on purpose: it is written on every disclosed message.
function disclosureRecord(reason, lang) {
  return { v: DISCLOSURE_VERSION,
           lang: DISCLOSURE_LANGS.indexOf(lang) === -1 ? 'en' : lang,
           reason: DISCLOSURE_REASONS.indexOf(reason) === -1 ? 'first_contact' : reason };
}

// renderDisclosureNote() -> the line BuildClaudeRequest appends on a turn that
// will carry a banner. A STATEMENT OF FACT, not a rule (§0.4): the model is
// told what is happening to its output, not forbidden from doing something.
// If it ignores this the result is a cosmetic double greeting, never a
// compliance failure — the duty is discharged by the prepend regardless.
function renderDisclosureNote() {
  return '\n\nDISCLOSURE LINE: a fixed line identifying you as an automatic assistant is sent '
    + 'immediately above this reply, on its own line. It is already there — do not write it '
    + 'yourself, and do not introduce yourself again. Begin as you normally would.';
}

// disclosureStateFrom(discRows, historyRows, cfg, now) -> the state object
// shouldDisclose() reads. Assembled from two things the workflow already has:
//
//   discRows     ReadDisclosureState: the most recent outbound row for this
//                lead carrying a disclosure, unbounded lookback, limit 1.
//                A dedicated indexed read, because "has this lead EVER been
//                told" cannot be answered from a 20-message window.
//   historyRows  LoadHistory: the last 20 messages, already loaded for the
//                transcript. The handback and gap triggers only need the most
//                recent OUTBOUND row, which is in that window whenever one
//                exists at all in recent traffic — so they cost nothing.
//
// Sorted defensively rather than trusting the caller's order: LoadHistory asks
// for created_at.desc, but a node that reverses it for the transcript is one
// refactor away, and reading the oldest outbound as the newest would silently
// invert both triggers.
// A named function rather than a two-parameter arrow: every embedded source
// shares one top-level scope inside the n8n node, and tests/lint_code_nodes.js
// cannot read the first parameter of an inline `(x, y) =>` as a declaration.
function newestFirst(rowX, rowY) {
  return String(rowY.created_at).localeCompare(String(rowX.created_at));
}

function disclosureStateFrom(discRows, historyRows, cfg, now) {
  const c = cfg || {};
  const disc = Array.isArray(discRows) ? discRows : [];
  const hist = Array.isArray(historyRows) ? historyRows : [];
  const outbound = hist
    .filter(r => r && r.direction === 'outbound' && r.created_at)
    .sort(newestFirst);
  const last = outbound.length ? outbound[0] : null;
  return {
    everDisclosed: disc.length > 0,
    lastOutboundAt: last ? (last.created_at || null) : null,
    lastOutboundOrigin: last ? (last.origin || null) : null,
    gapDays: c.disclosure_gap_days,
    now: now || new Date().toISOString(),
    failsafe: false,
  };
}

// disclosurePayload(decision, state, lang, applied, sentText) -> the block that
// goes on automation_runs.payload as `disclosure`, and which invariant 6 reads
// back. `sent_head` is the LEADING SEGMENT OF THE TEXT ACTUALLY SENT, recorded
// only when a disclosure was required: the check has to read the wire, not a
// flag the sender set about itself (§0.7). When nothing was required there is
// nothing to prove and the lead's words are not copied into the run row.
function disclosurePayload(decision, state, lang, applied, sentText) {
  const dec = decision || {};
  const st = state || {};
  const out = {
    required: !!dec.required,
    reason: dec.reason || null,
    ever_before: st.everDisclosed === true,
    last_origin: st.lastOutboundOrigin || null,
    last_outbound_at: st.lastOutboundAt || null,
  };
  if (!dec.required) return out;
  out.lang = lang || null;
  out.v = DISCLOSURE_VERSION;
  out.applied = applied === true;
  out.sent_head = disclosureLead(sentText);
  return out;
}
