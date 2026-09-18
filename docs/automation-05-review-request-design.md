# Automation 05 — Post-Close Review Request

**19 September 2026.** Design. Nothing built.

> Supersedes the catalogue line *"Post-Close Reputation & Referral Loop"*, which
> named four different acts and promised one the system is built to refuse. §1
> says which is which.

---

# 0. What this is

**A fairness obligation.**

Not "get more reviews". The product is **ask everyone, without choosing** —
which is at once the compliance requirement (§8.B: *pedir a todos é permitido;
escolher a quem pedir não é*) and the only part that is hard. An agency doing
this by hand will never do it, and not from malice: asking the client who
shouted at you is not a thing people do.

The automation exists to remove the choice.

That has a consequence worth seeing before anything is designed:

> **Once the decision about whom to ask is removed, there is almost no logic
> left in the middle.** What remains is *who closed*, *when*, and *did we ask*.
> Two of those three did not exist in the system a week ago, and the third is
> the codebase's first positive obligation.

So this is a small automation with one genuinely new idea in it (§5), sitting on
machinery 02 already built.

---

# 1. What it is, and the three things it is not

The catalogue name contains four acts. They have four audiences and four sets of
rules, and only one of them is this automation.

| Act | Audience | Governed by | Verdict |
|---|---|---|---|
| **Public review** | everyone who closed, without exception | §8.B + Acção II | **This is 05** |
| **Testimonial** | the same people | not platform policy — it is *permission to publish somebody's words and name* | Not an automation. A **record**, shaped like the exemption declaration |
| **Referral** | nominally the same people; the deliverable is **a third party's number** | RGPD. The friend consented to nothing | **Already refused, structurally** |
| **Stay in touch** | past clients | Acção II | **Already built. It is 02** |

## 1.1 Stay-in-touch is Automation 02, shipped

Not *similar to*. It is 02's segment A template, live in the library:

> *Olá {{1}}, fala a {{2}} da {{3}}. Já passou algum tempo desde que tratámos da
> sua casa em {{4}} e lembrei-me de si…*

That is a past client being kept warm. If 05 claims it too, it is one job sold
twice — the defect `0027` corrected in 04's seeded description, arriving again
from the same source, which is a catalogue line written before the automations
were designed.

## 1.2 Referral is the piece already decided against

A referred contact arrives with no documented origin. That is segment D, which
the system refuses to contact **even when the client insists** (§5.2), and 02
§11 makes the refusal structural rather than a matter of taste.

So a referral loop built honestly terminates in a screen saying *we cannot
message this person*, and built dishonestly it is the Idealista row with better
manners.

> The tell was in the catalogue the whole time. **"Referral" appears in two of
> five automation names — 02 and 05 — and is built in neither.** A word that
> appears twice and exists nowhere is a word, not a mechanism. Both descriptions
> are being corrected rather than carried.

## 1.3 The testimonial is a permission, not a message

Asking someone whether we may quote them is a different act from asking them to
review us publicly: the output is not a review, it is a **licence** — their
words, their name, our use of both. That is the shape of the exemption
declaration in 04: a person identified, a statement in their own words, a date,
and a record of who recorded it.

**Out of scope for v1**, named so it is not lost. It must never be bundled into
the review ask, because a message that asks two things gets one answer and
nobody can tell which.

---

# 2. 🔴 The contradiction, written down before somebody discovers it

This is the most important sentence in the automation.

> **"Everyone" means everyone we may lawfully message.**
>
> **The exclusions are never about sentiment, and the reason for each one is
> already in the gate's refusal record.**

Here is why it has to be written down. The gate refuses segment D, segment E,
suppressed contacts and unresolvable jurisdictions. So the people asked will
**always be fewer** than the people who closed.

Somebody — an operator, an agency, a future engineer — will see a review list
shorter than a sales list and read the difference as a bug.

**It is not a bug, and closing it is the offence.** The gap is the gate doing its
job. Any change that narrows it is either sending to someone we may not send to,
or it is choosing.

Two structural defences, because a sentence in a document is not a defence:

1. **The screen states the gap rather than hiding it.** The count of closes, the
   count asked, and the count refused **with each reason**, on the same screen.
   A discrepancy that is displayed and explained does not get investigated as a
   defect.
