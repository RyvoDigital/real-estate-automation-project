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

## NEW (21 Sep) — Declining the lead's own unoffered time escalates the lead 🔴 Tier 1: live, older than every 21 Sep change

**Found by live check 2** of the language deploy, 15:01 UTC. The lead asked
"11:00?", and 09:00 and 10:00 had been offered. **Both model replies were
correct**, and both were rejected by ParseClaude's never-invent guard
(`timesNotSupplied`): "reply named times the workflow never supplied: 11:00".
The lead was escalated `bad_reply_twice` and got the handoff note instead of an
answer. Verbatim (execution 4531):

1. "11:00 isn't available, but I do have Thursday 24 September 2026 at 09:00 Lisbon time or 10:00 Lisbon time - would either of those work for you, João?"
2. "11:00 isn't available, but I can offer Thursday 24 September 2026 at 09:00 Lisbon time or Thursday 24 September 2026 at 10:00 Lisbon time - which one suits you?"

**Why it happens:** the guard takes every H:MM in the reply and rejects any
not in the offered list. It cannot tell *naming* a time (inventing one) from
*declining* the time the lead asked for. The prompt tells the model to say an
unavailable time is unavailable, so the model does the right thing and the
guard punishes it.

**Proved older than the 21 Sep changes, not reasoned:**
- Both replies replayed through the guard from the `fe2e7857` build and from
  the language-fix build: `["11:00"]` on both.
- The guard function and its call site are byte-identical between them.
- The guard ignores language, so the same reply in Portuguese would have been
  rejected the same way.

**Why Tier 1:** asking for a time that is not on offer is ordinary. Every lead
who does it, and gets a correct refusal, is escalated to a human. In a demo it
looks like the assistant gave up on a simple question.

**Proposed fix, prototyped (9/9), not built:** a time the LEAD named in their
own message is allowed in a reply sentence that DECLINES it ("isn't
available", "não está/estão disponível/is", "no está/están disponible/s",
"infelizmente", "lamentablemente"…).
- **Still rejected:** an accepted unoffered time ("11:00 it is", "11:00 works
  for us"), a declined time the lead never named, and an invented alternative
  ("11:00 isn't available, but 14:00 is").
- **Where it goes:** into `src/` as its own file, with the two replies above as
  permanent cases word for word, embedded in ParseClaude and ParseGuardRetry,
  under the embed-drift test. Then the language fix is re-deployed with it.

## NEW (21 Sep) — Short English messages get Portuguese replies 🔴 Tier 1: live in production, demo-critical

**Found** re-running suite 7 on the live build (21 Sep 2026, prompt and
workflow identical to what is served). **Not fixed in the `fe2e7857` deploy.**

**What happens:** to the English message *"Ok let's go with Thursday
morning"*, **4 of 5 replies came back in Portuguese** (an earlier note said
3 of 5, counted from truncated output). Verbatim:

1. "Perfeito, quinta-feira 10 de setembro às 11:00 (hora de Lisboa) para uma primeira reunião com o nosso colega. Pode confirmar-me esse horário?"
2. "Perfeito! Fico a confirmar então a quinta-feira, 10 de setembro às 11:00 (hora de Lisboa) para uma primeira reunião com o nosso colega - pode confirmar para eu garantir esse horário?"
3. *(English, correct)* "Great choice! Just to confirm, that's Thursday 10 September 2026 at 11:00 Lisbon time for a first meeting with our colleague - shall I lock that in?"
4. "Perfeito! Fico então com a quinta-feira, 10 de setembro às 11:00, horário de Lisboa - pode confirmar para eu deixar reservado?"
5. "Perfeito! Fico então com quinta-feira, 10 de setembro às 11:00 (hora de Lisboa) - pode confirmar-me só para eu deixar isto certo?"

**Why Tier 1:** the one live prospect's pitch is multilingual, and an English
lead answered in Portuguese in a demo undoes it. It is also live for every
real English lead who writes briefly.

**Cause** (confirmed by running the shipping source):
- `detectLanguage()` scores **0 in every language** for this message: none
  of "ok, let's, go, with, thursday, morning" is in its 31-word English
  lexicon. So it returns `lang: null`.
