# Cockpit design brief III — the remaining client-level screens

**Written 19 September 2026.** Third and last of the briefs.

| | |
|---|---|
| [`cockpit-design-brief.md`](cockpit-design-brief.md) | the frame and the nine operator-level surfaces |
| [`cockpit-design-brief-client.md`](cockpit-design-brief-client.md) | the contact record, and the presented-mode screens |
| **this** | the twelve that remain |

🔴 **This supersedes brief II §3**, which gave these twelve a compact treatment
while the contact record and the presented-mode screens got a full one. Where
the two disagree, this is newer. Brief II §3 stays only as the shorter index.

Same discipline: **constraints, not layouts.** 🔒 marks an arrangement that is
carrying meaning and is therefore not yours to change. Brief I §0 and §1 — the
ten states, the universal contract, time, counts, attribution, error boundaries,
the defaults rule — apply throughout and are not restated.

**The twelve:** the client landing · escalations · anomalies · the forecast ·
listings · listing matches and the publication gate · the prepared piece · the
silence · the review reconciliation · import and one batch · the weekly report ·
client settings.

*(Closes and the party declaration are in brief II §2.5, with the presented-mode
group, because that is where they belong.)*

---

# §1. The client landing

## The question
**Q2, for one agency** — how is this client actually doing, and is it our fault
or theirs?

🔒 **Not a dashboard and not a summary of the screens beneath it.** It answers
one thing: *is anything here wrong, and is it something I can fix.* Every number
on it is a door.

## Structure
Three bands, and 🔒 **the order is by who can act**, because that is the
distinction the operator is actually making:

1. **Ours to fix** — an automation erroring, an invariant firing, a config gap.
2. **Theirs to answer** — an unconfirmed declaration, uncalibrated thresholds,
   a missing AMI licence, a close with no party.
3. **Nobody's yet** — blocked on Meta, on a lawyer, on ADENE. Shown so it is not
   re-diagnosed every week.

## States

| State | Must say |
|---|---|
| **S1** | running, nothing notable — with the clocks still visible. An empty landing that says nothing is indistinguishable from one that could not look |
| **S2** | this client has never had a lead, a listing or a send — 🔒 different words from S1, and the normal state today for both clients |
| **S3** | 🔴 a derived band unavailable — *not checked*, **never a dash and never a zero**. Casting an absence is a decision to invent (§5i) |
| S4 | a read threw — that band, not the page |
| S8 | rendered-at |

## Design decisions 🎨 — 19 Sep 2026, against brief I §0.5
- **The clocks sit above the bands**: one per automation, saying when it last
  ran, that it has never run, that it is held, or that it is off. They are what
  makes S1 legible — *"running, nothing notable — with the clocks still
  visible"*. They are not a summary-card strip: they restate nothing in the
  bands. 🔒 **"Held" and "off" are different words**: an automation that is
  enabled but gated (on Meta, say) is *held*, never *off* — *off* would claim a
  setting that is not true.
- **Every item names the screen it opens** (*"opens Anomalies"*), because every
  number here is a door.
- **Colour on items only, never on the client**, with the §0.5 meanings: red for
  an erroring run or a critical invariant, blue for a gate refusal held until
  the agency answers (its stored code shown in mono beneath), amber for an
  outside wait at the waiting room's 7- and 21-day steps — and those amber items
  carry the same wait track as Today, so the shape does real work beside the
  colour.
- **A rehearsal client says so in its header** (`clients.rehearsal`, migrations
  0037/0038): kept out of the business's numbers, shown here in full.
- **Refuses the phone**, pointing to Today.

## Can do
- Open anything on it.

## Cannot do
- **No configuration.** That is settings (§12), where the client's name is the
  page's subject rather than a heading.
- **No enabling or disabling an automation.** Same reason.
- 🔴 **No health score, grade or colour for the client as a whole.** The band
  structure exists precisely so a ninety-minute wait and an unanswered lawyer
  question do not become one dot.

## Reads
The same derived sources as the operator Clients screen (brief I §2.2), scoped
to one `client_id`: `automation_runs` per `client_automation_id`, the three
anomaly event types, escalated `leads`, and each gate's own refusal —
`thresholds_not_configured`, `policy_not_confirmed`, `no_ledger_basis`, no
approved template.

🔴 **Never `client_automations.health` or `last_run_at`.** Nothing has ever
written to either; `0035`'s sibling drop is owed.

## Legally load-bearing
- 🔴 **Never the word *"viewings"*** for what the Concierge books. It books an
  introductory meeting between the lead and one of the agency's people, not a
  property visit (§3.15). The columns say `viewing_booked` and
  `viewings_booked`; the screen says the true thing regardless.
- 🔴 **Do not render `automations.name` until `0035` is applied.** *(Applied 19
  Sep — this is now satisfied, and the note stays as the reason the column can
  be trusted.)*
- Confidentiality: this screen may show anything about this client to the
  operator. It may not show anything about another.

---

# §2. Escalations

## The question
**Q11 — is anybody at this client waiting for a human?**

## Structure
🔒 **Longest waiting first.** The spec once said newest-first *and* called a
four-hour-old lead the failure state this screen prevents. Those contradict, and
newest-first pushes exactly that lead off the bottom.

## States

| State | Must say |
|---|---|
| **S1** | 🔒 *"Nobody is waiting."* And say that this is **the resting state and the one you want** — an empty queue is the only empty screen in the cockpit that is good news, and it should read as good news |
| S2 | this client has never had a lead |
| S4 | the read threw |
| S6 | capped at 100 — must render `100+`, never a silent 100 |
| — | 🔴 **`handledElsewhere`** — the escalation flag is still set *and* an outbound message has since gone out. Somebody replied outside the cockpit. 🔒 **Neither open nor closed, and it gets its own visible state**: rendering it as open sends the operator to a handled lead, rendering it as closed hides a flag nobody cleared |
| — | **outage** — three or more of one *system* reason inside 15 minutes renders as **one fault with a count**, above the individual rows. Three unrelated faults is a bad afternoon; three of the same is a dependency down |

## Can do
- Open a lead.

## Cannot do
- **No dismiss, no acknowledge, no snooze.** The flag clears by the work being
  done, not by the row being tidied.
- **No bulk hand-back.**
- 🔴 **No re-ordering by tier or severity.** The clock is the sort. A tier is a
  property of a row, not a reason to move it above an older one.

