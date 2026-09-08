# Automation 03 — Lead Nurture & Listing-Match Engine

**Project:** Ryvo real estate AI automation platform
**Audience:** Claude Code (executor)
**Written:** 7 September 2026
**Prereq:** Phase 1 complete (Concierge), Checkpoint E complete (cockpit). Both live.

---

## 0. Read this first

**Read `docs/phase-1-completion.md` before anything, particularly its known-limits section — several obvious improvements were considered and rejected with reasons recorded. Then `docs/engineering-lessons.md`.**

### What this is, in one line

When a new listing arrives, the system works out which past and current leads genuinely want it, tells the agent who they are and why, and — where the lead has consented — reaches them.

### Why this one matters more than the others

Automation 04 was re-scoped after an honest look: generating listing copy is a wrapper around something an agent can increasingly get free from a chat window. **Automation 03 is not replicable that way, because it requires the lead database.**

But that alone is not enough, because Inmovilla — owned by idealista, 4,700+ agencies, now in Portugal — already ships portfolio-to-demand matching. **What we have that they do not is the conversation.**

A CRM matches on what someone typed into a form: fields, filled once, at enquiry. If a buyer never filled in "bedrooms", the CRM can never match on bedrooms. The Concierge talks to every lead in their own words:

> *"We'd want somewhere the kids can walk to school."*
> *"My wife works in Lisbon three days a week."*
> *"We're not in a rush but we'd move for the right thing."*

None of that is a field. All of it is decisive. **The industry calls this conversation depth** — the difference between capturing a form field and capturing the *why* — and it is the axis the whole category is now judged on.

**So the single design rule for this automation: match on stated criteria AND on what the lead actually said. A match that could have been produced by a CRM's filters is not the product.**

### Scope

**IN:**
- Ingesting an agency's existing contact list, in whatever format it arrives (§2)
- Ingesting listings (§3)
- The matching engine (§4) — the actual product
- Agent-facing match notifications (§5)
- Lead-facing outreach, consent-gated (§6)
- Long-horizon nurture (§7)
- Cockpit surfaces (§8)

**OUT — do not build:**
- The Inmovilla API connector. Designed for, not built. See §2.6.
- Any listing *copy generation*. That is Automation 04 and it is deliberately deferred.
- Cold outreach to anyone who did not contact the agency. See §6.1 — this is a hard legal line, not a scoping preference.
- Automatic threshold tuning. See §4.6.

### Execution rules (unchanged)

1. Build incrementally, stop at the gates in §10, report.
2. Operator holds all secrets.
3. **No writes to the production database without asking.** Standing rule, already in the runbook.
4. Test before declaring done. **Check the artefact, not the execution status.**
5. Verify library and API behaviour against live docs before implementing.

---

## 1. The two things that make or break this

Everything else is plumbing. These two decide whether the automation is worth €650/month.

**Match quality.** Too loose and the agency spams its own database and stops trusting the system. Too tight and it never fires and looks broken. There is no safe default — this is a judgement call that must be tunable per agency (§4.6).

**Explanation quality.** *"New listing you might like"* is a mailshot. *"This is the first four-bedroom in Cascais with a garden under €2M we've had in three months, and you told us the garden was the thing you couldn't compromise on"* is the agent. The second is the product; the first is what everyone else sends.

---

## 2. Ingesting the contact list

### 2.1 There is no standard format, and there never was

Research finding, recorded in the ops doc: **most of the target segment does not use a CRM at all.** Almost every agency starts in Excel, and a large share never leaves. Do not build against an assumed schema.

**But there is a universal container:** CSV is the universal migration format — every CRM exports it, and a spreadsheet already is one.

### 2.2 Accept anything

CSV, XLSX, Google Contacts export, vCard. The agency exports whatever they have. Never ask them to reformat — an agency that has to restructure a spreadsheet before onboarding will not onboard.

### 2.3 Claude proposes the mapping; a human confirms it once

Read the column headers **and sample rows**. Headers alone are insufficient — a column called `Notes` tells you nothing, and its contents tell you everything.

Propose a mapping to our own fields: name, phone, email, budget, area, property type, bedrooms, timeline, last contact, free-text notes, consent evidence.

