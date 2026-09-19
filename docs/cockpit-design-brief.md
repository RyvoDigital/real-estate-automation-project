# Cockpit design brief — the frame and the operator level

**Written 19 September 2026.** Companion to `cockpit-mindmap.md`, which maps all
twenty-seven questions. This one specifies **the frame and the nine
operator-level surfaces** to the depth a design can be drawn against.

**What a brief is here:** constraints, stated so that a design cannot quietly
drop one. For each screen — the question it answers, every state it must carry,
what the operator can and cannot do, the exact data it reads, and what about it
is legally load-bearing.

**What it is not:** layout, hierarchy, typography, colour, component choice,
density, or visual direction. None of those are decided here and none of them
are implied. Where a constraint sounds like a layout instruction — *"the three
counts are side by side"*, *"the last-run stamp is the biggest thing"* — it is
because the arrangement is carrying the meaning, and those are marked
🔒 **structural**. Everything unmarked is yours.

**Client-level screens (Q11–Q27) are not in this document.** Deliberately: the
frame and the operator level are worth having right rather than having all
twenty-seven half-specified.

---

# §0. What is already decided

## 0.1 The three decisions, taken

| | Decision | Consequence for the design |
|---|---|---|
| **D1** | The client is the top-level object | Every noun below it is client-scoped. `clients` is the spine, not `leads`. |
| **D2** | The landing is a cross-client worklist, not the client list | Sort by what has to happen, not by volume of problems. The client list exists and answers a different question. |
| **D3** | Presented mode is a frame property | A second user exists — an agency person operating a screen through the operator's hands. §1.4 is its contract. |

## 0.2 The two corrections, taken

**The contact, not the lead, is the addressable object beneath a client.**
`consent_events` is keyed `(client_id, phone_e164)` so that an objection
survives revert, dedupe and re-import — `lib/suppression.ts` reads through
`consent_by_contact` for exactly that reason, and says so: *"an objection
outlives the lead row that carried it."* A lead-scoped screen shows a person's
history with the part that matters most missing.

**`client_automations.health` and `last_run_at` are derived and the columns are
dropped.** Nothing has ever written to either. A column nobody writes to is a
fallback asserting that nobody has checked (§13), and it stops being true the
first time anyone writes to it once — the same shape as the flat publication
columns `0032` dropped. The migration that drops them proves they are empty
first, as `0032` did.

## 0.3 The rule for defaults

> Where a number decides **what an operator is shown**, rather than **whether
> something is sent**, it may be defaulted — with its reasoning written down and
> with what would prove it wrong.

This is not a new rule and not a relaxation of §4.6. The codebase already draws
the line and states it in `recheck.ts`, beside `WARN_WITHIN_DAYS = 30`:

> *"A guess, and stated as one — but not the kind §4.6 refuses to default. That
> rule exists because a wrong matching threshold silently spams a database or
> silently hides a buyer. This decides how early somebody is told about a date
> that is already in the row… neither reaches a lead or publishes anything.
> **Different blast radius, different treatment.**"*

Every number in this brief is in §1.12, with what it decides, its blast radius,
why that value, and the observation that would change it.

## 0.4 The universal contract — every surface, without exception

Five properties. A design that drops one has dropped a defect back in.

1. **Which of the ten states it is in is always answerable from the screen.**
   Never inferable only from the absence of content. (§1.6)
2. **Every number carries its denominator or its scope.** A count with neither
   is a claim about the world computed from a query. (§1.9)
3. **Every time carries an absolute alongside any relative.** (§1.8)
4. **Every assertion carries its author and its date where a person made it.**
   (§1.10)
5. **A read that failed says so where it failed, and the rest of the screen
   still renders.** (§1.7)

---

# §1. The frame

## 1.1 The object model

```
operator level          belongs to no client. The operator's own obligations.
  └── client            the top-level object. `clients.id`.
        └── contact     the durable identity: (client_id, phone_e164).
              └── lead  one thing that has happened to a contact.
        └── listing     a property.
        └── close       a transaction.
        └── batch       an import.
        └── run         a campaign evaluation or send.
```

Two rules that fall out and must not be softened:

- **Nothing at the operator level is a rollup of client data being used to rank
  clients.** Operator-level surfaces hold the operator's own obligations —
  expiries, blockers, proofs, law, infrastructure. The Clients screen states
  facts per client; it does not score them.
- **Nothing crosses from one client to another.** No screen shows two clients'
  contacts, leads, listings or contents together. Counts per client on a
  cross-client screen are fine; contents are not. (§3.17's confidentiality
  limit: *the clients' side limited to what he can actually help with, never
  anything confidential.*)

## 1.2 The URL shape

```
/                        Today
/clients                 Clients
/ops/expiries            Expiries
/ops/infrastructure      Infrastructure
/ops/waiting             The waiting room
/ops/compliance          Compliance watch
/ops/proofs              The proof book
/ops/onboarding          Onboarding
/ops/templates           Templates
/ops/policy              Policy (read-only)

/c/<client>/…            everything beneath a client
/p/<client>/…            presented mode
```

**The client is in the URL, always.** A screen whose subject is implicit is a
screen that can be read about the wrong agency. This is not a routing
preference; it is the guard that makes the switcher safe.

## 1.3 The client switcher — contract

| | |
|---|---|
| **What it is** | A control in the chrome. Never a page. |
| **What it kills** | Five implementations of "which client?" — `/segmentation`, `/calibrate`, `/silence`, `/review` (four near-identical index pages) and the inline picker branch in `/listings`. |
| **Persistence** | Not sticky across sessions. A remembered client is a screen that looks current and is about somebody else. |
| **Switching with a form open** | Either carries the form's subject with it, or refuses and says why. Never silently re-points an in-progress declaration, threshold answer or close at a different agency. |
| **Redundancy is required** | The page states whose screen it is **in its own words**, independently of the chrome. Every standalone screen already prints the client name under its `h1`. That is not duplication; it is the check. 🔒 **structural** |
| **Absent in presented mode** | §1.4. |

## 1.4 Presented mode — contract

