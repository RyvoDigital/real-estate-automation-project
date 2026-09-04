# Phase 1 — Checkpoint C: booking

**Project:** Ryvo real estate AI automation platform
**Audience:** Claude Code (executor)
**Written:** 3 September 2026
**Supersedes:** Checkpoint C and §7 of `phase-1-inbound-concierge-handoff.md`
**Still governs, unchanged:** §4 (data contract), §5.2–5.4 (structured output, prompt, escalation triggers), §10 (constraints)

---

## 0. Read this first

Checkpoint B built the brain. The Concierge replies, remembers what it learns, and escalates when it should. But when a lead asks to book a viewing it can only acknowledge warmly and say a colleague will confirm — because nothing can touch a calendar.

**Checkpoint C closes that gap.** Query real availability, propose real times, create a real event, confirm it, and move the lead to `viewing_booked`.

### Why this matters commercially, not just technically

The client-facing overview document now says, in writing, that viewings are *"booked directly into your calendar."* That page is being sent to prospects. **This checkpoint is what makes that sentence true.** Everything else in the pitch — instant reply, qualification, multilingual, human handoff — is already real and demonstrable. This is the one claim that isn't yet.

### Scope

**IN:**
- Free/busy query against the client's calendar
- Slot proposal filtered to working hours and timezone
- Event creation on confirmation
- Confirmation message to the lead
- `stage='viewing_booked'`, `viewing.booked` event, event id stored
- Double-booking prevention

**OUT — do not build:**
- `metrics_daily` rollups (Checkpoint D — but see §6 on the counter)
- Non-text media handling, forced-failure drills, email alerting (Checkpoint D)
- Rescheduling or cancellation. If a lead asks to change a booked viewing, **escalate**. Modifying an existing booking has more failure modes than creating one and deserves its own checkpoint.
- Reminders or follow-ups before the viewing

### Execution rules (unchanged)

1. Build incrementally, stop at the sub-gates in §8, report.
2. No new secrets needed — see §2.
3. Test with real messages from the operator's phone. A created event that nobody looked at in Google Calendar is not proof.
4. Verify API behaviour against live docs before implementing.

---

## 1. What is already in place

| | |
|---|---|
| n8n credential | **`Ryvo Google Calendar`** — Google Calendar OAuth2 API, connected and saved |
| `.env` | `GOOGLE_CALENDAR_ID` present and verified |
| Google Cloud project | `ryvo-real-estate-automations`, under the `ryvodigital.com` org |
| OAuth app | **Internal** — no 7-day refresh token expiry, no verification review needed |
| Calendar | `Ryvo Test Client Viewings`, dedicated, timezone **Europe/Lisbon** |

**On the Internal setting:** it removes the expiry trap for *our* account, but it also means only `ryvodigital.com` accounts can authorise this app. A real client's calendar lives outside that domain. This does not block Checkpoint C, but note it in the runbook as an onboarding consideration — the ops doc already recommends clients own their own integrations.

**The calendar timezone was deliberately set to Lisbon** to match `client_automations.config.working_hours` and the server cron. Do not treat that agreement as permission to hardcode. See §4.

---

## 2. Credentials

**Nothing new is required.** If you conclude otherwise, stop and say so rather than working around it.

Use the **n8n credential** for calendar access, not a raw token in a node — same reasoning as Supabase at Checkpoint A: it keeps key material out of `workflows/` and therefore out of git.

---

## 3. Where this sits in the existing flow

Checkpoint B's Claude call already returns `wants_booking` and `proposed_times` in the §5.2 schema. Both have been ignored until now.

```
  [B, unchanged] parse → sanity check → escalation check → persist fields
                                │
                                ▼
  ┌────────────────── NEW IN CHECKPOINT C ──────────────────┐
  │  wants_booking? ── no ──────────────► reply as today     │
  │        │ yes                                             │
  │        ▼                                                 │
  │  already has a booking? ── yes ──► escalate (see §0)      │
  │        │ no                                              │
  │        ▼                                                 │
  │  is the lead confirming a slot we proposed?              │
  │        │                    │                            │
  │       no                   yes                           │
  │        ▼                    ▼                            │
  │  query free/busy      re-check the slot is still free    │
  │  filter to hours            │         │                  │
  │  propose up to 3       still free   taken                │
  │  store proposals            ▼         ▼                  │
  │        │              create event  apologise,           │
  │        │                    │       re-propose           │
  │        ▼                    ▼                            │
  │   reply with slots    confirm + persist + events         │
  └──────────────────────────────────────────────────────────┘
```

