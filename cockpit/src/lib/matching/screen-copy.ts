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
  goToTriage: 'Ver quem o sistema não sabe ordenar',
  strengthWord: { strong: 'Forte', possible: 'Possível', weak: 'Fraco' } as Record<string, string>,
} as const

export const TRIAGE = {
  title: 'Para quem é este imóvel',
  intro:
    'Estes contactos não têm nada registado sobre o que procuram, por isso o ' +
    'sistema não os sabe ordenar. Quem os conhece é a agência.',
  /** The honest framing of what the screen is, said before anything is asked. */
  what:
    'Escolha quem lhe ocorre. O que disser fica guardado, e da próxima vez o ' +
    'sistema já sabe alguma coisa sobre essas pessoas.',
  noneLeft: 'Já passou por todos. Não há mais ninguém por ver nesta lista.',
  emptyList: 'Ainda não há contactos importados para esta agência.',
  groupRest: 'Sem ficheiro, sem data e sem zona',
  groupYear: (y: string) => `Falámos pela última vez em ${y}`,
  groupArea: (a: string) => `Contactos em ${a}`,
  groupBatch: (f: string) => `Do ficheiro ${f}`,
  countOne: '1 contacto',
  countMany: (n: number) => `${n} contactos`,
  chosenAlready: 'Já escolhido',
  nameless: 'Sem nome no ficheiro',
  pick: 'Escolher',
  whoDecides: 'Quem está a decidir',
  whoDecidesNote:
    'O nome de quem, na agência, diz que este imóvel serve para esta pessoa. ' +
    'Não é quem está a mexer no ecrã.',
  why: 'Porquê esta pessoa?',
  whyNote: 'Uma linha chega. Pode deixar em branco.',
  /** ⚠️ The claim that must NOT be overstated — see triage.ts. */
  whyHelps:
    'Se disser o que essa pessoa procura — a zona, a tipologia, o que não ' +
    'dispensa — o sistema passa a saber isso. Se for outra coisa qualquer, ' +
    'fica guardado na mesma, mas não ajuda a ordenar.',
  chosenSoFarOne: '1 pessoa escolhida para este imóvel.',
  chosenSoFarMany: (n: number) => `${n} pessoas escolhidas para este imóvel.`,
  notAvailable: 'Este imóvel não está disponível. Pode escolher, mas não o proponha a ninguém.',
} as const

/**
 * The exemption declaration — written to read like the segmentation one.
 *
 * The phrasing of `whoIsDeclaring` and its hint is taken from
 * `segmentation/copy.ts` deliberately and almost word for word. An agency that
 * has sat through the contact declaration will recognise this immediately, and
 * that recognition is worth more than anything we could improve.
 */
export const EXEMPTION = {
  title: 'Este imóvel não precisa de certificado?',
  intro:
    'Desde 2013, qualquer anúncio de venda ou arrendamento tem de indicar a classe ' +
    'energética. Nem todo o edificado está sujeito a certificação — se este for um ' +
    'desses casos, é a agência que o diz, e fica registado quem o disse.',
  whatItDoesNot:
    'Não somos nós a decidir se o imóvel está dispensado. Registamos quem o afirmou ' +
    'e com que fundamento, e é esse registo que responde a uma fiscalização.',
  whoIsDeclaring: 'Quem está a dizer isto',
  whoIsDeclaringHint:
    'O nome de quem na agência sabe a resposta — mesmo que sejamos nós a escrever. ' +
    'Fica no registo.',
  basis: 'Porquê',
  basisHint:
    'Nas suas palavras. Uma frase que alguém da agência assine — é o que a ' +
    'fiscalização pergunta.',
  save: 'Registar',
  saved: 'Registado.',
  already: 'Este imóvel já tem classe energética, por isso não precisa de dispensa.',
  current: (who: string, when: string) => `Dispensa registada por ${who} em ${when}.`,
  currentBasis: 'Fundamento:',
  nothingYet: 'Não há nenhuma dispensa registada para este imóvel.',
} as const