## Reads
`leads` where `qualification->>'escalated'` is set — 🔒 **`->>` and not `->`,
and the difference is load-bearing.** Plus `clients.name`, the most recent
outbound `messages` row per lead (for `handledElsewhere`), and `escalation.ts`
for tier, class and `detectOutage`.

## Defaults
`limit 100` · outage `3` in `15` minutes. Both display-only, both in brief I
§1.12, both wrong if a normal morning trips them.

## Legally load-bearing
Nothing directly. Operationally: an escalation is the lead being told a human
will come, so a queue that under-reports is a promise quietly broken.

## Design decisions 🎨 — 20 Sep 2026, batch 5
Designed with §3, §10 and §11: `claude.ai/artifact/RvyVCf3rkJY6NjDZYDAyUv`.

- 🔒 **Ticking is the freshness signal, and it is §0.4-6 in its live form.** While
  the 60s re-read succeeds the clocks run and the stamp reads *Live · read
  09:20:05*; when a read fails they **freeze at their last value, go dim**, and
  the stamp turns amber with the age of the last successful read. A relative time
  that keeps counting over a failed read is a figure computed at a moment
  presented as now — the forecast's defect, moving.
- **The tier is a position**: each clock sits on a track with notches at 30, 90
  and 240 minutes, the word sits under it and in the accessible name, and red
  appears only at breach. The row is mark | body | clock — there is no tag
  column, which is what made the tiers look accidental on Today.
- **The outage sits above the rows and does not replace them**, with the count,
  the shared fault named, and a link into the anomalies. The rows it counts stay
  where their clocks put them.
- 🔒 **`handledElsewhere` has its own tray at the foot, violet, with its own
  clock measured from the reply** — *16m since the reply*, not from the wait. It
  is a different question, so it is a different clock.
- 🔴 **S4 does not say the queue is empty.** *"The queue could not be read, so
  this page is not saying the queue is empty."* S1 is the opposite: a green
  resting banner that reads as good news, with when the last hand-over cleared.
- **The sidebar count is the same number the page shows**, including `100+` and a
  `?` when the read failed. A nav count that disagrees with its own page is the
  cheapest possible lie. *(Caught in the render: the nav said 4 beside a page
  saying 5.)*

---

# §3. Anomalies

## The question
**Q12 — what went wrong here, and was a lead told something untrue?**

## Structure
Four constraints, all already built and 🔒 **all transplanted rather than
redesigned** (§4.8):

1. **Grouped by kind**, not listed per occurrence — most recent occurrence with
   `N× since <time>`. The failure this list must survive is not many different
   anomalies; it is **one fault firing on every run because a guard regressed,
   burying the second distinct fault below the fold.**
2. **Four groups visible**, the rest behind an expander that opens in place and
   keeps no state between visits.
3. 🔒 **The expander states the severity of what it hides** — `3 more · 2
   critical` — so collapsing cannot reintroduce the burying that grouping exists
   to prevent.
4. 🔴 **The order is never re-sorted to keep criticals visible.** That would put
   a six-day-old critical above a two-minute-old warning and destroy the list as
   a timeline. Vertical space and burying are separate concerns and are handled
   separately.

## States

| State | Must say |
|---|---|
| **S1** | none in the window — 🔒 **and the window is named.** "No anomalies" over seven days and over one hour are different claims |
| S2 | none ever |
| S4 | the read threw |
| **S6** | capped at 500 — 🔒 rendered `500+`, *"rather than silently under-counted"* |
| **S9** | 🔴 anomalies are history. Nothing is dismissed |

## Can do
- Open the lead. Open the n8n execution (`executionUrl`).

## Cannot do
- 🔴 **No dismiss or acknowledge.** §4.8 defers it **with a trigger**: only if a
  kind is still firing after its cause is understood — that is schema and
  workflow, and building it before the false-positive rate is known would be
  guessing.
- 🔴 **No re-wording the summary.** The row renders the event's own `summary` —
  the same sentence the WhatsApp carried, minus the trailing phone. *"A second
  formatter in the cockpit would drift from it and the two would disagree about
  the same event."*
- **No filtering by client here** — this screen is already one client's.

## Reads
`events` where `type in ('invariant.violated', 'invariant.check_failed',
'run.errored')`, last `ANOMALY_WINDOW_DAYS`, shaped by `lib/anomaly.ts`:
`severity`, `invariant` (`1`/`2`/`3`/`3b`/`4`/`5`), `kind`, `label`, `summary`,
`textSent`, `stage` (`pre_send`/`run_end`), `executionUrl`.

🔒 **`run.errored` belongs here** even with no lead attached — same kind of
record, and an execution that threw belongs in the morning list whether or not
it has a lead.

## Legally load-bearing
🔴 **This is the record an agent needs when a lead complains about something the
system got wrong.** It shows `textSent` — what the lead was actually sent, as
stored. That is why the summary is not re-worded and why nothing is dismissible:
the screen is evidence before it is a worklist.

## Design decisions 🎨 — 20 Sep 2026, batch 5
- 🔒 **The window is named on the count, not only in the header**: *37× since
  08:02, in the last 7 days*. A bare `37×` is a claim about all time, and the
  count is a count in a window.
- **Severity is a mark, not a position**: a filled disc for critical, an outline
  for warning, at the head of the row. The list stays in time order and a
  critical is never floated — the expander carries the severity of what it hides
  (*3 more faults · 2 critical*) and that is the whole of the anti-burying
  mechanism.
- **`textSent` renders in mono, labelled *what the lead was sent, as stored***,
  and the summary above it is the event's own sentence, unedited.
- **A run error shows the execution link and says no lead is attached**, rather
  than rendering an empty lead slot.
- S1 names the window and offers a wider one; S4 says the page does not know,
  which is a different sentence from a quiet week.

---

# §4. The forecast

## The question
**Q16 — if we ran the campaign now, who would it reach, who would it refuse, and
why?**

## Structure

🔒 **The refusal breakdown is the screen**, not a footnote under a headline. A
campaign of 300 that refuses 280 is the normal case, and the 280 is the part
with work in it.

🔒 **Make the largest refusal the most legible, and split it.** *"Nothing
recorded about them"* is the biggest group and it contains two different things:
contacts nobody has said anything about, and contacts carrying a claim the
agency could still evidence. **The second is a worklist; the first is not.**
That is the entire reason `claimed_unevidenced` is a separate state, and this
screen is where it arrives.

