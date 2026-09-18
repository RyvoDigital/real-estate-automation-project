# The segmentation screen

**Design · 18 September 2026 · nothing in this document has been built**

> §3.18 says the classification of an agency's contacts cannot be closed from a
> keyboard: it is knowledge the agency holds and nobody else, and it arrives
> through a person's afternoon. True — and it cannot happen at all without
> somewhere to happen. **This screen does not close §3.18. It is the difference
> between "we need to have that conversation" and "we can have it on Tuesday".**

---

# 1. The declaration is the product; everything else is scaffolding

What this screen exists to produce is a row in `consent_events` of kind
`declared`, carrying:

| | |
|---|---|
| **what** | the segment: A, B, C or D — never E, which is derived from an objection and is not a thing an agency may assign (§4.3.1a) |
| **who** | the person at the agency who said it, by name |
| **when** | the moment they said it |
| **on what basis** | the evidence they described, in their words |
| **how** | individually, or as part of a named group — recorded, not hidden |

## 1.1 A declaration without a name is not a declaration

The same rule as a policy confirmation, and for the same reason: *"registada com
data, hora e identificação de quem a efectuou"* (Enquadramento §5.1). A date
with no author is a date.

Structural rather than remembered — `0024`:

```sql
constraint declaration_has_its_author
  check (kind <> 'declared' or declared_by is not null)
```

## 1.2 Two people, not one

The agency **declares**; we **record**. They are different acts by different
people and the row says so: `declared_by` is the agency person, and
`evidence.recorded_by` is the operator driving the screen.

Collapsing them would put our name on their assertion — which is precisely
backwards, since the whole architecture rests on the knowledge being theirs and
the responsibility following the knowledge.

## 1.3 A group declaration is recorded AS a group declaration

Declaring three hundred contacts at once produces three hundred ledger rows,
each carrying `evidence.declared_as_group` with the group's description and
size.

Not hidden, deliberately. A bulk declaration is a legitimate and necessary act —
and it is a different *kind* of statement from an individual one, made with less
information per contact. An auditor reading the ledger should see which it was,
and so should we, when a group declaration turns out to have been wrong.

---

# 2. The screen serves the agency's memory, not our data model

They are looking at a list of names, trying to remember where each came from.
Our segments are legal categories; their memory is episodic — *"that's the
export from the old website form"*, *"those are the people who came to the
Cascais open days in 2023"*.

**So the screen groups first and asks second.** It proposes groups from whatever
the data actually supports, in the order most likely to jog a memory:

1. **Import batch** — *"the 412 contacts from `contactos-antigos.xlsx`, imported
   14 March"*. The strongest cue, because they chose the file.
2. **Year of last contact** — *"the 88 people last spoken to in 2022"*.
3. **Area** — *"the 61 contacts in Cascais"*.
4. **Whether they transacted** — if the import carried anything saying so.

Every group is **declarable in one action**, with the consequence of that action
shown before it is taken — and every group is **openable**, so exceptions can be
pulled out and declared separately. An agency that says *"those are all past
clients except the Silvas"* must be able to say exactly that.

> **Declaring three hundred contacts individually is a conversation nobody
> finishes**, and a screen that requires it produces either an abandoned
> afternoon or three hundred careless clicks. The second is worse, because it
> looks like data.

## 2.1 What the screen shows before a declaration is made

For any group, before the button is pressed:

```
412 contactos · contactos-antigos.xlsx · importados 14 Mar

  Se declarar «cliente que transaccionou»    →  contactáveis em Portugal
                                                (a excepção de cliente
                                                 existente aplica-se)
  Se declarar «contactou, não transaccionou» →  precisam de autorização
                                                antes de qualquer mensagem
  Se declarar «origem desconhecida»          →  não contactáveis
```

The consequence of each answer, before the answer. Without it the agency is
guessing at what their words will do, and an agency guessing will pick the
option that sounds most positive.

---

# 3. The quarantined claim, which is the hardest thing on the screen

