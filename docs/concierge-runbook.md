# Inbound Concierge — runbook

**Status:** Checkpoint A (plumbing) complete, 2026-09-01. No AI, no replies, no
calendar yet. Inbound WhatsApp messages are verified, stored and logged.

**Channel:** Twilio Sandbox for WhatsApp. The Meta Cloud API path is blocked —
the Facebook account needed for the Meta Business Portfolio was disabled and the
appeal denied. Everything downstream of the inbound parse is channel-agnostic;
switching back to Meta touches the parse node, the signature check and the send
node, and nothing else.

---

## 0. The Claude call — model, settings, measured baselines

**Checkpoint B in progress (2026-09-02).** These are the pre-build measurements
taken against the live API before the workflow nodes were written. Record any
later comparison against these numbers, not against impressions.

### Configuration (lives in `client_automations.config`, not in the workflow)

| Key | Value | Why |
|---|---|---|
| `model` | `claude-sonnet-5` | Verified against the account's `/v1/models`. Short conversational replies plus field extraction sit comfortably in Sonnet's range; per-conversation cost lands on margin. |
| `effort` | `low` | Measured indistinguishable from `medium` on quality and marginally faster. Revisit at B2, when qualification depth starts to matter. |
| `thinking` | `adaptive` | On Sonnet 5, adaptive is **on by default** — omitting the field does not disable it. |
| `max_tokens` | `1024` | Caps thinking **plus** reply. Holds only because replies are 1–3 sentences. |
| `history_limit` | `20` | Last 20 messages for this lead, oldest first. |

Changing model or effort is a config update. **Do not hardcode either in a node.**

### Measured baselines — 2026-09-02, 42 probe calls

| Metric | Value |
|---|---|
| Latency, mean | **4.26 s** |
| Latency, min / max | 2.86 s / 5.77 s |
| Worst single observation | **10.06 s** — see the SLA note below |
| Input tokens / turn | ~1,859 (system prompt ≈3.1 KB, no history) |
| Output tokens / turn | ~233 |
| Structured-output conformance | **23/23 schema-valid, zero parse failures** |

> **The 10.06 s outlier matters.** §11.1 sets a ~10 second target. Mean latency
> has ~2× headroom, but the tail has already touched the limit once in 42 calls.
> If reply latency becomes a complaint, look at the tail, not the mean — and
> remember input tokens (and therefore latency) grow as conversation history
> accumulates toward the 20-message limit. Re-baseline with real multi-turn
> history at B2; these numbers are history-free and are the floor, not the norm.

### Cost per turn

At Sonnet 5's rates of **$2 / $10 per MTok**:

```
(1,859 in ÷ 1e6 × $2) + (233 out ÷ 1e6 × $10)  ≈  $0.0060 per turn
```

So roughly **$0.06 per 10-turn conversation**, before history growth pushes
input tokens up in later turns.

> **On the price: $2/$10 is permanent.** It launched as introductory pricing
> due to revert to $3/$15 on 2026-09-01; that increase was cancelled and the
> rate made permanent on 2026-08-10. Many third-party pricing pages still carry
> the stale "reverts 1 September" line, and so does at least one cached
> reference table. **An earlier revision of this runbook used $3/$15 and was
> wrong by ~50%** — corrected 2026-09-02. If you are re-deriving cost, read
> Anthropic's own pricing page, not a summary of it.

> ⚠️ **The tokenizer change still invalidates older estimates.** Sonnet 5 uses
> the tokenizer introduced with Opus 4.7: roughly **30% more tokens for the same
> text** than Sonnet 4.6. Per-token pricing is unchanged, so the cost of an
> equivalent request rose even though the price list did not. Token counts
> measured on any earlier model do not transfer — re-run `count_tokens` against
> `claude-sonnet-5` rather than scaling an old figure.
>
> This feeds the cost-per-conversation input to the commercial reference, which
> is maintained outside this repo. **Flagged to the operator 2026-09-02.**

### Structured outputs replace prompt-and-parse

The handoff (§4.3) specifies "return only JSON" plus defensive parsing. Sonnet 5
supports `output_config.format` with a JSON schema, which constrains the
response **at the API level** — 23/23 valid across probing, versus hoping.

The §5.2 schema is unchanged; it is enforced rather than requested. Defensive
parsing stays as a second layer, because structured outputs do **not** hold when
`stop_reason` is `refusal` or `max_tokens`. So `bad_json` moves from a likely
failure mode to a genuine edge case — it is not dead code.

**Consequence for the §12.10 test:** forcing bad JSON via a prompt change no
longer works, because the API will not emit it. That test injects a malformed
payload at the parse node instead.

> ⚠️ **Schema validity is not semantic validity — and this bit us.** On
> 2026-09-03 a schema-valid response carried
> `reply: ": corrigir - vou responder corretamente.}"` and it was **delivered to
> a real lead**. It passed every structural check: a non-empty string in a
> string field. Only the *content* was broken.
>
> Not reproducible in 8 further runs — rare, not systematic, which is precisely
> why it needs a deterministic check rather than a better prompt. `ParseClaude`
> now runs `replyLooksBroken()`: rejects a reply under 15 characters, starting
> with punctuation, containing a brace, under 3 words, or containing no letters.
> Structural markers only — nothing language-specific, since replies are
> pt-PT / en / es. Verified 8/8 rejects and 6/6 accepts with no false positives.
> A rejected reply routes to `PrepRunFailed`: **nothing is sent to the lead.**
>
> An earlier revision of this section implied structured outputs removed the
> broken-reply risk. They remove *parse* failures, not *garbage content*.

### Escalation (Checkpoint B3)

**Triggers** — any one escalates: `needs_human` from the model (lead asks for a
person, price/legal/tax questions, hostility, booking request); `budget >=
config.high_value_threshold_eur` (currently €2,000,000); or **any** Claude,
parse, or reply-guard failure. A failure is a trigger in its own right: the lead
still gets the handoff note, because silence is worse than an imperfect answer.

**The four steps run in §8 order**, and the order is load-bearing:

1. **`MarkLeadEscalated`** — writes `qualification.escalated = {at, reason,
   reasons}`. **First**, so a message arriving concurrently is already blocked
   even if a later step fails.
2. **`SendHandoffNote`** — the lead is never left in silence. The note is a fixed
   string from config, so it does not depend on Claude having succeeded.
3. **`NotifyOperator`** — WhatsApp to `config.escalate_to`, short enough for a
   lock screen: number, reason, last message.
4. **`WriteEscalationEvents`** — `lead.escalated` at `warning`.

**Persistence runs BEFORE the escalation branch.** Originally it did not, and a
€3M lead escalated with `leads.budget_max` still `null` — the escalation reason
knew the figure while the row the human opens did not. Extraction is valid
whether or not the AI is the one replying next. Do not move this back.

**Already-escalated leads are never answered again.** `IsLeadEscalated` checks
`qualification.escalated` immediately after the lead upsert — **before** the
Claude call, so escalation stops spend as well as replies. Later messages are
stored and logged with `silenced_escalated_lead: true`, `ai_called: false`.

> **The trap, handled explicitly.** The operator notification and the lead reply
> ride the **same Twilio sandbox**. If the sandbox is why the reply failed, the
> notification fails too — the alert dies with the thing it is alerting about.
> `AfterNotify` records that case as `error_type='escalation_notify_failed'`,
> writes a second event at **`severity='critical'`**, and fails the run. A
> missing `config.escalate_to` is treated the same way rather than passing
> silently.

**Clearing an escalation** is manual and deliberate — there is no UI yet:

```sql
-- removes the flag so the AI resumes on the next inbound message
update public.leads
   set qualification = qualification - 'escalated', updated_at = now()
 where phone = '+3519...';
```

### The reply guard retries before it escalates

A rejected reply is retried **once** (`CallClaudeGuardRetry`), because the one
malformed reply observed was not reproducible in 8 runs — a retry very likely
recovers it invisibly. Only a **second** rejection escalates.

> **This is why the guard was not safe until B3.** Between B2 and B3 a rejected
> reply sent the lead *nothing*, which the spec is explicit is worse than an
> imperfect answer. The guard only became safe once escalation existed to catch
> what it rejects. `wasGuardRetry` prevents a second retry, so the path cannot
> loop.

### Keepalive push alert (§9)

`supabase_keepalive` now notifies on failure before throwing: notify first, then
throw. The throw is what makes n8n record a **failed execution** (the pull
signal); the WhatsApp is the **push signal**. In that order, so a Twilio failure
cannot swallow the execution-level alarm — and the thrown message states whether
the alert was `SENT` or `ALSO FAILED`.

**The alert target is hardcoded** to `+351933048230`, deliberately.
`config.escalate_to` lives in Supabase — the very system this alert fires when
it cannot reach. **An alert target stored inside the monitored system is
unreachable exactly when it is needed.**

> ⚠️ **`neverError` does not cover transport errors, and this alert was blind
> to its own trigger condition.** `neverError` suppresses non-2xx *responses*.
> A DNS failure, refused connection, or timeout is a **transport** error and the
> node throws regardless — killing the execution and skipping every in-flow
> error branch.
>
> A Supabase auto-pause removes the project's DNS record (observed 2026-08-07:
> the host stopped resolving). So `PingSupabase` threw, `NotifyKeepaliveFailure`
> never ran, and **the alert would never have fired for the one failure it
> exists to catch.** Fixed by setting `onError: continueRegularOutput` on every
> HTTP node that already sets `neverError` — 21 on the Concierge, 2 here. The
> `PingSupabase` node carries a note saying so; do not remove it.
>
> Verified 2026-09-03 (second attempt, after the first was misread): the twin's
> thrown message reported `Operator WhatsApp alert SENT`, Twilio returned 2xx,
> and the operator confirmed receipt on the handset.
>
> **Stated limitation, not solved.** This alert rides the same Twilio sandbox
> whose session expires every 3 days (§2.1). It is strictly better than
> pull-only and strictly worse than a real alerting path. Email or a second
> channel belongs in Checkpoint D.

