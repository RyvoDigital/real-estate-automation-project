// ============================================================================
// Deterministic language detection for SYSTEM messages — Checkpoint D2.
//
// WHY THIS IS NOT A MODEL CALL
// The handoff note is the message sent when the Concierge cannot answer: the
// model refused, returned unparseable JSON twice, or produced a reply that had
// to be discarded. It is the one message that must still work *when the model
// has failed*, which rules out asking a model — either to write it or to say
// what language to write it in.
//
// So: fixed strings from config, keyed by language, chosen by the rules below.
//
// This is a classifier for THREE known languages on SHORT messages, not a
// general-purpose one. It is allowed to be unsure, and being unsure is safe:
// an undecided result falls back to the client's configured default rather
// than guessing. Sending Portuguese to a Portuguese lead is the win; sending
// Spanish to a Portuguese lead because two words matched is worse than the
// English we send today.
// ============================================================================

// Accented and punctuation marks that occur in ONE of the three languages and
// effectively settle it on their own. Checked before normalisation, because
// stripping diacritics destroys exactly the signal that discriminates pt from
// es -- the two languages that actually get confused.
const HARD_MARKERS = [
  { lang: 'pt', rx: /[ãõ]/, weight: 6 },          // não, mão, então, opções
  { lang: 'pt', rx: /ç/, weight: 5 },             // preço, começar
  { lang: 'es', rx: /ñ/, weight: 6 },             // mañana, año, señor
  { lang: 'es', rx: /[¿¡]/, weight: 6 },          // inverted punctuation
];

// Function words and greetings. Deliberately excludes anything the three share
// (que, para, no, si/sim, por favor, esta) -- a shared word is not evidence.
// Function words. Only DISCRIMINATING tokens: anything the languages share
// (que, para, no, casa, como, por favor) is not evidence and is excluded.
// The pt/es minimal pairs do most of the work here -- com/con, uma/una,
// quando/cuando, muito/mucho -- because those two are the pair that actually
// gets confused.
const WORD_MARKERS = {
  pt: ['nao', 'obrigado', 'obrigada', 'ola', 'voce', 'gostaria', 'queria',
       'muito', 'estou', 'tenho', 'tem', 'quero', 'bom dia', 'boa tarde',
       'boa noite', 'feira', 'imovel', 'imoveis', 'moradia', 'preciso',
       'gostava', 'entao', 'onde', 'com', 'uma', 'um', 'quando', 'quanto',
       'qual', 'mais', 'na', 'nas', 'dos', 'das', 'ate', 'posso', 'pode',
       'procuro', 'visitar', 'marcar', 'falar', 'pessoa', 'afinal', 'mudar'],
  es: ['hola', 'gracias', 'quisiera', 'usted', 'tambien', 'buenos dias',
       'buenas tardes', 'buenas noches', 'vivienda', 'piso', 'necesito',
       'busco', 'con', 'una', 'cuando', 'cuanto', 'donde', 'ahora', 'manana',
       'el', 'los', 'las', 'muy', 'mucho', 'estoy', 'tengo', 'puedo',
       'hablar', 'jueves', 'viernes', 'quiero'],
  en: ['the', 'and', 'you', 'are', 'is', 'would', 'like', 'hello', 'hi',
       'thanks', 'thank', 'please', 'can', 'i', 'im', 'looking', 'house',
       'flat', 'apartment', 'available', 'viewing', 'week', 'time', 'do',
       'have', 'see', 'come', 'speak', 'person', 'anything', 'something'],
};

const SUPPORTED = ['pt', 'en', 'es'];

// detectLanguage(text) -> {lang: 'pt'|'en'|'es'|null, scores, confident}
// Returns null when the evidence is thin or the top two are close. Callers
// must treat null as "use the configured default", never as a language.
function detectLanguage(text) {
  const raw = String(text || '');
  const out = (lang, scores, confident) => ({ lang, scores, confident });
  if (!raw.trim()) return out(null, { pt: 0, en: 0, es: 0 }, false);

  const lower = raw.toLowerCase();
  const scores = { pt: 0, en: 0, es: 0 };

  for (const m of HARD_MARKERS) {
    if (m.rx.test(lower)) scores[m.lang] += m.weight;
  }

  // Normalise for word matching so "voce"/"você" and "manana"/"mañana" both
  // land, having already banked the diacritic evidence above.
  const flat = ' ' + lower.normalize('NFD').replace(/[̀-ͯ]/g, '')
                          .replace(/[^a-z0-9']+/g, ' ').trim() + ' ';
  for (const lang of SUPPORTED) {
    for (const w of WORD_MARKERS[lang]) {
      const needle = w.includes(' ') ? w : ' ' + w + ' ';
      if (flat.includes(needle)) scores[lang] += 2;
    }
  }

  const ranked = SUPPORTED.slice().sort((a, b) => scores[b] - scores[a]);
  const top = ranked[0], second = ranked[1];
  // A single weak hit decides nothing, and a near-tie between pt and es is the
  // case most likely to be wrong. Both fall back rather than guess.
  // Two ways to be sure, and they cover different shapes of message:
  //   - unopposed: any evidence at all for exactly one language, none for the
  //     others. "Ola, procuro casa em Cascais" is short but unambiguous.
  //   - contested: enough evidence AND a clear margin. This is the pt/es case,
  //     where both score and the winner has to actually win.
  // Everything else falls back to the configured default rather than guessing.
  const unopposed = scores[top] >= 2 && scores[second] === 0;
  const contested = scores[top] >= 4 && (scores[top] - scores[second]) >= 4;
  const confident = unopposed || contested;
  return out(confident ? top : null, scores, confident);
}

// pickMessage(messages, lang, fallbackLang) -> string|null
//
// `messages` is the config map, e.g. {pt: '...', en: '...', es: '...'}. Resolution
// order is: detected language -> the client's configured default -> English ->
// whatever single string was configured. Every step is a fixed string; nothing
// here is generated.
function pickMessage(messages, lang, fallbackLang) {
  if (typeof messages === 'string') return messages;          // legacy single string
  if (!messages || typeof messages !== 'object') return null;
  const order = [lang, fallbackLang, 'en', 'pt'];
  for (const k of order) {
    if (k && typeof messages[k] === 'string' && messages[k].trim()) return messages[k];
  }
  const first = Object.values(messages).find(v => typeof v === 'string' && v.trim());
  return first || null;
}

// Convenience: resolve a named system message for a lead's text in one call.
// `cfg` is client_automations.config.
function systemMessage(cfg, name, leadText) {
  const c = cfg || {};
  const det = detectLanguage(leadText);
  const fallback = c.default_language
    || (Array.isArray(c.languages) && c.languages.length ? c.languages[0] : 'en');
  const bag = (c.system_messages || {})[name];
  const picked = pickMessage(bag, det.lang, fallback);
  return {
    text: picked || c.handoff_note || null,
    lang: det.lang || fallback,
    detected: det.lang,
    confident: det.confident,
    scores: det.scores,
  };
}