- `BuildClaudeRequest` then renders **no REPLY LANGUAGE note**
  (`renderReplyLanguageNote(null)` returns `''`). It reads only the current
  message, with no fallback to the conversation's language.
- The model is left to infer the language against a prompt and slot block full
  of Portuguese. That is exactly the drift the 12 Sep note was built to remove,
  and here the note is never sent.
- **Two layers are blind at once:** the parsers' `replyLanguageMismatch()`
  also needs a confident lead language, so no retry fires either.
- "Tuesday at 15:00 works" also scores 0. Its replies happened to be English
  in this run.

**Reproduce:**
```
node -e "eval(require('fs').readFileSync('src/language.js','utf8'));console.log(detectLanguage(\"Ok let's go with Thursday morning\"))"
# -> { lang: null, scores: { pt: 0, en: 0, es: 0 }, confident: false }
```
- **Behaviourally:** suite 7 in `tests/prompt_suites.py` (on the server), the
  message "Ok let's go with Thursday morning" with no history.
- **Live:** from the test phone, after a hand-back, send that sentence alone.

**Fix: built, deployed, proved in part, then ROLLED BACK. Not live.**
- **Built** in `7b585c0`, deployed as `64b0376d` at 14:56 UTC. It adds the word
  lists, `resolveLeadLanguage()` in BuildClaudeRequest, and the same history
  fallback for the handoff note.
- **Check 1** ("Ok let's go with Thursday morning", 14:59 UTC): English reply,
  `leadLangSource: message`, en 10 / pt 0.
- **Check 2** ("11:00?", 15:01 UTC): the language part worked as designed.
  `leadLangSource: history` inherited English past an unreadable message, and
  the handoff note came out English through the new fallback
  (`handoffLangDetected: null`, `handoffLang: en`). But the run escalated
  `bad_reply_twice`, on the **never-invent-a-time guard**, not on language
  (next entry).
- **Rolled back** to the `fe2e7857` content at 15:01:48 UTC (served version
  `f04b9f97`, confirmed identical node for node), per the rule. `7b585c0` is
  **reverted in the repository** so it matches production. It returns with one
  cherry-pick, in the same deploy as the guard fix.
- **Proved not the cause.** Replaying both rejected replies through both
  versions' guard gives `["11:00"]` on each, and the guard code is
  byte-identical between them.

## ✅ FIXED (21 Sep) — A failed handoff send is logged as a successful run. Served version `fe2e7857`

**Fixed and proved live on 21 Sep 2026.** `PrepRunEscalated` now writes
`status='error'`, `error_type='handoff_send_failed'` whenever
`handoffOk !== true`, first in precedence.
- **Sabotage run** (`SABOTAGE-D`, a real Twilio rejection, 21211), 14:34:22 UTC:
  - the lead got no note, and the operator was notified;
  - the run row: `error` / `handoff_send_failed`;
  - invariant 4 fired: a critical event plus the WhatsApp.
- **Resting run**, 14:41:32 UTC: `success`, `handoff_sent=true`, nothing fired.
- **Permanent test:** `tests/prep_run_escalated.test.js`, which runs the
  shipping node's code. It fails 5 of 10 on the pre-fix build.

The original entry follows.

### (as logged 16 Sep) A failed handoff send is logged as a successful run 🔴 Tier 1, found by design, not by a lead

Found while designing invariant 4 (improvements §3.11), before it was built. `PrepRunEscalated` sets `status` from the operator notify and the system-failure reasons only: a run where `SendHandoffNote` **failed** but `NotifyOperator` succeeded is written as `status='success'` with `handoff_sent: false` buried in the payload. The lead who asked for a human hears nothing, the operator is told a handoff went out, and nothing alerts — the same shape as the 992ms `Success` that sent nothing.

**Now caught, not yet fixed:** invariant 4 reads `handoff_sent` on every escalated run and writes an `invariant.violated` event (critical) plus a WhatsApp when it is false, so the silence is visible within a minute. The run row itself still says `success`. **Fix:** `PrepRunEscalated` treats `!handoffOk` as an error (`error_type: 'handoff_send_failed'`), the same way `PrepRunAI` treats a failed reply send. Small change, one node. **The invariants were seen to fire live on 16 Sep (proof cycle in the runbook), so this can now be done without confounding the two.** Next session.

