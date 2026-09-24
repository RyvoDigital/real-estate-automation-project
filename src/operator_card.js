// ============================================================================
// The handoff card: what a consultant is told when a lead is handed to them.
//
// Embedded between markers into BuildOperatorAlert, BuildOperatorAlertMedia and
// BuildOperatorAlertInternal, after src/language.js (the leak check reads its
// detector). Unit-tested standalone in tests/operator_card.test.js, which loads
// THIS file rather than a copy.
//
// WHY THIS EXISTS
// Until 24 Sep 2026 the alert was three lines: the number, a reason CODE
// ("high_value:3000000>=2000000") and the last message. A client was promised
// this instead, in Portuguese, before any client goes live:
//
//   *Passagem para uma pessoa*
//   *Contacto:* João · +351 912 345 678
//   *Idioma:* inglês
//   *Procura:* compra · Cascais ou Estoril · T3
//   *Orçamento:* até 3.000.000 €
//   *Prazo:* não indicado
//   *Motivo:* pediu para falar com uma pessoa
//   *Já dito:* o cliente foi informado de que fala com um assistente de IA ...
//
// THE RULES (operator, 24 Sep 2026)
// 1. Every field comes from what the system RECORDED. A fact it does not have
//    says "não indicado": never a guess, never blank, never a default.
// 2. "Já dito" is assembled from recorded facts only (the disclosure, the
//    booking, the note actually delivered). Never text the model wrote: this
//    message exists to tell a consultant the truth.
// 3. Motivo is a Portuguese sentence for every reason code, never the code.
//    tests/operator_card.test.js fails if the workflow writes a code this file
//    cannot say.
// 4. Building the card must never cost the alert. operatorAlert() returns the
//    old three-line alert, byte for byte, when anything throws or the card
//    fails validation. A plain alert is fine; a missing one is not.
// 5. Within Twilio's 1600-character Body limit.
// 6. The card is a function of the LEAD, never of the recipient, so the
//    per-consultant routing of 3-10 Oct replaces alertRecipients() and nothing
//    else. Every value is a single line, so the same fields can later fill a
//    Content template's variables.
//
// Times are rendered in the client's IANA zone through Luxon (the timezone
// database), never a fixed offset: Lisbon changes from UTC+1 to UTC+0 on
// 25 Oct 2026, and a card written on the 24th about a meeting on the 26th has
// to be right on both sides.
// ============================================================================

const OC_NAO = 'não indicado';
const OC_TITLE = 'Passagem para uma pessoa';
const OC_BODY_LIMIT = 1600;                       // Twilio's Body limit (Twilio docs)
const OC_FIELDS = [
  ['contacto', 'Contacto'], ['idioma', 'Idioma'], ['procura', 'Procura'],
  ['orcamento', 'Orçamento'], ['prazo', 'Prazo'], ['motivo', 'Motivo'], ['ja_dito', 'Já dito'],
];
// Per-field caps. Motivo and Já dito carry several sentences; the rest are short.
const OC_CAP = { motivo: 400, ja_dito: 500 };
const OC_CAP_DEFAULT = 200;

const OC_LANG_PT = { pt: 'português', en: 'inglês', es: 'espanhol', fr: 'francês', de: 'alemão' };
const OC_LEAD_TYPE_PT = { buyer: 'compra', seller: 'venda', renter: 'arrendamento' };

// escalation_kind (the closed field in REPLY_SCHEMA) -> Motivo.
const OC_KIND_PT = {
  person_request:    'pediu para falar com uma pessoa',
  price_negotiation: 'pergunta sobre preço e negociação',
  legal_tax:         'pergunta jurídica, fiscal ou contratual',
  complaint:         'mostrou-se insatisfeito ou fez uma reclamação',
  change_booking:    'pediu para alterar ou cancelar a marcação',
  other:             'pedido que o assistente não consegue tratar sem inventar informação',
};
const OC_KIND_MISSING = 'pedido do cliente (motivo não classificado)';

