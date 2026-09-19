# The cockpit mindmap

**Written 19 September 2026.** Nothing here is built, designed or laid out. This
is the map that has to be right before any of that starts, because §3.17's
warning is that screens built against the wrong frame get built twice.

**What it is:** the question behind every screen, an inventory of what exists
and what becomes of it, the frame, the operator level, the mobile answer, every
state including the ones nobody designs, and every action — and every deliberate
absence — each screen carries.

**What it is not:** a layout, a component list, a build order, or a decision
about what to write first. Three things in §3 are decisions that need a yes from
the operator before anything is drawn; they are marked **DECISION**.

**Source material.** `improvements-and-opportunities.md` §3.17 (the frame),
§3.14, §3.18, §3.20, §4.7, §4.8, §4.9, §5.12; `campaign-evaluation-design.md` §5
(a screen already designed in full); `segmentation-screen-design.md`;
`automation-03-no-crm-design.md`; `automation-04-publication-gate-design.md`;
`automation-05-review-request-design.md`; `engineering-lessons.md` §5b, §5k,
§11d, §13, §13b, §15b; and the thirteen live routes under `cockpit/src/app`.

---

# §0. The one-paragraph answer, for whoever reads only this

The top-level object is **the client**, and the landing screen is **not the
client list**. The operator's attention is allocated by clock, not by client: a
lead waiting ninety minutes and a certificate expiring in twenty-seven days are
both "needs me" and a per-client rollup collapses them into the same amber dot.
So the landing is one cross-client worklist ordered by what has run out, each
row naming its client; the client list is the navigation spine and the answer to
a *different* question ("how is Cascais doing"). Above both sits an operator
level that today has no home at all and holds the project's largest blockers —
ten lawyer questions, Meta, one unconfirmed Portuguese policy row — none of
which belong to any client. And there is a mode nobody has written down: five of
the built screens are used with the laptop turned around, in a room with the
agency, where a navigation bar listing other agencies' names is a thing you
cannot show. That mode is a frame requirement, not a stylesheet.

---

# §1. The question, before the layout

## 1.1 The rule

**A screen with no question behind it is decoration.** The test is not "what
does it display" but "what did the operator come to find out, and does reading
it reduce the work". §3.17's real complaint is the second half: the current
cockpit is not dated, it is *inert* — it tells you things and leaves the work
exactly where it was.

Three corollaries, each of which kills or moves a screen further down:

1. **A question already answered elsewhere does not need a screen.** Health is
   the case: Better Stack emails before the page is opened. That does not make
   the page worthless; it makes its question narrower than the page implies.
2. **A question whose answer is a document is not a page.** The weekly report is
   the case: nobody logs in to read it, so its output is the thing that gets
   sent, and the page is scaffolding around a generator.
3. **A question with no actor is a notification, not a screen.** If the answer
   changes nothing the operator does, it belongs in the alert that already
   reaches them.

## 1.2 The canonical question list

**Operator level** — crosses every client, or belongs to none.

| # | The question they came to answer | Surface |
|---|---|---|
| Q1 | *What needs me right now, across everybody?* | **Today** |
| Q2 | *How is each client actually doing — and is it our fault or theirs?* | **Clients** |
| Q3 | *Is anything about to expire, lapse, or arrive?* | **Expiries** |
| Q4 | *Is the system alive, and is the thing that watches it alive?* | **Infrastructure** |
| Q5 | *What is blocked on somebody who is not me, and for how long?* | **The waiting room** |
| Q6 | *What changed in the law this week that touches what we run?* | **Compliance watch** (§5.12) |
| Q7 | *What have we proved, and has any of it gone stale?* | **The proof book** |
| Q8 | *Can I take on a new client, and what does that actually require?* | **Onboarding** |
| Q9 | *What may we lawfully say, to whom, in which language?* | **The template registry** |
| Q10 | *Which automations is each client actually running?* | **Clients**, second column |

**Client level** — everything below a selected agency.

| # | The question | Surface |
|---|---|---|
| Q11 | *Is anybody at this client waiting for a human?* | **Escalations** |
| Q12 | *What went wrong here, and was a lead told something untrue?* | **Anomalies** |
| Q13 | *Who is this person, what did they say, what did we send, and why?* | **The contact record** |
| Q14 | *Why did this person **not** get the message?* | **The contact record** — and it does not exist today |
| Q15 | *Who may we contact at all, and on whose word?* | **The declaration** |
| Q16 | *If we ran the campaign now, who would it reach, who would it refuse, and why?* | **The forecast** — designed, not built |
| Q17 | *Who wants this property — or why could we not say?* | **Listing matches** |
| Q18 | *Nothing can be ranked. Who should the agent look at anyway?* | **The triage floor** |
| Q19 | *Who told this agency what they wanted and has been left alone since?* | **The silence** |
| Q20 | *May this property be advertised — and if not, what exactly is missing?* | **The publication gate** — no screen at all |
| Q21 | *What was lawfully advertised and has stopped being so?* | **Expiries**, client slice |
| Q22 | *Did we ask everyone who closed?* | **The review reconciliation** |
| Q23 | *What does this agency mean by a match?* | **Thresholds** |
| Q24 | *Does this property have a rating, or a declared exemption, and who said so?* | **The exemption declaration** |
| Q25 | *What did we import, from which file, and can I undo it?* | **Import** |
| Q26 | *What do I send this client on Monday?* | **The weekly report** |
| Q27 | *What did this agency close, and who was the party?* | **Closes** — no screen; the type admits one |

**Object level** — a single lead, listing, close, batch or run. These are not
separate questions so much as the depth at which Q13, Q17, Q20 and Q25 are
actually answered.

## 1.3 Questions no screen answers today

Listed separately because this is the honest measure of the current cockpit.

- **Q14** — *why did this person not get the message.* Named in
  `campaign-evaluation-design.md` §5.1 as the canonical question, sharing one
  query with its opposite. `sends` holds every refusal with its layer, reason
  and operator sentence. Nothing renders it.
- **Q20** — 04's entire output. `lib/publication/gate.ts` refuses by naming a
  requirement, in words. The refusal reaches no screen. Today every Portuguese
  property refuses `policy_not_confirmed` and an operator has no way to see it
  except a probe.
- **Q16** — the forecast. Fully designed, including its staleness banner. Exists
  as `npm run probe:campaign`.
- **Q3, Q5, Q6, Q7, Q9** — the whole operator level. Tracked in markdown files
  and a terminal.
- **Q2** — `client_automations` has `health` and `last_run_at` columns and
  **nothing has ever written to either.** The rollup §3.17 asks for has no
  source; it must be derived, per §4.7.

## 1.4 Questions deliberately not asked here

- *"How is Ryvo doing commercially?"* — revenue, churn, pipeline. A different
  instrument. `clients.monthly_fee_eur` exists and stays unread by the cockpit.
- *"What is the client doing?"* — anything confidential to the agency that the
  operator cannot help with. §3.17's stated limit, unchanged.
- *"Can the client see this?"* — no client login. Unchanged and reinforced.

---

# §2. Inventory — what exists, what survives, what it becomes

## 2.0 The correction first

The brief says *"nine or so screens were built standalone."* **Seven were.** Of
the nine named:

| Named | What actually exists |
|---|---|
| the segmentation declaration | ✅ `/segmentation/[clientId]` |
| the campaign forecast | ❌ **`npm run probe:campaign`** — a terminal probe over `planCampaign`. No route. |
| listing matches | ✅ `/listings/[id]` |
| the triage floor | ✅ `/listings/[id]/triage` |
| the silence | ✅ `/silence/[clientId]` |
| the exemption declaration | ✅ `/listings/[id]/exemption` |
| the publication re-check notice | ❌ **`recheckClearances()`** in `lib/publication/recheck.ts`. Called by tests. No route, no caller in `app/`. |
| the review reconciliation | ✅ `/review/[clientId]` |
| the thresholds | ✅ `/calibrate/[clientId]` |

Plus `/listings` (the index), which was built and is not on the list. So: seven
screens, four throwaway client pickers, and two things remembered as screens
that are a probe and a library function.

This matters beyond bookkeeping. Both of the two are **client-level answers to
compliance questions** — the forecast is "who would this refuse and why", the
re-check is "what has stopped being lawful". Carrying them in the mindmap as
*existing* would budget zero design for the two screens whose absence is most
expensive.

## 2.1 The current cockpit, inside `Shell.tsx`

| Route | What it is | Question | Verdict |
|---|---|---|---|
| `/` | redirect to `/queue` | — | **Dies.** The landing becomes Today. |
| `/queue` | escalations across all clients, longest waiting first; outage banner; pressure bar; anomalies (7 days, grouped by kind, 4 visible + expander) | Q11 and Q12 fused | **Splits.** The escalation list is the spine of **Today**. The anomaly feed is a different question with a different clock and a different actor — it becomes its own surface at both levels. Fusing them was right when there was one screen; it is wrong when there are two questions. |
| `/leads` | every lead; filters client / stage / escalated / free text; 25 per page | Q13, weakly | **Survives, moves beneath the client** — and its free-text box grows into the thing that answers Q14. The `client` filter dies into the frame. |
| `/leads/[id]` | facts, transcript, viewing state, anomalies for this lead, draft-assisted composer, hand back to AI | Q13 | **Survives and changes identity — becomes the contact record.** A lead is a per-client row; the consent ledger, suppression and `sends` are keyed on the phone and outlive it. The screen must show the *number's* history, not the row's. |
| `/report` | weekly per client, `metrics_daily` only, week navigation | Q26 | **Survives as a generator.** The client never logs in; the output is what gets sent. The page is the preview. |
| `/health` | twelve checks, last-run stamp with staleness, absolute + relative time | Q4 | **Survives, operator level, demoted from primary nav.** Gains §4.9's one line: is the outside monitor itself alive. |
| `/onboarding` | one form → one `clients` row + one `client_automations` config | Q8 | **Survives and grows.** It configures *one* automation. There are five, each with its own config, and §3.14's hardcoded areas live here. |
| `/import` | upload per client, previous batches with status | Q25 | **Survives beneath the client.** |
| `/import/[id]` | one batch: column mapping (n8n `ryvoCockpitMap01`), plan, proposals, commit, revert | Q25 | **Survives, and is the second-user surface** — the mapping step is read with the agency. |
| `/login`, `/auth/callback`, `/auth/signout` | auth | — | Unchanged. |
| `/api/health` | deep check, token-guarded, real Supabase query, 503 on failure — Better Stack Layer 3 | — | Not a screen. Unchanged. |
| `/api/listings/inbound` | the Concierge's listing intake | — | Not a screen. **Its sibling — a close intake — does not exist.** |

## 2.2 The seven standalone screens

| Route | Automation | Question | Survives? | Becomes |
|---|---|---|---|---|
| `/segmentation/[clientId]` | 02 | Q15 | **Whole.** | The frame's first customer (§3.18). Two steps in a fixed order, step 1 a GET that writes nothing, step 2 one post. Gains **presented mode**; its index dies into the switcher. |
| `/calibrate/[clientId]` | 03 | Q23 | **Whole.** | Same. Nothing pre-filled when nothing is answered stays a hard rule. Index dies. |
| `/listings?client=` | 03 | "what has this agency got" | **Yes.** | Beneath the client; the inline picker branch dies. Still never triggers a run. |
| `/listings/[id]` | 03 | Q17 | **Yes, and gains a half it never had.** | It shows 03's matches and must also show 04's gate verdict (Q20). Today a property that cannot lawfully be advertised looks identical to one that can. |
| `/listings/[id]/triage` | 03 | Q18 | **Whole.** | The one screen that works today with no calibration. Presented mode. `chosen_by` stays the agency's person. |
| `/listings/[id]/exemption` | 04 | Q24 | **Yes, generalised.** | One of *N* requirement declarations, chosen from the policy row. It already refuses to guess when more than one requirement is exemptible; the redesign makes that the normal path rather than the guarded edge. |
| `/silence/[clientId]` | 03 §7 | Q19 | **Whole, including the absent button.** | Index dies. |
| `/review/[clientId]` | 05 | Q22 | **Whole, including the absent skip.** | Index dies. The three-counts-together layout is load-bearing and must survive any redesign of the page. |

**The four index pages — `/segmentation`, `/calibrate`, `/silence`, `/review` —
are the same file four times**, differing only in a copy constant, plus a fifth
copy inlined as a branch in `/listings`. Five implementations of *"which
client?"*. They are the clearest single argument that the frame is missing: the
absence of a client switcher was paid for five times.

## 2.3 What exists with no screen at all

Ordered by what it costs to leave invisible.

| Thing | Where it lives | Why the absence hurts |
|---|---|---|
| **The publication gate verdict** | `lib/publication/gate.ts` | 04's entire product. Refuses by naming a *requirement* in words. Invisible. |
| **The contact's send history** | `sends` (`gate_layer`, `gate_reason`, `gate_detail`) | Q14. The project names this the canonical question and has no surface for it. |
| **The campaign forecast** | `lib/send/campaign-plan.ts` → `probe-campaign.ts` | Q16. Designed in full including the staleness banner. |
| **The re-check notice** | `lib/publication/recheck.ts` | Q21. Four lapse causes, all reported, never the first found. |
| **The prepared piece** | `lib/publication/piece.ts` | What the agency actually publishes. Mentions registry throws on an id it cannot say. |
| **Close intake + party declaration** | `lib/review/close-intake.ts` | `CloseReport.source` admits `'whatsapp' \| 'cockpit'` and **no cockpit route produces one.** The type is asking for a screen. |
| **The template registry** | `lib/send/template-record.ts` | Q9. The file's own comment says recording is an operator action performed by hand. There is nowhere to perform it. |
| **The obligations register** | `lib/obligations.ts` | An obligation with no registered discharge turns a permission into a refusal; `staleAfterDays` exists and nothing watches it. |
| **Suppression / objections** | `lib/suppression.ts`, `consent_events` | Permanent and irreversible, keyed `(client_id, phone_e164)`. Nothing displays them. An irreversible act with no record on screen is the one that gets performed twice. |
| **The quality-rating halt** | `lib/send/quality.ts` | A halt that protects the number the Concierge runs on. No screen shows the rating, the halt, or that a campaign is frozen because of it. |
| **The proof book** | `db/tests/proofs.json`, `proof-bless.ts`, `proof-staleness.test.ts` | Q7. 22 proofs; staleness by hash; blocked proofs carrying `runnable_when`. Terminal only. |
| **The waiting room** | `legal/fonte/nota-questoes-*.md`, `WHERE-WE-LEFT-OFF.md` | Q5. Ten lawyer questions across three notes, Meta, ADENE, one agency. Markdown. |
| **The compliance watch** | §5.12 | Q6. Designed, unbuilt, explicitly assigned to this mindmap. |
| **The jurisdiction policy table** | `advertising_policy`, `jurisdiction_policy` | One unconfirmed row refuses every Portuguese property *and* every Portuguese send. The single highest-leverage row in the database has no screen. |

