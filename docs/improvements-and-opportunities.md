# Ryvo — improvements, opportunities and future work

**Created 12 Sep 2026.** Consolidates §8b/§8c items, the health-check findings, the Presta article review, and everything surfaced by the 11–12 September rehearsal.

> **What this document is.** Everything that is *not* a live defect. Live defects live in `docs/remaining-defects-session-2.md` and get fixed before the demo. This is the backlog behind that — sorted by whether something is blocked, required, worth doing, or merely worth a look.
>
> **How to use it.** Nothing here is started while a defect list is open or a deadline is close. Sections 2 and 3 are commitments. Section 4 is judgement. Section 5 is explicitly *not* commitments — investigate and decide, and the right answer is often no.

---

# 1. Priority key

| Tier | Meaning |
|---|---|
| 🔴 **Blocking** | A paying client cannot be onboarded until this is done |
| 🟠 **Required soon** | Not blocking today; becomes blocking at 2–5 clients |
| 🟡 **Improvement** | Real value, no deadline, do when a quiet block appears |
| 🔵 **Opportunity** | Evaluate only. Committing without evaluating is the failure mode |

---

# 2. 🔴 Blocked on something external

Cannot be worked on by deciding to work harder. Each names what it waits for.

### 2.1 Company and signing authority
**Waits on:** José Vale confirming Ryvo can operate under the company, the legal name and NIPC, and who signs.
**Blocks:** every contract, legal invoicing, Meta business verification, any signature with any prospect.
**Note:** this is the only gate in the project that no amount of building removes.

### 2.2 Meta business verification
**Waits on:** the replacement account warming to ~22 Sep, then company documents from 2.1.
**Blocks:** any real client going live on their own WhatsApp number. Does *not* block demos on the Twilio sandbox.
**Open:** a fallback plan if the account is rejected again. One warmed personal account is not a business.

### 2.3 Supabase plan decision
**Waits on:** a client signing. No reason to pay while there is no client data.
**Blocks:** going live. Free tier auto-pauses after ~7 days idle, and `backup.sh` reports green regardless — a paused platform DB during business hours is an outage nobody is told about.
**Do:** the day a client signs, not before.

### 2.4 Permanent WhatsApp number
**Waits on:** 2.2, and the ownership decision (client owns / Ryvo administers).
**Blocks:** go-live. The Twilio sandbox expires every 72 hours and only reaches numbers that opted in by keyword.

---

# 3. 🟠 Required before the first paying client

Not blocked. Not optional either. These are acceptable to carry with zero clients and unacceptable with one.

### 3.1 The agent entity
There is **no agent anywhere in the system** — no table, no column. This is the root cause of three separate problems: escalations cannot route to the right person, the calendar cannot tell whose availability it is reading, and transactions cannot belong to anyone.

**Why it is not urgent today:** with one agency of one or two people, one desk is honest to sell.
**Why it becomes urgent:** the moment a three-person agency signs, or multi-agent pricing is quoted.
**Warning:** design it once, properly, with a migration. Never under deadline pressure.

### 3.2 Calendar identity
The double-booking guard derives the event id from the time slot. A generation counter was added on 12 Sep so deletions no longer burn slots permanently, but the underlying scheme still assumes one calendar and one agent.
**Depends on:** 3.1.
**⚠️ The window closes the moment real bookings exist in a client's calendar.** Changing an id scheme retroactively is far harder than changing it now.

### 3.3 GDPR erasure
Deleting a lead orphans its messages (`on delete set null`) rather than removing them. Correct for an audit trail, wrong for a right-to-be-forgotten request.
**This has a legal deadline rather than an engineering one.** Needs a designed and documented erasure runbook, later a cockpit button.

### 3.4 Consent audit ⚠️ highest unaudited risk
`consent_status` and `consent_at` exist on `leads` and **have never been tested.** Outbound automations are legally required to respect them and nothing has verified that they do.
This is a legal exposure, not a quality one, and it sits directly in Automation 02's path — the automation most likely to be sold first.

### 3.5 Integration and regression test suite
Full reasoning in `docs/testing-strategy.md`. Summary: component tests exist and are good; nothing tests the seams between components, which is where every defect has been. Three consecutive deploys reported clean and were wrong.
**Roughly 18 of the 23 manual scenarios are automatable.** Automate state, keep human eyes on voice.
**Two to three days.** The difference between supporting one client and supporting five.

### 3.6 Escalation routing to the agent
Escalations currently notify the operator. At ten clients that makes one person the single point of failure for every agency's leads.
**Partly fixable now** (read `escalate_to` from config); **properly fixable** only after 3.1.

