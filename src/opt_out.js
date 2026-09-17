// >>> EMBED src/opt_out.js >>>
// ============================================================================
// Opt-out recognition — Stage 1, piece 1. Shared source, dependency-free so it
// can be embedded in an n8n code node.
//
// WHY THIS RETURNS THREE ANSWERS AND NOT A BOOLEAN
// Suppression is two separate actions and only one of them is reversible:
//
//   HALT      stop sending. Cheap, instant, undone by a human in a second.
//   OBJECTION write `kind='objection'` to the ledger. PERMANENT -- rule 1 of
//             the derivation never lets a later consent overturn it, and
//             consent_events refuses UPDATE and DELETE. There is no taking it
//             back.
//
// The specification said "when in doubt, treat it as an opt-out", on the
// reasoning that a false positive costs one contact and a false negative costs
// a complaint. That was right when an opt-out was a mutable column. It is wrong
// now: a false positive writes an IRREVERSIBLE record, and a lead who wrote
// "não quero perder esta oportunidade" would be suppressed for ever while the
// system looked like it was working.
//
// So the doubt resolves differently for each half:
//
//   'opt_out'      HALT and write the objection. Unambiguous.
//   'unclear'      HALT, escalate to a human, write NOTHING. Nobody receives
//                  another message, and no permanent record rests on a guess.
//                  A false positive here costs a pause.
//   'not_opt_out'  Carry on.
//
// That keeps both safety properties at once, and it is only available because
// halting and recording were separated. Anything that collapses this back into
// a boolean re-creates the defect.
//
// WHY MATCHING IS STRUCTURAL RATHER THAN A SUBSTRING SEARCH
// Every keyword here appears inside sentences that mean the opposite:
//   "stop me if I am wrong"            contains STOP
//   "não quero perder esta oportunidade"  contains "não quero"
//   "não quero uma casa com jardim"       contains "não quero"
// A keyword therefore only counts when it is the WHOLE message, and a negation
// of wanting only counts when what is not wanted is CONTACT -- messages, being
// written to, being telephoned. "I do not want to lose this" negates a verb we
// have no interest in.
// ============================================================================