**Escalation still wins over booking.** If `needs_human` is true, escalate and do not book — a lead who is escalating *and* asking to book is exactly the high-value case a human should handle.

---

## 4. Timezones — read this before writing any date code

This is the most likely source of a serious, visible bug in this checkpoint. A viewing confirmed for 15:00 that lands at 14:00 is the most embarrassing failure this product can produce in front of a client.

- **Read the timezone from `client_automations.config.working_hours` and the client row. Never hardcode Lisbon**, even though the test calendar is set to it. A Madrid or Marbella client genuinely is on `Europe/Madrid`.
- The test environment currently has calendar, client config and server cron all agreeing on Lisbon. **That agreement is a convenience, not a guarantee** — it means a timezone bug will not show up in testing. Assume the code is wrong until you have proven it against a non-Lisbon timezone in a unit test.
- Store everything in UTC in the database. Convert only at the edges: when filtering working hours, when formatting times for the lead, and when creating the calendar event.
- **Portugal observes DST.** A slot proposed in October for a date in November crosses a transition. Confirm your date handling survives it.
- The lead may be in a different timezone entirely — an international buyer messaging from New York. **Times shown to the lead should be in the property's timezone**, stated explicitly ("15:00 Lisbon time"), not silently converted to theirs.

---

## 5. Proposing slots

**Query free/busy**, not the event list. Free/busy is the supported way to ask "is this time available" and it respects declined events and other calendars.

Rules:
- Look ahead `config.booking_window_days` (14 in the test config)
- Filter to `config.working_hours` — `start`, `end`, and `days` (1–6, so Sunday excluded)
- **Never propose a slot in the past**, including one earlier today
- Leave a minimum lead time — do not offer a viewing in 20 minutes. Put this in config as `min_hours_notice`, default 24
- Propose **up to 3** slots. Fewer if fewer are genuinely free
- Duration in config as `viewing_duration_minutes`, default 60

**If nothing is free in the window:** say so honestly and escalate. Do not silently propose nothing, and do not invent availability outside working hours — that is the same "never assert what you cannot see" rule that governs inventory.

**Store the proposed slots** in `leads.qualification` with a timestamp, so the confirmation step knows what was actually offered. Without this, "yes, the Tuesday one please" is unresolvable.

**Proposals expire.** A lead who replies three days later is confirming a slot that may be long gone. Treat stored proposals as stale after 24 hours and re-propose rather than booking blind.

---

## 6. Creating the event

On confirmation:

- **Re-check free/busy immediately before creating.** The slot may have been taken since it was proposed. This is the double-booking guard and it is not optional.
- If it has been taken: apologise, re-propose, do not book. Never double-book.
- Event title and description: lead's name and phone, so the agent has context on their phone without opening anything else. Keep it short — this is read on a lock screen between viewings.
- Set the event timezone from the client config.
- **Store the returned event id** in `leads.qualification`. Without it, Checkpoint D cannot reconcile and nothing can ever be cancelled or rescheduled.
- Then: `stage='viewing_booked'`, write `viewing.booked` to `events`, and send the lead a confirmation stating the date, time and timezone plainly.

**On `metrics_daily`:** §7 of the original spec says increment `viewings_booked`. Metrics are Checkpoint D. **Write the `viewing.booked` event faithfully and let D derive the counter from it** — deriving from an append-only event log is more reliable than incrementing a counter in two places, and it means a missed increment can be recovered.

**Idempotency.** If the confirmation message is delivered twice, or Twilio retries, the workflow must not create two events. The `messages` dedupe index catches most of this, but check for an existing `viewing_booked` stage and event id before creating, and treat that as "already booked" rather than an error.