2. **The reason vocabulary is closed and cannot express a judgement** (§5.2). To
   skip somebody on sentiment you would have to add a value to a CHECK
   constraint, which is a migration and a reviewer, not a checkbox.

---

# 3. The trigger — a close, and it carries who

Nothing in the system records that a sale completed. Three near-misses:

| Source | Knows | Missing |
|---|---|---|
| `listings.status = 'sold'` + `status_changed_at` | that *a property* sold, and when | **who** |
| `consent_events` segment `'A'` | that *a person* transacted | when, which property |
| `leads.stage = 'won'` | — | nothing writes it. Verified: the only literal stage writes are the import's `'dormant'` and the Concierge's `'new'` |

## 3.1 The first one is most of the way there

03 already ingests *"A-1042 vendido"* over WhatsApp, sets the status and stamps
`status_changed_at` — **and the agent has an independent reason to send it**,
because it takes the listing out of matching. The system already learns that a
sale closed and when, through a message somebody is already motivated to send.

What it does not learn is **who**, and that gap is structural rather than an
oversight: `listings` has no owner column, and `listing_matches` — the only table
joining a property to a person — stops its outcome vocabulary at `lead_replied`.
There is no `lead_bought_it`. Neither party to a sale is derivable.

## 3.2 The party is declared, never inferred

**Which party gets asked is the agency's answer, not a rule we pick.**

A closed sale has two parties, and which of them the agency has a relationship
with varies by sale: sometimes the seller they have known for years, sometimes
the buyer they spent three months with. Asking both doubles volume against a
spike rule for no gain, and asking the wrong one produces a review from somebody
with nothing to say.

> **The trigger carries who. If the agent does not say, nothing is asked.**

Consistent with everything else here: the system proposes nothing about a person
it was not told about — the same rule as `listings.region` in 04, where deciding
a region applies a legal requirement or removes one and a string match producing
a legal conclusion is a guess with a citation attached.

## 3.3 ⚠️ And the silence must be RECORDED, not merely observed

This is the requirement that falls out of §5 and is easy to miss.

If "the agent did not say who" produces **nothing** — no row, no state — then
honest silence and a defect look identical, and the check in §5 cannot tell them
apart. So:

> **`party_not_named` is a disposition, not an absence.** The close is recorded,
> the system asks the agent who, and the answer — including no answer — is part
> of the record.

The intake posture is 03's, unchanged: *an unrecognised phrase returns null and
the message is answered with a question, never guessed at.*

## 3.4 Reporting a close is also a segment declaration

A party to a completed transaction is segment A by definition — *cliente que
concretizou transacção com a agência*. But per §5.1 the classification is
**declared by the agency, never inferred by the system**, and is recorded with
date, time and the identity of whoever made it (`0024`).

So the close report carries a declaration, and it must be stored as one: through
`consent_events`, with an author, rather than as a field somewhere that happens
to imply a lawful basis. **A basis that arrives as a side effect of a status
message is a basis nobody declared.**

## 3.5 Shape (proposal, not a migration)

```
closes
  id, client_id
  listing_id            nullable — a sale may be of a property never in the system
  party_lead_id         NULL until the agency says who
  party_role            'buyer' | 'seller'          -- declared, never inferred
  closed_on             date
  reported_by, reported_at, source ('whatsapp' | 'cockpit'), raw_message
  agent_asked_who_at    when we asked; null if we have not
```

**No disposition column.** See §5.3 — it is derived, and the reason is rule 13.

---

# 4. The ask

## 4.1 Three days after the close, as a judgement

Too soon and the transaction is not finished in the client's mind — the deed is
signed, the keys are not handed over, and a review of an incomplete experience is
worse for everyone. Too late and it reads as a mailing rather than a follow-up.

**Three days**, and stated as a guess in the §4.6 sense rather than a finding:
it decides how promptly somebody is asked a question they may ignore. It reaches
nobody who has not consented and publishes nothing. Different blast radius,
different treatment — the same reasoning as `WARN_WITHIN_DAYS`.

## 4.2 Once. No reminder.

02 allows three touches. This gets one.

- A second ask to somebody who chose not to review is pressure, and pressure is
  the neighbourhood of a banned practice even where this specific form is not
  named.
