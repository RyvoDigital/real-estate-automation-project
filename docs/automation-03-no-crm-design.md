# Automation 03 for an agency with no CRM

**Design · 18 September 2026 · nothing in this document has been built**

> The requirement: **03 must work for a boutique agency with no CRM and no
> structured contact data.** Most of the segment we sell to has none, and a
> matcher with nothing to match against is not a product.
>
> The answer this document settles on is **useful without criteria**, not
> *matching without a CRM*. The criteria-recovering routes are escalators that
> run underneath it, and the floor does not depend on any of them landing.
>
> Four things are settled here rather than deferred, because each of them
> decides the shape of what gets built: the recency defect (§1), what 03
> actually sends and to whom (§4, §5), and the one guard that would have to be
> widened to make §5 work (§6).

---

# 0. What this document decides

| | Decision |
|---|---|
| **The floor** | Agent triage. The system brings the right *names* and writes the message; the agent decides. No lead criteria required, no Meta template required, buildable today |
| **The escalators** | Notes extraction, lead re-qualification, WhatsApp history — in that order of cost, each raising the tier of a list that starts at name-and-phone |
| **The honesty rule** | State the tier; never claim more than the tier supports. *"A well-organised contact list plus your memory, and the system remembers what you decide"* is sellable on a name-and-phone list. *"Matching"* is not |
| **Explanation quality** | Lives on the **agent** path, where there is no template and no character limit. The lead-facing message carries a single bounded phrase and never a quote |
| **The agent notification** | **Never a template.** It rides the 24-hour window the agent opened by sending the listing, or it does not go over WhatsApp at all |
| **`guardDraft`'s known set** | Widened by **one field — `listing.price`** — and not by "the listing's stored fields", for a measured reason (§6.2) |
| **Built first** | §1, the recency defect, before anything else in this document |

**What is *not* decided here** and is named as such: the legal question in §5.4,
and the calibration that cannot happen from a keyboard (§10).

---

# 1. First: the recency defect

Nothing else in this document may be built before this is fixed. Two reasons.

**It is live today**, and it fails in the worst available direction — silently,
while printing both contradictory facts side by side without noticing. Measured
against the shipping code on 18 September:

```
"Procuramos T3 em Cascais ate 800 mil."   →  budget max   800 000   (hard)
"Afinal podemos ir ate 1 milhao."          →  budget max 1 000 000   (hard)

listing: T3, Cascais, €950,000            →  matched: FALSE

  Cascais is exactly what they asked for
  €950,000 is inside their €1,000,000 — they said: "Afinal podemos ir ate 1 milhao."
  Fails: €950,000 is beyond €840,000 — "Procuramos T3 em Cascais ate 800 mil."
```

A lead who raised their budget is refused by their own earlier sentence, and the
reasoning contains the refutation of its own verdict. It is `§4.1`'s failure
inverted: too *tight*, which is the invisible direction — the lead never learns
what they were not shown, and neither does the agent.

**And it gets worse under §3.1.** A notes cell is written over years by several
people and has no internal order at all, so it is the first thing a
notes-reading extractor meets. Building §3.1 on top of this would industrialise
the defect.

## 1.1 The rule

> **Between two statements we can order, the later one is the lead's current
> position. Between two we cannot order, we take the one that excludes the
> least — and we say that we did.**

Both halves come from the same asymmetry, which is already the argument in
`§4.1` and in `criteria.ts`: **being too loose is visible and recoverable — the
agent reads the reasoning and discards it. Being too tight is invisible.** So
where we must guess, we guess toward inclusion, and the guess is stated in the
reasoning rather than absorbed.

That single rule is applied through a property of the criterion, not of the
wording — which is what makes it a table in code rather than a judgement:

| Kind | Can it have two true values at once? | Conflict resolution |
|---|---|---|
| `budget` (min/max) | No — one fact about their means | **Later supersedes earlier.** Unordered: the widest |
| `bedrooms`, hard floor | No | **Later supersedes earlier.** Unordered: the lowest floor |
| `bedrooms`, preferences | Yes — `hedge.ts` already emits two | Accumulate, unchanged |
| `area` | Yes — people look in several | **Accumulate (union).** Never replace |
| `feature` | Yes | **Accumulate**, and see §1.2 |
| `property_type` | Yes | Accumulate |

