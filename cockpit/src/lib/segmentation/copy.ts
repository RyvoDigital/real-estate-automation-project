/**
 * Every word a client can see on the segmentation screen.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THIS SCREEN IS USED IN A MEETING, ON A LAPTOP TURNED AROUND, WITH THE   │
 * │ AGENCY OWNER WATCHING.                                                  │
 * │                                                                         │
 * │ So: no internal vocabulary, no jargon, nothing that needs explaining.   │
 * │ A word that has to be explained in front of a client has already cost   │
 * │ you the room — `claimed_unevidenced` on screen is a failure regardless  │
 * │ of what the data says.                                                  │
 * │                                                                         │
 * │ The copy lives HERE, in one file, so the rule is checkable rather than  │
 * │ remembered: segmentation-copy.test.ts fails if any internal term        │
 * │ reaches a rendered string, AND fails if a state has no human label at   │
 * │ all — because a screen that renders nothing would otherwise pass the    │
 * │ first check perfectly (§5c).                                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Portuguese, because the agency is Portuguese and this is read aloud.
 */

/** What the ledger knows about a contact, said in a way a person can hear. */
export const STATE_LABEL: Record<string, string> = {
  consented: 'Autorização registada',
  declared: 'Já classificado',
  objected: 'Pediu para não ser contactado',
  claimed_unevidenced: 'O seu ficheiro dizia que sim',
  undetermined: 'Sem informação',
}

/** And the sentence under the label, when one is needed. */
export const STATE_NOTE: Record<string, string> = {
  consented: 'Temos registo de uma autorização, com data.',
  declared: 'Já nos disse de onde veio este contacto.',
  objected:
    'Esta pessoa pediu para não receber mais mensagens. Respeitamos isso e não ' +
    'voltamos a escrever-lhe.',
  claimed_unevidenced:
    'Havia um «sim» numa coluna do ficheiro. Registámos isso como autorização, ' +
    'e foi um erro nosso — uma célula não é prova de nada.',
  undetermined: 'Ninguém nos disse ainda de onde veio este contacto.',
}

/** The four things an agency may say about a contact. Never E. */
export const SEGMENT_CHOICE: Record<'A' | 'B' | 'C' | 'D', { label: string; consequence: string }> = {
  A: {
    label: 'Já comprou, vendeu ou arrendou connosco',
    // Replaced at render time by jurisdictionSentence() for the countries this
    // client's contacts are actually in. This is the fallback when none is known.
    consequence: 'Depende do país de cada contacto — e isso vem da tabela, não daqui.',
  },
  B: {
    label: 'Deu autorização e temos o registo',
    consequence: 'Podemos escrever-lhes em qualquer país.',
  },
  C: {
    label: 'Contactou-nos, mas nunca avançou',
    consequence: 'Precisamos da autorização antes de qualquer mensagem.',
  },
  D: {
    label: 'Já não sabemos de onde veio',
    consequence: 'Fica guardado, e pode mudar se souber mais tarde. Entretanto, não escrevemos.',
  },
}

/**
 * The hardest question on the screen (design §3).
 *
 * It starts from OUR error, truthfully; explains why a cell is not proof so the
 * question reads as diligence rather than suspicion; requires a SPECIFIC yes,
 * which is much harder to invent than a tick and is exactly what a regulator
 * would ask for; shows "no" as a route rather than a loss; and offers "I don't
 * know" at the same weight as the others, normalised in the text.
 */
