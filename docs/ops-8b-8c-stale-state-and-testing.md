# §8b/§8c addition — stale-state defects and the testing gap

**Recorded 12 Sep 2026, from the 11 Sep end-to-end rehearsal.**

---

## 8b.x — The dominant defect class: stale state

Every defect found in the 11 September rehearsal was the same shape: **the system held or presented a belief that had stopped being true.** Not one was broken logic.

| Defect | The stale belief |
|---|---|
| 1.3 | Escalation flag left set from a test three days earlier; AI silenced indefinitely |
| Transcript | Human cockpit replies and handoff notes rendered as the assistant's own words |
| 1.1 (first form) | Booking object retained after its calendar event was deleted |
| 1.1 (mirror form) | Booking correctly absent, but the absence never stated to the model, which then asserted one from history |
| 1.4 | `stage` stuck at `viewing_booked` while the lead was being re-qualified |
| Cockpit time | Rendering in the server's zone (UTC on Vercel) rather than the client's |

Three of these produced multiple visible symptoms from one cause. The transcript bug alone caused the false re-escalations, the inaccurate reason fields, and the "a colleague will follow up" repetition (2.3). The stale booking alone caused the missing booking offers (1.2) and the stuck stage.

**The conversational core was not implicated in any of them.** It behaved well throughout, including under adversarial input: it refused to invent availability every time, switched language correctly mid-conversation, caught a soft frustration escalation, and extracted budget, timeline, area and financing from natural conversation.

### Where else to expect this class

The system holds state in a small, knowable number of places. Each should be audited against the same question: *when this stops being true, does anything notice, and is the model told?*

1. **`leads.stage`** — known bad (1.4). Does not regress when a booking is retired.
2. **Escalation flag** (`qualification.escalated`) — fixed 11 Sep, regressed within the hour, fixed again. Highest-churn state in the system.
3. **Booking object** (`qualification.booking`) — depends on an external system that can change behind us. The most exposed state we hold.
4. **Conversation transcript** — fixed 11 Sep. The record the model reasons from; corruption here is invisible and affects everything.
5. **`consent_status` / `consent_at`** — ⚠️ **never tested, and legally material.** Outbound automations are required to respect it. Nothing has verified that they do.
6. **`client_automations.config`** — untested for change. What happens mid-conversation when working hours, languages, `escalate_to` or the handoff note change?

**Highest unaudited risk: consent (5), because it is a legal exposure rather than a quality one, and Automation 02's entire state machine of who was contacted and when — more state than the Concierge holds, and less tested.**

---

## 8c.x — Integration and regression test suite

### Why this comes before the §8c product items

Item A (client performance report), Item B (own-pipeline machine) and Item C (transaction coordination) all assume the platform is trustworthy enough to sell. The 11 September evidence is that we cannot currently tell whether it is: three consecutive deploys reported typecheck passing, tests green and production build clean, and were wrong each time. Every defect was found by hand, on WhatsApp, by the operator.

**This is arguably the prerequisite for everything else in §8c.**

### What exists today

Genuine coverage, in the wrong layer:

- 39 cockpit tests
- 24 unit tests on the transcript builder
- 22 on booking verification
- Prompt suites that run against the live API
- An e2e probe

All of it verifies components in isolation. **The defects live in the seams between components**, which is why none of it caught anything on 11 September.

### What is missing

**1. Integration tests over the whole workflow.** Feed a sequence of inbound messages to the webhook against a scratch database; assert both the outbound messages and the resulting database state. The nine-step manual sequence run on 11 September should be a script, not an evening.

**2. State-transition tests** — the exact pattern behind every defect above. Booking created → event deleted externally → what is the lead told? Escalated → handed back → does it stay handed back? Slot passes → does it still block offers? Config changes mid-conversation → what happens?

**3. A regression test per closed defect.** 1.1 was fixed, verified by hand, and reappeared within the hour because nothing was watching it. Every closed defect leaves behind a test that fails if it returns. **Cheapest discipline available; would have caught the one regression we hit.**

**4. Tests that run on deploy, not on request.** A fix that is not verified automatically will eventually be un-fixed by a later change.

**5. Scheduled synthetic conversation against the live stack, with alerting.** `backup.sh` has reported green every night for weeks while saying nothing about whether Supabase was even reachable. Any regime that requires someone to go and look inherits the silent-failure problem it exists to solve.

### Constraint to resolve first

The prompt suites exist and were **deliberately not run** during the 11 September fixes, to preserve API credit (balance was $3.47). A safety net switched off to save twenty dollars is not a safety net. **Top up Anthropic credit and set a test budget that is not negotiable against demo spend.**

### Sequencing

**Not before the 15 September demo.** Introducing a test framework under deadline pressure is how working code gets broken.

**Next week, before any client signs:** convert the manual sequences into an integration suite, add the regression tests, wire it into deploy. Two to three days. That is the difference between supporting one client and supporting five.

### Also recorded

- **Deploy window outage.** The inbound webhook was unpublished for ~2 minutes during the 11 Sep deploy, between import and publish. Harmless with no clients; with a live client that is a lost lead. Needs a zero-downtime publish path.
- **Prompt source drift.** The source prompt file had fallen behind the shipping n8n node since 8 September, so the prompt suites were testing something the live system was not running. Re-synced 11 Sep. Needs a guard so drift cannot recur silently.
