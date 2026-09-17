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
| `nota-handback-clausula-12.md` | — nota de trabalho, não é tipografada |

O `v2` no nome do enquadramento é a segunda versão do **enquadramento**, não um
segundo PDF: nunca existiu um `Ryvo_Enquadramento_Conformidade_v1.pdf`.

A fonte do contrato chamou-se `-v2.md` durante um dia por lapso de edição. O
documento diz de si próprio "Primeira versão" e constrói o PDF `v1`, que a Dra.
Margarida já tem em mãos. O nome do PDF é o que manda.

Construir:

    python3 ../typeset.py <fonte.md> <destino.pdf> <eyebrow> <subtitulo> <titulo-corrente>
