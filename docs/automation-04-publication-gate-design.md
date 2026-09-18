# Automation 04 — the publication gate

**Design · 18 September 2026 · nothing in this document has been built**

> **04 is not a content generator. It is a publication gate.** A property may not
> be advertised publicly unless it is lawful to advertise it; then a piece is
> prepared; then a person at the agency publishes it.
>
> The boundary in §2 is designed first and deliberately, because it is the thing
> that would look correct from every angle while being wrong: a path that
> satisfies the consent gate and never sees the advertising gate.

---

# 0. What this document decides

| | Decision |
|---|---|
| **What 04 is** | The gate, the standing re-check, and a prepared piece a human publishes |
| **What 04 is not** | Listing copy as a product (7 Sep, unchanged), and the alerting of interested buyers — **that is 03, built** |
| **The boundary** | Who the message goes to and which law governs it. 03 is private and permissioned under GDPR; 04 is public advertising under IMPIC and ADENE |
| **Where it publishes** | **Nowhere, by us.** Draft-for-a-human, the same pattern as 03's agent draft |
| **Two gates** | Consent asks about the *recipient*; publication asks about the *property*. **A message naming both needs both**, and neither stands in for the other (§2) |
| **Portugal only** | §8.A.3 — Spain requires its own analysis before service there |
| **Built first** | §2's boundary, as a test over the code that exists TODAY |

**Open and not decided here:** the two questions in
`legal/fonte/nota-questoes-automacao-04.md`. Neither blocks the build; the first
blocks *submitting 03's templates*.

---

# 1. The boundary, and why the seeded row is wrong

`automations.description` for `listing_launch` reads:

> *"On a new mandate: listing copy, social, email blast and launch checklist"*

Two of those four are gone. **The copy** was re-scoped on 7 September — *a
wrapper around something an agent can increasingly get free from a chat window*.
**The blast to interested buyers is Automation 03**, and it is built: F2 ingests
the listing, F3 scores every lead, F4 tells the agent who and why. A second
automation claiming it is one job sold twice.

**Correct the row, do not build to it.** A `0027` that updates the description —
it is a string, not a schema change, and it costs nothing to get right before
anyone reads it as a specification.

The line that survives is not "new listing" versus "old listing". It is:

| | 03 | 04 |
|---|---|---|
| Audience | People who **contacted the agency** and said what they want | **The public** |
| Shape | Private, targeted, one-to-one | Advertising, one-to-many |
| Law | GDPR, ePrivacy, Meta's messaging policy | **IMPIC, ADENE — advertising law** (§8.A) |
| Fails by | Messaging someone with no lawful basis | **Publishing an unlawful advertisement** |
| Penalty lands on | The client (a complaint, a blocked number) | The client (€250–€3,741) |

Different audience, different law, different failure. That is a real line, and
everything the two share sits below it in infrastructure rather than in purpose.

---

# 2. 🔴 THE TWO GATES, AND WHY ONE CANNOT STAND IN FOR THE OTHER

**Designed first because it is the failure that looks correct.**

02's architecture rests on one sentence: *the gate is the only route to a send.*
Adding a second gate breaks the sentence — there are now two, with different
rules, answering different questions — and the new failure mode is a path routed
through the wrong one. **A lead-facing message about a specific property that
satisfies consent, jurisdiction and suppression perfectly, and never asks
whether the property may lawfully be advertised at all.** Every existing check
passes. The send record is impeccable. The invariants hold.

## 2.1 The rule

> **The consent gate asks about the RECIPIENT. The publication gate asks about
> the PROPERTY. A message that names both needs both, and neither is evidence
> of the other.**

They are not two halves of one question, and they are not ordered: a property
with no energy certificate cannot be advertised to a fully consented contact,
and a perfectly documented property cannot be advertised to somebody who
objected.

## 2.2 Which path needs which — the table that makes it concrete

| Path | Names a person | Names a property, outside the agency | Consent gate | Publication gate |
|---|---|---|---|---|
| The matching run (F3) | no — internal | no | **no** | **no** |
| Agent notification (F4) | the agent | no — *the agency's own property, to the agency* | no (their own window) | **no** |
| Lead-facing send (F5) | yes | **yes** | **YES** | **YES** ⚖️ pending Q1 |
| A prepared public piece (04) | no | **yes** | no — there is no recipient | **YES** |