**Why it exists.** Five screens are used with the laptop turned around, in a
room with the agency. `segmentation/page.tsx` states it: *"this screen is used
in a meeting with the laptop turned around: a nav bar listing other clients'
leads and queues is not a thing to show somebody."* `triage-actions.ts` records
`chosen_by` as the agency's person, not the operator. There is a second user.

**Which screens have it** (all client-level, listed here because the mode is a
frame decision): the segmentation declaration, thresholds/calibrate, the triage
floor, the exemption declaration, close and party declaration.

**The contract:**

| | |
|---|---|
| Route | `/p/<client>/…` |
| Chrome | No switcher, no cross-client navigation, no cross-client counts, no operator-level links |
| DOM | **No other client's name or id appears anywhere in the served HTML**, including in `<option>` elements, data attributes, JSON payloads and inline scripts |
| Identity | The client's own name is stated prominently — the person in the room must see their own name, not infer it |
| Authentication | None beyond the operator's. The operator is driving. This is not a client login and does not reopen that decision |
| Enforcement | 🔒 A probe asserts the DOM property above, per client, for every `/p/` route. A convention living in reviewers' heads is not a control |

**What presented mode is not:** a different set of screens, a read-only mode, or
a theme. The same screen, the same actions, without anything that would expose
another agency.

## 1.5 The chrome

**Always visible:** where you are (operator level, or which client), the client
switcher when at client level, and one count — *how many things on Today are
waiting on a human*. Nothing else earns permanent space.

**Never visible:** cross-client totals that mix kinds into one number; any
badge that aggregates incommensurable clocks into a colour; another client's
name in presented mode.

**The existing Shell does not survive as-is.** It is phone-first — a fixed
bottom tab bar, four tabs, a More sheet, built around the 755px body-widening
defect. §1.13 says most operator screens should refuse the phone, so that
apparatus is serving screens that should not be there. Its *lessons* survive
(two element sets rather than one that changes shape; a precise `active` value;
never letting a desktop rule reach the phone layout); its structure does not.

## 1.6 The ten states — rendering contract

Every read in the cockpit answers which of these it is. Where it cannot, the
screen says it cannot, which is S3.

| | State | The screen must | Never |
|---|---|---|---|
| **S1** | **Resting** — nothing happened, by design | Name the scope it looked at and the window | Show a blank region |
| **S2** | **Never** — nothing has *ever* happened | Say so in different words from S1 | Share a sentence with S1 |
| **S3** | **Did not run** — a precondition was unmet | Name what it could not check and why | Render as S1. `?? []` is the whole defect (§5k) |
| **S4** | **Broke** — we asked, the query failed | Show the thrown sentence, in place, naming the subject | Take down the rest of the screen. Fall back to an empty |
| **S5** | **Refused** — the system decided not to act | Show the refusal, its layer and reason, in operator words | Read as an error or an emptiness |
| **S6** | **Partial** — some of the answer, and it knows how much | Show the cap and the total (`500+`, never a silent 500) | Under-count silently |
| **S7** | **Partial and blind** | — | **Exist.** Any read with an implicit limit and no count is in this state; it is designed out, never rendered |
| **S8** | **Stale** — true then, not now | Carry the age, and where an input is newer than the run, say which | Show a relative time alone |
| **S9** | **Frozen** — correct and unchangeable because somebody acted | Show it as frozen | Show it as editable and refuse on submit |
| **S10** | **Withheld** — we deliberately do not offer this | State the absence on the page | Leave it to be discovered as a missing button |

**S1–S4 occupy the same blank rectangle**, and picking the plausible one is a
fabrication with good manners (§5b). This is the single most important sentence
in the brief.

## 1.7 Error boundaries

**Per surface, not per page.** Today has five groups; one group's read failing
must show that group's thrown sentence and leave four groups standing. A blank
Today because one read failed is a worse screen than a Today with one section
saying what broke.

**The throw is right and stays.** Every read does
`if (error) throw new Error('<subject> read failed: <message>')` — loud, and
impossible to mistake for an empty. **The gap is that there is no `error.tsx`
anywhere in `app/`**, so today the carefully-written sentence is replaced by a
generic page. The boundary renders the thrown sentence and the subject; it does
not translate it into "Something went wrong".

## 1.8 Time, everywhere

- **Every relative time has an absolute beside it.** *"A relative time on a page
  left open overnight says '5 minutes ago' for twelve hours"* — `/health`.
- **Every live screen carries a rendered-at stamp**, because the screen most
  likely to be left open is the landing.
- **Every timestamp shown to the operator is in one declared zone** (Europe/
  Lisbon at operator level), stated on the screen. Client-level times are in the
  client's zone; the server is Vercel and runs in UTC, and a 09:00 Lisbon
  booking rendering as 08:00 once sent an agent an hour early.
- **A null date is not zero.** `Lapsed.since` and `ToConfirm.daysSinceChecked`
  are nullable because a revocation does not date itself: IMPIC suspended the
  licence on a day nobody told us about. Rendering "0 days ago" would be this
  system stating a fact about the world computed from an absence (§5j).
  🔒 Null renders as *"we do not know when"*, never as a zero, a dash, or today.

## 1.9 Counts, caps and denominators

- **Every count carries its denominator or its scope.** *"3 lapsed"* is
  meaningless; *"3 lapsed of 47 checked"* is a fact.
- **Every cap is visible.** `500+`, not 500.
- **A zero says which zero it is.** Zero because nothing qualified, zero because
  nothing was looked at, zero because the query failed.
- **`undefined` and `[]` never collapse.** The one operator that does it is
  `?? []` and it is forbidden on any path feeding a screen.

## 1.10 Attribution

Where a person asserted something, the screen shows **who** and **when**, and
distinguishes **the person who said it** from **the person who recorded it**.
This already holds in three places and generalises:

- `jurisdiction_policy` / `advertising_policy`: a CHECK constraint makes
  `confirmed_at` and `confirmed_by` null or non-null together — *"a date with no
  name is not a confirmation, it is a date."*
- The segmentation declaration records the agency's declarer, not the operator.
- `partyRecord` keeps `declaredBy` (the agency) and `recordedBy` (us) apart.