## 2.4 What exists that is not a screen and must not become one

- **Better Stack.** §4.9 is explicit: do not rebuild its dashboard. One status
  line, a timestamp, a link.
- **The agent match notification** (`lib/matching/notify.ts`). It is a WhatsApp
  message and its wording is unvalidated (§3.20). The cockpit may *show what was
  sent*; it must not become a second renderer of it — that is exactly the drift
  `anomaly.ts` refuses when it reuses the WhatsApp sentence verbatim.
- **n8n's execution view.** Anomaly rows already deep-link to it. Linking is
  right; mirroring is work done twice and maintained forever.

---

# §3. The frame

This is the part that must be right once.

## 3.1 The top-level object — **DECISION 1**

**The client is the top-level object. The client list is not the landing
screen.**

§3.17 says *"a client list as the top-level object rather than a lead list;
per-client health, volume and anomaly rollups so one screen answers 'which
client needs me today'."* The first half is right and the second half is the
part to argue with.

**Why the object is right.** Every noun below it is client-scoped: leads,
listings, imports, thresholds, declarations, closes, campaign runs, reports. The
consent ledger is keyed `(client_id, phone_e164)`. `client_automations` is the
join that says which automations a client runs. A lead list as the top-level
object was a category error; that much is settled.

**Why the landing screen is wrong.** Three reasons, in increasing weight.

1. **N is small and will stay small.** Two clients today; five to fifteen within
   a year. A list of six rows is not a list, it is a paragraph, and routing is
   not the expensive part of the operator's morning.

2. **A rollup is lossy in exactly the dimension that matters.** Two ambers at
   two clients read as two ambers. One is a lead that has waited ninety minutes;
   the other is an energy certificate expiring in twenty-seven days. Same colour,
   different decade of urgency. The operator's attention is allocated **by
   clock**, and a per-client rollup is a sort by *client*, which is the one
   dimension they do not need to sort by when there are six of them.

3. **The largest blockers on this project belong to no client.** One unconfirmed
   `advertising_policy` row refuses every Portuguese property. Meta's
   verification gates 02 and therefore 05. Ten lawyer questions gate four
   automations. If the frame's first act is "pick a client", the biggest items
   in the operator's week have no home, and they will be pushed into whichever
   client's screen they least badly fit.

**So:** the landing is **Today** — one cross-client worklist, ordered by what
has run out, each row naming its client and its clock. The **Clients** screen
exists, is one click away, and answers Q2, which is a real and different
question: *how is each client doing*, read deliberately, not triaged.

**The honest counter-argument, recorded.** Today's list is only as good as its
ordering, and an ordering across incommensurable clocks (minutes for an
escalation, days for a certificate, weeks for a lawyer) is a judgement this
project has refused to make elsewhere — §4.6 refuses to invent thresholds, and
this is a threshold. The answer is the same as §4.8's: **do not sort across
kinds; group by kind and put the kinds in a fixed order**, so the ordering is a
declared editorial decision rather than a computed number pretending to be one.
Fixed order: *waiting on a human* → *something went wrong* → *something has run
out* → *something is about to run out* → *waiting on someone else*.

## 3.2 How a client is selected — **DECISION 2**

**Client identity lives in the URL and is repeated inside the page, and the
switcher is a control in the chrome — never a page.**

```
/                          Today          (cross-client)
/clients                   Clients        (cross-client)
/c/<client>/…              everything beneath a client
/ops/…                     operator level, belongs to no client
/p/<client>/…              presented mode (§3.4)
```

Four properties this has to have, each of which is a defect we have already paid
for somewhere:

1. **The client is in the URL, always.** A screen whose subject is implicit is a
   screen that can be read about the wrong agency. Every standalone screen today
   prints the client's name under its `h1` — `/calibrate/[clientId]`,
   `/silence/[clientId]`, `/review/[clientId]` all do it. **That is not
   redundancy, that is the guard**, and it survives: the frame says whose screen
   this is, and the page says it again in its own words.
2. **Selection is never sticky across sessions.** A remembered client is a
   screen that looks current and is about somebody else — the same failure shape
   as the stale health stamp (§5.6) and the aged forecast
   (`campaign-evaluation-design.md` §5.0).
3. **Switching client never silently changes the subject of an action.** If a
   form is open, switching either carries the form's subject with it or refuses.
4. **The switcher dies in presented mode.** See below.

**What this kills:** five implementations of *"which client?"* — four identical
index pages and one inlined branch.

## 3.3 What is visible above the client level

`/ops/…`, and nothing here is a rollup of client data. These are the operator's
own obligations.

| Surface | Question | Built from |
|---|---|---|
| **Today** | Q1 | escalations + anomalies + expiries + blockers, grouped by kind |
| **Clients** | Q2, Q10 | derived per client (§3.6), never from `client_automations.health` |
| **Expiries** | Q3 | `recheckClearances`, `registrationsToConfirm`, obligation `staleAfterDays`, template approvals, quality rating, and the Layer 4 list (Twilio sandbox, WhatsApp tokens, TLS, Anthropic credit) |
| **Infrastructure** | Q4 | `health_runs` + Better Stack's one line (§4.9) |
| **The waiting room** | Q5 | who we are waiting on, what for, since when |
| **Compliance watch** | Q6 | §5.12, three severities |
| **The proof book** | Q7 | `db/tests/proofs.json` |
| **Onboarding** | Q8 | the form, extended to five automations |
| **Templates** | Q9 | `message_templates` |
| **Policy** | — | `advertising_policy` and `jurisdiction_policy`, read-only, with who confirmed and when |

## 3.4 The mode nobody has written down — **DECISION 3**

**Presented mode is a frame requirement.**

`segmentation/page.tsx` states it plainly in a comment: *"this screen is used in
a meeting with the laptop turned around: a nav bar listing other clients' leads
and queues is not a thing to show somebody."* That is not a styling preference.
It is a confidentiality property, and five screens have it:

| Screen | Who is in the room | What they do |
|---|---|---|
| the segmentation declaration | the agency's principal | declares, and the declaration is recorded in **their** name |
| thresholds / calibrate | the agency | answers eight questions about their own market |
| the triage floor | an agent | picks contacts; `chosen_by` is **them**, never the operator |
| the exemption declaration | the agency | declares an exemption in their name |
| close + party declaration | an agent | says who the party was |

There is therefore already a **second user** — an agency person operating the
screen through the operator's hands. This does not violate the no-client-login
decision; it predates and explains it. If the frame has no mode for it, these
five screens get built wrong for the second time, which is precisely the failure
§3.17 was recorded to prevent.

What presented mode is: a route prefix `/p/<client>/…`, no switcher, no other
client's name anywhere in the DOM, no cross-client counts, no navigation to
anything cross-client, and the client's name stated large. What it is not: a
different set of screens, or a client login.

