# Phase 2 — Checkpoint E: the cockpit

**Project:** Ryvo real estate AI automation platform
**Audience:** Claude Code (executor)
**Written:** 6 September 2026
**Amended:** 6 September 2026 — four corrections found while reading the source, plus the chosen visual direction and its locked palette (§2.2). The amendments are folded into the sections they belong to rather than listed at the end; §2.1, §5.1, §5.1.1, §2.2 and item 16 of §11 are the new or changed parts.
**Supersedes:** the brief "cockpit dashboard (Phase 2)" line in `phase-1-inbound-concierge-handoff.md`

---

## 0. Read this first

Phase 1 built a Concierge that answers, qualifies, books and escalates. It works. But **escalation is currently an operational dead end**: the AI stops, an alert reaches Manuel, and then there is no path back. Nothing clears the escalated flag, so every escalated lead is a permanent halt. The alerting proves you were *told*; nothing lets you *act*.

**The cockpit is what turns being told into being able to act.** It is also what turns onboarding a client from a hand-typed ritual into a form — and hand-typed rituals are how the `--env-file` invariant was lost.

### Five jobs, in priority order

1. **Escalation queue** — see what needs a human, reply, hand back to the AI
2. **Onboarding** — create and configure a client without writing SQL
3. **Leads and conversations** — what's happening, across all clients
4. **Health** — the twelve checks, visible rather than only alerting on failure
5. **Weekly report** — generated from `metrics_daily`, reviewed, then sent

### Scope

**IN:** all five above, plus a draft-reply assistant (§7).

**OUT — do not build:**
- Any client-facing login. Clients receive outcomes in their own channels plus a weekly report. This is Ryvo-internal, and that is a locked commercial decision, not a v1 shortcut.
- Multi-user roles and permissions. One user. See §3.
- Editing or deleting leads, messages or events. The record is append-only from the cockpit's side. See §4.
- Automations 02–05. They do not exist yet.

### Execution rules (unchanged)

1. Build incrementally, stop at the gates in §10, report.
2. Operator holds all secrets. Say what is needed; do not generate or echo values.
3. Test before declaring done. A screen that renders is not a screen that works.
4. Verify library and API behaviour against live docs before implementing.
5. **Check the artefact, not the execution status.** Fifteen recorded instances say the green result is the one to distrust.

---

## 1. Where it lives, and why

**A separate web application, deployed to Vercel. Not inside n8n.**

n8n has form and UI features, and using them would look like the shorter path. It is the wrong call for one decisive reason, and it is a reason this project has already established twice:

> **A tool that watches a system must not depend on that system.** The health check runs from cron outside n8n, because a check that needs n8n healthy to report n8n unhealthy tells you nothing on the day it matters. The keepalive alert target is hardcoded rather than read from Supabase, because an alert target stored inside the monitored system is unreachable exactly when it is needed.

The cockpit shows you health, escalations and failures. If it lives inside n8n, then when n8n fails you lose both the system and the window you would use to find out. Same principle, third application.

Secondary reasons: n8n's UI primitives are built for simple data collection, not a filterable list plus a conversation thread plus a reply box on a phone; and a separate app can be styled properly, which matters because you will look at this every day.

---

## 2. Stack

- **Next.js on Vercel**, same account and team as `ryvo-client-overview`
- **Supabase** as the data source, via the existing project
- **No new vendors.** If you conclude one is needed, stop and say so.

**Do not build a new send path.** See §6 — this is the most important architectural constraint in the document.

### 2.1 Visual direction — `/design` is a slash command, not a skill

**This document specifies what the cockpit must do. It deliberately says nothing about how it should look.** That is the operator's call, and it was made separately — see §2.2 for the outcome.

**`/design` is a slash command with its own authorisation, and the order matters:**

```
/design-login      authorises Claude Design for the account
/design-consent    grants Design agent access to the projects
/design            then works
```