// Reason HEAD (the part before the first ':') -> Motivo. `tail` is the rest.
// The workflow's reason codes are listed in cockpit/src/lib/escalation.ts;
// tests/operator_card.test.js reads the codes the workflow actually writes and
// fails on any head missing here.
const OC_REASON_PT = {
  needs_human: (tail, f) => OC_KIND_PT[f.escalationKind] || OC_KIND_MISSING,
  high_value: (tail) => {
    const m = String(tail || '').match(/^(\d+(?:\.\d+)?)>=/);
    return m ? 'valor acima do limiar (' + ocEur(Number(m[1])) + ')' : 'valor acima do limiar';
  },
  booking_retired: (tail) => tail === 'missing'
    ? 'a marcação já não consta da agenda'
    : 'marcação cancelada',
  // A lost slot hands over only when nothing is left or it is the second in a row
  // (src/lost_slot.js); a re-offer is no escalation at all.
  booking_lost_race: (tail) => tail === 'second_in_a_row'
    ? 'perdeu dois horários seguidos para outros clientes'
    : tail === 'none_left'
      ? 'o horário escolhido foi ocupado por outro cliente e não há outros horários livres'
      : 'o horário escolhido foi ocupado por outro cliente no mesmo momento',
  booking_failed: () => 'falha técnica ao marcar a reunião',
  no_availability: () => 'sem horários disponíveis para propor',
  claude_failed: () => 'falha técnica: o assistente não conseguiu responder',
  bad_reply_twice: () => 'falha técnica: a resposta do assistente foi rejeitada duas vezes',
  media_unprocessable: (tail) => ({
    audio: 'enviou de novo uma mensagem de voz, que o assistente não consegue ouvir',
    location: 'enviou de novo uma localização, que o assistente não consegue interpretar',
  })[String(tail || '').split(':')[0]] || 'enviou de novo um ficheiro que o assistente não consegue ler',
  internal_error: () => 'falha técnica interna ao tratar a mensagem',
};

// The note actually delivered to the lead -> what it committed to, on the
// consultant's behalf. Every configured note (handoff, booking_retired,
// slot_taken, media_repeat, in pt/en/es) says a colleague will be in touch;
// a per-client override must keep that commitment (runbook).
const OC_NOTE_PT = {
  handoff:         'o cliente foi informado de que um colega entra em contacto em breve',
  booking_retired: 'o cliente foi avisado de que a marcação deixou de constar da agenda e de que um colega entra em contacto em breve para combinar nova hora',
  slot_taken:      'o cliente foi avisado de que o horário escolhido ficou ocupado e de que um colega entra em contacto para combinar outro',
  media_repeat:    'o cliente foi informado de que a conversa passa para um colega, que entra em contacto em breve',
};

const OC_WEEKDAY = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
const OC_MONTH = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const OC_CITY_PT = { Lisbon: 'Lisboa', Madeira: 'Madeira', Azores: 'Açores', London: 'Londres',
                     Madrid: 'Madrid', Paris: 'Paris', Dublin: 'Dublin' };

// ---------------------------------------------------------------------------
// Stored values in Portuguese. The model is told to record area and timeline
// in European Portuguese; this closes what it still writes in the lead's
// language, and everything already stored (on 24 Sep every stored area and
// timeline was English: "Cascais or Estoril", "this week").
// A value this cannot translate is NOT hidden (that would drop a real fact)
// and NOT passed off as Portuguese: it is quoted, and reported as untranslated
// so the node writes a warning event.
// ---------------------------------------------------------------------------
const OC_PLACE_PT = { lisbon: 'Lisboa', oporto: 'Porto', seville: 'Sevilha', madeira: 'Madeira',
                      azores: 'Açores', 'the algarve': 'Algarve', algarve: 'Algarve' };
const OC_CONNECTOR_PT = { or: 'ou', and: 'e', y: 'e', near: 'perto de', cerca: 'perto de' };

// Words that are English or Spanish and never Portuguese. The conversational
// detector (src/language.js) is built for whole messages and reads "within 6
// months" as nothing at all, so a stored fragment needs its own list.
const OC_FOREIGN = new Set([
  'or', 'and', 'the', 'of', 'in', 'within', 'next', 'this', 'that', 'months', 'month', 'weeks', 'week',
  'years', 'year', 'days', 'day', 'soon', 'asap', 'possible', 'now', 'immediately', 'near', 'around',
  'center', 'centre', 'city', 'coast', 'beach', 'north', 'south', 'east', 'west', 'area', 'lisbon',
  'oporto', 'seville', 'rush', 'hurry', 'end', 'by', 'few', 'couple', 'urgent', 'urgently', 'flexible',
  'mes', 'año', 'años', 'y', 'cerca', 'lo', 'antes', 'cuanto', 'ya', 'finales', 'unos',
  'playa', 'ciudad',
]);

