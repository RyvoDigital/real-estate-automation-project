# Concierge: guards that read structure, not prose (plan, not built)

Written 22 Sep 2026 at the operator's request. Decision: patch the phrase lists
now (fd90df4), then build this as the next Concierge piece of work, **before any
real client**. The operator schedules it.

## Why

By 22 Sep, eight replies had been wrongly rejected, or wrongly flagged by an
alert, and every one was a guard deciding what the model's prose *means*:

| Miss | Guard | What it misread |
|---|---|---|
| "quedamos entonces para el jueves" | claim | a claim it could not see |
| plural forms | time guard | a decline |
| "but not 11:00" | time guard | a decline |
| "isn’t" (U+2019) | all three | the apostrophe |
| "Ainda não temos uma reunião marcada" | claim | a denial read as a claim |
| "se acaba de ocupar", "acaba de ocuparse", "reservado por outra pessoa" | time guard / invariant 1 | a decline |
| "rather than a viewing", "no property lined up yet for a viewing" | viewing guard | a clarification read as a claim |

None came from **extracting** something with a fixed format (times, money
amounts, the JSON reply, strings the workflow wrote), and none from the
structural checks (invariants 3, 3b, 4). Extraction converges because its
formats are finite. Reading meaning from open language does not: every phrase
added invites the next miss, and each miss either hands a lead to a person or
raises a false critical alert.

## The three changes

### 1. The workflow writes every sentence that carries a time

The slot list, the "that slot has just been taken, we still have …" sentence,
and the booking confirmation line are rendered by the workflow from the slots
it holds, with fixed per-language templates (en, pt, es), exactly as the race
note and the retired-booking note already are. The model is told not to write
any time; it writes the prose around a placeholder, and AfterBooking assembles
the text that is sent.

- The **time guard** becomes pure extraction: no time may appear outside the
  rendered text. Offered, declined, and all their phrase lists disappear from
  the decision.
- **Invariant 1** follows it.
- The **booking-stated guard** is no longer needed: the confirmation line is
  rendered from the event that was actually created.
- **Cost to the reader:** the time-bearing sentence reads the same way every
  time. That is acceptable: it is the part a lead acts on, and it is exactly
  where a varied phrasing has hurt.

### 2. The model declares what it claims, and that is checked against what the workflow did

New structured fields in the model's JSON reply:

- `states_booking`: `none` | `new` | `existing`. Checked against
  `booking_result` (`created` / `duplicate_replay`) and the verified held
  booking.
- `appointment_kind`: `meeting` | `viewing`. Checked against the workflow's
  own kind (a viewing needs an identified property).

The claim guard, the viewing guard and **invariant 2** decide on these fields.
`needs_human` and `wants_booking` already work this way; this extends the
pattern.

### 3. Prose checks become the second line, except in the dangerous direction

A prose list that disagrees with the declared fields gets **one retry with the
reason, then the reply is sent with a warning event**, never a handoff.

**Except, per the operator (22 Sep): the dangerous direction keeps rejecting.**
That means:

- a claimed booking with no event behind it (declared, or caught by the prose
  claim list);
- a claimed viewing with no identified property (declared, or caught by the
  prose viewing list).

These keep today's path: reject, one guard retry, then a handoff. The prose
lists stay, limited to their affirmative, high-precision patterns, because
catching a model that *declares* `none` while writing "you're booked" is the
reason they exist.

## Guard by guard

| Check | Today | After |
|---|---|---|
| Time guard | Extracts times; decides offered/declined by phrase lists | Extraction only: no time outside the rendered text |
| Invariant 1 | Reuses the time guard | Same as the time guard |
| Booking-stated guard | Time + day must appear in the reply | Removed: the confirmation line is rendered |
| Claim guard | Phrase list | `states_booking` vs what the workflow did; the prose list as a second line that **still rejects** |
| Invariant 2 | Reuses the claim guard | Declared field vs the event; prose list as a second signal |
| Viewing guard | Word list with the 22 Sep exemptions | `appointment_kind` vs the workflow's kind; the prose list **still rejects** an affirmative viewing with no property |
| Name check, invariant 5 | Extraction (direct address, money) | Unchanged |
| Language check | Statistical detector | Unchanged |
| Garbled or empty reply | Structural | Unchanged |
| Slot matching (the lead's words) | Reads the lead's prose, leans towards not booking | Unchanged, optionally books only when the matcher and a slot the model returns agree (a later step) |
| Invariants 3, 3b, 4, 6 | Structural or our own strings | Unchanged; they are the backstop for a model that declares wrongly |

## Effort

| Piece | Work | Estimate |
|---|---|---|
| Rendered time sentences | a `src/render_times.js` with templates in three languages; prompt change; assembly in AfterBooking; the disclosure prefix still applied to the assembled text; tests per language and per shape | 1.5 to 2 days |
| Declared fields | prompt and schema; ParseClaude checks; invariant 2 on the fields | 1 day |
| Prose as a second line | the disagreement path (retry, then send with a warning), with the dangerous-direction exception; its tests and sabotage | 0.5 day |
| Measurement | every captured text (the 538-text fixture and the execution corpus) replayed against the new checks; false alarms and misses counted | 0.5 day |
| **Build total** | | **about 4 working days** |

**Prompt suites:** this is a prompt-shaped change, so every suite in
`tests/prompt_suites.py` runs against the new prompt, compared with the 12 Sep
baseline scores, before the gate. Budget one full run, plus a re-run after any
prompt fix it forces.

**The gate:** the booking test (10 sequential and 4 races) and the 20-run deploy
gate, from the start. A new gate case is also owed for the templates: each
language through an offer, a decline of a taken slot and a confirmation. About
half a day of wall time, mostly waiting.

## Where it goes in the build order

1. fd90df4, the phrase-list patch: through the gate and deployed before the
   Thursday/Friday demos.
2. The /onboarding rebuild (cockpit): already queued, independent of the
   Concierge, and can run alongside.
3. **This plan: the next Concierge piece of work, and before any real client**
   (a real client's leads are the first whose misses would be seen by someone
   other than us).
4. Then the Concierge blockers already listed in
   `docs/phase-1-completion.md`.

Until it lands, every new miss is still fixed the old way: verbatim into the
fixture, a narrow pattern, the sabotage cycle and the gate. The 538-text
fixture (`tests/fixtures/lead_texts_2026-09-22.json`) becomes this plan's
acceptance corpus.