- It raises the chance of a review written out of irritation, which is a worse
  outcome than no review.
- The three-touch budget on a segment A contact is better spent on 02's
  reactivation, which has something to offer them.

Recorded in §12 as a decision against commercial interest.

## 4.3 A deadline, after which it is recorded as not asked

Pacing can defer the ask: a contact touched by 02 this week cannot be touched
again, and the daily cap is thirty. Deferral is correct. **Indefinite deferral is
not**, because an ask three weeks after completion is worse than none.

> **Fourteen days after the close, the ask expires and the close is recorded as
> `window_expired`.** A judgement, on the same footing as the three days.

This keeps the accounting in §5 complete: every close resolves, and none sits
pending forever waiting for a slot that will never come.

## 4.4 Volume, honestly

§8.B's spike rule matters to a high-volume operation. **At a boutique agency's
volumes — a handful of sales a month — the backfill ban in §6 satisfies it on
its own**, and spreading three messages across a week is theatre.

So: no distribution mechanism in v1, the constraint recorded, and a note that an
agency whose closes ever exceed a few a week needs the question reopened before
they are onboarded. Building a rate-shaper now would be designing for a client
we do not have, against a rule the ban already satisfies.

---

# 5. 🔴 The positive obligation

**Every check in this codebase is shaped to stop something.** No send without a
ledger row. No publication without a certificate. No match on a sold listing.
They refuse, and refusal is the whole grammar.

§8.B requires the opposite: **do not fail to ask somebody.** A refusal-shaped
machine cannot express "you skipped a person", because there is nothing to
refuse — the omission has already happened and blocking a send does not repair
it.

## 5.1 It is a reconciliation, not an invariant

An invariant asserts a property of every row and stops the thing that would
violate it. There is nothing here to stop.

A **reconciliation** takes two records, accounts for every row in one against the
other, and hands what it cannot account for to a human. That is exactly this
shape, and the codebase already knows how to do it: `reconcile.ts` matches sends
against the provider, **never re-dispatches**, and escalates what it cannot
resolve. Same posture, different pair.

> **Closes on one side, dispositions on the other. The residue is the finding.**

## 5.2 Every close resolves to exactly one disposition

| Disposition | Means |
|---|---|
| `pending` | inside the three days, or deferred and still inside the fourteen |
| `asked` | **a send row exists**, with a provider message id |
| `not_asked` | with a reason, from the closed list below |
| **`unaccounted`** | none of the above. **This set must always be empty** |

`unaccounted` is the finding. It is the only output of this check that means
anything, and it is the reason the check exists.

**The reason vocabulary is closed, and no member of it can express a judgement
about the person:**

```
party_not_named      the agency was asked who and has not said
gate_refused         carries the gate's own refusal and layer, unchanged
window_expired       §4.3 — could not be asked inside fourteen days
agency_disabled      the agency has 05 switched off entirely (§6.2)
no_review_destination the agency has no review link recorded (§7.2)
```

> ⚠️ **There is deliberately no value meaning "we chose not to ask this one".**
> To skip somebody on sentiment you would have to add one — which is a migration
> and a reviewer, not a checkbox. That is the structural defence of §2, and it
> is the same technique as `0025`'s outcome vocabulary, where the words
> available decide what can be recorded.

## 5.3 The disposition is DERIVED, never stored

Rule 13: **check the artefact, not the execution status.**

A stored `asked = true` is a claim about a code path. This codebase has eighteen
recorded instances of something reporting success while the underlying thing
failed, and a review ask that reports "asked" with no message on the wire is
exactly that failure in a feature whose entire purpose is not skipping people.

So the disposition is computed at read time from: `party_lead_id`, `closed_on`,
the **send row** (artefact), and the **refusal row** the gate wrote.

This makes a requirement of the build: **a refusal must leave a row naming the
close.** 02's send path already refuses rather than filters — `pacing.ts`: *"A
FILTER REMOVES SOMEBODY SILENTLY. A REFUSAL LEAVES A ROW SAYING WHY"* — so the
mechanism exists. What 05 adds is that the close id travels with it.

## 5.4 ⚠️ What this check can and cannot see

On the screen, not in a footnote — lesson 5k, where an empty list reads as
"nothing is wrong" when what is true is "nothing was looked at".