function ocForeignWords(v) {
  const s = String(v || '').toLowerCase();
  const words = s.split(/[^a-zà-ÿ0-9]+/).filter(Boolean);
  const hits = words.filter(w => OC_FOREIGN.has(w));
  if (hits.length) return hits;
  if (typeof detectLanguage === 'function') {
    const d = detectLanguage(s);
    if (d && d.lang && d.lang !== 'pt') return ['(' + d.lang + ')'];
  }
  return [];
}

// A timeline is a small vocabulary, so it is checked the strict way round:
// every word must be Portuguese from this list (numbers pass). A blacklist
// could never enumerate English: "whenever" passed it. A Portuguese word
// missing here shows quoted and raises the warning event, which says to add it.
const OC_PT_TIMELINE_WORDS = new Set((
  'a ao aos até antes depois de do da dos das e em entre ou no na nos nas o os para que já logo ' +
  'esta este estes estas próxima próximo próximas próximos dentro alguns algumas uns umas ' +
  'dia dias semana semanas mês meses ano anos fim final finais início meados ' +
  'mais breve possível imediatamente sem pressa urgente urgência flexível quanto ' +
  'verão primavera outono inverno natal páscoa ' +
  'janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro ' +
  'curto médio longo prazo cerca aproximadamente meio'
).split(' '));

function ocTimelineForeign(v) {
  const words = String(v || '').toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);
  return words.filter(w => !OC_PT_TIMELINE_WORDS.has(w));
}

function ocArea(v) {
  let s = String(v).trim();
  for (const [en, pt] of Object.entries(OC_PLACE_PT)) {
    s = s.replace(new RegExp('\\b' + en + '\\b', 'gi'), pt);
  }
  s = s.replace(/\b(or|and|y|near|cerca)\b/gi, (m) => OC_CONNECTOR_PT[m.toLowerCase()]);
  return s;
}

const OC_UNIT_PT = {
  day: ['dia', 'dias'], days: ['dia', 'dias'], dia: ['dia', 'dias'], dias: ['dia', 'dias'],
  week: ['semana', 'semanas'], weeks: ['semana', 'semanas'], semana: ['semana', 'semanas'], semanas: ['semana', 'semanas'],
  month: ['mês', 'meses'], months: ['mês', 'meses'], mes: ['mês', 'meses'], meses: ['mês', 'meses'], mês: ['mês', 'meses'],
  year: ['ano', 'anos'], years: ['ano', 'anos'], año: ['ano', 'anos'], años: ['ano', 'anos'], ano: ['ano', 'anos'], anos: ['ano', 'anos'],
};
const OC_UNIT_RX = '(days?|weeks?|months?|years?|d[ií]as?|semanas?|mes(?:es)?|mês|años?|anos?)';
const OC_TIMELINE_EXACT = [
  [/^(this week|esta semana)$/, 'esta semana'],
  [/^(next week|la pr[oó]xima semana|la semana que viene|pr[oó]xima semana)$/, 'na próxima semana'],
  [/^(this month|este mes|este mês)$/, 'este mês'],
  [/^(next month|el pr[oó]ximo mes|el mes que viene|pr[oó]ximo m[eê]s)$/, 'no próximo mês'],
  [/^(this year|este a[ñn]o|este ano)$/, 'este ano'],
  [/^(next year|el pr[oó]ximo a[ñn]o|el a[ñn]o que viene|pr[oó]ximo ano)$/, 'no próximo ano'],
  [/^(asap|as soon as possible|lo antes posible|cuanto antes|urgent|urgently|urgente|o mais breve poss[ií]vel)$/, 'o mais breve possível'],
  [/^(now|immediately|right away|right now|inmediatamente|ya|imediatamente|j[aá])$/, 'imediatamente'],
  [/^(no rush|no hurry|not in a hurry|sin prisa|sem pressa|flexible|flex[ií]vel)$/, 'sem pressa'],
  [/^(a few months|in a few months|unos meses|algunos meses|en unos meses|alguns meses|dentro de alguns meses)$/, 'dentro de alguns meses'],
  [/^((by )?(the )?end of (the |this )?year|a finales de a[ñn]o|antes de fin de a[ñn]o|at[eé] ao fim do ano|fim do ano)$/, 'até ao fim do ano'],
];

