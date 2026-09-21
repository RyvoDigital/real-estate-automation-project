# Where we left off

**Last updated:** 2026-09-21.
**Where the work is:** the COCKPIT REDESIGN, stage C — building it. §0 below is
the current state.

🔴 **"Built to its gate" was true about the GATE and not about the AUTOMATION,
and that sentence stood at the top of this file for weeks.** Four automations
are BUILT AND UNWIRED: the code exists, it is tested, and nothing calls it. See
§0 and improvements §3.23. **Three states from now on, and this file says which
every time:**

| | means |
|---|---|
| **BUILT AND REACHABLE** | something calls it and it runs in production |
| **BUILT AND UNWIRED** | it exists, it is tested, nothing calls it |
| **NOT BUILT** | it does not exist |

A handover that says "built" without saying which of the three has not said
anything.

🔒 **And what is waiting on somebody else lives in `cockpit/src/lib/gates.ts`**,
keyed by gate, with what to do the moment each opens. Flipping one to
`open: true` makes the suite fail and list the work — so this file does not
carry that list, and neither does anywhere else.
**§0 is the cockpit, §0a is Automation 05, §0b is 04, §0c is 03.** The three
automations all end in the same two rooms: an agency's, and a lawyer's.

> ⚠️ The header used to say "Last updated 2026-09-03, next is Checkpoint C".
> That was two automations ago. Sections below are newest-first and the older
> ones are history, not instructions.

This file is the running state-of-play for whoever (human or agent) picks the
project up next. The durable *design* lives in the handoff and design documents
under `docs/`; this file records what is actually deployed right now and what
tripped us up. **Sections are newest first.**

---

# 00. 21 September 2026: the Concierge redeployed, the money tables hardened, the screens counted

**Deployed (BUILT AND REACHABLE):**
- **The Concierge**, served version `fe2e7857`, deployed 14:35 UTC. It adds
  two fixes, proved live:
  - A failed handoff note is now `status='error'`,
    `error_type='handoff_send_failed'`. Sabotaged at 14:34 UTC: the run went
    to error and invariant 4 fired. Resting case at 14:41 UTC: `success`,
    `handoff_sent=true`, nothing fired.
  - The claim guard catches "quedamos entonces para" and its pt/en neighbours.