## ✅ FIXED (21 Sep) — Claim guard misses "quedamos entonces para el jueves". Served version `fe2e7857`

**What changed:**
- `src/booking_claim.js` allows an optional adverb after `quedamos`, and adds
  the pt (`ficamos então/combinados para`) and en (`we're set/on for <day>`)
  neighbours.
- It is re-embedded in all four nodes, and `tests/embeds_current.test.js`
  now fails if a copy drifts from `src/`.

**Suite 7 re-run** against the live build, 20 replies:
- It reproduced the FIRST shape only. That reply is now a permanent case,
  word for word.
- The adverb shape did not recur, so its test uses the doc's wording, labelled
  as such.
- The old and new guard give identical verdicts on all 20 replies.

**Harness:** `prompt_suites.py` now prints suite-7 misses in full. It was
truncating them at 76 characters, which is why the 16 Sep text was lost.

The original entry follows.

### (as logged 16 Sep) Claim guard misses "quedamos entonces para el jueves" 🟡 Tier 2

Suite 7 on the deployed build (15a2b23) missed twice on Spanish present-as-future: *"Perfecto, entonces quedamos el jueves 10 de septiembre..."* and *"Perfecto, quedamos entonces para el jueves..."*. The first shape is caught in production by `src/booking_claim.js` (`quedamos (para|el|en) <día>`). The second is **not**: the pattern allows nothing between the verb and `para`, and "entonces" sits there. Same lesson as "marco então" vs "vou marcar" (engineering-lessons 1i): the check was built for the shape someone thought of. **Fix:** allow an optional adverb (`entonces|ya|así|pues`) after `quedamos`, check the same neighbour in pt (`ficamos então para`) and en, add both suite-7 outputs verbatim to `tests/booking_claim.test.js` as permanent cases (§0.6). Prompt suites after.

## CLOSED (17 Sep) — The internal-failure email did arrive. Two layers reported it independently ✅

**Check this before anything else next session.** Two runs on 17 Sep at 00:18:57 and 00:23:35 ended `status='error'`, `error_type='internal_error:PrepRunAI'`, zone 4 — the AI-disclosure TDZ bug, since fixed. Zone 4 means the reply had already been sent, so `CatchInternal` correctly did **not** send the lead a duplicate handoff, and the operator saw three clean messages on his phone and nothing else.

**What is unverified is whether anything told him.** `CatchInternal → LogInternalFailure → EmailInternalFailure` is supposed to email the operator on exactly this. He did not report an email, and was not looking for one. There is also **no `events` row** for either failure — expected, since the workflow caught its own error rather than letting the execution fail, so Layer 1 (`ryvoErrorHandler01`, which fires on n8n execution errors) never saw it. The invariants could not catch it either: the run died before `AssertDelivery`.

So a run that errored produced: a row in `automation_runs`, no event, no invariant, and an alert of unknown status. **If that email did not arrive, a caught internal failure is silent** — visible only to someone who queries `automation_runs` — and that is the §3.7 Layer 2 gap ("the workflow reports what it *failed to do*") in its most literal form, on the single most likely kind of failure.

**🔁 Corrected 21 Sep 2026:** alerts do NOT go to `manuelvale@ryvodigital.com`.
Every alert email goes to **`manuel.seixasvale@gmail.com` and
`hello@ryvodigital.com`**. That covers the health check (`ALERT_EMAIL_TO`,
confirmed in `/var/log/ryvo-health.log`) and all four n8n email nodes
(EmailInternalFailure, EmailNotifyFailure, EmailMediaEscalation, EmailDbOutage),
read from the workflow. The original line is kept below as written.

**How to check (as written 17 Sep):** the operator's inbox (`manuelvale@ryvodigital.com`, no dot) around 00:19 and 00:23 on 17 Sep; the Resend dashboard for those two timestamps; and `EmailInternalFailure`'s response status in the executions for those runs.