/*
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THE QUOTED CELL IS A FACT ABOUT THEIR FILE, SO IT CANNOT BE A CONSTANT. │
 * │                                                                         │
 * │ The first version read `heading: 'O seu ficheiro dizia «sim»…'` — one   │
 * │ fixed string, rendered for every group. It asserted «sim» for a file    │
 * │ that said «y», for a group of mixed cells, and — the case that found it │
 * │ — for a contact whose ledger row records that THE TEXT WAS NOT RETAINED.│
 * │                                                                         │
 * │ Quoting a word back to the agency as what their own file said, on the   │
 * │ one screen whose whole force comes from quoting their file accurately,  │
 * │ is the cheapest possible way to lose the room. So: quote only what we   │
 * │ actually hold, and when we hold nothing, SAY we hold nothing.           │
 * │                                                                         │
 * │ Split rather than a function so the vocabulary guard still walks it —   │
 * │ a function body is invisible to `everyRenderedString()` (§5c).          │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export const CLAIM_QUESTION = {
  /** The cell goes between the two, in guillemets. */
  headingWithCell: { before: 'O seu ficheiro dizia ', after: ' na coluna de autorização' },
  /** When a claim exists but its text was not kept — see read.ts. */
  headingCellNotKept: 'O seu ficheiro tinha alguma coisa na coluna de autorização',
  body:
    'Nós registámos isso como autorização — e isso foi um erro nosso, não seu. ' +
    'Uma célula num ficheiro não é prova de nada: pode ter sido preenchida por ' +
    'qualquer razão, há muitos anos, por alguém que já não trabalha consigo. ' +
    // It used to end "…e é por isso que estamos a perguntar agora". Once the
    // evidence question was scoped to B, that clause was false on three screens
    // out of four: nothing is being asked of a past client. The question now
    // travels with the field that asks it.
    'Corrigimos o registo.',
  /** Appended to `body` when we cannot show them the cell. Admitting the gap is
   *  cheaper than inventing a word, and it is also simply true. */
  bodyCellNotKept:
    'Não guardámos o que lá estava exactamente, e por isso não lho podemos mostrar ' +
    '— mais uma coisa que ficou mal do nosso lado.',
  questionWithCell: { before: 'O que é que está por trás desse ', after: '?' },
  questionCellNotKept: 'O que é que está por trás dessa indicação?',
  options: {
    have_record: {
      label: 'Temos o registo — formulário, e-mail ou sistema, com data',
      note: 'Precisamos de saber qual, para o podermos mostrar se for pedido.',
      needsDetail: true,
      detailPrompt: 'Onde está esse registo, e de quando é?',
    },
    no_record: {
      label: 'Não temos registo',
      note: 'O contacto não se perde: pedimos autorização por outra via antes de qualquer mensagem.',
      needsDetail: false,
    },
    dont_know: {
      label: 'Não sei',
      note:
        'Resposta perfeitamente normal numa lista com anos. Tratamos como «não temos ' +
        'registo», e pode mudar mais tarde se o registo aparecer.',
      needsDetail: false,
    },
  },
} as const

/**
 * "1 contacto", not "1 contactos".
 *
 * Exported and used by EVERY count-bearing string: the first live run of
 * anything cautious is a handful of rows, so n=1 is not an edge case, it is the
 * only render anyone sees for the first few days (lesson 13b).
 */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * WHERE THE EVIDENCE QUESTION BELONGS, ONCE THE ORIGIN IS KNOWN.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ORIGIN FIRST, EVIDENCE SECOND — AND THE EVIDENCE QUESTION IS SCOPED.    │
 * │                                                                         │
 * │ The screen used to ask what lay behind the file's consent marker BEFORE │
 * │ asking whether these people were past clients at all. That is backwards │
 * │ twice over. A client who bought through the agency is segment A whether │
 * │ or not the marker means anything, so the first question framed the      │
 * │ conversation around something that may be irrelevant — and it opened a  │
 * │ meeting with an admission of our error, which is the right sentence in  │
 * │ the wrong place.                                                        │
 * │                                                                         │
 * │ Scoping it also removes a duplicate nobody had noticed: the three       │
 * │ answers to the evidence question ARE segments B, C and D.               │
 * │                                                                         │
 * │     have_record  → B  "deu autorização e temos o registo"               │
 * │     no_record    → C  "contactou-nos, mas nunca avançou"                │
 * │     dont_know    → D  "já não sabemos de onde veio"                     │
 * │                                                                         │
 * │ declare.ts knew this before the screen did: validateDeclaration()       │
 * │ requires `basis` for B ALONE. So after the origin is declared there is  │
 * │ exactly one thing left to ask, and only of B — which record, and when.  │
 * │ The other two segments get the note that belongs to their answer.       │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export const CLAIM_SCOPE: Record<'A' | 'B' | 'C' | 'D', string> = {
  A:
    'Como estes contactos já negociaram consigo, não é dessa célula que depende ' +
    'podermos escrever-lhes — é dessa relação. Não precisamos de saber mais nada sobre ela.',
  // Not a third phrasing of the question — the field below asks it. This says
  // what changes: the record is what counts now, not the cell.
  B: 'Nesse caso o que conta é o registo em si, e já não o que estava na célula.',
  C: 'Nesse caso essa célula era a única coisa que alguma vez disse que sim, e não chega.',
  D: 'Nesse caso fica a dúvida registada como dúvida, que é melhor do que uma certeza inventada.',
}

/**
 * What step 2 must ask, given the origin just declared.
 *
 * A FUNCTION, not a shape the page decides inline, because it has to agree with
 * validateDeclaration(): that function refuses a B with no basis and accepts
 * A, C and D without one. A screen asking for evidence where the writer does
 * not require it wastes the room's time; a screen NOT asking where the writer
 * does require it produces a refusal after the sentence was spoken, in front of
 * the client. segmentation.test.ts asserts the two agree, segment by segment.
 */