- **The database:** `0049` (money foreign keys RESTRICT) and `0050`
  (client_contracts' append-only protection stated whole) are applied and
  blessed.

🔴 **The screen count changes the redesign estimate.** See
`docs/cockpit-route-map.md` §7.
- **The rule:** no old route is retired until its replacement exists and is
  reachable.
- **`/segmentation` above all.** It is the only screen that writes a consent
  declaration, and its replacement `/c/<client>/declaration` is in **no build
  stage**. Nor is `/calibrate`'s.
- **Blockers on the "replaced" routes:**
  - `/leads/[id]` holds the only hand-back to the AI.
  - `/c/<client>/report` lost "Copy as text", its send step. That is a
    regression.
  - `/import` keeps the upload flow, and its planned redirect is dropped.
- **So "Stage C is nearly done" is not true.** At least two screens that
  write, a hand-back and a regression fix are owed before anything old can go.

**Open, not fixed (both in `docs/remaining-defects-session-2.md`):**
- **Language drift:** the Concierge replies in Portuguese to short English
  messages the detector cannot read (4 of 5 in suite 7). The fix was built,
  deployed (`64b0376d`) and half-proved live, then **rolled back at 15:01 UTC**
  (served now: `f04b9f97`, the `fe2e7857` content). It is reverted in the repo
  and returns with the next fix.
- 🔴 **The never-invent guard escalates a lead whose own unoffered time the
  reply correctly declines** ("11:00 isn't available, but…"). This is what the
  rollback was for. It is older than every 21 Sep change, proved by replay. A
  fix is prototyped, not built.

---

# 0. Four automations are built and unwired — 20 September 2026

**Found while surveying what the compliance screens could read.** The operator
asked whether the shape found in 04 was in 02, 03 and 05 as well. It is.

**Thirteen entry points have no caller** anywhere outside their own module and
the test suite — `runCampaign` (the thing that actually sends), `planCampaign`,
`reconcilePending`, `checkBeforeBatch`, `extractForLead`,
`recomputeRequirementsForLead`, `decidePublication`, `assemblePiece`,
`recheckClearances`, `planReviewAsks`, `recordClose`, `recordParty`,
`markAgentAsked`. `recheckClearances`'s one repo-wide mention outside its
module is a **comment**.

🔒 **THIS DOES NOT MEAN THE WORK WAS WASTED.** The gates are correct, proved,
and exactly what they should be. Every one was built before its caller
deliberately — you cannot wire a sender to a gate that does not exist — so
"no caller yet" was true and expected each time, and **nothing ever marked when
the *yet* ended.** Four features each looked finished on their own terms.

**Why nothing caught it.** A unit test supplies its own inputs, so it proves
the logic and says nothing about arrival. A migration proves its own
preconditions, so it says nothing about whether anything writes the table. Both
are honest about what they assert and silent about reachability — and from a
dashboard, silence and success look identical. About **660 tests were passing
over code that cannot run**.

## What was done about it

- **`cockpit/tests/reachability.test.ts` is a ledger that FAILS TODAY**, names
  all thirteen, and says for each **what would wire it** rather than only that
  it is unwired. It gets shorter as they are wired and passes when it is empty.
  `npm test` now has **three** expected failures: two for the 0037 proof and
  one for this.
- **131 tests across 8 files carry a banner** — *"⚠️ this tests logic no caller
  reaches"* — so the count stops reading as coverage of a working system. That
  is a floor rather than a total: it counts files whose SUBJECT is an unreached
  entry point, not every test that touches unreachable code.
- **improvements §3.22** — nothing writes `agency_facts`, so the registration
  requirement refuses every property. Invisible today only because
  `decidePublication` has no caller, which is how these compound.
- **improvements §3.23** — the pattern, with the verified list.
- **`db/migrations/0039_clearances.sql`** — written, proved, and **deliberately
  not applied** until its writer exists, because a table nothing writes is what
  `agency_facts` already is.

## What is BUILT AND REACHABLE, so the record is not all bad news

The Concierge (01) runs in n8n and writes through `/api/listings/inbound`. The
import flow is wired end to end. Segmentation, calibration, triage and silence
are reachable screens. And the Stage C cockpit is live: `/today`, the client
frame, escalations, *What is still good*, Policy, Templates, the re-check
notice in both frames, the publication screen, and — since 20 September — the
**client landing** at `/c/<client>`.

### The gated ledger is now a thing screens read, not a document

`cockpit/src/lib/gates.ts` holds every wait on a person: 8 gates, 15 entries.
Three properties, and the third is the one that keeps it honest:

1. **Flipping a gate to `open: true` fails the suite** and prints the work it
   unblocked, with the next action for each. Recording that a gate opened and
   surfacing the work are the same act.
2. **A drift guard** (`tests/blocked-language.test.ts`) fails when blocked
   language appears anywhere outside it, names the file and says it belongs in
   `gates.ts`. It carries a hand-sorted ratchet of the 20 September sweep —
   and a second test fails when a carried file stops hitting, so the list
   cannot become permanent scaffolding.
3. **Every entry expects to be wrong.** `thenReRead` says what to go and read
   when the gate opens, because `onOpen` was written when we knew least. Meta
   verifying only moves the wait to Meta reviewing; question one to the lawyer
   could remove a whole segment from 02.

🔴 **Do not write "blocked on X" or "waiting on X" in a doc or a comment.** Add
the entry and point at it. The guard will tell you, by filename.

The client landing reads it through `gatesHoldingAutomation`, which is why
`Blocked.holds` and `Gate.answerable` exist: which band a wait falls into is
decided once, in the ledger, never parsed out of prose on a screen.

### Still on the OLD direction, and easy to mistake for done

`/queue` · `/leads` · `/listings` · `/import` · `/report` · `/review` ·
`/silence` · `/segmentation` · `/calibrate` · **`/onboarding`** · `/health`.
All work, all in production. 🔁 *Some now have replacements* (route map §7);
none may be retired until its replacement exists and is reachable. **BUILT AND
REACHABLE, on the old direction** — a third state this file's table does not name, and the one that
reads as "done" from a URL list.

🔴 **`/onboarding` is the one that matters most out of order.** Since
20 September it writes `clients.rehearsal`, which `0038` made NOT NULL with no
default, so every client that ever exists is classified by that form. A wrong
answer is invisible for months and then surfaces as revenue that never existed.
`cockpit/tests/rehearsal.test.ts` guards the part that must survive a rewrite.

---

# 0a. HANDOVER — the cockpit redesign, 19 September 2026

## What happened

§3.17 has said since 17 September that the cockpit is built for the wrong user —
an agency owner rather than the person who sells and runs the automations across
many agencies. The redesign was deferred deliberately until all five automations
existed, because each would surface requirements nobody could predict. They do
now, so the mapping was done.

**Four documents, and nothing is built or designed.**

| | |
|---|---|
| [`cockpit-mindmap.md`](cockpit-mindmap.md) | 27 questions, the inventory, the frame, the operator level, mobile, ten states, every action and every deliberate absence — plus eight places the brief's own premises were wrong |
| [`cockpit-design-brief.md`](cockpit-design-brief.md) | **the frame and the nine operator-level surfaces**, to the depth a design can be drawn against. Constraints, not layouts |
| [`cockpit-design-brief-client.md`](cockpit-design-brief-client.md) | the client level: **the contact record** — Q14, *"why did this person not get the message"* — then the presented-mode screens |
| [`cockpit-design-brief-client-2.md`](cockpit-design-brief-client-2.md) | the twelve remaining client screens at the same depth. Supersedes brief II §3 |

**The operator is designing the screens** from these, using Mobbin for reference
patterns. The briefs deliberately decide nothing visual.

## The three frame decisions, taken

1. **The client is the top-level object.**
2. **The landing is a cross-client worklist, not the client list.** *"Which
   client has the most red"* and *"which client needs me"* are different
   questions; a rollup sorts by volume of problems and a worklist sorts by what
   has to happen.
3. 🔴 **Presented mode is a frame property, not styling.** Five screens are used
   with the laptop turned around, in a room with the agency —
   `segmentation/page.tsx` says so in a comment and `triage-actions.ts` records
   `chosen_by` as the agency's person. **There is a second user**, and if the
   mode is left to a stylesheet those screens get built wrong twice.

## Two corrections that change what gets built

**The contact, not the lead row, is the addressable object beneath a client.**
`consent_events` is keyed `(client_id, phone_e164)` so an objection survives
revert, dedupe and re-import. A lead-scoped screen shows a person's history with
the part that matters most missing.

**`client_automations.health` and `last_run_at` are derived, and the columns are
dropped.** Nothing has ever written to either, so §3.17's per-client rollup has
no source. A column nobody writes to is a fallback asserting that nobody has
checked.

**`0036` IS APPLIED**, 19 Sep, proof
`0036-drop-client-automations-health` blessed. Both columns gone, four rows
intact. All three abort cases behaved, including case 3 — the abort must NOT
fire on the resting state, which is what distinguishes a correct predicate from
a merely present one: `health` was `not null default 'unknown'`, so `is not
null` on it would have matched every row and aborted always, passing both
sabotage cases while failing only the quiet one nobody writes.

🔴 **AND THE SEQUENCING LESSON, FOR WHOEVER DROPS A COLUMN NEXT.** The code
deploy is a **precondition** of the migration, not a companion to it.
`cockpit/src/lib/actions.ts` wrote `health: 'unknown'` on insert — the column's
own default, written back at it — so dropping the column before that line
deployed would have broken client creation, PostgREST rejecting an insert that
names a column no longer there, **with the failure landing on the operator
mid-onboarding in front of an agency.** On this one the drop was run before the
Vercel deploy was checked. The ordering held, but **by luck rather than by
sequence**, and a precondition satisfied by luck is not a precondition anybody
can rely on next time. Check the deploy first; it is one client creation.

## 19 Sep, later — the Overview, and a marker for rehearsal clients

**The landing is now the Overview** (brief D2′, §2.10), and Today moves to
`/today`. The visual direction lives in brief §0.5 and motion in §1.14 — **not in
a memory note.** Nothing is built yet. The Today v3 and Overview designs are
published as artifacts for sign-off before any implementation.

🔴 **`0037` and `0038` are WRITTEN AND NOT APPLIED.** They add
`clients.rehearsal`, with **no default**. Both existing client rows are
rehearsals (`ZZ TEST — Cascais Demo`, and `Ryvo Test Client` on the sandbox
number), and without a marker the Overview would present them as the
business's history.

The order is the 0036 lesson, applied on purpose this time:
1. `0037` adds the column nullable, classifies the two known rows, and
   refuses by name anything unaccounted for.
2. **Then** deploy onboarding asking *real or rehearsal* (required, nothing
   pre-selected, parsed in `cockpit/src/lib/rehearsal.ts`), and update the
   `db/tests` fixtures to insert `rehearsal = true`.
3. **Then** `0038` proves no null and no default, and sets NOT NULL.

Running 0038 before step 2 breaks client creation.

`npm test` is **RED BY DESIGN**: the proof book says
`0037-clients-rehearsal` has never been run. Run its three cases (in the
migration file and the proof's `how`), apply it, and bless it. `0038` is
recorded as **blocked**, not failing; the suite tells you the day
`lib/rehearsal.ts` exists.

**Invoicing provider is Keyinvoice** (operator, 19 Sep). The tracked record is
brief §2.10. The commercial reference is gitignored on purpose (commercial
terms stay off the server that pulls this repo), so its copy of the decision
exists only on the operator's disk.

## What you cannot work out from the repo

**1. The inventory was off by two, and the two matter.** Seven screens were
built standalone, not nine. The **campaign forecast** is `npm run
probe:campaign` — a terminal probe — and the **publication re-check notice** is
`recheckClearances()` with no caller in `app/`. Both are client-level answers to
compliance questions, and counting them as existing budgets zero design for the
two whose absence costs most.

**2. 🔴 04's publication gate has no screen whatsoever**, and it was not on
anybody's list. The refusal that is the entire product of Automation 04 — *this
property may not be advertised, and here is the missing requirement* — reaches
no surface. Today every Portuguese property refuses `policy_not_confirmed` and
there is no way to see it except a probe. Along with it: the prepared piece,
close intake, the template registry, the obligations register, the suppression
record, the quality-rating halt, the proof book, the waiting room.

**3. 🔴 "Why did this person not get the message" has no surface.**
`campaign-evaluation-design.md` §5.1 names it canonical and says it shares one
query with its opposite. The table is `sends` and nothing renders it. It is the
first screen of the client-level brief.

**4. `0035` IS APPLIED.** `automations.name` held *"Database Reactivation &
Referral Engine"* and *"Post-Close Reputation & Referral Loop"* — a product
explicitly refused, one screen away from an agency, because the redesigned
Clients screen is the obvious first reader of that column. `0027` had corrected
one *description* and left every *name*. Now:

```
db_reactivation      Database Reactivation
inbound_concierge    AI Inbound Concierge                 (untouched)
lead_nurture         Lead Nurture & Listing-Match Drip    (untouched, deliberately)
listing_launch       Publication Gate
reputation_loop      Post-Close Review Request
```

Verified across all five rows, not the three changed — an UPDATE whose WHERE
clause matched everything looks identical in the first check. Proof
`0035-automation-names-referral`, blessed 19 Sep.

**5. `lead_nurture` is deliberately still wrong.** *"Drip"* names a send (F5)
that is not built and has no audience until the declaration happens, but the
honest replacement depends on which tier the client is on — agent triage for an
agency with no structured data, and selling *that* as matching is the rejected
row. No document settles a single name, so the migration invented none.

**6. `leads.source` keeps `referral`, and the reason is not obvious.** It is
plain text with no CHECK constraint — a documented convention in `0001` rather
than an enforced value. It stays because a referred lead who messages us is
**inbound on their own initiative**; what was refused is the automation that
takes a name from a client and messages a stranger. Opposite directions of
travel, and only the second is the rejected product.

**7. 🔴 Multi-client inbound routing has never been exercised.** The Concierge
resolves the client from the number a message arrived on —
`whatsapp_number=eq.<To>&limit=1`, no `ORDER BY`. `0007` forbids the collision,
but the sandbox has one sender number, so two clients have never been live at
once. **The second real client is also the first proof that routing works**, and
it is now its own onboarding checklist step — checking **both** halves, because
the failure is a real client's leads answered by another client's assistant and
the row that loses is the one nobody thought to check.

**8. A bad check was caught before it ran, not after.** The first draft of
`0035` gave Automation 02 a description containing the word *"referral"* (to say
it is refused) while shipping a verify query of `where description ilike
'%referral%'` expecting zero rows. Lesson 1n arriving inside a migration. The
description now says what the automation IS; the refusal lives in the migration
header and in `automation-05-review-request-design.md` §1.2.

## What is next

**The operator designs the screens.** All four documents are written and decide
nothing visual; Mobbin is the reference for patterns.

What the briefs deliberately leave open, so it is not mistaken for an oversight:
build order; the `client_automations.health` / `last_run_at` drop (decided,
unwritten, and it wants `0032`'s prove-they-are-empty treatment); the waiting
room's and compliance watch's tables; GDPR erasure (§3.3); and **the agent
entity (§3.1), which must be designed once, properly, with a migration, and
never under deadline pressure.**

---

# 0a. HANDOVER — Automation 05, 19 September 2026

## What 05 is, in one paragraph

**A fairness obligation.** Not "get more reviews" — **ask everyone, without
choosing**, which is at once §8.B's requirement and the only hard part. An
agency doing this by hand will never do it, and not from malice: asking the
client who shouted at you is not a thing people do. The automation exists to
remove the choice.

Remove it and almost no logic remains in the middle. What is left is *who
closed*, *when*, and *did we ask* — and the third is this codebase's first
positive obligation.

Design: `docs/automation-05-review-request-design.md`. §2 and §5 are the two
sections to read before touching anything.

## The catalogue line was four automations

| Act | Verdict |
|---|---|
| Public review | **This is 05** |
| Stay in touch | **Already built — it is 02's segment A template, live** |
| Referral | **Already refused**: a referred contact has no documented origin, which is segment D |
| Testimonial | A permission, not a message. Named, out of scope |

Both catalogue names were corrected on 19 Sep: "Referral" appeared in two of
five automation names and was built in neither, and 05 lost "Reputation Loop"
because it is one message, once.

## Where it stands

| | |
|---|---|
| `0033` closes, `0034` review destination | ✅ applied, verified, **blessed** |
| Close intake + party declaration | ✅ pure validation, the store, and the ask-the-agent prompt |
| The disposition | ✅ derived from the send row, seven reasons, none able to express a judgement |
| The omission reconciliation | ✅ a reconciliation, not an invariant. Sends nothing |
| The screen | ✅ three counts together, the gap explained, the limits on the page |
| Template drafts | ✅ `avaliacao_pos_venda_pt`, held for the lawyer |
| The runner, minus the dispatcher | ✅ decides and stops one function short. The whole of `src/lib/review/` is swept for a route to a send |
| The send itself (step 7) | ❌ held — `gates.ts` `review-asks`, behind `meta_verified` |

## What you cannot work out from the repo

**1. Nothing has ever run.** No close has been recorded, because no agency has
reported one. Every screen is correct and empty.

**2. 🔴 The contradiction, and it is the most important sentence here.**
*"Everyone" means everyone we may lawfully message.* The gate refuses segment D,
segment E, suppressions and unresolvable jurisdictions, so **the ask list is
always shorter than the sales list**. Somebody will read that as a bug.
**Closing it is the offence.** Defended twice: the screen shows the gap with
every reason beside it, and the reason vocabulary is closed with no member that
can express a judgement — a seventh reason fails a test that tells you to come
and write down what it is for.

**3. There is no per-sale skip, and its absence is the design.** An agency may
switch 05 off entirely; never for one sale. Guarded twice: the page cannot grow
a control, and `CloseRow`'s key set is asserted whole. **The second guard works
because `npm test` runs `tsc` first** — split those scripts and it silently
stops holding.

**4. This is the one place where the tempting act is the kind one.** Sparing
the client who had a difficult sale is what a decent person would do by hand.
Everything above exists so nobody has to be decent about it at 6pm on a Friday.

**5. The backfill rule enforces itself.** The ask window is measured from
`closed_on` and never `reported_at`, so a backfilled close is born expired. No
constraint mentions backfills, deliberately — a rule with a second number
chosen to defend it has two places to be wrong.

**6. `reported_after_window` is not `unaccounted`, and the distinction carries
the whole check.** Two hundred historical closes reporting as findings would
hide the one genuine skip, and the genuine skip is the only output that means
anything.

**7. The review link is a POLICY boundary.** The host allow-list exists because
§8.B is *Google's* policy; a link to another platform runs this automation under
rules nobody has read. The path is deliberately unconstrained — a pattern tight
enough to feel rigorous rejects a valid link an agency pasted from their own
dashboard.

**8. A transport failure now reports as one.** `RULE 1: an objection is
permanent` went red once on 18 Sep and never again — a network blip surfacing
under the name of the most important rule in the codebase. Fixed 19 Sep:
`tests/lib/rpc-errors.ts` classifies on the presence of a Postgres/PostgREST
`code` (an answer) versus none (the call never arrived), a reachability check
runs first and is NAMED for transport, and every rule failure now leads with
*"NEVER EVALUATED"*. **Nothing is suppressed — the suite goes red either way.**
Verified by pointing the client at an unreachable host and reading the output.

**9. `not_in_service` is DATED, and that is the whole of it.** A close whose
window ran before an approved template existed is not an omission. A boolean
would make every pre-service close flip to a finding the moment Meta approves
one — the backfill mistake with the sign reversed: a change in OUR state
rewriting the history of what we did about theirs.

## What waits on somebody else

| Who | What |
|---|---|
| **A lawyer** | 🔴 Does segment A's existing-customer basis carry a review request? It covers *products or services analogous* to the transaction, and a review request is neither. **If not, 05 reaches only segment B — a smaller audience and a different product.** Question 2 of `nota-questoes-automacao-05.md` |
| **A lawyer** | Is a review request a commercial communication under Lei 41/2004? §12.9, registered 17 Sep, omitted from both earlier batches — the omission is declared in the note |
| **Meta** | Verification and template approval. 05 inherits 02's gate and **cannot enter service before 02 does** |
| **An agency** | Reporting a close, with the party. One message per sale, which an agent may already be sending because it takes the listing out of matching |

**Ten questions are now with the lawyer across three notes.** Four from 02 (sent
17 Sep, unanswered), four from 03/04 (18 Sep), two from 05 (19 Sep).

---

# 0b. HANDOVER — Automation 04, 18 September 2026

**Read §0c too. 03 and 04 are the same conversation away from being useful.**

## What 04 is, in one paragraph

**A publication gate.** A property may not be advertised publicly unless it is
lawful to advertise it; then a piece is prepared; then **a person at the agency
publishes it**. It is not a content generator, and it does not alert interested
buyers — that is 03. The value is that an agency publishing through us cannot
publish an unlawful advertisement.

**And since this morning it no longer knows what Portugal requires.** Portugal's
answer — one energy class, one national AMI licence — had been mistaken for the
question. Spain answers with **two** ratings whose validity comes from
registration with one of **seventeen** regional registers, plus an agency
registration mandatory in two regions and absent in most. A Barcelona property
carries a requirement the same agency's Zaragoza property does not.

So the jurisdiction is **data**: `advertising_policy`, keyed `(country, region)`,
declaring *typed requirements* rather than columns. Adding a country is a row.

Two design documents, and read them in this order:
`docs/automation-04-advertising-jurisdiction-design.md` first (it supersedes the
shape), then `docs/automation-04-publication-gate-design.md` §2, which is the
two-gate boundary and the part to read before touching anything.

## Where it stands

| | |
|---|---|
| The two-gate boundary | ✅ `tests/two-gates.test.ts`, written **before** any 04 code, proved against six wrong F5s |
| `0027`–`0032` | ✅ all applied, verified, blessed. `0032` is the destructive one and proved its own abort first |
| The gate | ✅ **requirement-driven**. Refuses by naming the requirement, not the column |
| Exemption declaration | ✅ reads like the segmentation one, against a *requirement* rather than a property |
| Standing re-check + notice | ✅ **all four ways a clearance stops holding**, not just the date: a licence suspended, a requirement that becomes effective, a jurisdiction we can no longer read. The notice claims nothing it cannot do |
| Registrations to confirm | ✅ 90 days, keyed by the **licence** and not the property; a question, never a refusal — the interval the gate's `'unknown'` departure was deferring to |
| Prepared piece + invariant | ✅ invariant read on the artefact; mentions are a registry that **throws** on an id it cannot say |
| Spain's rows (step 5) | ⏸️ **deliberately held.** The etiqueta question could change what a Spanish piece *is*; a row built before that answer is built to a shape that may not survive it |
| ~~Re-check widened (step 6)~~ | ✅ done 18 Sep. Ten sabotages, ten matching predictions |
| The lookup (step 7) | ❌ needs ADENE access, which is being registered for |

## What you cannot work out from the repo

**1. Everything refuses, and not for the reason you would guess.** Measured:

```
policy PT/-  confirmed = NULL  requires = 2
listing_facts = 0   agency_facts = 0   fact_proposals = 0
listing A-1042  under_offer  region = NULL
```

Portugal's row is **researched and unconfirmed**, so it permits nothing and
every property refuses with `policy_not_confirmed` — *before* anybody's missing
certificate is reached. That is deliberate: what is in doubt is **our encoding**
of the obligations, not the obligations. Carving out the country we feel sure
about would make the flag mean "somebody was confident" rather than "a lawyer
confirmed", which is the only thing it can usefully mean.

**A lawyer setting `confirmed_at` and `confirmed_by` on that one row unblocks
Portugal entirely.** It is question 4 in the batch.

**2. 🔴 The F5 tripwire is still the thing to get right.** 03's lead-facing send
needs BOTH gates — consent about the person, publication about the property —
and it is not built. `two-gates.test.ts` passes today only because nothing on
the send path knows what a listing is, and **fails with a filename** the day
that changes. Proved against the two shapes anybody would actually write: the
runner carrying a `listingId`, and `campaign-plan` reading the listings table.

**3. The flat columns are gone and must not come back.** `0028`'s five columns
were the right facts in the wrong home; `0032` dropped them after proving they
were empty. `nothing reads the flat columns 0032 drops` guards the **shape**,
not the drop: the next person wanting an energy class on a listing will reach
for a column, and a column cannot hold Spain's two ratings or an agency's
several regional registrations.

**4. The region is declared, never inferred.** `listings.region` is entered by a
person. Deciding that "Sant Cugat" is in Cataluña applies a legal requirement or
removes one — a string match producing a legal conclusion is a guess with a
citation attached.

**5. `'unknown'` passes at the gate, deliberately, against the design's own
line.** A typed registration is the agency asserting their own licence number,
and no register lookup exists. Refusing it would publish nothing until we build
something we have not built. The gate refuses on facts; **decay is surfaced** by
the re-check. Stated in the code where the decision is.

**6. We cannot withdraw a post we did not publish.** A test fails on any verb
claiming we acted on the advertisement. Do not add one. The guard now asserts
its own cases before using them — it had been masculine-singular only, and every
noun in this feature (*publicação*, *menção*, *licença*, *peça*) is feminine.

**6b. The re-check reports what it could not check.** Hand it no policy rows and
it reports nothing and says so, rather than reporting every clearance as a
problem or as fine. `undefined` means *not asked*; `[]` means *asked, and there
are none* — a real finding. Do not collapse them with `?? []`; that one operator
is lesson 5k.

**7. The fines are the COMPANY range** — €2,500 to €44,890, not the €250–€3,741
that §8.A carried until today. That sentence exists to make a conversation
happen; understating it twelvefold is the opposite of what it is for.

## What waits on the operator

**Four questions, in `legal/fonte/nota-questoes-automacao-04.md`** — and note the
batch is two documents: the 02 note's four, sent 17 September and unanswered,
plus these four.

1. 🔴 Is a WhatsApp message naming a property an advertisement? **Blocks
   submitting 03's templates**, because approved text is immutable.
2. Energy-certificate exemptions, and who may declare one.
3. 🔴 The **etiqueta** — may a text advertisement carry two letters, or must the
   graphical label be shown? If the label must be shown, **the Spanish piece is
   not text**, and that changes what 04 *is* in Spain. Step 5 is held for this.
4. One sentence confirming Portugal's row. **The only one that unblocks
   anything immediately.**

And per client: an **AMI licence number**, once. Per property: an **energy
rating and its expiry**, or a declared exemption.

**Portugal only.** §8.A.3 and the findings register both say 04 cannot enter
service in Spain without its own analysis.

---

# 0c. HANDOVER — Automation 03, 18 September 2026

**Read this first if you have read nothing.**

## What 03 is, in one paragraph

A property arrives from an agent over WhatsApp. The system works out which of
the agency's past and current contacts genuinely want it, tells the agent who
they are and *why* — quoting what the contact actually said — and, where consent
allows, can reach them. The argument for it existing is that a CRM matches on
form fields, and we match on the conversation: *"we could stretch for the right
place"* is not a field, and it is decisive.

**And the requirement that shapes everything current:** it must work for an
agency with **no CRM and no structured contact data**, because most of the
segment has none. That produced `docs/automation-03-no-crm-design.md`, which is
the live spec for everything built in the last two days. Read it before the
original handoff — where they disagree, the design doc is newer.

## Where it stands

| | |
|---|---|
| F1 ingestion | ✅ built, proven against a deliberately messy file |
| F2 listings | ✅ built and live in the Concierge (an agent WhatsApps a property) |
| F3 matching | ✅ engine + wired + `0025`/`0026` applied, every constraint seen to fire |
| F4 agent notification | ✅ built against fixtures. Rides the 24h window the agent opened — **no template, no Meta dependency** |
| triage floor | ✅ built — the product when nothing can be ranked. Needs no thresholds, works today |
| silence (half of F6) | ✅ built — "N people told you what they wanted and nobody has spoken to them" |
| F5 direct outreach | ❌ not built. Needs the declaration (below) before it has an audience |
| F6 outcomes | ❌ not built. Nothing to record until something has been sent |

Cockpit screens: `/listings`, `/listings/[id]`, `/listings/[id]/triage`,
`/calibrate`, `/silence`. All standalone, not in the old Shell.

## What you cannot work out from the repo

**1. The database is nearly empty, and that is correct.** Measured 18 Sep:

```
clients 2 · leads 2 · inbound messages 11 · listings 1 (under offer)
listing_matches 0 · lead_requirements 0 · consent_events 5 · sends 1
```

So every screen looks empty and every match run refuses. **Nothing is broken.**
An empty screen and a refusal are the designed output of a system nobody has
calibrated yet.

**2. The refusal IS the product working.** `planMatchRun` returns
`thresholds_not_configured` naming all six keys, because §4.6 refuses to invent
matching thresholds — any value chosen now is a guess wearing an agency's name.
**Do not make it pass by seeding data.** That is an explicit operator
instruction, not a preference: inventing listings and thresholds invents both
the input and the correct answer, which proves the code runs and says nothing
about whether the matching is right.

**3. `probe:dod` item 7 is `NODATA`, deliberately.** It reads a
`lead.escalation_cleared` row and there is none. The probe exits 0. **Do not
create a row to turn it green** — the note in the probe says so too.

**4. `probe:layout` has two known failures**, both 10.5px type on
`span.anom__stage` at `/` and `/queue`. Pre-existing, in the old cockpit
surfaces the redesign replaces. Left alone on purpose.

**5. `@playwright/mcp` is configured but its tools were not available** in the
18 Sep session. It did not matter: `tests/lib/chrome.ts` drives headless Chrome
over CDP with no dependency, and `probe:controls` uses it to answer the one
question no token-level check can — does a selected control *look* selected.

**6. Pushing deploys the cockpit.** Commit freely; push when asked.

## The working rules that are not in any lint

- **No writes to the production database without asking.**
- **Check the artefact, not the execution status.** A green node, a 2xx and a
  zero exit have each lied on this project.
- **Sabotage every guard**, and assert the sabotage applied before believing the
  result. A sabotage that changes nothing and a guard nothing tests produce the
  same green.
- **When a sabotage mismatches your prediction, investigate it — never adjust
  the test to make the prediction right.** The predictions here were wrong six
  times in one day and always too *narrow*; every one of them was a test that
  should have failed and was not foreseen, and two of those investigations
  found real defects.
- **Say plainly when the agency conversation is the reason something cannot
  proceed.** Standing instruction.

## What is waiting on the operator, and only on them

**One conversation, three outcomes.** `docs/calibration-conversation.md` is the
script — written to be read aloud on a call.

1. **The eight calibration questions** (half an hour). Until answered, every
   match run refuses.
2. **Whether the notification reads like something an agent would act on**, and
   whether it works on a phone. Fixtures cannot answer this.
3. **The declaration** — where each group of contacts came from. A separate,
   longer sitting. Matching works without it; **nothing is ever sent without
   it.** `improvements` §3.18.

Calls were booked for Monday 22 September 2026; the agency conversation follows
from whichever goes anywhere.

**Until then the honest answer to "what should I build next" is: very little.**
F5 has no audience, F6 has nothing to record, and the matcher's quality is
unprovable from a keyboard. Ask before starting anything that needs a real
agency to be meaningful.

## 0. PHASE 1 COMPLETE — 2026-09-05. Phase 2 is next.

**Server patch state, as of 2026-09-01 ~16:02 UTC:** fully patched and rebooted.
Kernel `6.8.0-138-generic` (from `-117`, four kernel updates plus `libc6`);
`/var/run/reboot-required` cleared. All three containers came back on their own
via `restart: unless-stopped`, postgres healthy, and — the check that actually
matters — an unsigned `POST` to `/webhook/twilio-inbound` returned **403**,
proving n8n re-registered the webhook from the database rather than merely
starting. Both workflows still `active=true`.


**The Inbound Concierge is built, deployed and proven.** It answers a WhatsApp
enquiry in about six seconds, qualifies the lead, books a viewing into a real
Google Calendar, refuses to double-book, escalates to a human when it should,
and shouts by email when any of its four dependencies breaks.

**Read [`phase-1-completion.md`](phase-1-completion.md) first** — it is written
for a cold reader and covers what exists, what is proven and how, what is
known-limited, and what carries forward. Then the runbook for operations, then
`engineering-lessons.md` for why things are shaped the way they are.

| | |
|---|---|
| Workflows | `ryvoInboundConc01` (86 nodes), `ryvoSupaKeepAlv` (8) |
| Latency | 5.7–6.8s end to end, ~$0.006 per turn |
| Automated tests | slot engine 66/66, language 31/31, prompt suites 15/15 + 30/30 + 27/27, lint 30 nodes clean |
| Health checks | 12, every 10 minutes, alerting by email |
| Cron | backup 03:00, metrics 03:20, health check every 10 min |

**Checkpoints delivered:** A (inbound plumbing), B1–B3 (reply, persistence,
escalation), C1–C3 (propose, book, do not double-book), **C4** (unplanned — the
race was not actually closed by C3), D1–D5 (email alerting, per-language system
messages, non-text inbound, derived metrics, forced-failure drills).

### Before the first real client — blocking

1. **Twilio Sandbox → a production WhatsApp sender.** The sandbox session
   expires every 72 hours and needs a keyword re-join. Fine for demos,
   impossible for real leads.
2. **The Google OAuth app is "Internal"** — only `ryvodigital.com` accounts can
   authorise it. A client's calendar lives elsewhere.
3. **Boot n8n against a restored database once.** The restore drill proved the
   dump restores; nothing has proved n8n runs against the result. Open since
   Phase 0.

### Next: Phase 2

Reactivation automation (which fills `metrics_daily.reactivations`), the
cockpit reading Supabase, and weekly client reports (the `reports` table exists
and is unused). Deferred polish — travel time between viewings, DMARC
tightening once the `rua` reports are clean, alert-noise handling — is listed
in `phase-1-completion.md` §5.

---

## 0a. Phase 1 — Checkpoint D1: email alerting (2026-09-04)

**The alarm no longer shares a fate with the thing it watches.** The old push
rode the Twilio *sandbox*, whose session expires every 72 hours, and shared that
transport with the escalation path it was meant to report on.

| | |
|---|---|
| Transport | Resend HTTPS, own credential. Not Twilio, not Supabase, not n8n |
| Recipients | personal Gmail (**survivability**) + hello@ (**attention**) — different properties, do not consolidate |
| Health check | cron every 10 min, **outside** n8n, 7 checks |
| Callers | `healthcheck.sh`, `backup.sh`, keepalive failure, escalation-notify failure |

**All four legs proven by breaking them, not by reasoning:**

- Nulled `activeVersionId` → two independent FAILs, alert raised, `publish` cleared it.
- Forced a mid-script `set -e` abort in `backup.sh` → EXIT trap fired, status written.
- Pointed the keepalive at an unresolvable host → email accepted (200 + Resend id, 407ms).
- Forced `escalate_to` invalid → `operator_notified: false`, `email_alert_ok: true`, lead still got the handoff.

**The find:** the first drill produced three failure executions, the email node
ran in all three, every node reported `success`, and **zero emails were sent** —
the credential had its header *name* set to `Ryvo Resend` instead of
`Authorization`. It was invisible because `onError: continueRegularOutput`,
added at B3 so a transport error could not kill the workflow, turns "request
rejected" into "here is an item, carry on". The fix for one failure created the
conditions for the next. Every delivering node now asserts its response.
See `engineering-lessons.md` instance 13.

**Deferred deliberately:** DMARC. It is domain-wide and would apply to Workspace
mail too; do it properly (`p=none` → read reports → tighten) before client
volume, not as a side effect of alerting.

**Next: D2 — per-language handoff notes.** Fixed config strings keyed by
language, never model-rendered; the five-second-race apology rides along.

---

## 0a. Phase 1 — Checkpoint C complete (2026-09-04)

**The Concierge proposes real times, books them into a real calendar, and does
not double-book.** 66 nodes. That makes the pitch document's *"booked directly
into your calendar"* true.

| Gate | What it added | Proof |
|---|---|---|
| C1 | Free/busy, working-hours filter, slot selection, stored proposals | Real slots, stable across unrelated messages, honest about *why* a day is unavailable |
| C2 | Confirmation matching, re-check, event creation, `viewing_booked` | Event created; replay makes exactly one; reschedule and human-request both escalate |
| C3 | Double-booking prevention | Two leads raced the same slot 0.4s apart — one booked, one blocked by the re-check |

**Two guards, catching different things.** A slot taken *before* the
confirmation arrives → apologise and re-propose, no escalation. A slot taken
inside the ~5s window between the pre-call check and the create → no event,
reply discarded, escalate. Both proven against the real calendar.

**The find of the checkpoint reached a real lead.** Asked about "sabado dia 12"
while the supplied list covered the 5th and 7th, the Concierge answered *"tenho
as 14:00 ou as 15:00"* — times nobody supplied. The never-invent probe scored
**18/18 throughout C1 and C2**, including the run accepted as C2 evidence,
because every case in it asked about a day the list *covered*. §9.10 is now a
deterministic guard in `ParseClaude`, not a prompt instruction with a probe
behind it. See `engineering-lessons.md` instance 11.

**Carried into D:** the five-second race escalates rather than apologising,
because the model has already written a confirmation before the conflict is
known — revisit with the per-language handoff notes.

**Test-calendar note:** `Ryvo Test Client Viewings` now holds operator fixture
events plus Concierge-created bookings on 7 and 10 September. The operator's
Google UI appears to display **UTC+2** — events described as 09:00–13:00 are
returned by free/busy as 08:00–12:00 Lisbon. The system is correct with respect
to what Google returns; confirm the calendar's timezone setting before reading
the fixture times as authoritative.

---

## 0a. Phase 1 — Checkpoint C, Gates C1 + C2 (2026-09-04)

**The Concierge books viewings into a real calendar.** 66 nodes. C1 proposes
real times; C2 matches the confirmation, re-checks, creates the Google event,
moves the lead to `viewing_booked` and writes `viewing.booked`.

| | |
|---|---|
| Confirmation matched by | the **workflow** (`matchConfirmation`, unit-tested). Ambiguity never books |
| Decided | **before** the Claude call, so the model is told the outcome rather than asked for it |
| Double-booking guard | a second free/busy scoped to the single slot, immediately before create |
| Idempotency | a derived Google event id — a replay collides (409) instead of double-booking |
| Stored | `leads.qualification.booking` (`event_id`, times, zone), `stage=viewing_booked` |

Measured: offer → confirm → created; replay → `already_booked`, one event;
"posso mudar para sexta?" → escalates; "marcar e falar com uma pessoa" →
escalates, nothing booked. **Field proof:** after two bookings Google's
free/busy returned one merged busy interval and the next offer skipped exactly
those two hours — the calendar itself confirming the events exist at the right
times and lengths.

**Next: Gate C3 — it doesn't double-book.** Put real events in
`Ryvo Test Client Viewings` first so the conflict test has something to collide
with. Note the test calendar now holds Concierge-created events from C2; clear
them when convenient (ids are in `qualification.booking.event_id` and the
`viewing.booked` rows).

**Known, unchanged from B3:** the handoff note is a fixed English config string,
so a Portuguese lead who asks to reschedule gets an English sentence. Accepted
at B3; worth revisiting when the second alerting channel lands.

---

## 0a. Phase 1 — Checkpoint C, Gate C1 (2026-09-04)

**The Concierge proposes real times.** 54 nodes; `QueryFreeBusy` and
`ProposeSlots` sit between `LoadHistory` and `BuildClaudeRequest`, so free/busy
is already in the prompt whenever the conversation turns to booking. **Nothing
creates events yet — that is C2.**

| | |
|---|---|
| Slots chosen by | the **workflow**, never the model — C2 must match a confirmation against exactly what was offered |
| Stored at | `leads.qualification.proposed_slots` (with `prefer_date`, `prefer_requested`, `at`) |
| Config added | `timezone`, `calendar_id`, `min_hours_notice: 24`, `viewing_duration_minutes: 60` |
| Latency | 5.7–6.8s end to end, `claude_ms` 4.0–5.2s — free/busy costs well under a second |

Three things C1 got wrong before it got them right, all worth knowing:

1. **A wrong calendar id is indistinguishable from a free calendar** — Google
   answers 200 with `busy: []` and hides the failure in `calendars[id].errors`.
   Found by probing before writing the consumer.
2. **An unrelated message overwrote a live offer.** "Tem estacionamento?"
   replaced a standing Thursday offer with a fresh spread, leaving C2 nothing to
   match. Offers are now re-used and re-validated, not recomputed.
3. **"Friday is fully booked" was said about a Friday that was merely too
   soon.** `preferStatus` now distinguishes `full` / `too_soon` / `closed_day` /
   `out_of_window`, and the prompt turns each into a different sentence.

See `concierge-runbook.md` → *Booking — how Gate C1 proposes times*.

### Deploy durability — settled, and the alarm was wrong

An earlier version of this file said a CLI deploy left the instance one restart
from a silent outage. **That was wrong.** `workflow_published_version` — the
empty table the claim rested on — is not used by this path at all. The runtime
reads `workflow_entity.activeVersionId`, and `publish:workflow` sets it.

Measured on the live instance: `import:workflow` sets `active=f` and
`activeVersionId=NULL` (webhook 404s), and either `publish:workflow` or
`update:workflow --active=true` restores it. **The repaired state survives
`docker restart`** — tested explicitly. A routine kernel reboot is safe.

Still unexplained: the Concierge did 404 mid-session with no deploy in the
window. The trigger is unknown; the shape is known (`activeVersionId` goes
NULL, every message 404s, nothing alerts). That last clause is the real
finding, and it belongs to the Checkpoint D alert: assert
`activeVersionId IS NOT NULL` and that an unsigned POST returns 403.

Full evidence and the retraction in `concierge-runbook.md` → *Deploy
durability*.

**Next: Gate C2 (it books), then C3 (it doesn't double-book).** Block #1 in the
runbook's "What Checkpoint C must undo" table is still in place — `MergeLeadFields`
refuses `viewing_booked` and `RANK` has no entry for it.

---

## 0b. Phase 1 — Checkpoint B complete (2026-09-03)

The Concierge now answers, learns, and knows when to stop. **52 nodes**, active
on `POST /webhook/twilio-inbound`; `supabase_keepalive` is 6 nodes, daily 04:00
and genuinely firing (verified by execution row, not by `active=true`).

| Gate | What it added | Proof |
|---|---|---|
| B1 | History load, Claude call, defensive parse, Twilio send, outbound row | Real handset, reply in correct Portuguese, ~6s |
| B2 | Lead persistence, stage transitions, the no-backwards rule, `events` | Four-message conversation; budget and timeline survived an unrelated message |
| B3 | Full escalation (four §8 steps), reply-guard retry, keepalive push alert | Three escalation triggers, post-escalation silence, alert delivered |

Model `claude-sonnet-5` at `effort: low`, read from `client_automations.config`.
Structured outputs primary, defensive parse as backstop. **Read
[`concierge-runbook.md`](concierge-runbook.md) §0 before touching any of it** —
model config, measured baselines, and the prompt defects that probing caught.

**Read [`engineering-lessons.md`](engineering-lessons.md) too.** Nine instances
of the same failure now: a test and the system disagreeing about what was
actually exercised. Rule 10 is the one to internalise — *"only X throws, so X
ran" is not evidence*. Instance 9 runs it backwards: a **red** suite that was
prompting a stale copy, and nearly bought a fix for a defect production did not
have.

Carried forward into C: the three deliberate booking blocks listed in
`concierge-runbook.md`, which must all be lifted together.

---

## 0b. Phase 1, Checkpoint A — done 2026-09-01

**Channel changed.** The Meta Cloud API path is blocked (the Facebook account
needed for the Business Portfolio was disabled, appeal denied). Phase 1 runs on
the **Twilio Sandbox for WhatsApp**. Everything downstream of the inbound parse
is channel-agnostic, so returning to Meta touches the parse node, the signature
check and the send node — nothing else. The Meta keys stay in `.env.example` as
empty placeholders.

At the time: `inbound_concierge_whatsapp` (18 nodes, active, `POST
/webhook/twilio-inbound`) and `supabase_keepalive` (daily 04:00). 40/40
automated checks passed against genuinely Twilio-signed requests, then confirmed
with a real handset — execution 18, success, 1.611s, one lead, one message, no
duplicates.

**Operational runbook — read this before touching the Concierge:**
[`concierge-runbook.md`](concierge-runbook.md). It carries the failure-first
checklist (sandbox session expires every **3 days** — always check that before
debugging), the Twilio console path, the signature-URL trap, and the secrets
rules.

Things that will bite whoever is next:

1. **The Twilio sandbox session expires every 3 days.** Inbound silently stops.
   Re-send `join <keyword>` before debugging anything.
2. **Dedupe is enforced by the database**, not workflow logic — migrations
   `0003` + `0004`. Both indexes are deliberately **non-partial**: PostgREST's
   upsert emits `ON CONFLICT` with no predicate and cannot see a partial index
   (`42P10`). Do not "tidy" them back.
3. **Activate workflows in the n8n UI, not the CLI.** UI is immediate; CLI needs
   a restart. Checkpoint A cost four bounces by doing it CLI-first.
4. **The n8n `environment:` block is a security surface.** With
   `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, any Code node can read every variable
   there. Keep it minimal — the Supabase key is an n8n credential precisely so
   it is not there, and so `export:workflow` cannot push it to GitHub.
5. **`escalate_to`** is set to `+351933048230`. ~~The keepalive still has no push
   alert~~ — added and verified at B3, but see the transport-error caveat in
   `concierge-runbook.md` §9: it was initially blind to the one failure it
   exists to catch.

---

## 1. What is live

| Thing | Value |
|---|---|
| Server | Hetzner CX22, Ubuntu 24.04 LTS, Falkenstein (EU) |
| Public IP | `167.233.16.22` |
| Hostname | `ryvo-n8n` |
| Domain | `ryvodigital.com` |
| n8n | <https://n8n.ryvodigital.com> — owner account claimed |
| Repo on server | `/opt/ryvo-automation-platform` |
| GitHub | `RyvoDigital/real-estate-automation-project` (private) |
| Supabase | EU / Frankfurt (`eu-central-1`), Postgres 17.6 |

### Container versions (pinned, running)

| Service | Image |
|---|---|
| caddy | `caddy:2.11` |
| n8n | `docker.n8n.io/n8nio/n8n:2.28.3` |
| postgres | `postgres:18` |

n8n is backed by Postgres (`DB_TYPE=postgresdb`), **not** SQLite. Postgres has
no published host port — it is reachable only inside the Docker network.

### TLS

Let's Encrypt cert for `n8n.ryvodigital.com`, valid to **2 Oct 2026**, renewed
automatically by Caddy. HTTP `:80` 308-redirects to HTTPS.

---

## 2. Access

```bash
ssh ryvo@167.233.16.22        # or just: ssh ryvo
```

A `~/.ssh/config` entry on the operator laptop defines the `ryvo` host alias
with `IdentityFile ~/.ssh/ryvo_ed25519`, `AddKeysToAgent yes` and
`UseKeychain yes`.

**Gotcha:** `~/.ssh/ryvo_ed25519` is passphrase-protected. If ssh starts
failing with `Permission denied (publickey)` and `ssh-add -l` says *"The agent
has no identities"*, the keychain entry was lost. Fix, in a real terminal
(not through an agent harness — the interactive passphrase prompt does not
round-trip):

```bash
ssh-add --apple-use-keychain ~/.ssh/ryvo_ed25519
```

Server access is key-only: `PermitRootLogin no`, `PasswordAuthentication no`,
`KbdInteractiveAuthentication no`. `ufw` allows **only** 22, 80, 443 inbound.
Unattended security upgrades are active.

---

## 3. Database state

### Engine DB (n8n's own Postgres, on the server)

Operational state for n8n only. 110 tables, all n8n-managed. Never hand-edit.

### Platform DB (Supabase — the spine the cockpit and Zero will read)

`0001_base_schema.sql` and `0002_service_role_grants.sql` are both applied.

- **9 tables:** `clients`, `automations`, `client_automations`,
  `automation_runs`, `leads`, `messages`, `events`, `metrics_daily`, `reports`
- **RLS enabled on all 9, with zero policies** — deliberate. v1 has no
  browser-side data access; everything goes through the server using the
  service_role key.
- **`automations` seeded** with the 5 catalogue rows (`inbound_concierge`,
  `db_reactivation`, `lead_nurture`, `listing_launch`, `reputation_loop`).
- All other tables are empty.

Verified functionally, not just by reading flags: the publishable key gets
**401** on every table; `service_role` does a full SELECT / INSERT / DELETE
round-trip.

### ⚠️ The free tier auto-pauses after ~1 week of inactivity

**This is not theoretical — the project paused during a 10-day break in
late July / early August 2026.** Supabase pauses free-tier projects after
roughly 7 days with no activity; the database stops answering and has to be
restored manually from the dashboard before anything works again.

Implications:

- Any n8n workflow hitting Supabase after a quiet week fails on a **dead
  connection**, not a clean error. Phase 1 automations must not assume the
  platform DB is reachable.
- "Inactivity" is measured on the Supabase project. The engine Postgres on our
  own server is unaffected and keeps running — so the nightly backup keeps
  succeeding and gives **no signal** that the platform DB has gone away. A
  green backup log does not mean Supabase is up.
- A real client's automations generate daily traffic, so a live project is
  unlikely to idle into a pause — but the gap between signing a client and
  their first steady traffic is exactly when this would bite.

**Decision to make before launch:** upgrade to Supabase Pro (no auto-pause,
longer backup retention) or move the platform DB onto the existing Hetzner
Postgres. Tracked in §7 under *Outstanding before the first client*.

### ⚠️ Read this before writing migration 0003

Supabase's `ALTER DEFAULT PRIVILEGES` grants full DML only on tables created by
`supabase_admin`. Tables created by **`postgres`** — which is the role the
session pooler connects as, i.e. how we apply migrations — get only
`Dxtm` (TRUNCATE / REFERENCES / TRIGGER / MAINTAIN), **no
SELECT/INSERT/UPDATE/DELETE**.

This bit us: every table from `0001` was unreadable by `service_role`, and
because **GRANTs are evaluated before RLS**, service_role's `BYPASSRLS`
attribute did not compensate. The REST API returned `42501 permission denied`
for both reads and writes. Phase 1 n8n would have failed on its first write.

`0002` fixes it *and* sets default privileges so future tables inherit the
grants — so new tables should be fine. But if a future migration adds a table
that `service_role` unexpectedly cannot touch, this is the first thing to
check.

### Applying migrations

The publishable/secret API keys (`sb_publishable_…` / `sb_secret_…`) go through
PostgREST and **cannot run DDL**. Use the direct connection in
`SUPABASE_DB_URL` (session pooler, port **5432** — the transaction pooler on
6543 does not reliably handle multi-statement DDL).

There is no migration-tracking table yet; migrations have been applied by hand,
in order, in a single transaction each:

```bash
ssh ryvo
cd /opt/ryvo-automation-platform
set -a; . ./.env; set +a
cd infra
docker compose --env-file ../.env exec -T -e DBURL="$SUPABASE_DB_URL" postgres \
  sh -c 'psql "$DBURL" -v ON_ERROR_STOP=1 --single-transaction' \
  < ../db/migrations/000X_whatever.sql
```

Using the container's `psql` avoids installing a Postgres client on the host.
If Phase 1 adds many migrations, consider adopting a real migration tool
rather than growing this by hand.

---

## 4. Backups

`infra/scripts/backup.sh`, nightly at **03:00 Europe/Lisbon** via the `ryvo`
crontab. The host is UTC, so the crontab sets `CRON_TZ=Europe/Lisbon` — this
keeps the run at 03:00 local across DST instead of drifting an hour twice a
year.

What it does, in order: `pg_dump` the engine Postgres → gzip to `backups/` →
export n8n workflows to `workflows/` → commit → prune dumps older than 14 days
→ **push to GitHub**.

Retention runs *before* the push on purpose: a failing push must not leave
dumps accumulating until the disk fills.

- Log: `/var/log/ryvo-backup.log`, rotated weekly, 8 kept, compressed.
- Dumps: `backups/` — gitignored, they never enter git history.
- Offsite push uses a **repo-scoped deploy key** with write access:
  `~/.ssh/ryvo_github_deploy` on the server (no passphrase, required for
  unattended cron). The server remote is SSH, not HTTPS.

**Current run output is `-> No workflows in n8n yet` and that is correct** —
Phase 0 deliberately builds no automations. `n8n export:workflow --all` exits 1
on an empty instance, which used to fail the whole backup every night; that is
now handled. Once Phase 1 creates the first workflow this path starts producing
real commits.

Verified: last run exit 0; dump `n8n-20260727.sql.gz` (52K gz / 335KB raw)
passes `gzip -t` and ends with `PostgreSQL database dump complete`. Deploy-key
write access confirmed by pushing and deleting a throwaway branch.

### Restore drill — done 2026-08-07, PASS

`restore.sh` has now been exercised. `n8n-20260807.sql.gz` was restored into a
scratch database and compared against live: **110/110 tables, 820/820 columns,
7/7 sequences, exact row counts on all 110 tables, and a full-content md5 match
on 109 of 110.** The one differing table (`user`) matches the *dump* exactly —
live had simply moved its `lastActiveAt`/`updatedAt` on since the 03:00
snapshot. Live was never written to and nothing was restarted.

Six defects were found and fixed in `restore.sh` — the worst being that the
load ran without `ON_ERROR_STOP`, so a completely failed restore would print
"Restore complete." and bring n8n up against an **empty database**. The script
also had no way to restore anywhere but over production, which is why it had
never been tested.

Full procedure and evidence: [`restore-drill.md`](restore-drill.md). Re-run the
drill after any change to `backup.sh`, `restore.sh`, the Postgres image or the
n8n version, and at least quarterly:

```bash
./infra/scripts/restore.sh --target-db n8n_restore_drill backups/n8n-YYYYMMDD.sql.gz
# ...then drop the scratch DB (command is printed at the end of the run)
```

**Still untested:** booting n8n against a restored database, and the live
(destructive) restore path itself — drill mode skips the n8n stop/start.

---

## 5. Secrets

All live in `/opt/ryvo-automation-platform/.env` on the server (mode `600`,
gitignored, never committed). The operator holds them; `.env.example` documents
every key with no values.

Present: `DOMAIN`, `N8N_ENCRYPTION_KEY`, `N8N_JWT_SECRET`, `N8N_DB_NAME`,
`N8N_DB_USER`, `N8N_DB_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`.

**`ANTHROPIC_API_KEY` is present but empty** — needed before any Phase 1 AI
work.

This Supabase project uses the **new key format** (`sb_publishable_…` /
`sb_secret_…`), not legacy anon/service_role JWTs.

Two hard-won rules for `.env`:

1. **Keep each value on exactly one line, `KEY=value`.** A stray bare line
   (a paste that lost its variable name) makes `source .env` try to *execute*
   it, which echoes the whole line — password included — to the terminal. This
   happened on 2026-07-27 with the connection string; that DB password was
   rotated afterwards.
2. `backup.sh` does `set -euo pipefail; source .env`, so a malformed `.env`
   breaks every nightly backup, not just the command in front of you.

Percent-encode any of `@ : / ? # & %` in a password inside `SUPABASE_DB_URL`,
or avoid those characters entirely.

`N8N_ENCRYPTION_KEY` decrypts every credential stored in n8n. **If it is lost,
all saved n8n credentials are unrecoverable.** It must exist in a password
manager, not only on the server.

---

## 6. Verification checklist — all passing as of 2026-07-27

| Item | Status |
|---|---|
| Local scaffold committed and reviewed before provisioning | ✅ commits `0808523`, `7057240` |
| `https://n8n.ryvodigital.com` loads, valid cert, prompts login | ✅ HTTP 200, LE cert to 2026-10-02 |
| n8n uses Postgres, not SQLite | ✅ `DB_TYPE=postgresdb` |
| Supabase in Frankfurt, `0001` applied, 9 tables, RLS on all | ✅ 9/9 RLS, 0 policies |
| `automations` has the 5 catalogue rows | ✅ 5/5 |
| `.env` populated and gitignored, `.env.example` committed | ✅ mode 600, untracked |
| `docker compose ps` — caddy, n8n, postgres all running | ✅ all up, postgres healthy |
| `backup.sh` runs, produces dump, cron scheduled | ✅ exit 0, 03:00 Europe/Lisbon |
| Repo pushed to GitHub with the Section 3 structure | ✅ in sync |

Security baseline also re-checked: ufw 22/80/443 only, root SSH and password
auth disabled, unattended upgrades active, no Postgres port published.

---

## 7. Open items / next steps

**Before Phase 1 work begins:**

1. Fill `ANTHROPIC_API_KEY` in the server `.env`.
2. ~~Do a restore drill~~ — **done 2026-08-07, PASS** (see §4).
3. Confirm the Supabase free-tier backup retention and decide whether the
   platform DB needs its own dump alongside the engine DB. `backup.sh`
   currently backs up **only the engine Postgres** — Supabase is not dumped by
   anything we control.

### ⚠️ Outstanding before the first client

These are acceptable to carry while the platform has no real data or users.
They are **not** acceptable once a paying client's leads are in the system.

1. **Boot n8n against a restored database.** The 2026-08-07 drill proved the
   data and schema round-trip faithfully (§4), but not that n8n actually
   *starts* against the result. Needs a maintenance window and a throwaway n8n
   container pointed at a scratch DB — never the live container. Until this is
   done, the recovery path is verified only up to the database layer.
2. **The live (destructive) restore path is still unexercised.** Drill mode
   deliberately skips the `stop n8n` / `start n8n` steps and the `EXIT` trap,
   so those specific lines have never run against a real failure.
3. **Put `N8N_ENCRYPTION_KEY` in a password manager.** Restoring the database
   onto a new host without that exact key leaves every stored n8n credential
   permanently unreadable. **This escalated on 2026-09-01** — an earlier version
   of this list said "there are currently 0 credentials, which makes this cheap
   to get right now". That is no longer true: the Supabase `service_role` key is
   now stored as an n8n credential (deliberately, so `export:workflow` cannot
   push it to git). Losing the encryption key now loses real credential
   material, not a hypothetical.
4. **Back up the platform DB.** `backup.sh` covers only the engine Postgres;
   Supabase — which holds the actual leads — is dumped by nothing we control.
   The engine DB holds workflows we could rebuild from git. Supabase will hold
   data we could not.
5. **Decide on the Supabase plan** — see the auto-pause note in §3. Less urgent
   since the keepalive (§0) makes the idle pause structurally impossible, but
   Pro's backup retention still matters once there is data worth retaining.
6. **Push alerting on backup *and* keepalive failure.** Both are pull-only
   today — `/var/log/ryvo-backup.log` and n8n → Executions — and nobody reads
   either until something already looks wrong. The channel must not be the
   Twilio sandbox alone, whose session dies every 3 days.

**Done since this list was written:** 2FA on the n8n owner account (2026-09-01,
recovery codes in the password manager) — the condition attached to the env-access
decision in `concierge-runbook.md` §6. Server fully patched and rebooted
2026-09-01 (see §0).

### Checkpoint D — ordering decided 2026-09-03

**Decided 2026-09-04, in order:**

1. **Second alerting channel (email).** Three silent-failure modes have now
   surfaced only because somebody happened to look: a paused Supabase, the
   keepalive alert that never fired, and a webhook serving 404s with
   `activeVersionId` NULL. Two checks go in with it: assert
   `activeVersionId IS NOT NULL`, and assert an unsigned POST to the webhook
   returns 403.
2. **Per-language handoff notes.** `config.handoff_note` becomes a small map
   keyed by language rather than one English string, so a Portuguese lead
   asking to reschedule is not answered in English. **It stays a fixed config
   string — the model must never render it.** It is the one message that has to
   still work when the model itself has failed, which is precisely when it is
   sent.
3. `metrics_daily` rollups, derived from the `events` log rather than
   incremented in two places.
4. Non-text media handling, forced-failure drills.

**The email / second alerting channel is the FIRST item in D**, ahead of
`metrics_daily`, non-text media handling and the forced-failure drills.

Reason: the keepalive and escalation alarms both ride the Twilio sandbox, whose
session expires every 72 hours. After the 2026-09-03 fix the push alarm works —
but it has exactly one leg, on a 72-hour timer. One working leg is not
redundancy. See `concierge-runbook.md` §9.

**Deferred by design (Section 11 of the handoff):** automation logic, the
cockpit UI, Zero, WhatsApp/Instagram/calendar integrations, any client-facing
login.

**Worth doing when it starts to hurt:** a migration-tracking table (or a real
migration tool), and alerting on backup failure — right now a failed nightly
run is only visible in `/var/log/ryvo-backup.log`, which nobody reads unless
something already looks wrong.