For a contact whose ledger holds a `quarantined` event, the screen must ask the
question from the consent-ledger design: *your file said `sim` for this contact —
do you have the record behind it?*

**This is the first time that question reaches a human, and how it is phrased
decides whether it is answered honestly.**

## 3.1 What makes the answer dishonest

- **Blame.** "Your file claimed consent. Can you prove it?" invites defence, and
  a defensive person says *yes, of course* to make the question stop. The
  phrasing manufactures the false answer.
- **A cheap yes.** A checkbox marked *"we have consent"* costs nothing to tick.
- **An expensive no.** If *no* reads as *this contact is lost*, the answer will
  be *yes*. Nobody deletes four hundred contacts to be tidy.
- **No third option.** A yes/no question forces a lie when the truth is *"I do
  not know"* — and for a list assembled over ten years, *I do not know* is the
  most common true answer there is.

## 3.2 The wording

> **O seu ficheiro dizia «sim» na coluna de consentimento.**
>
> Nós registámos isso como consentimento — e isso foi um erro nosso, não seu.
> Uma célula num ficheiro não é prova de nada: pode ter sido preenchida por
> qualquer razão, há muitos anos, por alguém que já não trabalha consigo.
> Corrigimos o registo e por isso estamos a perguntar agora.
>
> **O que é que está por trás desse «sim»?**
>
>   ○ Temos o registo — formulário, e-mail ou sistema, com data
>     → *precisamos de saber qual, para o podermos mostrar se for pedido*
>   ○ Não temos registo
>     → *o contacto não se perde: pedimos autorização por outra via antes de
>        qualquer mensagem*
>   ○ Não sei
>     → *resposta perfeitamente normal numa lista com anos. Tratamos como «não
>        temos registo», e pode mudar mais tarde se aparecer*

Five things are doing work there:

1. **The error is ours and the text says so**, truthfully — our importer did
   record a spreadsheet cell as consent. Starting from our mistake rather than
   their claim removes the thing being defended.
2. **"Uma célula não é prova"** explains *why* we are asking, so the question
   reads as diligence rather than suspicion.
3. **A yes must be specific.** Naming the form, the email or the system is much
   harder to invent than ticking a box — and if they can name it, that is
   exactly the evidence a regulator would want.
4. **No is shown as a route, not a loss.** *"O contacto não se perde"* is the
   sentence that makes honesty affordable.
5. **"Não sei" is offered first-class and normalised** — *"resposta
   perfeitamente normal numa lista com anos"*. Without it, uncertainty collapses
   into whichever of yes/no is socially easier, which is yes.

## 3.3 And what we record

Whatever they answer, **including "não sei"**, is a declaration and goes in the
ledger with their name on it. *I do not know* is a fact about the world, stated
by the person best placed to state it, and it is worth more than a guess
recorded as certainty.

A `não sei` produces a `declared` event with segment D and
`evidence.uncertainty: true` — so a later re-declaration, if the record turns
up, is visibly a *change of knowledge* rather than a change of mind.

---

# 4. What it must never do

**Never propose a segment as a default selection.** The system proposes; the
agency confirms or corrects (Enquadramento §5.1) — and a pre-selected radio
button is not a proposal, it is a nudge with a legal consequence. Show the
proposal as text beside the choices, unselected.

**Never offer segment E.** An objection comes from the contact, and an agency
that could assign it could also remove it.

**Never let a declaration be edited.** The ledger is append-only; a correction
is a new declaration, and the screen shows the history rather than the current
value alone. *"Declared A on Tuesday by Ana; re-declared D on Friday by Ana"* is
the honest rendering of a mind changed.

---

# 5. What it needs

- `0024` — the author constraint on `declared` events.
- The grouping query, which is a read over `leads` and their `qualification`.
- The declaration writer: one ledger row per contact, one action.
- The screen itself, standalone per §3.17.

Nothing here can send. The screen writes `declared` events and reads leads; it
has no route to the gate, the permit or the adapter, and `one-sender.test.ts`
will assert that the same way it does for the campaign planner.