**`/design-consent` fails with a 403 if `/design-login` has not run first**, and its error message does not say so — it suggests retrying or running `/design-login`, which reads as an alternative rather than a prerequisite. No documentation states the order. This cost a detour on 6 September 2026 and is written down here because the next person will hit it identically. It is also not a skill: do not try to load it with the Skill tool.

**The workflow that was followed, for the record:**

1. The operator supplied this spec **together with reference images** — screenshots of interfaces whose feel he wanted. Those images were the visual brief; this document is the functional one. Where they appear to conflict, ask rather than guess.
2. Two or three directions were explored on a `/design` canvas **before any application code**, because comparing alternatives is faster than committing to the first one and refactoring.
3. The operator chose. Only then was anything built.

**What the design has to serve, which is not negotiable regardless of the aesthetic:**

- **The escalation queue works one-handed on a phone.** Roughly two thirds of escalations are read between viewings. If replying here is not faster than opening WhatsApp, the cockpit will not get used and everything else in this document is wasted. Thirty seconds from opening the app to a sent reply is the bar.
- **Time since escalation is visually loud**, and gets louder as it grows. A lead waiting four hours is the failure state this screen exists to prevent.
- **A draft is unmistakably a draft**, and a failed send is unmistakably a failure. Both are §11 items that fail silently, and both are ultimately visual problems as much as logical ones.
- Onboarding, health, all-leads and the weekly report can be laptop-first. Nobody onboards a client from a bus stop.

**One practical note:** design exploration draws from the same usage pool as everything else, so iterate on two or three directions rather than a dozen.

**A design system will emerge from this**, and it is the first one the project has had. Once settled, `/design-sync` can carry it into later work so the client-facing pitch page and anything built afterwards stay visually consistent. Not a task for this checkpoint — worth knowing before choices get made that are hard to reverse.

### 2.2 The chosen direction, and the palette that is now locked

Three directions were drawn. **The chosen one is a merge of two of them**, recorded here so it is not re-litigated by someone who only sees the result.

| Taken from | What |
|---|---|
| **A — Obsidian** | The sidebar: a narrow icon rail beside a nav column, with the selected item in a *brighter* tone rather than a coloured one. The dashboard graphics — stat cards, the seven-day bar chart, the health ring. The rounded-corner treatment and soft under-shadows. And the governing principle below: **glass as chrome, solid as content.** |
| **B — Triage** | The near-black restraint, and the page organisation: a queue-pressure bar plotting every waiting lead against the four-hour line, the longest-waiting lead carrying its own reply box so no navigation stands between opening the app and sending, everything behind it compressed to a single line, and the lead detail laid out as conversation beside what the AI learned. |
| **C — Atelier** | Nothing. Dropped. |

The canvas lives at `design/` in this repo (`Main.dc.html`, `Overview.dc.html`, `LeadDetail.dc.html`, `Tokens.dc.html`, `canvas.json`) and is published as a Claude Design artifact.

#### Glass as chrome, solid as content

Glassmorphism is used on rails, navigation and dashboard panels. **It stops at the escalation queue card, which is solid.** This is the resolution of the stated tension — glass and soft shadows look superb on a desktop and fail on a phone in daylight — and it is a rule, not a preference. Anything a person has to *read under pressure* sits on a solid surface.

#### The palette, and why red is split by surface

Black base, with a red-to-dark-red gradient as the brand accent.

| Token | Value | Where |
|---|---|---|
| Page | `#08080A` | everywhere |
| Card surfaces | `#0E0F12` `#111011` `#171110` `#1F0F0D` | settled → breach |
| Brand gradient | `linear-gradient(135deg, #E8453C, #7A1A16)` | **chrome only** |
| Bone | `#EDE4DC` | the queue's brand carrier |
| Warm neutral | `#B8ADAA` | the queue's brand carrier |
| Ageing ramp | `#8E8480` `#B08279` `#E0665A` `#FF5347` | **queue only** |
| Positive | `#6FBF8A` | health, sparingly |