**It can see:** closes reported to it; asks sent; refusals recorded.

**It cannot see:** sales nobody reported; whether a review was ever written;
whether the agency asked somebody by hand; whether the message was read.

> **Therefore: this check proves we did not skip anybody we were told about. It
> cannot prove the agency did not skip somebody by not telling us.**

That sentence goes on the screen. An empty `unaccounted` list means *nothing was
skipped among what we know*, and presenting it as *nothing was skipped* would be
the system making a claim about the agency's sales from a count of its own rows
— §5j, and the most tempting overstatement in the feature.

---

# 6. Two rules that are not configurable

## 6.1 No backfill, ever

An agency onboarding with two hundred past sales is **exactly** the volume
pattern §8.B says is flagged as manipulation *independentemente da intenção*. A
backfill is also a burst of business-initiated messages to contacts whose last
interaction was months ago, which is the pattern the quality rating punishes.

> **05 fires only on closes reported after the agency starts.** Not "by default".
> There is no import path, no date-range option and no operator override.

Commercial consequence, to be said on a sales call rather than discovered: **05
is worth nothing in its first weeks.** An agency closing two sales a month has
two asks in month one.

## 6.2 An agency may switch 05 off entirely. Never for one sale.

Whole-agency: legitimate. They stop using the feature, every close records
`agency_disabled`, and the record shows a policy rather than a pattern.

Per-sale: **that is review gating with extra steps.** A skip button in the
cockpit is the offence with an audit trail showing who committed it, which is
worse than the offence alone.

The design refuses to have the control. Not "requires a reason" — **does not
exist**, so that there is no field for somebody to fill in convincingly.

---

# 7. The message and the destination

## 7.1 The template

Constraints stack from three directions and the intersection is narrow.

**Meta:** an approved template (a close produces no inbound message, so there is
no 24-hour window to ride); ≤1024 characters; mandatory opt-out footer; no
newlines in variables; contiguous `{{n}}` from 1; and category **marketing**,
not utility — 02 §11 refuses marketing content dressed as a utility template and
the penalty for category misuse lands on the client.

**Google:** neutral wording; no indication of what to write; no request to
mention a member of staff; no incentive of any kind.

> One distinction to keep sharp, because it is the kind that gets flattened: the
> ban is on asking the **customer** to name a member of staff in their review.
> The message may still say who is writing — *"fala a {{2}}"* — exactly as every
> other template does.

**Draft, Portuguese, for submission with a lawyer's confirmation and not before:**

> Olá {{1}}, fala a {{2}} da {{3}}. Obrigado pela confiança ao longo deste
> processo. Se quiser deixar a sua opinião sobre a experiência, pode fazê-lo
> aqui: [link]. Fica inteiramente ao seu critério, e qualquer opinião é útil.
>
> Para deixar de receber mensagens, responda SAIR.

*"Qualquer opinião é útil"* is doing real work: it says on the face of the
message that we are not asking only for praise. It is the posture of §8.B stated
to the person rather than only to a regulator, and it is the sentence to defend
if the wording is ever questioned.

**The link is static in the body, not a variable.** Each agency has its own
template anyway (02 §3.3), the link never changes for that agency, and a template
whose variable is a URL invites a rejection and raises variable density against
Meta's ratio. Three variables, no URL parameter.

## 7.2 Where the review goes

A Google Business Profile review link, **stored per agency**. No such column
exists anywhere today.

**An agency with no Google Business Profile cannot run 05.** Not a degraded mode
— there is nowhere to send anybody. Every close records
`no_review_destination`, which is the honest output and is visible rather than
silent.

Other destinations — a portal, Facebook — are out of scope, and would need their
own policy analysis before a line of code, the same posture §8.A.3 takes for
jurisdictions. **Google's rules are Google's**, and nothing here generalises to a
platform we have not read.

## 7.3 AI disclosure

The ask is a fixed approved template, not a conversation with a model, so Article
50 does not attach to it. A **reply** lands in the Concierge, which already
declares. One line, and nothing new to build.

---

# 8. What it reuses, and what is genuinely its own