/**
 * The notice — and every word of it is chosen to STOP SHORT of claiming an act.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ WE CANNOT WITHDRAW A POST WE DID NOT PUBLISH.                           │
 * │                                                                         │
 * │ A person at the agency published it, wherever they publish. All this    │
 * │ can do is tell them, and record that they were told. That is the whole  │
 * │ of it.                                                                  │
 * │                                                                         │
 * │ A notice that reads like an action is worse than one that reads like a  │
 * │ warning: somebody reads "corrigido" or "retirado", believes the problem │
 * │ is closed, and the unlawful advertisement is still up — with our own    │
 * │ record saying it was handled. `notice.test.ts` fails on any verb that   │
 * │ claims we did something to the advertisement.                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export const NOTICE = {
  title: 'O que deixou de estar em ordem',
  intro:
    'Um anúncio pode deixar de cumprir a lei sem que nada no imóvel tenha ' +
    'mudado e sem que ninguém tenha feito nada: um certificado chega ao fim do ' +
    'prazo, uma licença deixa de estar válida, ou passa a ser exigida uma ' +
    'menção que antes não era.',
  /** What we can do, said before the list rather than after it. */
  whatWeCanDo:
    'O que podemos fazer é avisar. Os anúncios foram publicados pela agência, nos ' +
    'canais da agência, por isso é a agência que tem de decidir o que fazer com eles. ' +
    'Fica registado que foram avisados e quando.',
  lapsedHeading: 'Já expirados',
  lapsedOne: 'Há 1 imóvel cujo certificado já expirou.',
  lapsedMany: (n: number) => `Há ${n} imóveis cujos certificados já expiraram.`,
  expiredOn: (when: string, days: number) => `Expirou em ${when}, há ${days} dias.`,
  expiringHeading: 'A expirar em breve',
  expiringOne: (days: number) => `1 imóvel com certificado a expirar nos próximos ${days} dias.`,
  expiringMany: (n: number, days: number) =>
    `${n} imóveis com certificados a expirar nos próximos ${days} dias.`,
  // Zero whole days left means it expires TODAY and is still valid today — the
  // gate agrees. "Daqui a 0 dias" is what a number says; "hoje" is what a
  // person says, and this is read aloud.
  expiresToday: (when: string) => `Expira hoje, ${when}.`,
  expiresTomorrow: (when: string) => `Expira amanhã, ${when}.`,
  expiresOn: (when: string, days: number) => `Expira em ${when}, daqui a ${days} dias.`,
  toldOn: (when: string) => `Agência avisada em ${when}.`,
  notToldYet: 'A agência ainda não foi avisada.',
  markTold: 'Registar que a agência foi avisada',
  nothing: 'Nenhum certificado expirou nem está prestes a expirar.',
  /*
   * 🔴 WHEN NOTHING WAS CHECKED, AND NOT THE SAME SENTENCE AS WHEN NOTHING WAS
   * FOUND. Added 20 September 2026, on the first render of this screen.
   *
   * `nothing` above is honest only if something was looked at. With no
   * clearance recorded, the re-check examines zero rows and finds zero
   * problems — and "nenhum certificado expirou" then reads as a clean bill for
   * a check that never ran. That is the defect this entire screen is written
   * to avoid, appearing in its own empty state.
   *
   * The count was on the page — "0 verificadas", in small grey type — and a
   * denominator nobody reads is not a correction to a sentence they do.
   */
  nothingToCheck:
    'Ainda não há nenhuma autorização registada para esta agência, por isso não ' +
    'houve nada para reverificar. Uma lista vazia aqui não quer dizer que esteja ' +
    'tudo em ordem — quer dizer que ainda não havia nada a olhar.',
  /** The sentence to say to the agency. Also stops short of an act. */
  whatToTellThem: (ref: string) =>
    `O certificado energético de ${ref} chegou ao fim do prazo. Enquanto não houver ` +
    'um certificado válido, qualquer anúncio deste imóvel fica sem a menção obrigatória.',

  // --- one sentence per reason, because the reasons need different things ---
  // An agency told only that the certificate lapsed buys a new certificate,
  // and the licence is still not valid. So each cause is said on its own.
  causeExpired: 'O certificado energético chegou ao fim do prazo.',
  causeRevoked:
    'A licença de mediação da agência deixou de estar válida. Isso resolve-se ' +
    'junto do IMPIC e não connosco.',
  causeArrived:
    'Passou a ser exigida uma menção que não era exigida quando este anúncio foi ' +
    'preparado. A lei mudou; o imóvel não.',
  /*
   * ⚠️ THIS ONE SAYS LESS THAN THE OTHER THREE, ON PURPOSE.
   *
   * The other three are statements about the advertisement. This is a statement
   * about US: we can no longer say what the jurisdiction requires. The property
   * may be perfectly in order, and saying "this is irregular" when what is true
   * is "we do not know" would send an agency to fix something that is not
   * broken — and would spend the credibility of every other line on this screen.
   */
  causeUnresolvable:
    'Não conseguimos confirmar o que é hoje exigido neste país ou região, por ' +
    'isso também não conseguimos confirmar que este anúncio continua em ordem. ' +
    'Não quer dizer que esteja irregular: quer dizer que não sabemos.',
  /** Null is not zero — a date we do not hold is said as one we do not hold. */
  sinceUnknown: 'Não sabemos desde quando.',

  // --- licences to confirm: a question, never a failure --------------------
  confirmHeading: 'Licenças por confirmar',
  confirmIntro:
    'Não consultamos o IMPIC. O que temos é o número que a agência nos deu, e ao ' +
    'fim de algum tempo isso deixa de chegar para nos apoiarmos nele. Não é um ' +
    'problema com o anúncio — é uma pergunta a fazer à agência.',
  confirmNever: (number: string) =>
    `Nunca confirmámos a licença ${number} com a agência.`,
  confirmStale: (number: string, days: number) =>
    `A licença ${number} não é confirmada há ${days} dias.`,
  confirmAffectsOne: 'Há 1 imóvel que depende dela.',
  confirmAffectsMany: (n: number) => `Há ${n} imóveis que dependem dela.`,
  confirmNothing: 'Não há licenças por confirmar.',

  /*
   * ⚠️ AND WHAT THIS RUN DID NOT LOOK AT.
   *
   * An empty section reads as "nothing is wrong". When a check could not run,
   * what is true is "nothing was looked at", and those are opposite meanings
   * wearing the same blank space.
   */
  notCheckedHeading: 'Nem tudo foi verificado',
  notChecked:
    'Nesta verificação faltaram dados para confirmar tudo, por isso o que está ' +
    'em cima pode estar incompleto. Uma lista vazia aqui não quer dizer que ' +
    'esteja tudo bem — quer dizer que não foi possível ver.',
} as const

