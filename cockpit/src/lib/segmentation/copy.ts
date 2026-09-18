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
export const CLAIM_QUESTION = {
  heading: 'O seu ficheiro dizia «sim» na coluna de autorização',
  body:
    'Nós registámos isso como autorização — e isso foi um erro nosso, não seu. ' +
    'Uma célula num ficheiro não é prova de nada: pode ter sido preenchida por ' +
    'qualquer razão, há muitos anos, por alguém que já não trabalha consigo. ' +
    'Corrigimos o registo, e é por isso que estamos a perguntar agora.',
  question: 'O que é que está por trás desse «sim»?',
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
  confirm: 'Guardar',
  saved: (n: number) => `Guardado: ${n} contactos.`,
  noContacts: 'Não há contactos importados para este cliente.',
  fromFile: (raw: string) => `no ficheiro: «${raw}»`,
  claimCount: (withClaim: number, total: number) => `${withClaim} de ${total} contactos deste grupo.`,
  declaredInGroup: (label: string) => `em grupo (${label})`,
  declaredOneByOne: 'contacto a contacto',
  wasUnsure: 'não tinha a certeza',
  missingGroup: 'Faltam dados do grupo.',
  noneSelected: 'Nenhum contacto seleccionado.',
  cancel: 'Voltar',
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

  for (const f of [...facts].sort((a, b) => a.country.localeCompare(b.country))) {
    if (f.platformBlocked) no.push(name(f.country))
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
    parts.push(
      `Em ${list(waiting)} ainda não sabemos: estamos à espera da confirmação de uma advogada, ` +
      'e até lá não escrevemos.',
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