---

## 7. The prompt change

Checkpoint B told the model: *if the lead asks to book, acknowledge warmly and say a colleague will confirm — do not propose specific times.* That instruction is now wrong and must be removed.

Replace it with the truth: it can offer times, but **only times the workflow supplies it**. The model must never generate a time itself. The workflow queries availability; the model phrases the offer.

This is the same boundary as inventory: the model may say what the system knows, and must not assert what it cannot see. Get this wrong and the Concierge will confidently offer Tuesday at 3pm to a lead when Tuesday at 3pm is a school run.

**Re-run the existing probe suites after changing the prompt.** The inventory suite (15/15) and language suite (18/18) both passed on the current wording, and prompt changes have twice now had effects outside the section being edited — the Portuguese-examples bug at B1 being the clearest case.

---

## 8. Build order and sub-gates

**Pause and report at each.**

**Gate C1 — it proposes real times.**
Free/busy query, working-hours filter, slot selection, storing proposals, reply. No event creation.
*Proof: from my phone, "posso visitar na quinta?" produces up to 3 real slots that are genuinely free, inside working hours, and in the future. Verify against the actual calendar.*

**Gate C2 — it books.**
Confirmation matching, re-check, event creation, stage transition, `viewing.booked`, confirmation message.
*Proof: I confirm a slot, and the event appears in `Ryvo Test Client Viewings` with the right time, title and duration. `leads` shows `viewing_booked` and the event id.*

**Gate C3 — it doesn't double-book.**
*Proof: propose slots, then manually create a conflicting event in Google Calendar before confirming. The workflow must detect it, apologise, and re-propose rather than booking over it.*

Export, commit and push at the end of each gate.

---

## 9. Definition of done

1. A booking request produces up to 3 real, genuinely free slots inside working hours.
2. No slot is ever in the past or inside `min_hours_notice`.
3. Confirming a slot creates a real event on the correct calendar at the correct time.
4. The confirmation message states date, time and timezone unambiguously.
5. `stage='viewing_booked'`, event id stored, `viewing.booked` written once.
6. A slot taken between proposal and confirmation is detected — apology and re-proposal, no double booking.
7. A confirmation replayed twice creates exactly one event.
8. A request to reschedule or cancel escalates rather than being attempted.
9. No availability in the window produces an honest reply plus escalation, not silence and not invented times.
10. The model never emits a time the workflow did not supply.
11. Inventory and language probe suites still pass after the prompt change.
12. Workflow exported, committed, pushed; runbook updated with the booking flow, the timezone rules, and how to clear a stuck `viewing_booked`.

Items 6, 7 and 10 are the ones that fail silently. Weight the testing accordingly.

---

## 10. Testing

From the operator's phone, in Portuguese unless noted:

1. **Direct booking request** — "posso visitar na quinta-feira?" → real slots offered
2. **Confirm** — accept one → event created, verified in Google Calendar by eye
3. **Out of hours** — ask for Sunday, or 22:00 → politely redirected to working hours, no slot outside them
4. **Too soon** — ask for "hoje daqui a uma hora" → respects `min_hours_notice`
5. **Conflict** — manually block the calendar between proposal and confirmation → apology and re-proposal
6. **Replay** — same confirmation delivered twice → one event
7. **Reschedule** — "posso mudar para sexta?" after booking → escalates
8. **English** — run 1 and 2 in English → slots and confirmation in English, times still in the property's timezone
9. **Full window busy** — block the whole 14 days → honest reply, escalation, no invented times
10. **Escalation beats booking** — "quero visitar e falar com uma pessoa" → escalates, does not book

---

## 11. Report back with

- What was built at each gate, workflow id
- Evidence for the twelve items in §9 — row output and a description of what the calendar actually shows
- How timezone conversion is done, and the result of testing it against a non-Lisbon timezone
- Whether the prompt change affected the inventory or language suites
- Latency with the calendar calls added — free/busy plus event creation adds two round trips to a flow already at ~4–6s. If total time approaches the ~10s target, say so before tuning.
- Anything in this spec that turned out to be wrong