### 3.7 Alerting on silent failure — four independent layers

The recurring theme across the entire project record. `backup.sh` has run green for weeks while saying nothing about whether Supabase was reachable. n8n reported `Success` in 992ms having sent nothing. The prompt suites were broken for days while appearing to exist.

**Governing principle: a system cannot report its own death.** Anything that alerts from inside n8n is useless when n8n is what failed. The layers below must fail independently of each other.

**The bar is not "no unknown defects" — it is: when one surfaces, does a human find out before the client does, and is the damage reversible?** A booking that silently vanishes is catastrophic. A booking that vanishes and pings the agent within seconds is an inconvenience. Same defect; the difference is entirely alerting.

#### Layer 1 — the workflow reports what went wrong
**Partly exists.** Escalations already notify by WhatsApp. The internal-failure path already emails with hardcoded addresses, deliberately, because it fires when Supabase may be down — that was the right call.

**Missing:** any run writing `status='error'` to `automation_runs` should notify. A Claude timeout, a failed WhatsApp send or a calendar error is currently logged and nobody hears.

**Build:** an **n8n error workflow** that every other workflow points to on failure. Fires on any thrown node, sends workflow name, node and error. One build, covers every automation ever added.

#### Layer 2 — the workflow reports what it *failed to do* 🔴 where the real risk lives
An exception handler cannot catch a run that completes successfully having done nothing. The 992ms `Success` that sent no reply is the canonical case.

**Build:** an invariant check at the end of every run. *If this was an inbound message, and no outbound message was sent, and no escalation fired, and no deliberate-silence flag was set — that is an anomaly. Alert.*

Assert the invariant rather than catch the exception. Same principle as verify-before-asserting: check reality instead of trusting the code path.

#### Layer 3 — something outside reports total failure 🔴 does not exist at all
Catches the worst case, and is free. Better Stack, UptimeRobot or Healthchecks.io all have adequate free tiers.

- **Heartbeat.** A tiny n8n workflow pings a monitoring URL every 5 minutes. If the ping stops — server down, n8n crashed, container dead — the monitor alerts from outside. **This is the only layer that catches total failure.**
- **Deep health check.** An endpoint that actually queries Supabase and returns non-200 when the platform DB is unreachable. This is the answer to the free-tier auto-pause, which currently gives no signal while the backup log stays green.

Route both to the phone via the monitoring service's app or WhatsApp integration.

#### Layer 4 — the things that expire
Twilio sandbox (72h), WhatsApp tokens (24h in dev), TLS certificates, Anthropic credit. All predictable, all fail silently.

**Calendar reminders are sufficient.** Not everything needs engineering.

#### Severity tiers — alert fatigue is the failure mode
Alert on everything and it gets muted within a week.

| Tier | What | Channel |
|---|---|---|
| **Wake me** | System down, DB unreachable, no replies being sent at all | Phone, loud. Rare, always real |
| **Tell me now** | Escalation, run error, failed booking | WhatsApp, within a minute |
| **Show me later** | Rejected budget, slow response, retried call | Cockpit and a daily digest — never a notification |

#### Build order
1. **Layer 3.** Free, an afternoon, no changes to working code, catches what hurts most.
2. **The n8n error workflow.** One build, covers everything forever.
3. **The invariant check.** Needs design, and it is the one that catches this project's specific historical failure.

### 3.10 Persist-then-send 🔴 root of the assert-before-verify class
The workflow order is parse → guard → booking chain → **send** → persist. The reply leaves before the row is touched, and the model never learns what persistence did. This is by design since Checkpoint B3, for speed.

**It is the root cause of the entire defect class found on 11–12 September:** the phantom booking, the stale escalation, the "lead has not been told" display claim, and the budget confirmation that told a lead €1.1M was recorded when the parser had rejected it and the row never changed.

Reordering the tail so nothing is confirmed to a lead before it is written is a substantial change and correctly out of scope before the demo. **It is not optional before a paying client**, because the failure mode is telling a client's buyer something untrue about their own transaction.

**Interim mitigation:** log a warning event whenever a write is rejected, so the gap is at least visible in the cockpit.

### 3.8 Zero-downtime deploys
The inbound webhook was unpublished for ~2 minutes during the 11 Sep deploy. Harmless with no clients; a lost lead with one.

### 3.9 Prompt source drift guard
The source prompt file had fallen behind the shipping n8n node since 8 Sep, so the prompt suites were testing something the live system was not running. Re-synced 11 Sep. Needs a guard so it cannot recur silently.

