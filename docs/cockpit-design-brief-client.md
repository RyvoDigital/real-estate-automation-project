# Cockpit design brief II — the client level

**Written 19 September 2026.** Second of two. `cockpit-design-brief.md` covers
the frame and the nine operator-level surfaces; this one covers everything
beneath a selected client.

Same discipline: **constraints, not layouts.** For each screen — the question,
every state it must carry, what the operator can and cannot do, the exact data
it reads, and what about it is legally load-bearing. 🔒 marks an arrangement
that is carrying meaning and is therefore not yours to change; everything
unmarked is.

**Order, per the instruction:** the contact record first, because it is Q14 and
nothing currently answers it. Then the presented-mode screens, because they
carry the second user. Then the rest.

**Everything in brief I's §0 and §1 applies here without restatement** — the
ten states, the universal contract, time, counts, attribution, error
boundaries, the defaults rule. This document adds only what is specific.

---

# §0. The one carry-over worth repeating

🔒 **Every client-level page states whose client it is, in its own words,
independently of the chrome.** Every standalone screen built so far already
prints the client name under its `h1`. That is not decoration and not
duplication — it is the guard that makes a switcher safe, and it is the only
thing standing between an operator and reading the right screen about the wrong
agency.

---

# §1. The contact record

**The screen that does not exist, and the one the product is sold on.**

## 1.1 The question

**Q13 — who is this person, what did they say, what did we send, and why?**
**Q14 — 🔴 why did this person *not* get the message?**

`campaign-evaluation-design.md` §5.1 states Q14 as canonical and notes that it
shares one query with its opposite: *"that is the same query behind 'why did
this person receive this message' and 'why did this person not' — one table, no
join anyone has to think about."* The table is `sends`. Nothing renders it.

## 1.2 🔴 Scoped to the contact, not the lead row

The durable identity beneath a client is `(client_id, phone_e164)`, not
`leads.id`:

| Evidence | |
|---|---|
| `consent_events` | keyed `(client_id, phone_e164)`; `lead_id` is *"a convenience link only"*. Indexed on `(client_id, phone_e164, recorded_at desc)` |
| `lib/suppression.ts` | reads through `consent_by_contact`, **never** `leads_consent` — *"an objection outlives the lead row that carried it, and asking the lead-shaped view would miss exactly the contacts who most need to be missed"* |
| `sends` | `phone_e164 not null`; `lead_id` is `on delete set null` |
| `messages` | `lead_id` is `on delete set null` |
| import | dedupes on the number |

**So a lead-scoped screen shows a person's history with the part that matters
most missing** — and specifically misses the case where it matters: a contact
whose lead row was reverted by an import undo, or deleted under §3.3's erasure
path, still has a ledger, still has refusals, and may still be objected.

**Address:** `/c/<client>/contacts/<phone>`.

🔒 Two mechanical constraints on that URL. The `+` of E.164 must survive
round-tripping (percent-encoded, never dropped or replaced by a space) — a
number that loses its `+` is a different number, and `lib/suppression.ts`'s
`syntacticE164` exists precisely because raw numbers arrive mangled. And a
number in a URL is personal data in a place that gets logged, pasted and
screenshotted: it is acceptable here because the operator already sees the
number on the page, but it must not appear in any analytics, error-reporting or
external request.

## 1.3 The panels, and what each is answering

One screen, seven regions. The order below is by question, not by layout.

| Region | Answers | Non-obvious constraint |
|---|---|---|
| **Identity** | who | Name comes from whichever lead row has one; a contact with no name is normal after an import and renders as the number, never as "Unknown" |
| **Consent ledger** | Q15, and *may we message them* | 🔒 Append-only, **shown as history, not as a current value**. Eight kinds (§1.5). A `declared` that superseded an earlier one reads *"declared A on Tuesday by Ana; re-declared D on Friday by Ana"* — the honest rendering of a mind changed |
| **Send history** | 🔴 **Q14** | Every row, `sent` and `refused` alike, each with its layer, reason, operator sentence and date. §1.4 |
| **Messages** | what was actually said | Inbound and outbound, with `attribution_state`. Messages whose `lead_id` is now null still belong here — that is the audit trail working, not an orphan |
| **Leads** | what has happened to them | Zero, one, or several rows. Stage, origin, escalation. A link to each |
| **What went wrong** | Q12, for this person | `getAnomaliesForLead` across every lead this contact has had |
| **Their property history** | context | Matches they appear in, closes they were party to |

## 1.4 🔴 The send history — the answer to Q14

This is the region the screen exists for. Every `sends` row for the number, most
recent first, **refusals included and not filtered out**.

