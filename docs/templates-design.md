# The approved-templates table

**Design · 18 September 2026 · nothing in this document has been built**

> Four questions were put with it, and the third changes a table that is already
> applied. The fourth — that nothing here may become a route to sending — turned
> out to be a constraint about *columns* rather than about functions, which is
> §4 below and the part I would most want read.

---

# 1. Three purposes, one table, and where the seam actually is

The table serves three things that could pull apart:

| | |
|---|---|
| **Meta's approval id** | so a campaign can send at all — §9 of the templates document: *"É esse identificador que o motor de sequências utiliza, não o texto"* |
| **The vocabulary** | so the orphan sweep can tell a campaign message from a Concierge reply |
| **The record** | *"O texto aprovado é imutável… conservar o texto exacto de cada versão aprovada"* — Clause 12 of the DPA requires being able to demonstrate what was communicated and when |

They do not pull apart, because **all three are properties of the same object**:
one specific approved text, with one approval id, for one client. Splitting the
vocabulary into its own table would put the text in two places, and the stale
copy would keep answering confidently (lesson 15) — on a question about what we
sent somebody.

**The real seam is not between the three purposes. It is between the text and
the status**, and it is the seam `sends` already has:

> The **text is frozen** — it is the record, and a record that can be edited is
> not one. The **status is not** — Meta can pause, disable or re-approve a
> template days after approving it, on its own initiative and without asking.

So: one table, the `sends` pattern reused. A freeze trigger with an **allowlist**
of mutable columns — status, when it changed, the quality rating Meta reports —
and everything else, including columns not yet invented, frozen by default. That
allowlist shape is deliberate: `0015`'s denylist version failed open for every
column added afterwards (`0017`).

## 1.1 What is deliberately NOT built: a status history

Meta pausing a template at 14:00 and reinstating it at 16:00 leaves no trace
beyond the current value and its timestamp. That is a real loss and it is
accepted for now, because **nothing reads it**: the send record already snapshots
what authorised each send (§11b), so "what was the status when we sent" is
answered by the send row rather than by the template's past.

It earns its own table the day a Meta dispute or a regulator asks about a window
rather than an instant. Written down so that day is a decision and not a
discovery.

## 1.2 And the drafts in `legal/modelos/` are not this table

They are the source text a human writes and submits. This table holds only what
Meta **approved**, keyed by the id Meta issued. A draft that was never submitted
has no row here, and a row here never comes from a file.

---

# 2. Variables, and why the sweep needs a different matcher from reconciliation

An approved template is a shape:

```
Olá {{1}}, fala a {{2}} da {{3}}. Já passou algum tempo desde que tratámos
da sua casa em {{4}}.
```

What goes on the wire is that shape filled in. So the two matchers ask genuinely
different questions:

| | question | matcher |
|---|---|---|
| **Reconciliation** | *is this the message I intended to send?* | **exact body** — it knows the rendered text character for character, because it wrote `body_intended` before sending |
| **Orphan sweep** | *is this one of ours at all?* | **shape** — it has no idea what variables were used, because there is no send row |

Conflating them would weaken the exact one, which is the one standing between a
Concierge reply and a false record.

## 2.1 How the shape match works

Each approved body compiles once into a regex: split on `{{n}}`, escape the
literal segments, join with a bounded wildcard that cannot cross a newline.
Anchored at both ends. Compiled per client, from that client's own templates
only, which is the first thing keeping false positives down.

## 2.2 What it cannot catch, and one refusal that follows

**A template too variable to recognise.** A body that is mostly `{{n}}` compiles
to a regex that matches almost anything. The answer is not to accept a weak
pattern quietly:

> **A template whose literal segments total fewer than ~24 characters is
> refused at compile time**, and the sweep reports that it cannot vouch for that
> template rather than pretending to. A vocabulary entry that matches everything
> is worse than a missing one, because it converts the sweep's output from
> "clean" to "meaningless" without changing how it reads.

**A novel template sent outside the gate** — one never approved, or approved and
never recorded here. Nothing sees it. This is the gap already named in
`reconcile.ts`, narrowed but not closed: the table shrinks it from "any template"
to "any template we never recorded".

**Unicode and formatting drift.** WhatsApp may render or normalise; the literal
segments should survive, and if they do not the sweep under-reports. Mitigated by
comparing on the normalised form both sides, and stated because it is a
plausible source of a quiet miss.

