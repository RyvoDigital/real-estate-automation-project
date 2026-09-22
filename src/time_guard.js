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
//
// NEGATION THAT GOVERNS THE TIME (2026-09-21, the first deploy gate). The
// model declined "11:00?" with "09:00 or 10:00 are available, but not 11:00",
// the guard rejected that and the retry, and the lead was escalated. This was
// the third decline shape the wording list missed ("quedamos entonces", then
// the plurals, now "but not X"). So instead of another phrase, a second test
// is added, taken PER OCCURRENCE: does a negation stand directly in front of
// THIS time, with nothing between them except a preposition or a day?
//   en  not (at) 11:00 · except (for) 11:00 ·
//       don't have an 11:00 · can't do 11:00 · no 11:00 slot
//   pt  não às 11:00 · menos às 11:00 · exceto / salvo às 11:00 ·
//       não consigo marcar às 11:00
//   es  no a las 11:00 · excepto / salvo / menos a las 11:00 ·
//       no puedo ofrecer las 11:00
// The rule is unchanged: the time must be one the LEAD named. And the
// negation must govern it:
//   * "why not 11:00", "if not 11:00", "porque não às 11:00", "¿por qué no a
//     las 11:00?" are proposals, never declines;
//   * "pelo menos às 11:00", "al menos a las 11:00" mean "at least", and
//     "mais ou menos", "más o menos" mean "around";
//   * "apart from", "other than", "besides", "tirando" are left out: "apart
//     from 11:00 we also have 09:00" ADDS the time rather than declining it;
//   * an EXCEPT that carves the time out of something UNAVAILABLE, or out of
//     a negation, or that sits beside "also", affirms it: "everything except
//     11:00 is taken", "nothing is free except 11:00". That is a rejection even when the
//     clause also reads as a decline. The clause-level rule alone accepted it
//     before 2026-09-21.
// ============================================================================

const TG_TIME_RX = /\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/g;

function tgNorm(h, m) { return String(Number(h)) + ':' + m; }

function tgTimesIn(s) {
  return tgTimesAt(s).map(x => x.t);
}

// Every time in s, with where it starts: [{ t: '11:00', i: 17 }].
function tgTimesAt(s) {
  const out = [];
  const rx = new RegExp(TG_TIME_RX.source, 'g');
  let m;
  while ((m = rx.exec(String(s == null ? '' : s))) !== null) out.push({ t: tgNorm(m[1], m[2]), i: m.index });
  return out;
}

// What may stand between a negation and the time it governs: a day ("on
// Thursday", "na quinta dia 24", "el jueves 24 de septiembre") and a
// preposition ("at", "às", "a las"). Nothing else. Deaccented text.
const TG_DAY = '(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day|(?:segunda|terca|quarta|quinta|sexta)(?:-feira)?|sabado|domingo|lunes|martes|miercoles|jueves|viernes)';
const TG_BRIDGE = '(?:(?:(?:on|this|next|na|no|nesta|neste|el|este)\\s+)?' + TG_DAY +
  '(?:\\s+(?:dia\\s+)?\\d{1,2}(?:\\s+(?:de\\s+)?[a-z]+)?)?\\s+)?' +
  '(?:(?:at|for|the|as|a|pelas|para as|a las|las|a la|para las)\\s+)?$';
// The negation words themselves, one per language, with the forms that do NOT
// negate what follows. Shared: the time guard's rule below and tgNegatedBefore()
// (which src/booking_claim.js calls) read these three and no other list.
// en. Not "why not", "if not", "or not", "whether not".
const TG_NEG_EN = "(?<!\\b(?:why|if|or|whether)\\s)\\bnot";
// pt. Not "porque não", "por que não", "se não", "ou não".
const TG_NEG_PT = "(?<!\\b(?:porque|por que|se|ou)\\s)\\bnao";
// es. Not "por qué no", "porque no", "si no", "o no".
const TG_NEG_ES = "(?<!\\b(?:por que|porque|si|o)\\s)\\bno";
// en contractions ("isn't", "won't"). NOT part of the time guard's own rule (its
// decline list carries those forms itself); shared for src/appointment_kind.js's
// viewing guard (22 Sep 2026), so "this isn't a viewing" is read as a denial.
const TG_NEG_EN_NT = "\\b(?:is|are|was|were|does|do|did|would|will|wo|could|ca)n'?t";
// A negation that governs the time after it.
const TG_NOT_BEFORE_RX = new RegExp('(?:' + [
  TG_NEG_EN,
  "\\b(?:(?:don'?t|do not|doesn'?t|does not)\\s+have|have no|haven'?t got)(?:\\s+(?:an?|the|any))?",
  "\\b(?:can'?t|cannot|can not)\\s+(?:do|offer|make|book)",
  TG_NEG_PT,
  "\\bnao\\s+(?:consigo|conseguimos|posso|podemos)\\s+(?:fazer|oferecer|marcar|agendar)",
  "\\bnao\\s+(?:tenho|temos|ha)(?:\\s+(?:vaga|disponibilidade))?",
  // es. A bare "no" governs only through a preposition: "pero no a las 11:00".
  TG_NEG_ES + "(?=\\s+(?:(?:a las|las|para las|a la)\\s+$|(?:el\\s+)?" + TG_DAY + "))",
  "\\bno\\s+(?:puedo|podemos)\\s+(?:hacer|ofrecer|agendar|reservar)",
  "\\bno\\s+(?:tengo|tenemos|hay)(?:\\s+(?:hueco|disponibilidad))?",
].join('|') + ')\\s+' + TG_BRIDGE);
// Does a negation govern whatever starts right after `before`? Deaccented,
// lower-cased text. The negation must END the text, optionally followed by one
// adverb: "ainda nao temos uma reuniao marcada" is negated at "temos"; "nao, temos
// a reuniao marcada" is not (the comma ends the negation's reach), and neither is
// "nao se preocupe, temos a reuniao marcada". Added 22 Sep 2026 for the claim
// guard (src/booking_claim.js): "Ainda não temos uma reunião marcada, João. Posso
// propor..." was read as a claim, both drafts rejected, the lead handed over
// (the booking gate, run 8).
const TG_NEGATED_BEFORE_RX = new RegExp('(?:' + [TG_NEG_EN, TG_NEG_PT, TG_NEG_ES].join('|') +
  ')\\s+(?:(?:ainda|ja|aun|todavia|yet|still|really|actually)\\s+)?$');