**RESOLVED — it fired, and so did the layer above it.** The operator received *"Ryvo: internal failure in PrepRunAI - a lead may be unanswered"* at 02:23 **with a count of 2**, so neither failure was dropped. Independently, the server health check reported *"2 failed automation run(s) in the last 30 minutes"* at 02:30 — from outside n8n, seven minutes later, without reading the same signal.

So a caught internal failure is **not** silent: Layer 2 (the workflow reporting what it failed to do) and Layer 3 (the outside monitor) both spoke, and agreed. The absence of an `events` row is correct behaviour, not a gap — the workflow handled its own error, so Layer 1 (`ryvoErrorHandler01`, which fires on n8n *execution* errors) rightly never saw it.

**The carried limitation, which is real but is not this defect:** both alerts arrive **by email only**. A WhatsApp goes out for invariant violations but not for a caught internal failure, and email is the slower channel and the one most likely to be missed out of hours. That belongs with the §3.7 alerting work and the §4.8 anomalies screen — a caught internal failure should be visible in the cockpit, not only in two inboxes — and not as an open defect here.

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

## NEW (13 Sep, 02:05) — Retired-booking escalation reason is a code, not a sentence 🟢 cosmetic, logged

`DecideEscalation` pushes `'booking_retired:' + mc.bookingCheck`, so the cockpit shows *"booking_retired:cancelled"*. The model's own reasons read as prose; this one never did. One line: *"The appointment for Monday 14 September at 09:00 was removed from the calendar (cancelled); the lead has been sent the retired note."* Needs a deploy, so not tonight.

## NEW (13 Sep, 02:05) — `booking_match_status` is null in every run payload 🟢 cosmetic, logged

`PrepRunAI` reads it from `AfterBooking`, which does not carry it; `matched_by` does carry the matcher's reason (e.g. `question_not_acceptance`), so nothing is lost. Read it from `MatchConfirmation` by name, or drop the field.

## Closed 13 Sep, ~02:00 — the "first meeting" phantom booking

Five-step rehearsal on the hardest transcript in the system, all clean first drafts (no retries in any payload): the phantom message books nothing; "Is Tuesday still available?" is answered, not escalated; a real acceptance is booked and stated; with a booking held, a question about Wednesday is answered with Tuesday stated as standing. Lessons §8c.

## ACCEPTED (21 Sep) — One failed run produces exactly one email, 10–20 minutes later, by design

Seen live with the SABOTAGE-D handoff failure (14:34:22 UTC):
- **14:40:** the health check counted it, `consecutive=1`, "below the alert
  threshold (1/2) - not alerting yet".
- **14:50:** `consecutive=2`, emailed through Resend (HTTP 200) to
  `manuel.seixasvale@gmail.com` and `hello@ryvodigital.com`.

`FAIL_THRESHOLD=2` at a 10-minute cadence, and a failed run stays visible for
30 minutes. So a single failed run is always sampled by at least two
consecutive checks and always produces exactly one email, **10 to 20 minutes
after it**, then a "recovered" email once it leaves the window.

**Accepted as designed.** The threshold exists because alerting on the first
failing check produced bursts of byte-identical mail that landed in spam. **The
fast signal is the invariant WhatsApp**: it arrived 12 seconds after the
failed handoff.

## NEW (21 Sep) — The no-promise judge flips on identical input: a harness defect 🟡 Tier 2

In suite 7 (21 Sep, 10 English replies to "Ok let's go with Thursday
morning"), the LLM judge gave **opposite verdicts to identical wording**:
- "…Shall I lock that in?" passed once and failed twice;
- "…11:00 Lisbon time it is — can you confirm that works for you?" passed once
  and failed once.

**A judge that flips on identical input is not a gate.** Its failures cannot
be read as signal until it is fixed. The suite's 6/10 on that run says nothing
about the replies. Every one of them ended by asking the lead to confirm, and
the claim guard skips a question by design.

**Not fixed.** When it is: either make the judge deterministic enough to agree
with itself (a fixed rubric that decides on phrases, several samples and a
majority, temperature 0 where available), or replace the judgement with a rule
the code can check. Until then, read a suite-7 FAIL by looking at the reply,
never at the count.
