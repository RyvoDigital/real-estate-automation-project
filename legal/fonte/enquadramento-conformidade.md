# Enquadramento de Conformidade

**Sistemas automatizados de comunicação com titulares de dados em contexto de mediação imobiliária**

> **Documento interno de conformidade.** Descreve as medidas técnicas e organizativas adoptadas pela Ryvo Digital, designação comercial de Pedro Seixas Vale — Consultoria, Lda, para assegurar que os sistemas automatizados fornecidos aos seus clientes operam em conformidade com o Regulamento (UE) 2016/679, o Regulamento (UE) 2024/1689, a Directiva 2002/58/CE e as respectivas transposições nacionais.
>
> Redigido em 17 de Setembro de 2026. **Não constitui aconselhamento jurídico e carece de revisão e confirmação por advogado antes de qualquer utilização perante terceiros.** As secções assinaladas requerem confirmação específica.

---

# 1. Objecto e finalidade deste documento

A Ryvo Digital fornece a agências de mediação imobiliária sistemas automatizados que comunicam, através do WhatsApp, com pessoas singulares que contactam essas agências ou que constam das suas bases de contactos.

Nessa relação, **a agência é responsável pelo tratamento e a Ryvo Digital é subcontratante**, nos termos do artigo 28.º do RGPD.

Este documento existe para três finalidades:

**Primeira.** Demonstrar, perante qualquer autoridade de controlo, que as obrigações aplicáveis foram identificadas, analisadas e traduzidas em medidas técnicas concretas, e não deixadas ao critério do utilizador.

**Segunda.** Documentar a repartição de responsabilidades entre a Ryvo Digital e o cliente, de modo a que cada parte responda pelo que efectivamente controla.

**Terceira.** Registar as decisões de concepção que foram tomadas **contra o interesse comercial imediato** por razões de conformidade, e a fundamentação de cada uma.

---

# 2. Princípio orientador

> **O sistema recusa por defeito.** Quando a licitude de um contacto não pode ser demonstrada a partir de dados registados, o sistema não envia. A ausência de informação é tratada como proibição e nunca como permissão.

Este princípio é estrutural e não configurável. **Não existe definição, opção ou pedido do cliente que o desactive.** É a medida técnica que sustenta todas as restantes.

---

# 2.A As cinco acções sujeitas a regulação

A análise é organizada por **tipo de acção** e não por automação, por três razões: as acções são estáveis enquanto as automações evoluem; uma mesma acção surge em várias automações; e a organização por acção garante que nenhuma automação futura escapa à análise.

| # | Acção | Automações | Regime dominante | Secção |
|---|---|---|---|---|
| I | Responder dentro da janela de 24 horas | 01 | Baixo risco. Consentimento implícito na iniciativa do titular | §3 |
| II | Comunicação por iniciativa da empresa | 02, 03, 05 | **O mais exigente.** Consentimento, jurisdição, modelos aprovados | §§4–8 |
| III | **Publicação de conteúdo publicitário de imóveis** | 04 | **Regime próprio, independente do RGPD** | §8.A |
| IV | **Pedido de avaliação** | 05 | Políticas de plataforma, com proibições recentes | §8.B |
| IV-A | **Pedido de recomendação a terceiro** | — | **Por analisar.** Ver §8.B.4 | — |
| V | Conservação e movimentação de dados pessoais | Todas | RGPD, tratado no ATD | Anexo II do Contrato |

**Toda a automação futura deve ser classificada numa ou mais destas acções antes de ser concebida.** Uma automação que não se enquadre em nenhuma exige análise autónoma antes de qualquer construção.


---

# 3. Transparência quanto à utilização de inteligência artificial

## 3.1 Obrigação aplicável

O artigo 50.º, n.º 1, do Regulamento (UE) 2024/1689 (Regulamento da Inteligência Artificial), aplicável desde **2 de Agosto de 2026**, impõe que os sistemas de IA destinados a interagir directamente com pessoas singulares sejam concebidos de modo a que estas sejam informadas de que interagem com um sistema de IA, **de forma clara e distinguível, o mais tardar no momento da primeira interacção**.

