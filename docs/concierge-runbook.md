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

### ⚠️ OPEN RISK — `workflow_published_version` is empty, and the Concierge died once because of it (2026-09-04)

Mid-session, with no deployment in the preceding window, the webhook started
returning **404** and the n8n log said:

```
Error in handling webhook request POST /webhook/twilio-inbound:
Active version not found for workflow with id "ryvoInboundConc01"
```

`workflow_entity.active` was `t` for both workflows. The webhook path was
registered. The workflow was simply not answerable. `publish:workflow` on both
workflows plus `docker restart` brought it back, and it is serving now.

**What the database actually shows, right now, while it is working:**

| Check | Value |
|---|---|
| `select count(*) from workflow_published_version` | **0** |
| Newest row in `workflow_publish_history` | `deactivated`, **2026-09-03 19:13** — nothing since |
| Newest row in `workflow_history` for the Concierge | **2026-09-03 19:13** |
| `workflow_entity.nodes` contains today's C1 code | `t` |
| Unsigned `POST /webhook/twilio-inbound` | `403` |

Read that table again. Every deployment made on 4 September is live in
`workflow_entity`, and **none of them produced a published version row**. The
CLI `publish:workflow` ran twice today and wrote nothing to
`workflow_published_version`. The service currently works on in-memory state
established by the last restart, over a table that is empty.

**So the healthy state is not durable.** The same 404 can return, and the only
thing that noticed last time was a test failing. Nothing alerts on it.

Ruled out by experiment: `export:workflow --all --separate` is **not** the
trigger — `403` before, `403` after, tested directly.

**What to check next, and it is operator-only:** publish the workflow once from
the **n8n UI**, then re-run `select count(*) from workflow_published_version`.
If the UI writes the row and the CLI does not, the deploy procedure below is
wrong for 2.28.3 and every CLI deployment since Checkpoint A has been leaving
the instance one restart away from a silent outage.

> **Do not treat `403` as proof the deployment is durable.** A 403 proves the
> webhook path is registered and the signature check ran. It says nothing about
> whether a published version exists to serve the *next* request. This is rule
> 7 again — the adjective (`active=true`), the behaviour (`403`) and the
> underlying record (`workflow_published_version`) disagreed, and only the
> record was telling the truth.

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