**Expect the classic mismatches**, which are well documented in the CRM migration literature: one system calls it `Lead Source`, another `Enquiry Channel`; one has a single `Budget Range` where we have `budget_min` and `budget_max`. Handle splits and merges, not just renames.

**The operator reviews and corrects the mapping in the cockpit, then approves it.** It is stored in that client's config and never asked again. This is the industry-standard field-mapping wizard with the tedious part done by the model — and it is a **one-time onboarding step with a human gate**, not a per-run guess.

### 2.4 Features tier by what data exists

This is what makes ingestion robust rather than fragile.

| What the list contains | What 03 can do |
|---|---|
| Name + phone only | Reactivation only — "we haven't spoken in a while" |
| + budget or area | Approximate listing matching |
| + full criteria | Precise matching — the defensible product |

**At onboarding, show which tier the agency lands in and say so plainly.** No silent degradation. An automation that quietly matches on data it does not have is the §6.4 pattern in a new costume.

### 2.5 Ingestion hygiene

- Duplicate detection on phone and email — a spreadsheet maintained by five people over fifteen years will have duplicates
- Phone normalisation to E.164 — use `libphonenumber-js`, already a dependency, for the reason recorded at E3
- Rows that cannot be parsed are **reported, never silently dropped**. "Imported 847 of 900" with the 53 listed beats "imported successfully"
- The import is **previewable before it commits**, and reversible after

### 2.6 Designed for, not built: a live source

Inmovilla exports CSV like everything else, so the mapping approach already covers agencies using it. A live API connector would make the data current rather than a snapshot, and would remove the mapping step entirely for the 4,700+ agencies on it.

**Do not build it.** Building against documentation for a system never seen, for a client who may not exist, is speculative work. **But structure ingestion so a live source can be added without redesign** — the matching engine should not care whether a lead arrived from a CSV, from the Concierge, or from an API.

---

## 3. Ingesting listings

Same principle, smaller problem. A listing arrives with: reference, type, area/location, price, bedrooms, size, key features, status.

**Entry point: WhatsApp first**, matching the delivery model — the agent sends the details to the number they already use, with nothing new to log into. A cockpit form as the fallback and for correction.

Listings need their own table. **Do not overload `leads`.**

Two things to get right:
- **Status matters.** A listing that goes under offer must stop matching. Nothing is worse than telling a buyer about a house that sold last week.
- **Location needs to be more than a string.** "Cascais" and "Estoril" are ten minutes apart and a buyer who said one will often accept the other. See §4.3.

---

## 4. The matching engine — this is the product

### 4.1 Hard constraints and preferences are different things

**A CRM treats every criterion as a filter. That is the flaw to exploit.**

People say *"we couldn't live without a garden"* and *"it'd be nice if it faced south"* and mean entirely different things. The conversation tells you which is which; a form cannot.

So a match is never binary. It is: **fits every hard constraint, misses these two preferences, here is which ones.**

Deriving hard-versus-preference from the conversation is the highest-value thing this engine does. Get it wrong and you have rebuilt a CRM filter.

> **Preferences are confidence, not admission.** A missed preference lowers how strongly a match is put forward; it never decides whether the match exists. Conflating the two rebuilds the filter this section exists to beat — and it did, once: an early version of the scorer refused a listing that met every hard constraint because it missed the single preference the lead had mentioned.

### 4.2 Match on the conversation, not only the fields

The `messages` table holds what every Concierge-captured lead actually said. Use it.

Worked example, and this is the shape to aim for:

> A listing at €2.2M against a lead's stated €2M budget normally fails. But the lead said *"we could stretch for the right place"* — so it matches, **and the notification says exactly that.**

A CRM cannot do this. Neither can a competitor working from form fields.

**Constraint:** leads imported from a CSV have no conversation. They match on fields only, and the system must be honest about the difference rather than pretending to a depth it does not have.

### 4.3 Geography is not string equality

`area = 'Cascais'` will miss a buyer who said Estoril and would happily take Cascais. Handle adjacency — configured per client, since only the agency knows which areas their buyers treat as interchangeable. Do not hardcode a gazetteer of Portugal.

