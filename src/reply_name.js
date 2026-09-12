// ============================================================================
// Did the reply address the lead by a name that is not on the row? — shared
// source. Embedded verbatim into ParseClaude and ParseGuardRetry. Unit-tested
// standalone in tests/reply_name.test.js, which loads THIS file.
//
// WHY THIS EXISTS
// On 2026-09-12 every English reply to João Ferreira called him "John". The
// Portuguese and Spanish replies said "João", so the rule looked fixed where
// it could not fail. A name ends up on a contract; a Portuguese agency does
// not localise its buyer's name. The model was not translating on purpose: it
// read "John" in its own earlier English turns and continued its precedent,
// the same class as the booking claim read from its own confirmation. The
// prompt now states the name as data with the precedent override; this is the
// check behind it.
//
// THE DETECTION IS NARROW ON PURPOSE. Only a capitalised word in a
// direct-address position counts: after a greeting word ("Hi John,"), or
// between a comma and a punctuation mark (", John!"). "Great!" at the start
// of a sentence and "Sure, Monday works" do not match. A candidate that is a
// token of the stored name, the assistant's own name, a weekday, a month or
// a place the prompt names is not a mismatch. A false positive costs one
// targeted retry; it never costs a wrong reply. Form, not substance: a second
// miss is delivered with a warning event, never escalated.
// ============================================================================

function deaccentName(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const NAME_ALLOW = new Set(([
  'monday','tuesday','wednesday','thursday','friday','saturday','sunday',
  'segunda','terca','quarta','quinta','sexta','sabado','domingo',
  'lunes','martes','miercoles','jueves','viernes',
  'january','february','march','april','may','june','july','august','september','october','november','december',
  'janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro',
  'enero','febrero','marzo','mayo','junio','julio','septiembre','octubre','noviembre','diciembre',
  'lisbon','lisboa','portugal','cascais','estoril','sintra','oeiras','madrid','europe',
  'ok','okay','yes','no','sim','nao','si','of','the','and','i',
]).map(deaccentName));

// "Hi John," / "Olá João!" / "Hola João," -- a greeting word then the name.
// Built with both spellings of each greeting so the NAME capture can stay
// case-sensitive: a case-insensitive regex would read "hi there" as a name.
const GREET_WORDS = ['hi', 'hello', 'hey', 'dear', 'ola', 'olá', 'hola', 'bom dia', 'boa tarde', 'boa noite',
  'buenos dias', 'buenos días', 'buenas tardes', 'buenas noches', 'obrigado', 'obrigada', 'gracias',
  'thanks', 'thank you', 'welcome back'];
const GREET_RX = new RegExp('\\b(?:' + GREET_WORDS.map(w => w.charAt(0).toUpperCase() + w.slice(1) + '|' + w).join('|')
  + ')\\s+([A-ZÀ-Ý][\\wÀ-ÿ\'-]{1,})', 'g');
// ", John!" / ", João." / ", John —" -- between a comma and a punctuation mark
const COMMA_RX = /,\s+([A-ZÀ-Ý][\wÀ-ÿ'-]{1,})\s*(?:[!.,;:?]|—|–|-)/g;

// nameMismatch(reply, storedName, opts) -> { mismatch, used, candidates }
//
//   reply       the model's reply text
//   storedName  leads.full_name -- ONLY when the lead stated it
//               (qualification.name_source === 'stated'); pass null otherwise
//               and nothing is checked
//   opts.allow  extra words that are never a mismatch: agent name, agency
//               name, configured areas
function nameMismatch(reply, storedName, opts) {
  const out = { mismatch: false, used: null, candidates: [] };
  const stored = String(storedName == null ? '' : storedName).trim();
  if (!stored) return out;
  const text = String(reply == null ? '' : reply);
  const ok = new Set(NAME_ALLOW);
  for (const t of stored.split(/\s+/)) ok.add(deaccentName(t));
  for (const w of ((opts && opts.allow) || [])) for (const t of String(w || '').split(/\s+/)) ok.add(deaccentName(t));

  const seen = [];
  for (const rx of [GREET_RX, COMMA_RX]) {
    rx.lastIndex = 0;
    let m;
    while ((m = rx.exec(text)) !== null) {
      const cand = m[1];
      if (seen.indexOf(cand) === -1) seen.push(cand);
    }
  }
  out.candidates = seen;
  const bad = seen.filter(c => !ok.has(deaccentName(c)));
  if (bad.length) { out.mismatch = true; out.used = bad[0]; }
  return out;
}