**A false positive worth having.** If an agent copies the template text and sends
it by hand from the shared number, the sweep flags it. That is correct: a
campaign message went out with no send row, which is exactly the fact the sweep
exists to surface — whoever typed it is not the point.

---

# 3. Versioning — and `sends` already carries it, but does not require it

**Meta approves text, not a name.** An edited template is a new submission, a new
approval and a new id, and the old id may still have messages in flight under it.
So a template is never a row that changes: it is **a row per approved version**.

Identity: `(client_id, name, language, version)` unique, and `approval_id`
unique on its own. `version` is ours and monotonic per name+language; the
approval id is Meta's and is the one a send names.

## 3.1 What `sends` has, and the two things it is missing

`0015` already carries `template_name`, `template_language` and
`template_approval_id`. **The approval id is version-specific, so the column
already identifies the version rather than the template** — the answer to the
question as put. Two gaps remain:

1. **It is not a foreign key.** A send can name an approval id that does not
   exist. Adding the FK makes a send structurally unable to claim an approval
   that was never recorded — and it is a legitimate join target under §11b,
   because the row it points at has frozen text.
2. **It is not required.** A row can be `sent` with no template at all. Outside
   the 24-hour window WhatsApp permits nothing but templates, so a
   business-initiated send with no approval id is not a thing that can lawfully
   exist. `0020` adds:

```sql
constraint sent_names_its_template check (
  status <> 'sent' or template_approval_id is not null)
```

Both are additive to an applied table, and `sends` is empty, so neither can
strand an existing row.

---

# 4. Per-client, and the danger is a column rather than a function

Templates are submitted per WhatsApp Business Account. **Every row is
client-scoped and there is no such thing as a shared template row**, even where
two agencies use identical text: the approval belongs to the account, and a
shared row would let one client's campaign send under another's approval — which
Meta rejects, and which would put one agency's identifier in another's send
record.

## 4.1 Nothing here may become a route to sending

The obvious reading is "no function in this module calls dispatch", and that is
necessary — the module imports neither `dispatch`, `permit` nor the adapter, and
a test reads its own source to prove it, the shape `reconcile.ts` already uses.

But **the real danger is a column, not a call.** The moment this table grows a
field naming an audience — `send_to_segment`, `default_recipients`, `schedule`,
`auto_send_on_approval` — it stops being a record of what was approved and
becomes a campaign definition, and something will eventually read it and act.

> **This table answers "what may be said". It must never answer "to whom".** The
> gate decides who may receive a message; a template that knows its own audience
> has already made half that decision somewhere the gate cannot see.

So the schema carries no recipient, no segment, no audience, no schedule and no
enabled-for-campaign flag, and the header says why — because the field that
breaks this will be added by somebody solving a reasonable local problem, which
is how §12 goes every time.

Rendering follows the same rule: `render(template, variables)` returns **a
string**. Not a permit, not a plan, not something `dispatch` accepts. A caller
holding a rendered body still has nothing a send requires, because
`SendPermit.record` takes a gate verdict and the gate does not take a body.

---

# 5. The shape

```
message_templates
  id, client_id, name, language, version
  body                     FROZEN — the exact approved text, with {{n}}
  category                 marketing | utility | authentication
  approval_id              Meta's id, unique. What a send names
  submitted_at, approved_at
  status                   MUTABLE: approved | paused | disabled | rejected
  status_changed_at, status_note, quality_rating
  source_document          e.g. legal/modelos/modelos-whatsapp.md §3.2
  created_at, updated_at

  unique (client_id, name, language, version)
  unique (approval_id)
  check: a row that is `approved` has approval_id and approved_at
  check: body contains no {{0}} and variables are contiguous from 1
```

The last check is small and earns itself: Meta rejects non-contiguous variable
numbering, and finding that out at submission costs a day of round trip.

---

# 6. Order of work

1. `0020` — the table, the freeze trigger, and the two additions to `sends`.
2. The compiler and the shape matcher, pure, tested with the real Portuguese
   template bodies from `legal/modelos/` including the too-variable refusal.
3. `sweepOrphans` switched from `templateMatcherFromSends` to the real
   vocabulary, and the interim matcher deleted rather than left beside it.
4. Only then is the sweep's clean result meaningful, which is what unblocks the
   scheduling decision held last night.

Nothing in 1–3 can send: the table has no audience, the renderer returns a
string, and the module has no route to a dispatcher.