`area` accumulating rather than replacing deserves its own line, because it
looks like a loosening of the correction that `§4.1` records. It is not. *"Also
looking at Estoril"* and *"actually, Estoril"* are indistinguishable to us, and
the union is still a **hard** constraint — the listing must be in one of the
named areas. The Faro defect came from area being a *preference*, not from there
being two of them.

## 1.2 A superseded requirement is marked, never deleted

`Requirement` gains `supersededBy: { evidence, why } | null`. The earlier
statement stays in the extraction with its own evidence, and the scorer ignores
it for the verdict while the reasoning still reports it:

> *They said €800,000 in March and €1,000,000 in July; this is judged against
> the later one.*

Same instinct as `§4.7` — record, do not silently absorb — and as the ledger's
append-only shape. A requirement that vanished would leave the agent unable to
tell a correction from an extraction bug.

## 1.3 Ordering needs a clock the extractor does not currently have

`extractFromMessages(leadMessages: string[])` has no timestamps, so it cannot
apply the first half of the rule at all. The signature becomes an ordered list
of **statements**, each carrying its source and its time:

```ts
type Statement = {
  text: string
  source: 'conversation' | 'note' | 'agent'
  /** null for a source with no internal order — a notes cell (§3.1). */
  at: string | null
}
```

`at: null` is the unordered case and selects the second half of the rule. It is
nullable rather than backfilled with the import time for the same reason
`consent_at` is nullable in the ledger: **the moment we learned a thing is not
the moment it was true**, and a false clock in a field people reason from is
worse than an absent one.

## 1.4 The garden case — two separate causes, both fixed, and a third language

The instructive one, and it goes in the suite by name. Measured, sentence by
sentence, against the shipping code:

```
"Na verdade nao, precisamos mesmo de um jardim."  →  preference   (no marker found)
"E essencial."                                     →  HARD        (marker: essencial)
…joined into one sentence by a comma              →  HARD        (correct)
```

A lead explicitly upgrading a wish to a requirement is read as having said it
twice, weakly — and the second reading is the one the scorer uses, because a
preference never decides admission.

**Cause 1 — the splitter cuts the marker from the thing it marks.** `strengthOf`
runs per sentence; `"É essencial."` is a sentence whose strength is computed and
then thrown away, because it names no criterion for the strength to attach to.

> **Fix:** a sentence that carries a strength marker **and no criterion of its
> own** attaches to the immediately preceding criterion sentence, within the
> same statement. Directional and adjacent-only, deliberately — a sentence that
> carries its own criterion does not absorb the previous one's marker, so
> *"Precisamos de garagem. Um jardim seria bom."* keeps the garage hard and the
> garden a preference. Widening this to a general window is how the garage's
> marker reaches the garden.

**Cause 2 — the Portuguese hard list is missing a word its English equivalent
has.** `HARD_MARKERS` carries `we need`, `has to have`, `have to have` in
English and `tem de ter` / `tem que ter` in Portuguese, but not `precisamos` —
which is the ordinary way to say it.

**And the Spanish list has the same gap**, checked rather than assumed:

```
"We need a garden."        →  HARD        (marker: we need)
"Necesitamos un jardín."   →  preference  (no marker found)
```

So the fix is to all three lists, not one: `precisamos (de)`, `preciso (de)`,
`temos de ter`, `temos que ter` · `necesitamos`, `necesito`, `tenemos que
tener`. Each must be checked against `negatedAt` in the same pass — *"não
precisamos de jardim"* must stay a non-requirement, and the 28-character window
already covers it, which is a thing to **prove rather than assume**, because
that is exactly the shape of lesson 1e.

## 1.5 The tests, by name

- `a lead who raises their budget is not refused by their own earlier sentence`
- `a lead who lowers their budget is judged against the lower one`
- `"precisamos mesmo de um jardim, é essencial" is ONE hard constraint, not two weak preferences`
- `a marker-only sentence attaches backwards; a sentence with its own criterion does not`
- `"necesitamos un jardín" is hard, like its English and Portuguese equivalents`
- `"não precisamos de jardim" is still not a requirement` — the negation guard survives the new markers
- `two areas accumulate and both stay hard` — the Faro control, re-run
- `an unordered source takes the widest budget and says so in the reasoning`
- `a superseded requirement is still reported, with both statements`

Each new marker and each half of the rule gets its sabotage check: remove it,
confirm exactly the expected tests fail, and **assert the anchor before
believing the result** — lesson 1f, which was recorded on this very file.

---