**Reused whole:** the five-layer gate; the consent ledger and segments; the
jurisdiction policy table; the template record with its frozen body and approval
id; the send record, the permit and idempotency; the quality halt; pacing;
reconciliation's *shape*; suppression and opt-out; 03's notification pattern and
the cockpit screen conventions; 04's "jurisdiction as data" pattern — though
none of its data, because these are a platform's rules and not a country's.

**Genuinely its own, and this is the whole build:**

1. **The close event** (§3) — including the fact that it carries a party and a
   declaration
2. **The omission reconciliation** (§5) — the first positive obligation here
3. **The review destination** (§7.2)
4. **The template** (§7.1)

Four things, one of which is interesting.

---

# 9. What gates this

| Gate | Blocks | Held by |
|---|---|---|
| 🔴 **Does segment A's basis carry a review request?** | **what gets built** | a lawyer. Drafted as question 1 of `legal/fonte/nota-questoes-automacao-05.md` |
| Meta verification + template approval | sending anything | the same gate as 02 |
| The close report | usefulness, not construction | the agency |

## 9.1 The first one is not a detail

05's audience is *definitionally* segment A. Segment A's lawful basis is the
existing-customer exception, which in its usual form covers marketing of
**similar products or services** to one's own customers. **A review request is
not a product or a service.**

If the exception does not carry it, 05 reaches only contacts holding documented
consent (segment B) — a far smaller audience and a materially different product.
That is not a thing to discover after building.

## 9.2 What can be built before any of it

**Everything except the send**, the way 04 was built entirely around its refusal:
the close intake and its `party_not_named` path, the disposition model, the
reconciliation, the cockpit screen, the template drafts. None of it can send —
the same property 02's build order relied on, where the table has no audience and
the renderer returns a string.

## 9.3 And the agency dependency, said plainly

**05's build can move. 05's usefulness is gated on the same habit that gates 03**
— somebody at the agency telling the system what happened.

It is a smaller ask than 03's calibration afternoon: one message per sale, which
an agent may already be sending because it takes the listing out of matching.
But it is the same class of dependency, and an automation whose trigger is a
manual step fires late, inconsistently, or not at all.

---

# 10. Build order

1. **`closes`** — the table, the party declaration through `consent_events` with
   an author, and the `party_not_named` path. Nothing reads it yet.
2. **The disposition function** — pure, derived, with the closed reason
   vocabulary. Tested against every state including `unaccounted`.
3. **The omission reconciliation** — closes against sends and refusals, with
   what-it-cannot-see in its own return value rather than in a comment.
4. **The cockpit screen** — the three counts side by side (§2), the limits
   stated on it (§5.4), and no skip control (§6.2).
5. **The review destination** — per-agency, and the `no_review_destination`
   refusal.
6. **The template drafts** — Portuguese first, held for the lawyer.
7. *Gated:* submission, approval tracking, and the send.

Steps 1–6 contain no route to a dispatcher.

---

# 11. What we will not build

- **Sentiment screening in any form**, including anything that looks like a
  survey before the ask
- **A per-sale skip**, however it is labelled (§6.2)
- **Incentives**, including for honest reviews rather than positive ones — the
  ban covers both
- **Reminders** (§4.2)
- **Backfill** (§6.1)
- **Review-response drafting.** A different product with a different risk
  surface, and not this automation
- 🔴 **Any record of which review came from which ask.** We could not build it
  today — we do not read Google — but the refusal is recorded here **because
  that dataset is precisely what gating requires.** A table joining a person to
  the sentiment of their review makes "stop asking people like that one" a
  half-day feature request with the data already sitting there. Not collecting
  it is the structural refusal, and it is cheaper to refuse now than to delete
  later.

---

# 12. Decisions taken against commercial interest

Recorded, as §11 of the Enquadramento records them, because they are the most
demonstrative part of the posture.

| Decision | Cost |
|---|---|
| Ask everyone, no screening | Produces negative reviews a screen would have avoided |
| One ask, no reminder | Fewer reviews than a sequence would produce |
| No backfill | 05 is worth almost nothing in an agency's first weeks |
| No per-sale skip | The agency will ask for it, and the answer is no |
| No review-to-person record | Forgoes "which clients review well" analytics permanently |
| Nothing asked when the party is not named | An automation that declines to act on incomplete information does less |