### 4.4 Every match carries its reasoning

The engine outputs, per match: **the lead, a confidence, which hard constraints are met, which preferences are missed, and the specific evidence** — including quoted phrases from the lead's own messages where they were decisive.

This is not a nice-to-have for the UI. **It is the artefact that makes §5's notification possible and the thing that distinguishes this from a filter.** A match without an explanation has failed even if it is correct.

### 4.5 Explain scarcity where it is true

*"The first four-bedroom in Cascais with a garden under €2M we've had in three months"* is far stronger than *"a new listing matching your criteria."* We have the listing history to know whether it is true.

**Only state it when it is verifiable from our own data.** Never invent scarcity — same rule as the Concierge never inventing inventory.

### 4.6 Thresholds live in config, never in code

Is €2.1M a match against €2M? Is a 3-bed acceptable to someone who said 4? These are judgements and **any value chosen now is a guess.**

**They belong in `client_automations.config`** so they can be tuned per agency without a deploy.

⚠️ **Test data cannot calibrate these, and it is worth being explicit about why.** There is no model that improves with exposure — Claude arrives fully formed, and nothing persists between calls except what is in the database. **Automation 03 does not "learn" by being fed synthetic leads.** Feeding it a thousand invented rows would prove the code runs; it would not prove the matching is right, because we would be inventing both the leads and the correct answers.

**Calibration method:** take ~20 real leads and 3 real listings, ask a real agent which they would send to whom, and check the system agrees. Half an hour with an agency beats ten thousand synthetic rows. Build for that.

### 4.7 Outcomes are recorded, never auto-applied

When a lead responds, that is signal. When five Estoril matches are ignored, the threshold may be wrong.

**Record outcomes. Surface patterns to the operator. Do not silently adjust anything.**

Two reasons. Silence is ambiguous — wrong timing, on holiday, bought elsewhere — so treating it as "no" is an inference, not a fact. And this codebase has **eighteen recorded instances** of something reporting success while the underlying thing failed; an automation that quietly changes its own behaviour based on signals we cannot fully interpret is exactly the wrong thing to add to that history.

Volume also matters: five leads tells you nothing.

---

## 5. Telling the agent — the primary path

**Default behaviour: notify the agent, not the lead.**

Three reasons, and the first is the strongest:

- **This is a luxury business.** A personal message from the agent is worth more than an automated one. Our own pitch sells relationships, not blasts.
- It keeps us the right side of the consent question (§6).
- The agent knows things we do not — that a buyer's circumstances changed, that they bought last month.

**What the agent receives**, on WhatsApp and in the cockpit:

> *Six leads in your database match the new Cascais listing. Three are strong.*
>
> **Maria Santos** — asked for exactly this in April: 4-bed, Cascais, garden non-negotiable. Budget €1.8M against €1.95M asking, and she said she could stretch for the right place. Not contacted in 5 months.
> *Suggested message: [draft]*

**The draft reply follows E4's rules exactly.** Never invent property details, never propose a viewing time, never negotiate. The agent sends it — the system does not.

---

## 6. Reaching the lead directly

### 6.1 Consent is a hard gate ⚖️

**The `leads` table has `consent_status` and `consent_at`. Nothing outbound may bypass them.**

- **Lead contacted the agency themselves** (Concierge-captured) — strongest position, contract or legitimate interest
- **Agency's own past clients** — depends entirely on how those contacts were originally collected. **The agency must confirm this at onboarding**, and their answer is recorded
- **Anyone else** — no sound basis. Not built, not configurable, no override

⚠️ **WhatsApp specifically:** unsolicited or bulk messaging violates Meta policy and risks the client's number. The 24-hour window applies — outside it, only approved templates. A listing-match to a lead last contacted in April is **outside the window** and needs a template.

### 6.2 When direct outreach is allowed

Only where consent is recorded, and only where the match is strong. **A weak match sent directly is how an agency's database gets burned** — and unlike a bad agent message, it is our fault and our reputation.

Frequency caps per lead, per client, in config. Nobody receives three listings in a week.

---