# 2. The floor: useful without criteria

## 2.1 What the product is on a name-and-phone list

Today 03 asks *"which leads match this listing?"*. On a list with no criteria
that question has no answer, and `scoreListing` is right to refuse it — with no
hard constraint, every listing matches, which is the `§4.1` correction.

**So invert it.** A listing arrives; the system cannot rank the contacts, so it
does not pretend to. It presents them **grouped the way the agency remembers
them** and lets the agent choose — and then it keeps what the agent decided.

```
1. Agent sends the listing by WhatsApp                        (F2 — built)
2. Cockpit stores it and scores every lead that HAS criteria  (F3 — built, unwired)
3. For the rest: no score. Grouped, counted, reachability shown
4. The agent picks. Each pick is a listing_matches row, origin 'agent'
5. One optional question per pick: "why them?" — one line, free text
6. That line becomes a requirement with source 'agent' and the agent's own
   words as evidence
7. Next listing: those contacts can be ranked. The unranked list shrinks
```

Step 5 is the whole mechanism. **The triage is a data-acquisition flow wearing a
product feature's clothes**, and it is the only route that produces structure
for a contact nobody has ever recorded anything about. Twenty enquiries a month
is a triage the agent will actually do; the escalators in §3 then reduce how
often they have to.

The grouping is already written: `src/lib/segmentation/groups.ts` is pure, takes
rows and returns groups by import batch, year of last contact, and area, ordered
by how strongly each jogs a memory. It was built for the declaration screen and
it is the right shape here for the same reason — *"the 61 contacts in Cascais"*
is how an agent thinks, and `area = 'Cascais'` is not.

## 2.2 Chosen is not matched, and the two must never merge

A `listing_matches` row has an `origin`, and it is load-bearing:

| `origin` | Means | Carries |
|---|---|---|
| `computed` | The engine met every hard constraint | score, strength, hardMet, preferencesMissed, evidence, `filter_would_find` |
| `agent` | A person said so | the agent's reason if they gave one. **No score, no strength** |

⚠️ **`filter_would_find` is NULL for an `agent` row, never `false`.** It is
computed from stored fields to answer *"would a CRM have found this?"*, and for
a row a human chose, the question was never asked. A `false` there would let the
strongest claim we make — *item 5 of the definition of done* — be satisfied by
rows that prove nothing. That is `§0.7` in a new costume: a metric that cannot
fail is not evidence.

The cockpit and the notification show them in separate blocks with different
wording. They never sort into one list by a shared number, because there is no
shared number.

## 2.3 The honesty rule, and the copy that carries it

`TIER_MEANS.contact_only` currently ends the sentence in the wrong place:

> *"…it cannot be matched against a listing, because nothing in it says what
> these people want."*

True, and incomplete — it reads as a refusal of the product. It becomes:

> *"Name and phone only. Nothing in this list says what these people want, so it
> cannot be matched against a listing. What it can do is bring the right names
> in front of you when a listing arrives, and remember what you decide — so the
> list gets better every time you use it."*

The rule stays exactly as `§2.4` states it: **the tier is shown at onboarding and
said plainly, and no silent degradation.** What changes is that the bottom tier
now has a product rather than an apology.

## 2.4 And the buyer we are not designing for, said out loud

A 200-enquiries-a-month agency will not triage, and the triage floor degrades
badly for them: a longer unranked list, more clicks, less structure recovered
per listing. **That agency is not our buyer** — `§2.6` of the commercial
reference already bounds the published tiers at five agents and one office, and
`§8c` records the decision not to chase Inmovilla's 4,700-agency volume market.

Writing it here so that the first large prospect is a pricing conversation and a
scoping conversation, rather than a quiet discovery that the floor does not hold
at volume.

---

# 3. The escalators

Each raises the tier of a list that starts at name-and-phone. None of them is
required for §2 to work, and that is the point of the ordering.

## 3.1 Read the notes column — smallest, already half-built

The importer already stores `qualification.imported.notes` with the comment
*"§4.2 will read this. It is the whole reason the import exists."* Nothing reads
it. F1's own fixture carried *"garden non-negotiable, kids need to walk to
school"* — the sentence the extractor was written for.

The work is small: pass notes in as a `Statement` with `source: 'note'` and
`at: null`, carry the source through to the reasoning so a notification can say
where a claim came from, and re-tier the list on what the extraction actually
yielded rather than on whether the column was non-empty.

