# Remaining defects — session 2

**Updated 12 Sep 2026, ~05:00, after the overnight fix session.**
**Deadline:** demo Tuesday 15 September, 11:00.

---

## Closed overnight

1.1 phantom booking · 1.2 booking offer not firing · 1.3 un-escalate path · 1.5 developer string · 2.3 handoff repetition

Plus, found and fixed on the way: two cockpit bugs (viewing loader reading a key nothing wrote; reply guard blind to existing bookings), the cockpit timezone bug (rendering in the server's UTC rather than the client's zone), prompt source drift behind the shipping node since 8 Sep, and the burned-slot problem — every deleted event permanently consumed its time slot, now fixed with a generation counter on the id.

**Root cause of almost all of it:** the system holding or presenting a belief that had stopped being true. Not broken logic.

---

# Still open

## 1.4 — Stage does not track reality 🔴 Tier 1

`leads.stage` sat at `viewing_booked` while the lead was being re-qualified, and still does not regress when a booking is retired — the merge refuses to move a stage backwards.

**Check first whether this is mostly the stale-booking root cause**, now fixed. What remains is likely small: let a retired booking regress the stage to `qualified`, and add the `lost` transition the spec names.

Required: `new → contacted → qualified → viewing_booked`, plus `nurturing` and `lost`.

## 2.1 — Budget range collapsed 🟡 Tier 2

Lead said "1.2 to 1.5 million"; cockpit showed **€1.5M**. Establish whether `budget_min` is null or whether both were written and only the max is rendered — **different bugs.**

If `budget_min` is being lost, this breaks database matching: a lead who would buy at 1.2 never surfaces in a search band starting at 1.25. That is the core of Automation 03.

## 2.2 — Confirm `full_name` and qualification details persist 🟡 Tier 2

The AI used "João" in its reply, so it extracted the name. Bedrooms (4), financing (pre-approved, Millennium) and purpose (own residence, relocating from Madrid) were all stated. Verify each reaches `leads.full_name` and `leads.qualification`. The cockpit summary showed none of them — **rendering gap or persistence gap? Different bugs.**

## 2.4 — Escalations route to the operator 🟡 Tier 2

All notifications go to +351933048230. Correct for testing, wrong as a product.

**Not gated:** read `escalate_to` from `client_automations.config` rather than a hardcoded number. Do this — it is the difference between a demo where escalations reach the agency and one where they reach Manuel.

**Before Tuesday:** set `escalate_to` to a second number Manuel controls, so the two roles are visibly separate in the demo. The lead's handoff note and the operator's alert currently land on the same phone, which hides the feature being sold.

**Gated:** proper per-agent routing needs the agent entity (Tier 4).

## NEW — Cockpit reply asserting something the workflow does not hold 🔴 untested

**Scenario never tried.** An agent replies from the cockpit claiming a fact the system has no record of — for example "Wednesday 16 is confirmed" when no booking exists, which is exactly what happens when an agent books manually in their own calendar and tells the lead by hand.

**What to establish:**
- Does the AI contradict the colleague on the next turn?
- Does it repeat the claim as fact, having read it as a colleague's words?
- Does the new claim-guard fire on the human's message, and should it?

Same defect class as everything else in this session: a belief entering the system with nothing checking it against reality. Realistic, and currently unknown.

## NEW — Retired-booking display claim not properly closed 🟢 logged

The cockpit says the lead was told the booking is gone, **inferred from the code path rather than read from a sent message**. Should derive from a `messages` row with `origin=handoff`. Reworded for now; logged in §8b as not properly closed.

## NEW — Escalation reason wording 🟢 cosmetic

At retirement the model's own reason says the lead asked about a meeting "that is not actually booked". It *was* booked, then removed. The fixed note to the lead is correct, so this is cosmetic.

---

# Manual test scenarios — run before the demo

Everything below is untested. Ordered by the risk of it happening in front of Vania, or in front of a real lead in week one. Each is a state transition, which is where every defect in this project has lived.

Each is written as: what to send, and what should happen. Where the right behaviour is genuinely debatable, that is said rather than assumed.

## Group A — the cockpit and the AI disagreeing 🔴 highest risk

**A1. Colleague asserts a booking that does not exist.** *(Already listed above as a defect — this is how to test it.)* Escalate the lead, reply from the cockpit with "Está tudo confirmado para quarta-feira às 09:00", hand back, then send "Perfeito, até quarta". Does the AI contradict the colleague, repeat the false claim, or say nothing about it?

**A2. Colleague contradicts a real booking.** With a live booking in place, reply from the cockpit saying the meeting is cancelled, hand back, then ask "Então está cancelada?". The workflow still holds the booking and the calendar event still exists. Which source wins?

**A3. Colleague answers a price question directly.** Trigger a price escalation, reply from the cockpit with a specific figure, hand back, then follow up on price. Does the AI now think price is discussable because a colleague discussed it? **This is the §5.3 scenario that the whole hand-back design exists to prevent — it should be proven, not assumed.**

