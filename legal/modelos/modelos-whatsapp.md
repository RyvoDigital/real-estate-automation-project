# Modelos de Mensagem WhatsApp

**Automação 02 — Reactivação de Base de Dados**
**Prontos para submissão à Meta**

> Documento operacional. Reúne os modelos a submeter para aprovação na WhatsApp Business Platform, a ordem de submissão, e o que fazer perante uma recusa.
>
> Versão 1 · 17 de Setembro de 2026 · **Nenhum modelo foi ainda submetido.**

---

# 1. Antes de submeter

## 1.1 Pré-requisitos

| | Estado |
|---|---|
| Conta Meta Business verificada | ⏳ Previsto para ~22 de Setembro |
| Número de WhatsApp associado à conta | ⏳ Depende do anterior |
| Nome do assistente definido para o cliente | Recolhido na Fase 6 do percurso |
| Denominação comercial do cliente | Idem |

**Os modelos são submetidos por conta**, o que significa que **cada agência tem os seus próprios modelos**. O nome da agência e o nome do assistente são texto literal e não variáveis — menos marcadores, menor risco de recusa, e um texto que se lê naturalmente.

## 1.2 Convenção de nomes

Minúsculas, palavras separadas por sublinhado, sem espaços nem acentos. Estrutura:

```
reactivacao_[segmento]_[toque]_[idioma]
```

Exemplos: `reactivacao_a_t1_pt` · `reactivacao_b_t3_es`

## 1.3 Categoria

Todos os modelos deste documento são submetidos como **MARKETING**.

> ⚠️ **Não submeter como UTILITY.** A Meta fiscaliza o uso indevido de categoria e a penalização recai sobre a conta do cliente. Uma mensagem de reactivação é comercial, ainda que redigida com cuidado.

## 1.4 Estrutura de cada modelo

| Componente | Uso aqui |
|---|---|
| **Cabeçalho** | Não utilizado. Reduz superfície de recusa |
| **Corpo** | O texto. Até 1024 caracteres. Usado sempre |
| **Rodapé** | A menção de oposição. Até 60 caracteres. **Obrigatório em todos** |
| **Botões** | Dois botões de resposta rápida. Ver 1.5 |

## 1.5 Botões de resposta rápida

Cada modelo leva dois botões:

**`Sim, tenho interesse`** e **`Não contactar mais`**

**Porquê botões e não apenas «responda SAIR».** A oposição passa a ser um toque em vez de uma mensagem escrita. Quem consegue sair facilmente bloqueia menos, e um bloqueio prejudica a classificação de qualidade muito mais do que uma oposição.

**Porquê «Não contactar mais» e não «Não, obrigado».** A segunda formulação é ambígua — recusa esta proposta ou recusa o contacto? A primeira não deixa dúvida, e é a oposição que tem de ser registada de forma inequívoca.

> O rodapé mantém-se mesmo com os botões, porque nem todos os clientes de WhatsApp os apresentam de forma igual e a redundância aqui é barata.

---

# 2. Variáveis

Apenas duas, em todos os modelos.

| Marcador | Conteúdo | Origem |
|---|---|---|
| `{{1}}` | Primeiro nome do titular | Campo `full_name`, primeiro elemento |
| `{{2}}` | Zona, imóvel ou referência | Declarado na importação |

**Nunca deixar uma variável vazia.** Um contacto sem primeiro nome registado não entra na campanha; recebe tratamento manual ou fica de fora.

**Exemplos de amostra a fornecer à Meta na submissão:** `{{1}}` = `Maria`, `{{2}}` = `Cascais`.

---

# 3. Segmento A — Cliente que concretizou transacção

> **Disponível:** Portugal.
> **Indisponível:** Espanha, Alemanha, Países Baixos. Nestas jurisdições o Segmento A é tratado como não contactável.
>
> Redigir apenas em português enquanto o segmento estiver limitado a Portugal.

## A · Toque 1 — `reactivacao_a_t1_pt`

**Corpo**

> Olá {{1}}, fala a Sofia da [Agência]. Já passou algum tempo desde que tratámos da sua casa em {{2}}, e o mercado nessa zona mudou bastante desde então.
>
> Se quiser, envio-lhe uma actualização do valor actual, sem qualquer compromisso.

**Rodapé** · `Para não receber mais mensagens, toque em Não contactar mais.`