**Brand red and state red are the same hue, so they cannot share a surface without one stealing the other's meaning.** Red is already load-bearing in this product: it is the breach colour, the four-hour line, the outage state. If red is also the resting brand accent then the queue is red at rest, and the one behaviour that screen exists for — getting louder as a lead waits — has nowhere left to go.

So the split is **by surface, not by shade**:

- The gradient appears on the logo mark, the selected nav indicator, primary desktop buttons and dashboard graphics.
- It **never** appears on the escalation queue. There, red means *how long someone has waited* and nothing else.
- The queue's brand is carried by bone and warm neutral instead — the Send button, the count pill, the high-value chip.
- Even on the dashboard, flat red is reserved for state. The chart's bars are bone; the gradient rides the chrome and the secondary series. Flat red next to data reads as a status, and the escalations card sits in that same row.

**The ageing ramp is one hue at rising chroma** — warm grey, red-brown, red, full red — rather than the more obvious grey/amber/orange/red. Two reasons, and the second is the one that would be lost first:

1. On the queue, *more red literally means more urgent*, with no second hue competing for the meaning.
2. It is what makes the surface split affordable. A ramp that borrowed amber would introduce a colour that is neither brand nor state, and the next person to tidy the palette would collapse it back toward the brand red — which is the exact thing this rule exists to prevent.

Thresholds: **settled** under 30m, **ageing** 30–89m, **late** 90–239m, **breach** at 240m and beyond. The spine on a queue row widens with the tier (3 → 4 → 6 → 9px), so the ramp survives being read in sunlight or by someone colourblind.

---

## 3. Authentication

One user: Manuel. Phil is not a user yet, but **do not hardcode a single account** — build it so adding a second person later is a row, not a refactor.

Use **Supabase Auth** with email magic-link, restricted to an allowlist of addresses. No new vendor, it is already in the stack, and it gives real sessions rather than a shared password.

**This is not optional and not "internal tooling so it doesn't matter".** The cockpit displays prospects' names, phone numbers, budgets and message history — personal data belonging to the client's customers, for which Ryvo is the processor. An unauthenticated URL holding that data would be a reportable breach waiting to happen. ⚖️

---

## 4. Security — read before writing any data code

**The `service_role` key must never reach the browser.** Supabase RLS is enabled on all nine tables with **zero policies** — deny by default — and every write goes through `service_role` server-side. If that key is shipped to the client, anything in front of the app can read and write every client's leads.

Therefore: all Supabase access happens **server-side only** — server components, route handlers or server actions. Never a browser-side Supabase client holding the service key.

**The cockpit is append-only against the record.** It may:
- insert a `messages` row for a reply it sent
- update `leads.qualification` to clear an escalation
- insert and update `clients` and `client_automations`
- insert `events`

It may **not** delete or edit `messages`, `events` or `automation_runs`. Those are the audit trail, and several of them are what the metrics derive from. A cockpit that can rewrite history is a cockpit that can make a bug invisible.

---

## 5. Screens

### 5.1 Escalation queue — the priority, and phone-first

**Design this for a phone and adapt upward, not the reverse.** Roughly two thirds of escalations will be read on a phone, often between viewings. Everything else in the cockpit can be laptop-first.

The list shows every lead with `qualification.escalated` set, across all clients, **longest waiting first**. Each row needs enough to triage without opening it: client name, lead name and phone, escalation reason, time since escalation, and the lead's last message.

**Time since escalation is the number that matters.** A lead escalated four hours ago with no reply is the actual failure state this screen exists to prevent. Make it visually obvious as it grows.

> **On the sort order.** An earlier draft of this section said *newest first* and, two paragraphs later, that a four-hour-old lead is the failure state the screen exists to prevent. Those contradict: newest-first pushes exactly that lead off the bottom of the screen. Longest-waiting-first is correct, and it is the same ordering the ageing treatment assumes — the loudest row must also be the top row, or the two devices fight each other.