**A4. Two cockpit replies in a row before handing back.** Does the transcript render both as colleague turns, and does the second overwrite anything?

## Group B — booking edge cases

**B1. Event moved, not deleted.** Confirm a booking, then drag it to a different time in Google Calendar. Verification checks existence and cancellation — does it notice a time change? A lead told 09:00 while the agent's calendar says 14:00 is a worse failure than a deleted event.

**B2. Double booking from two directions.** Confirm a slot via WhatsApp, then manually create a clashing event in the calendar for the same time. What does the lead get told?

**B3. Cancel and immediately rebook the same slot.** Confirm, delete, then ask for the same time again in the same conversation. The generation counter should handle it — prove it does.

**B4. Lead asks to change an existing booking.** "Afinal prefiro quinta-feira." Does it move the booking, create a second one, or escalate? All three are defensible; find out which happens.

**B5. Lead asks to cancel.** "Já não posso ir." Does the calendar event get removed, or does the system keep a booking the lead has abandoned?

**B6. Booking far in the future.** Ask for a date beyond `booking_window_days` (14). Should decline gracefully, not silently fail.

**B7. Booking outside working hours.** "Pode ser às 22:00?" Should decline and offer alternatives inside hours.

**B8. Weekend.** Config says days 1-6, so Sunday should be refused. Confirm it is.

## Group C — conversation edge cases

**C1. Language switching mid-conversation.** Start English, switch to Portuguese, switch to Spanish. Does each reply match the message it answers?

**C2. Two messages in quick succession.** Send two before the first reply lands. Two separate replies, one combined reply, or a lost message?

**C3. Very long message.** A paragraph of requirements in one send. Does extraction still work?

**C4. Contradictory information.** Say the budget is 1.5M, then later say 800k. Which is stored? Is the change noticed?

**C5. Empty or near-empty messages.** A single emoji, a single full stop. Should not crash or produce a strange reply.

**C6. Voice note.** Untested. Should be handled as gracefully as an image was.

**C7. Location pin.** Untested, and plausible for property enquiries.

**C8. Lead goes quiet then returns after hours.** Does the transcript still make sense on the next message?

## Group D — escalation edge cases

**D1. Escalation while a booking is pending.** Escalate mid-booking-flow, before confirming a slot. Are the proposed slots still valid after hand-back?

**D2. Immediate re-escalation after hand-back.** Hand back, then ask for a person again in the very next message. Should escalate cleanly.

**D3. Several escalation reasons at once.** "I want to talk to someone about a discount." Both triggers fire. Does the reason field handle multiple?

**D4. A lead who never escalates.** A long, ordinary conversation with no trigger. Nothing should escalate on its own.

## Group E — the demo path specifically 🔴 run this last, twice

**E1. The exact demo sequence, start to finish, from a clean lead.** Whatever is shown on Tuesday, run it end to end at least twice: once Monday, once Tuesday morning after rejoining the sandbox.

**E2. The same sequence with `escalate_to` set to the second number**, so the lead's handoff note and the operator's alert land on different phones. That separation is the thing being sold and it currently cannot be seen.

**E3. Deliberately break something mid-demo and recover.** Send something unexpected in the middle of the flow. Knowing how it fails is worth more than hoping it does not.

---

# Not before Tuesday

**Tier 4 — gated:** no agent entity anywhere in the system (root cause of 2.4's proper fix); calendar identity and whose availability the slot engine reads; GDPR erasure orphaning messages; Supabase paid plan.

**Deployment:** the inbound webhook was unpublished for ~2 minutes during a deploy. Harmless with no clients; a lost lead with one. Needs a zero-downtime publish path.

**Testing:** integration and regression suite — see `docs/testing-strategy.md`. Not before the demo; introducing a test framework under deadline pressure is how working code gets broken.

---

# Non-code, Saturday

- **Top up Anthropic credit to $100.** Currently ~$3, and the prompt suites were skipped last night to preserve it. Ring-fence $40/month as test budget.
- **Rejoin the Twilio sandbox Tuesday morning** — 72-hour membership, expires Monday ~15:45.
- **Set `escalate_to` to a second number** before the demo.
- **Clear the test lead's state** after the final rehearsal so the demo starts clean.

## NEW (13 Sep, 00:20) — Offer count restarts on a question that is not a booking request 🟢 logged, not fixed

Step 5 of the language rehearsal: after "Not yet, I'll confirm tomorrow" (offer correctly withheld), "What's the next step?" re-offered the three times. The lead-raises pattern in `src/offer_count.js` treats "when"/"times"-class words as the lead raising booking; "next step" is not in it, but the count restarted anyway — check whether the model's slot reply, not the count, is what re-offered (the OFFERS note is only written when the count is above zero, and the count is reset by the lead's *previous* booking request in step 1). Defensible either way; the tic is gone. Decide after the demo whether "what's next" should count as raising booking.