export function scopeFor(segment: 'A' | 'B' | 'C' | 'D'): {
  basisRequired: boolean
  /** Why this origin makes the file's marker matter, or stop mattering. */
  scope: string
  /** The reassurance belonging to this answer, when it has one. */
  note: string | null
} {
  return {
    basisRequired: segment === 'B',
    scope: CLAIM_SCOPE[segment],
    note:
      segment === 'C' ? CLAIM_QUESTION.options.no_record.note
      : segment === 'D' ? CLAIM_QUESTION.options.dont_know.note
      : null,
  }
}

export const UI = {
  title: 'De onde vieram estes contactos',
  intro:
    'Para podermos escrever a alguém, precisamos de saber de onde veio. Nada mais ' +
    'do que isso — não são precisos formulários assinados nem autorizações antigas.',
  groupHeading: 'Contactos agrupados como provavelmente se lembra deles',
  declareGroup: 'Classificar este grupo',
  openGroup: 'Ver os contactos',
  exceptions: 'Tirar alguns deste grupo',
  whoIsDeclaring: 'Quem está a dizer isto',
  whoIsDeclaringHint:
    'O nome de quem na agência sabe a resposta — mesmo que sejamos nós a escrever. ' +
    'Fica no registo.',
  proposalPrefix: 'Pelo que vemos no ficheiro, parece',
  proposalHint: 'É só uma sugestão nossa. A resposta é sua.',
  noProposal: 'Não temos indicação nenhuma sobre este grupo.',
  historyHeading: 'O que já foi dito sobre este contacto',
  /* The radios were labelled with the CLAIM question, which for a group with no
     claim at all asked what was behind a «sim» that never existed. The radios
     ask about origin; the claim question asks about evidence. Two questions. */
  segmentLegend: 'De onde é que vieram os contactos deste grupo?',
  confirm: 'Guardar',
  saved: (n: number) => `Guardado: ${plural(n, 'contacto', 'contactos')}.`,
  noContacts: 'Não há contactos importados para este cliente.',
  fromFile: (raw: string) => `no ficheiro: «${raw}»`,
  // "1 de 1 contacto deste grupo" is grammatical and reads like a machine. The
  // three cases are the three things a person would actually say.
  claimCount: (withClaim: number, total: number) =>
    total === 1 ? 'É o único contacto deste grupo.'
    : withClaim === total ? `Todos os ${total} contactos deste grupo.`
    : `${withClaim} de ${total} contactos deste grupo.`,
  declaredInGroup: (label: string) => `em grupo (${label})`,
  declaredOneByOne: 'contacto a contacto',
  wasUnsure: 'não tinha a certeza',
  missingGroup: 'Faltam dados do grupo.',
  noneSelected: 'Nenhum contacto seleccionado.',
  cancel: 'Voltar',
  continueToDetail: 'Continuar',
  youSaid: 'Disse:',
  changeAnswer: 'Mudar a resposta',
  // Its own words. It used to borrow the evidence question's "Não sei", which
  // left that option stranded a screenful away from the question it answered.
  unsure: 'Não tenho a certeza desta resposta',
  otherGroups: 'Os outros grupos ficam para a seguir',
  backToAll: 'Ver todos os grupos',
  nothingMoreNeeded: 'Não é preciso mais nada sobre estes contactos.',
} as const

/**
 * Terms that must never reach a rendered string. The test reads THIS list, so
 * adding a term here extends the guard rather than only documenting it.
 */
/** Country names as a person says them, not as a database stores them. */
export const COUNTRY_NAME: Record<string, string> = {
  PT: 'Portugal', ES: 'Espanha', IE: 'Irlanda', DE: 'Alemanha', FR: 'França',
  NL: 'Países Baixos', GB: 'Reino Unido', US: 'Estados Unidos', BR: 'Brasil',
  GG: 'Guernsey', JE: 'Jersey', IM: 'Ilha de Man',
}

export type JurisdictionFact = {
  country: string
  /** From jurisdiction_policy, exactly as the table holds it. */
  existingCustomer: 'available' | 'unavailable' | 'unknown'
  /**
   * 🔴 Is there a row for this country AT ALL.
   *
   * Added 20 September 2026, after the cross-screen sweep. Until then a
   * country with no row was filled in as `unknown` + `confirmed: false` —
   * IDENTICAL to a country whose row exists and is waiting on a lawyer. The
   * screen then told an agency we were "à espera da confirmação de uma
   * advogada" about Spain, where nobody has analysed anything and nobody is
   * waiting for anyone.
   *
   * These are two different kinds of not-yet and the difference is the whole
   * point: one is an absence of analysis that is OURS, the other is a
   * conclusion pending somebody else's confirmation. Collapsing them is the
   * conclusion/absence defect, told to the person the screen exists to
   * protect.
   */
  analysed: boolean
  confirmed: boolean
  platformBlocked: boolean
}