At operator level this binds on: compliance-watch reviews, proof blessings,
template recordings, and anything in the waiting room marked answered.

## 1.11 Language

Operator-level surfaces are **English**. Client-facing and agency-facing text is
PT/EN/ES and is rendered only by the modules that own it — `reason.ts` is the
single place matching prose becomes words, and its exhaustiveness is structural:
a new variant does not compile until it can be said in all three.

🔒 **The cockpit never re-renders a sentence another module already produced for
a human.** Anomaly rows show the event's own `summary` — the same sentence the
WhatsApp carried — because a second formatter drifts from the first and the two
then disagree about the same event. This applies to gate refusals, lapse
notices, and match reasons equally.

## 1.12 The volume defaults register

Per §0.3. Each: what it decides, blast radius, why this value, and what would
prove it wrong.

| Default | Decides | Blast radius | Why | Would be wrong if |
|---|---|---|---|---|
| **Anomaly window — 7 days** (`ANOMALY_WINDOW_DAYS`) | how far back Today looks for faults | display only | The list answers *what has this system got wrong lately*, not *what is on fire* — that is the group above it | Faults are routinely older than a week when first noticed |
| **Anomaly groups visible — 4** | how many before an expander | display only | Four keeps the escalations above it on screen; the expander states the severity of what it hides, so collapsing cannot re-bury | The expander is opened every single time |
| **Escalation read cap — 100** | rows fetched | display only | Far above any real morning. Must render as `100+` if reached | It is ever reached |
| **Anomaly read cap — 500** | rows fetched | display only | One regressed guard firing on every run is the volume case; grouping by kind handles it, the cap only bounds the read | Reached while distinct kinds are still under ten |
| **Outage — 3 of one system reason in 15 min** (`detectOutage`) | whether Today shows one fault instead of N leads | display only | Three unrelated faults is a bad afternoon; three of the same is a dependency down | Real outages produce two, or normal days produce three |
| **Expiry warning — 30 days** (`WARN_WITHIN_DAYS`) | how early an agency is told | display + a notice | Already argued in `recheck.ts`: too early is a longer list, too late is a shorter warning, neither publishes anything | An agency cannot obtain a certificate in 30 days |
| **Registration staleness — 90 days** (`STATUS_STALE_AFTER_DAYS`) | when an agency's own assertion stops counting | produces a **question**, never a refusal | Already argued: a quarter surfaces while it matters and is not asked so often it gets clicked through. Same number as the silence screen's, deliberately — two numbers for one shape each need defending | Licences are suspended and re-advertised inside a quarter |
| **Health staleness — 25 minutes** (`HEALTH_STALE_MINUTES`) | when the stamp goes loud | display only | Cron is 10 minutes; 25 allows one missed run plus skew without crying wolf | Normal operation trips it |
| 🆕 **Today rows per group — 5** | before folding within a group | display only | The groups are a worklist, not an archive; five is a morning's span for one kind. The fold states how many and of what severity | A normal morning routinely has more than five of one kind |
| 🆕 **Clients — no cap** | — | — | N is 2 and will be under 20. A cap now would be designing for a scale that would change every other decision on the screen too | A twentieth client is signed |
| 🆕 **Compliance sweep — weekly; *note* items listed 30 days** | what the watch shows | display only | *Act now* alerts immediately and is not governed by this; *review* is a weekly cadence by §5.12's own wording; *note* is context and a rolling month is enough to have seen it | An *act now* is ever discovered by the weekly sweep rather than by its alert |
| 🆕 **Waiting room — an item changes appearance at 7 and at 21 days** | how an unanswered question looks | display only | A two-week-old lawyer question must not look like a two-day-old one. Two steps, not a gradient, so the state is nameable | Nothing is ever answered inside a week, making the first step meaningless |

**Not defaulted, and must not be:** anything in `client_automations.config` —
matching thresholds, pacing, the silence threshold. Those reach leads.

## 1.13 The phone

Operator level: **Today earns a phone, read-only. Nothing else does.**

Every other operator surface **refuses the phone** — a stated refusal naming
what it is and that it needs a desk. Not a squeezed layout. A compliance log, a
proof book, a policy table or an onboarding form rendered at 390px invites
somebody to do at a traffic light a thing that needs an hour.

🔒 **Today's phone view carries no action that reaches outside the cockpit.**
Navigation and a telephone call to a human. No reply, no notice, no dismissal.

**And the highest-value mobile work is not a screen.** `anomaly.ts` already
decided the principle: the row shows the event's own summary because it was
judged readable on a phone at 1am. Making the alert sufficient — client, wait,
last message, reason — means the phone screen is not opened at all.

---

# §2. The operator level

Nine surfaces. Two exist today.

---

## 2.1 Today

### The question
**Q1 — what needs me right now, across everybody?**

Not *which client has the most problems*. The row is the unit, the clock is the
sort, and the client is an attribute of the row.

### Structure
🔒 **Five groups in a fixed order. Never sorted across groups.**

1. Waiting on a human
2. Something went wrong
3. Something has run out
4. Something is about to run out
5. Waiting on someone else

The order is a declared editorial decision, not a computed priority. Ranking
across incommensurable clocks — minutes for an escalation, days for a
certificate, weeks for a lawyer — would be inventing a threshold, and §4.6
refuses that. Within a group, the group's own clock sorts.

🔒 **Every row names its client.** A row without one is an operator-level item,
and that is legible precisely because every other row has one.

### States

| State | Where | Must say |
|---|---|---|
| S1 | any group | *nothing in this group*, with the window it looked at |
| S2 | whole screen | no client has any automation enabled — different words from S1 |
| S3 | per group | this group could not be checked, and why. **The other four still render** |
| S4 | per group | the thrown sentence, in place |
| S6 | groups 1, 2 | `100+` / `500+` and the fold count |
| S8 | whole screen | rendered-at stamp |
| — | group 1 | 🔴 **`handledElsewhere`** — the escalation flag is still set *and* an outbound message has since gone out. Somebody replied outside the cockpit. Neither open nor closed, and it must be its own visible state, not folded into either |
| — | group 1 | **outage** — three or more of one system reason within 15 minutes renders as *one fault*, with the count, above the individual rows |

