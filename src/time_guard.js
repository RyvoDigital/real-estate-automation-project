// ============================================================================
// The never-invent-a-time guard. Shared source.
//
// Embedded verbatim into ParseClaude and ParseGuardRetry, replacing the
// timesNotSupplied() each node carried inline. Unit-tested standalone in
// tests/time_guard.test.js, which loads THIS file.
//
// THE RULE (unchanged since 2026-09-12): a time in the reply must be one the
// workflow supplied. If none was supplied, no time may appear at all. A
// rejection routes into the guard retry, and escalates if the retry fails too.
//
// THE ONE EXEMPTION (2026-09-21): a time the LEAD named in their own message
// may appear in a clause that DECLINES it. Live check 2 of the language
// deploy: the lead asked "11:00?", 09:00 and 10:00 were offered, and both of
// the model's replies said, correctly, "11:00 isn't available, but I do have
// … 09:00 … or 10:00". The guard rejected both, because it could not tell
// NAMING a time from DECLINING one, and the lead was escalated for asking an
// ordinary question.
//
// WHAT THE EXEMPTION MUST NOT OPEN, in order of danger:
//   * accepting the lead's unoffered time: "11:00 it is", "11:00 works";
//   * declining it in one clause and affirming it in the next: "11:00 isn't
//     possible on Wednesday, but Thursday at 11:00 works". So the decision is
//     taken PER OCCURRENCE, in the clause around it, not per sentence;
//   * declining a time the lead never asked for, which is still the model
//     talking about a time nobody supplied;
//   * an invented alternative in a declining sentence: "11:00 isn't
//     available, but 14:00 is".
// Clauses split on contrast words and dashes, NOT on plain commas:
// "11:00, unfortunately, is taken" is one clause, and must stay one.
// ============================================================================

const TG_TIME_RX = /\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/g;

function tgNorm(h, m) { return String(Number(h)) + ':' + m; }

function tgTimesIn(s) {
  const out = [];
  const rx = new RegExp(TG_TIME_RX.source, 'g');
  let m;
  while ((m = rx.exec(String(s == null ? '' : s))) !== null) out.push(tgNorm(m[1], m[2]));
  return out;
}

// A clause that declines. Deaccented, lower-cased text. Each language's forms,
// singular and plural. The list is measured against real replies in
// tests/time_guard.test.js; a shape it misses is a false escalation (annoying),
// never a false acceptance, because the exemption only ever ALLOWS a declined
// time the lead asked for.
const TG_DECLINE_RX = new RegExp([
  // en. A negation counts only when it governs an availability word: "no
  // problem, 17:00 then" must never read as a decline.
  "\\b(?:isn'?t|is not|aren'?t|are not|not|no longer|won'?t be|can'?t (?:do|offer|make)|cannot (?:do|offer|make))\\b[^.;]{0,30}?\\b(?:available|free|possible|an option|open|doable)\\b",
  "\\bnot available\\b", "\\bunavailable\\b", "\\bunfortunately\\b", "\\bsadly\\b", "\\bi'?m afraid\\b",
  "\\b(?:already (?:taken|booked)|fully booked|booked up|is taken|are taken)\\b",
  "\\bno (?:availability|slot|slots|opening|openings)\\b",
  "\\b(?:don'?t|do not) have (?:availability|anything|a slot|slots|that time|an opening)\\b",
  "\\b(?:can'?t|cannot) offer\\b",
  // pt. Same rule: "nao ha problema" is not a decline.
  "\\bnao (?:esta|estao|temos|tenho|ha|existe|existem|e|sera|fica|ficam)\\b[^.;]{0,25}?\\b(?:disponiv|disponibilidade|livre|possiv|vaga|aberto|opcao)",
  "\\bindisponive(?:l|is)\\b", "\\binfelizmente\\b",
  "\\bja (?:esta|estao) (?:ocupad|preenchid|reservad)", "\\b(?:esta|estao) (?:ocupad|preenchid)",
  "\\bsem disponibilidade\\b", "\\bnao (?:consigo|conseguimos|posso|podemos) (?:oferecer|marcar|agendar|disponibilizar)",
  // es. "no hay problema" is not a decline.
  "\\bno (?:esta|estan|tenemos|tengo|hay|es|sera|queda|quedan)\\b[^.;]{0,25}?\\b(?:disponib|libre|posible|hueco|opcion)",
  "\\blamentablemente\\b", "\\bdesafortunadamente\\b", "\\bpor desgracia\\b",
  "\\bya (?:esta|estan) (?:ocupad|reservad|complet)", "\\b(?:esta|estan) (?:ocupad|complet)",
  "\\bsin disponibilidad\\b", "\\bno (?:puedo|podemos) (?:ofrecer|agendar|reservar)",
].join('|'));

// Contrast words and dashes end a clause. Deaccented text.
const TG_CLAUSE_SPLIT_RX = /\s*;\s*|\s+[-–—]\s+|\s*—\s*|,?\s+\b(?:but|however|though|although|whereas|instead|mas|porem|contudo|no entanto|pero|sin embargo|en cambio)\b/;

function tgDeaccent(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// timesNotSupplied(reply, slots, leadText) -> the times the reply named that
// nothing supplied, e.g. ['14:00']. Empty means the reply passes.
//   slots     [{timeLocal: 'HH:MM'}, ...]: offered, booked or stored times
//   leadText  the lead's current message (optional: without it there is no
//             exemption, which is the pre-2026-09-21 behaviour)
function timesNotSupplied(reply, slots, leadText) {
  const supplied = new Set();
  for (const s of (slots || [])) {
    const m = String((s && s.timeLocal) || '').match(/^(\d{1,2}):(\d{2})$/);
    if (m) supplied.add(tgNorm(m[1], m[2]));
  }
  const leadTimes = new Set(tgTimesIn(leadText));
  const bad = new Set();
  const sentences = String(reply == null ? '' : reply).split(/(?<=[.!?\n])\s+|\n+/);
  for (const sentence of sentences) {
    for (const clause of tgDeaccent(sentence).split(TG_CLAUSE_SPLIT_RX)) {
      if (!clause) continue;
      const declines = TG_DECLINE_RX.test(clause);
      for (const t of tgTimesIn(clause)) {
        if (supplied.has(t)) continue;
        if (declines && leadTimes.has(t)) continue;
        bad.add(t);
      }
    }
  }
  return [...bad];
}