🔒 **Operator words, never machine reasons.** *"Portugal is not confirmed by a
lawyer"*, not `not_confirmed`. *"An operator who sees the first chases the
lawyer. One who sees the second files a bug."*

## States

| State | Must say |
|---|---|
| S2 | never evaluated for this client — today's state |
| **S5** | mostly refusals — 🔒 **and that is the product working.** The screen must not apologise for its own output |
| S6 | each refusal group expands to the contacts, each carrying the gate's own sentence |
| **S8** | 🔴 **the state this screen was designed around.** §4.1 below |
| **S3** | `PlanDiagnostics` — a policy or ledger read that failed during planning. A forecast built on a partial read is not a forecast and must say so rather than under-reporting refusals |
| **S9** | a `complete` or `halted` run is frozen. A halted one 🔒 **states its reason** — a CHECK enforces it |

### 4.1 🔴 The screen must not read as a statement about the present

Opened a month later, this view says *"41 refused — Portugal is not confirmed by
a lawyer"* about a Portugal that was confirmed three weeks ago. **Everything on
it is true about 22 September and false about today, and nothing in the layout
says which of the two it is describing.**

Three rules, and they are 🔒 structural:

1. **The evaluation timestamp is in the header, with an age.** *"26 days ago"*
   is read; a date is skimmed.
2. **A run older than its inputs says so, and names which reason is stale.** The
   check is cheap: any `jurisdiction_policy.confirmed_at`, any
   `advertising_policy.confirmed_at`, or any `consent_events.recorded_at` later
   than `evaluated_at` means at least one refusal is stale.
3. **Re-evaluate is offered from that banner**, not buried with the other
   buttons. *"The most common reason a campaign refused is a thing that has
   since been fixed. The campaign is not wrong; it is early."*

## Can do
- Evaluate · re-evaluate · export the refusals · open a contact · send.

## Cannot do — and the send is the whole of it

- 🔴 **The forecast authorises nothing.** The gate re-decides before each send,
  and a contact permitted in phase 1 may be refused in phase 2. That is the
  design working — but it is also **the only moment the system learns its
  forecast was wrong**, so late refusals past `max(3, 10% of the forecast)`
  **halt the run**.
- 🔴 **The first send is staged, and the staging is not advice:**

  | | |
  |---|---|
  | **Ten contacts.** Not the first tranche, not 10% — ten | small enough that every outcome can be read individually, and a mistake is a conversation rather than an incident |
  | **Watched live, message by message** | not "check the dashboard afterwards" |
  | **Stop on the first thing that *surprises* anybody** | not the first error. Errors are visible. Surprise includes *"that reply is odd"* |
  | **The full forecast recorded first** | so the ten are visibly a subset of the real campaign's shape |
  | **A named person accountable** | before the first send. An action with consequences has an author |

- 🔴 **There will be no rehearsal, and no control may create one.** Every route
  to a rehearsal involves writing a false lawyer's confirmation into
  `jurisdiction_policy` — a name and a date that did not happen — into the one
  table built to be trustworthy. *"A system that would let us fake a lawyer's
  confirmation in order to test itself is a system whose confirmations mean
  nothing."*
- **No re-evaluating across clients.** No editing a refusal. No re-sending a
  refused contact from here.

## Reads
`campaign_runs` — `status` (`evaluating`/`evaluated`/`sending`/`complete`/
`halted`), `target_count`, `excluded_count`, `excluded_breakdown`,
`forecast_permitted`, `forecast_refused`, `refusal_breakdown`,
`permitted_contacts`, `sent_count`, `refused_late_count`, `failed_count`,
`ambiguous_count`, `halted_reason`, `evaluated_at`. Plus `sends` refusal rows,
`planCampaign`'s diagnostics, and the template **snapshot**.

🔒 **The snapshot, not live `message_templates.status`.** Phase 1 says *"20
contactable with template X"* at 09:00; Meta pauses X at 10:00; phase 2
re-decides at 14:00. Without the snapshot, *"why did the forecast say 20"* has
no answer.

🔒 **`permitted_contacts` are not `sends` rows.** *"Nothing provisional belongs
in the table that records decisions acted upon."* The screen must not render
them as though a send had been recorded.

🔒 **`forecast_adds_up`** — `target = excluded + permitted + refused` — is a
CHECK. If the screen ever shows figures that do not add up, the defect is in the
screen.

## Legally load-bearing
- 🔴 The forecast is a **projection**, and every number on it is conditional.
  Rendering it as a statement of who *will* be messaged is the first step to
  somebody treating it as authorisation.
- `excluded_count` are **terminal** refusals that are not re-asked. A settled
  question re-opened is a contact re-evaluated against a permission they already
  refused.

---

# §5. Listings

## The question
What has this agency got, and what is in play?

## States

| State | Must say |
|---|---|
| S1 | no listings currently `available` — 🔒 and say that only `available` listings match, so the absence is explained rather than discovered |
| S2 | none ever |
| S5 | the client has no listing-capable automation configured |
| S4 | the read threw |
| S6 | 🔒 the count, with the n=1 rule — a count of one never reads as *"1 imóveis"* |

Five statuses, and 🔒 **each has its own sentence**: `available`, `reserved`,
`under_offer`, `sold`, `withdrawn`. Only `available` is matchable.

## Can do
- Navigate to a listing.

## Cannot do
- 🔴 **Never trigger a matching run.** An operator refreshing a page must not
  rewrite match rows — and on a **notified** listing that is an attempt to
  change a record somebody has already acted on, which `0025`'s freeze refuses
  anyway. The screen reads what a run already found.
- **No creating a listing here.** A listing arrives from an agent over WhatsApp
  (`/api/listings/inbound`); a cockpit form would be a second origin with no
  agent attached.
- **No editing status.** Status comes from the agent's own message.

## Reads
`readListings(clientId)` over `listings`.

## Legally load-bearing
Nothing directly. 🔴 But see §6: a listing's *advertisability* is not its status,
and this screen must not let the two be confused.

## Design decisions 🎨 — 20 Sep 2026, against brief I §0.5
Designed: `claude.ai/artifact/B64HncNBAbmxDumsRqTQQG` (batch 4, with §6.1, §7 and brief II §2.4).