A consequence worth stating, because it looks wrong until you think about it: **a system outage that started four minutes ago produces the *newest* rows in the queue**, so those rows sort to the bottom. That is correct, and the fix is not to break the sort. An outage is surfaced by a **banner pinned above the list** (§5.1.1), which preserves the ordering rather than fighting it.

### 5.1.1 Escalation reasons are not an enum, and there are three classes

`escalation_reason` is free text from the model, plus a fixed system set. Anything that treats it as a closed enum will render blanks the first time the model writes something new.

**Read `qualification.escalated.reasons[]`, every entry** — not `reason`. Both writers (`MarkLeadEscalated` on the main path and `MarkMediaEscalated` on the media path) store the same shape, `{ at, reason, reasons[] }`, so a media escalation will not render blank. But `reason` is only `reasons[0]`: a lead that is **both** high-value **and** booking-failed has two reasons and `reason` carries one of them. The array is the authority.

The three classes, which must be **visually distinct from one another and permanently so**:

| Class | Reasons | What it means | Treatment |
|---|---|---|---|
| **System** | `claude_failed:*`, `bad_reply_twice`, `booking_failed:*`, `no_availability:*`, `media_unprocessable:*` | Something broke | Red, plus a hatch so it survives sunlight and colourblindness. Clusters raise the outage banner. |
| **High value** | `high_value:<budget>>=<threshold>` | The AI worked perfectly and handed over a lead too valuable to automate | Bone `#EDE4DC`, **never red**. This is the best row on the screen, not an alarm. |
| **Asked for a person** | `needs_human[:<free text>]` | A normal, healthy handover | Neutral outline. The most common row, and the one that should look calmest. |

**This split already exists in the product and the cockpit inherits it rather than inventing one.** `docs/ryvo-operations-and-commercial-reference.md` §9 records the same division for `automation_runs`: `needs_human` and `high_value` are recorded as successes; `claude_failed`, `bad_reply_twice`, `booking_failed` and the rest are errors. Two systems classifying the same field differently is a bug generator (§9), so the cockpit uses the same boundary. Where they must differ, `high_value` earns its own third treatment on screen because it is the only *success* escalation that is also urgent.

**Why this is a §11 item and not a styling detail.** If a Claude outage renders identically to a busy day of leads asking for a human, the screen is wrong in exactly the way instance 9 in `engineering-lessons.md` was wrong: a total model outage was logged as `status='success'` and looked like healthy demand, and the weekly client report would have said everything was fine while the AI was down. That was fixed in the data by recording *why* a lead escalated. Rendering all escalations the same reintroduces the identical defect one layer up — and it fails silently, because the screen looks fine either way.

### 5.2 Lead detail

Full conversation, oldest first, inbound and outbound distinguished, AI-generated marked as such. Alongside it: everything the AI learned — budget, timeline, area, lead type, stage, qualification notes — and the booking if one exists.

This context is the entire argument for replying here rather than in WhatsApp. On a phone in WhatsApp you have the conversation and nothing else. Here you have the €1.2M budget and the escalation reason in front of you while you type.

**Actions:** send a reply (§6), and hand back to the assistant (§5.3).

### 5.3 Handing back to the AI

**Never automatic.** A lead escalated for a reason — price negotiation, a legal question, someone asking for a human. The AI silently resuming mid-conversation is how it ends up negotiating a price you were about to discuss.

An explicit action, confirmed, that clears `qualification.escalated` and writes an event. Default state is that the lead stays with the human.

**Also handle the case where Manuel replied in WhatsApp instead.** He will sometimes just do that. If an outbound message exists for an escalated lead that the cockpit did not send, surface the escalation as "handled elsewhere" rather than leaving it looking untouched. Never a stuck state for doing the obvious thing.