---

# 4. 🟡 Improvements

Real value, no deadline. Do when a quiet block appears — never while a defect list is open.

### 4.1 Prompt caching — ~10 minutes
Not enabled. The system prompt is sent in full on every inbound message, on a system that makes one call per message. Caching it cuts input cost substantially.
Console → Prompt caching → Set up.
**Honest scale:** current spend is $6.99/month against a $500 limit, so this saves a few dollars today. It becomes real money at ten clients.
**Why not now:** it changes the structure of the call that produces every reply, and every tested scenario runs through it. Wrong week.

### 4.2 Image handling
The Concierge currently acknowledges images and asks for text. The API accepts images as base64 blocks, so this is buildable and a genuine differentiator — buyers send screenshots of listings, street photos, floor plans.
**Hard boundary:** the no-inventing-facts rule must extend to images. It may describe what it sees and ask a question. It must never identify a photo as a specific listing in the agency's book or confirm a price from an image. Store the media URL, never the image.
Full implementation outline in `docs/rehearsal-defects-2026-09-11.md`, Tier 3.

### 4.3 Migration tracking
Migrations are applied by hand, in order, with no tracking table. Fine at 10 migrations; painful at 30.

### 4.4 Restore drill follow-through
The 2026-08-07 drill proved data and schema round-trip faithfully. It did **not** prove n8n boots against a restored database, and the live destructive restore path has never run.
Until both are done, the recovery path is verified only to the database layer.

### 4.5 `N8N_ENCRYPTION_KEY` into a password manager
Restoring onto a new host without that exact key leaves every stored n8n credential permanently unreadable. There are currently few credentials, which makes this cheap now and expensive later.

### 4.6 The 10-minute scheduled branch
A schedule inside the Concierge workflow fires every 10 minutes (~100ms, 144/day). It is most of the 1,301 execution count and makes that number meaningless as a usage signal. Establish what it does and whether it belongs in a separate workflow.

### 4.7 Cockpit: derive rather than infer
The retired-booking display says the lead was told, inferred from the code path rather than read from a sent message. Should derive from a `messages` row with `origin=handoff`.
Small, but it is the same defect class as everything else: asserting rather than checking.

---

# 5. 🔵 Opportunities — evaluate, do not commit

**The failure mode for this entire section is starting one of these instead of selling.** Each needs a decision, and "no" is a good outcome.

### 5.1 Anthropic "Build an agent" / Managed Agents
The console offers hosted agents, sessions and deployments — a different way of building what already exists in n8n.
**Worth a look only if it removes work currently done by hand.** If it is just a different place to run the same thing, skip it.
**Rebuilding a working Concierge on a new platform is the largest possible distraction dressed as progress.** Decide in a week with no deadline.

### 5.2 Client performance report — *Tier 1 of the §8c product ideas*
The weekly report already promised in the delivery model and never built. The data is in Supabase; ~2 days.
Protects 100% of MRR and answers the month-three question ("what am I paying for now my old contacts are done"). Generates no new revenue on its own.
**Prerequisite:** a live client generating real data.

### 5.3 Own-pipeline machine — *Tier 2*
Point the platform at Ryvo's own client acquisition.
🔴 **Hard condition: not built until 20 agencies have been contacted by hand.** Building outreach automation to avoid doing outreach is the documented failure pattern. 18 were sent on 10 Sep; the manual phase is nearly complete.
**Email, not WhatsApp.** Cold WhatsApp to businesses risks the number needed for demos and clients.

**Design pattern to copy (from the Grok Bot review, `docs/grok-research-report.md`).** xAI's own flagship example of an autonomous agent is a sales outbound Bot that researches accounts overnight, scores contacts for intent, drafts emails and LinkedIn messages in each seller's voice, and **leaves a queue of personalised drafts for approval.** Two things to take from it:

1. **The agent prepares, a human releases.** Never "the agent sends." This maps directly onto the cockpit's existing escalation-queue pattern — the same interface, a different queue.
2. **The value is in the overnight research, not the sending.** The 10 Sep round took an afternoon, and most of it was finding and qualifying agencies, not writing. That is the part worth automating; the writing is already good.

**This costs nothing extra.** It is n8n plus the Claude API — both already paid for. Grok Bot itself is rejected, see 5.6.

