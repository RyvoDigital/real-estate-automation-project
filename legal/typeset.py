#!/usr/bin/env python3
"""Ryvo Digital — legal document typesetter.

Markdown in, typeset A4 PDF out. WeasyPrint for layout so we get real
@page rules: running footers, page counters, orphan/widow control.

Type: Lora throughout for text, Poppins for the tracked labels only.
Deliberately no Fraunces, Playfair, Inter or DM Sans.
"""
import re, sys, html
from pathlib import Path
import markdown
from weasyprint import HTML, CSS

BRAND = {
    "ink":     "#191714",
    "ink_2":   "#443E38",
    "muted":   "#7A736B",
    "faint":   "#A9A199",
    "accent":  "#8C2B2B",   # oxblood
    "accent_2":"#B8564E",
    "rule":    "#DAD3C9",
    "rule_2":  "#EDE8E0",
    "wash":    "#FAF8F4",
    "note_bg": "#FBF6F3",
}

CSS_TEMPLATE = """
@page {{
  size: A4;
  margin: 24mm 22mm 20mm 22mm;
  @bottom-left {{
    content: "{doc_title}";
    font-family: "Poppins", sans-serif;
    font-size: 6.6pt; letter-spacing: .1em; text-transform: uppercase;
    color: {faint}; padding-bottom: 3mm;
  }}
  @bottom-right {{
    content: counter(page) " / " counter(pages);
    font-family: "Poppins", sans-serif;
    font-size: 6.6pt; letter-spacing: .08em;
    color: {faint}; padding-bottom: 3mm;
  }}
}}
@page :first {{
  margin-top: 20mm;
  @bottom-left {{ content: ""; }}
  @bottom-right {{ content: ""; }}
}}

* {{ box-sizing: border-box; }}

body {{
  font-family: "Lora", Georgia, serif;
  font-size: 9.6pt;
  line-height: 1.62;
  color: {ink};
  hyphens: auto;
  text-align: justify;
  orphans: 3; widows: 3;
}}

/* ---------- letterhead ---------- */
.letterhead {{
  display: block;
  border-bottom: 0.7pt solid {ink};
  padding-bottom: 5mm;
  margin-bottom: 13mm;
}}
.mark {{
  font-family: "Lora", serif;
  font-size: 19pt; font-weight: 600;
  letter-spacing: -.012em;
  color: {ink};
  line-height: 1;
}}
.mark .dot {{ color: {accent}; }}
.mark-sub {{
  font-family: "Poppins", sans-serif;
  font-size: 6.4pt; letter-spacing: .22em; text-transform: uppercase;
  color: {muted}; margin-top: 2.6mm;
}}
.entity {{
  font-family: "Poppins", sans-serif;
  font-size: 6.4pt; line-height: 1.75; color: {faint};
  letter-spacing: .03em; margin-top: 4mm;
}}

/* ---------- title block ---------- */
.eyebrow {{
  font-family: "Poppins", sans-serif;
  font-size: 6.8pt; letter-spacing: .26em; text-transform: uppercase;
  color: {accent}; margin-bottom: 4mm; text-align: left;
}}
h1 {{
  font-size: 20.5pt; font-weight: 600; line-height: 1.14;
  letter-spacing: -.016em; margin: 0 0 4mm 0;
  color: {ink}; text-align: left;
  string-set: doctitle content();
}}
h1 + p em, .lede {{
  font-size: 10.4pt; color: {ink_2}; font-style: italic;
  text-align: left; margin-bottom: 9mm;
}}

/* ---------- headings ---------- */
h1.clause {{
  font-size: 11.6pt; font-weight: 600; letter-spacing: .005em;
  margin: 9mm 0 3.4mm 0; padding-top: 3.4mm;
  border-top: 0.6pt solid {rule};
  color: {ink}; text-align: left;
  break-after: avoid; break-inside: avoid;
}}
h2 {{
  font-size: 10.6pt; font-weight: 600; letter-spacing: .004em;
  margin: 7.5mm 0 2.8mm 0; color: {ink}; text-align: left;
  break-after: avoid;
}}
h3 {{
  font-family: "Poppins", sans-serif;
  font-size: 7.2pt; font-weight: 600;
  letter-spacing: .16em; text-transform: uppercase;
  color: {accent}; margin: 6mm 0 2.4mm 0; text-align: left;
  break-after: avoid;
}}

p {{ margin: 0 0 2.7mm 0; }}
strong {{ font-weight: 600; }}
em {{ font-style: italic; }}

/* clause number at the head of a paragraph */
.cn {{ font-weight: 600; color: {accent}; }}

/* critical marker */
.crit {{
  color: {accent}; font-weight: 600;
}}
.crit-dot::before {{
  content: "";
  display: inline-block;
  width: 4.2pt; height: 4.2pt;
  border-radius: 50%;
  background: {accent};
  margin-right: 5pt;
  vertical-align: 1.2pt;
}}

ul, ol {{ margin: 0 0 3mm 0; padding-left: 5.2mm; }}
li {{ margin-bottom: 1.3mm; padding-left: 1mm; }}
li::marker {{ color: {faint}; }}

/* ---------- review notes ---------- */
.note {{
  background: {note_bg};
  border-left: 1.6pt solid {accent};
  padding: 4mm 5mm 3.2mm 5mm;
  margin: 4.5mm 0 5mm 0;
  font-size: 8.5pt; line-height: 1.56;
  color: {ink_2}; text-align: left;
  break-inside: avoid;
}}
.note::before {{
  content: "Nota para revisão";
  display: block;
  font-family: "Poppins", sans-serif;
  font-size: 6.2pt; font-weight: 600;
  letter-spacing: .2em; text-transform: uppercase;
  color: {accent}; margin-bottom: 2.2mm;
}}
.note p {{ margin-bottom: 2mm; }}
.note p:last-child {{ margin-bottom: 0; }}
.note strong {{ color: {ink}; }}

/* ---------- tables ---------- */
table {{
  width: 100%; border-collapse: collapse;
  margin: 3.5mm 0 5mm 0; font-size: 8.4pt;
  break-inside: avoid;
}}
thead th {{
  font-family: "Poppins", sans-serif;
  font-size: 6.4pt; font-weight: 600;
  letter-spacing: .14em; text-transform: uppercase;
  color: {muted}; text-align: left;
  padding: 0 3mm 2mm 0;
  border-bottom: 0.7pt solid {ink};
}}
tbody td {{
  padding: 2.1mm 3mm 2.1mm 0;
  border-bottom: 0.4pt solid {rule_2};
  vertical-align: top; text-align: left;
  line-height: 1.5;
}}
tbody tr:last-child td {{ border-bottom: none; }}
td:first-child {{ color: {ink}; }}
table strong {{ color: {ink}; }}

/* ---------- rules & signature ---------- */
hr {{
  border: none; border-top: 0.6pt solid {rule};
  margin: 8mm 0;
}}
.sig {{
  margin-top: 12mm; break-inside: avoid;
  width: 100%; border-collapse: collapse;
}}
.sig td {{
  width: 50%; padding-top: 16mm; border: none;
  border-top: 0.6pt solid {ink};
  font-family: "Poppins", sans-serif;
  font-size: 6.6pt; letter-spacing: .16em; text-transform: uppercase;
  color: {muted}; vertical-align: top;
}}
.sig td:first-child {{ padding-right: 12mm; }}
.sig-lead {{
  font-family: "Lora", serif; font-size: 8.6pt;
  color: {ink_2}; font-style: italic;
  margin-top: 10mm; text-align: left;
}}

.pagebreak {{ break-before: page; }}

/* working-notes section, visually set apart */
.worknotes {{
  break-before: page;
}}
.worknotes h1.clause {{
  border-top: 1.4pt solid {accent};
  color: {accent};
}}
"""

