/**
 * Every word the listings, matches and calibration screens can show.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THE CALIBRATION SCREEN IS USED WITH AN AGENT SITTING NEXT TO YOU.       │
 * │                                                                         │
 * │ Same rule as the segmentation screen, and the same reason: a word that  │
 * │ has to be explained in front of a client has already cost you the room. │
 * │ `budget_stretch`, `min_score_possible`, `filter_would_find` and         │
 * │ `unmatchable` are ours. None of them may appear on a screen.            │
 * │                                                                         │
 * │ The copy lives HERE so the rule is checkable rather than remembered:    │
 * │ matching-screen.test.ts fails if an internal term reaches a rendered    │
 * │ string, if a page holds prose that bypassed this file, or if there is   │
 * │ too little copy for either check to mean anything (§5c).                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Portuguese, because the agency is Portuguese and this is read aloud.
 *
 * The reasons shown on the matches screen are NOT an exception any more. They
 * used to be English prose composed by score.ts one layer down — the seam that
 * would have been discovered by an agent reading their own screen. The engine
 * now emits structured reasons (reason.ts) and screen-read.ts renders them in
 * Portuguese at the boundary, so everything on these screens is in one
 * language and this file still holds every word of the frame.
 */

export const LISTINGS = {
  title: 'Imóveis',
  intro: 'O que entrou, o estado de cada um, e a quem servem.',
  empty: 'Ainda não entrou nenhum imóvel. Envie um para o número de WhatsApp da agência e aparece aqui.',
  pick: 'Escolha a agência.',
  columnStatus: 'Estado',
  columnWhen: 'Entrou',
  onlyAvailableMatches: 'Só os imóveis disponíveis são propostos a alguém.',
  notMatched: 'Não é proposto a ninguém enquanto estiver assim.',
  countOne: '1 imóvel',
  countMany: (n: number) => `${n} imóveis`,
} as const

export const STATUS_WORD: Record<string, string> = {
  available: 'Disponível',
  reserved: 'Reservado',
  under_offer: 'Com proposta',
  sold: 'Vendido',
  withdrawn: 'Retirado',
}

export const MATCHES = {
  title: 'A quem serve este imóvel',
  /** The refusal, said to a person rather than reported as a state. */
  notCalibrated:
    'Ainda não sabemos o que é uma boa proposta para esta agência, por isso não ' +
    'propusemos este imóvel a ninguém. São meia dúzia de perguntas, e é uma ' +
    'conversa de vinte minutos com quem conhece os clientes.',
  notCalibratedAction: 'Fazer essas perguntas agora',
  notAvailable:
    'Este imóvel não está disponível, por isso não é proposto a ninguém. ' +
    'Foi de propósito: dizer a alguém que há uma casa que já não está à venda é ' +
    'o pior que este sistema pode fazer.',
  none: 'Nenhum contacto serve para este imóvel.',
  consideredOne: '1 contacto considerado.',
  consideredMany: (n: number) => `${n} contactos considerados.`,
  nothingOnRecordOne:
    '1 desses contactos não tem nada registado sobre o que procura, por isso não ' +
    'entrou na comparação. Está na lista para ver à mão.',
  nothingOnRecordMany: (n: number) =>
    `${n} desses contactos não têm nada registado sobre o que procuram, por isso não ` +
    'entraram na comparação. Estão na lista para ver à mão.',
  computedHeading: 'Encontrados pelo sistema',
  chosenHeading: 'Escolhidos por si',
  chosenBy: (who: string) => `escolhido por ${who}`,
  /** The claim that distinguishes this from a CRM, said plainly. */
  aFilterWouldMiss: 'Uma pesquisa pelos campos guardados não encontrava este.',
  neverContacted: 'Nunca foi contactado.',
  lastSpokeOne: 'Sem falar há 1 mês.',
  lastSpokeMany: (n: number) => `Sem falar há ${n} meses.`,
  engineWordsHeading: 'Como o sistema chegou aí',
  strengthWord: { strong: 'Forte', possible: 'Possível', weak: 'Fraco' } as Record<string, string>,
} as const

export const CALIBRATE = {
  title: 'O que é uma boa proposta',
  intro:
    'Seis perguntas sobre como trabalha. As respostas ficam guardadas para esta ' +
    'agência e podem ser mudadas a qualquer momento.',
  why:
    'Ninguém escolheu estes valores por si, e não há um valor certo — depende do ' +
    'mercado e de como a agência trabalha. Por isso perguntamos em vez de adivinhar.',
  pick: 'Escolha a agência.',

  budgetHeading: 'Orçamento',
  budgetSaid: 'Alguém diz que vai até…',
  budgetMost: 'Qual é o valor mais alto que ainda lhe mostrava?',
  budgetStretchMost:
    'E se essa pessoa tivesse dito «podíamos esticar pela casa certa», até quanto?',

  bedroomsHeading: 'Tipologia',
  bedroomsQuestion: 'Alguém pede um T3. Mostrava-lhe um T2?',
  chooseOne: 'Escolha uma resposta',
  yes: 'Sim',
  no: 'Não',

  scoreHeading: 'Quando é que vale a pena',
  ofHowMany: 'De quantas coisas que alguém pede…',
  strongAtLeast: '…quantas tem de ter para lhe dizer que é mesmo para si?',
  possibleAtLeast: '…e quantas para ainda valer a pena mostrar?',

  areasHeading: 'Zonas',
  areasQuestion:
    'Que zonas é que os seus clientes aceitam como equivalentes? Uma por linha, ' +
    'assim: Cascais: Estoril, Parede',
  areasNote:
    'Serve nos dois sentidos. Quem pediu Cascais vê Estoril, e quem pediu Estoril ' +
    'vê Cascais.',
  areasEmpty: 'Pode deixar em branco, se não houver nenhuma.',

  save: 'Guardar',
  saved: 'Guardado.',
  savedSummary: (said: string, plain: string, stated: string) =>
    `Alguém que diga ${said} vê até ${plain}, e até ${stated} se disser que pode esticar.`,
  savedBedroomsYes: 'Uma tipologia abaixo ainda conta.',
  savedBedroomsNo: 'Uma tipologia abaixo não conta.',
  savedAreasNone: 'Nenhuma zona é tratada como equivalente a outra.',
  notSavedYet: 'Ainda não respondeu a estas perguntas.',

  /** Problems, in the agent's terms. Never "invalid input". */
  problem: {
    missing: 'Falta esta resposta.',
    below: 'Este valor é mais baixo do que a pessoa disse. Queria dizer mais alto?',
    below_plain:
      'Quem disse que podia esticar ficaria a ver menos do que quem não disse nada. ' +
      'Uma das duas respostas é a outra pergunta.',
    over_total: 'Não pode ser mais do que o total.',
    above_strong: 'Vale a pena mostrar tem de ser mais fácil do que é mesmo para si.',
  } as Record<string, string>,
} as const

/** Internal words that must never reach any of these screens. */
export const FORBIDDEN_ON_SCREEN = [
  'budget_stretch', 'min_score', 'bedrooms_tolerance', 'area_adjacency',
  'filter_would_find', 'filterWouldFind', 'unmatchable', 'thresholds_not_configured',
  'listing_matches', 'lead_requirements', 'origin', 'computed', 'superseded',
  'agent_dismissed', 'claimed_unevidenced', 'null', 'undefined', 'NaN',
]