| Field | Renders as | Constraint |
|---|---|---|
| `status` | one of **five** | 🔒 `intended`, `sent`, `failed`, `refused`, **`unresolved`** — and the fifth is the one nobody designs. `0019`: *"we do not know whether this person received a message. Not 'they did not' — we do not know."* It must not render as either |
| `gate_layer` | which layer said no | `reserved` · `resolution` · `suppression` · `basis` · `policy`. The layer is the *shape* of the refusal and orders the reader's understanding |
| `gate_reason` | the machine reason | never shown alone |
| `gate_detail` | 🔒 **the operator sentence** | The refusal reasons already carry operator wording (§11). *"Portugal is not confirmed by a lawyer"*, not `not_confirmed`. An operator who sees the first chases the lawyer; one who sees the second files a bug |
| `gate_basis` | for permissions | the sentence that authorised it |
| `gate_obligations` | conditions that rode with it | an obligation with no registered discharge makes the permission a refusal |
| `gate_decided_at` | 🔴 when this was decided | §1.4.1 |
| `segment`, `country` | A–E, ISO-2 | segment E is an objection and is never assignable |
| `template_*`, `body_intended` | what was going to be sent | frozen at decision time |
| `body_sent` | what went | 🔒 **from the wire, not from a flag.** If `body_sent` differs from `body_intended`, say so; that difference is a defect somebody needs to see |
| `attempts`, `last_error` | retry history | |
| `reconciled_at` | when the key was chased | null on an `unresolved` row means reconciliation has not run yet, not that it failed |

### 1.4.1 🔴 A refusal is a fact about a past moment

**S8, and it is the single most important rendering rule on this screen.**

*"Refused 22 Sep — Portugal is not confirmed by a lawyer"* is true about 22
September and false about a Portugal confirmed on the 20th. The screen must
carry `gate_decided_at` with an age, and where any input is newer than the
decision — a `jurisdiction_policy.confirmed_at`, an `advertising_policy`
confirmation, a later `consent_event` — say which refusal would not happen
today.

This is `campaign-evaluation-design.md` §5.0 one level down. There it is a
banner on a campaign; here it is a property of a row.

🔒 **And it does not silently re-decide.** The screen says *this refusal is
stale*; it does not recompute the gate and show today's answer in the row's
place. The row is a record of a decision that was taken, and overwriting it with
a better one destroys the only evidence of what we did.

## 1.5 The consent ledger panel

Eight kinds, and 🔒 **none of them collapse into "consent: yes/no"**:

| Kind | Means | Rendering constraint |
|---|---|---|
| `claimed` | the agency asserted something we cannot evidence | maps to segment D — **refused before any policy row is reached** |
| `claim_revoked` | the import behind a claim was undone | the history shows both, not just the end state |
| `declared` | the agency classified this contact | names the **agency's** declarer (`0024`), not the operator |
| `consent_given` | | 🔒 cannot be undated — a CHECK enforces `occurred_at`; everything else may be undated |
| `consent_withdrawn` | | |
| `objection` | SAIR, a block, a suppression list | 🔴 **permanent and irreversible** |
| `quarantined` | 🔴 **OUR correction of a record we should not have written** | must read as ours. The importer recorded a spreadsheet cell as consent; that was our error, and a screen that renders it as the agency's is repeating the error with the blame moved |
| `erasure` | | |

Seven sources: `import_declaration`, `agency_attestation`, `whatsapp_reply`,
`web_form`, `operator`, `meta_block`, `system`.

🔒 **Two clocks, never one column.** `occurred_at` is when the thing happened in
the world; `recorded_at` is when we wrote it down. Collapsing them produced an
impossible timestamp once already (lesson 10) and it is the difference between
*"they consented in 2019"* and *"we heard about it in 2026"*.

## 1.6 States