**Botões** · `Sim, tenho interesse` · `Não contactar mais`

> **Porque funciona.** Refere a transacção concreta. Oferece algo em vez de perguntar. Não contém a pergunta «está a pensar comprar ou vender», que a investigação identifica como a abertura que mais afasta.

## A · Toque 2 — `reactivacao_a_t2_pt`

**Enviar ao dia 4 ou 5, apenas na ausência de resposta.**

**Corpo**

> Olá {{1}}, deixo-lhe uma nota concreta: os valores em {{2}} têm-se movido de forma assinalável nos últimos doze meses.
>
> Se quiser saber o que isso significa para a sua casa em particular, basta dizer.

**Rodapé** e **botões** iguais ao Toque 1.

> **Nota.** A formulação evita um número exacto. Um valor percentual concreto seria mais persuasivo e obrigaria a agência a poder sustentá-lo. Se a agência quiser indicar um número, deve fornecê-lo e responde pela sua exactidão.

## A · Toque 3 — `reactivacao_a_t3_pt`

**Enviar ao dia 9 ou 10, apenas na ausência de resposta. É o último.**

**Corpo**

> Olá {{1}}, não volto a insistir.
>
> Se um dia quiser saber o valor actual da sua casa em {{2}}, ou se pensar em mudar, sabe onde nos encontrar. Fico ao dispor.

**Rodapé** e **botões** iguais.

> **Porque encerra em vez de insistir.** Uma terceira mensagem que fecha o ciclo com honestidade supera consistentemente uma quarta tentativa, e protege a classificação do número.

---

# 4. Segmento B — Consentimento documentado

> **Disponível em todas as jurisdições da tabela.** É o único segmento contactável em Espanha, Alemanha e Países Baixos.
>
> Redigir em português, espanhol e inglês.

## B · Toque 1 — `reactivacao_b_t1_pt`

**Corpo**

> Olá {{1}}, fala a Sofia da [Agência]. Registou interesse em {{2}} e continuamos atentos a essa zona.
>
> Quer que lhe diga o que está disponível neste momento?

**Rodapé** · `Para não receber mais mensagens, toque em Não contactar mais.`

**Botões** · `Sim, tenho interesse` · `Não contactar mais`

## B · Toque 2 — `reactivacao_b_t2_pt`

> Olá {{1}}, entraram imóveis novos em {{2}} desde a última vez que falámos.
>
> Quer que lhe envie os que mais se aproximam do que procurava?

## B · Toque 3 — `reactivacao_b_t3_pt`

> Olá {{1}}, esta é a última mensagem que lhe envio sobre {{2}}.
>
> Se voltar a procurar, é só dizer. Fico ao dispor.

---

## B · Toque 1 — `reactivacao_b_t1_es`

> Hola {{1}}, le escribe Sofía de [Agencia]. Mostró interés en {{2}} y seguimos atentos a esa zona.
>
> ¿Quiere que le cuente qué hay disponible en este momento?

**Rodapé** · `Para dejar de recibir mensajes, pulse No contactar más.`

**Botões** · `Sí, me interesa` · `No contactar más`

## B · Toque 2 — `reactivacao_b_t2_es`

> Hola {{1}}, han entrado inmuebles nuevos en {{2}} desde la última vez que hablamos.
>
> ¿Quiere que le envíe los que más se acercan a lo que buscaba?

## B · Toque 3 — `reactivacao_b_t3_es`

> Hola {{1}}, este es el último mensaje que le envío sobre {{2}}.
>
> Si vuelve a buscar, solo tiene que decirlo. Quedo a su disposición.

---

## B · Toque 1 — `reactivacao_b_t1_en`

> Hello {{1}}, this is Sofia from [Agency]. You registered an interest in {{2}} and we still watch that area closely.
>
> Would you like me to tell you what is available at the moment?

**Rodapé** · `To stop receiving messages, tap Stop contacting me.`

**Botões** · `Yes, I'm interested` · `Stop contacting me`

## B · Toque 2 — `reactivacao_b_t2_en`

> Hello {{1}}, new properties have come onto the market in {{2}} since we last spoke.
>
> Would you like me to send the ones closest to what you were looking for?

## B · Toque 3 — `reactivacao_b_t3_en`

> Hello {{1}}, this is the last message I will send you about {{2}}.
>
> If you start looking again, just say. I am here.