FONT_CSS = """
@font-face {
  font-family: "Lora";
  src: url("file:///usr/share/fonts/truetype/google-fonts/Lora-Variable.ttf");
  font-weight: 400 700; font-style: normal;
}
@font-face {
  font-family: "Lora";
  src: url("file:///usr/share/fonts/truetype/google-fonts/Lora-Italic-Variable.ttf");
  font-weight: 400 700; font-style: italic;
}
"""


def letterhead(subtitle):
    return f"""
<div class="letterhead">
  <div class="mark">Ryvo Digital<span class="dot">.</span></div>
  <div class="mark-sub">{subtitle}</div>
  <div class="entity">
    Pedro Seixas Vale — Consultoria, Lda · NIPC 513 853 847<br>
    Rua Tomás da Fonseca, n.º 26, Edifício 3, 5.º Esq. · 1600-256 Lisboa · Portugal
  </div>
</div>
"""


def preprocess(md_text):
    """Turn our markdown conventions into classed HTML hooks."""
    out = []
    in_note = False
    note_buf = []

    lines = md_text.split("\n")
    for line in lines:
        # review-note blockquotes
        if line.startswith("> "):
            content = line[2:]
            if not in_note:
                in_note = True
                note_buf = []
            # strip the scales emoji and the bolded "Nota" prefix — the box says it
            content = content.replace("⚖️", "").strip()
            content = re.sub(r"^\*\*Nota[^*]*\*\*\s*[—.-]?\s*", "", content)
            note_buf.append(content)
            continue
        if line.strip() == ">" and in_note:
            note_buf.append("")
            continue
        if in_note:
            out.append("")
            out.append("@@NOTE_START@@")
            out.append("")
            out.extend(note_buf)
            out.append("")
            out.append("@@NOTE_END@@")
            out.append("")
            in_note = False
            note_buf = []
        out.append(line)

    if in_note:
        out.append("")
        out.append("@@NOTE_START@@")
        out.append("")
        out.extend(note_buf)
        out.append("")
        out.append("@@NOTE_END@@")
        out.append("")

    text = "\n".join(out)

    # drop the working-notes divider, mark the section instead
    text = text.replace("---\n---\n", "@@WORKNOTES@@\n")
    return text


