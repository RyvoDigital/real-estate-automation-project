# The Concierge handoff contract

**Design · 18 September 2026 · nothing in this document has been built**

> A reply to a campaign message arrives at a Concierge that treats every inbound
> as a fresh lead. The cost is not a bad reply — it is a weekly report that
> tells a paying client something untrue, which is the only remaining gap that
> produces a false statement rather than a refusal.
>
> Working through question one found that the erasure is already happening, to
> contacts imported weeks ago, with no campaign involved at all. That is §1.
>
> **And the reason the discriminator is reliable, stated here because somebody
> will later propose a simpler one:** a contact who was sent a campaign message
> has a `sends` row, and because the record is written BEFORE the send (§3.10),
> that row necessarily exists before a reply can arrive. The rule adopted so a
> crash could not lose a send is what makes a reply attributable. Any cheaper
> discriminator — a reply gesture, a time window, a flag on the lead — is
> guessing at something already recorded.

---

# 1. THE DEFECT THAT IS ALREADY LIVE

`UpsertLead` runs on every inbound message and writes:

```js
const row = { client_id, phone, source: 'whatsapp', last_contact_at, updated_at }
if (!existing) { row.stage = 'new'; row.consent_status = 'unknown'; … }
```

`stage` and `consent_status` are set only for a new lead. **`source` is set
every time.**

So a contact imported from an agency's list — `source: 'import'` — becomes
`source: 'whatsapp'` the moment they send their first message. Their origin is
not lost at some future point when campaigns exist; **it is being overwritten
today**, and every imported lead who has ever replied already looks like an
organic WhatsApp enquiry.

That is the whole attribution problem in one line, arriving before the feature
that was supposed to cause it. Two consequences:

- **Attribution must never be derived from `leads.source`.** It is not a record
  of where a contact came from; it is a record of the last channel they used.
- **`UpsertLead` must stop overwriting it** — a one-line change to the workflow,
  and now the second reason for the n8n deploy that was already owed.

---

# 2. What distinguishes a campaign reply, and why it is on record before the reply

The Concierge sees a number and a body. WhatsApp can carry
`OriginalRepliedMessageSid` when somebody uses the *reply* gesture, and almost
nobody does — so it is present sometimes, absent usually, and useless as a
discriminator.

What is reliable is a row we already wrote:

> **A contact who was sent a campaign message has a `sends` row.** And because
> the record precedes the send (§3.10), that row necessarily exists before the
> reply can arrive. The ordering rule adopted so a crash could not lose a send
> turns out to be what makes a reply attributable at all.

Another instance of §12b — a property adopted for one reason paying for an
unrelated one — and worth noticing, because it means the discriminator needs no
new mechanism.

## 2.1 Two questions, two windows

| | question | rule |
|---|---|---|
| **Context** | should the Concierge be told this person was just messaged? | the last outbound to them was a campaign send **within 72 hours** |
| **Attribution** | which automation gets the credit for this conversation? | the first inbound after a campaign send attributes to that run, **however long it takes**, until a later campaign send supersedes it |

They are different because they are used differently. A greeting written for
somebody messaged this morning is wrong for somebody messaged three weeks ago;
a report that stops crediting a campaign after 72 hours is simply wrong.

### Why 72 hours, and not 24 or a week

**Not 24**, because the message was probably read on a phone, at a bad moment,
and answered when convenient. A reply on the morning after an evening message is
the most ordinary thing in the sequence, and a 24-hour context window would drop
exactly the replies the campaign was written to produce.

**Not a week**, because the pacing rule allows the next touch at seven days. A
context window that reached that far would still be describing message one while
message two was going out, and the Concierge would tell somebody about the wrong
message.

**72 hours** is past the weekend-shaped gap — Friday evening to Monday morning
is the longest ordinary delay a reactivation message meets — and comfortably
short of the next touch.

### What happens on day four, and it is deliberate

The reply still **attributes**: the campaign gets its credit, the report counts
it, the ledger and the send row are unchanged. What the Concierge does **not**
get is the context line.

That asymmetry is chosen rather than incidental. Context exists to stop the
model thanking somebody for getting in touch when we wrote to them, and to make
the *"quem é?"* path possible. Four days later, a person answering is much more
likely to be picking the conversation up deliberately than reacting to something
that arrived unexpectedly — and a greeting that says "you may remember we wrote
to you on Tuesday" is stale enough to read as a form letter.

So: **credit is permanent, context is perishable.** A report that forgot would
be wrong; a greeting that remembers too long is merely odd, and the cost of
those two mistakes is not comparable.

## 2.2 Attribution is RECORDED at arrival, never recomputed

*"Which send preceded this reply"* has a different answer after the next
campaign. So it is resolved once, when the inbound arrives, and stored on the
message: `messages.attributed_send_id` and `messages.attributed_run_id`.

§11b again: a record justifying a past decision copies what was mutable at the
time. Recomputing it later is how a report changes its mind about last month.

### It must never be NULL BY OMISSION

A null `attributed_send_id` means *"we looked and this contact had no campaign
send"*. It must never also mean *"the lookup failed"*, because those produce the
same row and the second one silently becomes an organic lead — **the source
overwrite of §1 arriving through a different door.**

So the attribution is a three-state fact, not a nullable id:

| `attribution_state` | meaning |
|---|---|
| `organic` | looked, and there was no preceding campaign send |
| `campaign` | looked, and here is the send and the run |
| `unknown` | **the lookup failed.** Not organic. Not campaign |