| State | Must say |
|---|---|
| **S1** | a contact with no messages, no sends and no consent events — **real and normal** after an import and before any contact. Not an error, not an empty page |
| **S2** | the number is not known to this client at all — 🔒 different words from S1, and it must not offer to create anything |
| **S3** | 🔴 one panel's read failed while others succeeded — that panel says *not checked*. **A blank ledger panel and a ledger with nothing in it are opposite claims about whether this person may be messaged** |
| **S4** | a read threw — the sentence, in that panel |
| **S5** | 🔴 **the answer to Q14.** Every refusal with layer, reason, detail |
| **S6** | message history capped — with the total |
| **S8** | §1.4.1, per row |
| **S9** | 🔴 an objection is frozen and permanent; a `sent` row is frozen (`0017`'s allowlist freeze) |
| **S10** | §1.8 |
| — | 🔴 **`unresolved`** — we do not know. Its own visible state, neither sent nor not-sent |
| — | 🔴 **`attribution_state = 'unknown'`** — *"the lookup FAILED and is never folded into either figure"*. Not organic, not campaign. A third thing |
| — | 🔴 **reserved test number** — `+351900000xxx`. The gate's first layer refuses it and a CHECK constraint forbids sending to it. Marked on the page as a fixture, not a person |

## 1.7 Can do

- Read everything above.
- **Reply** (desk only — brief I §1.13). Through the existing composer, whose
  guards stay: `lib/draft.ts` refuses invented times and dates, and 🔒 **a draft
  that trips a guard is REPLACED by the client's own handoff note, never
  edited** — *"cutting a sentence out of a reply leaves a plausible-looking
  remainder, and a plausible-looking remainder is exactly what nobody re-reads."*
- **Hand back to the AI.**
- **Record an objection** — §1.8.
- Open a lead, a listing, a close, a campaign run, an n8n execution.

## 1.8 Cannot do

- 🔴 **No editing the ledger.** Append-only. A correction is a new event with its
  own author and its own date.
- 🔴 **No removing an objection.** `recordObjection` is the irreversible half and
  is called only on an unambiguous opt-out or a platform block — **never on
  `unclear`, which halts and escalates and writes nothing.** The screen must not
  offer a route that the code refuses to take. And 🔒 **recording one is the only
  irreversible act on this screen, so it says so before and confirms after** —
  an irreversible act with no on-screen record is the one that gets performed
  twice.
- 🔴 **No assigning segment E.** An objection comes from the contact; an agency
  that could assign it could also remove it.
- 🔴 **No re-sending a refused row.** A refusal is a decision, not a queue item.
  Changing the world is what changes the answer — a confirmation, a declaration
  — and then a new run makes a new row.
- 🔴 **No "mark as consented".** Consent arrives through `consent_given` with a
  date and a source, or it does not exist.
- **No reply from a phone.**
- **No cross-client view of this number.** The same person may be a contact of
  two agencies and consent is per client; showing both would be one agency's
  data on another's screen.
- **No deleting the contact.** GDPR erasure (§3.3) is a designed runbook with a
  legal deadline, not a button, and deleting a lead today orphans its messages
  rather than removing them.

## 1.9 Reads

| Panel | Query |
|---|---|
| identity, leads | `leads` where `client_id` and `phone` |
| ledger | `consent_events` where `(client_id, phone_e164)`, `recorded_at desc` — the index exists for exactly this |
| resolved state | `consent_by_contact` (the view), **never** `leads_consent` |
| sends | `sends` where `(client_id, phone_e164)`, all statuses, `intent_recorded_at desc` |
| messages | `messages` for the lead ids **plus** any whose `lead_id` is now null but whose `external_id` / attribution ties them here |
| anomalies | `getAnomaliesForLead` per lead id |
| staleness | `jurisdiction_policy.confirmed_at`, `advertising_policy.confirmed_at`, latest `consent_events.recorded_at` vs each `gate_decided_at` |

## 1.10 The search that reaches it

🔒 **Searching a number anywhere in the cockpit lands here.** `campaign-
evaluation-design.md` §5.1 specifies it, and today's `/leads?q=` free-text box
is the thing that grows into it. The search normalises to E.164 before looking
— `+351 912 345 678`, `912345678` and `00351912345678` are one contact, and a
search that treats them as three answers Q14 with *"no record"* about a person
who has one.

## 1.11 Legally load-bearing

- 🔴 **This screen is the Article 15 answer.** A data subject asking what we hold
  and why we messaged them is answered by this page and nothing else. That is
  why the ledger is history rather than a current value, why both clocks are
  shown, and why a refusal is never overwritten by a better one.
- 🔴 **`send_requires_permission`, `send_requires_confirmed_policy` and
  `send_never_reserved` are database constraints**, not screen rules. A `sent`
  row necessarily carries a permission, a consent event and a named lawyer's
  confirmation. The screen renders those as the evidence they are; it must never
  present a `sent` row without them, because such a row cannot exist and showing
  a blank there would teach the reader that it can.
- 🔴 **Portugal's Art. 13.º-B lists.** `gate_obligations` on a permitted row
  names the duty that rode with it; the agency holds it and we provide the
  artefact. An obligation shown without its discharge state is proof we knew
  about a duty nothing performs, *"which is WORSE than never recording it."*
- **The objection outlives everything.** Revert, dedupe, re-import, lead
  deletion. That is the whole reason this screen is contact-scoped.

---

# §2. The presented-mode screens

Four are built and need the mode now. 🔴 **A fifth — the close and party
declaration — will need it and is not built** (§3.9); it is listed with the four
rather than with the rest, because designing the mode against four screens and
discovering a fifth later is how a mode becomes a style.

**Brief I §1.4 is the contract** and is not restated. What follows is what each
screen adds.

---

## 2.1 The declaration

### The question
**Q15 — who may we contact at all, and on whose word?**

§3.18: the classification *"is knowledge held by the agency and by nobody
else, and it arrives through a person's afternoon rather than through a
deployment."* This screen is that afternoon.

### 🔒 Two steps, and the order is the whole point

```
step 1   where did these contacts come from?        (origin)
step 2   given that answer, what is still needed?   (evidence, scoped)
```

The first version asked both at once and in the wrong order: the question about
the file's consent marker sat *above* the question about who these people are.
A client who bought through the agency is segment A whether or not the marker
means anything — so the screen opened the conversation on something that may be
irrelevant, and opened a meeting on an admission of our error, **which is the
right sentence in the wrong place.**

🔒 Step 1 writes nothing. It is a GET carrying its answer in the URL, so it is
back-buttonable and re-readable in the room. Only step 2 posts, and it posts
once, so the record is one action.

### 🔴 The quarantined claim — the hardest thing on the screen

For a contact whose ledger holds a `quarantined` event, the screen asks: *your
file said "sim" — what is behind it?* **This is the first time that question
reaches a human, and the phrasing decides whether it is answered honestly.**

Four ways to manufacture a false answer, each of which the design forbids:

| Failure | Why it produces a lie |
|---|---|
| **Blame** | *"Your file claimed consent. Can you prove it?"* invites defence, and a defensive person says *yes, of course* to make the question stop |
| **A cheap yes** | a checkbox marked *"we have consent"* costs nothing to tick |
| **An expensive no** | if *no* reads as *this contact is lost*, the answer will be *yes*. Nobody deletes four hundred contacts to be tidy |
| **No third option** | a binary forces a lie when the truth is *"I do not know"* — and for a list assembled over ten years that is the most common true answer there is |

So, 🔒 structurally:

1. **The error is stated as ours, truthfully.** Our importer did record a
   spreadsheet cell as consent. Starting from our mistake removes the thing
   being defended.
2. **Why we are asking is explained** — *"uma célula não é prova"* — so it reads
   as diligence rather than suspicion.
3. **A yes must be specific**: name the form, the email or the system, with a
   date. Much harder to invent than a tick, and it is exactly the evidence a
   regulator would ask for.
4. **No is shown as a route, not a loss**: *"o contacto não se perde"* — the
   sentence that makes honesty affordable.
5. **"Não sei" is first-class and normalised**, not a fallback. Without it,
   uncertainty collapses into whichever of yes/no is socially easier, which is
   yes.

🔒 **"Não sei" is recorded as a declaration**, with a name: a `declared` event,
segment D, `evidence.uncertainty: true` — so a later re-declaration, if the
record turns up, is visibly a **change of knowledge** rather than a change of
mind.

### States

| State | Must say |
|---|---|
| S2 | nothing declared yet — today's universal state |
| S1 | every group declared |
| S6 | some declared, some not — 🔒 and the undeclared are **not** treated as a default of anything |
| S3 | the jurisdiction sentence derives from the policy table; if it cannot be read, the screen says so rather than asserting a jurisdiction |
| S9 | a declaration is append-only; the history is shown, not the latest value alone |

### Cannot do
- 🔴 **Never pre-select a proposal.** *"The system proposes; the agency confirms
  or corrects"* (Enquadramento §5.1) — and a pre-selected radio is not a
  proposal, it is a nudge with a legal consequence. The proposal appears as text
  beside the choices, unselected.
- 🔴 **Never offer segment E.**
- 🔴 **Never let a declaration be edited.** A correction is a new declaration.
- **Never send.** The screen writes `declared` events and reads leads; it has no
  route to the gate, the permit or the adapter, and `one-sender.test.ts` asserts
  it the same way it does for the campaign planner.

### Reads / writes
Reads `leads` and their `qualification` (the grouping query), `consent_events`
for existing claims, and the policy table for the jurisdiction sentence. Writes
one `declared` event per contact, one action, with the author constraint of
`0024`.

### Legally load-bearing
🔴 **The declaration is the record a supervisory authority would ask for**
(Enquadramento §5.1) — which is why it carries a name and a timestamp, why the
declarer and the recorder are kept apart, and why *"I do not know"* is worth
more than a guess recorded as certainty.

---

## 2.2 Thresholds

### The question
**Q23 — what does this agency mean by a match?**

### States

| State | Must say |
|---|---|
| S2 | 🔒 **nothing is pre-filled when nothing has been answered.** Not a default, not a placeholder holding a plausible number |
| S1 | answered — and the fields carry their own answers back, so changing one thing is not retyping six |
| S5 | until answered, every match run refuses with `thresholds_not_configured` naming all six keys |

### Cannot do
- 🔴 **No defaults, no placeholders, no suggested values.** §4.6: any value chosen
  now is a guess wearing an agency's name, and **a pre-filled field collects a
  click rather than a decision** — which is then recorded as an agency's
  judgement about their own market. This is the one screen where brief I §0.3's
  defaults rule does **not** apply, and the reason is the rule's own test: these
  numbers decide whether something is sent.
- **No saving a partial set as though it were complete.**

### Reads / writes
`client_automations.config` for the `lead_nurture` row. 🔒 **Never defaulted,
never merged** — `run.ts` reads it verbatim, because a merged default is
indistinguishable on screen from an answer.

### Legally load-bearing
Nothing directly. Commercially load-bearing: these numbers decide who receives a
message, and §3.20 says the notification built on them has never been read by an
agent.

---

## 2.3 The triage floor

### The question
**Q18 — nothing can be ranked. Who should the agent look at anyway?**

🔒 **The product for an agency with no structured data, and the only part of 03
that works today** — it needs no thresholds and no calibration, on real rows.
That is what makes it the floor rather than a fallback.

### States

| State | Must say |
|---|---|
| S1 | contacts exist, none chosen yet |
| S2 | the client has no contacts |
| S6 | chosen-so-far beside remaining |
| S5 | the listing is not `available` — shown, and it does not stop the screen |

### Can do
- Choose contacts, in groups (batch, year, area, rest).

### Cannot do
- 🔴 **`chosen_by` is the person at the agency, never the operator driving the
  screen.** Same rule as the declaration keeping the two apart.
- 🔴 **No scores, no ranking, no implied order.** The premise of this screen is
  that nothing can be ranked; an ordering that looks meaningful re-introduces
  the matching claim that §6 rejected as dishonest — *with no hard constraint
  every listing matches.*
- **No sending.**

### Reads / writes
`readTriage` over the client's contacts grouped by import batch, year, area and
rest; writes `listing_matches` rows with `origin = 'agent'`.

### Legally load-bearing
Nothing directly. 🔒 The agent's judgement is recorded as theirs, which is what
makes the list improve every time it is used, and what makes the record honest
about who decided.

---

## 2.4 The exemption declaration

### The question
**Q24 — does this property have a rating, or a declared exemption, and who said
so?**

🔒 **Written to read like the segmentation declaration, on purpose** — same two
fields in the same order, the same hint under *who is saying this*, the same
admission that we are recording rather than deciding. An agency that has sat
through the contact declaration recognises this one, **and that recognition is
worth more than any wording we could improve.**

### States

| State | Must say |
|---|---|
| S1 | already rated — the exemption question does not arise |
| S2 | no fact recorded either way |
| S9 | an exemption already declared, with its author and date |
| **S3** | 🔴 **more than one exemptible requirement in the jurisdiction** — the screen **asks which**, rather than silently exempting the first. It resolves the requirement by reading the policy row, never by knowing the id |
| S5 | the jurisdiction has no exemptible requirement |

### Cannot do
- 🔴 **No deciding whether an exemption applies.** We record; the agency
  declares. Question 2 of the 04 batch is *who may declare one*, and it is
  unanswered.
- 🔴 **No hardcoding `pt_energy_class`.** Portugal's rating is one id; Spain's is
  a different id with a different shape, and **whether either is exemptible at
  all is the policy row's answer.**
- **No editing a recorded rating.**

### Reads / writes
`listings`, `advertising_policy.requires` (filtered to `exemptible`),
`listing_facts`. Writes one fact with `declared_by` and a date.

### Legally load-bearing
- 🔴 The declaration is a statement by a named person that a legal requirement
  does not apply to a specific property. It is the same artefact as a
  consent declaration and carries the same weight.
- 04 is **Portugal only** until Spain has its own analysis.

---

## 2.5 The close and party declaration — 🔴 the fifth, not built

### The question
**Q27 — what did this agency close, and who was the party?**

### 🔒 The close and the party arrive separately, and almost always will

An agent sends *"A-1042 vendido"* because it takes the listing out of matching —
a message they already have a reason to send, **about a property.** It says
nothing about a person and it never will. So a close is born with no party, we
ask who, and the answer is a second act by a second person at a second time.
Modelling it as one act means either inventing a party or discarding the close.

**`CloseReport.source` already admits `'whatsapp' | 'cockpit'` and no cockpit
route produces one.** The type is asking for this screen.

### States

| State | Must say |
|---|---|
| S2 | nothing has ever closed — today's state for every client |
| S6 | closes recorded, party not yet declared — 🔒 **the normal state, not an incomplete one** |
| S9 | a close whose ask window has passed |
| S5 | a close of a property that was never in the system — `listingId` is nullable, deliberately |

### Cannot do
- 🔴 **No skipping a sale.** Not here, not anywhere. §8.B — asking everyone is
  permitted, choosing whom to ask is not.
- 🔴 **No back-dating to rescue a window.** Every window is measured from
  `closed_on`, the legal date of the transaction, and **never** from
  `reported_at` — so a backfilled close is born expired. No constraint mentions
  backfills, deliberately: *a rule with a second number chosen to defend it has
  two places to be wrong.*
- 🔴 **No judgement field.** Not a note, not a flag, not a "difficult sale"
  marker. Any field capable of expressing one re-creates the choice.

### Reads / writes
`closes` (`0033`), `listings`, `leads`. Writes a close with `reportedBy`, and a
party with 🔒 **`declaredBy` (the agency) and `recordedBy` (us) kept apart.**

### Legally load-bearing
🔴 §8.B in full. This screen is where the fairness obligation is either kept or
quietly broken, and the only protection is that no control exists to break it.

---

# §3. The rest

> 🔴 **SUPERSEDED by [`cockpit-design-brief-client-2.md`](cockpit-design-brief-client-2.md)**,
> which gives these twelve the same depth as §1 and §2 above. What follows is
> the shorter index; where the two disagree, brief III is newer.

---

## 3.1 The client landing

**Question:** how is *this* agency doing? — Q2 for one client.
**States:** S1 · S2 (never had anything) · S3 per derived column, *not checked*
never a dash · S4 per region · S8 rendered-at.
**Can:** navigate.
**Cannot:** no automation toggles (that is settings) · no cross-client anything.
**Reads:** the same derived columns as the operator Clients screen, scoped.
**Legal:** 🔴 never the word *"viewings"* for what the Concierge books (§3.15).

## 3.2 Escalations

**Question:** Q11 — is anybody here waiting for a human?
**States:** S1 *"nobody is waiting — the resting state, and the one you want"* ·
S2 · S4 · S6 (capped at 100, must render `100+`) · the `handledElsewhere` state,
which is neither open nor closed · the outage cluster.
**Can:** open a lead.
**Cannot:** no dismiss · no bulk hand-back.
**Reads:** `leads` where `qualification->>'escalated'` — 🔒 `->>` and not `->`,
which is load-bearing.
**Legal:** none.

## 3.3 Anomalies

**Question:** Q12 — what went wrong here, and was a lead told something untrue?
**States:** S1 with 🔒 **the window named** (seven days and one hour are
different claims) · S2 · S6 grouped by kind, `N× since`, four visible, the
expander stating the severity of what it hides · S9 — 🔒 **the order is never
re-sorted to keep criticals visible**, because that puts a six-day-old critical
above a two-minute-old warning and destroys the list as a timeline.
**Can:** open the lead; open the n8n execution.
**Cannot:** 🔴 no dismiss or acknowledge — §4.8 defers it *with a trigger*: only
if a kind is still firing after its cause is understood. 🔒 **No re-wording the
summary** — it is the sentence the WhatsApp carried, and a second formatter
drifts from the first.
**Reads:** `events` of three types, shaped by `lib/anomaly.ts`.
**Legal:** 🔴 this is the record an agent needs when a lead complains about
something the system got wrong. It shows the text the lead was sent, as stored.

## 3.4 The forecast

**Question:** Q16 — if we ran the campaign now, who would it reach, who would it
refuse, and why?

**States:**
- S2 never evaluated.
- S5 mostly refusals — 🔒 **and that is the product working, not a fault.**
- S6 refusal groups expand to contacts, each with the gate's own sentence.
- **S8** 🔴 the state this screen was designed around. The age in the header with
  *"26 days ago"*; a banner when any input is newer than the run, **naming which
  reason is stale**; and 🔒 **re-evaluate offered from that banner**, not buried
  with the other buttons — *"the most common reason a campaign refused is a
  thing that has since been fixed. The campaign is not wrong; it is early."*
- S3 `PlanDiagnostics` — a policy or ledger read that failed during planning.

🔒 **Make the largest refusal the most legible.** The split inside *"nothing
recorded about them"* is the one that matters commercially: contacts nobody has
said anything about are not a worklist; contacts carrying a claim the agency
could still evidence are. That is the whole point of `claimed_unevidenced` being
a separate state, arriving on a screen.

🔒 **Operator words, never machine reasons.** *"Portugal is not confirmed by a
lawyer"*, not `not_confirmed`.

**Can:** evaluate · re-evaluate · export the refusals · send.
**Cannot:** 🔴 **the send is staged and gated** — ten contacts, not a tranche and
not 10%; watched live message by message; stop on the first *surprise*, not the
first error; the full forecast recorded first so the ten are visibly a subset;
and a named person accountable before the first send. No bulk send, no
re-evaluate across clients, no editing a refusal.
**Reads:** `campaign_runs`, `sends` (refusals written in one insert),
`planCampaign`'s diagnostics, and the template **snapshot** — 🔒 not the live
`message_templates.status`, or *"why did the forecast say 20"* has no answer.
**Legal:** 🔴 the forecast **authorises nothing**; the gate re-decides before
each send. And there will be **no rehearsal**: every route to one involves
writing a false lawyer's confirmation into the table built to be trustworthy.

## 3.5 Listings

**Question:** what has this agency got?
**States:** S1 none available · S2 none ever · S5 no listing-capable automation.
**Can:** navigate.
**Cannot:** 🔴 **never trigger a matching run.** An operator refreshing a page
must not rewrite match rows — and on a notified listing that is an attempt to
change a record somebody has already acted on, which `0025`'s freeze refuses.
**Reads:** `readListings`. **Legal:** none.

## 3.6 Listing matches and the publication gate

**Questions:** Q17 — who wants this, or why could we not say? **and** Q20 — may
this property be advertised, and if not, what exactly is missing?

🔴 **Both, on one screen.** Today a property that cannot lawfully be advertised
looks identical to one that can, because 04's gate reaches no surface at all.

**States:**
- 🔴 **S5 twice, and they must be distinguishable at a glance.**
  `thresholds_not_configured` — *we cannot rank*. `policy_not_confirmed` — *it
  may not be advertised*. Different automations, different remedies, different
  people to chase.
- S1 calibrated, ran, matched nobody — a real and different answer from either.
- S9 a notified match is frozen (`0025`); shown as frozen, not as editable and
  quietly refused.
- S3 the gate could not resolve the jurisdiction — 🔒 *we cannot say what this
  region requires* ≠ *this may not be advertised*.
- S3 `listings.region` is null in a country where `region_required` — the gate
  refuses rather than judging against the national row alone.

**Can:** open triage, the exemption, the thresholds, the prepared piece.
**Cannot:** run a match · publish · edit a fact · 🔴 **infer the region.**
`listings.region` is entered by a person: deciding that "Sant Cugat" is in
Cataluña applies a legal requirement or removes one, and **a string match
producing a legal conclusion is a guess with a citation attached.**
**Reads:** `readMatches`, `listing_matches` (`origin` `computed` vs `agent` — 🔒
a chosen row must never borrow a computed row's authority), `decidePublication`
over `advertising_policy`, `listing_facts`, `agency_facts`.
**Legal:** 🔴 the gate refuses by **naming the requirement**, not the column.
🔴 `'unknown'` registration status passes at the gate, deliberately and against
the design's own line, because refusing it would publish nothing until a lookup
we have not built exists — 🔒 **so the screen must show that it passed on an
unconfirmed assertion**, or the departure is just a pass.

## 3.7 The prepared piece

**Question:** what will the agency actually publish?
**States:** S2 not prepared · S1 prepared · S9 prepared before a fact changed —
stale, and it says so · S5 cannot be prepared because the gate refused.
**Can:** prepare; copy.
**Cannot:** 🔴 **publish.** A person at the agency publishes, wherever they
publish. 🔴 **No verb claiming we acted on the advertisement.**
**Reads:** `lib/publication/piece.ts`; the mentions registry 🔒 **throws on an id
it cannot say**, and the screen must let that throw rather than rendering a piece
with a silent gap.
**Legal:** 🔴 every piece carries the energy rating and the AMI licence, and the
invariant is read **on the artefact**, not on the code path that built it.

## 3.8 The silence

**Question:** Q19 — who told this agency what they wanted and has been left alone
since?

**States:** 🔴 **S2 is distinguished today and is the model for the rest** —
`toldUs === 0` (*nobody ever said anything*) is a different sentence from
`silent.length === 0` (*people spoke and none are silent*). S6: 🔒 **the
denominator always**, plus `unknownClock` and `recentlySpoken` shown **beside**
the headline rather than folded into it.
**Can:** read.
**Cannot:** 🔴 **nothing. There is no button.** Reaching these people is
consent-gated and paced, and *"a 'contact them all' control on a screen designed
to produce indignation is how an agency's database gets burned in an
afternoon."*
**Reads:** `readSilence` — leads, their last contact, and
`DEFAULT_SILENCE_DAYS = 90`.
**Default (brief I §0.3):** ninety days decides *who appears on a list*, never
whether anything is sent, so it may be defaulted. It is deliberately the same
number as `STATUS_STALE_AFTER_DAYS` — *"two different numbers for the same shape
of question would each need defending; one needs defending once"* — and it is
overridable per client. **Wrong if** a ninety-day silence turns out to be
unremarkable in this market, which would make the headline count meaningless
rather than indicting.
**Legal:** the absence is the compliance property.

## 3.9 Closes

See §2.5 — it is a presented-mode screen and is specified there.

## 3.10 The review reconciliation

**Question:** Q22 — did we ask everyone who closed?

**States:**
- **S3** 🔴 `report.checked === false` — the reconciliation did not run. Already
  right today.
- S2 nothing has ever closed.
- S5 the disposition's seven reasons, 🔒 **none able to express a judgement**.
- **S6** 🔴 🔒 **the three counts side by side** — closes, asked, pending — with
  the gap explained beside them. *Contested by design*: somebody will notice the
  ask list is shorter than the sales list, and **a discrepancy that is displayed
  and explained does not get investigated as a defect.**
- S8 🔴 `not_in_service` is **dated**. A close whose window ran before an
  approved template existed is not an omission, and a boolean would make every
  pre-service close flip to a finding the moment Meta approves one.
- 🔴 `reported_after_window` is **not** `unaccounted`, and the distinction
  carries the whole check: two hundred historical closes reporting as findings
  would hide the one genuine skip, and the genuine skip is the only output that
  means anything.

**Can:** read.
**Cannot:** 🔴 **nothing, and specifically no per-sale skip.** *"A skip button
would be the offence with an audit trail showing who committed it."* 🔒 Guarded
twice — the page cannot grow a control, and `CloseRow`'s key set is asserted
whole. **That second guard works only because `npm test` runs `tsc` first; split
those scripts and it silently stops holding.**
**Reads:** `readReviewScreen`, `explainTheGap`, `sends` for `review_05`.
**Legal:** 🔴 §8.B. And 🔴 *"everyone" means everyone we may lawfully message* —
the gate refuses segment D, segment E, suppressions and unresolvable
jurisdictions, **so the ask list is always shorter than the sales list.**
Somebody will read that as a bug; **closing it is the offence.**

## 3.11 Import

**Question:** Q25 — what did we load, from which file, and can I undo it?
**States:** S1 no batches · S6 staged / committed / reverted · S5 rows rejected
at parse or normalisation, with the reason · S9 a committed batch whose leads
have since been messaged is not fully revertible, **and it says which**.
**Can:** upload · map columns · plan · commit · revert.
**Cannot:** 🔴 **no mapping to a field that does not exist.** The `AfterClaude`
guard discards an invented target and keeps our own guess — *"a probe measures
how often the model behaves; a guard determines what the system is allowed to
show."* No import without a client. No silent dedupe — what was merged is shown.
**Reads / writes:** `import_batches` (`0008`), `leads`, `consent_events`
(`claimed`, and `claim_revoked` on a revert).
**Legal:** 🔴 an import that records a spreadsheet cell as consent is the error
the `quarantined` kind exists to correct. **The importer must never write
`consent_given` from a file**, and the mapping step must not offer a target that
would.
🔒 This is the second-user surface in the ordinary flow — the mapping is read
with the agency — so it needs presented mode's *property* even though it is not
on the list: no other client's name in the mapping view.

## 3.12 The weekly report

**Question:** Q26 — what do I send this client on Monday?
🔒 **Its output is a document, not a page.** The client never logs in.
**States:** S2 no clients · S1 a week with no activity — 🔒 *"nothing happened
this week"* is a legitimate report and must not look like a broken one · S3
`metrics_daily` missing days — **named, never interpolated.**
**Can:** generate · send · navigate weeks.
**Cannot:** 🔴 **never publish a number computed as though it were a fact about
the world** (§5j). 🔴 **Never the word "viewings"** for an introductory meeting —
*"a client reading 'three viewings booked' when nobody visited a property is a
trust problem, and it surfaces in the first weekly report, not in month six."*
No editing the numbers.
**Reads:** `metrics_daily` only. **Writes:** `reports`.
**Legal:** the report is what the client relies on. An overstated number here is
a misrepresentation in a commercial relationship, not a display bug.

## 3.13 Client settings

**Question:** what is this client configured to do?
**States:** S1 · S5 validation refusals · S9 a field that cannot change once
live (the WhatsApp number, the sender SID).
**Can:** edit config; enable and disable automations.
**Cannot:** 🔴 **no editing matching thresholds here** — that is the calibration,
in the agency's words, in presented mode. 🔴 No enabling an automation whose gate
would refuse everything; show the gate instead. No second WhatsApp number.
**Reads / writes:** `clients`, `client_automations.config`.
**Legal:** 🔴 **do not display `automations.name` until `0035` is applied** — it
still holds two names promising a referral product that was refused.

---

# §4. Additions to the checklist

Brief I §3's ten, plus four that only arise below the client:

11. **Is this scoped to the contact or to the lead row?** If a person's history
    can be incomplete because a lead row was reverted or deleted, it is scoped
    wrong.
12. **Does a refusal show its age?** A refusal is a fact about a past moment.
13. **Are both clocks shown?** `occurred_at` and `recorded_at` never collapse.
14. **Would this screen be safe with the laptop turned around?** If the answer
    depends on which client is selected, it needs presented mode.

---

# §5. What is still not covered

- **Layout, hierarchy, density, typography, colour, components.** None of it.
- **The n8n-side surfaces.** The agent match notification's wording is
  unvalidated (§3.20) and cannot be judged from a keyboard; the cockpit may show
  what was sent and must not become a second renderer of it.
- **GDPR erasure** (§3.3) — a designed runbook with a legal deadline, later a
  button. Not a screen decision yet.
- **The agent entity** (§3.1) — no table, no column. Escalation routing, calendar
  identity and transaction ownership all wait on it, and it must be designed
  once, properly, with a migration, never under deadline pressure.
- **Build order**, for the same reason as brief I: it wants a conversation about
  a first real client's first week.
