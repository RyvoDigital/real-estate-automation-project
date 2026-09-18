# Where we left off

**Last updated:** 2026-09-18 (late).
**Where the work is:** Automations 03 and 04. Phase 1 (Concierge) and
Automation 02's send path are done and are not what anyone is touching.
**Next: nothing, until the operator has sat with an agency** — §0 is Automation
04, §0a is Automation 03, and both end in the same room.

> ⚠️ The header used to say "Last updated 2026-09-03, next is Checkpoint C".
> That was two automations ago. Sections below are newest-first and the older
> ones are history, not instructions.

This file is the running state-of-play for whoever (human or agent) picks the
project up next. The durable *design* lives in the handoff and design documents
under `docs/`; this file records what is actually deployed right now and what
tripped us up. **Sections are newest first.**

---

# 0. HANDOVER — Automation 04, 18 September 2026

**Read §0a too. 03 and 04 are the same conversation away from being useful.**

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
| Standing re-check + notice | ✅ soonest expiry across requirements; the notice claims nothing it cannot do |
| Prepared piece + invariant | ✅ invariant read on the artefact; mentions are a registry that **throws** on an id it cannot say |
| Spain's rows (step 5) | ⏸️ **deliberately held.** The etiqueta question could change what a Spanish piece *is*; a row built before that answer is built to a shape that may not survive it |
| Re-check widened (step 6) | ❌ revoked registrations and newly-effective requirements not yet surfaced |
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
claiming we acted on the advertisement. Do not add one.

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

# 0a. HANDOVER — Automation 03, 18 September 2026

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