function ocUnit(n, unit) {
  const u = OC_UNIT_PT[unit.toLowerCase()];
  return u ? (Number(n) === 1 ? u[0] : u[1]) : null;
}

function ocTimeline(v) {
  const s = String(v).trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!]+$/, '');
  for (const [rx, pt] of OC_TIMELINE_EXACT) if (rx.test(s)) return pt;
  let m;
  // "within 6 months", "in the next 3 weeks", "en los próximos 2 meses", "dentro de 6 meses"
  m = s.match(new RegExp('^(?:within|in|in the next|next|within the next|en|en los pr[oó]ximos|en las pr[oó]ximas|dentro de|nos pr[oó]ximos|nas pr[oó]ximas)\\s+(\\d+)\\s+' + OC_UNIT_RX + '$'));
  if (m) {
    const u = ocUnit(m[1], m[2]);
    if (u) return Number(m[1]) === 1 ? 'dentro de 1 ' + u : 'nos próximos ' + m[1] + ' ' + u;
  }
  // "6-12 months", "6 to 12 months", "6 a 12 meses"
  m = s.match(new RegExp('^(\\d+)\\s*(?:-|–|to|a)\\s*(\\d+)\\s+' + OC_UNIT_RX + '$'));
  if (m) { const u = ocUnit(m[2], m[3]); if (u) return m[1] + ' a ' + m[2] + ' ' + u; }
  // "6 months"
  m = s.match(new RegExp('^(\\d+)\\s+' + OC_UNIT_RX + '$'));
  if (m) { const u = ocUnit(m[1], m[2]); if (u) return m[1] + ' ' + u; }
  return String(v).trim();
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
function ocClean(v) {
  // One line, and no WhatsApp formatting characters from stored data: a name
  // with an asterisk would otherwise turn half the card bold.
  return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').replace(/[*_~`]/g, '')
    .replace(/\s{2,}/g, ' ').trim();
}

function ocCap(v, n) {
  if (v.length <= n) return v;
  const cut = v.slice(0, n - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut) + '…';
}

function ocEur(n) {
  const x = Math.round(Number(n));
  if (!isFinite(x)) return null;
  return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';
}

function ocPhone(from) {
  const s = String(from || '').replace(/^whatsapp:/, '').trim();
  if (!s) return null;
  const m = s.match(/^\+351(\d{3})(\d{3})(\d{3})$/);
  return m ? '+351 ' + m[1] + ' ' + m[2] + ' ' + m[3] : s;
}

function ocZone(z) { return (typeof z === 'string' && z.indexOf('/') !== -1) ? z : 'Europe/Lisbon'; }

function ocCity(zone) {
  const en = zone.split('/').pop().replace(/_/g, ' ');
  return OC_CITY_PT[en] || en;
}

// A time in the client's zone through the timezone database. null when the
// value is not a time, so the caller says so instead of printing "Invalid".
function ocDt(iso, zone) {
  if (!iso || typeof DateTime === 'undefined') return null;
  const dt = DateTime.fromISO(String(iso), { zone: 'utc' }).setZone(ocZone(zone));
  return dt.isValid ? dt : null;
}

// "sexta, 25 set, às 17:00 (Lisboa)"
function ocSlot(iso, zone) {
  const dt = ocDt(iso, zone);
  if (!dt) return 'data não indicada';
  return OC_WEEKDAY[dt.weekday - 1] + ', ' + dt.day + ' ' + OC_MONTH[dt.month - 1]
       + ', às ' + dt.toFormat('HH:mm') + ' (' + ocCity(ocZone(zone)) + ')';
}

// "24 set, 15:49"
function ocStamp(iso, zone) {
  const dt = ocDt(iso, zone);
  return dt ? dt.day + ' ' + OC_MONTH[dt.month - 1] + ', ' + dt.toFormat('HH:mm') : null;
}

