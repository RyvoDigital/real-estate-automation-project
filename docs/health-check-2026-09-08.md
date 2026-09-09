# Health check — 2026-09-08

# YELLOW

**Nothing is broken. The direction is drifting.**

The engineering is genuinely strong: one automation works end to end, its failure
modes are drilled, and the guards are real rather than decorative. If this were
graded on build quality it would be green.

It is yellow because of what has *not* moved. On 2026-09-05 `phase-1-completion.md`
listed four things blocking a real client. Three days and a great deal of work
later, **all four are still open, and none of the work went at them.** The Twilio
sandbox still expires every 72 hours, so the system cannot carry a real lead
today even if an agency signed tomorrow. The matcher — "the product", by your own
spec — cannot be validated without a calibration session whose brief was written
and never sent.

It is not red, because none of that is a defect. It is a sequencing problem, and
sequencing problems are cheap to fix and expensive to ignore. The thing most
likely to kill this project is not a bug.

---

## Q1 — Where is single-tenancy an assumption rather than a design choice?

**The headline: there is no agent entity anywhere in the system.** No `agents`
table, no `agent_id` column, not one occurrence of the word in any migration.
"The agent" is a name string, a phone number and a calendar id in a jsonb blob.

That is the finding. Everything below is a consequence of it.

| Thing | What it is | Kind | Cost to make it eight agents |
|---|---|---|---|
| `escalate_to` | one WhatsApp number in `config`; `NotifyOperator` sends there | **config value hiding a structural gap** | An array is trivial. *Choosing which agent* is not — it needs lead ownership, which does not exist. |
| `calendar_id` | one Google calendar; free/busy read from it, event created on it | **structural** | Eight calendars means the slot engine must know whose availability it is offering, and the event id must stop being calendar-global. See Q5.1 — this is the risky one. |
| `working_hours` | one schedule in `config` | **config value** | Genuinely additive. `computeSlots` already takes hours as a parameter; it just needs to be called per agent. |
| **lead ownership** | **does not exist** | **structural — the keystone** | This is the first thing to build. Escalation routing, per-agent queues, per-agent metrics and the report all block on it. |
| escalation queue | `getQueue()` — escalated leads, **no client filter**, `limit(100)` | **structural, plus a latent bug** | Needs an assignee filter. Separately, past 100 escalated leads it silently truncates and `getOpenCount()` undercounts — a wrong number with no warning. |
| onboarding form | 17 fields, exactly one `agentName` / `escalateTo` / `calendarId` / `workingHours` | **structural but contained** | A repeating sub-form over a new table. The cheapest item here. |
| `metrics_daily` | already per-client; `metrics_daily.py` loops clients, upserts on `(client_id, date)` | **additive** | The cleanest thing in the system. A per-agent grain is a column and a group-by. |
| RLS | enabled on all ten tables, **zero policies** | **structural** | Isolation is entirely application-layer via the service role. Fine while Ryvo is the only caller. Not a control. |

### The answer to the question you actually asked

**Eight agents in one agency is additive at the config layer and a rewrite at the
booking layer.**

Config, ownership and the cockpit are days of work. The dangerous part is one
specific thing: the calendar event id is derived from the **slot alone**
(`rv<calendarKey><slotUtc>`), deliberately, so that two leads confirming the same
time collide on Google's side and the 409 *is* the double-booking lock. That is
the single most safety-critical mechanism in the product. With eight agents, two
leads booking the same hour with *different* agents must no longer collide — so
the id has to change, and with it the guarantee. That is not a config change; it
is a re-proof of the concurrency design.

Do it before real bookings exist. Changing the id scheme afterwards means live
events can no longer be matched to their slots.

---

## Q2 — Unbuilt versus designed wrong

### Missing because unbuilt (schedule)

- **Automations 02, 04, 05** — `db_reactivation`, `listing_launch`,
  `reputation_loop`. Rows exist in `automations`; nothing exists behind them.
  Four of the five products in the pitch are names in a table.
- **Automation 03 gates F4–F6** — agent notification, direct outreach, nurture.
- **A production WhatsApp sender.** The 72-hour sandbox expiry is the single
  hardest blocker and it is not an engineering task.
- **Google OAuth is "Internal"** — only `ryvodigital.com` accounts can authorise.
  A client's calendar cannot be connected at all today.