Two things fall out of this table that were not obvious before it was drawn:

**F4 needs neither gate**, and that is correct rather than an oversight. Telling
an agency about its own property is not advertising, and the agent opened the
window themselves.

**F5 needs both, and F5 is not built.** So the cost of getting this right is
zero today and rises the moment it is. That is the strongest argument for
designing this section before anything else in 04.

## 2.3 Three mechanisms, at three distances

The same shape as the send path's §2, because the same argument applies: an
ordering that is correct and undefended is one edit from being destroyed.

### Compile time — a plan that names a property cannot be built without a clearance

`PublicationClearance` is a class with a **private constructor**, created only by
the publication gate. `SendPlan` becomes a discriminated union:

```ts
type SendPlan =
  | { names: 'nobody'; to: string; body: string; template: string }
  | { names: 'property'; to: string; body: string; template: string
      listingId: string
      clearance: PublicationClearance }   // ← only the gate can make one
```

A caller who wants to send a message about a property and has not cleared the
property **has nothing to put in the field**. It is not discouraged; it does not
typecheck.

### Runtime — the dispatcher re-reads the clearance, because a cast defeats a type

`dispatch()` already re-reads the send row rather than trusting the permit. It
gains the same treatment for the clearance: read the row, and refuse if it does
not exist, does not match this listing, or **has since expired** (§4 — a
certificate has a date, so a clearance has a shelf life).

### Checkable — one module reads listing facts for a send, and a test names any other

The strongest of the three and the cheapest, exactly as `one-sender.test.ts` is:

```
tests/two-gates.test.ts
  - the listings table is read for send purposes in exactly ONE file
  - PublicationClearance is constructed in exactly ONE file, and it is the gate
  - the send path does not read energy_class, ami_licence or listings directly
  - and the POSITIVE half: the gate module DOES read them, or this is a
    boundary around something that no longer happens
```

> **Write this test BEFORE any 04 code**, against the paths that exist today. It
> should pass immediately — nothing currently sends about a property — and it
> will fail the day F5 is built the wrong way, with a filename. That is the only
> version of this that survives somebody who has not read this document.

## 2.4 What must never be built, named so the reasonable version is refused

- **A combined `mayWeSendThis()`** that returns one boolean. Two questions, one
  answer, and the caller cannot tell which half refused.
- **A publication check inside `decideGate`.** It has no listing and no business
  acquiring one; the moment it takes a listing id, every consent decision starts
  depending on property data.
- **A "the operator already checked" flag.** That is the 2am fallback, and it is
  the thing the whole mechanism exists to make unnecessary.

---

# 3. The publication gate

Pure, like `decideGate`, and for the same reason: the part worth proving is the
decision, and a decision that needs a database is tested one layer at a time.

## 3.1 The checks, in order, cheapest and most absolute first

| # | Check | Refusal |
|---|---|---|
| 1 | The listing is `available` | `not_on_the_market` |
| 2 | **Energy class recorded**, or an exemption declared (§3.3) | `no_energy_class` |
| 3 | **The certificate has not expired** | `certificate_expired` |
| 4 | **The client has an AMI licence number** | `no_ami_licence` |
| 5 | Price and features are present **and came from the agency** | `not_from_the_agency` |

Ordered so that a refusal names the first thing wrong rather than the last, and
so a property that is not even on the market is refused before anybody's
certificate is looked up.

**Check 5 is §8.A's own sentence and is easy to under-read.** *"A automação não
gera características, preços ou disponibilidades."* It is not a data-quality
check — it is a provenance check. A price that the system computed, rounded,
converted or inferred is not the agency's price, and publishing it is the
system making a claim about somebody else's property.

## 3.2 The verdict is never a boolean

A permission carries the energy class, the certificate number, its expiry, the
AMI number, and the moment it was decided — **because those are the facts that
have to appear in the published piece**, and re-reading them later is how a
piece is published carrying a different certificate from the one that cleared
it. A refusal carries which check refused and wording a human can act on.