**And it is testable, which is why it is a mode rather than a habit.** A probe
asserts that no page under `/p/<client>/` contains the name or id of any other
client. That is the sort of guard this codebase writes; a convention that lives
in reviewers' heads is not one.

## 3.5 What lives beneath the client

```
/c/<client>/                    the client's own landing — Q2 for one agency
       /escalations             Q11
       /anomalies               Q12
       /contacts                Q13 · Q14 · Q15 — the list
       /contacts/<phone>        the contact record: lead(s), ledger, sends, messages
       /leads/<id>              a lead row, reached from a contact
       /campaign                Q16 — the forecast, its runs, their ages
       /campaign/<run>          one run: permitted, refused, reasons, staleness
       /declaration             Q15 — segmentation, two steps
       /listings                what the agency has
       /listings/<id>           Q17 + Q20 — matches AND the gate verdict
       /listings/<id>/triage    Q18
       /listings/<id>/publish   Q20 in depth: requirements, facts, the piece
       /listings/<id>/exemption Q24
       /silence                 Q19
       /closes                  Q27 — the list, and recording one
       /closes/<id>             the party declaration
       /review                  Q22 — the reconciliation
       /thresholds              Q23
       /import                  Q25
       /import/<batch>          Q25 in depth
       /report                  Q26
       /settings                per-client config: automations on/off, areas, hours
```

## 3.6 The rollup has no source, and that is a finding

§3.17 asks for per-client health, volume and anomaly rollups.
`client_automations` has `health text not null default 'unknown'` and
`last_run_at timestamptz` — and **nothing in the repository has ever written to
either.** Every client reads `unknown` for ever.

Per §4.7 — *derive rather than infer* — the rollup is computed from artefacts,
never read from those columns:

| Column on the card | Derived from | Never from |
|---|---|---|
| is it running | most recent `automation_runs` row per `client_automation` | `health` |
| did it fail | `automation_runs.status = 'error'`, and `run.errored` events | — |
| is anyone waiting | `qualification.escalated` leads and their oldest wait | — |
| did it do nothing | invariant events (`invariant.violated`, `invariant.check_failed`) | — |
| is it blocked | the gate's own refusals: `thresholds_not_configured`, `policy_not_confirmed`, `no_ledger_basis` | — |

**And the two columns should be dropped or written to, not left.** A column
called `health` that always says `unknown` is a fallback asserting something
(§13), and the thing it asserts is that nobody has checked — which is true today
and will silently stop being true the moment somebody writes to it once.

## 3.7 The object the frame does not have a place for

**The contact.** A lead is `(client_id, phone)` in the `leads` table. The consent
ledger is keyed `(client_id, phone_e164)` and *"an objection outlives the lead
row that carried it"* — `lib/suppression.ts` says so and reads through
`consent_by_contact` for exactly that reason. `sends` rows are per phone. Import
dedupes on the number.

So the durable identity beneath a client is **the phone number**, not the lead
row, and Q13/Q14/Q15 are all questions about the number. The current
`/leads/[id]` is a lead-row screen and would answer Q14 wrongly by construction:
a refusal recorded against a number whose lead row was reverted by an import
undo is invisible to it.

**The frame's answer:** the contact is the addressable object
(`/c/<client>/contacts/<phone>`), and a lead is one thing that has happened to
it. This is a genuine correction to §3.17, which speaks of "the existing lead and
escalation views scoped beneath a selected client" and does not notice that one
of the two is scoped beneath the wrong noun.

**One cross-client fact worth recording and not building.** The same person can
be a contact of two agencies, and consent is per client, so a number that
objected at agency A may be lawfully contactable at agency B. That is correct in
law and surprising in a room. It is a sentence in the runbook, not a screen; a
cross-client contact view would be the operator reading one agency's data while
working on another's, which §3.17's confidentiality limit forbids.

---

# §4. The operator level

Nine surfaces. Only two of them exist.

## 4.1 Today — Q1

The landing. Groups in a fixed order, never sorted across kinds (§3.1).

1. **Waiting on a human** — escalated leads across all clients, longest first.
   This is today's `/queue`, unchanged in substance. Carries the outage banner:
   several escalations arriving at once with the same reason is one fault, not
   several leads.
2. **Something went wrong** — anomalies, last 7 days, grouped by kind, most
   recent occurrence with `N× since <time>`, four visible and the rest behind an
   expander that states the severity of what it hides. **This behaviour is
   already right and is transplanted, not redesigned** (§4.8): the order is not
   re-sorted to keep criticals visible, because that destroys the timeline.
3. **Something has run out** — an expired certificate, a revoked registration, a
   lapsed obligation discharge, a template rejected, a quality rating below
   green.
4. **Something is about to** — the 30-day warnings, the 90-day registration
   confirmations, Layer 4's predictable expiries.
5. **Waiting on someone else** — the waiting room's items with an age on them.

**Every row names its client.** A row that does not is an operator-level item,
and that is legible precisely because the rest do.

## 4.2 Clients — Q2, Q10

One card per client. Derived per §3.6. Columns: which automations are enabled,
whether each ran, whether anything is blocked and by what, how many people are
waiting, when the last anomaly was.

**What it must not become:** a scoreboard. A green/amber/red dot per client is
the rollup whose lossiness §3.1 rejects; the card states *facts with their
clocks*, and the operator does the comparing.

## 4.3 Expiries — Q3, Q21

The cross-client home for `recheckClearances()`, which is the largest thing in
the codebase with no surface. Its output shape is already right and the screen
follows it rather than reinterpreting it:

- **All applicable causes, never the first found.** An agency told only that the
  certificate expired buys a certificate, and the licence is still suspended.
- **Four causes said in four different sentences**: `certificate_expired`,
  `registration_revoked`, `requirement_arrived`, `requirement_unresolvable` —
  and the fourth is *"we cannot confirm this is still in order"*, which is not
  *"this is unlawful"* and must never be rendered as it.
- **`notCheckedFor` is on the screen.** `undefined` means not asked; `[]` means
  asked and none. §5k. The screen has three outcomes or it renders did-not-run
  as pass.
- **No verb claiming we acted.** §4.10 below.

Also holds: registrations to confirm (90 days, keyed by licence not property),
obligation discharges past `staleAfterDays`, template approval states, the
sender's quality rating, and Layer 4's calendar items — which §3.7 says are
adequately served by calendar reminders, so they appear here as *read*, with no
mechanism behind them, and the screen says so.

## 4.4 Infrastructure — Q4

Today's `/health`, demoted. Twelve checks, the last-run stamp as the biggest
thing on the page, absolute time beside relative. Plus §4.9's **one line**:
external monitoring healthy or not, last checked, a link through. Not a
dashboard.

**Its real question is narrower than its title.** Better Stack emails before
this page is opened, so nobody opens it to discover a fault. They open it to
*confirm* one — before telling a client the system is fine, or after an alert,
to see which of twelve checks went. Designed for that, it is a pre-flight
screen, and the last-run stamp is the whole of it.

## 4.5 The waiting room — Q5

Ten lawyer questions across three notes, Meta verification, ADENE credentials,
one agency's afternoon. Each with: who, what, since when, what it unblocks.