### What Checkpoint C must undo — three deliberate B-era blocks

Booking is refused in **three separate places** during Checkpoint B, on purpose,
because nothing could book yet. All three must be lifted together. Miss one and
the failure is confusing rather than obvious — the likely symptom is a booking
that appears to work while the lead row never reaches `viewing_booked`.

| # | Where | What it does now | C must | Status |
|---|---|---|---|---|
| 1 | `MergeLeadFields` | Refuses `stage: viewing_booked` outright, records the attempt in `qualification.stage_signals` | Allow it, and add `viewing_booked` to the `RANK` map — it is currently absent, so even once permitted it would be treated as rank 0 and rejected as a regression | **Still in place** — C2 |
| 2 | System prompt (`config`-composed) | *"If the lead asks to book a viewing, acknowledge warmly and say a colleague will confirm a time. Do NOT propose specific times."* | Replace with real slot proposal, fed by free/busy | **Lifted at C1** |
| 3 | `DecideEscalation` (via `needs_human`) | A booking request **escalates** — the model sets `needs_human: true` for "asks to book or schedule a viewing" | Remove booking from the escalation triggers in the prompt, so `wants_booking` routes to the calendar instead of to a human | **Lifted at C1** |

Config carries what C needs: `booking_window_days: 14`, `working_hours`
(09:00–19:00, Mon–Sat), and — added at C1 — `timezone`, `calendar_id`,
`min_hours_notice` (24) and `viewing_duration_minutes` (60). The n8n Google
credential is operator-supplied.

`GOOGLE_CALENDAR_ID` remains in `.env` **as documentation of provenance only**.
The workflow reads `config.calendar_id`; the env var is where that value came
from. A missing or malformed id in config is guarded explicitly and reported as
`slotError`, exactly like a bad id from env would be.

> **Onboarding consideration — the OAuth app is set to "Internal".** That
> removes the 7-day refresh-token expiry for our own account, but it also means
> **only `ryvodigital.com` accounts can authorise this app**. A real client's
> calendar lives outside that domain. It does not block Checkpoint C, and the
> ops doc already recommends clients own their own integrations — but the first
> external client either authorises through their own Google Cloud project or
> the app has to go External and through verification.

Note the ordering trap in #1: `RANK` is `{new:0, nurturing:1, contacted:1,
qualified:2}`. Permitting the stage without ranking it above `qualified` means
the no-backwards rule silently blocks every booking.

**Suites after C3:** inventory **15/15**, language incl. booking-with-slots
**30/30**, never-invent **27/27** (9 with no slots, 9 with slots, 9 asking about
a day the list does not cover), slot engine + confirmation matcher + day-of-month
**65/65**, never-invent guard **8/8**.

Read 3c's 9/9 carefully: the model declines to invent a time in all nine probe
runs, yet did invent one in production. The probe measures a rate; the guard in
`ParseClaude` determines what may be sent. For a rule that must never break,
only the guard is a control.

> **Settled, do not re-open: the operator's Google UI reads one hour later than
> the true Lisbon instant.** The `Ryvo Test Client Viewings` calendar is
> `Europe/Lisbon`; the operator's Google *account display* timezone is Madrid
> (GMT+02:00). So an event the operator sees as 09:00–13:00 is returned by
> free/busy as `08:00–12:00 +01:00`, and both are correct. The code reads the
> instant Google returns and needs no change. When comparing a calendar
> screenshot against `busy` output or a `local` field, expect the one-hour
> difference and check the account's display timezone before treating it as a
> bug.

### Double-booking — how it is ACTUALLY prevented (2026-09-05, supersedes C3)

**C3's re-check did not close the race, and the same test proved it.** Two
leads confirming the same slot 0.4s apart double-booked: both re-checks
completed before either create, and two real events were written with both
leads told "confirmed". C3 had been accepted on a single run of that test where
one lead happened to lose.

**The event id is now derived from the SLOT, not the lead:**

```
rv + <calendar_id filtered to [a-v0-9], 16 chars> + <startUtc digits>
```

Two leads booking the same time therefore generate the **same id**, and Google
rejects the second create with `409`. That conflict is the lock — atomic,
server-side, in the system that owns the calendar. **Google cannot double-book
itself.**

> A Supabase unique index was considered and rejected. It arbitrates in a
> system that does not own the calendar, leaving a window between claiming the
> row and Google accepting the write — the same bug one layer up. It stays the
> fallback if Google's id semantics ever change.

**A 409 has three causes and they need three different answers.** It is
resolved against the calendar (`GetConflictEvent` → `ResolveConflict`), never
assumed:

| `conflict` | Meaning | Result |
|---|---|---|
| `ours` | Our create landed, the database write did not | `duplicate_replay` — the lead does hold it |
| `theirs` | Another lead got there first | `slot_taken` — the D2 apology, in their language |
| `burned_id` | The id belongs to a **deleted** event | `conflict_burned_id` — escalate. The slot may be free but the identifier is reserved, and this must **not** be reported to the lead as "taken" |

Ownership is written onto the event itself as
`extendedProperties.private.ryvoLeadId`, so `ours` vs `theirs` is read from the
calendar rather than guessed.

> **Deleting a test event burns its slot identifier.** Google keeps the ids of
> deleted events reserved, so re-booking that exact slot afterwards returns 409
> with a cancelled event. That is why `burned_id` exists and why it escalates
> instead of apologising. If a cleared test slot refuses to book, this is why.

**Evidence the mechanism is the fix and not timing:** execution 327 ran
`CreateEvent → IsConflict → GetConflictEvent → ResolveConflict` with
`conflict='theirs'`. The losing lead was stopped by Google's 409, not by
winning a coin toss on the re-check.

The re-check is **kept**. It is no longer the guard, but it still catches the
common case — a slot taken minutes earlier — before the model writes a
confirmation, which produces a much better reply than an apology after the
fact.

### Gate C3 — it does not double-book (2026-09-04)

Two guards, and they catch different things. Both were proven against the real
`Ryvo Test Client Viewings` calendar, not fixtures.

| Case | Guard | Outcome |
|---|---|---|
| Slot taken **before** the confirmation arrives | Guard 1, pre-call (`bookingIntent='taken'`) | Apologise and re-propose. **No escalation.** |
| Slot taken **inside the ~5s window** between the pre-call check and the create | Guard 2, `RecheckFreeBusy` | No event. Reply discarded, lead escalated |

**The race was run for real.** Two leads confirmed the same slot 0.4s apart.
Both passed the pre-call check — the slot was genuinely free in both snapshots.
One created the event; the other's execution ran
`RecheckFreeBusy → ReadRecheck → IsStillFree(false) → BlockedBooking` with
`slot_taken_since_offer`, and its already-written *"Confirmado!"* was thrown
away in favour of the handoff note. **One `viewing.booked` row, one calendar
event, one lead holding the slot.**

**Deviation from the spec, deliberate.** §9.6 asks for "apology and
re-proposal" when a slot is taken between proposal and confirmation. That is
what happens on the common path (guard 1). In the five-second race, the model
has *already written* a confirmation before the conflict is known, so its reply
cannot be reused — and composing an apology deterministically runs into the
same language problem as the handoff note. The race therefore escalates. It is
rare by construction (two leads confirming the same slot within five seconds),
and a human being told "two leads just took the same slot" is a reasonable
outcome. Revisit alongside the per-language handoff notes in Checkpoint D.

**Sweep against the real calendar:** 20/20 offered slots across five requested
days had no overlap with any busy interval, sat inside 09:00–19:00, and fell on
a working day — checked against the *same execution's* free/busy data, not a
separately fetched one.

### Booking — how Gate C2 creates the event (2026-09-04)

**The confirmation is matched by the workflow, not the model** — same reason as
C1, raised a level: an event is about to be created in a real agent's calendar,
and *"which time did they mean"* has to be answerable from stored data.
`matchConfirmation()` in `src/slot_engine.js` is unit-tested and the bias is
one-directional: **when in doubt, do not book.** An ambiguous message costs one
clarifying question; a wrong match puts a real appointment at a time nobody
agreed to.

It refuses to match on: a weekday, date or **time we never offered** (that is a
new request, and C1 owns it); a bare "sim" when more than one slot is on the
table; a weekday with two slots on it; and the word *"segunda"*, which is both
"Monday" and "the second one" and is not worth guessing during a booking.

**Why the decision happens before the Claude call.** It keeps the booking turn
at one model call. By the time Claude writes, the event either exists or it does
not — so it is *told* the outcome rather than asked for it, and cannot confirm a
booking that failed.

```
ProposeSlots -> MatchConfirmation -> BuildClaudeRequest -> ... -> DecideEscalation
   -> IsBookingReady -yes-> RecheckFreeBusy -> ReadRecheck -> IsStillFree
                                                  -yes-> CreateEvent -> CreatedBooking ┐
                                                  -no --> BlockedBooking ──────────────┤
   -no ------------------> SkipBooking ───────────────────────────────────────────────-┘
                                                                          -> AfterBooking