Trata-se de **dever de concepção** e não de mero aviso. O dever recai sobre o fornecedor do sistema, não sendo transferido para o fornecedor do modelo subjacente. As coimas aplicáveis ascendem a 15 milhões de euros ou 3% do volume de negócios anual mundial, aplicando-se às PME o montante inferior.

## 3.2 Medida adoptada

Toda a conversa é precedida de uma declaração que antecede qualquer conteúdo, no idioma do destinatário:

> 🤖 *[Nome do assistente], assistente virtual da [Agência]. Esta conversa é respondida por inteligência artificial, não por uma pessoa.*

**Características da implementação:**

| | |
|---|---|
| **Determinística** | A declaração é anteposta pelo sistema, não gerada pelo modelo de linguagem. Não depende de instrução interpretada |
| **Universal** | Aplica-se a todos os caminhos de saída sem excepção, incluindo respostas a mensagens de voz e imagem que não passam pelo modelo |
| **Baseada em registo** | A condição de envio é «foi alguma vez entregue uma declaração a este destinatário», lida do histórico — e não «é esta a primeira mensagem», que seria uma presunção |
| **Repetida após intervenção humana** | Quando um colaborador da agência responde manualmente e a conversa regressa ao sistema automatizado, a declaração é repetida, por o destinatário ter entretanto formado a convicção legítima de que falava com uma pessoa |
| **Verificada** | Um invariante automático compara o texto efectivamente entregue ao operador de comunicações com a obrigação, e regista o veredicto em cada execução |

## 3.3 Prova

Cada envio produz quatro registos independentes e reconciliáveis entre si: a marcação da mensagem entregue, um evento datado, o registo da execução, e o veredicto do invariante, este último obtido a partir do texto realmente enviado e não de um indicador interno.

**O sistema conserva, por destinatário, a data e hora da primeira declaração, o texto exacto e o identificador atribuído pelo operador de comunicações.**

## 3.4 Demonstração documentada

A conformidade foi verificada em ambiente real em 17 de Setembro de 2026, através de sequência controlada: primeira mensagem com declaração, segunda mensagem sem repetição, intervenção humana, e nova mensagem com declaração repetida. Os quatro registos foram confirmados em cada caso.

---

# 4. Comunicações não solicitadas — enquadramento geral

## 4.1 Dupla ordem de obrigações

As comunicações de marketing directo por via electrónica estão sujeitas a **dois conjuntos de regras independentes**, sendo que o cumprimento de um não dispensa o outro:

**Ordem legal.** A Directiva 2002/58/CE e as respectivas transposições nacionais, conjugadas com o RGPD.

**Ordem contratual de plataforma.** A *WhatsApp Business Messaging Policy* da Meta Platforms, que exige consentimento prévio demonstrável e cujo incumprimento determina degradação da classificação de qualidade, restrição do volume de envio ou encerramento da conta.

O sistema foi concebido para satisfazer **o mais exigente dos dois** em cada caso concreto.

## 4.2 Três pressupostos que o sistema não admite

A concepção rejeita expressamente três interpretações frequentes e incorrectas:

> **Uma mensagem anterior do titular não constitui consentimento.** O facto de uma pessoa ter escrito à agência abre uma janela de resposta de 24 horas e nada mais. Não autoriza comunicações posteriores por iniciativa da empresa.

> **O clique num anúncio não constitui consentimento continuado.** Sinaliza consentimento para aquela conversa, não uma subscrição.

> **Um consentimento genérico anterior que não identificou o WhatsApp não é consentimento válido à luz do RGPD**, ainda que possa satisfazer a política da plataforma, por o consentimento dever ser específico e informado quanto ao canal.

---

# 5. Segmentação como instrumento de licitude

Cada contacto importado é classificado num e num só segmento. **O segmento determina se o contacto pode ser contactado e por que via.**