def postprocess(html_text):
    # note boxes
    html_text = re.sub(
        r"<p>@@NOTE_START@@</p>(.*?)<p>@@NOTE_END@@</p>",
        r'<div class="note">\1</div>',
        html_text, flags=re.S)
    html_text = html_text.replace("<p>@@NOTE_START@@</p>", '<div class="note">')
    html_text = html_text.replace("<p>@@NOTE_END@@</p>", "</div>")

    html_text = html_text.replace("<p>@@WORKNOTES@@</p>", '<div class="worknotes">')

    # clause headings (h1 in source) get the rule treatment
    html_text = re.sub(r"<h1>(CLÁUSULA[^<]*|ANEXO[^<]*|NOTAS DE TRABALHO[^<]*)</h1>",
                       r'<h1 class="clause">\1</h1>', html_text)
    html_text = re.sub(r"<h1>([^<]*)</h1>", r'<h1 class="clause">\1</h1>', html_text)

    # critical markers
    html_text = html_text.replace("🔴 ", '<span class="crit-dot"></span>')
    html_text = html_text.replace("🔴", '<span class="crit-dot"></span>')
    html_text = html_text.replace("🟡 ", "").replace("🟡", "")
    html_text = html_text.replace("⚖️ ", "").replace("⚖️", "")
    html_text = html_text.replace("🇩🇪", "(DE)").replace("🇺🇸", "(US)").replace("🇮🇪", "(IE)")

    # clause numbers like **1.1** at the start of a paragraph
    html_text = re.sub(r"<p><strong>(\d+\.\d+)\s+([^<]{0,60}?)</strong>",
                       r'<p><span class="cn">\1</span> <strong>\2</strong>', html_text)
    html_text = re.sub(r"<p><strong>(\d+\.\d+)</strong>",
                       r'<p><span class="cn">\1</span>', html_text)

    # signature block
    html_text = re.sub(
        r"<p><strong>(O Prestador|O Subcontratante)</strong>[^<]*<strong>(O Cliente|O Responsável)</strong></p>",
        r'<table class="sig"><tr><td>\1</td><td>\2</td></tr></table>',
        html_text, flags=re.S)
    html_text = re.sub(r"<p>Feito em duplicado[^<]*</p>",
        lambda m: '<p class="sig-lead">' + m.group(0)[3:-4] + '</p>', html_text)
    html_text = re.sub(r"<p>_{5,}[^<]*</p>", "", html_text)
    html_text = html_text.replace("<br>\n<br><br>", "")
    html_text = re.sub(r"<p><br\s*/?>\s*</p>", "", html_text)

    return html_text


def build(md_path, out_path, eyebrow, subtitle, running_title):
    raw = Path(md_path).read_text()

    # pull the H1 title out
    m = re.search(r"^# (.+)$", raw, flags=re.M)
    title = m.group(1) if m else ""
    raw = re.sub(r"^# .+$", "", raw, count=1, flags=re.M)

    # a leading **bold** line right after the title is the subtitle
    lede = ""
    stripped = raw.lstrip("\n")
    first_line = stripped.split("\n", 1)[0] if stripped else ""
    lm = re.fullmatch(r"\*\*(.+?)\*\*\s*", first_line)
    if lm and ":" not in first_line:
        lede = lm.group(1)
        raw = stripped.split("\n", 1)[1] if "\n" in stripped else ""

    body_md = preprocess(raw)
    body_html = markdown.markdown(
        body_md, extensions=["tables", "sane_lists", "attr_list", "smarty"])
    body_html = postprocess(body_html)

    doc = f"""<!doctype html><html lang="pt"><head><meta charset="utf-8"></head><body>
{letterhead(subtitle)}
<div class="eyebrow">{eyebrow}</div>
<h1>{title}</h1>
{('<div class="lede">' + lede + '</div>') if lede else ''}
{body_html}
</body></html>"""

    css = CSS_TEMPLATE.format(doc_title=running_title, **BRAND)
    HTML(string=doc, base_url=".").write_pdf(
        out_path,
        stylesheets=[CSS(string=FONT_CSS), CSS(string=css)])
    print(f"built {out_path}")


if __name__ == "__main__":
    build(*sys.argv[1:])