function tgNegatedBefore(before) {
  return TG_NEGATED_BEFORE_RX.test(String(before == null ? '' : before));
}

// "except" and its kin. They decline the time only when the rest of the clause
// is not about something UNAVAILABLE: "any time except 11:00" declines it,
// "everything except 11:00 is taken" offers it.
const TG_EXCEPT_BEFORE_RX = new RegExp('(?:' + [
  '\\bexcept(?:\\s+for)?',
  '\\b(?:exceto|excepto|salvo)', '(?<!\\b(?:pelo|ao|a|de|al|lo|o|ou)\\s)\\bmenos',
].join('|') + ')\\s+' + TG_BRIDGE);
const TG_UNAVAILABLE_RX = /\b(?:(?:taken|booked|full|unavailable|gone|not (?:available|free|open)|isn'?t (?:available|free|open)|aren'?t (?:available|free|open)|no longer)\b|ocupad|reservad|preenchid|lotad|complet|indisponiv|(?:nao|no) (?:esta|estao|estan|ha|hay) (?:disponiv|disponib|livre|libre))/;
// Before an except: a negation or "only" turns the except into an offer.
const TG_EXCEPT_INVERTS_RX = /\b(?:not|no|nothing|none|cannot|only|nao|nada|nenhum\w*|sem|apenas|so|sin|ningun\w*|solo|solamente)\b|n't\b/;
// Anywhere in the clause: an except beside "also" adds the time.
const TG_ADDITIVE_RX = /\b(?:also|too|as well|tambem|alem|tambien|ademas)\b/;
// After the time: "there's no 11:00 slot", "no 11:00 opening".
const TG_NO_BEFORE_RX = /\bno\s+$/;
const TG_SLOT_AFTER_RX = /^\s*(?:slot|opening|appointment|availability)\b/;