What it buys: real requirements with verified evidence for any agency that keeps
notes, and `filter_would_find = false` genuinely true for them — **a CRM filter
cannot read a notes column**, which is `§4.2`'s argument arriving for an agency
that has no CRM at all.

⚠️ **Blocked on §1.** A notes cell is the unordered case, and it is where the
recency defect does the most damage.

## 3.2 Ask the lead — the best data, gated by something we do not control

One approved template — *"what are you looking for now?"* — and the Concierge
answers whatever comes back inside the window the lead just opened, with no gate
and no template, capturing criteria in their own words. A `contact_only` row
becomes `precise` in one exchange, and the relationship reopens, which is
Automation 02's purpose with a specific question attached.

**The binding weakness is `§3.18`, not engineering.** Most of a boutique
agency's list will land in segment C or D and the gate will refuse it,
correctly. This converts only the fraction the agency can evidence — and the
agencies with no CRM are the least likely to have consent records. So it is an
escalator and can never be the floor.

## 3.3 Import the WhatsApp history — the largest asset, and the largest question

The five-person agency that never left Excel has fifteen years of WhatsApp
conversations with its buyers, in the agent's pocket. That **is** the
conversation depth the entire product is positioned on; it exists; and no CRM
has it. WhatsApp exports a chat as `_chat.txt`, the parser is small beside what
has already been written, and the extractor already handles PT/EN/ES.

It is also the option that would turn the absence of a CRM from a deficiency
into the advantage the pitch already claims.

⚖️ **And it is a bulk import of other people's messages** — third parties, group
chats, colleagues, family, and years of unrelated personal data — which is a
materially different act from importing a contact list. It is evidence of
*contact*, not consent to be *contacted*, so it changes nothing about the gate.
It would make segment declaration much easier (a real conversation is the
strongest memory cue there is, and §2 of the segmentation screen is built to use
exactly that kind of cue) while opening a data-protection surface that needs the
treatment `§6.1` got.

**Lawyer before design, design before code.** Recorded as an opportunity, not
scheduled.

## 3.4 Not pursued: inferring from enquiry or viewing history

An agency with no CRM has no viewing records either. Dropped unless a specific
prospect turns out to have them, in which case it is an import format and not a
new mechanism.

---

# 4. The template problem, settled

`§1` of the handoff says explanation quality is the product: *"This is the first
four-bedroom in Cascais with a garden under €2M we've had in three months, and
you told us the garden was the thing you couldn't compromise on."* A Meta
template is frozen text with numbered slots. These do not fit, and the document
has to say which gives.

## 4.1 What actually constrains it

Verified against Meta's and Twilio's own documentation and against
`legal/modelos/modelos-whatsapp.md`, rather than assumed:

| Constraint | Consequence for 03 |
|---|---|
| Body ≤ 1024 chars, frozen at approval, per client, per version | The prose cannot vary by recipient except through slots |
| **A parameter value may not contain a newline, a tab, or more than four consecutive spaces** | A multi-line reasoning block cannot be a variable. Not "discouraged" — the API rejects it |
| **Meta rejects a template with too many variables relative to its static text** (`INVALID_FORMAT`) | A body that is mostly slots is refused at submission. The mechanism exists precisely to stop templates being blank containers for unreviewed content |
| Sample values are submitted to Meta with the template | A variable sampled as `Cascais` that carries a 200-character quoted paragraph in production is category-misuse exposure, and `§1.3` of the modelos document puts that penalty on the client's account |
| Every template carries the opt-out footer and two quick-reply buttons | Fixed overhead in every lead-facing message |
| Twilio sends templates by `ContentSid` + `ContentVariables`, not `Body` | Already correct in `twilio-adapter.ts`, with the reason recorded. The variable constraints above are enforced at exactly this call |

## 4.2 The settlement

> **The reasoning does not fit in a template, and it does not need to — because
> the reasoning's reader is the agent, not the lead.**

`§5` already says the default is to notify the agent and that a personal message
from the agent is worth more than an automated one. The template constraint
turns that preference into a structural fact:

- **Agent path (F4): the full reasoning, free-form, no template, no limit.** This
  is where explanation quality lives, and §5 shows it is not constrained at all.
- **Lead path (F5): one bounded phrase, never a quote.** At most a third variable
  drawn from a **closed phrase table** keyed by the decisive criterion — an area
  name, a bedroom count, a feature — single-line by construction, short enough
  that the submitted sample is representative of production.