- 🔒 **Two columns, two vocabularies, and they may never share a word.** *Estado
  (diz a agência)* carries `Disponível · Reservado · Com proposta · Vendido ·
  Retirado`; *Pode ser anunciado? (diz a lei)* carries `Pode ser anunciado · Não
  pode ser anunciado · Não sabemos o que a região exige · Não perguntámos`. The
  sets are disjoint by construction, and a check asserts it — that is what stops
  §6's confusion being a matter of care.
- **The table must show the independence in both directions**, or the separation
  is only asserted: a `Disponível` property the law refuses, and a `Reservado`
  property the law permits. One of each is in the sample for that reason.
- 🔴 **A sold or withdrawn listing reads *Não perguntámos*, not a verdict.**
  Rendering a computed-looking refusal for a property nobody would advertise
  states a conclusion nobody reached. It is the not-asked case, and it is grey.
  *(Found in the render, not in the source: the first draft gave those rows the
  policy refusal, which was true and beside the point.)*
- **The advertisability column carries the page's moment** (brief I §0.4-6):
  *verificado às 09:20 de hoje · a resposta muda quando a lei ou os documentos
  mudam*. The status column carries none, because it is a stored fact, not a
  computed one. 🔒 Only the computed half is stamped — stamping both would make
  the stamp meaningless.
- Colour: green *in force* on `Disponível` and on a permission; blue *held* on
  `Reservado`/`Com proposta`, which are held back deliberately; grey on ended
  statuses and on both kinds of not-known; red only on a real refusal.
- **S5 is an automation that is off, not an empty list**: *"Esta agência não tem
  nenhuma automação de imóveis ligada"* — proposed copy, owner `LISTINGS`.

---

# §6. Listing matches and the publication gate

## The questions
**Q17** — who wants this property, or why could we not say?
**Q20** — 🔴 may this property be advertised, and if not, what exactly is
missing?

🔴 **Both, on one screen, and today the second reaches no surface at all.** A
property that cannot lawfully be advertised currently looks identical to one
that can.

## Structure

🔒 **Two refusals, two remedies, two different people to chase, and they must
be distinguishable at a glance:**

| Refusal | Automation | Means | Remedy |
|---|---|---|---|
| `thresholds_not_configured` | 03 | we cannot **rank** | the calibration conversation, with the agency |
| `policy_not_confirmed` | 04 | it may not be **advertised** | one sentence from a lawyer on one policy row |

🔒 **Computed rows and agent-chosen rows are separated and labelled.** *A chosen
row must never borrow a computed row's authority* — an agent's judgement and a
score are different kinds of claim, and merging them lets a guess inherit a
number's credibility.

## States

| State | Must say |
|---|---|
| **S5 ×2** | above |
| **S1** | calibrated, ran, matched nobody — 🔴 **a real and different answer** from either refusal. *"Nothing here" and "we could not decide" look identical and mean completely different things* |
| S5 | the listing is not `available` — matching does not apply |
| **S9** | a notified match is frozen (`0025`). 🔒 Shown **as frozen**, not as editable and quietly refused on submit |
| **S3** | 🔴 the gate could not resolve the jurisdiction — 🔒 *we cannot say what this region requires* ≠ *this may not be advertised* |
| **S3** | `listings.region` is null in a country where `region_required` — the gate **refuses** rather than judging against the national row alone |
| S6 | the five-name cap on notifications is a guess with its reasoning attached; if the screen shows the same list, it shows the cap |

## Design decisions 🎨 — 20 Sep 2026
- 🔒 **The two refusals are never one glance apart:** *we cannot rank* (03) is
  `--held` blue and its remedy is a twenty-minute conversation with the agency;
  *it may not be advertised* (04) is `--red` and its remedy is one sentence from
  a lawyer. Each names its own remedy and the person to chase. *Matched nobody*
  is a third answer in plain type, and says it is an answer rather than a
  failure.
- **Computed and chosen are separate sections**, each labelled, and a chosen row
  carries the name of whoever chose it and no strength word.
- 🔴 **The gate's refusals have no agency-facing Portuguese.**
  `lib/publication/gate.ts`'s `REFUSAL_MEANS` is English, and this screen is
  Portuguese (`MATCHES`). Q20's verdict therefore cannot be rendered to the
  agency in its own language from any module today. The design proposes the
  sentences; they belong in a copy module.

## Can do
- Open triage, the exemption declaration, the thresholds, the prepared piece.

## Cannot do
- **No running a match.** No publishing. No editing a fact.
- 🔴 **Never infer the region.** `listings.region` is entered by a person.
  Deciding that "Sant Cugat" is in Cataluña **applies a legal requirement or
  removes one**, and *"a string match producing a legal conclusion is a guess
  with a citation attached."*
- 🔴 **No overriding the gate.** There is no "publish anyway".

## Reads
`readMatches` over `listing_matches` (with `origin`), and `decidePublication`
over `advertising_policy.requires`, `listing_facts`, `agency_facts`.

## Legally load-bearing
- 🔴 **The gate refuses by naming the REQUIREMENT, not the column.** *"This
  property has no energy rating"* is actionable; `energy_class is null` is not.
- 🔴 **`'unknown'` registration status passes at the gate, deliberately, against
  the design's own line.** A typed registration is the agency asserting their
  own licence number and no register lookup exists; refusing it would publish
  nothing until we build something we have not built. 🔒 **So the screen must
  show that it passed on an unconfirmed assertion** — otherwise the departure is
  just a pass, and the 90-day re-confirmation that makes it honest is invisible
  at the only moment somebody would care.
- 🔴 **Portugal only.** §8.A.3 and the findings register both say 04 cannot enter
  service in Spain without its own analysis.
- Today every Portuguese property refuses `policy_not_confirmed` **before**
  anybody's missing certificate is reached, because Portugal's row is researched
  and unconfirmed. 🔒 The screen must show the refusal that actually fired, not
  the one a reader would expect.

## §6.1 The gate in depth — `/c/<client>/listings/<id>/publish`
Designed 20 Sep 2026 in batch 4. No brief section existed for it; this is it.

## The question
Why that answer, on what facts, and as of when?

## Design decisions 🎨
- **Three parts, in this order: the verdict, then what the law asks, then what we
  hold.** The verdict is the whole answer and carries the refusal token
  (`policy_not_confirmed`, `region_undeclared`, `no_policy_row`,
  `requirement_unmet`) plus the module's own sentence verbatim.
