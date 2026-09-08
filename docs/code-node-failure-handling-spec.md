# Gate: what the Concierge does when its own code throws

**Status: BUILT AND PROVEN, 2026-09-08.** All four drills passed, restored and
verified. See §8 for the results and the two things the drills found that this
specification did not anticipate.
**Written:** 2026-09-08, out of the `working_hours` defect.
**Owner's framing:** *"That is the D5 Supabase failure in a different place:
silence, with nothing raised."*

---

## 1. The finding

| | Code nodes | HTTP nodes |
|---|---|---|
| total | 32 | 35 |
| with an error branch | **0** | 33 |

Every external call in the Concierge is guarded. Not one line of our own code
is. A throw anywhere in a Code node ends the execution where it stands.

D5 drilled every **dependency** — Anthropic, Twilio, Supabase, Google Calendar
— and each one now degrades honestly. It did not drill **us**. This gate is the
same question asked about our own code, and the answer today is worse than any
of the four dependency answers.

### What a throw actually costs

Trace it through. `Respond200TwiML` sits at depth 3, immediately after the
signature check, so **Twilio has already been told 200 before any work
happens.** There is no retry, from anywhere, ever. A throw is final.

Then:

- the lead gets **no reply** — not even the handoff note, which is a fixed
  config string that needs neither the model nor the calendar;
- **no escalation** — `MarkLeadEscalated` is downstream of the throw;
- **no operator email** — the notify path is downstream too;
- **no `automation_runs` row.**

That last one is the part that makes it invisible rather than merely bad.

### Why the D5 catch-all cannot see it

`infra/scripts/healthcheck.sh:196` is the safety net that was supposed to cover
anything the drills did not know about:

```
automation_runs?select=error_type&status=eq.error&created_at=gte.${SINCE}
```

**`LogRun` is a leaf node.** It has no successors, and it sits at the end of
every branch — every `PrepRun*` variant feeds it last. So all **32 of 32** Code
nodes execute before any `automation_runs` row exists. A thrown Code node
writes no run at all, and a query for failed runs cannot find a run that was
never written.

The only trace is an `execution_entity` row inside n8n with `status='error'`,
and **nothing in this project reads `execution_entity`.** Verified: no script,
probe or health check references it.

So the full failure mode is: *the lead is answered by nobody, the operator is
told by nothing, and every dashboard is green.* That is the D4 lesson —
"metrics derived from the event log, never incremented" — defeated from below:
the event log has no entry to derive from.

### It is not hypothetical

`working_hours` stored as a free-text string made `computeSlots` throw inside
Luxon (`Invalid unit value NaN`). `ProposeSlots` is on the path for **every
inbound message**, not just booking ones. Any client onboarded through the form
before 2026-09-08 would have hit this on the lead's first message, every time,
in exactly the manner above. The validation gap is closed; the fragility that
turned a bad config value into total silence is not.

---

## 2. The rule this gate establishes

> **Every Code node states what it does when it throws, and the lead is never
> the one who absorbs it.**

Three properties, in priority order:

1. **The lead is answered, or a human is told within minutes.** Not both is
   acceptable, neither is not. D5's irreducible case stands: if Twilio itself is
   the casualty the lead cannot be reached, and the honest goal becomes that
   somebody knows.
2. **There is always a record.** A run row is written for a failed execution
   even when the failure happens before the point that normally writes one.
3. **Nothing false is sent.** A failure on the booking path must never leave a
   confirmation standing. `AfterBooking` already implements this for the
   non-throw case (`promisedButFailed` discards the reply and escalates); a
   throw currently bypasses it entirely.

---

## 3. The four zones, and what each must do

Zones are by **what has already happened to the lead** when the throw occurs.
That is the only thing that changes the correct response.

### Zone 1 — the lead is not yet identifiable (4 nodes)

`VerifySignature` · `Normalise` · `FlattenClient` · `ThrowDbOutage`

We do not reliably know who wrote or which client they wrote to, so there may be
no one to answer and no row to write against. But Twilio has already had its
200, so the message is gone if we drop it.