**And the lead-facing message must not quote the lead even where it would fit.**
A quote is warm from a person and unsettling from an automated number: *"you
told us in April the garden was non-negotiable"* reads as attentive when the
agent says it and as surveillance when a business number does. That is a product
judgement, not a limit we are working around, and it means the constraint costs
less than it first appears.

## 4.3 The garden lead, both messages, in full

The lead from `bf2073e`: 4-bed, Cascais, garden non-negotiable, stored
`budget_max` €2,000,000, *"We could stretch for the right place."* The listing:
`A-1042`, T4 Cascais, €2,200,000, garden and pool, not south-facing.

**Agent path — free-form, inside the window, what F4 actually sends:**

```
A-1042 · T4 Cascais · €2,200,000 — 6 contacts match, 3 strongly.

Maria Santos — asked for exactly this in April: 4 bed, Cascais, garden
non-negotiable. €2.2M against her €2M, and she said she could stretch for
the right place: "We could stretch for the right place." Misses the south
aspect she'd have liked. Not contacted in 5 months.

A CRM filter on her stored fields would not have found this one.

Reply 1 for a draft, or open the cockpit for all six.
```

**Lead path — the template, with what is frozen and what is a slot:**

```
Olá {{1}}, fala a Sofia da [Agência]. Entrou um imóvel em {{2}} que
corresponde ao que procurava, {{3}}. Se quiser, envio-lhe os detalhes.

[rodapé]  Responda SAIR para não receber mais mensagens.
[botões]  Sim, tenho interesse   ·   Não contactar mais
```

Rendered: `{{1}}` = `Maria`, `{{2}}` = `Cascais`, `{{3}}` = `com jardim`.

> Olá Maria, fala a Sofia da [Agência]. Entrou um imóvel em Cascais que
> corresponde ao que procurava, com jardim. Se quiser, envio-lhe os detalhes.

Three variables, none at the start or end of the body, none adjacent to another,
each a single line with no repeated spaces, and roughly 30 words of static text
around them — comfortably clear of the ratio rule. `{{3}}` comes from the closed
table (`com jardim` / `com piscina` / `com vista mar` / `com garagem` / `de
tipologia T4` …), so its Meta sample is honest.

**Note what the lead's message does not contain:** the price, the reference, the
quote, the stretch, the scarcity claim, and the fact that we have been reading
five-month-old messages. All of that goes to the agent, who decides what to
repeat. That is the right division and it is also `§5`'s.

## 4.4 What this means for the pitch

Explanation quality is claimable, and it must be claimed **about the agent-facing
product**: *"your agent gets told which of their contacts this is for, and
why, in the contact's own words."* True, demonstrable, and unconstrained.

The lead-facing claim shrinks to what the template can carry: *"and where the
contact has consented, a message that names the thing they actually asked
for."* Also true. **What must not be said is that the lead receives the
reasoning** — that would be retracted the first time anyone read a real send.

---

# 5. F4 — the agent notification, settled

`§5` calls this the primary path and the spec writes it as prose. It has no 02
equivalent, and the question put in the last session was the right one: a
notification to the agency's own agent is still business-initiated, so different
lawful basis, same Meta rules.

## 5.1 It rides the window the agent already opened

**The listing arrives because the agent sent it.** That inbound message opens a
24-hour customer-service window on the client's number, and the Concierge
already replies free-form inside it — `ReplyToAgent` is live today and sends the
ingest confirmation by Twilio in the same execution.

So the match notification is **appended to a reply that already happens**,
seconds after the agent's own message, inside the window, free-form.

Three consequences, and the third is the one that changes planning:

1. **No template, no submission, no approval, no variables.** §4.1's entire
   constraint table is irrelevant on this path.
2. **No gate.** The stated exception already covers it — *the Concierge keeps
   replying inside the window, which needs no gate* — and this is that path, to
   a number the client configured as their own agent.
3. 🔴 **03's primary path has no Meta dependency at all.** Unlike 02, F4 is not
   waiting on anything external. It is buildable now.

## 5.2 Outside the window there is no push

A listing entered in the cockpit, a re-match after a status change, a nightly
sweep over new leads — all outside the window. The decision:

> **No WhatsApp push outside the window. The cockpit carries it, and the
> existing email transport carries the digest.**