### 5.4 All leads

Every lead across all clients, filterable by client, stage and escalation state, searchable by name or phone. This is the "what's happening" screen.

### 5.5 Client onboarding

A form that creates a `clients` row and its `client_automations` config, replacing hand-written SQL. Fields per §4 of the Phase 1 handoff and the current config shape: agency name, WhatsApp number, timezone, locale, default language, areas served, assistant name, working hours, booking window, minimum notice, viewing duration, high-value threshold, `escalate_to`, handoff notes per language, calendar id, model.

**Validate the things that have already caused incidents.** A malformed calendar id returns HTTP 200 with an empty busy list, indistinguishable from a free calendar — so validate it before saving. Timezone must be a real IANA zone. `escalate_to` must be a plausible number. Handoff notes must exist for every language in the config.

Use §8 of the ops doc as the checklist of what to collect at onboarding, but only build fields the system actually reads.

### 5.6 Health

The twelve checks from `healthcheck.sh`, with the time of the last run. **The value here is seeing green**, not being told about red — alerting already covers red. This is the screen that answers "is everything actually fine right now".

Show the last-run timestamp prominently. **A stale health screen is worse than no health screen**, because it looks reassuring while telling you nothing — that is the pattern in §6.4 of the ops doc, applied to a UI.

### 5.7 Weekly report

Generate from `metrics_daily` for a client and a week: leads captured, qualified, viewings booked, conversations handled, escalations. Manuel reviews it, then sends.

**Nothing sends automatically.** The report is a client-facing artefact and a wrong number in it is worse than a late report.

---

## 6. Sending — one path, not two

**The cockpit must not call Twilio directly.** It calls a new n8n webhook, which sends via the existing path.

The reasoning is that a second send path would need its own signature handling, its own `messages` row creation, its own `external_id` handling, its own dedupe and its own failure logging — and would drift from the first. Phase 1 spent a checkpoint discovering that the outbound row must carry Twilio's `sid` as `external_id` and that the unique index depends on it. One path means one set of rules.

**Requirements:**
- A dedicated webhook, authenticated — a shared secret in a header, not an open endpoint. It sends WhatsApp messages on the client's behalf; treat it accordingly.
- The message is stored with `direction='outbound'`, `ai_generated=false`, and Twilio's `sid` as `external_id`.
- **On send failure, say so plainly in the UI and do not mark the escalation handled.** The one thing this screen must never do is tell Manuel a message was sent when it was not — that is instance 6 in the lessons file, and it is the only one that reached a prospect.
- No Twilio credentials in the cockpit or in Vercel's environment.

---

## 7. The draft-reply assistant

**Drafts a reply for a human to approve, edit or discard. Never sends.**

Given the conversation and what the AI learned, it produces a suggested reply in the lead's language. Manuel edits it or ignores it, then sends. The send action is always an explicit human click.

**Why this and not autonomy.** Fifteen recorded instances say this system reports success while the underlying thing has failed. An agent that read those signals and acted on them would be acting on lies — and worse, would paper over failures that need to be seen. An agent that had "fixed" the Supabase outage by retrying would have hidden the fact that leads were being dropped.

So: **agents that tell you things, yes. Agents that do things alone, not until the signals are trustworthy.** The draft assistant is the exception because a human reads every word before it goes anywhere.

**Constraints, inherited from the Concierge and non-negotiable:**
- Never invent property details, prices or availability
- Never propose a viewing time — the workflow owns slots, and the same deterministic guard applies
- Never negotiate price or terms. **A lead escalated for price negotiation is the most likely draft request, and it is exactly where the model must not draft a negotiating position.** Draft an acknowledgement that a human is handling it, nothing more.
- Reply in the lead's language, per the existing deterministic language selection

**Make it visibly a draft.** It must never be possible to mistake an unreviewed suggestion for something already sent. This is the same failure as instance 6 in a different costume.

---