**Required:** raise to the operator by email, carrying **the raw request body
verbatim** — the same reasoning as `EmailDbOutage`, whose alert reproduces the
lead's message because the store that would hold it is what failed. Write a
`run.failed`-shaped record if the database is reachable; if it is not, the email
is the record.

`ThrowDbOutage` throws **by design** and is the one node that must keep doing
so — it exists to turn a silent success into a visible error. Its error branch
must not swallow it.

### Zone 2 — the lead is known, nothing has been sent (10 nodes)

`AfterLead` · `AfterListing` · `AfterAgentReply` · `MediaReply` ·
`ProposeSlots` · `MatchConfirmation` · `BuildClaudeRequest` · `ParseClaude` ·
`ParseGuardRetry` · `DecideEscalation`

This is where the `working_hours` defect lived and where the cost is highest:
the lead is waiting and nothing has gone out.

**Required:** fall through to the **handoff note** and escalate. The machinery
already exists and needs no model, no calendar and no free/busy — `systemMessage()`
picks a fixed config string by deterministic language detection precisely so it
still works when the model has failed. Today a throw simply cannot reach it.
Error type `internal_error:<NodeName>`.

The lead gets a warm, honest sentence and a human. That is a good outcome, and
it is one node-setting away.

### Zone 3 — the booking path, after the model has written (6 nodes)

`SkipBooking` · `ReadRecheck` · `AfterBooking` · `BlockedBooking` ·
`CreatedBooking` · `ResolveConflict`

By this point the model may already have written *"a sua visita está
confirmada"*, because it is told the outcome before it writes (§0). A throw here
is the §0 scenario with a different cause.

**Required:** never book, **discard any reply that claims a booking**, send the
`slot_taken`/`handoff` fixed string, escalate. `AfterBooking` is the node that
already knows how to do this; the gate is to make sure a throw *anywhere in the
zone* routes through that decision rather than around it.

### Zone 4 — the lead has already been answered (12 nodes)

`AfterSend` · `AfterMediaSend` · `AfterHandoff` · `AfterNotify` ·
`AfterEmailAlert` · `MergeLeadFields` · `AfterLeadUpdate` · `PrepRunAI` ·
`PrepRunDuplicate` · `PrepRunSilenced` · `PrepRunMedia` · `PrepRunEscalated`

The reply is out. What is lost is bookkeeping: the run row, updated lead fields,
events, the operator notification.

**Required:** record and continue. **Never re-send** — a retry here is a second
WhatsApp message to a lead who already has one, which is worse than the missing
row. The run row must still be written with the failure noted, because Zone 4 is
where `LogRun` lives and a throw here is exactly how the record goes missing.

---

## 4. Mechanism

**Use `onError: 'continueErrorOutput'`, not `continueRegularOutput`.**

The 33 HTTP nodes use `continueRegularOutput`, which passes the error item down
the normal output for a downstream node to notice. That is the shape of the
§1 defect already in the lessons file: *"an upstream HTTP node's `statusCode`
travelled down this chain and made a skipped booking look like a created one."*
`AfterBooking` now reads an explicit `bookingBranch` marker for that reason.

A silent error item flowing into a node that reads `$json.config` is a second
throw, or worse, a plausible-looking wrong answer. So:

- Code nodes get a **real second output**, wired to an explicit failure handler
  per zone. Failure is a branch you can see on the canvas, not a shape you have
  to detect.
- Every handler sets `errorType: 'internal_error:<NodeName>'`. The node name is
  part of the record — "something threw" is not an actionable alert.
- **No handler may call the model or the calendar.** Zone 2 and 3 handlers run
  precisely when something upstream is broken; a handler with dependencies of
  its own is not a handler.

**One structural change comes with this gate:** a failed execution must write a
run row. Either `LogRun` stops being a leaf reached only at the end, or the
failure handlers write their own. The second is likely simpler and keeps the
happy path untouched — but whichever is chosen, item 2 of the rule is not met
until a Zone 1 or Zone 2 throw produces a row the health check can see.

---

## 5. How it gets proven

Two halves, because neither alone is enough.

### 5a. A static check — total, cheap, and it is the one that lasts