Not a template, deliberately. A template for this would be a new submission, and
its category is a genuine question — arguably `UTILITY`, since it is an internal
message to the business's own staff about their own inventory — and `§1.3` of
the modelos document is explicit that Meta polices category misuse and the
penalty lands on the client's account. **We are not putting a client's WhatsApp
account at risk to save an agent from opening the cockpit.**

Email is already built, already proven by being broken on purpose at D1, and
rides its own transport with its own credential — which is the right property
for a notification that must not share a fate with the channel it reports on.

⚠️ **The expected failure, so it is recognised rather than debugged:** a
free-form send outside the window returns **Twilio 63016**, *"Failed to send
freeform message because you are outside the allowed window."* `AfterAgentReply`
already asserts the Twilio response rather than trusting a 2xx, so this surfaces
as a named error and not as a silent non-delivery. Note also that since 1 April
2025 a template sent via `Body` outside the window fails the same way — it must
go by `ContentSid`, which `twilio-adapter.ts` already does.

## 5.3 What the notification carries, and what it does not

**Names and reasons. Not phone numbers.** The agent acts in the cockpit or by
replying, both of which leave a record; a phone number in a WhatsApp message
leaves lead contact data in an agent's personal chat history for no operational
gain. Data minimisation, and it also keeps the message short enough to act on
from a phone, which is item 15 of the definition of done.

The computed block and the chosen block are separate and worded differently
(§2.2). A run that produces neither says so — *"nothing matched, and here is
why"* — rather than sending nothing, for the reason the ingest reply already
exists: **an agent who hears nothing assumes it landed.**

## 5.4 ⚖️ The open legal question, and the control it must not cost us

`§5` says *the agent sends it — the system does not*. Two ways that actually
happens, and they have different consequences:

- **The agent sends from their own phone.** Our system is not the sender and the
  ledger must not claim it was. The cost is that the outcome is invisible to
  `§4.7`, so we would hold matches with no outcomes.
- **The agent hand-sends from the shared client number.** The orphan sweep flags
  it — correctly, by today's rule: *an outbound template with no send row is the
  gate being bypassed.* Under 03 that would go from a rare accident to **the
  intended workflow**, and a sweep that fires constantly is a sweep nobody reads.

The tempting fix is to teach the sweep to recognise our own drafts and record
them as match outcomes. It is tempting because it converts noise into exactly
the signal `§4.7` wants.

> **Do not do it yet.** It weakens the one control that catches a send with no
> basis, in order to make a workflow convenient, *before* the question of
> whether we may supply that text at all has been answered. ⚖️ Whether drafting
> a message the agency then sends outside our gate is facilitation is a question
> for the lawyer, alongside the `§6.1` questions already sent.
>
> In the interim: **accept the sweep noise and count it.** A rising orphan count
> with a known cause is a measurement; a blinded sweep is not.

---

# 6. `guardDraft` — the widened set, and why it is one field

## 6.1 The problem

`guardDraft` refuses any money figure not already in the conversation: *"a figure
the lead has already used is quotable back at them; one that appears from
nowhere is the model inventing."* 03's draft's most important figure is the
listing's asking price, which is in the listing and not in the conversation. So
the guard refuses the correct draft, and DoD item 14 cannot be met without
widening the known set.

## 6.2 ⚠️ "The listing's stored fields" is already too wide — measured

The proposed set was *the listing's own stored fields and nothing derived from
them*. Reading the guard, even that fails. `MONEY` matches a bare 3+ digit run
followed by `mil`, and `digitsOf` strips separators — so a field that is not
money at all becomes a licence to state a price. Against the shipping guard with
`price 1.950.000`, `size_sqm 320` and `bedrooms 4` in the known set:

```
"A casa em Cascais está a 1.950.000€."   →  ok          (correct)
"A casa em Cascais está a 1.900.000€."   →  REFUSED     (correct — adjacent figure)
"A casa em Cascais está a €1.95M."       →  REFUSED     (see §6.4)
"Consigo por 320 mil."                    →  ok  ⚠️      €320,000, from size_sqm
"Consigo por 4 milhões."                  →  ok  ⚠️      €4,000,000, from bedrooms
```

A draft naming a price nobody has ever mentioned passes, because 320 square
metres and four bedrooms were in the set. **The set is therefore one field:**