- 🔒 **When the policy row refuses, the requirement list must say it is not the
  cause.** Three requirements listed under a refusal read as the reason for it.
  A line under them states that the row refuses first and would refuse even if
  all three were held.
- 🔒 **Every requirement row is: what the law asks · what we hold · who said it ·
  when.** The *when* is the fact's own date, distinct from the verdict's decision
  time at the top. A verdict is computed at a moment; the facts under it each
  have an older one, and both are on screen.
- **The `'unknown'` registration passes, in amber, saying so**: *passed on an
  unconfirmed assertion · nobody checked it with the register · re-confirm after
  90 days · 13 days ago*. Amber because a clock is the reason it is tolerable,
  and the clock's age is shown.
- 🔒 **`region_undeclared` is grey and is not a refusal to advertise.** The
  verdict reads *We cannot say*, and the page lists **no** requirements as met or
  missing, because none were asked. An empty list under a red verdict would read
  as "nothing is required".
- `no_policy_row` likewise lists nothing, and says why the emptiness is not a
  permission.
- 🔴 **No control on this page confirms a policy row, declares a fact, or
  publishes anyway.** The declaration has its own screen and its own author.
- ⚠️ **Language gap, same family as §9's.** Every sentence here comes from
  `publication/gate.ts` and `publication/requirements.ts`, which are English, so
  the screen is operator-facing only. An agency-facing version needs Portuguese
  in those modules first — it cannot be translated in the view.

---

# §7. The prepared piece

## The question
What will the agency actually publish, and does it carry what the law requires?

## States

| State | Must say |
|---|---|
| S2 | not prepared |
| S1 | prepared |
| S5 | cannot be prepared, because the gate refused — with the requirement named |
| **S8** | 🔴 prepared before a fact changed. The piece is an artefact with a date, and a certificate that expired after it was written does not un-write it |
| **S4** | 🔴 the mentions registry **throws on an id it cannot say** — 🔒 the screen lets that throw rather than rendering a piece with a silent gap. A piece missing a mention is the defect this feature exists to prevent |

## Can do
- Prepare. Copy.

## Cannot do
- 🔴 **Publish.** A person at the agency publishes, wherever they publish. That
  was chosen deliberately — holding a client's credentials to post public
  commercial content under their brand risks the WhatsApp asset every other
  automation runs on.
- 🔴 **Claim we acted on an advertisement.** No *removed*, *corrected*,
  *withdrawn*, *republished*. A test fails on any such verb, and the guard
  asserts its own cases before using them — it had been masculine-singular only
  while every noun in this feature is feminine.
- **No editing the piece by hand here.** A hand-edited piece is not the artefact
  the invariant was read on.

## Reads
`lib/publication/piece.ts`; the mentions registry; the clearance the piece rests
on.

## Legally load-bearing
- 🔴 **Every piece carries the energy rating and the AMI licence**, and 🔒 **the
  invariant is read ON THE ARTEFACT**, not on the code path that produced it.
  This is the §0.1 rule — verify the end state, never the last message — in the
  one place where the end state is a document a regulator could read.
- 🔴 The fines are the **company range: €2,500–€44,890**, not the €250–€3,741
  that §8.A carried until 18 September. If the screen states exposure, it states
  that range. Understating it twelvefold is the opposite of what the sentence is
  for.

## Design decisions 🎨 — 20 Sep 2026
- 🔒 **The mandatory mentions are highlighted where they sit in the text**, not
  listed beside it. The invariant is read on the artefact, and the screen shows
  the artefact the invariant was read on.
- 🔒 **S8 does not re-render the piece.** The stale banner names both dates —
  prepared 10 Sep, certificate expired 16 Sep — and says *não voltámos a
  escrevê-lo*. A check asserts the stale text is byte-identical to the fresh one;
  its sabotage run appends a word and the check goes red.
- **But the stale state changes which action leads.** Fresh: *Copiar*, primary.
  Stale: *Preparar de novo* primary, *Copiar assim mesmo* secondary. Not
  rewriting the artefact is not the same as recommending it — leaving *Copiar*
  as the primary action on a piece we have just said is out of date invites the
  one outcome the banner exists to prevent.
- **The piece states what it rests on and when**: the clearance's time, and each
  fact's declarer and date.
- **S4 renders the throw and no piece at all**, with the failing requirement id
  in mono. A piece with a gap is the defect; a page with no piece is the fix.
- **S5 names the missing requirement** in the agency's language, and does not
  name the gate.

---

# §8. The silence

## The question
**Q19 — who told this agency what they wanted and has been left alone since?**

🔒 **The product's argument in one sentence, made from data that already
exists** — before any threshold is configured, before Meta approves anything,
and before a single message goes out.

## Structure
🔒 **The denominator is always on the screen**, and the two counts that are
*not* in the headline are shown **beside** it rather than folded in:

- `silent` — the headline.
- `unknownClock` — we do not know when they last spoke. 🔴 Not silent, not
  recent. A third thing.
- `recentlySpoken` — spoke inside the threshold.

Folding either into the headline would inflate the number this screen exists to
make somebody feel.

## States

| State | Must say |
|---|---|
| **S2** | 🔴 `toldUs === 0` — **nobody ever said anything.** 🔒 A different sentence from S1, and this screen is where that distinction was first got right |
| **S1** | `silent.length === 0` — people spoke, and none are silent past the threshold |
| S6 | the denominator, plus the two side counts |
| S4 | the read threw |

## Can do
- 🔴 **Nothing.**

## Cannot do
- 🔴 **There is no button, and its absence is the design.** Reaching these people
  is consent-gated and paced (§7, §6.2), and *"a 'contact them all' control on a
  screen designed to produce indignation is how an agency's database gets burned
  in an afternoon."*
- No export of the list as a mailing list. No per-person "contact".
- 🔒 **No ranking by how silent they are.** A list sorted by neglect is a
  call-list wearing a report's clothes.

## Reads
`readSilence(clientId)` — `leads`, `last_contact_at`, `DEFAULT_SILENCE_DAYS`.

## Defaults
**90 days**, per brief I §0.3. It decides *who appears on a list*, never whether
anything is sent. Deliberately the same number as
`STATUS_STALE_AFTER_DAYS` — *"two different numbers for the same shape of
question would each need defending; one needs defending once."* **Wrong if** a
ninety-day silence is unremarkable in this market, which would make the headline
indict nobody.

