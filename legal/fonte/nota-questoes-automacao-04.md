# Duas questões

**Publicidade de imóveis — Automações 03 e 04**

| | |
|---|---|
| **Para** | Dra. Margarida de Sousa Pereira |
| **Através de** | José Vale |
| **De** | Manuel Vale — Ryvo Digital / Pedro Seixas Vale — Consultoria, Lda |
| **Data** | 18 de Setembro de 2026 |

---

**Estas duas questões são independentes das quatro anteriores** e podem ser respondidas separadamente. Tal como as outras, não dizem respeito à redacção de um contrato: dizem respeito ao que pode ou não ser construído — e, no caso da primeira, ao que deve ou não ser submetido à Meta para aprovação.

**A primeira é urgente por uma razão prática e não jurídica:** os modelos de mensagem ainda não foram submetidos à Meta. Um modelo aprovado é texto imutável — alterá-lo obriga a nova submissão e nova aprovação. Corrigir agora custa uma tarde; corrigir depois custa o tempo de aprovação e, se já houver mensagens enviadas ao abrigo do modelo antigo, custa mais do que isso.

Agradeço desde já, com a mesma consciência de que faz isto por favor.

---

# 1. 🔴 Uma mensagem de WhatsApp que menciona um imóvel é um anúncio?

## O que a lei exige

Desde 2013, qualquer anúncio de venda ou arrendamento deve indicar a **classificação energética** do imóvel, com coimas entre 250 e 3.741 euros. E o **número de licença AMI**, ao abrigo da Lei n.º 15/2013, deve constar de toda a publicidade e documentação da empresa de mediação.

Isto está incorporado no enquadramento em §8.A e foi desenhado para a Automação 04, que publica anúncios.

## A dúvida

A Automação 03 faz outra coisa: quando entra um imóvel novo, identifica na base de dados da agência as pessoas que, em conversa anterior, disseram procurar exactamente aquilo, e — havendo fundamento de licitude — envia-lhes uma mensagem por WhatsApp.

**Essa mensagem é dirigida a uma pessoa concreta que manifestou interesse, não ao público.** Mas menciona um imóvel e tem finalidade comercial.

**A pergunta é se essa mensagem constitui, para efeitos das obrigações de informação em anúncios imobiliários, publicidade a um imóvel** — e se, por isso, tem de conter a classe energética e o número AMI.

## Porque a resposta é accionável de duas maneiras muito diferentes

Um modelo de WhatsApp aprovado pela Meta tem **limites rígidos que não podemos negociar**: o corpo não excede 1024 caracteres, leva obrigatoriamente um rodapé de oposição, e a Meta recusa modelos com demasiadas variáveis em relação ao texto fixo. O conteúdo variável não pode conter quebras de linha.

- **Se a resposta for «não é anúncio»**, os modelos ficam como estão.
- **Se a resposta for «é anúncio»**, a classe energética e o número AMI têm de caber ali dentro. Pode ser possível; pode não ser. **E se não for, a conclusão é que os nossos modelos nunca podem identificar um imóvel em concreto** — passando a ser um convite a uma conversa, e não um anúncio. Essa é uma restrição de desenho que prefiro conhecer antes de submeter seja o que for.

## O que está redigido neste momento

O modelo actual diz, em substância:

> *Olá [nome], fala a [pessoa] da [agência]. Entrou um imóvel em [zona] que corresponde ao que procurava, [uma característica]. Se quiser, envio-lhe os detalhes.*

**Não indica preço, não indica referência, não indica morada.** Isso não foi uma precaução jurídica — resultou dos limites da Meta — mas parece-me que o pode colocar do lado do convite e não do anúncio. **Agradeço que me diga se essa leitura é sustentável**, porque nesse caso passa a ser uma regra deliberada de desenho e não uma coincidência.

---

# 2. A classe energética e as isenções

O enquadramento trata a ausência de classe energética como impeditiva: sem ela, a automação recusa publicar. Um certificado caducado é tratado como ausente.

**A dúvida é sobre as excepções.** Tenho presente que nem todo o edificado está sujeito a certificação. Não consigo, porém, determinar com segurança quais são os casos nem a quem cabe qualificá-los.

Duas perguntas, portanto:

1. **Existem imóveis legitimamente dispensados** de indicar classe energética em anúncio? Se sim, em que termos?
2. Existindo, **a quem cabe declarar essa dispensa** — ao proprietário, ao mediador, ou depende?

## Porque pergunto em vez de decidir

Se ignorarmos as isenções, um imóvel legitimamente dispensado nunca poderá ser publicado através de nós, e a agência contornará o sistema — o que é pior do que não o ter.

Se criarmos uma simples caixa «isento», ela transforma-se na saída por onde tudo passa, e a obrigação deixa de ter qualquer efeito prático.

**A solução que me parece correcta, e que submeto à sua apreciação:** a dispensa não é um campo, é uma **declaração** — feita por uma pessoa identificada da agência, com o fundamento em texto livre, registada com data e nome, exactamente como a classificação de contactos na Automação 02. O sistema não qualifica a isenção; regista quem a invocou e com que fundamento, e essa é a peça que responde a uma fiscalização do IMPIC.

Agradeço confirmação de que esta é a abordagem adequada, ou indicação de outra.

---

# Nota final

Nenhuma destas questões impede o trabalho de continuar: a Automação 04 pode ser construída inteiramente à volta da recusa, e a recusa não depende da resposta. **O que depende é o texto dos modelos da Automação 03, que ainda não foram submetidos** — e é por isso que a primeira questão vem primeiro.
