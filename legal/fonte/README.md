# fonte/ — o que constrói o quê

Cada `.md` aqui é a fonte de um PDF noutra pasta. O nome do ficheiro e o nome do
PDF podem divergir: o PDF é o que já saiu para o mundo e o seu nome está fixo.

| Fonte | PDF construído |
|---|---|
| `contrato-prestacao-servicos-v1.md` | `../contratos/Ryvo_Contrato_Prestacao_Servicos_v1.pdf` |
| `anexo-ii-acordo-tratamento-dados-v1.md` | `../contratos/Ryvo_Anexo_II_Acordo_Tratamento_Dados_v1.pdf` |
| `nota-para-revisao-juridica.md` | `../contratos/Ryvo_Nota_para_Revisao_Juridica.pdf` |
| `enquadramento-conformidade.md` | `../conformidade/Ryvo_Enquadramento_Conformidade_v2.pdf` |
| `registo-de-achados.md` | `../conformidade/Ryvo_Registo_de_Achados.pdf` |
| `percurso-do-cliente.md` | `../operacoes/Ryvo_Percurso_do_Cliente_v1.pdf` |
| `nota-questoes-automacao-02.md` | `../contratos/Ryvo_Quatro_Questoes.pdf` |
| `nota-handback-clausula-12.md` | — nota de trabalho, não é tipografada |

**As quatro questões estão em `../contratos/`** e não em `../conformidade/`,
ainda que o assunto seja conformidade. O critério da pasta é o destinatário e
não o tema: `contratos/` é o que vai para a advogada, e este documento foi para
a advogada. A `Nota de acompanhamento` das minutas está ao lado, pela mesma
razão.

Os **modelos de mensagem** não estão aqui. Vivem em `../modelos/`, fonte e PDF
juntos, por serem peças submetidas a uma plataforma para aprovação e por se
multiplicarem por cliente e por idioma — uma família que se mantém inteira vale
mais do que a separação fonte/saída que o resto desta pasta segue.

O `v2` no nome do enquadramento é a segunda versão do **enquadramento**, não um
segundo PDF: nunca existiu um `Ryvo_Enquadramento_Conformidade_v1.pdf`.

A fonte do contrato chamou-se `-v2.md` durante um dia por lapso de edição. O
documento diz de si próprio "Primeira versão" e constrói o PDF `v1`, que a Dra.
Margarida já tem em mãos. O nome do PDF é o que manda.

## Construir

`typeset.py <fonte.md> <destino.pdf> <eyebrow> <subtítulo> <título-corrente>`.

Os argumentos abaixo são os que produziram os PDF actualmente em circulação.
Só existiam no historial de conversa de quem os correu; ficam aqui porque um
PDF reconstruído com um eyebrow diferente deixa de ser o mesmo documento.

Correr a partir da **raiz do repositório** (os caminhos mudaram com a
arrumação de 17 de Setembro; os comandos originais corriam com tudo à solta
dentro de `legal/`):

    python3 legal/typeset.py legal/fonte/contrato-prestacao-servicos-v1.md \
      legal/contratos/Ryvo_Contrato_Prestacao_Servicos_v1.pdf \
      "Contrato" "Automação para Mediação Imobiliária" \
      "Contrato de Prestação de Serviços"

    python3 legal/typeset.py legal/fonte/anexo-ii-acordo-tratamento-dados-v1.md \
      legal/contratos/Ryvo_Anexo_II_Acordo_Tratamento_Dados_v1.pdf \
      "Anexo II ao Contrato" "Automação para Mediação Imobiliária" \
      "Anexo II — Acordo de Tratamento de Dados"

    python3 legal/typeset.py legal/fonte/nota-para-revisao-juridica.md \
      legal/contratos/Ryvo_Nota_para_Revisao_Juridica.pdf \
      "Nota de acompanhamento" "Automação para Mediação Imobiliária" \
      "Nota para revisão jurídica"

    python3 legal/typeset.py legal/fonte/enquadramento-conformidade.md \
      legal/conformidade/Ryvo_Enquadramento_Conformidade_v2.pdf \
      "Conformidade" "Automação para Mediação Imobiliária" \
      "Enquadramento de Conformidade v2"

    python3 legal/typeset.py legal/fonte/registo-de-achados.md \
      legal/conformidade/Ryvo_Registo_de_Achados.pdf \
      "Registo de trabalho" "Automação para Mediação Imobiliária" \
      "Registo de achados de conformidade"

    python3 legal/typeset.py legal/fonte/percurso-do-cliente.md \
      legal/operacoes/Ryvo_Percurso_do_Cliente_v1.pdf \
      "Documento operacional" "Automação para Mediação Imobiliária" \
      "Percurso do Cliente"

    python3 legal/typeset.py legal/fonte/nota-questoes-automacao-02.md \
      legal/contratos/Ryvo_Quatro_Questoes.pdf \
      "Nota" "Automação para Mediação Imobiliária" \
      "Quatro questões — Automação 02"

    python3 legal/typeset.py legal/modelos/modelos-whatsapp.md \
      legal/modelos/Ryvo_Modelos_WhatsApp_v1.pdf \
      "Documento operacional" "Automação para Mediação Imobiliária" \
      "Modelos de Mensagem WhatsApp"

O mesmo tipógrafo constrói um documento que **não** vive em `legal/` — a
especificação da Automação 02, cuja fonte e PDF estão ambos em `docs/`:

    python3 legal/typeset.py docs/automation-02-specification.md \
      docs/Ryvo_Automacao_02_Especificacao_v1.pdf \
      "Especificação técnica" "Automação para Mediação Imobiliária" \
      "Automação 02 — Especificação"

O subtítulo é o mesmo em todos: "Automação para Mediação Imobiliária".

**Dependências:** `weasyprint` e `markdown`. Os tipos de letra são Lora (texto)
e Poppins (só as etiquetas).