## 8. Data volume

Current data is thin — one client, a handful of leads, mostly from testing. **A screen built against three rows can look fine and fall apart at three hundred.**

Paginate lists, index queries on what is actually filtered, and test against seeded volume rather than what happens to be there. A thousand leads and ten thousand messages is a realistic year-one figure for a single busy client.

---

## 9. What this must not become

Two failure modes worth naming, because both are easy and both are common.

**A dashboard nobody opens.** If the escalation queue is not genuinely faster than replying in WhatsApp, Manuel will use WhatsApp and the cockpit will rot. The measure of success is that replying here is *easier* than the obvious alternative, on a phone, in under thirty seconds.

**A second source of truth.** The cockpit reads and writes Supabase. It does not keep its own copy of anything, does not cache lead state, and does not compute metrics differently from `metrics_daily.py`. Two systems computing the same number differently is a bug generator.

---

## 10. Build order and gates

Stop and report at each.

**Gate E0 — visual direction. ✅ Done, 6 September 2026.**
Three directions via `/design`, using the operator's reference images. No application code.
*Proof: I pick one.* — Picked: the A/B merge, recorded in §2.2 with the palette locked. C dropped.

**Gate E1 — auth and the escalation queue.**
Login, the queue, lead detail with the full conversation and qualification data. Read-only; no sending.
*Proof: I log in on my phone, see a real escalated lead, and can read everything I would need to reply well.*

**Gate E2 — replying.**
The n8n send webhook, the reply action, the message row, hand-back-to-AI, and the replied-in-WhatsApp case.
*Proof: I reply from my phone, the lead receives it in the same WhatsApp thread, the `messages` row carries Twilio's sid, and handing back lets the AI answer the next message.*

**Gate E3 — onboarding and everything else.**
The client form with validation, all-leads, health, weekly report.
*Proof: I create a second test client entirely through the form, and it receives and answers a WhatsApp message with no SQL written by hand.*

**Gate E4 — the draft assistant.**
*Proof: it drafts a sensible reply in the right language, refuses to draft a negotiating position on a price escalation, and it is impossible to confuse a draft with a sent message.*

---

## 11. Definition of done

1. Authenticated; no unauthenticated route exposes any lead data.
2. The `service_role` key is never sent to the browser — verify by inspecting the served bundle, not by reading the code.
3. The escalation queue is usable one-handed on a phone.
4. Time since escalation is visible and prominent.
5. A reply sent from the cockpit reaches the lead's WhatsApp thread and is stored correctly.
6. **A failed send is reported as failed and does not clear the escalation.**
7. Handing back to the AI is explicit and confirmed; nothing resumes automatically.
8. A reply sent in WhatsApp instead does not leave the escalation stuck.
9. A client created through the form works end to end with no hand-written SQL.
10. Calendar id, timezone, `escalate_to` and per-language handoff notes are validated at save.
11. The health screen shows the last-run time, and a stale one is visibly stale.
12. The weekly report is generated for review and sent only on an explicit action.
13. The draft assistant never sends, never proposes a time, never drafts a negotiating position, and is unmistakably a draft.
14. Lists paginate and perform against seeded volume, not current volume.
15. Committed, pushed, deployed; runbook updated.
16. **System, high-value and lead-initiated escalations are visually distinct, and a Claude outage cannot be mistaken for a busy day.** See §5.1.1.

Items 2, 6, 13 and 16 are the ones that fail silently — the screen looks fine either way, so nothing will tell you. Weight the testing accordingly.

---

## 12. Report back with

- What was built at each gate, and the deployed URL
- Evidence for the fifteen items in §11 — actual output, not description
- How you verified the service key is absent from the browser bundle
- What the escalation queue actually looks like on a phone, and how long a reply takes end to end
- Query performance against seeded volume, and what you seeded
- Which visual direction was chosen and why, in one line
- Anything in this spec that turned out to be wrong