### 5.4 Transaction Coordination — *Tier 3, would become Automation 06*
Tracking the Portuguese conveyancing document chase — CPCV, escritura, caderneta predial, licença de utilização, energy certificate — against deadlines, chasing whoever owes what.
The only genuinely new idea from the Presta review: painful, recurring, defensible through jurisdiction-specific process knowledge, and close to the client's revenue.
🔴 **Hard boundary: it never drafts, interprets or advises on a legal document.** Track, remind, chase, flag, summarise. Everything else escalates.
**Prerequisites:** a client whose process can be mapped, and 3.1.

### 5.5 Quality grading by a second model
State assertions are cheap and reliable. "Is this reply warm and not repetitive" is not — defect 2.3 was caught by a person reading a transcript. A second model grading output quality is plausible.
Not before 3.5 exists.

### 5.6 Grok Bot / xAI — **evaluated 12 Sep 2026, decided NO**
Full research in `docs/grok-research-report.md`.

**Rejected for client-facing use, on three grounds, any one of which is sufficient:**
- **GDPR.** Bots hold real credentials on a VM shared across every Bot in the account — the product's own documentation calls that shared computer "a real blast radius." Cursor brings SOC 2 Type II and GDPR compliance and has engaged auditors for ISO 27001 and ISO 42001 but holds neither. Ryvo's position is EU-only data at rest and processor status for each agency. There is no EU inference answer to give a client.
- **$300/month.** SuperGrok Heavy is the only consumer tier with Grok Bot access. Half a Core retainer, before a client exists.
- **It solves a problem Ryvo does not have.** Its advantage is driving software with no API. Everything in this stack has one.

**Two design patterns taken from it, at no cost:** the queue-for-approval shape (folded into 5.3) and the persistent-agent interface as a reference for Zero (noted in 5.7).

**Watch only:** Grok 4.1 Fast at $0.20/$0.50 per million tokens is roughly a tenth of Sonnet-class pricing. Irrelevant at current volume; a real lever at ten clients **if** an EU inference route ever appears. Revisit Q1 2027 or when a client asks.

### 5.7 Zero's interface shape — reference material, not a build
When Phase 3's ops agent is designed, Grok Bot is a usable reference for how it should *feel*: messenger-style rather than a dashboard, delegate-and-walk-away, the agent returns for approval rather than asking for direction at each step, and several agents coordinating with one acting as chief of staff.

**Reference only.** No subscription, no dependency, nothing to buy. Read it, copy the interaction model, build it on the existing stack.

---

# 6. Rejected — do not revisit without new information

Recorded so they are not re-proposed.

| Idea | Why rejected |
|---|---|
| Cold WhatsApp outreach scraping seller contacts from Idealista | GDPR and ToS fragile; no sound lawful basis |
| Social media management as a product | Commodity, a thousand competitors at €300/mo, touches nothing in the lead database, no moat |
| Financial / invoicing automation | Portuguese invoicing requires AT certification. **Never build what must be certified** — buy InvoiceXpress |
| Email marketing, content repurposing, HR, e-commerce, legal automation | Wrong segment or wrong business |
| Generalist workflow-automation consulting | The generalist trap; contradicts the vertical positioning that is working |
| 50% recurring referral discount | Two referrals take the client below the price floor and turn them into a reseller |
| Listing-match sold to an agency with no structured contact data | Dishonest — the data cannot support it |
| Grok Bot as a platform to build on | GDPR (shared-VM credential access, no EU inference route, no ISO 27001), $300/mo before revenue, and it solves an API-less problem this stack does not have. Design patterns taken; product rejected. See 5.6 |

---

# 7. Carried risks — known, accepted, not forgotten

- **Examples in a prompt outweigh the instruction around them.** The two language-suite failures on 12 Sep — English booking requests answered in Portuguese — traced to a single Portuguese example inside the meeting rule. The rule said nothing about language; the example taught it anyway. Check examples before rules whenever a model does something the instructions do not ask for.
- **32 Code nodes with no error branches.** Root cause of the silent-failure pattern. Full coverage is a project; add branches where a failure would produce a *wrong* outcome rather than *no* outcome.
- **Supabase is not backed up by anything we control.** `backup.sh` covers only the engine Postgres.
- **Variable costs (WhatsApp per-conversation, Anthropic usage) are assumed absorbed into the retainer**, with a fair-use ceiling that has not been defined.
- **WhatsApp account ownership is undecided.** Recommendation to evaluate: client owns, Ryvo administers.
- **Retention policy and breach notification are both open.** ⚖️
- **AI Act transparency obligations in PT/ES have not been confirmed.** ⚖️ The assistant does disclose when asked and never claims to be human.