### Can do
- Open the thing the row is about.
- Call a human (phone only).

### Cannot do
- **No action on any row from this screen.** No dismiss, no acknowledge, no
  reply, no mark-as-read, no snooze. Today is a worklist, and a worklist you can
  clear without doing the work becomes a list of things you clicked.
- **No cross-client bulk action.** Ever. The frame makes this newly possible and
  it is closed at the frame.
- **No re-sort by client.** That is the Clients screen.
- **No dismissing an anomaly** — §4.8 defers that with a trigger: only if a kind
  is still firing after its cause is understood.

### Reads

| Group | Source |
|---|---|
| 1 | `leads` where `qualification->>'escalated'` is set (`->>` not `->`, load-bearing), joined to `clients.name`; most recent outbound `messages` row per lead for `handledElsewhere`; `escalation.ts` for tier, class and `detectOutage` |
| 2 | `events` where `type in ('invariant.violated','invariant.check_failed','run.errored')`, last 7 days, shaped by `lib/anomaly.ts` — grouped by `kind`, most recent occurrence with `N× since` |
| 3 | `recheckClearances(...).lapsed`; obligation discharges past `staleAfterDays`; `message_templates.status in ('rejected','paused','disabled')`; a sender quality rating not in `{HIGH, GREEN}` |
| 4 | `recheckClearances(...).expiringSoon` and `.toConfirm`; Layer 4's calendar items (read-only, no mechanism) |
| 5 | The waiting room's store (§2.5) |

### Legally load-bearing
- The anomaly summary is **the record an agent needs when a lead complains about
  something the system got wrong** (§4.8). It shows the text the lead was sent,
  as stored. It is not re-worded here.
- Group 3's lapse rows carry the `requirement_unresolvable` distinction: *we
  cannot confirm this is still in order* is not *this is unlawful*, and Today
  must not compress the four causes into one word.

---

## 2.2 Clients

### The question
**Q2 — how is each client actually doing, and is it our fault or theirs?**
**Q10 — which automations is each client actually running?**

Read deliberately, not triaged. This is the screen you open to think about a
client, not to find work.

### States

| State | Must say |
|---|---|
| S1 | clients exist, nothing notable — the cards still show their clocks |
| S2 | no clients at all — with the onboarding route, as `/report` and `/import` already do |
| S3 | a derived column unavailable for one client — 🔴 *not checked*, **never a dash**. Casting an absence is a decision to invent (§5i) |
| S4 | a read failed — that cell, not the screen |
| S8 | rendered-at |

### Can do
- Open a client.
- Open onboarding.

### Cannot do
- **No green/amber/red per client.** That is the rollup D2 rejected: it collapses
  a ninety-minute wait and a twenty-seven-day certificate into one dot. The card
  states facts with their clocks and the operator compares.
- **No ranking or sorting by severity.** Alphabetical, or by onboarding date.
- **No pausing, disabling or configuring an automation from this screen.** That
  is the client's own settings, one level down, where the client's name is the
  page's subject rather than one row among several.
- **No client contents.** Counts, never names.

### Reads

🔴 **Derived, per §0.2. Never `client_automations.health` or `last_run_at`.**

| Column | Derived from |
|---|---|
| automations enabled | `client_automations.enabled` joined `automations.key` |
| did it run, when | most recent `automation_runs` row per `client_automation_id` |
| did it fail | `automation_runs.status = 'error'`, plus `run.errored` events |
| did it do nothing | `invariant.violated` / `invariant.check_failed` events |
| anyone waiting | escalated `leads`, oldest wait |
| blocked, and by what | the gates' own refusals: `thresholds_not_configured` (03), `policy_not_confirmed` (04), `no_ledger_basis` (02/05), no approved template (02/05) |

### Legally load-bearing
- 🔴 **The automation names in the database are wrong.** `automations.name` still
  holds *"Database Reactivation & Referral Engine"* and *"Post-Close Reputation &
  Referral Loop"*, both corrected on 19 September: "Referral" appeared in two of
  five names and was built into neither, and 05 is one message once. `0027`
  updated a *description* only. **The screen must not display `automations.name`
  until a migration corrects it**, or it reintroduces a claim the project
  retired — including a referral product that was refused, because a referred
  contact has no documented origin.
- 🔴 **Never the word "viewings"** for what the Concierge books. It books an
  introductory meeting, not a property visit (§3.15). `leads.stage` says
  `viewing_booked` and `metrics_daily` says `viewings_booked`; the screen shows
  the truthful word regardless of the column name. A client reading "3 viewings"
  when nobody visited a property is a trust problem that surfaces in the first
  weekly report.
- Confidentiality: counts, never contents.

---

## 2.3 Expiries

### The question
**Q3 — is anything about to expire, lapse, or arrive?**
**Q21 — what was lawfully advertised and has stopped being so?**

The cross-client home for `recheckClearances()`, which is the largest thing in
the codebase with no surface.

### Structure
Four axes, and 🔒 **they do not merge**, because `Recheck` keeps them apart for
reasons that are each a defect avoided:

1. **Lapsed** — no longer advertisable. The agency has to be told.
2. **Expiring soon** — still advertisable, will stop being.
3. **To confirm** — registrations. 🔒 **Keyed by the registration, never by the
   property.** One AMI licence behind forty cleared properties is one line; as
   forty lines the notice becomes something nobody reads, which costs more than
   the thing it surfaces. Not counted in `checked`; does not stop a clearance
   being `stillGood`.
4. **Other expiries** — template approvals, obligation discharges, sender
   quality, Layer 4's calendar items.

### States

| State | Must say |
|---|---|
| S1 | 🔒 *"checked N clearances, none lapsing"* — **with N**. A bare "all clear" is indistinguishable from nothing to check |
| S2 | no clearance has ever been granted — today's state |
| **S3** | 🔴 **the state this screen exists to render.** `notCheckedFor` names each `LapseCause` that could not be checked and why. A run given no policy rows once reported every standing clearance as unconfirmable — four hundred properties as findings, from our own missing argument. *"A silent clean bill would have been worse still"* |
| S4 | a policy read failed — 🔒 and it is **not** rendered as `requirement_unresolvable`, which is a finding about the world, not about us |
| S6 | caps, with totals |
| S8 | the sweep's own last-run age. A clearance list is only as current as the sweep that made it |