## 3.3 ⚖️ Exemption is a DECLARATION, not a checkbox

Not every building is subject to certification. We do not know the exact scope
and it is question 2 to the lawyer. But the design consequence is clear either
way, and it is the same shape the segmentation screen already uses:

- **Ignore exemptions** → a legitimately exempt property can never be published
  through us, and the agency routes around the system. Worse than not having it.
- **A simple `exempt` checkbox** → it becomes the door everything goes through,
  and the obligation has no practical effect.
- **A declaration** → a named person at the agency, a basis in their own words,
  a date. The system does not qualify the exemption; it records who invoked it
  and on what ground. **That record is what answers an IMPIC inspection**, and
  it is the same artefact `consent_events` provides for a different regulator.

The declaration is recorded whether or not the lawyer confirms the categories —
and if the answer is that there are no exemptions, the mechanism is deleted
rather than left as an unused escape hatch.

---

# 4. Publication is a state, not a moment — and we cannot undo it

A certificate expires. **A listing lawfully published in March is unlawfully
published in December with no data having changed and nobody having acted.**
This is the obligation-staleness shape from the send path, and it needs the same
treatment: a scheduled check over everything currently prepared or published,
not a check at the moment of preparing.

## 4.1 And the honest limit that follows from draft-for-a-human

**We cannot withdraw a post we did not publish.** Choosing not to hold the
client's credentials — §5 — means the gate can prevent a publication and cannot
reverse one.

So the re-check produces **a notice, not an action**: the operator is alerted,
the agency is told which piece is now non-compliant and why, and *the fact that
they were told* is recorded. That record is the whole of what we can offer, and
it should be sold as exactly that and not as more.

> This is the first place where draft-for-a-human costs something real. It is
> still the right trade — a publishing mistake under their brand on the platform
> the Concierge runs on is not recoverable either — but the cost is named here
> rather than discovered when a certificate lapses.

## 4.2 The invariant

§8.A specifies one, and it belongs in the project's own invariant set, checked
on every run and alerted:

> **No prepared piece exists without an energy class (or a declared exemption)
> and an AMI number.**

Checked **on the artefact** — the text that would be published — and not on the
intention. The distinction is rule 13 and it has already cost this project
eighteen recorded instances.

---

# 5. The prepared piece

What 04 produces: the text, the facts, and the mandatory mentions, ready for a
person at the agency to publish wherever they publish.

**Assembled, not generated.** Features, price and availability come from the
listing; the mandatory mentions come from the clearance. A model may *phrase*
what the agency supplied — it may not add a fact. That is E4's rule and
`guardDraft`'s mechanism: no figure that is not the listing's own, with the
known set of exactly one field, for the reason measured on 18 September.

**The mandatory mentions are not a footer somebody can trim.** They are part of
the piece, and the invariant is checked on the assembled text.

## 5.1 Surfaces, and why none of them is ours

| Surface | Decision |
|---|---|
| **Portals** — Idealista, Imovirtual, Casa Sapo | **Out.** Contracted API access usually mediated by the CRM; the one place we would compete head-on with Inmovilla rather than against inertia; and the agency already does this daily |
| **The agency's website** | **Out.** No standard, bespoke per client. Consultancy, not a product |
| **Instagram / Facebook** | **Deferred, with a named trigger.** Technically reachable through the client's own verified portfolio — and a mistake there does not cost a post, it risks the WhatsApp asset every other automation runs on. One Meta account has already been disabled with no appeal. Revisit only on a client's own explicit instruction, with their own portfolio |
| **WhatsApp** | **Already spoken for** by 02 and 03 — and per question 1 it may itself be an advertisement |

---

# 6. Data model