- **n8n has never booted against a restored database.** Outstanding since Phase 0.
  The restore drill proved the dump restores; nothing proved the system runs on
  the result.
- **Error branches on the other five workflows.** The Concierge gate closed
  today; `ryvoCockpitSend01`, `Draft01`, `Map01`, `Validate01` and the keepalive
  have the same hole.
- **The weekly report has no send path** — deliberate (§5.7), and correctly so.
  Listed here only so it is not mistaken for the next category.

### Missing because designed wrong (error)

- **Every failure routes to Ryvo, not to the agency.** `escalate_to` is one
  number, and `EmailInternalFailure`, `EmailDbOutage` and the media alerts are
  hardcoded to `manuel.seixasvale@gmail.com` and `hello@ryvodigital.com`. At one
  client this is correct. At ten it makes the operator the single point of
  failure for every agency's leads, and the load scales linearly with revenue.
  **Your own Automation 03 spec already states the right answer** — *"notify the
  agent, not the lead"* — the Concierge simply does not do it.
- **No lead ownership.** Wrong by omission rather than by decision, which is the
  harder kind to notice.
- **`viewing.booked` now carries meetings.** I kept the event type stable so
  metrics would not break. The consequence is that the weekly report's
  *"Viewings booked: N"* counts first meetings too, and that number goes to the
  agency owner. Small, and it is a mislabel, not a gap.
- **The cockpit is cross-tenant with an env-var email allowlist.** The right call
  while clients have no login — and it is recorded as such in the runbook. It is
  wrong the moment one does.
- **`getQueue` / `getOpenCount` cap at 100 rows.** A silent wrong number is worse
  than an error, and this is §5b in the lessons file happening to us.
- **RLS enabled with no policies.** The isolation story is a convention, not a
  control. Nothing enforces tenancy if a second caller ever appears.

---

## Q3 — Would the cockpit survive multi-tenancy?

Ten agencies, forty agents. Structurally:

**Needs rebuilding**

- **The escalation queue.** Cross-tenant by construction, `limit(100)`, no
  concept of an assignee. Every property that makes it good today — one list,
  everything visible, oldest-first — is exactly what forty agents must not have.
- **Auth and isolation.** An env-var list of allowed emails cannot express
  "this agent sees this agency's leads". Needs real accounts, roles, and RLS
  policies that actually exist.

**Extends**

- **The leads list.** Already paginated (25/page) with a client filter and
  `(client_id, stage)` indexes. The default view is currently every lead in the
  system; that becomes a scoped default rather than a rewrite.
- **The weekly report.** Already takes a `clientId`. Cleanest screen in the app.
- **The health screen.** Reads the single latest `health_runs` row. That is
  correct — it reports *our* infrastructure, not a tenant's — but it will mislead
  the moment a client sees it, because it looks like a status page for them.

**Query performance** — the indexes are right (`(client_id, …)` throughout). The
risk is a pattern, not an index: several queries **pull rows and filter in
JavaScript**. `getViewing()` fetches 200 `viewing.booked` events across all
clients and `.find()`s the lead in memory, on every lead-detail page view.
`getOpenCount()` fetches up to 100 rows in order to count them. These are fine at
ten clients and fail quietly at a hundred — they do not get slow, they get
*wrong*, because the cap silently truncates.

**Summary: the data layer extends, the access layer needs rebuilding.**

---

## Q4 — Blunt

### Over-engineered for this stage

- **The lessons file is 22 sections and growing faster than the product.** It is
  the best artefact here and it has become a second product. Today alone it
  gained three entries.
- **Four visual probes** — layout, timing, contrast, dod — for a UI with one
  user. The luminance-ladder contrast measurement was genuinely good work on a
  screen nobody but you will open this year.
- **Three sessions of UI redesign** on an internal tool. The bottom bar is lovely.
  It has one user.
- **The Code-node failure gate.** You were right that it was the most important
  finding, and it was built well. It is also a gate *before the first client* on
  a system that has no way to accept one until the WhatsApp sender changes. It
  would have been equally correct in three weeks.

### Under-built

- **Nothing customer-facing has moved in three days.** The Twilio sender and the
  OAuth app were on the blocking list on 5 September and are unchanged today.
  Both are procurement and configuration, not engineering, which is precisely why
  they keep losing to interesting problems.