## Legally load-bearing
The absence **is** the compliance property. Everything that would make this
screen actionable is exactly what §6.2's pacing and the consent gate exist to
control.

---

# §9. The review reconciliation

## The question
**Q22 — did we ask everyone who closed?**

## Structure

🔒 **The three counts are side by side: closes, asked, pending.** Somebody will
notice the ask list is shorter than the sales list, and **a discrepancy that is
displayed and explained does not get investigated as a defect.** The gap is
explained beside the counts, with every reason.

🔴 **The vocabulary of reasons is closed and no member can express a
judgement.** **Eight** reasons, derived from the send row — *corrected 20 Sep
2026: this section said seven.* `NotAskedReason` and `REASON_MEANS` hold eight
(`party_not_named`, `gate_refused`, `window_expired`, `reported_after_window`,
`send_failed`, `agency_disabled`, `not_in_service`, `no_review_destination`),
and `review-disposition.test.ts` asserts `reasons.length === 8`. The count
assertion did its job when `reported_after_window` was added; the prose around
it — and this brief — were not updated with it. A ninth fails that line and the
person adding it has to come and write down what it is for.

🔴 **`REASON_MEANS` is in English and this screen is in Portuguese.**
`explainTheGap` hands those sentences straight to `REVIEW.gapLine`, so the built
screen would print English reasons inside Portuguese copy in front of the
agency. The design shows short Portuguese labels (proposed) with the module's
English sentence beneath, marked, so the gap is visible rather than papered
over. **The sentences need Portuguese in the module that owns them**, not in the
page.

## States

| State | Must say |
|---|---|
| **S3** | 🔴 `report.checked === false` — **the reconciliation did not run.** Already right in the built screen, and the model for the rest |
| S2 | nothing has ever closed — today's state for every client |
| S5 | 05 is switched off for this client; or no review destination is set |
| **S6** | the three counts, contested by design |
| **S8** | 🔴 `not_in_service` is **DATED**. A close whose ask window ran before an approved template existed is not an omission — and a boolean would make every pre-service close flip to a finding the moment Meta approves one. *The backfill mistake with the sign reversed: a change in OUR state rewriting the history of what we did about theirs* |
| — | 🔴 `reported_after_window` is **not** `unaccounted`, and 🔒 **the distinction carries the whole check.** Two hundred historical closes reporting as findings would hide the one genuine skip, **and the genuine skip is the only output that means anything** |

## Can do
- 🔴 **Nothing.**

## Cannot do
- 🔴 **No per-sale skip, and this is the most important absence in the
  codebase.** An agency may switch 05 off entirely; never for one sale. §8.B —
  *pedir a todos é permitido, escolher a quem pedir não é* — so **a skip button
  would be the offence with an audit trail showing who committed it.**
  🔒 Guarded twice: the page cannot grow a control, and `CloseRow`'s key set is
  asserted whole. **The second guard works only because `npm test` runs `tsc`
  first; split those scripts and it silently stops holding.**
- **No editing a disposition.** It is derived from the send row.
- **No re-asking.** One message per sale, once.

## Reads
`readReviewScreen(clientId)`, `explainTheGap(report)`, `closes` (`0033`), `sends`
for `review_05`, `clients.review_link` and `review_requests_enabled` (`0034`).

## Legally load-bearing
- 🔴 **§8.B is Google's policy, and the review link is a POLICY boundary.** The
  host allow-list exists because a link to another platform would run this
  automation under rules nobody has read. The path is deliberately
  unconstrained — a pattern tight enough to feel rigorous rejects a valid link
  an agency pasted from their own dashboard.
- 🔴 **"Everyone" means everyone we may lawfully message.** The gate refuses
  segment D, segment E, suppressions and unresolvable jurisdictions, **so the
  ask list is always shorter than the sales list.** Somebody will read that as a
  bug. **Closing it is the offence**, and the screen exists to make the gap
  legible rather than tempting.
- 🔴 **This is the one place where the tempting act is the kind one.** Sparing
  the client who had a difficult sale is what a decent person would do by hand.
  The control does not exist so that nobody has to be decent about it at 6pm on
  a Friday.

---

# §10. Import, and one batch

## The questions
**Q25 — what did we load, from which file, and can I undo it?**

## Structure
Five steps, and 🔒 **nothing is written to `leads` until the fourth**: upload →
map columns → plan → commit → (revert).

🔒 **The mapping step is read with the agency**, so it carries presented mode's
*property* even though it is not on the presented-mode list: no other client's
name anywhere in that view.

## States

| State | Must say |
|---|---|
| S1 | no batches yet |
| S2 | no clients — *"onboard one first; a contact list has to belong to somebody"* |
| **S6** | three batch states, each in its own words: `staged` (not imported yet), `committed`, `reverted` |
| **S5** | rows rejected at parse or normalisation, **with the reason per row** — a rejected row that does not say why is a row nobody can fix |
| **S6** | duplicates, shown as merged-with-what, never silently collapsed |
| **S9** | 🔴 a committed batch whose leads have since acquired a message or an event is **not fully revertible** — and it names which leads and why |
| S3 | the column mapping could not be proposed (the model call failed) — our own guesses stand, and the screen says the proposal is ours |

## Can do
- Upload · map · plan · commit · revert.

## Cannot do
- 🔴 **No mapping to a field that does not exist.** The `AfterClaude` guard
  discards an invented target and keeps our own guess, with a note. *"A probe
  measures how often the model behaves; a guard determines what the system is
  allowed to show."*
- 🔴 **No revert that destroys evidence.** A revert removes leads and **never**
  deletes a message or an event under any circumstances. `messages.lead_id` is
  `on delete set null`, so deleting a lead does not delete its messages — *"it
  silently NULLS the link between them. Nothing is deleted, the row count is
  unchanged, and the conversation is now evidence with its subject erased."*
  Any lead that has since acquired a message or an event is **refused** rather
  than removed, and named in the report.
- 🔴 **No writing `consent_given` from a file, ever.** A spreadsheet cell is not
  evidence of consent; recording one as consent is the error the `quarantined`
  ledger kind exists to correct. The mapping step must not offer a target that
  would.
- **No import without a client.**