// ---------------------------------------------------------------------------
// The fields
// ---------------------------------------------------------------------------
// facts (every key optional; a missing one renders "não indicado"):
//   from            the lead's number
//   lead            the row: full_name, lead_type, budget_min, budget_max,
//                   timeline, area, qualification{bedrooms}
//   lang, langSource  the lead's language and where it came from
//                   ('message' | 'history'; anything else is not recorded)
//   reasons         the escalation reason codes
//   escalationKind  the model's closed classification, for needs_human
//   propertyRefs    listing references the lead wrote
//   disclosure      { at: iso of the latest recorded disclosure, now: bool
//                     (this turn's message carried it), ever: bool (told,
//                     time not at hand), unknown: bool (state unreadable) }
//   booking         { active: {startUtc}, retired: {startUtc, reason},
//                     proposed: [startUtc, ...] }
//   note            { kind: 'handoff'|'booking_retired'|'slot_taken'|
//                     'media_repeat'|null, delivered: true|false|null }
//   zone            the client's IANA zone
//   at              when the card is built (for a disclosure sent this turn)
function ocMotivo(f) {
  const out = [], unmapped = [];
  for (const r of (Array.isArray(f.reasons) ? f.reasons : [])) {
    const s = String(r || '');
    const i = s.indexOf(':');
    const head = i === -1 ? s : s.slice(0, i);
    const tail = i === -1 ? '' : s.slice(i + 1);
    const fn = OC_REASON_PT[head];
    if (!fn) { unmapped.push(head); continue; }
    const t = fn(tail, f);
    if (t && out.indexOf(t) === -1) out.push(t);
  }
  if (unmapped.length) out.push('outro motivo (ver a conversa)');
  return { text: out.length ? out.join('; ') : OC_NAO, unmapped };
}

function ocJaDito(f) {
  const items = [];
  const zone = f.zone;
  const d = f.disclosure || {};
  const discAt = d.now ? (f.at || null) : (d.at || null);
  // `ever`: recorded as told, with no time to hand (the internal-failure path
  // reads the state, not the row).
  if (d.now || d.at || d.ever) {
    const st = ocStamp(discAt, zone);
    items.push('o cliente foi informado de que fala com um assistente de IA' + (st ? ' (' + st + ')' : ''));
  } else if (d.unknown) {
    items.push('não foi possível confirmar se o cliente foi informado de que fala com um assistente de IA');
  } else {
    items.push('o cliente ainda não foi informado de que fala com um assistente de IA');
  }

  const b = f.booking || {};
  const active = b.active && b.active.startUtc ? b.active : null;
  if (active) {
    items.push('tem reunião marcada para ' + ocSlot(active.startUtc, zone));
  } else if (b.retired && b.retired.startUtc) {
    items.push(b.retired.reason === 'past'
      ? 'a reunião de ' + ocSlot(b.retired.startUtc, zone) + ' já passou; sem nova reunião marcada'
      : 'a marcação de ' + ocSlot(b.retired.startUtc, zone) + ' deixou de constar da agenda; sem nova reunião marcada');
  } else if (Array.isArray(b.proposed) && b.proposed.length) {
    // What the row records is that these were OFFERED and that nothing is booked.
    // Whether the lead chose is not recorded: on 24 Sep the gate's lost races read
    // "ainda não escolheu" about leads who had chosen and lost the slot.
    items.push('foram-lhe propostos horários (' + b.proposed.slice(0, 3).map(s => ocSlot(s, zone)).join('; ')
               + '); nenhum está marcado');
  } else {
    items.push('sem reunião marcada');
  }

  const n = f.note || {};
  let promised = !!active;
  if (!n.kind) {
    items.push('o cliente não recebeu resposta');
  } else if (n.delivered === true) {
    items.push(OC_NOTE_PT[n.kind] || OC_NOTE_PT.handoff);
    promised = true;
  } else if (n.delivered === false) {
    items.push('a nota de passagem NÃO foi entregue: o cliente não sabe que um colega vai responder');
  } else {
    items.push('não foi possível confirmar se a nota de passagem foi entregue');
  }
  if (!promised) items.push('nada foi prometido');
  return items.join('; ');
}