| Segmento | Definição | Regime |
|---|---|---|
| **A** | Cliente que concretizou transacção com a agência | Excepção de cliente existente, quando disponível na jurisdição |
| **B** | Consentimento documentado: data, origem e redacção conservadas | Contactável |
| **C** | Contacto anterior sem transacção | **Não é cliente existente.** Exige obtenção prévia de consentimento |
| **D** | Origem não documentada | **Não contactável** |
| **E** | Oposição manifestada, bloqueio ou supressão | **Nunca contactável.** Permanente |

## 5.1 Declaração pela agência

**A classificação é declarada pela agência, não inferida pelo sistema.** O sistema propõe uma classificação a partir dos dados disponíveis e a agência confirma ou corrige.

Cada declaração é registada com data, hora e identificação de quem a efectuou.

**Fundamento:** o conhecimento da origem dos dados existe na agência e não no fornecedor. A declaração coloca a responsabilidade onde está a informação e produz o registo que uma autoridade de controlo solicitaria.

## 5.2 O segmento D é a medida mais relevante

Na generalidade das agências de pequena dimensão, o segmento D é o mais numeroso. **O sistema recusa contactá-lo**, ainda que o cliente o solicite expressamente.

Esta é a decisão de concepção mais onerosa comercialmente e a mais relevante em matéria de conformidade.

---

# 6. Registo de consentimento

Mantém-se, por contacto e por evento, um registo destinado especificamente a responder a um pedido de autoridade de controlo:

- Data e hora do acto
- Origem e canal
- **Redacção exacta apresentada ao titular**
- Segmento declarado e identificação de quem declarou
- Todas as alterações de estado subsequentes

**O registo é apenas incremental.** Nenhuma linha é alterada ou eliminada; a retirada do consentimento constitui novo registo.

> A Meta faz recair sobre o remetente o ónus da prova do consentimento. Um consentimento que não possa ser demonstrado é, para todos os efeitos, inexistente. Este registo é o instrumento dessa demonstração.

---

# 7. Oposição

| Requisito | Medida |
|---|---|
| **Presente em todas as comunicações** | Incluída no rodapé de todos os modelos de marketing |
| **Um único passo** | «Responda SAIR». Sem hiperligação, formulário ou confirmação |
| **Execução imediata** | Aplicada no momento da recepção, não no lote seguinte |
| **Permanente e transversal** | Propriedade do contacto e não da campanha |
| **Reconhecimento amplo** | SAIR, STOP, PARAR, BAJA, UNSUBSCRIBE e formulações equivalentes em português, espanhol e inglês. **Em caso de dúvida, é tratada como oposição** |
| **Bloqueio equiparado** | O bloqueio do número pelo titular é tratado como oposição |

**Fundamento do critério de dúvida:** o custo de um falso positivo é a perda de um contacto; o de um falso negativo é uma reclamação junto da autoridade de controlo. A assimetria determina o critério.

---

# 8. Jurisdição

## 8.1 Regra aplicável

> **A lei aplicável é determinada pelo local do destinatário e não pelo local de estabelecimento da empresa.**

Uma agência portuguesa que contacte um titular em Espanha está sujeita à lei espanhola quanto a essa comunicação.

## 8.2 Mecanismo

O país é resolvido a partir do prefixo telefónico internacional, normalizado em formato E.164. Trata-se de facto objectivo e não de apreciação.

O país é consultado numa **tabela de políticas por jurisdição** que, conjugada com o segmento, determina o resultado: contactável, contactável mediante consentimento prévio, ou não contactável.

> ⚠️ **Um contacto cujo país não conste da tabela não é contactável.** A ausência de entrada é tratada como proibição.

## 8.3 Tabela de políticas

> **Cada entrada carece de confirmação por advogado antes da entrada em serviço de qualquer cliente nessa jurisdição.** A estrutura é técnica; o conteúdo é jurídico.

### Portugal 🇵🇹