## Reads / writes
`import_batches` (`0008`) with its `report`; `leads`; `consent_events` —
`claimed` on commit, `claim_revoked` on revert. Tier is `contact_only` /
`approximate` / `precise`, and 🔒 **the tier is shown with what it MEANS**, not
as a bare label: it decides what may honestly be sold on top of this data.

## Legally load-bearing
- 🔴 **An import is the moment a legal claim about hundreds of people is
  created.** Everything downstream — the declaration, the gate, the forecast —
  is reasoning over what this screen wrote.
- 🔴 **`claim_revoked` on revert is not bookkeeping.** It is the record that a
  claim we once held no longer stands, and the ledger shows both events rather
  than the end state.

## Design decisions 🎨 — 20 Sep 2026, batch 5
⚠️ **Flagged as genuinely new in shape** (the operator's standing rule): this is
a flow with a write in the middle, not a screen that reads. It was designed as a
step sequence and carried in the batch; if the individual steps want depth, they
get their own pass.

- 🔒 **The rail shows all five steps and marks where the write happens** —
  *4 · Commit · writes to leads here* — with the line that steps one to three can
  be abandoned and leave nothing behind. The operator should not have to know
  that from the code.
- **The mapping step reads *their column → our field → why***, with the samples
  under their column and the reason right-aligned. Low-confidence proposals say
  *worth a look* rather than being coloured as errors — uncertainty is never
  coloured (§0.5).
- 🔴 **The discarded proposal is shown, by name.** *"The model offered
  `agent_owner`. No such field exists, so it was dropped and our own guess
  stands. You are seeing what the guard allowed, not what the model said."* A
  guard that silently corrects is indistinguishable from a model that never
  erred.
- 🔴 **There is no field on the mapping screen that records consent as a fact**,
  and the screen says so beside the consent column, with the cell quoted as the
  claim it is. The absence is designed, so it is stated.
- **S3 (the proposal failed) says the guesses are ours**, and does not degrade
  into a blank form.
- **The plan step states that nothing has been written**, and every rejected row
  carries its reason; duplicates read as *merged with what*.
- 🔒 **The revert report leads with what was NOT undone**: *1 199 removed · 17
  kept because they have been talked to since · no message or event was
  deleted*, then the seventeen by name with `revert.ts`'s own reasons. The
  failure mode here is a success line over a partly-undone import.
- **The mapping step carries presented mode** (§10's own rule): Portuguese, no
  other client's name, blank switcher. It is the only step that does.

---

# §11. The weekly report

## The question
**Q26 — what do I send this client on Monday?**

🔒 **Its output is a document, not a page.** The client never logs in. The page
is the preview and the generator; the artefact is what gets sent.

## Structure

🔒 **Overlapping categories are never summed, and the shape carries the logic.**
A reactivated contact who becomes a qualified lead is genuinely both: they came
from the agency's old list **and** they are a live enquiry. Choosing one box
understates one automation and overstates the other.

> **The lie enters at the sum.** *"41 conversations + 12 reactivations = 53
> contacts"* is false. So reactivations are rendered as a **subset line,
> indented under the figure they are part of** — never as a parallel one.
> **The client reads the shape.**

## States

| State | Must say |
|---|---|
| S2 | no clients |
| **S1** | 🔴 a week with no activity — *"nothing happened this week"* is **a legitimate report** and must not look like a broken one |
| **S3** | 🔴 three day-states, not two: `derived` (a row exists; zeros mean nothing happened), `missing` (**the day is past and has no row — the nightly derivation did not run, so any total including it is incomplete**), `future` (has not happened yet). 🔒 Collapsing `missing` and `future` **painted the rest of the current week as a failure** in the first version |
| **S3** | 🔴 `conversationsUnattributed` — `attribution_state = 'unknown'` means **the lookup FAILED**. 🔒 *Never folded into either figure. A number we do not know is not a zero* |
| S8 | the week covered, absolutely, and whether it is complete |

## Can do
- Navigate weeks · generate · send.

## Cannot do
- 🔴 **Never publish a number computed as though it were a fact about the
  world** (§5j). A total over a week containing `missing` days is incomplete and
  says so; it is not quietly summed.
- 🔴 **Never the word *"viewings"*** for an introductory meeting. *"A client
  reading a weekly report that says '3 viewings booked' when nobody visited a
  property is a trust problem — and it surfaces in the first weekly report, not
  in month six."*
- **No editing the figures.** No hand-written commentary that asserts a number
  the data does not carry.
- 🔴 **No interpolating a missing day.**

## Reads / writes
`metrics_daily` only, via `getWeeklyReport`; `lib/report/attribution.ts` for the
figures; `messages.attribution_state`. Writes `reports`.

## Legally load-bearing
Commercially load-bearing, which here is the same weight: **the report is what
the client relies on.** An overstated number is a misrepresentation inside a
paid relationship, not a display bug — and `metrics_daily.reactivations` is the
figure Automation 02 exists to move, so it is the one under most pressure to
flatter.

## Design decisions 🎨 — 20 Sep 2026, batch 5
- 🔒 **The artefact is rendered as the artefact** — monospaced, in `renderWeekly`'s
  own lines and spacing, because the indentation *is* the logic. Subset lines sit
  under the figure they are part of; the unattributed block sits apart, in grey
  italic, carrying its own parenthetical. There is no total line anywhere, and a
  check asserts the word never appears.
- 🔴 **A week with a missing day shows no figures at all**, not a six-day total
  and not zeros: *every figure is withheld, and the report says which day made
  them so*. The banner names Wednesday, says the derivation did not run, and says
  the gap cannot be filled from here.
- 🔴 **And there is no send control on that week** — not a greyed one. A report
  that cannot honestly be sent should not look one click from going; the screen
  carries an amber *Sending is held* and the one honest alternative, *show the
  six days we do have, labelled as six*. *(Changed in the render: a disabled
  button still read as pressable.)*
- **The week strip is the three day-states in one line**: derived, `no row` in
  red, `not yet` dim and outlined. Collapsing the last two is what painted a
  normal week as a failure in the first version.
- **S1 is a legitimate report**: the artefact states that nothing came in, that
  the zeros mean nothing happened rather than something failing, and that all
  seven days were derived.
- The absences list names none of the forbidden words. *(It did in the first
  draft — the same mistake as the re-check notice: a page cannot forbid a word by
  printing it.)*

---

# §12. Client settings

## The question
What is this client configured to do, and what may I change?

## States

| State | Must say |
|---|---|
| S1 | configured |
| **S5** | validation refusals — a non-IANA timezone, a country-aware phone failure, a WhatsApp number already held by another client (`0007`), a sender SID failing `^XE[0-9a-f]{32}$` (`0021`) |
| **S9** | 🔴 fields that cannot change once live: the WhatsApp number and the sender SID. Shown **as frozen**, with why |
| **S3** | 🔴 the calendar could not be probed — distinct from *the calendar is wrong*. A wrong calendar id returns **200 with `busy: []`** and hides the failure in `calendars[id].errors` |
| S6 | automations enabled, each with whether its gate would currently refuse everything |

## Can do
- Edit the Concierge config, areas, meeting kind/duration/location, the AMI
  licence, the review destination. Enable and disable automations.

## Cannot do
- 🔴 **No editing matching thresholds here.** Those are the calibration, answered
  in the agency's words, in presented mode, with nothing pre-filled. A settings
  form with a number in it collects a click and records it as an agency's
  judgement about their own market.
- 🔴 **No editing a declaration, an exemption, or any other thing a person
  asserted.** Append-only, with authors.
- 🔴 **No confirming a policy row.** Ever, from anywhere in the cockpit.
- **No second WhatsApp number.** No deleting a client.
- 🔴 **No enabling an automation whose gate would refuse everything without
  saying so.** A switch whose only effect is a refusal later is a switch that
  teaches the operator the system is broken.

## Reads / writes
`clients`, `client_automations.config` per automation key.

## Legally load-bearing
- 🔴 **`client_automations.config` holds numbers that decide who receives a
  message.** It is the one place in the cockpit where brief I §0.3's defaults
  rule does **not** apply, and §4.6 is the reason.
- The AMI licence is per client, once, and is what every prepared piece carries.
- The review destination is host-allow-listed (`0034`) because §8.B is Google's
  policy.

## Design decisions 🎨 — 20 Sep 2026, the last screen
Designed: `claude.ai/artifact/SikJNRqU7tAQuHmuniC36J`.

- 🔒 **A field that cannot change has NO control, not a disabled one.** The
  WhatsApp number, the sender SID and the AMI licence render as mono text with
  the reason beside them. This is the operator's rule of 20 Sep — *a greyed
  control is not a refusal, it still reads as one click from going, and the only
  honest version is no control at all* — and it now applies to every screen, not
  only this one. A check asserts that **no element anywhere on this page is
  `disabled`, `readonly` or `aria-disabled`**, in any scenario; its sabotage run
  turns a frozen field into a disabled input and goes red.
- 🔒 **No number has a default, and the field says why.** §0.3 is suspended here
  by §4.6, so the placeholders read *no default — say how many* and, on the
  threshold, *no default — this is a judgement about their market*. A pre-filled
  threshold collects a click and records it as the agency's own decision about
  who is worth a person's time.
- 🔴 **An automation whose gate would refuse everything has no switch**, but the
  refusal, the thing blocking it, and a route to that thing: *held by its gate ·
  open the waiting room / set the destination / open the policy row*. Same rule,
  one level up from a field.
- 🔴 **04 is held in every scenario but one**, because Portugal's policy row is
  researched and unconfirmed — the same truth §6.1 shows. The single scenario
  where it runs is labelled *once Portugal is confirmed*, so the screen never
  implies today is different from what the gate screen says. *(Caught in review:
  04 was first drawn as happily running, contradicting batch 4.)*
- **The calendar's three answers never collapse into two**: *probed and
  answering* (green), *could not be probed* (**grey**, with the auth error and a
  re-probe), and the trap named in full — a wrong id answers **200 with no busy
  times**, which is indistinguishable from a free calendar.
  - 🔴 **Corrected 20 Sep 2026, during the build**: the Stage B design drew the
    unprobed calendar in **amber**, and §0.5 does not allow that. Amber means a
    clock is the reason; *nobody has looked* has no clock in it, and §0.5's
    never-coloured rule puts uncertainty and absence in grey. Found while
    writing `why-empty.ts`, which is the point of the helper — the wording and
    the colour of an emptiness now come from one place, so a screen cannot
    choose either by eye.
- **Both computed answers carry their moment** and neither is re-run by opening
  the page: *probed 09:20 today · not re-run by opening this page*, and *the gate
  was asked at 09:20 · a refusal here is about today, not about this client*.
- **Working hours stay free text with the parse shown back** in mono (*09:00–18:00
  · days 1,2,3,4,5*), and an end at or before the start is refused here rather
  than becoming a calendar that looks fully booked forever.
- **Every refusal keeps what was typed and saves nothing**, and the save line
  says so. The refusal banner's count is the number of refusals actually on the
  page. *(Caught in review, second time in two batches: a count that disagrees
  with its own page.)*
- **Nothing configured yet means nothing running**: 01 and 03 are off, with
  *nothing runs until it is configured*. An automation on with no working hours
  and no calendar must not read as a normal state.
- ⚠️ **Recorded divergence: the stored key is `viewing_duration_minutes`** and
  the label is *introductory meeting — how long*. The workflow reads the key, so
  it cannot be renamed casually; the screen shows the key in the hint and uses
  the honest word everywhere else. A rename is a migration plus a workflow
  change, and it belongs on the improvements list rather than in a form.

---

# §13. What the three briefs together still do not decide

- **Layout, hierarchy, density, typography, colour, components.** None of it, in
  any of the three.
- **Build order.** It wants a conversation about a first real client's first
  week, not a dependency graph.
- **The `client_automations.health` / `last_run_at` drop.** Decided, unwritten.
  It needs `0032`'s prove-they-are-empty treatment.
- **The waiting room's and compliance watch's tables.** Both need a migration;
  shape follows the design.
- **GDPR erasure** (§3.3) — a runbook with a legal deadline, later a button.
- **The agent entity** (§3.1) — no table, no column. Escalation routing, calendar
  identity and transaction ownership all wait on it. 🔴 **Design it once,
  properly, with a migration. Never under deadline pressure.**
- **`lead_nurture`'s name.** Still *"Lead Nurture & Listing-Match Drip"*,
  deliberately: "Drip" names a send that is not built, and the honest
  replacement depends on which tier the client is on.
- **Whether the match notification reads like something an agent would act on**
  (§3.20). It cannot be answered from a keyboard, and no screen in these briefs
  answers it either.
