# Registo de achados de conformidade

**Ficheiro de trabalho.** Acrescenta-se uma linha sempre que surja um facto com impacto em conformidade. **Não é revisto por advogado e não é entregue a terceiros.** Alimenta as revisões deliberadas do `Enquadramento de Conformidade`, que é o documento versionado e revisto.

**Porquê dois ficheiros.** Um documento de conformidade que se altera sozinho deixa de corresponder à versão que foi revista. Este registo é informal e cresce; o enquadramento é formal e muda por decisão.

---

| Data | Achado | Origem | Impacto | Estado |
|---|---|---|---|---|
| 16 Set 2026 | Artigo 50.º do Regulamento IA aplicável desde 2 Ago 2026. Divulgação clara e distinguível na primeira interacção, como dever de concepção | Investigação | Sistema não conforme à data. Corrigido e provado em 17 Set | **Fechado** · §3 v1 |
| 17 Set 2026 | Uma mensagem anterior do titular não constitui opt-in para comunicações por iniciativa da empresa | Investigação | Invalidou o desenho original da Automação 02 | **Fechado** · §4.2 v1 |
| 17 Set 2026 | Espanha: LSSI art. 21 com leitura restritiva da AEPD torna a excepção de cliente existente inutilizável na prática | Investigação | Segmento C desactivado para destinatários em Espanha | **Fechado** · §8.3 v1 |
| 17 Set 2026 | Portugal: Lei 41/2004 art. 13.º-A abrange «outros tipos de aplicações similares», o que inclui o WhatsApp. Art. 13.º-B impõe manutenção de listas | Investigação | Excepção de cliente existente disponível, com obrigação de listas | **Fechado** · §8.3 v1 |
| 17 Set 2026 | A lei aplicável é a do destinatário, não a do estabelecimento da empresa | Investigação | Motor de jurisdição por prefixo telefónico | **Fechado** · §8 v1 |
| 17 Set 2026 | Meta não entrega modelos de marketing a números +1 | Investigação | EUA bloqueado ao nível da plataforma | **Fechado** · §8.3 v1 |
| 17 Set 2026 | **Classe energética obrigatória em todos os anúncios imobiliários em Portugal desde 2013. Coimas de 250 a 3.741 euros** | Investigação | Automação 04 deve recusar publicar sem ela | **Fechado** · §8.A v2 |
| 17 Set 2026 | **Número de licença AMI deve constar de toda a publicidade e documentação da agência** | Investigação | Automação 04 deve incluí-lo em todas as peças | **Fechado** · §8.A v2 |
| 17 Set 2026 | **Review gating expressamente proibido pela Google e fiscalizado por sistemas automáticos desde Abril de 2026** | Investigação | A concepção intuitiva da Automação 05 constituiria infracção | **Fechado** · §8.B v2 |
| 17 Set 2026 | Google proíbe pedidos que mencionem colaborador pelo nome, quotas de avaliações e incentivos de qualquer natureza | Investigação | Redacção neutra obrigatória na Automação 05 | **Fechado** · §8.B v2 |
| 17 Set 2026 | Picos anómalos de volume de avaliações sinalizados como manipulação independentemente da intenção | Investigação | Ritmo distribuído na Automação 05 | **Fechado** · §8.B v2 |
| 17 Set 2026 | **O indicativo +44 abrange quatro jurisdições: Reino Unido, Guernsey, Jersey e Ilha de Man. As dependências da Coroa não integram o Reino Unido para efeitos de protecção de dados — têm autoridade própria e decisão de adequação própria, e o PECR não lhes é aplicável. Várias gamas de telemóvel aparentemente britânicas (07911, 07781) são de Guernsey; 07797 e 07829 são de Jersey** | Construção do motor de jurisdição | A entrada «Reino Unido» do §8.3 não pode ser aplicada a um número +44 sem determinar qual das quatro. Resolvido por biblioteca e não por prefixo; as três dependências não constam da tabela e são, por isso, não contactáveis | **Aberto** · a incluir em v3 |
| 17 Set 2026 | O indicativo +1 abrange os EUA, o Canadá e cerca de vinte países das Caraíbas, distinguidos por indicativo de área e não de país | Construção do motor de jurisdição | O bloqueio de marketing da Meta a +1 não é equivalente a «Estados Unidos». Resolução por biblioteca evita atribuir regra errada a número canadiano ou caribenho | **Fechado** · resolvido na concepção |
| 17 Set 2026 | Meta proíbe «General Purpose AI Chatbots» no WhatsApp desde 15 Jan 2026. Permitidos: automação de apoio, fluxos de venda, qualificação com âmbito definido | Investigação | O Concierge enquadra-se no permitido. Registar para prova | **Aberto** · a incluir em v3 |

---

## Por verificar

| Matéria | Porquê |
|---|---|
| Regime da Lista Robinson | Se a consulta é exigível ou recomendável, e a quem incumbe |
| Requisitos de anúncios imobiliários em Espanha | A Automação 04 não pode entrar em serviço em Espanha sem esta análise |
| **Se uma mensagem de WhatsApp que menciona um imóvel é anúncio** | Determina se os modelos da Automação 03 têm de conter classe energética e AMI. **Urgente: os modelos ainda não foram submetidos à Meta e o texto aprovado é imutável.** Questão 1 de `nota-questoes-automacao-04.md` |
| **Isenções de certificação energética** | Sem elas um imóvel legitimamente dispensado nunca é publicável e a agência contorna o sistema; com uma caixa «isento» a obrigação perde efeito. Questão 2 de `nota-questoes-automacao-04.md` |
| Qualificação do pedido de consentimento como comunicação comercial | Determina se o segmento C é admissível em Portugal |
| Caducidade do consentimento | Irlanda impõe 12 meses. Determinar se convém reconfirmação periódica por defeito |
| Regimes fora da UE | Brasil (LGPD), Emirados, Reino Unido pós-Brexit — antes de qualquer cliente nesses mercados |

---

## Como usar

**Ao encontrar algo:** acrescentar linha com data, achado, origem, impacto e estado aberto.

**Ao rever o enquadramento:** fechar as linhas incorporadas, indicando a secção e a versão.

**Nunca:** alterar o `Enquadramento de Conformidade` sem incrementar a versão e registar aqui o que mudou.