function buildOperatorCard(facts) {
  const f = facts || {};
  const lead = f.lead || {};
  const q = lead.qualification || {};
  const untranslated = [];
  const pt = (field, raw, normalised) => {
    const hits = field === 'timeline' ? ocTimelineForeign(normalised) : ocForeignWords(normalised);
    if (!hits.length) return normalised;
    untranslated.push({ field, value: String(raw), words: hits });
    return '"' + String(raw).trim() + '"';
  };

  const name = ocClean(lead.full_name);
  const phone = ocPhone(f.from);
  const contacto = (name || OC_NAO) + ' · ' + (phone || OC_NAO);

  const idioma = (f.langSource === 'message' || f.langSource === 'history') && OC_LANG_PT[f.lang]
    ? OC_LANG_PT[f.lang] : OC_NAO;

  const procura = [];
  if (OC_LEAD_TYPE_PT[lead.lead_type]) procura.push(OC_LEAD_TYPE_PT[lead.lead_type]);
  const area = ocClean(lead.area);
  if (area) procura.push(pt('area', area, ocArea(area)));
  const beds = Number(q.bedrooms);
  if (q.bedrooms != null && q.bedrooms !== '' && Number.isInteger(beds) && beds >= 0 && beds < 20) procura.push('T' + beds);
  const refs = (Array.isArray(f.propertyRefs) ? f.propertyRefs : []).map(ocClean).filter(Boolean);
  if (refs.length) procura.push('imóvel referido: ' + refs.join(', '));

  const lo = Number(lead.budget_min) > 0 ? ocEur(lead.budget_min) : null;
  const hi = Number(lead.budget_max) > 0 ? ocEur(lead.budget_max) : null;
  const orcamento = lo && hi ? (lo === hi ? lo : 'entre ' + lo + ' e ' + hi)
                  : hi ? 'até ' + hi : lo ? 'a partir de ' + lo : OC_NAO;

  const tl = ocClean(lead.timeline);
  const prazo = tl ? pt('timeline', tl, ocTimeline(tl)) : OC_NAO;

  const motivo = ocMotivo(f);
  const values = {
    contacto, idioma,
    procura: procura.length ? procura.join(' · ') : OC_NAO,
    orcamento, prazo,
    motivo: motivo.text,
    ja_dito: ocJaDito(f),
  };
  const fields = OC_FIELDS.map(([key, label]) => ({
    key, label, value: ocCap(ocClean(values[key]) || OC_NAO, OC_CAP[key] || OC_CAP_DEFAULT),
  }));
  const text = '*' + OC_TITLE + '*\n' + fields.map(x => '*' + x.label + ':* ' + x.value).join('\n');
  return { title: OC_TITLE, fields, text, untranslated, unmapped: motivo.unmapped };
}

// What a card must be before it is sent. Anything else and the plain alert goes.
function validateCard(card) {
  if (!card || typeof card.text !== 'string') return 'no text';
  if (!Array.isArray(card.fields) || card.fields.length !== OC_FIELDS.length) return 'field count';
  for (const x of card.fields) {
    if (typeof x.value !== 'string' || !x.value.trim()) return 'empty field ' + x.key;
    if (/[\r\n]/.test(x.value)) return 'multi-line field ' + x.key;
  }
  if (/\b(undefined|NaN|null|Invalid DateTime)\b/.test(card.text)) return 'unrendered value';
  if (card.text.length > OC_BODY_LIMIT) return 'over ' + OC_BODY_LIMIT + ' characters';
  return null;
}

// Today's alert, exactly as NotifyOperator's expression built it until 24 Sep.
function legacyAlert(from, reason, body) {
  return 'Ryvo escalation\n' + String(from == null ? '' : from)
       + '\nReason: ' + String(reason == null ? '' : reason)
       + '\nLast msg: "' + String(body == null ? '' : body).slice(0, 140) + '"';
}

// operatorAlert(facts) -> { format: 'card'|'legacy', text, card, legacyReason,
//                           untranslated, unmapped, length }
// Never throws. `facts.legacy` = { from, reason, body } for the fallback.
function operatorAlert(facts) {
  const lg = (facts && facts.legacy) || {};
  let legacy;
  try { legacy = legacyAlert(lg.from, lg.reason, lg.body); }
  catch (e) { legacy = 'Ryvo escalation'; }
  const plain = (why) => ({ format: 'legacy', text: legacy, card: null, legacyReason: why,
                            untranslated: [], unmapped: [], length: legacy.length });
  try {
    const card = buildOperatorCard(facts);
    const bad = validateCard(card);
    if (bad) return plain('invalid: ' + bad);
    return { format: 'card', text: card.text, card: { title: card.title, fields: card.fields },
             legacyReason: null, untranslated: card.untranslated, unmapped: card.unmapped,
             length: card.text.length };
  } catch (e) {
    return plain('threw: ' + String(e && e.message ? e.message : e).slice(0, 200));
  }
}

// Who receives the card. One number per client today (config.escalate_to);
// the per-consultant routing of 3-10 Oct 2026 replaces this function and
// nothing else, because the card above never depends on who reads it.
function alertRecipients(cfg) {
  const to = cfg && cfg.escalate_to;
  return to ? [String(to)] : [];
}