**The argument for it being a screen rather than a list in markdown** is the age.
*"Sent 17 September, unanswered"* is a fact that gets worse silently. A screen
with a clock on it is the only artefact that makes a two-week-old question look
like a two-week-old question.

**What it must not do:** chase anybody, or grow a "send reminder" button. It is
a record of what we are owed.

## 4.6 Compliance watch — Q6

§5.12 in full, and it is assigned to this mindmap by name. Sources: Meta's
Business Messaging Policy and platform changelog; CNPD; AEPD; EDPB; the AI Act
timeline; national ePrivacy transpositions for every jurisdiction in the policy
table. Three severities mirroring the alerting tiers — *act now* alerts on the
invariant channel, *review* within the week, *note* is context.

**The reviewed-state is the compliance artefact**, and therefore carries a name
and a timestamp, exactly as the segmentation declaration does. *"We monitor
regulatory change and here is the log"* is only worth something if the log says
who read what, when.

**And it must not summarise into an assertion.** A scheduled model reading legal
sources will eventually produce a confident sentence about a rule that changed
in a way it misread. Every item shows the source, the date and a link, and the
summary is labelled as ours.

## 4.7 The proof book — Q7

22 proofs, hash-based staleness, `blocked` proofs carrying `runnable_when`. All
of this exists and is good; what it lacks is a surface where *"this proof has
never been run"* and *"this proof's file changed since it was proved"* are
visible without a test run.

**Two states that must be distinct on the screen**, because collapsing them was
a real defect (§1n): `last_proved: null` — never proved — and a hash mismatch —
proved once, moved since. The first is an absence and the second is a
regression.

**No blessing from the screen.** Blessing is a claim that a human ran something,
and a button is how that claim gets made by accident. It stays a command with an
id.

## 4.8 Onboarding — Q8

Today's form, and the gap is that it writes **one** `client_automations` config
while there are five automations. Onboarding a client now means: the agency row,
the WhatsApp number and sender, the timezone and locale, the calendar identity
(§3.2 — still Internal-only), the areas (§3.14, hardcoded today), the Concierge
config, the AMI licence number (04, once per client), the review destination
(05, `0034`), and the two things that are *not* forms — the declaration and the
calibration, which are conversations with their own screens.

**So onboarding becomes a checklist that links out**, not a longer form. The two
items it cannot complete are the two that matter, and a checklist that shows them
as outstanding is honest; a form that omits them implies a client is onboarded
when nothing may yet be sent to anybody.

## 4.9 Templates and policy — Q9

`message_templates`: what Meta approved, in which language, in which category,
with the approval id and the source document. Recording stays an operator action
performed by hand, per `template-record.ts`, and the screen is where it is
performed. The risk that file names — a mistyped `HX…` is accepted here and
refused by Twilio at send — is stated **on the screen**, not only in the source.

Alongside it, read-only: `advertising_policy` and `jurisdiction_policy`, with
`confirmed_at` / `confirmed_by` shown per row. One unconfirmed row is refusing
every Portuguese property today; it deserves to be visible as one row with a
blank in it.

**Confirmation is never a control here.** The whole value of `confirmed_by` is
that it names a lawyer who actually said so. A button in the cockpit makes it
name whoever clicked, which is `campaign-evaluation-design.md` §5.2's argument —
*a system that would let us fake a lawyer's confirmation in order to test itself
is a system whose confirmations mean nothing.*

## 4.10 One rule spanning all nine

**No operator-level surface may carry a verb claiming we acted on the outside
world.** `recheck.ts` states it: we cannot withdraw a post we did not publish,
and a notice that reads like an action is worse than one that reads like a
warning. A test already fails on any such verb, and the guard asserts its own
cases before using them — because the first version listed only masculine
singular participles and every noun in that feature is feminine.

---

# §5. Mobile

## 5.1 The position

**Two screens earn a phone. One of them is read-only. The best mobile
improvement is not a screen.**

The cockpit is a desk instrument. Most of its screens are wide, comparative, or
used in a meeting — a declaration, a forecast, a reconciliation, a batch
mapping, a calibration. None of them improve on 390px and all of them get worse.

## 5.2 What earns a phone

| Screen | Why | Constraint |
|---|---|---|
| **Today** | The alert arrives on a phone. The next question — *what else, and how bad* — is asked from a car park, and it is the only question that cannot wait for a desk. | **Read-only.** No action reaches out of it except a phone call to a human. |
| **A transcript** | An escalation WhatsApp at 20:40 raises *what did the lead actually say*. Reading it is the difference between calling now and calling tomorrow. | **Read-only.** See below. |

## 5.3 What explicitly does not

Anomaly detail beyond the summary; the client list; the forecast; every
declaration; thresholds; triage; the silence; the review reconciliation; import
and mapping; the weekly report; onboarding; templates; policy; the proof book;
expiries; infrastructure. Fifteen-odd screens, and the reasoning is one sentence
each: none of them is opened in the ninety seconds after an alert, and every one
of them is a decision better made at a desk.

## 5.4 The composer is desktop-only, and that is the sceptical part

The lead panel's composer is guarded — `lib/draft.ts` refuses invented times and
dates, and a draft that trips a guard is **replaced** by the client's handoff
note rather than edited, because a plausible-looking remainder is what nobody
re-reads. Those guards work identically on a phone.

What does not survive the phone is the operator. A reply is irreversible, it is
sent in an agency's name, and the failure mode of a thumb at a traffic light is
not a typo — it is sending the almost-right thing because editing was awkward.
**So: read the transcript on a phone, reply from a desk.** The phone view of a
lead shows the conversation and a *call* affordance, and says in words that the
reply is at the desk.

## 5.5 The screens that must refuse a phone, not shrink to fit

For everything in 5.3, the honest phone behaviour is **a refusal**: this needs a
desk, here is why, here is the client it belongs to.

A declaration table squeezed onto 390px is worse than no declaration screen on a
phone, because it invites somebody to run a declaration meeting from one — and
that meeting's entire product is a considered answer from an agency principal
with a name attached (§1.1 of the segmentation design). The layout would be
making a promise the process cannot keep.

This is a real inversion of the current Shell, which is built phone-first: a
fixed bottom tab bar, four tabs, and a More sheet, with the 755px body-widening
lesson behind it. That apparatus is currently serving screens that should refuse
the phone outright.

## 5.6 The real mobile surface is the alert, and it already exists

`lib/anomaly.ts` states the principle exactly: the row renders the event's own
`summary`, *the same sentence the WhatsApp carries*, because it was judged
readable on a phone at 1am and a second formatter would drift from it.

That is the mobile design already decided and it points somewhere the brief does
not: **the highest-value mobile work is making the alert sufficient, so the
phone screen is not opened at all.** An escalation WhatsApp that carries the
client, the wait, the lead's last message and the reason answers the car-park
question without a browser. Every minute spent on that beats a minute spent on a
responsive layout for a screen nobody should open while driving.

**One thing not to do:** push notifications for *show me later* items. §3.7's
severity tiers say it plainly — alert on everything and it is muted within a
week, and the muting takes the *wake me* tier with it.

---

# §6. States

## 6.1 The vocabulary — ten, not five

The brief names five. This codebase has earned ten, and the four it adds are the
ones that have cost real defects.

