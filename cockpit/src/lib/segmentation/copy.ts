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
  objected: 'Não voltamos a escrever a esta pessoa. É definitivo.',
  claimed_unevidenced:
    'Havia um «sim» numa coluna do ficheiro. Registámos isso como autorização, ' +
    'e foi um erro nosso — uma célula não é prova de nada.',
  undetermined: 'Ninguém nos disse ainda de onde veio este contacto.',
}

/** The four things an agency may say about a contact. Never E. */
export const SEGMENT_CHOICE: Record<'A' | 'B' | 'C' | 'D', { label: string; consequence: string }> = {
  A: {
    label: 'Já comprou, vendeu ou arrendou connosco',
    consequence: 'Em Portugal, podemos escrever-lhes. Noutros países depende do país.',
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
    consequence: 'Não escrevemos. Fica guardado, e pode mudar se souber mais tarde.',
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
  whoIsDeclaringHint: 'O nome fica no registo. É a pessoa da agência que sabe, não quem está a escrever.',
  proposalPrefix: 'Pelo que vemos no ficheiro, parece',
  proposalHint: 'É só uma sugestão nossa. A resposta é sua.',
  noProposal: 'Não temos indicação nenhuma sobre este grupo.',
  historyHeading: 'O que já foi dito sobre este contacto',
  confirm: 'Guardar',
  cancel: 'Voltar',
} as const

/**
 * Terms that must never reach a rendered string. The test reads THIS list, so
 * adding a term here extends the guard rather than only documenting it.
 */
export const FORBIDDEN_ON_SCREEN = [
  'claimed_unevidenced', 'no_ledger_basis', 'undetermined', 'consent_event',
  'segment', 'segmento', 'gate', 'refusal', 'refused', 'quarantine', 'quarantined',
  'ledger', 'jurisdiction', 'unevidenced', 'opt_in', 'opt-in', 'payload', 'null',
] as const