```

**Two free/busy calls on a booking turn, deliberately.** The first (C1's, which
runs every message) makes the *reply* correct. The second is scoped to the
single slot and runs with nothing between it and the create — that one is the
double-booking guard, and a re-check that *failed* is never treated as a
re-check that passed.

**Idempotency (§9.7) is Google's job, not ours.** The event id is derived —
`'rv' + leadId hex + startUtc digits` — so a replayed confirmation collides on
Google's side (409 → `duplicate_replay`) instead of creating a second event.
Google event ids are **base32hex: `[a-v0-9]` only**. The obvious `ryvo` prefix
is rejected — `y` is past `v` — with `400 Invalid resource id value`.

**A booking that failed is never reported as confirmed.** The model was told,
before it wrote, that the slot was free. If the create then fails, its reply
says *"Confirmado!"* about an appointment that does not exist, and the lead
turns up to an empty office. So `AfterBooking` sets `promisedButFailed`, forces
an escalation (`booking_failed:<cause>`), and **discards the model's reply** in
favour of the handoff note. This is why `AfterBooking`, not `DecideEscalation`,
is the last word on escalation: a create failure is an escalation that the
model call could not have known about.

| `booking_result` | Meaning |
|---|---|
| `not_attempted` | Not a confirmation, or escalation took priority |
| `created` | Event created; stage → `viewing_booked`, `viewing.booked` written |
| `duplicate_replay` | Same confirmation twice; exactly one event exists |
| `already_booked` | Lead already has a viewing; nothing is created |
| `slot_taken` | The re-check found it gone; apologise and re-propose |
| `recheck_failed` | Calendar unreadable; escalates rather than booking blind |
| `failed` | Create rejected; escalates, reply discarded |

**Measured, 2026-09-04.** Offer → confirm → `created`, `stage=viewing_booked`,
booking stored, `viewing.booked` written once. Replay → `already_booked`, no
second event. "Posso mudar para sexta?" after booking → escalated. "Quero marcar
e falar com uma pessoa" → escalated, nothing booked.

**Field proof the events are real and the right length:** after two bookings at
10:00 and 11:00, Google's free/busy returned **one merged busy interval**, and
the next offer for that Thursday skipped exactly 10:00 and 11:00, giving 09:00
and 12:00. That is the calendar itself confirming both events exist at the right
times with 60-minute durations. Busy filtering is no longer only unit-tested.

**Suites after the C2 prompt change (§9.11):** inventory **15/15**, language
incl. booking-with-slots **38/38**, never-invent-a-time **18/18**, slot engine +
confirmation matcher **60/60**. The prompt gained two rules at C2 — a BOOKING
note is fact rather than a suggestion, and a viewing is never described as
booked unless one says so; and moving or cancelling a booked viewing is an
explicit escalation trigger.

**Not yet exercised:** the `duplicate_replay` path. A replayed confirmation
takes the `already_booked` branch first, because the lead row already carries
the booking. `duplicate_replay` only fires if Google has the event and the
database does not — a defensive path, unit-reasoned but not observed.

> **Clearing a booking.** Set `leads.stage` back to `qualified` and delete
> `qualification.booking`; the next message then re-offers. Delete the Google
> event separately — its id is in `qualification.booking.event_id` and in the
> `viewing.booked` event row. Nothing reconciles the two yet.

### C1 measured results — the suites, and what they actually measured

| Suite | Result | Note |
|---|---|---|
| `slot_engine.test.js` | **41/41** | Includes every `preferDate` guard reporting its real reason, and full-vs-too_soon |
| Language, incl. booking-with-slots | **50/50** | 32 of those carry a slot list (EN ×3 cases, ES ×1, n=8 each) |
| Never-invent-a-time | **18/18** | 9 with no slots supplied, 9 with |
| Inventory assertion | see below | |

**The language leak is not real.** A pre-fix run reported 1 English-in/
Portuguese-out in 12 with a slot list attached, which looked like the B1 defect
returning. It was not: `prompt_suites.py` read the slot block from a
hand-maintained copy that had fallen one sentence behind the node — the missing
sentence being *"Translate weekday and month names; keep the numbers and the
timezone label exactly as given"*, added for exactly this. Rendered from the
shipping node, the same cases score 50/50.

**The inventory dip was the judge, not the product.** Two replies were graded
FAIL for saying *"não tenho acesso direto ao stock, mas um colega da equipa
confirma o que está disponível"* — which is instruction #1 of the prompt's own
inventory block, verbatim. The rubric said FAIL on anything that "implies"
stock; the prompt says to defer to a colleague. The rubric now grades against
the instruction the product was actually given: affirmative claims (*"we have
options in that range"*) fail, deferring to a colleague passes.

> Both findings are the same mistake in different clothes: **the test and the
> product disagreed about what the product had been told to do.** Check that
> before changing either.

### Media is NOT downloaded — a deliberate posture, not an omission

**The Concierge never fetches, stores or forwards the media itself.** It reads
Twilio's metadata (`NumMedia`, `MediaContentType0`, `Latitude`/`Longitude`),
writes a marker like `[voice note]` to `messages.body`, and leaves the file
where it is.

This is a decision about **what data this system is responsible for**, not an
implementation shortcut. Downloading a prospect's voice notes and photographs
would create a store of personal data belonging to the client's customers, and
every question that follows becomes ours to answer:

- how long is it retained, and who decided that
- how is a deletion request honoured, and within what period
- who is the controller and who the processor, per client
- which sub-processors hold it, and is that disclosed in the client contract
- what happens to it when a client leaves

Leaving the media on Twilio — already a disclosed sub-processor for the
messaging itself — avoids every one of those questions rather than answering
them. The marker in `messages.body` keeps the transcript honest without keeping
the content.

> **Do not "improve" this by adding storage.** Transcribing voice notes is a
> genuinely attractive feature and may well be worth building — but it is a
> data-protection decision first and a product decision second, and it needs
> the retention period, the deletion path and the client contract wording
> agreed *before* the first file is written, not after.

### Non-text inbound — voice notes, images, locations (D3, 2026-09-05)

**A WhatsApp voice note is a plausible way a real prospect sends their
requirements** — often the most detailed thing they will ever send. "We can't
process this" is a rejection. The reply is warm, and asks for the one thing
that unblocks the conversation.

Non-text takes its own branch straight after `LoadHistory`: **no calendar call,
no Claude call.** The reply has to work when there is nothing to read, which is
exactly when a model cannot help.

| Arrives as | `mediaKind` | Reply |
|---|---|---|
| `audio/*` | `audio` | asks for area, bedrooms and rough budget in text |
| `image/*`, `video/*`, documents | `image` / `video` / `document` | asks what they'd like to know |
| `Latitude`/`Longitude` (**not** media — `NumMedia` is 0) | `location` | confirms whether that's the search area |
| anything else with `NumMedia > 0` | `other` | as visual |
| a **second** unreadable message | — | hands to a human, emails the operator |

**Language comes from the lead's PREVIOUS messages**, because this one has no
words. Failing that, `config.default_language`. A caption alongside media does
count as evidence. Everything is a fixed config string under
`system_messages.media_*` — same rule as the handoff note.

**Nothing is dropped.** The inbound row stores `storedBody`, so a voice note
lands as `[voice note]` and a location as `[location: 38.69745,-9.42167]`
rather than an empty row. A message nobody can see afterwards is the same as
one that was never received — and those `[...]` markers are also how the
language detector knows to ignore them as evidence, and how the repeat check
counts them.

> **`LoadHistory` runs AFTER `InsertMessage`, so the current message is already
> in the history.** Counting it made the very first voice note look like a
> repeat and handed the lead to a human without ever asking for text. The
> filter excludes it by `external_id`, the same way `BuildClaudeRequest` does.

**Asking twice for text that is not coming is a lead going cold**, so the
second unreadable message marks the lead escalated, writes `lead.escalated`,
and emails the operator — by email rather than WhatsApp, because the alert must
not ride the sandbox it is reporting on. The media itself stays on Twilio;
nothing is downloaded or stored.

Verified live across all six shapes: text baseline, voice note, repeat →
escalation, location from an English lead, media as the very first contact with
no prior words (falls back to the configured default), and a document with a
caption.

### metrics_daily is DERIVED, never incremented (D4, 2026-09-05)

`infra/scripts/metrics_daily.py`, nightly at 03:20 Europe/Lisbon.

**Why derived.** The original spec had the workflow increment
`viewings_booked` at the moment it booked. **An increment that does not happen
is unrecoverable** — there is no way to discover later how many were missed,
because the only record of the miss is the absence of a number. A derivation
reads the events that actually happened, so a bad run is fixed by running it
again, and any date can be rebuilt from source at any time.

| Column | Derived from |
|---|---|
| `leads_new` | `events` where `type = 'lead.created'` |
| `leads_qualified` | `events` where `type = 'lead.qualified'` |
| `viewings_booked` | `events` where `type = 'viewing.booked'` |
| `messages_sent` | `messages` where `direction = 'outbound'` |
| `reactivations` | nothing yet — a Phase 2 automation. Written as an explicit `0` so the row means *"none happened"*, not *"we did not look"* |

```bash
metrics_daily.py                 # yesterday and today
metrics_daily.py 2026-09-04      # one specific date
metrics_daily.py --days 30       # backfill a month
```

**Days are LOCAL days.** The window comes from
`client_automations.config.timezone`, so a lead arriving at 00:30 in Lisbon
belongs to that date rather than to the previous UTC one.

**Verified by breaking it**, because "it can be re-run" is a claim until it is:

| Property | Test |
|---|---|
| Idempotent | Ran twice → identical numbers, 2 rows not 4 |
| Self-healing | Row corrupted to `leads_new=999, messages_sent=-5` → re-run restored 3 and 4 |
| Rebuildable | Row **deleted** → re-run reconstructed it identically from source |
| Backfillable | An arbitrary past date with no data wrote an explicit zero row |
| Truthful | After a real booking: `lead.created 1, lead.qualified 1, viewing.booked 1` → row read `new=1 qualified=1 booked=1` |

> **The upsert relies on `unique (client_id, date)` being a PLAIN unique
> constraint.** PostgREST can use it for `ON CONFLICT`; a **partial** index
> cannot be used that way and fails `42P10`. That is the defect that cost
> migration 0003 — see `engineering-lessons.md` §1, instance 3. If anyone ever
> makes this index partial, the nightly derivation stops writing.

**A derivation that stops running is silent by construction** — the table just
stops gaining rows and nothing else notices. So the health check asserts a row
exists for yesterday.

### Alerting — the channel, and what it deliberately does not depend on (D1)

**The old alarm had one leg on a 72-hour timer.** It pushed over WhatsApp
through the Twilio *sandbox*, whose session expires every three days — and it
shared that transport with the escalation path it had to be able to report on.
One Twilio problem took out both the product and the ability to say so.

The email channel is a plain HTTPS call to Resend from cron on the box, with
its own credential. It does not route through **Twilio**, **Supabase** or
**n8n**, because it has to be able to report that any of them is down.

**`ALERT_EMAIL_TO` is a list of two, and both are deliberate:**

| Recipient | Property it provides |
|---|---|
| Personal mailbox, unrelated provider | **Survivability** — still arrives if ryvodigital.com, its DNS or Workspace is what broke |
| `hello@ryvodigital.com` | **Attention** — the address actually read every day |

Those are different properties and one address cannot supply both. **Do not
consolidate them for tidiness.** A dedicated `alerts@` folder was considered
and rejected: an unread folder is the same as no alerting.

> **Residual dependency, known and accepted.** Resend sends *from* a verified
> `ryvodigital.com` address, so a DNS failure on that domain can still stop the
> send. Recipient independence covers a mailbox or Workspace failure — not a
> registrar or DNS one. Accepted because DNS lives at the registrar, outside
> everything this system runs, and is not a failure the platform can cause.

**Who calls it:** `infra/scripts/alert.sh` is the single implementation.
`healthcheck.sh` and `backup.sh` source it; n8n reaches the same API with the
same key via its own credential, so there is one transport and several callers.

`ryvo_alert` **logs before it sends**, so a failed send does not also destroy
the record of what it was trying to report, and it **returns non-zero when
nothing was delivered**. Callers must treat that as *"nobody has been told"* —
`healthcheck.sh` exits `2` for exactly that case, distinct from `1` (checks
failed, alert delivered).

### Exercising the alert channel without breaking anything real

**An alert channel nobody exercises is the same class of problem as an untested
restore script.** It has three legs that fail independently, and a green light
on one says nothing about the others:

| Leg | Fails when | Symptom |
|---|---|---|
| **API key** | Revoked, rotated, or wrong header | `401`, or `Header name must be a valid HTTP token` |
| **Sender domain** | DNS/verification lapses at Resend | `403` / domain-not-verified |
| **Recipients** | A typo, or a mailbox that starts bouncing | `422 Invalid to field`, or a silent non-delivery |

**Test 1 — the shell leg, safe to run any time.** Sends one real email and
touches nothing else:

```bash
cd /opt/ryvo-automation-platform && set -a && . ./.env && set +a
. infra/scripts/alert.sh
ryvo_alert "Ryvo: channel test" "Nothing is wrong. Testing the alert path."
```

`ryvo_alert` returns 0 only if the provider accepted it, and prints the HTTP
status either way. **Acceptance is not delivery** — confirm both inboxes by
eye. That is the only evidence that is not inferred.

**Test 2 — the n8n leg**, which uses a different credential and therefore fails
independently. Do NOT test it by breaking Supabase. Point the keepalive's
`PingSupabase` at an unresolvable host, set its trigger to a single upcoming
minute (`<M> * * * *`, not `* * * * *` — that produced three alerts in ninety
seconds), import, publish, restart, wait, then restore. Confirm from the
execution, not the status:

```sql
-- EmailKeepaliveFailure must show statusCode 200 and a Resend id.
-- An executionTime near 17ms means no HTTP call happened at all.
```

**Test 3 — the escalation fallback.** Set `client_automations.config.escalate_to`
to `+000000000000`, send a message that escalates, restore. The run payload
must show `operator_notified: false` and `email_alert_ok: true`.

> Expect a "Ryvo: recovered" email after any maintenance that restarts n8n —
> the health check alerts on transitions, so a restart that fails one cycle
> produces a recovery notice on the next. That is the design working, not noise
> to suppress.

### Mail DNS — resolved, and now watched (2026-09-05)

**Consolidated and verified.** One SPF record, one DMARC record at `p=none`
reporting to `hello@ryvodigital.com`. GoDaddy support removed the `_spfm`
record and described it as **a system bug rather than a feature**, saying it
will not regenerate.

**That assurance is not a control, so there is a check.** `healthcheck.sh`
asserts exactly one `v=spf1` at the apex and exactly one `v=DMARC1` at
`_dmarc`, and reports the policy it finds. Duplicate SPF is a PermError
(RFC 7208); duplicate DMARC means **no policy is applied at all** (RFC 7489).
Neither announces itself, and the last one cost an afternoon.

> **The check queries the AUTHORITATIVE nameservers, deliberately.** Minutes
> after the records were corrected, `dig` on this box still returned both stale
> pairs with 550s of TTL left, while the authoritative servers and `1.1.1.1`
> both showed the corrected singles. **A `dig` from one machine is a reading of
> that machine's cache, not a fact about DNS.** It nearly produced a confident
> report that the fix had not landed. If you are ever checking whether a DNS
> change is live, query the authoritative server or a public resolver — never
> the local stub.

#### The DMARC path from here — do not skip steps

1. **Stay at `p=none`.** It is publishing a policy of "do nothing", which is
   exactly right while the sender list is still being confirmed by evidence.
2. **Read the `rua` aggregate reports for a few weeks.** They arrive as daily
   XML from every large receiver. *The reports are the enumeration* — they are
   the only thing that will show a legitimate sender nobody remembered.
3. **Only then consider `p=quarantine`**, and only if the reports show every
   sending source accounted for and passing.

Tightening before the reports are clean is precisely what the original deferral
was right to avoid — and the `p=quarantine` record GoDaddy had already
published is what that mistake looks like when someone else makes it for you.

### The nightly backup pushes to the same branch you do (2026-09-05)

The first production failure of the D1 alert channel was a real one: the 03:00
backup exited 1 and had been failing for ten hours before anyone looked.
Commits pushed from the laptop left the server behind `origin`, so its export
commit was rejected non-fast-forward and that night's workflow export never
went offsite.

`backup.sh` now **pulls before exporting** rather than after committing.
Pulling after the commit exists means rebasing a fresh export onto remote
changes to the same file — a conflict a cron job should never be guessing its
way out of. Pulling first removes it: the tree is brought up to date, then the
export overwrites `workflows/` with what n8n actually holds, which is canonical
by definition. Uncommitted changes, or a pull that fails, now abort loudly
instead of exporting onto a stale tree.

> **Two writers, one branch.** The laptop and the server both commit to `main`.
> That is workable, but it means a long editing session on the laptop can leave
> the server unable to push until it next pulls. If a backup failure alert
> arrives at 03:00, this is the first thing to check.

### DNS consolidation — the exact edits, and the order they must happen in (2026-09-05)

**Header verdicts settled the spam question first:** a delivered alert and a
spam one showed *identical* results — `SPF PASS`, `DKIM PASS`, `DMARC FAIL`.
Same authentication, different sorting, so the spam classification was
**content**, not authentication. The `DMARC FAIL` is real, applies to every
message from this domain including delivered ones, and is a standing
deliverability and spoofing weakness — but it was not the cause.

#### Senders enumerated (2026-09-05)

| Sender | Authenticates via | Sends as |
|---|---|---|
| **Google Workspace** | `include:_spf.google.com`, `google._domainkey` | `@ryvodigital.com` |
| **Resend** | `resend._domainkey` (d=ryvodigital.com); Return-Path on `send.ryvodigital.com`, which has its own `include:amazonses.com` and `feedback-smtp.eu-west-1.amazonses.com` MX | `alerts@ryvodigital.com` |
| GoDaddy SPF-merge wrapper | `include:dc-aa8e722993._spfm.ryvodigital.com` | *not a sender* |

**The wrapper expands to exactly `v=spf1 include:_spf.google.com ~all`** — the
same thing the plain record already says. The two SPF records are therefore
*functionally identical*, which makes removing either one safe. That is worth
knowing before touching anything: this is not a choice between two different
sets of authorized senders.

**Resend does not need to be in the apex SPF.** SPF is evaluated against the
Return-Path (`send.ryvodigital.com`), not the From domain, and that subdomain
carries its own record — which is why Resend mail already shows `SPF PASS`.
Under relaxed alignment (`aspf=r`) the subdomain aligns with the organisational
domain, so DMARC will pass on SPF *and* on DKIM once it is evaluable at all.

#### The edits — order matters, and the obvious order is the dangerous one

DNS is at GoDaddy (`ns31/ns32.domaincontrol.com`).

**Step 1 — delete the `p=quarantine` DMARC record FIRST.**

```
Name: _dmarc     Type: TXT
Value: v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;
```

This one is deleted first, not second, and the reason is the whole trap:
**deleting a duplicate activates whichever survives.** Remove the `p=none`
record first and the domain is instantly enforcing quarantine on senders nobody
has enumerated. Remove the `p=quarantine` first and the domain lands on a
single, safe `p=none` at every intermediate moment.

**Step 2 — delete the duplicate SPF record.**

```
Name: @          Type: TXT
Value: v=spf1 include:dc-aa8e722993._spfm.ryvodigital.com ~all
```

Keep the plain `v=spf1 include:_spf.google.com ~all`. It is self-describing,
directly under our control, and costs one fewer DNS lookup against SPF's
ten-lookup limit — and since the wrapper expands to the identical content,
nothing loses authorisation.

**Step 3 — edit the surviving `_dmarc` record** to state alignment explicitly:

```
Name: _dmarc     Type: TXT
Value: v=DMARC1; p=none; rua=mailto:hello@ryvodigital.com; adkim=r; aspf=r
```

**Do not touch:** the `google-site-verification` TXT, both `_domainkey`
records, the apex MX records, or anything on `send.ryvodigital.com`.

#### The thing most likely to undo this

Both managed records — the `_spfm` SPF wrapper and the `p=quarantine` DMARC
with its `@onsecureserver.net` reporting address — look like they were
published by a GoDaddy-managed email-security feature rather than typed by
hand. **If that feature is still switched on, the records will come back**, and
the domain will be silently duplicated again.

Before making the edits, look through the GoDaddy account for whatever is
managing them. Exact menu names change, so the reliable tell is the records
themselves: anything whose reporting address is `@onsecureserver.net`, or whose
value points at a `_spfm.` hostname, is GoDaddy-generated. Turn the feature off
rather than only deleting its output. Then **re-check a week later** — a
duplicate that regenerates quietly is exactly the failure this is fixing.

#### Verify after propagation

```bash
dig +short TXT ryvodigital.com | grep -c spf1      # must be 1
dig +short TXT _dmarc.ryvodigital.com              # must be exactly one p=none record
```

Then send a test alert and re-read `Show original`: `DMARC` should move from
`FAIL` to `PASS`. **Only tighten to `quarantine` after the `rua` reports have
come back clean for a few weeks** — the reports are the enumeration, and
tightening before reading them is the thing the original deferral was right to
avoid.

> Aggregate reports arrive as daily XML attachments from every large receiver.
> If `hello@` gets noisy, route them to a parser rather than turning `rua` off —
> without reports there is no evidence on which to tighten the policy.

### Mail authentication — TWO defects found, and the DMARC decision changes (2026-09-04)

Recovery notices landed in **spam in both mailboxes** while failure alerts
arrived. An alert in a spam folder is not an alert, so this was treated as a
defect in the channel rather than a cosmetic issue.

**Two DNS faults, both objective, both RFC-level:**

| Record | Found | Consequence |
|---|---|---|
| `ryvodigital.com` TXT (SPF) | **two** `v=spf1` records | RFC 7208 §4.5: more than one SPF record is a **PermError**. Not "the first one wins" |
| `_dmarc.ryvodigital.com` TXT | **two** `v=DMARC1` records | RFC 7489 §6.6.3: multiple records → receivers **discard them all and apply no policy** |

```
"v=spf1 include:_spf.google.com ~all"
"v=spf1 include:dc-aa8e722993._spfm.ryvodigital.com ~all"

"v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;"
"v=DMARC1; p=none; rua=mailto:hello@ryvodigital.com"
```

**This changes the deferral decision rather than confirming it.** DMARC was
deferred to avoid imposing a domain-wide policy on senders that had not been
enumerated. But a `p=quarantine` record **is already published** — from
`onsecureserver.net`, presumably a registrar default nobody chose. The risk the
deferral was protecting against is already live; it is simply not being applied
because the duplicate makes the whole set unevaluable. Deleting one of the two
does not maintain the status quo — it *activates* whichever survives. Pick
deliberately, and pick `p=none` first.

DKIM is fine: a single valid `resend._domainkey` record, and
`send.ryvodigital.com` carries the SES include Resend uses for the return path.

**What the evidence does and does not show.** The API key is sending-only, so
the delivery-events endpoint returns `401 restricted_api_key` — Resend's
dashboard is operator-only for this. The decisive attribution is free and lives
in the mail itself: open a delivered message and a spam one in Gmail, **Show
original**, and read the `SPF` / `DKIM` / `DMARC` verdict lines. That
distinguishes authentication from content in one step; nothing inferred from
this end can.

**The content half was real too, and is fixed.** Four `Ryvo: recovered`
messages went out in one afternoon, byte-identical apart from a timestamp,
while the failure alerts — whose subjects varied — arrived normally. Repetition
and sameness are deliverability inputs, not cosmetics. Three changes:

- **Debounce.** `FAIL_THRESHOLD=2` consecutive failing runs (~20 min) before
  alerting. A maintenance restart no longer produces a failure-then-recovery
  pair at all, which removes most of the volume at source.
- **No unannounced recoveries.** "Recovered" is sent only if the failure was
  actually announced. Being told a problem ended that you were never told began
  is noise by definition.
- **Subjects name the fault.** `Ryvo: active workflow(s) with NO published
  version: ryvoInboundConc01 (+1 more)` and `Ryvo: recovered after 40m — all 8
  checks passing`, rather than one repeated string.

### DMARC — deliberately deferred, not overlooked (2026-09-04)

> **Superseded in part by the section above.** The original reasoning — that a
> DMARC policy is domain-wide and should not be published as a side effect of
> setting up alerting — still holds and is still right. What changed on
> 2026-09-04 is the premise: a `p=quarantine` record turned out to be published
> already, and duplicate records are what is actually breaking evaluation.

SPF and DKIM are in place for `ryvodigital.com` via Resend. **DMARC is not
being evaluated**, and until 2026-09-04 that was believed to be because no
record existed.

A DMARC policy is **domain-wide**: it would apply to Google Workspace mail from
the same domain, not just to alerts. Publishing one as a side effect of setting
up alerting would impose a policy on senders that have not been enumerated —
and the failure mode of getting it wrong is legitimate mail being rejected,
which is worse than the problem it solves at this volume.

**Do it properly before real client volume**, in the usual order: publish
`p=none` with an `rua` reporting address, read the aggregate reports for a few
weeks until every legitimate sender is accounted for, then tighten to
`quarantine` and only then `reject`. Deliverability of alerts to the two
configured recipients is unaffected in the meantime — both were confirmed by
eye on 2026-09-04.

### The health check — what it asserts, and why it runs outside n8n

Cron on the box, **not** an n8n workflow. A check that needs n8n healthy in
order to report that n8n is unhealthy tells you nothing on the day it matters.

| Check | Catches |
|---|---|
| The three containers are running | The obvious one |
| Every `active` workflow has `activeVersionId` **NOT NULL** | The unexplained 2026-09-04 outage |
| Unsigned `POST` to the webhook returns **403** | The same outage, from outside |
| Newest dump under 30h old, and last backup run exited 0 | A backup that silently stopped |
| Supabase reachable | The free-tier auto-pause |

**Verified by breaking it, not by reasoning about it.** Nulling
`activeVersionId` and restarting produced two independent FAILs — *no published
version* and *webhook returned 404, expected 403* — and `publish` + restart
cleared both. The backup trap was verified against a forced mid-script `set -e`
abort, the case a hand-placed alert call gets missed.

Alerts fire on the **transition** into failure, then at most every
`RENOTIFY_HOURS` (default 6) while it stays broken. An alarm that repeats every
five minutes gets filtered, and a filtered alarm is the same as no alarm. If a
send fails, the notification timestamp is **not** recorded, so the next run
tries again rather than sitting out the re-notify window.

### Booking — how Gate C1 proposes times (2026-09-04)

**The workflow chooses the slots. The model only phrases them.** This is not a
style preference: Checkpoint C2 has to match "the Thursday one please" against
exactly what was offered, so the offer must be something the workflow knows. If
the model picked the times, nothing could match them later.

Two nodes sit between `LoadHistory` and `BuildClaudeRequest`:

| Node | Does |
|---|---|
| `QueryFreeBusy` | `POST https://www.googleapis.com/calendar/v3/freeBusy` over the whole `booking_window_days`, using the **`Ryvo Google Calendar` n8n credential** — no token in the workflow JSON |
| `ProposeSlots` | Validates the response, picks up to 3 slots, and writes `slotLines` for the prompt |

Free/busy runs on **every inbound message**, not only booking ones. It is one
cheap call, and it means the times are already in the prompt if the conversation
turns to booking — no second Claude call, no extra latency on the turn that
matters.

**A wrong calendar id looks exactly like a free calendar.** Google answers
`HTTP 200` with `busy: []` and puts the failure in `calendars[id].errors`.
Unguarded, that offers every slot in the window. `readFreeBusy()` requires a
2xx, the calendar key present, and no `errors` array before it will read an
empty `busy` as "free"; `ProposeSlots` separately rejects a missing or
malformed `calendar_id` in config. Both produce `slotError`, never silence.

**Timezones.** Everything is computed and stored in UTC. `config.timezone`
(IANA, e.g. `Europe/Lisbon`) is applied at exactly three edges: filtering to
working hours, formatting for the lead, and — from C2 — the calendar event.
Nothing hardcodes Lisbon; the day walk happens in the client's zone, because a
day boundary in Lisbon is not one in Madrid. `tests/slot_engine.test.js` runs
every case against `Europe/Madrid` too, since the live setup has calendar,
config and cron all agreeing on Lisbon and would hide the bug.

**An offer on the table stays on the table.** The first build recomputed a
fresh spread on every message, so an unrelated "tem estacionamento?" silently
replaced a live Thursday offer and left C2 with nothing to match. `ProposeSlots`
now re-uses the stored proposals, re-validating them against current free/busy
each turn and dropping anything past, inside `min_hours_notice`, or newly busy.
`offer_source` in the run payload says which happened:

| `offer_source` | Means |
|---|---|
| `fresh` | No prior offer, or the prior one had nothing left |
| `reused` | The standing offer was re-validated and held |
| `fresh_new_date` | The lead asked for a **usable** new day, which supersedes |

A requested day only supersedes if it is genuinely usable. Asking "e no
domingo?" must not destroy a live Thursday offer — we cannot do Sundays, so the
lead would simply lose the times they were considering.

**Say which thing was true, never guess why.** When a requested day yields
nothing, `preferStatus` distinguishes the reasons and the prompt turns each into
a different sentence:

| `preferStatus` | The lead is told |
|---|---|
| `used` | (nothing — the day was honoured) |
| `full` | that day is fully booked |
| `too_soon` | that day is too soon; we need `min_hours_notice` hours |
| `closed_day` | that is not a day we do viewings |
| `out_of_window` | that is further ahead than we can book |
| `invalid` | (nothing — silent fallback to spreading) |

This matters more than it reads. The build said *"Friday is fully booked"* about
a Friday that was merely inside the 24-hour notice window — an assertion about
the calendar that nothing had checked. Same rule as inventory: say what the
system knows, never assert what it cannot see.

**No availability escalates.** If the lead is asking to book and there are no
slots — a full window, or any `slotError` — `DecideEscalation` raises
`no_availability:<cause>` and a human takes over. It is gated on
`wants_booking`, so an unrelated question during a calendar outage does not
escalate the lead. This is the one escalation that sends the model's honest
reply *and* the handoff note (`handoffBody`); every other escalation sends the
note alone, because a lead who asked for a human should not get an AI answer
first.

> `StoreHandoffMessage` writes `handoffBody`, i.e. what was actually sent — not
> the config template. The `messages` table is what `LoadHistory` feeds back to
> Claude, so a divergence there gives the model a false memory of its own last
> message.

**What C1 has NOT proven.** The test calendar is empty, so every live run
returned `busy_intervals: 0`. Busy-overlap filtering is covered by
`slot_engine.test.js` — including a whole day blocked, and the whole window
blocked — but it has never removed a slot from a *real* Google response,
because nothing can write to the calendar until C2. C3's conflict test is what
closes that gap; treat the busy path as unit-tested, not field-tested, until
then.

**Latency with the calendar call added:** 5.7–6.8s end to end (inbound webhook
to outbound row), `claude_ms` 4.0–5.2s. The free/busy round trip costs well
under a second. Target is ~10s; there is headroom, so nothing has been tuned.

**Clearing a stuck booking state.** Until C2 lands nothing writes
`viewing_booked`. When it does, the two places to look are `leads.stage` and
`leads.qualification` (`proposed_slots`, and from C2 the event id). To release a
lead: set `stage` back to `qualified` and delete the `qualification.proposed_slots`
key — the next inbound message then recomputes a fresh offer. Deleting the
Google event is a separate manual step; nothing reconciles it yet.

### Checkpoint B2 re-baseline — latency and tokens with real history

Measured 2026-09-03 through the live workflow, one lead, history growing turn by
turn. `claude_ms` is the model leg; `total_ms` is the whole run.

| turn | history msgs | input tok | output tok | claude_ms | total_ms |
|---|---|---|---|---|---|
| 1 | 1 | 2,045 | 208 | 3,601 | 5,989 |
| 2 | 3 | 2,119 | 187 | 6,301 | 8,017 |
| 3 | 5 | 2,152 | 237 | 4,068 | 5,829 |
| 4 | 7 | 2,224 | 235 | 4,071 | 5,607 |
| 5 | 9 | 2,327 | 220 | 4,954 | — |

Input tokens grow ~70/turn (~35 per stored message). Extrapolating to a full
20-message window: **~2,700 input tokens**, so ~$0.0076/turn — still well inside
the earlier estimate. Latency did **not** degrade with history over this range.

> **The tail did worsen, but not here.** A direct-API probe on 2026-09-03
> recorded **11.14 s** on one call, against the 10.06 s previously on record and
> a ~10 s target in §11.1. It was an isolated observation in a 14-call probe and
> did **not** appear in the workflow runs (worst `claude_ms` there was 6.3 s).
> **Reported to the operator before any tuning; nothing was tuned.** If this
> recurs, the lever is `effort` in config — but establish a rate first, because
> two isolated observations are not a trend.
>
> **Both outliers to date were on direct-API probes; neither appeared in a
> workflow run.** That may be telling us something about the probe — it fires
> calls back-to-back with no pacing, which the workflow never does — rather than
> about the system. Before tuning `effort`, first establish whether the tail
> exists in workflow traffic at all.

### Three prompt defects caught by probing, before any node was built

Each was found by running the real prompt against the real API and grading the
output — not by reading it. This is the §6.4 pattern in
[`engineering-lessons.md`](engineering-lessons.md) applied deliberately.

| # | Defect | Would have failed | Fix |
|---|---|---|---|
| 1 | **Over-escalation.** "Is the apartment in Cascais still available?" set `needs_human=true`. The "never invent availability" rule read as an escalation trigger — and since the AI never has inventory, that escalates nearly every first message. | §12.1 | Separated "I don't have that detail" (a reply behaviour — keep qualifying) from `needs_human` (a workflow stop). Stated that not knowing is the *normal* case. **9/9 escalation decisions correct.** |
| 2 | **Implied inventory.** "We do have some lovely options in Cascais in that range" — no specific property, but it claims stock the system cannot see. Same class of error as quoting a price. | No test; caught by review | Explicit forbidden-phrase block plus a required two-part response (colleague will confirm + one qualifying question). **15/15 passed**, graded by an independent judge call, not self-assessment. |
| 3 | **Language leak.** An **English** question ("Do you have anything with a sea view?") got **Portuguese** replies on 5 of 5 runs — the Portuguese examples inside the prompt were biasing output language. | §11.4, §12.4 | Hoisted language matching above everything else and labelled in-prompt examples as illustrative only. **18/18**, including a mid-conversation PT→EN switch. |

Defect 2 was the one worth the most: it passes casual reading, and the reply
sounds helpful. If prompt wording ever stops holding that line, replace it with
a deterministic guard rather than a better prompt — the evidence says wording is
currently sufficient, but 15 runs is not proof of reliability.

---

## 1. What is running

| Thing | Value |
|---|---|
| Workflow | `inbound_concierge_whatsapp` (id `ryvoInboundConc01`), active |
| Webhook | `POST https://n8n.ryvodigital.com/webhook/twilio-inbound` |
| Keepalive | `supabase_keepalive` (id `ryvoSupaKeepAlv`), active, daily 04:00 Europe/Lisbon |
| Sandbox number | `+14155238886` (shared, Twilio-branded) |
| Test client | `Ryvo Test Client`, matched by `clients.whatsapp_number = '+14155238886'` |
| Supabase credential | `Ryvo Supabase (service_role)`, n8n credential id `ryvoSupabaseCred` |

The workflow writes to `leads`, `messages`, `events` and `automation_runs`. It
does **not** reply — an empty TwiML document is returned so Twilio stops.

---

## 2. First thing to check when it breaks

Work down this list in order. The top item causes most outages.

### 2.1 "Messages stopped arriving" → the sandbox session expired

**The Twilio sandbox session expires 3 days after joining.** This is the single
most likely cause and it is silent: Twilio simply stops delivering. It is the
Twilio equivalent of Meta's 24h token expiry.

Fix: from the operator's WhatsApp, send `join <keyword>` to `+14155238886`
again. The keyword is in `TWILIO_SANDBOX_KEYWORD` in the server `.env`.

Do not start debugging the workflow until you have re-joined.

### 2.2 "Outbound replies go missing" (from Checkpoint B onward)

Twilio warns the sandbox may not reliably deliver **international** messages.
The operator's handset is Portuguese (`+351…`); the sandbox number is US
(`+1415…`). Suspect delivery before suspecting the code — check the message
status in the Twilio console rather than assuming a bug in the workflow.

### 2.3 "Everything 403s"

The signature is computed over the **exact public URL** Twilio signed against,
plus every POST parameter sorted by name and concatenated with no delimiters.
n8n sits behind Caddy and internally sees `http://n8n:5678/…`, which produces a
different signature. The workflow therefore hardcodes:

```
https://n8n.ryvodigital.com/webhook/twilio-inbound
```

in the `VerifySignature` node. If the domain, path or scheme ever changes, that
constant must change with it. A trailing slash also breaks it. The URL is built
in the node rather than read from `X-Forwarded-Host` so a forged header cannot
influence what gets verified.

A 403 is also correct and expected if `AccountSid` in the payload does not match
`TWILIO_ACCOUNT_SID` — a valid signature only proves the request came from *a*
Twilio account, not from ours.

### 2.4 "Nothing writes to Supabase"

The free tier **pauses a project after ~7 days of inactivity**, and it fails as
a dead connection, not a clean error. This has already happened once: 25 idle
days in August 2026 took the platform DB down.

**The nightly backup log is not a health signal for this.** `backup.sh` dumps
only the engine Postgres on our own server, so it keeps reporting exit 0 and a
successful push while Supabase is unreachable. That is exactly why
`supabase_keepalive` exists — see §4.

---

## 3. Twilio console

**The sandbox lives at:**

```
console.twilio.com  →  Develop  →  Messaging  →  Try it out
                    →  Send a WhatsApp message
```

Not `1console.twilio.com`, and not the "legacy console". Twilio's own
documentation links to a legacy-console URL that **404s** — ignore it and
navigate through the menu above.

**Inbound webhook setting:** *Sandbox settings* → **When a message comes in** →
`https://n8n.ryvodigital.com/webhook/twilio-inbound`, method **POST**.

Keep the path free of query strings. Query parameters form part of the signed
URL and add a failure mode for no benefit.

### Billing posture (set 2026-09-01)

Pay-as-you-go, **$20** balance, **auto-recharge off**, and a daily `totalprice`
usage trigger at **$10** emailing `hello@ryvodigital.com`. Auto-recharge being
off means a runaway loop stops when the balance runs out instead of billing
indefinitely — the alert is the warning, the balance is the hard stop.

---

## 4. The Supabase keepalive

`supabase_keepalive` runs daily at 04:00 Europe/Lisbon and does one
authenticated read against the platform DB. Two jobs in one: the read keeps the
idle timer from ever reaching 7 days, and a failed read is the alarm.

It **throws** on any non-2xx rather than returning cleanly, because a thrown
error is what makes n8n record a *failed* execution. A workflow that quietly
returns `{ok: false}` looks identical to a healthy one in the executions list.

Both paths were verified on 2026-09-01 by temporarily running it at one-minute
intervals: the real workflow recorded `success`, and a throwaway twin pointed at
a dead host recorded `error` three times. The twin was then deleted and the
daily schedule restored.

**Where the alarm shows up:** n8n → Executions, filtered to
`supabase_keepalive`, status Error.

> **Known gap — now unblocked, still open.** That is a pull signal: it only
> helps if somebody looks. There is still no push alert on the failure branch.
>
> The blocker is gone — `client_automations.config.escalate_to` is now
> `+351933048230`, confirmed joined to the sandbox — so a WhatsApp alert can be
> wired onto the failure branch as soon as a send node exists (Checkpoint B
> brings one). Do that then; it is a two-node addition.
>
> Note the dependency: a WhatsApp alert travels over the same sandbox whose
> session expires every 3 days (§2.1), so it is not a channel to rely on alone.
> Until it exists, treat "nobody has looked at n8n Executions this week" as a
> real risk.

---

## 5. Secrets

All live in `/opt/ryvo-automation-platform/.env`, mode 600, gitignored.
`.env.example` documents every key with no values.

### Add secrets with an editor. Never with `echo >>`

```bash
# WRONG — the whole command line, secret included, lands in shell history
echo "SOME_KEY=sk-real-value" >> .env

# RIGHT
nano /opt/ryvo-automation-platform/.env
```

This is not hypothetical. On 2026-09-01 an Anthropic key had to be rotated after
leaking into a screenshot **and** into the server's shell history; the history
was scrubbed and the repo confirmed clean, but the key was already burned.
A previous incident cost a Supabase password rotation when a malformed `.env`
line made `source .env` execute it and echo the value.

Rules that follow from those two incidents:

1. One line per value, `KEY=value`, no trailing content. `backup.sh` does
   `set -euo pipefail; source .env`, so a malformed `.env` breaks **every**
   nightly backup, not just the command in front of you.
2. Percent-encode any of `@ : / ? # & %` in a password inside `SUPABASE_DB_URL`.
3. After any rotation, check history: `grep -c 'sk-ant-api03' ~/.bash_history`
   (the server uses bash; there is no `.zsh_history` there).

### Two Anthropic organisations — rotate in the right one

| Org | Login | Use |
|---|---|---|
| **Ryvo** | `hello@ryvodigital.com` | **This project.** `ANTHROPIC_API_KEY` belongs here. |
| Personal | `manuel.seixasvale@gmail.com` | Not this project |

A key rotated in the wrong org will look valid in the console and fail at
runtime. Check the org before creating or revoking anything.

### Why the Supabase key is an n8n credential, not an env var

`n8n export:workflow` writes **node parameters** into the workflow JSON, and
`backup.sh` commits and pushes `workflows/` to GitHub nightly. A secret held in
a node parameter would therefore be published every night. Credentials are
encrypted at rest with `N8N_ENCRYPTION_KEY` and are **not** included in workflow
exports — verified: the exported JSON contains only
`{"id":"ryvoSupabaseCred","name":"Ryvo Supabase (service_role)"}`.

The Twilio auth token is the exception. Signature verification needs it inside a
Code node, and Code nodes cannot read credentials, so it is passed as a
container env var. Which required relaxing two n8n defaults — see §6.

### If `N8N_ENCRYPTION_KEY` is lost

Every credential stored in n8n, including the Supabase one, becomes permanently
unreadable. It must exist in a password manager, not only on the server.

---

## 6. n8n configuration this depends on

Set in `infra/docker-compose.yml` on the `n8n` service. Both were measured
against image `2.28.3`, not assumed:

| Variable | Why | Default behaviour without it |
|---|---|---|
| `NODE_FUNCTION_ALLOW_BUILTIN=crypto` | HMAC-SHA1 for the signature | `Module 'crypto' is disallowed` |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` | Code node reads `TWILIO_AUTH_TOKEN` | `access to env vars denied` |

**`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` lets any Code node read every variable in
that env block** — including `N8N_ENCRYPTION_KEY`, `DB_POSTGRESDB_PASSWORD` and
the JWT secret. **Treat the `environment:` block as a security surface: anything
added there becomes readable from any Code node.** Keep it minimal.

Note that `docker compose --env-file` only feeds *interpolation* of the compose
file; it does not inject `.env` into containers. Only what is listed under
`environment:` is present. The Supabase and Anthropic keys are deliberately not
there.

### The decision, and the conditions attached to it

Taken **1 Sep 2026**, deliberately, with the trade-off understood.

**The alternative was worse.** Putting the auth token into a built-in Crypto
node's parameter looks tidier, but node parameters are not credentials:
`n8n export:workflow` writes them in plaintext to `workflows/`, and `backup.sh`
commits that to GitHub nightly. That route puts a live secret into git history.

**Why the marginal risk is smaller than the exposure list suggests:** anyone who
can author a workflow can already *use* every stored n8n credential inside a
node. Exposing `N8N_ENCRYPTION_KEY` upgrades that from "can use credentials in
place" to "can exfiltrate them in reusable form" — a real escalation, but from
an already-total position, not a new door.

These conditions are part of the decision. If one stops holding, the decision
needs revisiting — it was only ever justified with them in place:

- [x] **2FA on the n8n owner account.** That account is now the single control
      protecting everything in the container env. This is the load-bearing one.
      *Enabled 1 Sep 2026; recovery codes in the operator's password manager.*
      Those codes bypass 2FA by design — they are equivalent to the account and
      belong with `N8N_ENCRYPTION_KEY`, not in a note or an inbox.
- [ ] **Keep the container env block minimal.** Prefer n8n credentials over env
      vars for anything new.
- [ ] **Revisit the moment anyone else gets n8n access.** The premise doing the
      work here is "only Manuel authors workflows." That premise is the whole
      argument; when it goes, so does the justification.
- [ ] **Long term, signature validation belongs in a small dedicated service in
      front of n8n**, not inside it. Not worth maintaining a component for a
      build scaffold — noted as the eventual shape, not a backlog item.

Changing any of this requires `docker compose --env-file ../.env up -d n8n`.

### Deploy durability — settled by experiment (2026-09-04)

**A completed CLI deploy IS durable across a restart. A routine kernel reboot
is safe.** This section previously said the opposite; that was wrong, and the
retraction is kept rather than deleted because the way it was wrong is the
useful part.

**The table I raised the alarm over is not the one the runtime uses.**
`workflow_published_version` is empty and stays empty — nothing in this path
writes to it. The CLI's `publish:workflow` calls
`WorkflowRepository.publishVersion()`, whose entire effect is:

```js
return await this.update({ id: workflowId },
                         { active: true, activeVersionId: versionIdToPublish });
```

So the field that decides whether a request can be served is
**`workflow_entity.activeVersionId`**. When it is `NULL`, a request fails with
*"Active version not found for workflow"* and the webhook returns **404**.

**What each CLI step actually does**, measured on the live instance:

| Step | `active` | `activeVersionId` | HTTP |
|---|---|---|---|
| healthy baseline | `t` | set | **403** |
| `import:workflow` | **`f`** | **`NULL`** | **404** |
| `publish:workflow` | `t` | = current `versionId` | **403** |
| `docker restart` | `t` | unchanged | **403** |
| `update:workflow --active=true` (instead of publish) | `t` | = current `versionId` | **403** |

Two things follow:

1. **`import:workflow` deactivates the workflow and nulls `activeVersionId`.**
   Every CLI deployment therefore has a real outage window between import and
   publish. It is seconds, but it is a genuine 404 window — do not import and
   then go and read something.
2. **Either `publish:workflow` or `update:workflow --active=true` closes it**,
   and the result survives `docker restart`. Verified with an explicit restart
   in the broken state and in the repaired state.

#### What is still unexplained

The Concierge did return 404 mid-session with **no deploy in the preceding
window**, and republishing fixed it. Every deploy chain run that day ended in
either `publish:workflow` or `update:workflow --active=true`, and
`export:workflow` was ruled out by direct experiment (403 before, 403 after).
So the trigger is not known. What is known is the failure *shape*:
`activeVersionId` goes `NULL` and every inbound message 404s silently.

**Nothing alerts on it.** That is the actionable part, and it belongs with the
Checkpoint D alerting work: a health check that asserts
`activeVersionId IS NOT NULL` and that an unsigned POST returns 403 would catch
this in minutes instead of whenever someone next runs a test.

> **On the retraction.** The original claim — "the healthy state is in-memory
> over an empty table, the next restart may take it down" — was built by
> reasoning from a table name that looked right without checking that the code
> writes to it. One `grep` of `publishVersion` would have settled it before the
> claim was made, and the claim was alarming enough that it should have had to
> clear a higher bar, not a lower one. Same lesson as §1 instance 9, applied to
> my own conclusions rather than to a test's.

### Deploying a workflow from the CLI: import, **publish**, restart

**`import:workflow` + `active=true` is not enough on n8n 2.28.** A workflow must
also be **published**:

```bash
n8n import:workflow --input=/tmp/wf.json
n8n publish:workflow --id=<workflow-id>     # <-- skipping this is silent
# then restart n8n
```

Skip the publish and the failure is invisible and misleading: the workflow shows
`active=true`, the boot log says **`Activated workflow "..."`**, and yet
`webhook_entity` is empty and every request 404s. Worse, it **aborts activation
for every other workflow too** — a single unpublished workflow took the Supabase
keepalive down with it.

`Activated workflow "..."` in the boot log does **not** mean the workflow is
live. It appeared for both workflows while neither was registered.

The boot line `Processed N draft workflows, M published workflows` is a better
signal than the adjective — **M=0 meant nothing was live** — but do not read it
as a count of working workflows: M=1 has been observed with two workflows
demonstrably running. Use it to notice trouble, not to confirm health.

**Confirm behaviourally. Two checks, both cheap:**

```bash
# 1. Is the webhook actually registered? (an unsigned POST must 403, not 404)
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://n8n.ryvodigital.com/webhook/twilio-inbound --data 'a=b'

# 2. Has the schedule actually fired? (an execution ROW, not a status field)
#    docker compose exec -T postgres psql -U "$N8N_DB_USER" -d "$N8N_DB_NAME" -c \
#      "SELECT e.status, e.\"startedAt\" FROM execution_entity e
#         JOIN workflow_entity w ON w.id=e.\"workflowId\"
#        WHERE w.name='supabase_keepalive' ORDER BY e.\"startedAt\" DESC LIMIT 3;"
```

**Publish every workflow you touch, not just the one you edited.** A redeploy
script that published only the inbound workflow silently left the keepalive
unpublished — and the keepalive is the thing protecting us from the Supabase
pause. It had **never fired on its 04:00 schedule**; the only executions on
record were from a forced test. Confirmed genuinely live 2026-09-02 16:48:49.

Cost us ~40 minutes on 2026-09-02, including restoring a known-good workflow to
prove the new one wasn't at fault — it wasn't; nothing was published.

### After patching a workflow, re-export from n8n and commit THAT

The file in `workflows/` must be **byte-identical to what
`n8n export:workflow` emits**, because `backup.sh` re-exports and commits it
every night at 03:00. If the committed file differs in formatting, the nightly
run rewrites it, commits, and races anything pushed from the laptop.

That is exactly what happened on 2026-09-03: the B1/B2 patch scripts wrote the
file with `json.dump(indent=2)`, the nightly export rewrote it in n8n's
single-line format, and **the backup push was rejected — so that night's run
exited non-zero and the workflow export never reached GitHub.** The dump and
prune had already run, so nothing was lost, but the offsite copy was missed.

The order that works:

```bash
# 1. patch the file locally, 2. import + publish + restart, then:
docker exec -i "$CID" n8n export:workflow --all --separate --output=/tmp/wfx
docker cp "$CID":/tmp/wfx/. /opt/ryvo-automation-platform/workflows/
# 3. commit THAT, not the patched file
```

**The patch script's output is an input to n8n, not the artefact of record.**
Verify by taking a second export and diffing it against the committed file — it
must be identical.

Note this also means a failed nightly push is currently only visible in
`/var/log/ryvo-backup.log`. It is the same pull-only gap as the keepalive alarm.

### Activating a workflow: use the UI, not the CLI

**Toggling a workflow active in the n8n UI takes effect immediately — no
restart.** The restart requirement is specific to `n8n update:workflow` from the
CLI, which prints *"Changes will not take effect if n8n is running"* and means
it: the trigger is not registered until n8n reloads.

Checkpoint A was built CLI-first and cost four bounces as a result — one for the
compose change, which was genuinely required, and three purely to pick up
activations. Later checkpoints should not accumulate restarts that way:

- **Config change** (anything in `environment:`) → restart, unavoidable.
- **Workflow create/update** → import via CLI is fine, but **activate in the
  UI**, or restart once at the end of a batch rather than after each workflow.

This matters more as soon as there is live traffic, when each bounce is a real
outage rather than a free 20 seconds.

---

## 7. Reading the logs

```bash
ssh ryvo
cd /opt/ryvo-automation-platform/infra

docker compose --env-file ../.env logs -f --tail=100 n8n   # live n8n
docker compose --env-file ../.env ps                        # container health
tail -50 /var/log/ryvo-backup.log                           # nightly backup
```

n8n UI → **Executions** is the fastest view of what a webhook actually did:
which node failed, with the input and output of each.

> **A rejected forgery is recorded as `status=success`.** This is correct from
> n8n's point of view — the workflow ran to completion, took the false branch
> and returned 403 — but it means **execution status alone cannot distinguish
> "handled a real message" from "rejected an attacker"**. Do not use a count of
> successful executions as a health or volume metric; it includes every 403.
>
> To tell them apart, look at `automation_runs` (only written on the accepted
> path) or at the `IsSignatureValid` branch inside the execution. If Checkpoint D
> adds monitoring, count `automation_runs` rows, not n8n executions.

Query the platform DB directly (service_role, server-side only):

```bash
set -a; . /opt/ryvo-automation-platform/.env; set +a
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/automation_runs?select=status,error_type,duration_ms,started_at&order=started_at.desc&limit=10"
```

Supabase requires the `apikey` header — `Authorization` alone returns 401.

---

## 8. Data contract as built (Checkpoint A)

| Table | Written when | Notes |
|---|---|---|
| `leads` | every inbound from a known client | upsert on `(client_id, phone)`; `phone` stored **without** the `whatsapp:` prefix. First contact sets `source='whatsapp'`, `stage='new'`, `consent_status='unknown'`, and `full_name` from `ProfileName` as a first guess |
| `messages` | every inbound | `external_id` = Twilio `MessageSid` — the dedupe key. `channel='whatsapp'`, `direction='inbound'`, `status='received'`, `ai_generated=false` |
| `events` | first contact only | `lead.created`. Also `run.failed` (severity `critical`) for an unknown recipient |
| `automation_runs` | every execution | `status`, `duration_ms`, and a `payload` carrying **no message bodies and no PII** |

### Dedupe is enforced by the database, not by workflow logic

Migrations `0003` + `0004` add unique indexes on `messages (client_id,
external_id)` and `leads (client_id, phone)`. The workflow attempts the insert
and treats a **409 / 23505** as "already processed, stop here". Checking
"does this id exist?" first is not sufficient on its own — Twilio retries, and
two deliveries can both pass that check before either commits.

Both indexes are deliberately **non-partial**. A partial index (`where … is not
null`) is invisible to PostgREST's upsert, which emits `ON CONFLICT (client_id,
phone)` with no predicate and fails with `42P10`. Plain unique indexes already
treat NULLs as distinct, so null-phone leads and null-`external_id` outbound
messages are still unconstrained. **Do not "tidy" these back into partial
indexes.**

### Unknown recipient logs to `events`, not `automation_runs`

The spec says to log a run with `error_type='unknown_client'`, but
`automation_runs.client_automation_id` is `NOT NULL` with a foreign key — and by
definition there is no client automation for an unknown recipient. So the event
goes to `events`, whose `client_id` is nullable, as `run.failed` /
`severity='critical'`, with `error_type` in `data`.

---

## 9. Verified on 2026-09-01

40/40 automated checks, driven by genuinely Twilio-signed requests. The
signature implementation was first checked against Twilio's published test
vector (`L/OH5YylLD5NRKLltdqwSvS0BnU=`) before going anywhere near n8n.

Covered: forged signature → 403 with zero rows written; missing signature → 403;
signature from the wrong key → 403; valid message → exactly one lead, one
message, one run, one `lead.created`; replayed identical payload → no second
message row; a second distinct message → updates the lead, no duplicate, no
second `lead.created`; unknown recipient → `unknown_client` event, no lead;
inbound image (`NumMedia=1`) → stored without crashing; run payloads free of PII.

**End-to-end confirmed the same day.** A real WhatsApp message from the
operator's handset through the Twilio sandbox produced execution 18, `success`,
1.611s: one lead (`+351933048230`, `full_name` "Manuel Vale" taken from
`ProfileName`), one message row (inbound, correct body, `status='received'`,
`ai_generated=false`), no duplicates. Checkpoint A is closed.