```ts
/**
 * The ONE listing fact a draft may state as money: its asking price.
 *
 * Not "the listing's fields". size_sqm 320 makes "320 mil" — €320,000 — a
 * permitted figure, and bedrooms 4 makes "4 milhões" one. Measured, not
 * reasoned: the money pattern matches a bare digit run before `mil`, and the
 * comparison is on digits with separators stripped, so a non-money field is
 * indistinguishable from a price once it is in the set.
 *
 * Nothing derived, either: no stretch ceiling, no price per square metre, no
 * difference from the lead's budget, no rounded form. Each is a number we
 * computed rather than a number that is true of the property.
 */
const knownFigures = (listing: Listing) =>
  listing.price === null ? [] : [String(listing.price)]
```

## 6.3 The tests, by name

- `the asking price may be stated`
- `a figure adjacent to the asking price is refused` — €1,900,000 against €1,950,000
- `the listing's size does not license a price` — the §6.2 measurement, permanently
- `the bedroom count does not license a price`
- `a derived figure is refused` — the 15% stretch ceiling, computed and offered
- `the lead's own stated budget is still quotable` — the existing behaviour, unbroken

The size and bedroom cases are the ones to write first, because they are the
tests that would have caught the widening that looked obviously safe.

## 6.4 One thing the guard makes strict, stated as intended rather than found

`€1.95M` is refused even though it is the same number as `1.950.000`, because
the comparison is on digit runs. **That is the correct trade and it should not
be softened.** Normalising representations is how `1.95` and `195` and
`1950000` start being treated as the same fact, and the whole point of the guard
is that a figure is permitted because it is *literally* the price. The
consequence is that the draft must state the price in the form we hold it, which
is a constraint on the prompt — and the fallback is already correct: a draft that
trips a guard is replaced by the fixed reply, not edited.

---

# 7. Data model

Two new tables. `listings` and `import_batches` are unchanged.

```
listing_matches           lead × listing
  id, client_id, listing_id, lead_id
  origin                  'computed' | 'agent'        -- §2.2, never merged
  -- computed rows only; NULL for origin='agent'
  score, strength, filter_would_find
  reasoning               jsonb: hardMet, hardFailed, preferencesMissed, evidence
  -- agent rows only
  chosen_by, chosen_at, chosen_reason
  -- both
  listing_status_at_match, status_changed_at_at_match  -- §7.1
  notified_at, draft_text
  outcome, outcome_at                                   -- §4.7, recorded, never applied
  unique (listing_id, lead_id)

lead_requirements         the extraction, kept rather than recomputed
  id, client_id, lead_id
  kind, value, strength, source        -- 'field' | 'conversation' | 'note' | 'agent'
  evidence, why
  stated_at                            -- null for an unordered source (§1.3)
  superseded_by                        -- §1.2, marked, never deleted
```

`lead_requirements` is a table rather than a recomputation because the agent's
`chosen_reason` (§2.1 step 6) is an input that exists nowhere else — recomputing
from messages would silently discard it. It also makes the `superseded_by` chain
inspectable, which is what lets an agent tell a correction from a bug.

## 7.1 The status snapshot is the point of two of those columns

`listing_status_at_match` and `status_changed_at_at_match` exist so the send path
can refuse if the listing moved between matching and sending. `0009`'s header
already states why checking only at match time is check-then-act and that there
is **no window small enough to make it safe**. A new refusal reason,
`listing_no_longer_available`, joins the gate's vocabulary on 03's path —
refused with a row and a reason, like every other refusal, never filtered out.

## 7.2 Migration notes, from the two defects that have already cost us

`0025_listing_matches.sql`, `0026_lead_requirements.sql`. Read `0002` first —
the `service_role` grant issue has bitten twice, and the check is a round trip
**through PostgREST**, not `has_table_privilege` in psql. The unique index on
`(listing_id, lead_id)` is used by `ON CONFLICT`, so it must be **non-partial**
(`42P10`, twice now). RLS on, no policies, deny by default.

---

# 8. What this changes outside 03

## 8.1 The §6 rejected row — rewritten, not deleted

`improvements-and-opportunities.md:634` currently reads:

> | Listing-match sold to an agency with no structured contact data | Dishonest — the data cannot support it |

**The rejection is correct about matching and wrong to conclude there is no
product, and that distinction is the whole finding.** It becomes:

> | *"Matching"* sold to an agency with no structured contact data | Dishonest — the data cannot support the word. **Superseded in part, 18 Sep 2026:** the *matching* claim stays rejected, and the product for that agency is agent triage — the system brings the right names and writes the message, the agent decides, and the system keeps what they decided. Sold as that, it is honest and the tier ladder says so. See `automation-03-no-crm-design.md` |