### Can do
- Open the listing or the client.
- **Notify the agency** — and the notice records only that they were told.
- Re-run the sweep.

### Cannot do
- 🔴 **No verb claiming we acted on the outside world.** We cannot withdraw a
  post we did not publish. Nothing on this screen, in any notice it sends, or in
  any confirmation it shows may say *removed*, *corrected*, *taken down*,
  *republished* or *suspended-by-us*. A test fails on any such verb — **and the
  guard asserts its own cases before using them**, after listing only masculine
  singular participles while every noun in the feature (*publicação*, *menção*,
  *licença*, *peça*) is feminine, and `despublic` sat inside a `\b` group so it
  had matched nothing since the day it was written.
- **No editing a certificate, licence, expiry or exemption here.** Those are
  declarations with authors, made client-side.
- **No bulk notify across clients.**
- **No suppressing a cause.** All applicable causes are reported, never the
  first found — an agency told only that the certificate expired buys a
  certificate, and the licence is still suspended.

### Reads

`recheckClearances(rows, opts)` and nothing reinterpreted:

| Field | Renders as |
|---|---|
| `lapsed[].causes` | 🔒 **all of them, each in its own sentence.** Four causes, four different claims |
| `lapsed[].since` / `daysAgo` | nullable — *"we do not know when"*, never zero |
| `lapsed[].noticeSentAt` | told already, so a second notice is a choice rather than an oversight |
| `expiringSoon[].daysLeft` | with `warnWithinDays` stated |
| `toConfirm[].affects` | how many clearances rest on this registration |
| `toConfirm[].daysSinceChecked` | nullable — 🔴 **never checked is not stale-after-90-days.** No check date at all, or status `unknown`, surfaces **immediately**; waiting ninety days would be inventing a grace period out of a missing value |
| `stillGood`, `checked` | the denominators |
| `notCheckedFor` | S3, above |

Also: `message_templates.status` and `status_changed_at`; `OBLIGATIONS[*].staleAfterDays` against the discharge check; the sender's quality rating via `assessQuality`.

### Legally load-bearing
- 🔴 **`requirement_unresolvable` is not an allegation.** *"We cannot confirm
  this is still in order"* is what is true; *"this is unlawful"* is not. Four
  causes, four sentences, and this one is the one that must not be sharpened.
- 🔴 **A notice that reads like an action is worse than one that reads like a
  warning**: somebody reads it, believes the problem is closed, and the unlawful
  advertisement is still up — with our record saying it was handled.
- The company fine range is €2,500–€44,890, not the €250–€3,741 that §8.A
  carried until 18 September. If the screen states exposure at all, it states
  the company range; understating it twelvefold is the opposite of what the
  sentence is for.
- 04 is **Portugal only**. §8.A.3 and the findings register both say it cannot
  enter service in Spain without its own analysis. A Spanish row appearing here
  is a bug, not a feature.

---

## 2.4 Infrastructure

### The question
**Q4 — is the system alive, and is the thing that watches it alive?**

🔒 **And its real question is narrower than its title.** Nobody opens this to
*discover* a fault — Better Stack emails first. They open it to **confirm**
one: before telling a client the system is fine, or after an alert, to see which
of twelve checks went. It is a pre-flight screen, and the last-run stamp is the
whole of it.

### States

| State | Must say |
|---|---|
| S1 | twelve green |
| S2 | never run — *"Never"* |
| S4 | the health read failed — 🔴 distinct from twelve red |
| S8 | 🔒 stale after 25 minutes, **and the staleness is louder than the checks** |
| S3 | Better Stack's line: *we could not ask the monitor* ≠ *the monitor says nothing is wrong* |

🔴 **The self-reference, which is not a gap.** One of the twelve checks is
"Supabase reachable", and `health_runs` lives in Supabase. **When Supabase is
down this screen cannot report it — it can only stop updating.** That is correct
behaviour and is why the stale state is louder than the checks, and why email
remains the alerting channel that does not depend on the thing it watches. The
screen says this in words, so a stale stamp during an outage is read as the
design rather than as a broken page.

### Can do
- Read. Follow a link to Better Stack.

### Cannot do
- **No re-run.** The check runs from cron on the server; a button here would
  either do nothing or build a second trigger path for a thing whose value is
  that it runs on a schedule outside the app.
- 🔴 **No rebuilding Better Stack's dashboard.** §4.9: it already has history,
  incident timelines and uptime percentages; duplicating them is work done twice
  and maintained forever. **One line** — healthy or not, last checked, a link.

### Reads
`health_runs`: `ran_at, ok, passed[], failed[], duration_ms, host`, most recent
row only. Plus one call to Better Stack's API for the monitor's own state.

### Legally load-bearing
Nothing. This surface carries no legal obligation and the brief says so rather
than manufacturing one.

---

## 2.5 The waiting room

### The question
**Q5 — what is blocked on somebody who is not me, and for how long?**

Ten lawyer questions across three notes, Meta verification, ADENE credentials,
one agency's afternoon.

### Why it is a screen rather than a markdown list
🔒 **The age is the content.** *"Sent 17 September, unanswered"* is a fact that
gets worse silently, and a list in a file does not change appearance as it ages.
A screen with a clock on it is the only artefact that makes a two-week-old
question look like a two-week-old question.

### What an item holds
Who we are waiting on · what was asked · when it was sent · what it unblocks ·
where the full text lives (`legal/fonte/nota-questoes-automacao-0N.md` §N) ·
whether an answer has arrived, and from whom.

### States

| State | Must say |
|---|---|
| S1 | nothing outstanding |
| S8 | intrinsic — every row is an age (§1.12: appearance changes at 7 and 21 days) |
| S2 | nothing has ever been asked |

### Can do
- Add, annotate, and close an item — closing names who answered and when.

### Cannot do
- **No chasing.** No reminder emails, no "nudge". It is a record of what we are
  owed.
