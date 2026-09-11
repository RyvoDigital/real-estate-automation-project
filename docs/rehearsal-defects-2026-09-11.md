# Rehearsal defect brief — 11 September 2026

**Source:** full end-to-end WhatsApp rehearsal, Twilio sandbox, English + Portuguese.
**Audience:** Claude Code.
**Deadline:** demo Tuesday 15 September, 11:00.

---

## What is working — do not touch

Verified in this session. Regressions here are worse than any defect below.

- Conversational quality. Warm, short, WhatsApp-native, one or two questions at a time.
- **Refuses to invent facts.** Asked about an unspecified villa, it declined to confirm availability and deferred to a human. This guardrail is the product's credibility — protect it.
- Qualification extraction: `timeline`, `area`, `lead_type` all landed correctly from natural conversation.
- Multilingual. Replied in Portuguese to a Portuguese message, mid-conversation, without being told.
- Non-text input handled gracefully — acknowledged, explained, asked for text. No crash.
- Escalation triggers fire correctly on both "speak to a person" and price negotiation, with reason and triggering message captured.
- Cockpit escalation queue: shows the breach clock, the reason tag and the lead's last message.
- Response time ~12s (measured on constrained wifi; re-measure from node timings before treating as a defect).

---

# TIER 1 — breaks the demo. Fix first.

## 1.1 Phantom booking 🔴 WORST

**Observed:** `leads.stage = 'viewing_booked'`, `qualification.booking` holds a full booking object with `event_id: rvc99e66fba61fe0ee20260911090000000` and `startUtc: 2026-09-11T09:00:00.000Z`. **No such event exists in Google Calendar.**

The system recorded a confirmed viewing that was never created.

**Why it is first:** an AI that tells a client's buyers a viewing is confirmed when nothing was booked destroys the agency's reputation, not ours. This is the single defect that must not survive into any demo.

**Investigate:**
- Does the Calendar create node run before the DB write, and is its response actually checked? A 4xx/5xx that is not inspected would produce exactly this.
- Is `event_id` being *derived* locally rather than read back from Google's response? The format `rvc<hash><timestamp>` looks constructed, not Google-issued.
- Was the event created and later deleted? Check the calendar's audit trail before assuming a write failure.

**Required behaviour:** the booking object and `stage = 'viewing_booked'` are written **only** after Google returns a created event, and `event_id` must be the id Google returned. If the create fails: log `error_type='calendar_error'`, tell the lead honestly, do not claim a booking.

## 1.2 Booking offer fires in Portuguese but not English

**Observed:** fully qualified English lead (€1.2–1.5M, 3-month timeline, Cascais/Estoril, 4 bed, pre-approved mortgage, name given) received **five consecutive replies** ending "a colleague will follow up" and was never offered a viewing. The same lead, one message later in Portuguese, got: *"quer que trate de agendar uma visita?"*

Same lead, same state, different language, different behaviour.

**Diagnosis:** this is a prompt problem, not a workflow problem — the booking path exists and fires. The system prompt's instruction to offer a viewing "once there is genuine interest" is being applied inconsistently across languages.

**Required behaviour:** make the trigger explicit and language-independent. Once budget, timeline and area are known, the next reply offers concrete times. State it as a rule, not a suggestion.

## 1.3 No way to un-escalate 🔴 blocks your own rehearsal

**Observed:** once `qualification.escalated` exists, the workflow routes through `IsLeadEscalated → PrepRunSilenced → LogRun` and exits in ~990ms without calling Claude. The cockpit's **Reply** button sends a message but does **not** clear the flag — tested directly, the AI stayed silent afterwards. The only way to restore the lead was hand-editing the `qualification` JSON in Supabase.

**Two consequences:**
- Every escalation test permanently kills that test lead until you edit the database. This will bite you again before Tuesday.
- For a real agency: the agent replies from the cockpit, believes it is resolved, and the AI is mute on that lead forever with no visible cause.

**Required behaviour:** sending from the cockpit clears `qualification.escalated` and hands the lead back to the AI. Add an explicit "return to AI" control as well, so an agent can hand back without sending.

## 1.4 Stage does not track the conversation

**Observed:** lead sat at `viewing_booked` throughout, while asking basic availability questions and being asked for budget. Stage and reality had fully diverged.

**Required behaviour:** implement the transitions in the spec — `new → contacted → qualified → viewing_booked`, with `nurturing` and `lost`. A lead that is being qualified is not `viewing_booked`.

## 1.5 Developer note visible in the cockpit UI

**Observed:** the lead detail page renders the literal string *"Every entry of reasons[], not just the first."* next to "Escalation reasons".

Cosmetic, two minutes, but it is on a screen you may show Vania.

---

# TIER 2 — fix before the demo if time allows

## 2.1 Budget range collapsed

Cockpit shows **€1.5M** for a lead who said "1.2 to 1.5 million". Check whether `budget_min` is null or whether both were written and only the max is rendered.

If `budget_min` is being lost, this breaks database matching — a lead who would buy at 1.2 will not surface in a search band starting at 1.25. That is the core of Automation 03.

## 2.2 Confirm `full_name` and `qualification` details persist