export const SILENCE = {
  title: 'Quem ficou à espera',
  intro:
    'Pessoas que nos disseram o que procuravam e com quem ninguém fala desde então.',
  pick: 'Escolha a agência.',
  /** The headline. The whole argument of the product, in one sentence. */
  headlineOne: (days: number) =>
    `Uma pessoa disse-nos o que procurava e ninguém fala com ela há ${days} dias.`,
  headlineMany: (n: number, days: number) =>
    `${n} pessoas disseram-nos o que procuravam e ninguém fala com elas há mais de ${days} dias.`,
  none: 'Ninguém está à espera. Toda a gente que nos disse o que procura foi contactada.',
  nobodySaidAnything:
    'Ainda não temos registo de ninguém a dizer o que procura, por isso não há ' +
    'nada para mostrar aqui. Isso muda assim que houver conversas ou notas.',
  silentFor: (days: number) => `${days} dias`,
  lastSpoke: 'Última vez',
  nameless: 'Sem nome no ficheiro',
  /** Counted separately and never folded into the headline. */
  unknownClockOne:
    'Há ainda 1 pessoa que nos disse o que procura e sobre quem não sabemos ' +
    'quando foi a última conversa.',
  unknownClockMany: (n: number) =>
    `Há ainda ${n} pessoas que nos disseram o que procuram e sobre quem não ` +
    'sabemos quando foi a última conversa.',
  recentlyOne: '1 pessoa disse-nos o que procura e foi contactada recentemente.',
  recentlyMany: (n: number) =>
    `${n} pessoas disseram-nos o que procuram e foram contactadas recentemente.`,
  /** The honest denominator, so the headline cannot be read as the whole list. */
  outOfTotal: (total: number) => `De ${total} contactos no total.`,
} as const