**Diploma:** Lei n.º 41/2004, de 18 de Agosto, artigos 13.º-A e 13.º-B, na redacção actual.

O artigo 13.º-A exige consentimento prévio e expresso do assinante que seja pessoa singular para o envio de comunicações não solicitadas para fins de marketing directo, designadamente por sistemas automatizados, correio electrónico, SMS, EMS, MMS **«e outros tipos de aplicações similares»** — categoria em que se inclui o WhatsApp.

O artigo 13.º-B impõe a manutenção de lista actualizada das pessoas que consentiram e dos clientes que não se opuseram.

A Comissão Nacional de Protecção de Dados emitiu orientação específica na **Diretriz 2022/1** sobre comunicações electrónicas de marketing directo.

Existe ainda a **Lista de Oposição (Lista Robinson)**, prevista na Lei n.º 6/99, administrada pela AMD sob supervisão da CNPD, cuja consulta é recomendável antes de qualquer campanha.

**Regime aplicado:** excepção de cliente existente disponível para o segmento A, com manutenção obrigatória das listas do artigo 13.º-B.

### Espanha 🇪🇸

**Diploma:** Ley 34/2002 (LSSI), artigo 21.

Proíbe comunicações comerciais por via electrónica que não tenham sido solicitadas ou expressamente autorizadas. Existe excepção para clientes existentes, mas **a Agencia Española de Protección de Datos aplica-a de forma marcadamente restritiva**, ao ponto de a prática profissional a considerar indisponível. Os contactos B2B beneficiam de protecção equivalente à dos consumidores.

**Regime aplicado:** excepção tratada como indisponível. **Apenas o segmento B é contactável.** O segmento C encontra-se desactivado para destinatários em Espanha até confirmação jurídica em contrário.

### Irlanda 🇮🇪

Excepção de cliente existente disponível, **com caducidade de 12 meses** a contar da venda ou da última comunicação conforme a que o titular não se opôs.

### Alemanha 🇩🇪

Secção 7 da UWG qualifica a publicidade sem consentimento prévio expresso como assédio. O consentimento simples foi considerado prova insuficiente, sendo o duplo consentimento a norma de facto. Mesmo regime para B2B e B2C.

**Regime aplicado:** excepção tratada como indisponível.

### França 🇫🇷

A CNIL exige consentimento autónomo para marketing e restringe a reutilização de dados recolhidos para outras finalidades.

### Países Baixos 🇳🇱

Regime estrito de consentimento prévio. Foram aplicadas coimas pela utilização de listas adquiridas sem verificação da validade dos consentimentos.

### Reino Unido 🇬🇧

PECR. Excepção de cliente existente disponível para produtos similares, com oposição oferecida no momento da recolha e em cada comunicação.

### Estados Unidos 🇺🇸

**Bloqueio ao nível da plataforma.** A Meta não entrega modelos de marketing a números com indicativo +1. Apenas modelos utilitários e de autenticação.

---

# 8.A Publicidade de imóveis — Acção III

> **Regime inteiramente distinto do RGPD e da política da Meta.** Aplica-se à Automação 04, que publica conteúdo publicitário de imóveis. Foi identificado em 17 de Setembro de 2026 e não constava de qualquer análise anterior.

## 8.A.1 Obrigações em Portugal

**Classe energética.** Desde 2013, qualquer anúncio de venda ou arrendamento deve indicar a classificação energética do imóvel. O certificado é emitido por técnicos autorizados pela ADENE. A obrigação recai sobre quem coloca o imóvel no mercado, seja o proprietário ou o mediador.

> ⚠️ **Corrigido em 18 de Setembro de 2026.** Esta secção indicava «250 a 3.741 euros». **Esse é o escalão das pessoas singulares.** Para pessoas colectivas as coimas situam-se entre **2.500 e 44.890 euros** — e os clientes são empresas. A correcção não é de redacção: o texto da recusa no portão de publicação cita o valor precisamente para que a conversa com a agência aconteça, e subestimá-lo doze vezes é o contrário do que essa frase serve para fazer.