| # | State | What is true | The failure it prevents |
|---|---|---|---|
| **S1** | **Resting** | Nothing has happened, and that is the designed outcome | `/queue`'s *"Nobody is waiting… this is the resting state, and it is the one you want"* |
| **S2** | **Never** | Nothing has *ever* happened — no run, no record, no first time | `last_proved: null` sitting green (§1n). "Ran and found nothing" and "has never run" are opposite claims in the same blank space |
| **S3** | **Did not run** | A precondition was not met, so the check did not execute | §5k. `undefined` ≠ `[]`. `?? []` is the entire defect. **Must reach the screen or it renders as pass** |
| **S4** | **Broke** | We asked and the query failed | §5b. An error must never be quieter than a refusal |
| **S5** | **Refused** | The system decided not to act, and the decision is the product | `thresholds_not_configured`, `policy_not_confirmed`, `no_ledger_basis`. Not an error and not an empty |
| **S6** | **Partial** | Some of the answer, and the screen knows how much | Anomalies capped at 500 and marked `500+` rather than silently under-counted |
| **S7** | **Partial and blind** | Some of the answer and the screen does not know it | The state to design *out of existence*, never to render |
| **S8** | **Stale** | True about a past moment, false about now | Two kinds: **by clock** (a health run 25 minutes old) and **by input** (a forecast older than the policy row it refused on) |
| **S9** | **Frozen** | Correct, current, and unchangeable because somebody acted on it | `0025`'s freeze on notified matches; `0017`'s allowlist freeze |
| **S10** | **Withheld** | We hold an answer or a capability and deliberately do not offer it | The per-sale skip; contact-them-all. A visible absence, stated on the page |

**S1 through S4 occupy the same blank rectangle**, and picking the plausible one
is a fabrication with good manners. Every read in the redesign returns which of
the four it is, or the screen must say it does not know — which is itself S3.

## 6.2 Where each state stands today

- **S3 done right:** `/review/[clientId]` renders `REVIEW.notChecked` when
  `report.checked` is false. `/listings/[id]` renders `MATCHES.notCalibrated`
  with a link to the thresholds. `recheckClearances` returns `notCheckedFor`.
- **S5 done right:** `planMatchRun` returns `thresholds_not_configured` naming
  all six missing keys. The gate refuses by layer and reason with an operator
  sentence attached.
- **S8 done right:** `/health`'s stamp — absolute time beside relative, stale
  after 25 minutes, *"a relative time on a page left open overnight says '5
  minutes ago' for twelve hours."*
- **S4 done badly, everywhere.** Every read throws on a query error —
  `silence-read.ts`, `screen-read.ts`, `review/screen-read.ts` all do
  `if (error) throw new Error('… read failed: …')`. **Throwing is right**: it is
  loud and it cannot be mistaken for an empty. But there is **no `error.tsx`
  anywhere in `app/`**, so the result is Next's generic error page, which loses
  the sentence the throw carefully wrote, takes down every other panel on the
  screen, and does not say which client it was about. The redesign owes an error
  boundary per surface that renders the thrown sentence.
- **S2 not distinguished anywhere.** `/silence` says *"nobody has said anything"*
  whether no lead ever existed or every lead has spoken recently — it does
  separate `unknownClock` and `recentlySpoken` from the headline, which is the
  right instinct applied to a different axis.
- **S7 is the one to hunt.** Any read with an implicit limit and no count is in
  it.

## 6.3 Per screen

Only states that are actually reachable are listed. "Says" is the obligation,
not the copy.

### Today
- **S1** nothing in any group — *"nothing is waiting, nothing has run out"*, and
  it names the window it looked at.
- **S2** no client has any automation enabled — different sentence.
- **S3** one group's source unavailable — that group says so **and the rest of
  the page still renders**. A partial Today is correct; a blank Today because one
  read failed is not.
- **S4** a read threw — the group shows the thrown sentence and the client, if
  known.
- **S6** a group capped — `500+`, never a silent cap.
- **S8** the page is a live read; it carries a rendered-at stamp because it is
  the screen most likely to be left open.

### Clients
- **S1** clients exist, nothing notable — the cards still show their clocks.
- **S2** no clients at all — the onboarding link, as `/report` and `/import`
  already do.
- **S3** a derived column unavailable for one client — that cell says *not
  checked*, never a dash that reads as zero (§5i: casting an absence is a
  decision to invent).
- **S4**, **S6** as above.

### Expiries
- **S1** everything checked, nothing lapsing — *"checked N clearances, none
  lapsing"*, with N, because a bare "all clear" is indistinguishable from
  nothing to check.
- **S2** no clearances have ever been granted.
- **S3** 🔴 **the state this screen exists to render.** `notCheckedFor` names
  what could not be checked and why. Four hundred properties reported as
  problems from a missing argument is the defect that produced §5k.
- **S4** a policy read failed — and it is *not* rendered as
  `requirement_unresolvable`, which is a finding about the world, not about us.
- **S5** not applicable — this screen reports, it does not decide.
- **S8** the re-check's own last-run age, because a clearance list is only as
  current as the sweep that made it.

### Infrastructure
- **S1** twelve green.
- **S2** never run — *"Never"*, which the stamp already renders.
- **S4** the health read failed — distinct from twelve red.
- **S8** stale after 25 minutes, and the staleness is louder than the checks.
- Better Stack's line has its own S3: *we could not ask the monitor* ≠ *the
  monitor says nothing is wrong.*

### The waiting room
- **S1** nothing outstanding.
- **S8** intrinsic — every row is an age, and the age is the content.

### Compliance watch
- **S1** the sweep ran and found nothing — with the date and the source list.
- **S2** never swept.
- **S3** 🔴 some sources unreachable — **named**, because a sweep that read four
  of six sources and reports nothing is asserting something about two sources it
  never opened.
- **S8** the sweep's age, prominently: a compliance log that has not run for
  three weeks is worse than none, for the same reason as the health stamp.

### The proof book
- **S1** all proofs current.
- **S2** 🔴 a proof never run (`last_proved: null`) — distinct from stale.
- **S8** a hash mismatch — proved, then the file moved.
- **S3** a blocked proof whose `runnable_when` path does not yet exist — *not
  yet runnable*, which is neither pass nor fail.

### Onboarding
- **S1** the form, empty.
- **S5** validation refusals — an invalid IANA zone, a phone that fails the
  country-aware check, a calendar that probes as unreachable.
- **S4** the calendar probe could not run — 🔴 distinct from *the calendar is
  wrong*. A wrong calendar id returns 200 with `busy: []` and hides the failure
  in `calendars[id].errors`; that lesson is C1's first find and it lives here.

### Templates / policy
- **S1** approvals recorded.
- **S2** none ever recorded — which is today, and is the true reason 02 and 05
  cannot send.
- **S5** a malformed `HX…` refused at recording.
- **S8** an approval whose status may have changed at Meta since we wrote it
  down — stated as *unverified since <date>*, because nothing syncs.

### The client landing
- **S1**, **S2**, **S3**, **S4** as Clients, scoped.

### Escalations (client)
- **S1** *"nobody is waiting"* — the resting state, wanted.
- **S2** this client has never had a lead.
- **S4** the read failed.
- **S6** capped at 100 today; the cap must be visible.

### Anomalies (client)
- **S1** none in the window — **and the window is named**, since "no anomalies"
  over seven days and over one hour are different claims.