/**
 * What segment A actually permits, DERIVED FROM THE POLICY TABLE.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THE SCREEN MUST NEVER ASSERT A CONCLUSION THE TABLE DOES NOT HOLD.      │
 * │                                                                         │
 * │ Spain is `unknown` pending a lawyer's answer. A screen that told a       │
 * │ client "in Spain you cannot" would be stating as settled law something   │
 * │ our own record calls unanalysed — the system disagreeing with itself in  │
 * │ front of the person it exists to protect.                               │
 * │                                                                         │
 * │ And when Margarida answers, THE WORDING CHANGES BECAUSE THE TABLE        │
 * │ CHANGED, not the other way round. Hardcoding the sentence would make     │
 * │ the copy a second source of truth about the law, and the stale one.      │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export function jurisdictionSentence(facts: JurisdictionFact[]): string {
  if (facts.length === 0) return 'Ainda não sabemos em que países estão estes contactos.'

  const name = (c: string) => COUNTRY_NAME[c] ?? c
  const yes: string[] = []
  const no: string[] = []
  const waiting: string[] = []
  const unanalysed: string[] = []

  for (const f of [...facts].sort((a, b) => a.country.localeCompare(b.country))) {
    // A platform block is a fact about delivery rather than a legal
    // conclusion, so it does not wait for anyone and is stated first.
    if (f.platformBlocked) no.push(name(f.country))
    // 🔴 No row at all comes BEFORE the unconfirmed branch. Nobody is waiting
    // on a lawyer for a country nobody has looked at.
    else if (!f.analysed) unanalysed.push(name(f.country))
    else if (!f.confirmed) waiting.push(name(f.country))
    else if (f.existingCustomer === 'available') yes.push(name(f.country))
    else no.push(name(f.country))
  }

  const list = (xs: string[]) =>
    xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`

  const parts: string[] = []
  if (yes.length) parts.push(`Em ${list(yes)} podemos escrever-lhes.`)
  if (no.length) parts.push(`Em ${list(no)} não — a lei lá é mais restritiva.`)
  if (waiting.length) {
    // A row exists and a lawyer is genuinely reviewing it. "À espera" is true
    // here: somebody is working on it and an answer is coming.
    parts.push(
      `Em ${list(waiting)} ainda não sabemos: estamos à espera da confirmação de uma advogada, ` +
      'e até lá não escrevemos.',
    )
  }
  if (unanalysed.length) {
    /*
     * The operator's wording, 20 September 2026, and each clause is doing a
     * job that a shorter version would drop:
     *
     *   "ainda não trabalhamos"     true, and the answer to the only question
     *                               the agency actually has
     *   "ainda não as analisámos"   names the absence as OURS, not as a
     *                               pending external event
     *   and it never says prohibited, because we do not know that either —
     *   the refusal is ours, not Spain's.
     *
     * One word differs from the sentence as dictated: "a esses contactos"
     * rather than "a contactos espanhóis", because the list is built from
     * whichever countries this agency's contacts are in and a demonym cannot
     * be generated per country.
     */
    parts.push(
      `Em ${list(unanalysed)} ainda não trabalhamos. As regras são diferentes das portuguesas ` +
      'e ainda não as analisámos, por isso não escrevemos a esses contactos.',
    )
  }
  return parts.join(' ')
}

/**
 * THE THREE SENTENCES THAT MAKE THE HARD QUESTION ANSWERABLE HONESTLY.
 *
 * Read aloud, these are what carry it — and each is doing a specific job that a
 * shorter version would drop:
 *
 *   "uma célula num ficheiro não é prova de nada"
 *       explains WHY we are asking, so the question reads as diligence rather
 *       than suspicion
 *   "foi um erro nosso, não seu"
 *       removes the thing being defended before the question is put
 *   "resposta perfeitamente normal numa lista com anos"
 *       makes "I do not know" an answer a person can give while being watched
 *
 * Pinned by a test, verbatim, because each of them is exactly the kind of
 * sentence that gets trimmed for brevity by somebody who was not in the room.
 */
export const LOAD_BEARING = [
  'Uma célula num ficheiro não é prova de nada',
  'foi um erro nosso, não seu',
  'Resposta perfeitamente normal numa lista com anos',
] as const

export const FORBIDDEN_ON_SCREEN = [
  'claimed_unevidenced', 'no_ledger_basis', 'undetermined', 'consent_event',
  'segment', 'segmento', 'gate', 'refusal', 'refused', 'quarantine', 'quarantined',
  'ledger', 'jurisdiction', 'unevidenced', 'opt_in', 'opt-in', 'payload', 'null',
] as const