**Licença AMI — é um estado, não um facto.** O IMPIC suspende e cancela licenças, e publica a lista. Uma licença presente no nosso registo não é, por si, uma licença válida hoje. Tem a mesma forma de um certificado que caduca: **uma permissão que pode cessar sem que ninguém actue tem de ser reperguntada, e não concedida.** A reverificação periódica da Automação 04 abrange-a.

**Número de licença AMI.** A licença de mediação imobiliária, emitida pelo IMPIC ao abrigo da Lei n.º 15/2013, deve ser divulgada em toda a documentação e em todas as acções de publicidade e marketing da empresa.

**Supervisão.** O IMPIC regula e fiscaliza a actividade, incluindo o cumprimento das obrigações de informação.

## 8.A.2 Medidas a adoptar na Automação 04

| Medida | Natureza |
|---|---|
| **Recusa de publicação sem classe energética registada** | Bloqueante. Não configurável |
| **Número AMI presente em todas as peças publicadas** | Obtido na integração e verificado antes da publicação |
| **Verificação da validade do certificado energético** | O certificado tem prazo. Um certificado caducado é tratado como ausente |
| **Preço e características lidos da fonte da agência** | Nunca gerados nem inferidos pelo sistema |
| **Invariante próprio** | Nenhuma peça publicada sem classe energética e sem número AMI |

> A automação **não gera** características, preços ou disponibilidades. Publica o que a agência forneceu, com as menções obrigatórias, e recusa quando falta um elemento legalmente exigido.

## 8.A.3 Outras jurisdições

Espanha e outros Estados-Membros dispõem de regimes próprios quanto à informação obrigatória em anúncios imobiliários. **Cada jurisdição deve ser analisada antes da entrada em serviço da Automação 04 nesse mercado**, e a tabela do §8.3 alargada em conformidade.

---

# 8.B Pedidos de avaliação — Acção IV

> Aplica-se à Automação 05. **A concepção intuitiva desta automação constitui infracção.**

> ⚠️ **Âmbito desta secção, delimitado em 19 de Setembro de 2026.** Esta secção
> trata **exclusivamente do pedido de avaliação pública** dirigido a quem
> concluiu transacção com a agência. Na versão 2 a Acção IV intitulava-se
> «pedido de avaliação **ou recomendação**» e o texto abaixo analisava apenas a
> primeira — o documento dava por analisado o que não estava. O pedido de
> recomendação é matéria distinta e consta do §8.B.4 como **por analisar**.

## 8.B.1 A armadilha

O desenho natural — perguntar ao cliente como correu e, se a resposta for positiva, encaminhá-lo para deixar uma avaliação pública — é aquilo que a Google designa por **review gating**, isto é, a triagem de clientes por sentimento antes do pedido de avaliação.

**Encontra-se expressamente proibido e é objecto de fiscalização automatizada activa.** A actualização de Abril de 2026 tornou a proibição explícita, e a detecção é feita por sistemas de inteligência artificial da própria plataforma.

## 8.B.2 Proibições aplicáveis

| Proibido | Nota |
|---|---|
| **Triagem por sentimento** | Pedir apenas a clientes satisfeitos, ou pré-filtrar por inquérito |
| **Incentivos de qualquer natureza** | Descontos, ofertas, sorteios. Proibidos mesmo quando associados a avaliações honestas e não apenas positivas |
| **Pedido de menção a colaborador** | Proibição introduzida em Abril de 2026 |
| **Quotas de avaliações** | Proibido instruir colaboradores a obter um número determinado |
| **Pressão presencial e dispositivos partilhados** | Quiosques e tablets de estabelecimento |
| **Conteúdo guionado** | O pedido deve ser neutro, sem indicar o que escrever |

**Acresce que picos anómalos de volume são sinalizados como indício de manipulação independentemente da intenção** — facto directamente relevante para uma automação que processa clientes em lote.