- 🔴 **No marking an item answered without the answer.** The waiting room's only
  value is that it distinguishes *asked* from *answered*, and a status that can
  be set without the substance re-creates exactly the thing it exists to
  prevent. An answer is recorded with who gave it and what they said.
- 🔴 **No acting on a provisional answer.** Nothing here changes a policy row, a
  template, or a gate. A confirmation is made in the policy table by a named
  lawyer (§2.9), and an item in this screen being green is not that.

### Reads
A new table. Nothing existing holds this; it is tracked in prose today.

### Legally load-bearing
Indirectly, and worth stating: **this is the record that the questions were
asked.** A supervisory authority does not expect omniscience — they expect a
documented process for noticing and responding (§5.12's own argument). A dated
list of questions put to a lawyer, with what was blocked meanwhile, is that
document. Which is also why an item may not be closed without an answer: a log
that can be tidied is not evidence.

---

## 2.6 Compliance watch

### The question
**Q6 — what changed in the law this week that touches what we run?**

§5.12, assigned to the mindmap by name. Compliance is not a state that is
reached; it is a state that decays.

### Sources
Meta's WhatsApp Business Messaging Policy and platform changelog; CNPD decisions
and directives; AEPD guidance; EDPB opinions; the AI Act implementation timeline
and Commission guidance; national ePrivacy transpositions for **each
jurisdiction in the policy table** — so the source list is derived from
`jurisdiction_policy` and `advertising_policy`, not hardcoded. A jurisdiction
added without a source is itself a finding.

### Three severities, mirroring the alerting tiers
- **Act now** — something in production is now non-compliant. Alerts immediately,
  on the same channel as an invariant violation.
- **Review** — probably affects us, needs a human read within the week.
- **Note** — context, no action.

### States

| State | Must say |
|---|---|
| S1 | the sweep ran and found nothing — with the date **and the source list it read** |
| S2 | never swept |
| **S3** | 🔴 some sources unreachable — **named**. A sweep that read four of six sources and reports nothing is asserting something about two sources it never opened |
| S4 | the sweep itself failed |
| S8 | 🔒 the sweep's age, prominently. A compliance log that has not run for three weeks is worse than none — same reasoning as the health stamp |

### Can do
- **Mark an item reviewed, with a name.**
- Correct a severity by hand, once, on an item the sweep got wrong — recorded as
  a human override with its author.
- Open the source.

### Cannot do
- 🔴 **No reviewing without a name.** The reviewed state **is** the compliance
  artefact. *"We monitor regulatory change and here is the log"* is worth
  something only if the log says who read what, when. Same rule as
  `confirmed_by`.
- 🔴 **No deleting an item.** Append-only. A log that can be tidied is not
  evidence.
- 🔴 **No acting on a summary.** Nothing here changes a policy row, a template,
  or a gate. An *act now* raises an alert and an item; a human decides.
- **No suppressing a source.** A source that stops being read is a finding, not
  a setting.

### Reads
A new table. Derives its source list from the two policy tables.

### Legally load-bearing
- 🔴 **The whole screen is the artefact.** Its value to a regulator is the
  documented process, not the summaries.
- 🔴 **A model reading legal sources will eventually produce a confident sentence
  about a rule it misread.** So: every item shows its source, its date and a
  link; the summary is **labelled as ours**; and the item is never rendered in a
  way that lets the summary be mistaken for the source. This is §5j at the
  operator level — never publish a number, or a conclusion, you computed as
  though it were a fact about the world.
- *Act now* shares a channel with invariant violations, which means it shares
  their fatigue budget. §3.7: alert on everything and it is muted within a week,
  and the muting takes the *wake me* tier with it.

---

## 2.7 The proof book

### The question
**Q7 — what have we proved, and has any of it gone stale?**

22 proofs that cannot run in the test suite, their hashes, and what each one
proved.

### States

| State | Must say |
|---|---|
| S1 | all proofs current |
| **S2** | 🔴 **never run** (`last_proved: null`) — and this is **not** the same as stale. A proof whose hash answers *has the file moved since it was proved* cannot answer *was it ever proved*, and `last_proved: null` once sat there green |
| **S8** | a hash mismatch — proved once, the file moved since. A regression, where S2 is an absence |
| **S3** | a `blocked` proof whose `runnable_when` path does not yet exist — *not yet runnable*, which is neither pass nor fail. The moment the path exists it becomes S2 and says so |
| S4 | the book could not be read |

### Can do
- Read. Open the proof's `how`, its `watches` list, and the files it hashes.

### Cannot do
- 🔴 **No blessing from the screen.** Blessing is a claim that a human ran
  something, and a button is how that claim gets made by accident. It stays
  `npm run proof:bless <id>` — which requires an id, because *"a claim made about
  four things when one was intended is three lies"*, and because a convenience
  call once replaced ten true dates with today's and stamped two never-run
  proofs as proved.
- **No editing `proofs.json`.** Read-only.
- **No hiding blocked proofs.** They are alarms with a trigger, not silences.

### Reads
`db/tests/proofs.json` — `id, what, how, watches[], hashes{}, last_proved,
proved_by, blocked{reason, runnable_when}` — plus the on-disk hashes of the
watched files, computed at render.

### Legally load-bearing
Nothing directly. Worth noting anyway: several proofs are the evidence that a
constraint refusing an unlawful row actually refuses it, so the book is the
closest thing the project has to a record that its guards were seen to work.

---

## 2.8 Onboarding

### The question
**Q8 — can I take on a new client, and what does that actually require?**

### 🔒 It becomes a checklist that links out, not a longer form
Today's form writes **one** `clients` row and **one** `client_automations`
config — for `inbound_concierge` only. There are five automations, and two of
the required steps are conversations that cannot be performed in a form:

| Step | Kind | Where |
|---|---|---|
| The agency row — name, WhatsApp number, timezone, locale, default language | form | here |
| Concierge config — working hours, booking window, notice, duration, high-value threshold, escalate-to, calendar id, the three handoff notes | form | here |
| **Areas** | form | here — §3.14: hand-edited in config today, does not scale past one client |
| **Meeting kind, duration, location** | form | here — §3.16: a lead asks all three in the first conversation and currently gets nothing |
| Per-automation config for 02–05 | form | here, one section each |
| **AMI licence number** (04) | form | here, once per client |
| **Review destination** (05) | form | here — `0034`, host allow-listed |
| **Prove inbound routing** | 🔴 proof, not a form | here — see below. Required from client two onward |
| **The AI-disclosure conversation** (§3.0) | 🔴 conversation | recorded here as done, with a date |
| **The contact declaration** (§3.18) | 🔴 conversation | `/c/<client>/declaration` |
| **The calibration** (§3.20, §4.6) | 🔴 conversation | `/c/<client>/thresholds` |

### States

| State | Must say |
|---|---|
| S1 | the form, empty |
| S5 | validation refusals: a non-IANA timezone, a phone failing the country-aware check, a WhatsApp number already held by another client (`0007`) |
| **S4** | 🔴 **the calendar probe could not run** — distinct from *the calendar is wrong*. A wrong calendar id returns **200 with `busy: []`** and hides the failure in `calendars[id].errors`; that is C1's first find and it lives here |
| S6 | the client exists and the checklist is partly done — 🔒 the two conversations shown as outstanding, by name |
| S2 | no clients at all |

### Can do
- Create a client; validate a calendar; configure each automation; record that
  the disclosure conversation happened; link to the two conversations.

### Cannot do
- 🔴 **No "onboarded" state while either conversation is outstanding.** A
  checklist showing them as outstanding is honest; a form that omits them
  implies a client is ready when nothing may yet be sent to anybody. Until the
  declaration exists the gate refuses every contact, correctly.
- 🔴 **No declaring, classifying or calibrating from this screen.** Those are the
  agency's assertions, made in their name, in presented mode.
- **No enabling an automation that cannot run.** Enabling 02 or 05 without an
  approved template, or 04 without a confirmed policy row, is a switch whose
  only effect is a refusal later; the checklist states the gate instead.
- **No two clients on one WhatsApp number.** `0007` is a partial unique index on
  `clients.whatsapp_number`; the form refuses a duplicate too, but *"an
  application check is advisory the moment there is more than one caller."*

### Reads / writes
Reads `automations` (the catalogue), `clients` (for the duplicate-number check).
Writes one `clients` row and one `client_automations` row per enabled
automation. Validation is `lib/onboarding.ts`, which is deliberately free of
React and `server-only` so every rule is directly testable — *"a rule whose only
test is 'the form looked right' is not a rule."*

### Legally load-bearing
- 🔴 **§3.0 — the AI-disclosure conversation.** Article 50 has applied to the
  provider since 2 August 2026; exposure is up to €15M or 3% of turnover; **we
  carry that duty, not the client**; it is one line at the top of the first
  message only; and it may measurably depress reply rates, which is the client's
  number. The client hears it **from us, at onboarding, before they find it in
  their own transcripts.** A client who finds it themselves reads it as
  something we did to their funnel without telling them. This is a checklist
  item with a date, not a note.
- 🔴 **The data-processing agreement and the services contract** — `anexo-ii-
  acordo-tratamento-dados-v1.md` and `contrato-prestacao-servicos-v1.md`. A
  client processing personal data through us without the annex signed is the
  exposure onboarding exists to close.
- 🔴 **Prove inbound routing — its own checklist step, and it is a proof rather
  than a field.** The Concierge resolves the client from the number a message
  arrived on: `whatsapp_number=eq.<To>&limit=1`, no `ORDER BY`. `0007` forbids
  the collision that would make that non-deterministic, but the Twilio sandbox
  provides exactly one sender number, so **two clients have never been tested
  simultaneously and routing has never once been exercised.** Onboarding says
  this out loud rather than letting it be discovered:

  > **The second real client is also the first proof that routing works.**

  The step is: send an inbound message to the new client's number and confirm
  it was answered with *this* client's config, areas and assistant name — and
  that the existing client's number still answers with theirs. 🔒 **Both halves.
  Checking only the new one proves nothing**, because the failure mode is a
  real client's leads being answered with another client's assistant, and the
  row that loses is the one nobody thought to check (lesson 7b: a constraint is
  proved by the cases it must leave alone). Until that has been done and
  recorded with a date, the client is not onboarded.
- 🔴 **Test clients and reserved numbers must be visible and removable.** The
  `ZZ TEST` client has to be gone before go-live, and the gate's first layer
  refuses `reserved_test_number` before anything else. A screen that creates
  clients must show which of them are not real.
- **§3.1 — there is no agent entity anywhere in the system.** No table, no
  column. Escalations cannot route to the right person and the calendar cannot
  tell whose availability it reads. Honest at one agency of one or two people;
  🔴 **the form must not imply otherwise** by collecting an "agent name" that
  routes nothing. Collect it as a label and say what it does.

---

## 2.9 Templates and policy

Two surfaces, adjacent because they answer the same shape of question: *what
may we lawfully say, and where does that permission come from?*

### 2.9a Templates

#### The question
**Q9 — what may we lawfully say, to whom, in which language?**

`0020` names this screen as one of four readers of `message_templates` and
specifies what it reads: **current status. A "now" question, no history needed.**

#### States

| State | Must say |
|---|---|
| S1 | approvals recorded |
| **S2** | 🔴 none ever recorded — **today's state, and the true reason 02 and 05 cannot send** |
| S5 | a malformed approval id refused at recording — `^HX[0-9a-f]{32}$`; a body whose `{{n}}` variables are not contiguous, or contain `{{0}}` |
| **S8** | 🔴 an approval whose status may have changed at Meta since we wrote it down — *"unverified since <date>"*. **Nothing syncs.** The Content API could be polled and is not |

#### Can do
- Record an approval: client, name, language, version, body, category, approval
  id, submitted/approved dates, source document.
- Update a status by hand when Meta changes one.

#### Cannot do
- 🔴 **Nothing that makes this table describe a campaign.** `0020` names five
  columns that must never appear, because each *"will be proposed by somebody
  solving a reasonable local problem"*: `default_recipients`,
  `auto_send_on_approval`, `send_to_segment`, `schedule`,
  `enabled_for_campaign`. **Every one turns a record of what was approved into a
  campaign definition, and something will eventually read it and act.** The
  screen must not offer any of them as a field, a toggle or a convenience.
- **No sending.** `template-record.ts` writes one table and reads one table;
  it names no recipient, holds no provider credential, and imports neither the
  dispatcher nor the permit. The screen inherits that.
- **No sharing a template between clients.** An approval belongs to the WhatsApp
  Business Account, so per client; a shared row would let one client's campaign
  send under another's approval, which Meta rejects and which would put one
  agency's identifier in another's send record.
- **No editing a frozen field.** `body`, `category`, `approval_id`,
  `submitted_at`, `approved_at`, `source_document` are what a send names and
  what a record reproduces. A correction is a new version.

#### Reads
`message_templates` — all columns. Frozen half rendered as frozen;
mutable half (`status`, `status_changed_at`, `status_note`, `quality_rating`)
rendered as current, with its age.

#### Legally load-bearing
- 🔴 **The stated risk goes on the screen, not only in the source.** A mistyped
  `HX…` is accepted at recording and refused by Twilio at send time as a
  terminal 4xx — *"a loud failure on the first send rather than a silent one,
  but a failure in production rather than at recording."* The operator recording
  it should be told that while recording it.
- The orphan sweep **must not read status at all** — a message sent under a
  template Meta disabled yesterday is still one of ours. The screen showing
  status must not become the sweep's source.
- The forecast reads a **snapshot**, not this live status: phase 1 says "20
  contactable with template X" at 09:00, Meta pauses X at 10:00, phase 2
  re-decides at 14:00. Without the snapshot, *"why did the forecast say 20"* has
  no answer. This screen must not be repurposed as that snapshot.

### 2.9b Policy

#### The question
Where does a permission come from, and has a lawyer actually said so?

#### States

| State | Must say |
|---|---|
| **S5** | 🔴 a row with `confirmed_at` null is **inert — it permits nothing**. Today that is Portugal's `advertising_policy` row, and it is why every Portuguese property refuses `policy_not_confirmed` before anybody's missing certificate is reached |
| **S3** | 🔴 `existing_customer` is **three-way**: `available`, `unavailable` (a legal conclusion) and `unknown` (an absence of analysis). 🔒 **Rendering it as two states lets an unanalysed country look decided.** Same for `consent_request`: `permitted` / `prohibited` / `unknown` |
| S2 | a country with no row at all — distinct again from `unknown` |
| S8 | `researched_at` beside `confirmed_at`: when *we* read the sources versus when a lawyer confirmed |

#### Can do
- Read. Open the statute, authority, traps and source note. See which clients
  and listings a row is currently refusing.

#### Cannot do
- 🔴 **No confirming a row from the cockpit. Ever.** The whole value of
  `confirmed_by` is that it names a lawyer who said so. A button makes it name
  whoever clicked. `campaign-evaluation-design.md` §5.2: *"a system that would
  let us fake a lawyer's confirmation in order to test itself is a system whose
  confirmations mean nothing"* — and the cost of that, accepted deliberately, is
  that there will be no rehearsal and the first true end-to-end run is the first
  real one.
- **No editing `requires`.** A typed requirement changes what the gate demands
  of every property in a jurisdiction. It is a migration with a review, not a
  form.
- **No creating a region row.** A region code is the jurisdiction's own,
  upper-case, no spaces, **never a name**: "Cataluña", "Catalunya" and
  "Catalonia" are three rows for one place. And a null region is **the national
  row**, not an empty one — null and `''` would be two rows meaning the same
  thing.

#### Reads
`jurisdiction_policy` (all columns) and `advertising_policy` (all columns),
read-only, plus a count of what each row is currently refusing.

#### Legally load-bearing
- 🔴 **`confirmed_at` and `confirmed_by` are null or non-null together**, by
  CHECK constraint — *"a date with no name is not a confirmation, it is a
  date."* The screen never shows one without the other.
- 🔴 **`consent_expiry_months` null means no expiry is known, not that consent is
  eternal.** The gate treats an unconfirmed row as permitting nothing, so null is
  never relied on — and the screen must not render it as "no expiry".
- 🔴 **One sentence from a lawyer on Portugal's `advertising_policy` row unblocks
  Portugal entirely.** It is question 4 of the 04 batch. The screen should make
  that visible as one row with a blank in it, because it is the single
  highest-leverage row in the database.
- `platform_blocked` is a platform fact, not law, and is not negotiable either.
  Shown as its own thing, never merged into the legal columns.

---

# §3. The checklist a design is measured against

Ten items. If a drawn screen cannot answer all ten, it has dropped a constraint.

1. **Which state is this?** All ten of §1.6 answerable from the screen.
2. **Which zero is this?** Nothing looked at / nothing qualified / query failed.
3. **Where is the denominator?** Every count.
4. **Where is the absolute time?** Every relative one.
5. **Who said this, and when?** Every human assertion, with the declarer and the
   recorder kept apart.
6. **What did this screen not check?** `notCheckedFor`, unreachable sources,
   unavailable columns — named, never blank.
7. **Does one failed read take the screen down?** It must not.
8. **Does any control act on more than one client?** It must not.
9. **Does any text claim we acted on the outside world?** It must not.
10. **Is every absence stated?** S10 is on the page, not discovered as a missing
    button.

---

# §4. What this brief does not cover

- **The twenty-seven client-level screens.** `cockpit-mindmap.md` §6 and §7 hold
  their states and absences; they need this treatment next, and the four with
  presented mode need it first.
- **The contact record and the send history** (Q13, Q14) — the sharpest gap, and
  a first-class screen rather than a filter. It is client-level and deserves its
  own brief.
- **Layout, hierarchy, density, typography, colour, components.** None of it.
- **Build order.** Every operator-level surface is new; sequencing wants a
  conversation about what a first real client's first week looks like.
- **Whether the Shell is rewritten or replaced.** §1.5 says its structure does
  not survive; what replaces it is a design question.
- **The waiting room's and compliance watch's tables.** Both need a migration.
  Shape follows the design, not the other way round.