---

# 5. Segmento C — SUSPENSO

> 🔴 **Nenhum modelo para o Segmento C deve ser redigido ou submetido enquanto a questão seguinte não for resolvida.**

O Segmento C — quem contactou a agência mas nunca concretizou transacção — foi inicialmente concebido para receber um **pedido de consentimento** em vez de uma mensagem comercial.

**A dúvida.** A regra da Meta é que uma empresa só pode enviar mensagem por sua iniciativa a quem tenha dado o número **e** tenha dado consentimento. O Segmento C define-se precisamente pela ausência desse consentimento. Um pedido de consentimento é, ele próprio, uma mensagem por iniciativa da empresa, que exige modelo aprovado.

**Se esta leitura estiver correcta, o Segmento C falha a regra da Meta em todas as jurisdições**, e não apenas em Espanha por força da LSSI — o que significaria que **o consentimento não pode ser obtido através do WhatsApp**, tendo de vir de correio electrónico, formulário ou contacto presencial.

**Consequência prática.** O Segmento C passaria a ter o mesmo tratamento do Segmento D, e a fracção contactável da lista reduzir-se-ia novamente.

> **Esta é a questão mais relevante ainda em aberto na Automação 02.** Segue para revisão jurídica juntamente com a tabela de jurisdições, e merece igualmente verificação junto da documentação da Meta quanto a modelos de pedido de consentimento.

---

# 6. Ordem de submissão

Não submeter tudo de uma vez.

**Primeiro:** `reactivacao_b_t1_pt` isoladamente.

**Porquê.** É o modelo mais simples e o de menor risco. Se for recusado, a causa está na estrutura — variáveis, rodapé, botões — e não no conteúdo, e corrige-se uma vez em vez de seis.

**Depois da aprovação:** os restantes dois toques do Segmento B em português.

**Em seguida:** espanhol e inglês.

**Por último:** os três do Segmento A.

**Prazo esperado:** de alguns minutos a 24 horas por modelo.

---

# 7. Perante uma recusa

A Meta indica a categoria da recusa mas raramente a linha exacta. Causas habituais:

| Causa | Correcção |
|---|---|
| Linguagem vaga ou genérica | Tornar concreto. «Temos novidades» é recusado; «entraram imóveis novos em Cascais» não |
| Excesso de marcadores | Estes modelos usam dois. Não acrescentar |
| Marcador no início ou no fim do corpo | Já evitado em todos |
| Tom promocional excessivo | Sem preços, sem «oportunidade», sem urgência artificial |
| Rodapé em falta | Obrigatório em todos |
| Categoria incorrecta | Submeter como MARKETING, nunca como UTILITY |

**Regra ao corrigir:** alterar **uma** coisa e voltar a submeter. Alterar várias impede saber o que estava errado.

**Registar cada recusa** no `Registo de Achados`, com o texto submetido e o motivo indicado. Ao quinto cliente, esse registo poupa dias.

---

# 8. Lista de verificação antes de submeter

- [ ] Conta Meta Business verificada
- [ ] Nome do assistente e denominação da agência inseridos como texto literal
- [ ] Nome do modelo em minúsculas, com sublinhados, sem acentos
- [ ] Categoria MARKETING
- [ ] Rodapé de oposição presente
- [ ] Dois botões de resposta rápida
- [ ] Exactamente duas variáveis, nenhuma no início ou fim do corpo
- [ ] Valores de amostra fornecidos
- [ ] Idioma correctamente declarado
- [ ] Nenhum modelo do Segmento C incluído

---

# 9. Depois da aprovação

**Registar o identificador de cada modelo aprovado** na configuração do cliente. É esse identificador que o motor de sequências utiliza, não o texto.

**O texto aprovado é imutável.** Qualquer alteração exige nova submissão e nova aprovação. Conservar o texto exacto de cada versão aprovada — a Cláusula 12.ª do Anexo II obriga a poder demonstrar o que foi comunicado e quando.

**Primeiro envio a 10–20% da lista**, com verificação da classificação de qualidade antes de ampliar.

---

**Versão 1 · 17 de Setembro de 2026**

*Rever quando a Meta alterar as regras de modelos, quando a questão do Segmento C for resolvida, ou quando uma recusa revelar um critério não previsto neste documento.*