// Diacritics stripped for matching only; the original text is never modified.
function optOutNormalise(text) {
  return String(text == null ? '' : text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')  // emoji
    .replace(/[!¡.,;:?¿"'`´()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Whole-message keywords. Meta's own opt-out convention is an exact keyword,
// and this is the only tier that can be certain from one word.
var OPT_OUT_KEYWORDS = [
  'sair', 'saír', 'parar', 'pare', 'parem', 'remover', 'cancelar', 'anular',
  'baja', 'bajar', 'darse de baja', 'cancelar suscripcion',
  'stop', 'stopall', 'unsubscribe', 'unsub', 'remove', 'cancel', 'quit', 'end', 'optout', 'opt out',
];

// Unambiguous as phrases, whatever surrounds them.
var OPT_OUT_PHRASES = [
  /deix(a|e|em)[- ]?me em paz/,
  /deix(a|e|em) de me (enviar|escrever|contactar|mandar)/,
  /par(e|em|ar) de me (enviar|escrever|contactar|mandar|ligar)/,
  /nao me (contact(e|em)|envi(e|em)|escrev(a|am)|lig(ue|uem)|mand(e|em))/,
  /(tir(a|e|em)|remov(a|e|am))[- ]?me (da|de) (sua |vossa )?lista/,
  /nao (quero|desejo) (mais )?(ser contactad|receber)/,
  /dej(e|en)me en paz/,
  /dej(e|en) de (escribirme|enviarme|contactarme|llamarme)/,
  /no me (contact(e|en)|envi(e|en)|escrib(a|an)|llam(e|en))/,
  /borr(a|e|en)me de (la |su )?lista/,
  /leave me alone/,
  /(stop|quit|cease) (sending|messaging|texting|writing|contacting|calling)/,
  /(take|get) me off (your |the )?(list|database)/,
  /(remove|delete) me from (your |the )?(list|database|records)/,
  /do ?n.?t (contact|message|text|call|write to) me/,
  /unsubscribe me/,
];

// A negation of wanting is only an opt-out when the thing not wanted is
// CONTACT. This is the guard that keeps "não quero perder esta oportunidade"
// out, and it is the single most important line in the file.
var OPT_OUT_NEGATED_WANT =
  /\b(nao (quero|queria|desejo)|no (quiero|deseo)|do ?n.?t want|don t want|dont want|do not want)\b/;
var OPT_OUT_CONTACT_NOUN =
  /\b(receber|recibir|receive|mensage(m|ns)|mensajes?|messages?|sms|whatsapp|e?mails?|texts?|contactos?|contacto|contact|contacted|publicidade|propaganda|spam|novidades|noticias|newsletter)\b/;

// Whole messages that are genuinely undecidable. "Não quero nada" on its own
// may mean "I want nothing from you" or may be the start of a sentence about a
// house. It cannot be told apart from one line, so it is not told apart.
//
// This list exists because "nao quero nada" was in the unambiguous PHRASES and
// matched "não quero nada muito grande, T2 chega" -- a lead describing the size
// of house they want, recorded as a permanent objection. Found by the test the
// operator asked for.
var OPT_OUT_AMBIGUOUS_WHOLE = [
  'nao quero nada', 'nao quero mais nada', 'nao quero',
  'no quiero nada', 'no quiero mas nada', 'no quiero',
  'i want nothing', 'nothing',
];

// Present as a standalone word but not as the whole message: not proof, not
// nothing. These halt and ask a human.
var OPT_OUT_AMBIGUOUS_TOKENS =
  /\b(sair|parar|pare|parem|stop|unsubscribe|baja|cancelar|cancel|remove|remover|basta|chega|enough)\b/;

/**
 * optOutVerdict(text) -> { verdict, matched, halt, record }
 *
 *   verdict  'opt_out' | 'unclear' | 'not_opt_out'
 *   matched  what fired, for the ledger's `wording` and the operator screen
 *   halt     stop sending to this contact now
 *   record   write the permanent objection
 */
function optOutVerdict(text) {
  var s = optOutNormalise(text);
  if (!s) return { verdict: 'not_opt_out', matched: null, halt: false, record: false };

  // 1. The whole message is a keyword.
  for (var i = 0; i < OPT_OUT_KEYWORDS.length; i++) {
    if (s === OPT_OUT_KEYWORDS[i]) {
      return { verdict: 'opt_out', matched: 'keyword:' + OPT_OUT_KEYWORDS[i], halt: true, record: true };
    }
  }

  // 2. An unambiguous phrase.
  for (var j = 0; j < OPT_OUT_PHRASES.length; j++) {
    if (OPT_OUT_PHRASES[j].test(s)) {
      return { verdict: 'opt_out', matched: 'phrase:' + OPT_OUT_PHRASES[j].source, halt: true, record: true };
    }
  }

  // 3. A whole message that cannot be decided from one line.
  for (var k = 0; k < OPT_OUT_AMBIGUOUS_WHOLE.length; k++) {
    if (s === OPT_OUT_AMBIGUOUS_WHOLE[k]) {
      return { verdict: 'unclear', matched: 'undecidable:' + s, halt: true, record: false };
    }
  }

  // 4. "I don't want" + something. Only an opt-out if the something is contact.
  if (OPT_OUT_NEGATED_WANT.test(s)) {
    if (OPT_OUT_CONTACT_NOUN.test(s)) {
      return { verdict: 'opt_out', matched: 'negated-want-contact', halt: true, record: true };
    }
    // "não quero perder esta oportunidade", "não quero uma casa com jardim".
    // Not an opt-out, and NOT unclear either: this is an ordinary sentence and
    // halting a live conversation over it would be its own defect.
    return { verdict: 'not_opt_out', matched: 'negated-want-other', halt: false, record: false };
  }

  // 5. A keyword loose in a sentence. Stop, and ask.
  if (OPT_OUT_AMBIGUOUS_TOKENS.test(s)) {
    var m = s.match(OPT_OUT_AMBIGUOUS_TOKENS);
    return { verdict: 'unclear', matched: 'token:' + m[1], halt: true, record: false };
  }

  return { verdict: 'not_opt_out', matched: null, halt: false, record: false };
}

/** A block reported by the platform is an objection, with no text to read. */
function optOutFromBlock() {
  return { verdict: 'opt_out', matched: 'platform:block', halt: true, record: true };
}
// <<< EMBED src/opt_out.js <<<