## 8.B.3 Medidas a adoptar

- O pedido é enviado a **todos os clientes** que concluíram transacção, sem excepção e sem triagem prévia
- **Sem qualquer incentivo**, em nenhuma circunstância
- **Redacção neutra**, sem indicação de conteúdo nem menção a colaboradores
- **Ritmo distribuído**, evitando picos de volume
- Uma eventual recolha interna de opinião é **posterior e autónoma**, nunca condicionando o pedido público

> A distinção operativa é simples: **pedir a todos é permitido; escolher a quem pedir não é.**

## 8.B.4 Pedido de recomendação — matéria por analisar

**Não analisada. Registada para que a ausência de análise seja visível.**

Um pedido de recomendação é acto distinto de um pedido de avaliação, e as regras
do §8.B.2 não lhe são aplicáveis: **não é a política da Google que o governa.**

A questão que levanta é outra e é anterior: pedir a alguém que recomende a
agência a um conhecido tem por resultado, quando corre bem, **a entrega de dados
pessoais de um terceiro que nada consentiu.** O regime aplicável é, por isso, o
do tratamento desses dados e não o de qualquer política de plataforma.

**Consequência actual, independentemente da análise.** Um contacto obtido por
esta via chega sem origem documentada, o que o coloca no **segmento D**, que o
sistema recusa contactar (§5.2). Nenhuma automação da Ryvo Digital pede
recomendações, e a arquitectura recusaria o resultado se pedisse.

**Esta secção não resolve a questão. Assinala que não está resolvida**, e que
qualquer automação futura que a pretenda abordar carece de análise autónoma antes
de ser concebida, nos termos do §2.A.


---

# 9. Medidas de protecção do canal

O mesmo número de WhatsApp serve o atendimento e as campanhas. A degradação da classificação de qualidade por efeito de uma campanha afecta igualmente o atendimento.

- Primeiro envio limitado a 10–20% da lista, com verificação da classificação antes de qualquer ampliação
- Lotes máximos de 30 contactos por dia
- Campanhas concebidas em lotes autónomos, de modo a que a suspensão de um não invalide o anterior
- Verificação da classificação de qualidade antes de cada lote, com **suspensão automática** e alerta em caso de degradação
- Máximo de três contactos por titular, com intervalos mínimos, e nunca dois na mesma semana

---

# 10. Repartição de responsabilidades

| Matéria | Responsável | Fundamento |
|---|---|---|
| Origem e licitude dos dados fornecidos | **Agência** | O conhecimento existe na agência. Declarado contratualmente |
| Classificação por segmento | **Agência**, sob proposta do sistema | Idem |
| Recusa de envio sem fundamento registado | **Ryvo Digital** | Medida técnica, não configurável |
| Determinação da jurisdição aplicável | **Ryvo Digital** | Resolução automática a partir do número |
| Conteúdo da tabela de jurisdições | **Revisão jurídica** | Carece de confirmação por advogado |
| Transparência quanto à utilização de IA | **Ryvo Digital** | Dever do fornecedor nos termos do artigo 50.º |
| Registo e execução de oposições | **Ryvo Digital** | Medida técnica |
| Conservação do registo de consentimento | **Ryvo Digital**, por conta da agência | Subcontratante |
| Resposta a pedidos de titulares | **Agência**, com assistência da Ryvo Digital | Artigo 28.º, n.º 3, alínea e) |
| Classe energética e validade do certificado | **Agência** fornece; **Ryvo Digital** recusa publicar sem ela | Acção III |
| Número de licença AMI | **Agência** fornece; verificado automaticamente | Acção III |
| Ausência de triagem em pedidos de avaliação | **Ryvo Digital** | Medida técnica, não configurável |

---

# 11. Decisões tomadas contra o interesse comercial

Registam-se expressamente, por constituírem o elemento mais demonstrativo da postura adoptada:

| Decisão | Custo assumido |
|---|---|
| Recusa de contacto ao segmento D | É o segmento mais numeroso na generalidade das agências |
| Recusa de inferência de consentimento | Reduz substancialmente a lista contactável |
| Desactivação do segmento C em Espanha | Limita materialmente a proposta em mercado relevante |
| Limite de três contactos | Práticas de mercado sugerem sequências mais longas |
| Recusa de utilização de modelos utilitários para conteúdo promocional | Contornaria restrições com risco para o cliente |
| Recusa de contactos obtidos por recolha automatizada | Fonte de contactos de custo nulo, rejeitada |
| Declaração de IA anteposta a toda a conversa | Assumidamente menos natural do que a alternativa |
| Pedido de avaliação enviado a todos, sem triagem | Produz avaliações negativas que uma triagem evitaria |
| Recusa de publicar anúncio sem classe energética | Bloqueia publicações que a agência pretende fazer |
| Um único pedido de avaliação, sem insistência | Menos avaliações do que uma sequência produziria |
| Ausência de qualquer controlo que permita saltar um cliente em concreto | A agência irá pedi-lo, e a resposta é não |
| Recusa de registar que avaliação resultou de que pedido | Prescinde de análise sobre que clientes avaliam bem — e é esse o conjunto de dados que a triagem exigiria |

---

# 12. Matérias que carecem de confirmação jurídica

1. **Cada entrada da tabela de jurisdições**, antes da entrada em serviço de cliente nessa jurisdição
2. **A mensagem de pedido de consentimento (segmento C)** — sendo ela própria, discutivelmente, comunicação comercial, importa confirmar se é admissível em Portugal e se deve permanecer desactivada em Espanha
3. **A redacção da declaração de IA**, quanto à suficiência face ao artigo 50.º
4. **A obrigação da Lista Robinson** — se a consulta é exigível ou meramente recomendável, e a quem incumbe
5. **Suficiência da declaração da agência quanto à origem dos dados**, e conveniência de documento autónomo assinado
6. **Repartição de deveres entre fornecedor e responsável pela implantação** no âmbito do Regulamento da Inteligência Artificial
7. **Obrigações de informação em anúncios imobiliários** em cada jurisdição onde a Automação 04 venha a operar
8. **Responsabilidade pela exactidão da classe energética publicada** — se recai sobre a agência, sobre o mediador, ou sobre ambos
9. **Qualificação do pedido de avaliação** enquanto comunicação comercial para efeitos da Lei n.º 41/2004 — *submetida a 19 de Setembro de 2026, questão 1 da nota da Automação 05. Registada desde 17 de Setembro e omitida dos dois lotes anteriores*
10. 🔴 **Se a excepção de cliente existente cobre um pedido de avaliação**, não sendo este comunicação relativa a produto ou serviço análogo. Determina se a Automação 05 se dirige ao segmento A ou apenas ao segmento B — *submetida a 19 de Setembro de 2026, questão 2 da mesma nota*
11. **O pedido de recomendação a terceiro** (§8.B.4), por analisar

---

# 13. Revisão

Este documento é revisto sempre que: seja alterada a política da Meta; seja publicada orientação de autoridade de controlo relevante; entre em vigor legislação aplicável, designadamente o Regulamento ePrivacy; ou seja acrescentada jurisdição à tabela.

**Versão 2.1 · 19 de Setembro de 2026 · Pendente de revisão jurídica**

*Versão 1 cobria as Acções I, II e V. A versão 2 acrescenta as Acções III (publicidade de imóveis) e IV (pedidos de avaliação), bem como o mapa de acções do §2.A.*

*Versão 2.1 (19 de Setembro de 2026) corrige duas coisas e não acrescenta análise
nova: as coimas do §8.A, que indicavam o escalão das pessoas singulares quando os
clientes são pessoas colectivas; e o âmbito da Acção IV, que se intitulava «pedido
de avaliação ou recomendação» analisando apenas o primeiro. **Ambas as correcções
são de alcance e não de redacção: o documento afirmava mais do que sustentava.***