A rejected row that is revisited is recorded as revisited, with the date and the
reason, because the point of the section is that nobody re-proposes an idea
without new information — and *"the requirement changed"* is new information
only if it is written down.

## 8.2 Two corrections to the 03 handoff

`automation-03-listing-match-handoff.md` predates the consent ledger and says
things that are no longer true:

- **§6.1** points at `leads.consent_status` / `consent_at`. Those are no longer
  authoritative and the importer stopped writing them on 17 September; the basis
  lives in the ledger. The section already carries a correction note — it should
  also say that `§6.2`'s frequency caps are **built**, in `pacing.ts`, and are
  refusal-shaped rather than filters.
- **§2.4's tier table** gains the triage row, so the spec and `TIER_MEANS` do not
  drift (§2.3).

## 8.3 The pitch

`§4.4`. Explanation quality is claimed about the agent-facing product. The
no-CRM line already in the commercial reference — *"you do not need a CRM"* —
stops contradicting the product the moment §2 exists, and that contradiction was
the finding that started this document.

---

# 9. Order of work, and the gates

**Nothing here can send.** F4 rides an existing reply; F5 is gated behind Meta
and behind a template that has not been drafted, let alone submitted.

| | | Gate |
|---|---|---|
| **1** | **§1 — the recency defect.** The rule, the ordered `Statement`, the splitter fix, the three marker lists, the nine tests, each sabotage-verified | *Shown red first: every test in §1.5 fails against today's code before anything is changed* |
| **2** | `0025` + `0026`, applied and verified through PostgREST | *An insert–update–select–delete round trip as `service_role`, and `anon` refused* |
| **3** | **F3 wired.** `matchableListings` × `lead_requirements` → `listing_matches`, thresholds read from config, an unconfigured client refusing with `missingThresholds` naming what is absent | *A computed match with `filter_would_find = false`, its quoted evidence verified, and a near-miss refused with its reason — DoD item 5, at last, against real rows* |
| **4** | **F4 — the notification**, appended to `ReplyToAgent` inside the window; cockpit and email outside it | *An agent sends a listing and receives something they would act on rather than delete, on a phone* |
| **5** | **The triage floor (§2)** — grouping, picking, the "why them?" line, and the two blocks kept apart | *A name-and-phone list, imported and declared, produces a triage an agent completes; the next listing ranks the contacts they chose* |
| **6** | **§3.1 — notes extraction**, and the re-tiering it enables | *A list that imported as `contact_only` re-tiers on its notes, and the report says which rows moved and on what sentence* |
| **7** | **§6 — `guardDraft`**, widened by one field, with the size and bedroom tests | *The §6.2 measurements, permanently, as tests* |
| **8** | F5, drafted. **Not submitted, not sent.** The template text of §4.3 into `legal/modelos/`, for the same human submission path as 02's | *`§1.3`'s checklist passes on paper* |

`probe:listings` sits outside this list. It needs authorisation to write five
rows to ZZ TEST, and the reason to spend it arrives at step 3 — when something
finally reads `matchableListings` and the exclusion stops being theoretical.

---

# 10. What this document does not close

**Calibration.** `§4.6` is unchanged and unchangeable from here: no threshold in
this document is a number, every one of them lives in
`client_automations.config`, and **the method is half an hour with a real agent
over ~20 real leads and 3 real listings.** The triage floor changes the economics
of that conversation in our favour — an agent triaging a real listing *is* the
calibration session, and step 5 of §2.1 records their reasons as they go — but it
does not remove it.

**The data problem behind the pause.** Six inbound messages in the database, one
real conversation, no strength language in it. Everything in §1 was found by
running the code against invented sentences, which proves the code and not the
matching. That distinction is `§4.6`'s and it still holds.

**§3.18.** The declaration conversation has still never happened with anybody,
and until it does the gate correctly refuses every real contact — so §3.2 has no
audience and F5 has no one to send to. The triage floor is deliberately built on
the side of that gate where it does not bite: **the agent is not a lead, and
telling an agency about its own contacts requires no consent from them.**

⚖️ **Two for the lawyer**, alongside the `§6.1` questions already sent: the
drafting/facilitation question in §5.4, and the WhatsApp-history import in §3.3.
Neither blocks steps 1–7.