export const CALIBRATE = {
  title: 'O que é uma boa proposta',
  intro:
    'Algumas perguntas sobre como trabalha. As respostas ficam guardadas para ' +
    'esta agência e podem ser mudadas a qualquer momento.',
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
  'triage', 'rankable', 'hard constraint',
  'energy_class', 'energy_exemption', 'ami_licence', 'declared_by',
  'publication_clearances', 'cleared', 'not_on_the_market', 'no_energy_class',
  'agent_dismissed', 'claimed_unevidenced', 'null', 'undefined', 'NaN',
  // Automation 05. `unaccounted` is the one that would do real damage on a
  // screen: it is our word for a finding, and an agency reading it would hear
  // an accusation about their bookkeeping rather than a gap in ours.
  'unaccounted', 'disposition', 'party_not_named', 'gate_refused',
  'window_expired', 'reported_after_window', 'send_failed', 'agency_disabled',
  'no_review_destination', 'not_in_service', 'close_id', 'review_link',
]

export const REVIEW = {
  title: 'Pedidos de opinião',
  intro:
    'Concluída uma venda, pedimos a opinião à pessoa que a agência indicar. ' +
    'A todas, sem escolher.',
  pick: 'Escolha a agência.',

  // --- the three counts, side by side -------------------------------------
  closesLabel: 'Vendas comunicadas',
  askedLabel: 'Pedidos enviados',
  pendingLabel: 'Ainda dentro do prazo',

  /*
   * 🔴 THE SENTENCE THE WHOLE SCREEN EXISTS FOR.
   *
   * The asked list is always shorter than the sales list, because the gate
   * refuses people for reasons that have nothing to do with what they would
   * write. Somebody will read that difference as a bug, and closing it is the
   * offence. A discrepancy displayed and explained does not get investigated.
   */
  gapHeading: 'Porque é que os dois números não são iguais',
  gapWhy:
    'A lista de pedidos é sempre mais curta do que a lista de vendas, e isso ' +
    'está certo. Cada exclusão em baixo tem uma razão que nada tem que ver com a ' +
    'opinião da pessoa sobre a agência: é consentimento, jurisdição ou uma ' +
    'oposição já manifestada — regras que se aplicam antes de alguém poder saber ' +
    'o que essa pessoa escreveria.',
  gapDoNotClose:
    'Esta diferença não é um erro e não deve ser fechada. Pedir a todos é ' +
    'permitido; escolher a quem pedir não é, e é por isso que não existe aqui ' +
    'nenhum botão para saltar uma venda.',
  gapLine: (count: number, means: string) => `${count} — ${means}`,

  // --- the finding ---------------------------------------------------------
  findingNone: 'Todas as vendas comunicadas estão explicadas.',
  findingOne: '1 venda sem pedido e sem explicação.',
  findingMany: (n: number) => `${n} vendas sem pedido e sem explicação.`,
  findingWhy:
    'Estas pessoas concluíram uma venda, podiam ter sido contactadas, e o prazo ' +
    'passou sem pedido e sem qualquer recusa registada. Nada impediu o envio — ' +
    'nada o tentou. É o único resultado desta página que exige uma acção nossa.',
  findingRow: (ref: string, when: string) => `${ref} — venda concluída em ${when}`,
  findingNoReference: 'Sem referência de imóvel',

  // --- 🔴 what it cannot see, on the screen and not in a footnote ----------
  limitsHeading: 'O que esta página não consegue ver',
  limits: [
    'Vê as vendas que a agência nos comunicou. Não vê uma venda que não nos ' +
      'tenham comunicado.',
    'Não vê se alguém chegou a escrever uma opinião. Não consultamos a ' +
      'plataforma, e isso é deliberado.',
    'Não vê se a agência pediu a alguém por sua conta, pessoalmente ou por outra via.',
    'Sabe que uma mensagem chegou ao operador telefónico. Não sabe se foi lida.',
    'Ou seja: mostra que não ficou ninguém por perguntar de entre quem nos foi ' +
      'comunicado. Não mostra — nem pode — que a agência nos comunicou tudo.',
  ],

  // --- states that are not findings ---------------------------------------
  notChecked:
    'Não foi possível comparar os envios, por isso esta página não está ' +
    'completa. Uma lista vazia aqui não quer dizer que esteja tudo bem — quer ' +
    'dizer que não foi possível ver.',
  noLink:
    'Esta agência não tem ligação de avaliação registada, por isso não há para ' +
    'onde enviar ninguém e nada é pedido.',
  switchedOff: 'Esta agência tem os pedidos de opinião desligados.',
  nothingYet:
    'Ainda não há vendas comunicadas. Isto muda assim que a agência começar a ' +
    'dizer-nos quando fecha uma.',
} as const