## 7. Nurture — the smaller half

Long-horizon follow-up is table stakes; every competitor does it. **Do not let it become the centre of the build.**

What is worth doing:
- Surface the silence: *"Fourteen people told you what they wanted and nobody has spoken to them in 90 days."* A CRM stores that; it does not tell you.
- Re-engagement where consent allows, respecting caps
- Stage transitions and events, as the Concierge already writes them

---

## 8. Cockpit surfaces

- **Import and mapping review** (§2.3) — with preview before commit
- **Listings** — list, status, matches per listing
- **Matches** — what fired, to whom, with the reasoning visible
- **Threshold configuration** per client (§4.6)
- **Outcomes** — response rates by area, budget band, match strength (§4.7)

Follow the locked design: direction A, Bodoni display, the luminance ladder, red reserved for state. **`probe:layout` must pass at 390/430/1440px before any gate closes.**

---

## 9. Data model

New tables; do not overload existing ones.

- `listings` — the properties
- `listing_matches` — lead × listing, with score, reasoning, evidence, and outcome
- `import_batches` — what was imported, when, from what, with what mapping

Everything else uses `leads`, `messages`, `events`, `metrics_daily` as they are.

**Migrations:** read `0002` before writing any migration that creates a table — the `service_role` grant issue is documented and has bitten twice. Non-partial unique constraints only where `ON CONFLICT` is used (the `42P10` defect, twice now).

---

## 10. Build gates

Stop and report at each.

**Gate F1 — ingestion.** Upload, mapping proposal, human review, commit, tier report.
*Proof: I import a deliberately messy spreadsheet — inconsistent headers, duplicates, mixed phone formats, some unparseable rows — and get an honest report of what landed and what did not.*

**Gate F2 — listings.** Ingestion via WhatsApp and cockpit, status handling.
*Proof: I send a listing by WhatsApp and it appears correctly, and marking it under offer stops it matching.*

**Gate F3 — the matching engine.** Hard-versus-preference, conversation evidence, geography, reasoning output.
*Proof: a match that a CRM filter would have missed, with the quoted evidence that justified it. And a near-miss correctly excluded, with its reason.*

**Gate F4 — agent notification.** WhatsApp and cockpit, with drafts.
*Proof: I receive a real match notification and it reads like something I'd act on rather than delete.*

**Gate F5 — direct outreach.** Consent gating, template handling, frequency caps.
*Proof: a lead without consent is not contacted, and the run says so explicitly rather than silently skipping.*

**Gate F6 — nurture, outcomes, hand-off.** Silence surfacing, outcome recording, docs, runbook.

---

## 11. Definition of done

1. A messy real-world spreadsheet imports, with unparseable rows reported not dropped
2. The mapping is proposed, human-reviewed, stored, and not asked again
3. The data tier is shown at onboarding and stated plainly
4. Listings ingest by WhatsApp; status changes stop matching
5. **A match is produced that a field-only filter would have missed, justified by quoted conversation evidence**
6. Every match carries its reasoning: constraints met, preferences missed, evidence
7. Hard constraints and preferences are distinguished, and the distinction is derived from what the lead said
8. Geography adjacency is configured per client, not hardcoded
9. **Thresholds are in config; no threshold is hardcoded anywhere**
10. Scarcity claims are verifiable from our own data or absent
11. Outcomes are recorded; **nothing self-adjusts**
12. **No lead without recorded consent is contacted, and skips are reported not silent**
13. Frequency caps hold
14. Drafts follow E4's rules: no invented details, no proposed times, no negotiation
15. Agent notification is actionable on a phone
16. Cockpit screens pass `probe:layout` at 390/430/1440
17. `probe:dod` for Checkpoint E still passes unchanged
18. Committed, deployed, runbook updated

**Items 5, 9, 11 and 12 are the ones that fail silently.** Weight the testing accordingly.

---

## 12. Report back with

- What was built at each gate, with evidence rather than description
- **The match from item 5, in full** — the listing, the lead, the evidence, the reasoning. That single output is the argument for this automation existing
- What you had to guess, and where a real agent's judgement is needed
- Anything in this spec that turned out to be wrong