`unknown` is a loud state: it alerts, it is excluded from both figures in the
report rather than counted as organic, and the report says so — *"3 conversas
sem origem determinada"* — because a client reading a number that quietly
absorbed the failures is being told something we do not know.

The column is **NOT NULL defaulting to `unknown`**, and the default is the
point.

The first draft said *"NOT NULL with no default, so a writer cannot omit it"* —
which would have broken the live Concierge the day it was applied, because the
workflow inserts messages and knows nothing about this column. Caught by reading
the schema the workflow writes to rather than by reasoning about the one being
written.

The corrected rule is better than the original:

> **What matters is not that a writer cannot omit the field, but that omitting
> it yields the LOUD state rather than the quiet one.** A row inheriting
> `unknown` appears on its own line and alerts. A row inheriting `organic` would
> be a silent false claim. Default to the value that means *we did not look*,
> and an omission becomes a question instead of an answer.

---

# 3. Something sits between, and it is not a design preference

A campaign reply must **not** go straight to the Concierge, for a reason that
has nothing to do with tone:

> If the reply is an opt-out and the Concierge answers it, we have sent a
> message after an objection — the exact condition invariant 3 exists to catch,
> caused by us, one second after the person asked us to stop.

So the inbound path becomes:

```
1. inbound arrives
2. ATTRIBUTE      is there a sends row for this contact? record it on the message
3. OPT-OUT GATE   src/opt_out.js, which already exists
     opt_out    → record the objection, confirm once, DO NOT hand to the Concierge
     unclear    → halt, escalate to a human, DO NOT reply
     not_opt_out→ continue
4. CONCIERGE      with the context from step 2
```

Step 3 is `src/opt_out.js` doing the job it was built for, on the path it was
built for. It has been sitting unused since Tuesday because nothing inbound
called it.

**The `unclear` tier matters here more than anywhere.** "Pare" or "chega" in
reply to a reactivation message is far more likely to mean stop than the same
word mid-conversation, and the three-tier design already refuses to guess:
halt, escalate, record nothing.

## 3.1 What the Concierge is told, and what it must not conclude

A known fact, in the shape `known_facts.js` already uses:

> *This contact received a reactivation message on 22 September: "reactivação —
> cliente que transaccionou". They did not ask us today; we wrote to them.*

Three things follow that the model cannot infer:

- **The "quem é?" path exists** (spec §7) and is only possible with this
  context. Without it, "não conheço" reads as a cold lead's confusion rather
  than as somebody who was contacted out of the blue.
- **Do not thank them for getting in touch.** They did not get in touch.
- **The relationship is asymmetric**: we initiated, and the reply may be an
  answer to something they have half-forgotten.

## 3.2 The AI disclosure is unaffected, and correctly so

The predicate is *"has a disclosure ever been delivered to this recipient"*. A
campaign template is human-written, approved by Meta, and sent by a scheduler —
it is not an AI system interacting with a person, and it carries no disclosure.
The reply does come from the model, and the disclosure fires on it, which is
*"at the latest at the time of the first interaction"* with the AI. Checked
rather than assumed, because it is the kind of thing that looks like a gap.

---

# 4. The weekly report: counted once in each true place, and never summed

A reactivated contact who becomes a qualified lead is **genuinely both**. They
came from the agency's old list *and* they are a live enquiry. The failure is
not choosing wrongly between two boxes — it is having two boxes and a total.

```
Conversas recebidas                41
  das quais reactivações           12     ← replies attributed to a campaign

Contactos qualificados              9
  dos quais reactivados             4     ← in BOTH, deliberately

Reuniões marcadas                   3
  das quais de reactivação          1

Conversas sem origem determinada    0     ← never folded into either figure
```

> **A person is counted once in every category they genuinely belong to, and the
> report never sums categories that overlap.** The lie enters at the sum: "41
> conversations + 12 reactivations = 53 contacts" is false, and any headline
> figure that adds the two invites exactly that reading.

Three rules that follow:

1. **Reactivations are a SUBSET line, never a parallel one.** Indented under the
   figure they are part of, so the shape of the layout carries the logic.
2. **Nothing is described as "new"** unless it is a contact the agency had no
   record of. A reactivated contact is not new; they are returning, and the
   client knows that better than we do.
3. **The attribution shown is the stored one**, so last month's report still
   says what it said. A figure that changes when regenerated is not a report.

## 4.1 And the number that would have been wrong

Under today's behaviour — `leads.source` overwritten to `whatsapp` on reply — a
reactivated contact who converts appears as an organic WhatsApp lead. The
campaign that produced them shows nothing, and the Concierge shows a lead it did
not find.

**Both numbers in the client's report would be wrong, in opposite directions,
and the sum would be right.** That is the hardest kind of error to notice from
the outside.

---

# 5. What this needs

- `0023`: `messages.attributed_send_id` and `attributed_run_id`, with the
  `sends` foreign key. Recorded at arrival.
- **The n8n change**: stop overwriting `leads.source`; call the opt-out gate
  before composing; read the attribution into the prompt's known facts. This is
  a workflow deploy, done the way the disclosure deploy was — import, publish,
  restart, confirm 403, served-version query before sending a message.
- The report's query, which is the smallest piece and the one the client reads.

Nothing here is buildable without touching the live workflow, which makes it the
first piece since the disclosure that carries deploy risk rather than only build
risk. Worth doing in one deploy with the `consent_status` change already owed.