The AI used "João" in its reply, so it extracted the name. Bedrooms (4), financing (pre-approved, Millennium) and purpose (own residence, relocating from Madrid) were all stated. Verify each is written to `leads.full_name` and `leads.qualification`. The cockpit summary did not show them — establish whether that is a rendering gap or a persistence gap. **These are different bugs.**

## 2.3 "A colleague will follow up" repetition

Five consecutive replies ended with a variant of this. Individually correct, cumulatively it reads as an assistant that cannot do anything.

**Required behaviour:** vary the phrasing, and do not repeat the handoff promise once it has already been made in the same conversation unless something new needs checking.

## 2.4 Escalations route to the operator, not the agent

Notification went to +351933048230. Correct for testing, wrong as a product — at ten clients this makes one person the single point of failure for every agency's leads.

**Partially gated:** proper routing needs an agent entity, which does not exist (see Tier 4). **Not gated:** reading `escalate_to` from `client_automations.config` and sending there instead of a hardcoded number. Do that now. It is the difference between a demo where escalations reach Vania and one where they reach you.

---

# TIER 3 — new capability: image handling

**Current:** *"Got your file, thank you! I can't view images yet, but tell me in a line what you'd like to know."* Graceful, but a limitation.

**This is buildable.** The Claude API accepts images as base64 blocks alongside text. Buyers routinely send screenshots of listings, photos of a street, or a floor plan — being able to say "that's the Birre villa, here's what I know" is a genuine differentiator in a segment where everyone else answers by hand.

**Implementation outline:**
1. Twilio delivers media as a URL in `MediaUrl0` with `MediaContentType0`. The URL needs Twilio auth to fetch.
2. Fetch the media, base64-encode it, pass as an `image` content block with the correct `media_type`.
3. Guard: accept `image/jpeg`, `image/png`, `image/gif`, `image/webp` only. Anything else keeps the current graceful message.
4. Cap file size. Reject oversized media rather than timing out.
5. **The no-inventing-facts rule must extend to images.** It may describe what it sees and ask a clarifying question. It must never identify a photo as a specific listing in the agency's book or confirm a price from an image. If a photo looks like a property enquiry it cannot verify, escalate.
6. Store the media URL in the message row, not the image itself. **Do not store lead-supplied images** — that raises the data-protection stakes for no benefit.
7. Audio and documents keep the current graceful handling. Images only.

**Scope check:** this is the largest item in the brief and the only one that is a new feature rather than a fix. Build it after Tier 1 is green. If Tier 1 and 2 consume the weekend, this ships next week and nothing is lost.

---

# TIER 4 — genuinely gated, not before Tuesday

These are blocked on something outside this weekend's control. Recorded so they are not forgotten.

- **No agent entity anywhere in the system** — no table, no column. Root cause of the multi-agent gap and the real fix for 2.4. Requires a schema change plus a migration, and it must be designed once, properly. Do not rush it under a demo deadline.
- **Calendar identity (`matched_by: "time+weekday"`)** — the double-booking guard derives the event id from the time slot alone. Breaks with multiple agents. Depends on the agent entity. **The window closes the moment real bookings exist in a client's calendar.**
- **GDPR erasure** — deleting a lead orphans its messages (`on delete set null`) rather than removing them. Legal deadline, not an engineering one. Needs a designed erasure runbook.
- **Supabase paid plan** — needed before real client data lands. Free tier auto-pauses and the backup log reports green regardless. Do it the day a client signs, not before.

---

# Also noted, non-blocking

- **32 Code nodes with no error branches.** The root cause of the silent-failure pattern seen today: the workflow reported `Success` in 992ms having sent nothing. Add error branches where a failure would produce a wrong outcome rather than no outcome. Full coverage is a project, not a weekend.
- **A schedule inside this workflow fires every 10 minutes** (~100ms each, 144/day). This is most of the 1,301 execution count and makes that number meaningless as a usage signal. Identify what it does and whether it should be a separate workflow.
- **7 failed production executions** showing in the overview. Check what they were.
- **Response time ~12s** — measured over constrained wifi. Get the real figure from node timings before treating it as a defect. Spec is ~10s.

---

# Suggested order

1. **1.3 un-escalate** — do this first. Without it, every subsequent test kills your test lead.
2. **1.1 phantom booking** — the one that must not survive.
3. **1.2 booking offer in English** — prompt fix, cheap, high value.
4. **1.4 stage transitions**
5. **1.5 UI string** — two minutes.
6. **2.1 / 2.2 data capture** — verify, then fix whichever layer is at fault.
7. **2.4 escalate_to from config**
8. **2.3 repetition** — prompt tuning.
9. **Tier 3 images** — only once the above are green.

After each fix, re-run the affected leg of the rehearsal. A fix is done when a real message round-trip proves it, not when the node exists.

---

# Non-code tasks for Monday

- **Top up Anthropic credit to $20.** Currently $3.47 — enough for testing, not enough to survive a live demo, and it fails silently.
- **Rejoin the Twilio sandbox Tuesday morning.** Membership lasts 72 hours; the current session expires Monday ~15:45.
- **Clear the escalation flag on the test lead** after the final rehearsal run, so the demo starts from a clean state.