- **S2** none ever.
- **S6** grouped, `N× since`, four visible, the expander stating the severity of
  what it hides.
- **S9** anomalies are history and are never dismissed — until the false-positive
  rate is known (§4.8's deferral, with its trigger).

### The contact record
- **S1** a contact with no messages, no sends, no consent events — real after an
  import and before any contact.
- **S2** the number is not known to this client at all.
- **S3** the ledger read succeeded and the sends read did not — the panels are
  independent and one saying *not checked* is correct; a blank page is not.
- **S5** 🔴 **the answer to Q14.** Every refusal with its layer, reason, operator
  sentence and date. `objected` renders as permanent; `no_ledger_basis` renders
  as the declaration being missing, with a link to it.
- **S8** 🔴 a refusal is a fact about a past moment. *"Refused 22 Sep: Portugal
  not confirmed"* about a Portugal confirmed on the 20th must say so.
- **S9** an objection is permanent and irreversible, and the screen says so.

### The forecast
- **S2** never evaluated for this client.
- **S5** the forecast is mostly refusals and that is the product working.
- **S6** the refusal groups expand to contacts, each with the gate's own
  sentence.
- **S8** 🔴 **the state this screen was designed around.**
  `campaign-evaluation-design.md` §5.0: the age in the header with a "26 days
  ago", a banner when any input is newer than the run naming which reason is
  stale, and *re-evaluate* offered from the banner rather than buried.
- **S3** a policy or ledger read failed during planning — `PlanDiagnostics`
  exists for exactly this and must reach the screen.

### The declaration
- **S2** nothing declared yet — the normal state, and today's universal one.
- **S1** every group declared.
- **S6** some groups declared, some not — and the undeclared ones are *not*
  treated as a default.
- **S10** proposals are never pre-selected.
- **S9** a declaration is append-only; a correction supersedes and names its own
  author.

### Listings
- **S1** none available.
- **S2** none ever.
- **S5** the client has no listing-capable automation configured.

### Listing matches + gate (Q17 + Q20)
- **S5** 🔴 twice over, and they are different refusals that today look
  identical: `thresholds_not_configured` (03, we cannot rank) and
  `policy_not_confirmed` (04, it may not be advertised). Both must be on the
  page and distinguishable at a glance.
- **S1** calibrated, ran, matched nobody — a real and different answer.
- **S9** a notified match is frozen (`0025`) — visible as frozen, not as
  editable-and-quietly-refused.
- **S3** the gate could not resolve the jurisdiction — *we cannot say what this
  region requires* ≠ *this may not be advertised*.

### The triage floor
- **S1** contacts exist, none chosen yet.
- **S2** the client has no contacts — *"the list is empty"*.
- **S6** chosen-so-far count beside the remaining.
- **S10** no ranking, no scores, no suggestion order that implies one.

### The silence
- **S1** people spoke and none are silent past the threshold.
- **S2** 🔴 nobody ever said anything — already distinguished today via `toldUs`,
  and it is the model for the rest.
- **S6** the denominator always, plus `unknownClock` and `recentlySpoken` shown
  *beside* the headline rather than folded into it.
- **S10** 🔴 no contact-them-all. Permanently.

### Closes and the review reconciliation
- **S2** nothing has ever closed — today's state for every client.
- **S3** 🔴 `report.checked === false` — the reconciliation did not run. Already
  right.
- **S5** the disposition's seven reasons, none able to express a judgement.
- **S6** 🔴 the three counts together — closes, asked, pending — with the gap
  explained beside them. **Contested by design**: the numbers disagree, and the
  disagreement is displayed so it is not investigated as a defect.
- **S10** 🔴 no per-sale skip. Permanently.
- **S8** `not_in_service` is dated — a close whose window ran before an approved
  template existed is not an omission, and this must not flip when Meta approves
  one.

### Import
- **S1** no batches yet.
- **S6** staged, committed, reverted — three states already rendered.
- **S5** rows rejected at parse or normalisation, with the reason.
- **S9** a committed batch's created leads are revertible; a batch whose leads
  have since been messaged is not, and it must say which.

### The weekly report
- **S2** no clients.
- **S1** a week with no activity — *"nothing happened this week"* is a legitimate
  report and must not look like a broken one.
- **S3** `metrics_daily` missing days — named, not interpolated. **Never publish
  a number you computed as though it were a fact about the world** (§5j).

---

# §7. Actions, and the absences that are features

## 7.1 The absence register

These are not "not built yet". They are load-bearing, each is guarded by
something, and the redesign inherits both the absence and its guard.

| Absence | Screen | Why | Guarded by |
|---|---|---|---|
| No **contact-them-all** | the silence | Reaching these people is consent-gated and paced; a button on a screen designed to produce indignation is how a database gets burned in an afternoon | The page imports no action; the intent is stated in the file |
| No **per-sale skip** | review reconciliation | §8.B — asking everyone is permitted, choosing whom to ask is not. A skip button is the offence with an audit trail showing who committed it | The page cannot grow a control; `CloseRow`'s key set is asserted whole — **and that guard works only because `npm test` runs `tsc` first** |
| No **seventh disposition reason** | review | A reason able to express a judgement re-introduces the choice | Closed vocabulary; a seventh fails a test that tells you to come and write down what it is for |
| No **matching run trigger** | listings | A refresh must not rewrite match rows, and on a notified listing that is an attempt to change a record somebody acted on | `0025`'s freeze; the screen states it |
| No **pre-filled thresholds** | thresholds | A pre-filled field collects a click, not a decision — and the click is then recorded as an agency's judgement about their own market | §4.6; nothing is pre-filled until something is answered |
| No **pre-selected proposal** | the declaration | Same rule | The segmentation design §4 |
| No **withdraw / correct verb** | the re-check notice | We cannot withdraw a post we did not publish, and a notice reading like an action closes a problem that is still live | A test fails on any such verb — and the guard asserts its own cases first, after three feminine nouns walked past it |
| No **send** anywhere in 05 | the review runner | Gated on Meta | The whole of `src/lib/review/` is swept for a route to a send |
| No **listing on the send path** | 02 / 03 | 03's lead-facing send needs both gates | `two-gates.test.ts`, written before any 04 code, fails with a filename |
| No **`?? []`** | the re-check | Did-not-run and none-found are opposite meanings in the same blank space | §5k |
| No **lawyer confirmation from the UI** | policy | A system that can fake its own confirmations has confirmations that mean nothing | `campaign-evaluation-design.md` §5.2 |
| No **bare `proof:bless`** | the proof book | A claim made about four things when one was intended is three lies | Requires an id, or an explicit `--all` that never first-blesses |
| No **invented time or date** | the composer | Any specific time is invented by definition — the assistant is given no slot list | `lib/draft.ts`; a tripped guard **replaces** the draft rather than editing it |

## 7.2 Absences the redesign must add

| New absence | Where | Why |
|---|---|---|
| **No cross-client bulk action, ever** | everywhere above the client | A control acting on N clients turns one mistake into N incidents. The frame makes this newly possible and it must be closed at the frame |
| **No re-evaluate-everything** | the forecast | Re-evaluation is per client, deliberately, and is offered from the staleness banner |
| **No anomaly dismiss** | anomalies | §4.8 defers it *with a trigger*: only if a kind is still firing after its cause is understood |
| **No editing a declaration** | the declaration | Append-only. A correction is a new declaration with its own author |
| **No reviewed-without-a-name** | compliance watch | The reviewed state is the compliance artefact; an anonymous one is worth nothing |
| **No reply from a phone** | the contact record | §5.4 |
| **No layout for the desk-only screens on a phone** | fifteen screens | §5.5 — a refusal, not a squeeze |

## 7.3 What each screen can do

| Screen | Actions |
|---|---|
| Today | Navigate. Nothing else. |
| Clients | Navigate; open onboarding. |
| Expiries | Navigate to the listing or client. **Notify the agency** — and the notice claims only that they were told. |
| Infrastructure | Nothing. A link to Better Stack. |
| The waiting room | Add, close, annotate an item. No chasing. |
| Compliance watch | Mark reviewed, with a name. Set severity once, by hand, on an item the sweep got wrong. |
| The proof book | Nothing. Read-only by design. |
| Onboarding | Create a client; validate a calendar; configure per automation; link to the two conversations it cannot perform. |
| Templates / policy | Record an approval. Read policy. Never confirm one. |
| Escalations | Open a lead. |
| Anomalies | Open the lead; open the n8n execution. |
| Contact record | Reply (desk only); hand back to the AI; record an objection — **irreversible, and it says so before and after**. |
| The forecast | Evaluate; re-evaluate; export refusals; send — **and the send is gated, staged at ten, watched, with a named person accountable before the first one.** |
| The declaration | Declare a group, once, in the agency's name. |
| Listings | Navigate. |
| Matches + gate | Navigate to triage, to the exemption, to thresholds. Never run a match. |
| Triage | Choose contacts, recorded as the agent's choice. |
| The silence | **Nothing.** |
| Closes | Record a close; declare the party. Never skip one. |
| Review | **Nothing.** |
| Thresholds | Save answers, attributed. |
| Import | Upload, map, plan, commit, revert. |
| Report | Generate and send. |

---

# §8. Where I think you are wrong

## 8.1 "Nine screens were built standalone"

Seven. The campaign forecast is `npm run probe:campaign` and the publication
re-check notice is a library function with no caller in `app/`. Both are
client-level answers to compliance questions, and carrying them in the mindmap as
existing budgets zero design for the two whose absence costs most.

**And a third is missing that is not on the list at all: 04's publication gate
has no screen whatsoever.** The refusal that is the entire product of Automation
04 — *this property may not be advertised, and here is the requirement that is
missing* — reaches no surface. Today every Portuguese property refuses
`policy_not_confirmed` and there is no way to see that except a probe. Along
with it: the prepared piece, the close intake (whose type already admits
`source: 'cockpit'`), the template registry, the obligations register, the
suppression record, and the quality-rating halt. The inventory is not nine
screens plus the old cockpit; it is seven screens, the old cockpit, and **about
a dozen things with no surface at all.**

## 8.2 "A client list … so one screen answers which client needs me today"

The client list answers *which client has the most red*, which is a different
question. Attention is allocated by clock; a rollup sorts by client, and with six
clients that is the one dimension that needs no sorting. Worse, the operator's
largest blockers — one unconfirmed policy row, Meta, ten lawyer questions —
belong to no client at all, and a client-first frame gives them no home. §3.1.

I am not disputing the top-level *object*. That part is right and is the whole
value of §3.17.

## 8.3 "The existing lead and escalation views scoped beneath a selected client"

The lead view is scoped beneath the wrong noun. The durable identity is the
**phone number**: consent is keyed `(client_id, phone_e164)`, an objection
outlives the lead row, `sends` are per number, import dedupes on it. A lead-row
screen answers Q14 wrongly by construction. §3.7.

## 8.4 The frame has a second user and the brief does not mention one

Five built screens are used with the laptop turned around, in a room with the
agency: the declaration, the calibration, the triage floor, the exemption, and
the close. `segmentation/page.tsx` says so in a comment and `triage-actions.ts`
records `chosen_by` as the agency's person, not the operator. **Presented mode is
a frame decision**, and if it is left to styling, those five get built wrong for
the second time — which is exactly the failure §3.17 exists to prevent. §3.4.

## 8.5 "What can move is the cockpit" — true, and less useful than it sounds

It is genuinely the only thing that can move. But §3.17's standard is *reading it
reduces work*, and there is no work yet to reduce: two clients, two leads, one
listing, zero matches, zero closes, zero campaign runs, zero sends. Every
volume decision in the redesign — what groups, what paginates, what folds behind
an expander, how many rows before a cap — is a guess about a workload nobody has
had.

That is the same shape as the thresholds, and it deserves the same discipline
rather than the same refusal: **build it, and mark every volume decision as a
guess with its reasoning attached**, the way `notify.ts` marks the five-name cap
and the way §4.8 chose grouping over pagination *and said why*. What would be
wrong is quietly treating today's emptiness as evidence that a design is right.

## 8.6 "Mobile: most of it does not improve on a phone"

Agreed, and the conclusion is too soft. The answer is not *don't build mobile for
them* but **refuse the phone for them** — an explicit "this needs a desk". A
declaration table squeezed onto 390px invites somebody to run a declaration
meeting from a phone, and that meeting's product is a considered answer from a
named principal. And the highest-value mobile work is not a screen at all: it is
making the alert sufficient so the phone screen is never opened. §5.5, §5.6.

## 8.7 "Before any design or code, write me the mindmap"

This document *is* a design. It does not choose layouts, but it chooses the URL
shape, the object model, a landing screen, a mode, and ten state names — and
every one of those is harder to change later than a stylesheet. I have marked
the three that need a yes as **DECISION 1/2/3**. Treating the rest as settled
because they arrived inside something called a mindmap would be the same move as
a green node reporting success.

## 8.8 Two screens whose question is narrower than their title

- **Health.** Nobody opens it to *discover* a fault; Better Stack emails first.
  Its real question is *confirm it is fine, right now, before I tell a client so*
  — which makes it a pre-flight screen, not a daily one, and the last-run stamp
  is the whole of it.
- **The weekly report.** The client never logs in. Its question is *what do I
  send them on Monday*, so its output is a document and the page is a preview.
  Designed as a page, it is a screen the operator reads instead of the person it
  was written for.

---

# §9. What this mindmap does not decide

Recorded so none of it is assumed settled.

1. **Layout, typography, components.** Nothing here.
2. **Build order.** Every operator-level surface is new; most client-level ones
   exist. Sequencing needs a conversation about what the first real client's
   first week actually looks like.
3. **Whether Today's fixed group order is right.** It is a declared editorial
   decision (§3.1) and it is the first thing a week of real use would correct.
4. **Volume behaviour.** §8.5. Guesses with reasoning attached.
5. **Whether the old Shell survives at all.** Its phone-first architecture serves
   screens that §5 says should refuse the phone. That is a rewrite, and it is
   not decided here.
6. **The second user's identity.** Presented mode has no authentication and needs
   none today — the operator is driving. If an agency ever drives it themselves,
   that is a different decision and it reopens the no-client-login question.
7. **What happens to `client_automations.health` and `last_run_at`.** Dropped, or
   written to. Left as they are, they are a fallback asserting something nobody
   chose (§3.6).