- **The matcher is unvalidated.** Your spec says *"this is the product"*. It has
  never been checked against a real agency's judgement, and cannot be until a
  session happens. `calibration-session-brief.md` was written to be put in front
  of someone. It has not been.
- **Multi-tenancy is entirely untested.** A second client row has never existed.
  Every claim in Q1 and Q3 above is inference from code, not observation.

### What we spent time on that will not matter

The visual redesign. Most of the probe suite. The Bodoni type study.

### What we skipped that will

One real agency's traffic through the system. Everything else is a proxy for it.

### What you have consistently got wrong

You asked, so:

1. **You optimise the thing in front of you and never the sequence.** Every
   individual call this session was right — I have not disagreed with one of your
   judgement calls on merit. The aggregate is a system with excellent failure
   handling and no users. Not once have you said *"that can wait until we have a
   client"*, and several things could have.
2. **You reward depth, so you get depth.** Every finding gets generalised,
   recorded and given a lessons entry. That has produced something genuinely
   valuable and it has also trained me to spend more effort on documentation than
   on shipping. Watch what you incentivise — I will keep giving you more of it.
3. **Everything is P0.** The `visita` defect deserved the treatment it got: it
   reaches a prospect and damages a client's reputation. A 10px badge got the
   same treatment the same afternoon. There is no triage layer, so urgency
   carries no information.
4. **You have never asked what anything costs.** Not once, in time or money, in
   this entire session. That is unusual, and at some point it stops being a
   luxury.

---

## Q5 — Architecture that will hurt later

Right at the time, expensive at ten clients. Named now, while they are cheap.

1. **The slot-derived event id.** `rv<calendarKey><slotUtc>` makes Google's 409
   the double-booking lock — the correct choice, and the boring mechanism the
   platform already arbitrates. Two costs come due later: it assumes one calendar
   per client (Q1), and **deleting an event permanently retires that slot from
   automated booking**, because Google keeps deleted ids reserved. That happened
   three times in one afternoon of testing today. At ten agencies whose staff tidy
   their own calendars, burned slots accumulate silently and forever. **Fix the id
   scheme before real bookings exist.**

2. **`client_automations.config` is untyped jsonb and it is the single source of
   truth for the workflow.** The `working_hours` defect found today is exactly
   what that produces: a form writing a shape the engine cannot read, with
   nothing in between, and the failure was total silence to the lead. There are
   **18 keys** in that object. One of them now has a contract test. The other
   seventeen are the same bug waiting for a different day.

3. **The Concierge is a single 98-node workflow and it only grows.** Listing
   ingestion is already inside it. n8n has no module system, so at five
   automations this becomes unmaintainable, and splitting it later means
   re-proving every guard — the slot engine, the booking lock, the reply guards,
   the failure spine. Splitting is cheapest now and never gets cheaper.

4. **Zero RLS policies.** Every table has RLS enabled and nothing to enforce. The
   isolation story is "only the service role calls us", which holds exactly until
   it does not, and there is no second layer underneath.

5. **`messages.lead_id` is `ON DELETE SET NULL`, and `events` links to leads only
   through an untyped jsonb field.** Deleting a lead therefore orphans its
   messages — nulled, unfindable — and leaves events pointing at a dead uuid
   inside `data`. That was the right call for preserving the audit trail. It is
   also a **GDPR erasure problem**: a right-to-be-forgotten request cannot be
   satisfied by deleting the lead, because the messages survive with the content
   and nothing points back. This is the one on the list with a legal deadline
   attached rather than an engineering one.

6. **The event log as the metrics substrate, with an unschematised `data`
   column.** Deriving rather than incrementing is right and should stay. But
   `events.data` now carries `lead_id`, `kind`, `property_refs`, `event_id`,
   `matched_by` — each added by a different consumer, none declared anywhere. It
   is a schema by accretion, and it is already being queried with `data->>lead_id`.

---

## What I would do next, in order

1. Send the calibration brief. It costs an email and it is the only thing that
   can tell you whether the matcher is worth building.
2. Get a production WhatsApp sender. Nothing real happens until this does.
3. Take the OAuth app external, or document the client-authorises-their-own-project
   path properly.
4. Add lead ownership and per-agent calendars — *before* any real booking exists,
   because the event id cannot be changed afterwards.
5. Then, and only then, the next automation.

Everything in Q4's "over-engineered" list is good work. None of it is the
constraint.