A test in the repo, run inside `npm test`, that reads
`workflows/ryvoInboundConc01.json` and asserts **every** node of type
`n8n-nodes-base.code` has `onError` set and its error output connected to a
handler. It must name the offending nodes when it fails.

This is what stops the 33rd Code node shipping without one. The drills below
prove the design works; only this proves it stayed done. It is also the half
that would have caught the current state on the day it arose.

`ThrowDbOutage` is the single permitted exception and must be **named** in the
test with the reason, never skipped by a pattern.

### 5b. Behavioural drills — one per zone, on the D5 pattern

Snapshot the deployed workflow, inject `throw new Error('DRILL')` at the top of
one node, deploy, send a real message, observe, **restore from the snapshot and
verify working before touching the next** — no later result confusable with an
unrestored earlier one.

Four drills minimum, one per zone, each on a node that is genuinely on the main
path:

| Zone | Drill node | Lead must receive | Record must show | Alert |
|---|---|---|---|---|
| 1 | `Normalise` | nothing (identity unknown) | run row **or** the email is the record | email with the raw body verbatim |
| 2 | `ProposeSlots` | the handoff note, in their language | `error / internal_error:ProposeSlots` | within two health-check cycles |
| 3 | `AfterBooking` | the handoff note, **no confirmation** | `error / internal_error:AfterBooking`, no `viewing.booked` | within two cycles |
| 4 | `AfterSend` | their reply, exactly once | `error / internal_error:AfterSend` | within two cycles |

Zone 3's drill has a second assertion that matters more than the others: **check
the calendar.** No event may exist, and the lead must hold no message claiming
one. That is the §0 property, tested against a cause §0 never considered.

Zone 4's drill has its own: the lead receives **exactly one** message. Count it.

### 5c. The acceptance criterion

> After all four drills, restored: a full conversation — qualify, offer real
> slots, confirm, book — runs clean end to end, and the health check is green.

Copied deliberately from D5. The drills are worthless if the restore is not
proven, and D5's own note applies: a snapshot-restore that is not verified is
how a later drill reads an earlier drill's damage.

---

## 6. Explicitly out of scope

- **The other five workflows.** `ryvoCockpitSend01`, `ryvoCockpitDraft01`,
  `ryvoCockpitMap01`, `ryvoCockpitValidate01` and `ryvoSupaKeepAlv` have the same
  question and are not part of this gate. The cockpit ones fail in front of an
  operator who can see it, which is a different severity from failing in front of
  a lead who cannot. Worth a follow-up; not this.
- **Retrying anything.** This gate is about degrading honestly, not about
  recovering. Twilio has already had its 200; there is nothing to retry into.
- **Monitoring `execution_entity`.** Reading n8n's own execution table would
  catch these too, and is a reasonable second net. It is not a substitute: it
  tells you an execution failed, not that a lead was left waiting, and it lives
  in the system that failed.

---

## 7. Definition of done

1. All 32 Code nodes carry an error branch; `ThrowDbOutage` is the one named
   exception and still throws.
2. The static check is in `npm test` and goes red when a node's `onError` is
   removed — proven by removing one.
3. Four drills pass, each restored and verified before the next.
4. A Zone 1 and a Zone 2 throw each produce a record the existing health check
   can see, closing the `LogRun`-is-a-leaf blindness.
5. The runbook gains a table of what each zone does on failure, in the same
   form as D5's dependency table, so the two can be read together.

---

## 8. What was built, and what the drills found

### Built

Seven nodes, one convergence point. Every wireable Code node's error output goes
to `CatchInternal`, which classifies by zone and flattens everything downstream
needs, then:

```
CatchInternal → LogInternalFailure → NeedsLeadReply ┬ true  → SendInternalHandoff
                (automation_runs)                    │         → StoreInternalHandoff
                                                     │         → MarkInternalEscalated ┐
                                                     └ false ──────────────────────────┴→ EmailInternalFailure
```

**31 of 33 Code nodes are wired.** Two are named exceptions with reasons, in the
test rather than in a pattern: `ThrowDbOutage` (throws deliberately; catching it
would undo D5) and `CatchInternal` (nothing catches the catcher — its whole body
is one try/catch whose recovery block only builds a literal).

### The drills