// governs(clause, i) -> 'declined' | 'carved' | null, for the time at clause[i].
function tgGoverned(clause, i) {
  const before = clause.slice(0, i);
  const after = clause.slice(i).replace(/^\S+/, '');
  const ex = before.match(TG_EXCEPT_BEFORE_RX);
  if (ex) {
    const lead = before.slice(0, ex.index);
    return (TG_UNAVAILABLE_RX.test(clause) || TG_EXCEPT_INVERTS_RX.test(lead) || TG_ADDITIVE_RX.test(clause)) ? 'carved' : 'declined';
  }
  if (TG_NOT_BEFORE_RX.test(before)) return 'declined';
  if (TG_NO_BEFORE_RX.test(before) && TG_SLOT_AFTER_RX.test(after)) return 'declined';
  return null;
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
  "\\bnot available\\b", "\\bunavailable\\b",
  "\\b(?:already (?:taken|booked)|fully booked|booked up|is taken|are taken)\\b",
  "\\bno (?:availability|slot|slots|opening|openings)\\b",
  "\\b(?:don'?t|do not) have (?:availability|anything|a slot|slots|that time|an opening)\\b",
  "\\b(?:can'?t|cannot) offer\\b",
  // 22 Sep 2026: the slot another lead has just taken. TAKEN and GONE only, never
  // "booked": a decline lets the lead's own time through, and "your meeting was
  // just booked for 11:00" must never be read as one.
  "\\b(?:was|were|has been|have been|got) (?:just )?taken\\b(?! care)", "\\bjust (?:been |got )?(?:taken|gone)\\b(?! care)",
  "\\b(?:has|have) (?:just )?gone\\b",
  "\\b(?:taken|booked|reserved) by (?:someone else|somebody else|another (?:client|person|customer|lead))\\b",
  // pt. Same rule: "nao ha problema" is not a decline.
  "\\bnao (?:esta|estao|temos|tenho|ha|existe|existem|e|sera|fica|ficam)\\b[^.;]{0,25}?\\b(?:disponiv|disponibilidade|livre|possiv|vaga|aberto|opcao)",
  "\\bindisponive(?:l|is)\\b",
  "\\bja (?:esta|estao) (?:ocupad|preenchid|reservad)", "\\b(?:esta|estao) (?:ocupad|preenchid)",
  "\\bsem disponibilidade\\b", "\\bnao (?:consigo|conseguimos|posso|podemos) (?:oferecer|marcar|agendar|disponibilizar)",
  // 22 Sep 2026: "ficou ocupado", "acabou de ser ocupado". Never "marcado": see en.
  // "Reservado" only with WHO took it: "acabou de ser reservado por outra pessoa"
  // (the booking gate, run 5). Kept narrow: someone ELSE, never the lead's own booking.
  "\\b(?:reservad|marcad|ocupad)[oa]s? por (?:outra pessoa|outro cliente|outra cliente|outras pessoas|alguem)\\b",
  "\\b(?:ficou|ficaram|foi|foram) (?:entretanto |agora |ja )?(?:ocupad|preenchid)", "\\bacab(?:ou|aram) de (?:ser |ficar )?(?:ocupad|preenchid)",
  // es. "no hay problema" is not a decline.
  "\\bno (?:esta|estan|tenemos|tengo|hay|es|sera|queda|quedan)\\b[^.;]{0,25}?\\b(?:disponib|libre|posible|hueco|opcion)",
  "\\bya (?:esta|estan) (?:ocupad|reservad|complet)", "\\b(?:esta|estan) (?:ocupad|complet)",
  "\\bsin disponibilidad\\b", "\\bno (?:puedo|podemos) (?:ofrecer|agendar|reservar)",
  // 22 Sep 2026, the booking gate's run 9: "Ese horario de las 16:00 se acaba de
  // ocupar"; run 6: "acaba de ocuparse". Never "reservado" alone: see en.
  "\\b(?:reservad|ocupad|cogid)[oa]s? por (?:otra persona|otro cliente|otra clienta|otras personas|alguien)\\b",
  "\\bse (?:acaba|acaban) de ocupar\\b", "\\bacaba(?:n)? de ocupar(?:se)?\\b", "\\bacaba(?:n)? de (?:ser |quedar )?ocupad", "\\bse (?:ocupo|ocuparon)\\b", "\\b(?:quedo|quedaron) (?:ya )?ocupad",
].join('|'));

// Contrast words and dashes end a clause. Deaccented text.
const TG_CLAUSE_SPLIT_RX = /\s*;\s*|\s+[-–—]\s+|\s*—\s*|,?\s+\b(?:but|however|though|although|whereas|instead|mas|porem|contudo|no entanto|pero|sin embargo|en cambio)\b/;

// Typographic apostrophes are folded to ' before any pattern runs (21 Sep 2026,
// the gate that passed 61f50cc: "11:00 isn’t available", U+2019, was rejected
// because every pattern here is written with a straight quote).
function tgDeaccent(s) {
  return String(s == null ? '' : s).replace(/[\u2018\u2019\u201B\u02BC\u2032\uFF07\u00B4\u0060]/g, "'")
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Which time each clause-level decline is ABOUT: the occurrence nearest to it.
// Before 2026-09-21 (the first deploy gate) a decline anywhere in the clause
// exempted every lead-named time in it, so "10:00 isn't available, so 11:00 it
// is" let 11:00 through. And the bare sentiment words ("unfortunately",
// "infelizmente", "lamentablemente"...) no longer decline on their own:
// "Sadly I had to move things, 11:00 is yours" was accepted.
// -> Set of the start indexes of declined occurrences.
function tgDeclinedOccurrences(clause, times) {
  const out = new Set();
  if (!times.length) return out;
  const rx = new RegExp(TG_DECLINE_RX.source, 'g');
  let m;
  while ((m = rx.exec(clause)) !== null) {
    const a = m.index, b = m.index + m[0].length;
    let best = null, bestD = Infinity;
    for (const x of times) {
      const e = x.i + x.t.length;
      const d = e <= a ? a - e : (x.i >= b ? x.i - b : 0);
      if (d < bestD) { bestD = d; best = x; }
    }
    if (best) out.add(best.i);
    if (m[0].length === 0) rx.lastIndex++;
  }
  return out;
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
      const times = tgTimesAt(clause);
      const declinedAt = tgDeclinedOccurrences(clause, times);
      for (const { t, i } of times) {
        if (supplied.has(t)) continue;
        if (!leadTimes.has(t)) { bad.add(t); continue; }
        const governed = tgGoverned(clause, i);
        if (governed === 'declined') continue;
        if (governed === 'carved') { bad.add(t); continue; }
        if (declinedAt.has(i)) continue;
        bad.add(t);
      }
    }
  }
  return [...bad];
}