```
listings                                 -- additions
  energy_class                    text   -- A+ … F
  energy_certificate_number       text
  energy_certificate_expires_at   date
  energy_exemption                jsonb  -- { declared_by, basis, at } or null
  check: exemption names its author and its basis

clients                                  -- addition
  ami_licence                     text

publication_clearances                   -- the artefact that answers IMPIC
  id, client_id, listing_id
  verdict                  cleared | refused
  refusal_reason                          -- one of §3.1, null when cleared
  energy_class, certificate_number, certificate_expires_at, ami_licence
                                          -- SNAPSHOT. what was true when cleared
  exemption_basis, exemption_declared_by  -- when cleared by declaration
  decided_at, decided_by
  FROZEN once written

launch_pieces
  id, client_id, listing_id, clearance_id
  body                                    -- the assembled text, frozen
  prepared_at, prepared_by
  published_by, published_at              -- what the AGENCY told us they did
  withdrawn_notice_sent_at                -- §4.1: the notice, not the act
```

**`published_at` is the agency's report of their own act, not our record of
ours.** It must be named so nobody later reads it as proof that a publication
happened — the same discipline as `agent_notified_at` rather than `notified_at`.

**Migration notes:** read `0002` before writing either — the `service_role`
grant issue has bitten twice, and the check is a round trip through PostgREST.
Non-partial unique indexes only where `ON CONFLICT` is used (`42P10`, twice).

---

# 7. What it inherits, and what is genuinely its own

**From 03, and it is substantial:** the `listings` table and its WhatsApp
ingest, the parser with its two hard-won defects, the status lifecycle where
only `available` matches — and now, only `available` may be advertised — the
status-snapshot pattern, per-client configured areas, the screen conventions,
the vocabulary guard, `probe:layout`, `probe:controls`.

**From 02:** templates and approval tracking; the send record, `SendPermit`,
`dispatch`, `one-sender`, reconciliation; pacing and the quality halt;
`guardDraft`, which *is* the never-generated rule; the events table, the
invariant pattern and the alerting layers; the proof book for anything a
constraint has to be seen to refuse.

**⚠️ NOT inherited, though it looks like it should be: the gate.** `decideGate`
answers *may we message this person* from consent, jurisdiction and suppression.
§8.A asks *may this property be advertised at all* — a different question about
a different subject, with no person in it. 04 needs its own, and §2 exists so
that the two cannot be mistaken for each other.

**Genuinely 04's own:** the energy certificate and its expiry; the AMI number;
the publication gate and its invariant; the exemption declaration; the standing
re-check and the notice it can only send; the prepared piece; and the Spanish
analysis before Spain.

---

# 8. Order of work, and the gates

| | | Proof |
|---|---|---|
| **1** | **§2's boundary, as a test, against today's code.** Before any 04 code exists | *It passes today — nothing sends about a property — and fails with a filename the day F5 is built the wrong way* |
| **2** | `0027`: correct the `listing_launch` description. `0028`: the schema of §6 | *Applied and verified through PostgREST; each CHECK proven by trying to break it* |
| **3** | The gate, pure, with its five refusals | *Every refusal fires on a listing missing exactly one thing, and the neighbour — a complete listing — is cleared* |
| **4** | The exemption declaration and its screen | *A declaration with no author or no basis is refused by the database, not by the form* |
| **5** | The standing re-check and the notice | *A certificate aged past its expiry turns a cleared piece into a notice, and the notice is recorded as sent* |
| **6** | The prepared piece and the §4.2 invariant | *A piece assembled without the mandatory mentions cannot be written, and the invariant is checked on the text* |

**Steps 1–4 can be built today.** Step 6 depends on nothing external either —
the gate refuses everything until a client has an AMI number and a listing has a
certificate, which is the same honest first output as 03's.

---

# 9. What this document does not close

**The two lawyer questions** — `legal/fonte/nota-questoes-automacao-04.md`.
Question 1 does not block 04; it blocks *submitting 03's templates*, and it is
cheap now and expensive after approval.

**Spain.** §8.A.3 and the findings register both say 04 cannot enter service
there without its own analysis. Portugal only, and it is a commercial constraint
rather than a technical one.

**Meta as a surface.** Deferred with a trigger, not refused forever: a client's
own explicit instruction, their own verified portfolio, and a Meta relationship
that has been stable for longer than it has been so far.

**And the commercial framing, recorded because it decides how this is sold:**
the gate and the checklist are thin priced alone. Their value in the bundle is
that an agency publishing through us **cannot publish an unlawful advertisement,
and the fine they have never thought about cannot reach them.** The copy is the
part a client will think they are buying, and it is the part worth least.