Each: snapshot → inject `throw` → deploy → send a real message → observe →
restore from the golden snapshot → verify. Never two sabotages live at once.

| Zone | Node | Lead received | Record | Alert |
|---|---|---|---|---|
| 2 | `ProposeSlots` | the handoff note, in Portuguese, `status=sent` | `error / internal_error:ProposeSlots`, zone 2, `replied=true` | email sent |
| 3 | `AfterBooking` | the handoff note — **no confirmation** | `error / internal_error:AfterBooking`, no `viewing.booked`, no booking in `qualification` | email carrying the slot warning and the event id to check |
| 4 | `AfterSend` | their reply, and **no second message** | `error / internal_error:AfterSend`, `replied=false` | email reproducing the unrecorded reply |
| 1 | `Normalise` | nothing — no client, so no configured note to send | **no run row possible** (`client_automation_id` is NOT NULL); insert returns 400 | email sent, carrying the raw inbound message verbatim |

**The health check now sees three of the four.** Before this gate it saw none of
the 32. Zone 1 remains structurally invisible to it — with no resolved client
there is no legal `automation_runs` row and no legal `events` row, because both
carry a NOT NULL foreign key. Relaxing that constraint to gain visibility would
weaken a real guarantee; the email is the record, exactly as D5 concluded for
the database-outage case.

**Acceptance, after all four, restored:** a full conversation — qualify, offer
real slots, confirm, book — ran clean end to end, `viewing.booked` written,
three consecutive `success` runs.

### What the drills found that this document did not anticipate

**1. Three nodes sit between a send and its store.** `AfterSend`,
`AfterMediaSend` and `AfterHandoff` each run after the message has gone to the
lead and before it is written to `messages`. If one throws, the lead has been
answered and the record does not know it — so `LoadHistory` feeds the model a
conversation in which the assistant never spoke, and the next reply is composed
as if it had not. That is the D3 `LoadHistory` defect reached from a new
direction.

The handler reproduces the exact text in the alert, with its Twilio sid, for the
same reason `EmailDbOutage` reproduces the inbound message: it exists nowhere
else. **It deliberately does not write the row itself — see §9.**

**2. `$()` inherits the error branch's output index.** Documented as
`engineering-lessons.md` §1g. The first working version of the handler returned
all-nulls for every context field, which is exactly what a legitimate early
failure looks like — it would have shipped and been useless for ever. Every
lookup in `CatchInternal` now names its branch explicitly, and every read
records *why* it failed into a `probe` field that travels to the alert.

### Still open

- **The other five workflows.** Unchanged; still out of scope, still worth a
  follow-up.
- **Monitoring `execution_entity`.** Would give Zone 1 visibility inside n8n,
  but it lives in the system that failed.

(The post-send question is closed — §9.)

---

## 9. Decided: the handler does not write the missing message row

**Decision, 2026-09-08. This is settled, not pending.** It is recorded here and
in `src/catch_internal.js` because it looks like an obvious improvement and is
not one.

When `AfterSend`, `AfterMediaSend` or `AfterHandoff` throws, the reply has
reached the lead and `messages` never learns it. The handler *could* write the
row — it holds the Twilio sid and the body from the send node's response. It
does not.

`messages` has exactly one writer per path. A second writer racing the first can
duplicate a turn. The tiebreaker is not which failure is more likely; it is
**where each one lands**:

| | what happens | who can act on it |
|---|---|---|
| **duplicated turn** | the lead is sent something twice | nobody — it has reached the prospect and cannot be taken back |
| **missing turn** | the model composes the next reply as if it had not spoken | a human, immediately: the alert reproduces the exact text and the sid |

> **Prefer the failure that lands where someone can act on it.**

A missing turn is a real defect with a real cost — it is the D3 `LoadHistory`
shape, and the next reply will read oddly to the lead. But it is *recoverable by
a person who has been told*, and the alert tells them, in full. A duplicate
message is unrecoverable the moment it is sent, which is the same reasoning that
makes Zone 4 forbid re-sending at all.

If this is ever revisited, the thing to change is not the handler. It is to
remove the gap entirely by making the send and the store one operation, so there
is no window for a node to throw between them.
