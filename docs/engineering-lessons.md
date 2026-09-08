# Engineering lessons

Ways of thinking that outlived the component that taught them. This file is
deliberately *not* the runbook: the runbook tells you how to operate this
system, and it becomes wrong when the system changes. What is here should still
be true after the Concierge, n8n and Supabase have all been replaced.

Append to it. An entry earns its place by having cost real time at least once.

If you read only three things here, read **§0** — a generated message that
promises a future you have not secured — **§0b**: check-then-act cannot be
fixed by checking harder, and a nondeterministic test tells you what *can*
happen, never what *always* does — and **rule 13**: documenting a failure mode
does not control it, checking the artefact does. Then **§7**, which is the
empty-set pass again — a filter is tested by what it refuses, not by what it
returns.

---

## 0. Never let a generated message narrate a future you have not secured

**This is the most serious defect found on this project, and it sits first
because of what it costs rather than how hard it was to find.** Every other
failure in this file wasted our time. This one reaches the lead, who acts on
it — and the damage lands on the client's reputation, not ours.

Gate C2's first working version told Claude *"the slot is free and is being
booked now"*, then created the event after the reply was written. The create
failed on an invalid id, and the lead was sent:

> "Ficou confirmado! A sua visita está marcada para quinta-feira, 10 de
> setembro, às 10:00."

There was no appointment. This is the worst output the product can produce —
worse than inventing a time, because the lead *acts on it* and turns up to an
empty office.

Two fixes, and the second is the one that generalises:

1. **Order the work so the model is told what happened, not what is about to.**
   The confirmation is matched and the slot re-checked *before* the model call,
   so by the time Claude writes, the outcome is known. This also keeps the
   booking turn at one model call.
2. **Keep a retraction path for the gap you cannot close.** Something can still
   fail between the decision and the create. So `AfterBooking` detects
   "promised but failed", **discards the model's reply**, and escalates. A
   generated message is not committed until the thing it describes is true.

> **Any time a generated message contains a promise about the near future —
> *"is being booked"*, *"will be sent"*, *"has been reserved"*, *"I've applied
> that"* — there must be a path that throws the message away if the future does
> not arrive.**

The rule is about generated text, not about calendars. It applies to any
message committed before the thing it describes is true, whoever writes it.
Two questions catch it every time:

- **What does this message assert, and is it true yet at the moment we send?**
- **If the step it describes fails after the text exists, what un-sends it?**
  If the answer is "nothing", the order of operations is wrong.

---

---

## 0b. Check-then-act cannot be fixed by checking harder

Gate C3 guarded against double-booking by re-checking free/busy immediately
before creating the calendar event. The re-check was placed as late as
possible, with nothing between it and the write.

It still double-booked. Two leads confirmed the same slot 0.4s apart, both
re-checks completed before either create, and two real events were written to a
real agent's calendar with both leads told "confirmed".

> **There is no window small enough that two concurrent actors cannot both
> observe "free".** Shrinking the gap between the check and the act reduces the
> probability and changes nothing about the possibility.

The fix is not a better check. It is to let something **arbitrate** — a unique
constraint, a lock, or a provider-side conflict — and arbitration belongs in
the system that owns the resource. Here the calendar event id was changed from
lead-keyed to **slot-keyed**, so two leads booking the same time generate the
same id and Google rejects the second with `409`. Google cannot double-book
itself.

A database unique index was the alternative and was rejected for a specific
reason worth remembering: it arbitrates in a system that does *not* own the
calendar, leaving a window between claiming the row and the calendar accepting
the write — the same bug, one layer up.

### The corollary about testing

The race test that found this is the same one that "passed" the day before. It
is a good test. It ran **once**, one lead was blocked, and that was reported as
proof.

> A test with a nondeterministic outcome tells you what **can** happen, never
> what **always** happens. One green run of a race proves the good interleaving
> exists — which was never in doubt.

Repeat nondeterministic tests and **state the number of runs**. The cost here
was running an existing script a few more times; the cost of not doing it was
two prospects arriving at the same viewing.

---

## 0c. A confirmation names two things. §0 only secured one of them.

§0 is about the appointment existing. This is about the appointment being *of
something*, and it took four months to notice because the code was correct.

On 2026-09-05 a real lead asked for a T3 in Cascais. The Concierge answered
exactly as designed — it has no inventory, so it said a colleague would confirm
what was available. The lead then asked to visit on Friday. The workflow read
the real calendar, offered two genuinely free slots, matched the confirmation
against what it had stored, created the event, and notified the agent. Every
mechanism in §0 worked. And the lead was sent:

> "A sua visita está confirmada para sexta-feira, dia 11 de setembro, às 10:00."

**There was no property.** Not one had been named by the lead, by an agent, or
by the Concierge — which could not have named one, because it has no listings.
It booked a viewing of nothing, and the lead would have found that out standing
outside a building nobody had chosen.

### The spec was correct and the code implemented it correctly

Phase 1 said: *create the calendar event with the lead's name and phone*. The
build did precisely that. Nothing in the specification said a property had to
exist first, so nothing in the code checked, and no reviewer reading the code
against the spec could have found it. **A specification that gives an action's
mechanics without its preconditions is implemented exactly and is still wrong.**

That is the part worth carrying: when a spec describes *how* to do something,
ask what has to be true before doing it is honest. The answer is usually absent,
and its absence looks like completeness.

### Where the wrongness actually lived

The word *viewing* was hardcoded in three places and derived in none:

- the prompt section was headed BOOKING A VIEWING;
- the calendar summary was `'Viewing: ' + who`, so the agent read it too;
- the event row said `Viewing booked for ...`, so the cockpit repeated it.

Nobody decided to claim a property. Everybody assumed one. **An assumption
spelled into a string literal is indistinguishable from a decision, and it
survives every review that checks the code against the intent.**

### The fix, and why the truthful version was available all along

Unless a specific property has been named, the appointment is a **first meeting
with an agent** and is described as one everywhere. That is normal in this
market and, unlike *visita*, it is true. The honest description was never a
downgrade — it was simply never written down.

Three properties it has to have, all of them borrowed from §0:

1. **The workflow decides, the model phrases.** Asking the model "was a property
   discussed?" would make the guard depend on the judgement it exists to distrust.
2. **The model's own words are not evidence.** It has no inventory, so a
   reference in its reply is one it invented. Only an inbound message or a human
   agent's reply counts. Without this the guard authorises itself one layer down.
3. **Every unknown resolves to the safe side.** A missing field, an
   unattributable message, an unrecognised phrasing — all of them mean *meeting*.
   Under-describing a real viewing costs one human message. Inventing a property
   cannot be taken back, because the lead has already been told.

`appointmentKind !== 'viewing'` rather than `=== 'meeting'` is that third
property written as an operator: when the field goes missing the guard stays on.
Guards written the other way round stop running silently, which is how this
class of defect returns without an announcement.

---

## 1. Tests that pass while testing the wrong thing

**This has now bitten the project fifteen times in fifteen different disguises.** It
is the single most useful thing in this file.

| # | Incident | What reported success | What was actually true |
|---|---|---|---|
| 1 | `restore.sh` loaded the dump without `ON_ERROR_STOP` | Script printed "Restore complete." and started n8n | Every statement had failed. n8n was starting against an **empty database** |
| 2 | Nightly backup during a Supabase pause | Exit 0, fresh dump, clean push to GitHub | The database holding every lead was **offline and unreachable** |
| 3 | Migration `0003` unique-index test (1 Sep 2026) | Duplicate rejected, `ON CONFLICT` worked, all green | The test wrote the index predicate **by hand in raw SQL**. PostgREST — the actual caller — emits `ON CONFLICT (client_id, phone)` with no predicate and fails `42P10` against a partial index |
| 4 | Schema comparison during the restore drill | `columns: IDENTICAL`, `indexes: IDENTICAL` | **Both sides had errored to empty.** Shell quoting had mangled the SQL, and comparing two empty result sets reports a perfect match |
| 5 | n8n workflow deployed via CLI (2 Sep 2026) | `active=true` in the database, and the boot log said `Activated workflow "inbound_concierge_whatsapp"` | **No webhook was registered and every request 404'd.** n8n 2.28 also requires `publish:workflow`; without it activation aborts for *every* workflow, silently taking the Supabase keepalive down too |
| 6 | Run logging after the Twilio send (2 Sep 2026) | Execution status `success`, reply delivered to the lead | **No `automation_runs` row was ever written.** A node read `$input` while sitting after an HTTP node, so `client_automation_id` was `undefined`, the insert failed a NOT NULL constraint, and `neverError` swallowed the 4xx |
| 8 | Keepalive push alert, first verification (3 Sep 2026) | Twin execution `error`, and the only node that throws sits *downstream* of the notify — so the notify "must" have run | **The notify never ran.** An upstream node threw: `neverError` covers non-2xx *responses*, not transport errors, and the twin's host did not resolve. The alert was blind to precisely the failure it exists to catch — a Supabase auto-pause removes the DNS record |
| 7 | Gate B2's headline proof — four-message conversation, budget and timeline survived an unrelated message (3 Sep 2026) | Green: fields present, `changed=0`, gate passes | **The rule under test was never exercised.** Claude re-states budget/timeline/area from history every turn (0/6 runs returned null), so the fields survived because the *model* re-supplied them, not because the no-backwards rule protected them |
| 9 | The `AVAILABLE_SLOTS` language suite (4 Sep 2026) | A red result: 1 English-in/Portuguese-out leak in 12, read as a live defect in the shipping Concierge | **The suite was prompting a weaker system than production.** It read the slot block from a hand-maintained `available_slots_block.example.txt`, which had fallen one sentence behind the node — the missing sentence being the "translate weekday and month names" instruction added precisely to stop that leak. The failure belonged to the copy, not to the product |
| 10 | `AfterBooking` deciding whether the event was created, by checking whether its input *looked like* an HTTP response (4 Sep 2026) | Execution succeeded; the persist step then died on a null slot | **A skipped booking was being read as a created one.** `AfterLead` spreads `upsertStatus`/`statusCode` from an earlier HTTP call all the way down the chain, so the "did CreateEvent run?" sniff was true on *every* turn. Fixed by labelling each branch explicitly (`SkipBooking` / `BlockedBooking` / `CreatedBooking`) instead of inferring it |
| 11 | The never-invent-a-time probe suite, throughout C1 and C2 (4 Sep 2026) | **18/18**, every run, including the run taken as C2's acceptance evidence | **The shipping Concierge was inventing times.** Asked about "sabado dia 12" while the supplied list covered the 5th and the 7th, it replied "tenho as 14:00 ou as 15:00" — two times nobody supplied. Every case in the suite asked about a day the list *covered*, so the one combination that fails was the one combination absent. Found by a sweep that compared the **reply** against the supplied slots; the sweep's own first version checked only the stored slots and passed 12/12 while the reply was wrong |
| 12 | `LabelRejected`, the node that marks health-check executions (4 Sep 2026) | Node ran, execution `success`, health check green | **Nothing was written.** `operation` was `set`; the node's only valid value is `save`, and an invalid one silently hides `dataToSave` through `displayOptions` — so the node executes, does nothing, and reports success. Caught by querying `execution_metadata` and finding zero rows, not by reading the run |
| 13 | The keepalive's new email alert, first drill (4 Sep 2026) | Three failure executions, `EmailKeepaliveFailure` ran in every one, node status `success` | **Zero emails were sent.** The credential had its *header name* set to `Ryvo Resend` instead of `Authorization`, so every request was rejected before leaving n8n: `Header name must be a valid HTTP token`. `onError: continueRegularOutput` — added at B3 so a transport error could not kill the workflow — turned each rejection into a green node with a passthrough item. The tell was `executionTime: 17ms`: too fast to have been an HTTP call |
| 14 | Gate C3's double-booking race, accepted as proven (4 Sep 2026) | Two leads confirmed the same slot 0.4s apart; one booked, the other was blocked by the re-check with `slot_taken_since_offer`. Reported as the guard working | **The race is not closed, and the same test proved it the next day: run again, BOTH leads booked.** Two distinct Google events at 07 Sep 11:00, both leads told "confirmed". The re-check narrows the window to the few hundred milliseconds between checking and creating; it does not eliminate it. The first run passed on a favourable interleaving, and one favourable interleaving was generalised into a property |
| 15 | The D5 drills, both findings (5 Sep 2026) | Anthropic broken: every run `status='success'`. Supabase unreachable: execution `success`, and the lead treated as an unknown recipient | **Both times the system already knew and nothing acted on what it knew.** `FlattenClient` had always set `errorType: 'platform_db_unreachable'`, with the reasoning spelled out in a comment, and no downstream node ever read it — so a total database outage silently dropped every lead. The escalation path likewise recorded *that* it escalated but never *why*, so an outage and a busy day of leads asking for a human were the same row |

### One caught before it shipped

Google's free/busy endpoint returns **HTTP 200 with an empty `busy` list** for a
calendar it cannot read — the error sits in a `calendars[id].errors` array that
a naive reader never looks at. A wrong calendar id is therefore byte-identical
to a completely free calendar, and would have made the Concierge offer every
slot in the window as available.

Nothing broke: it was found on 2026-09-03 by deliberately probing the endpoint
with a bad id *before* writing the consumer, precisely because this table
predicts that an empty result and a failed result look alike. `readFreeBusy()`
now requires a 2xx, the calendar key present, and no `errors` array before it
will treat an empty `busy` as "free".

The pattern is becoming predictive rather than only retrospective, which is the
point of keeping the table.

### #6 happened again, unchanged, three days later

The `viewing.booked` event silently stopped being written at C2. Same mechanism
exactly: the insert sent a top-level `lead_id`, `events` has no such column,
PostgREST returned `PGRST204`, and `neverError` turned the 4xx into a success.
The node ran. The execution was green. No row existed.

**Knowing the pattern did not prevent it.** It is written down, it is the most
cited entry in this file, and it still recurred verbatim in a fresh node three
days later. That is worth saying plainly, because it is easy to mistake having
documented a failure mode for having controlled it.

What caught it — both times — was **checking the artefact rather than the
execution status**: querying the `events` table instead of reading a green
execution. That habit is the control. The write-up is only what tells you which
artefact to go and look at.

So the rule is mechanical rather than attentional: **any node whose whole
purpose is to write a row must have its status surfaced**, and `PrepRunAI` now
carries `viewing_event_status` for exactly this reason.

### #15: detection without a consumer is not detection

Both D5 findings had the same shape, and it is a shape worth naming: **the
condition was computed, correctly, and then discarded.**

`FlattenClient` distinguished "we do not serve this number" from "the platform
database is down" from Checkpoint A onward. It set an explicit
`platform_db_unreachable` error type. A comment beside it explained why
conflating the two would silently drop real leads during an outage. And the
only consumer, `IsClientKnown`, tested a different field — so both cases took
the same branch and the concern the comment described happened anyway.

> A value that nothing reads is not a safeguard, it is a note-to-self with
> better syntax. **Every computed failure signal needs a consumer, and the
> consumer is the thing to test.**

The practical check is cheap: for each error type, status flag or `ok: false`
the code can produce, ask *which node branches on this?* If the answer is
"none", the detection does not exist yet — however carefully it was written.

### #14: one passing run of a race is not evidence the race is closed

C3's race test is genuinely good — two real leads, real calendar, 0.4s apart.
It ran once, one lead was blocked, and that was reported as proof. Running the
identical test the next day produced a **double booking**: both re-checks
completed before either create, so both saw a free slot.

Nothing changed between the runs except scheduling luck.

> A test with a nondeterministic outcome tells you what *can* happen, never
> what *always* happens. A single green run of a race proves the good
> interleaving exists — which was never in doubt.

Two things follow, and the second is the real fix:

- **Repeat nondeterministic tests.** Once is an anecdote. The cost here was one
  extra run of a script that already existed.
- **Check-then-act cannot be fixed by checking harder.** Moving the re-check
  closer to the create shrinks the window; it cannot close it, because there is
  no window size at which two concurrent actors cannot both observe "free".
  Only something that *arbitrates* closes it — a unique constraint, a lock, or
  a provider-side conflict. This is §6 in its sharpest form: prefer the boring
  mechanism the platform already arbitrates.

### #13: the fix for one failure mode created another

`onError: continueRegularOutput` exists because of #8 — a transport error threw
and took the alert down with the thing it was alerting about. It works. It also
converts *"the request was rejected"* into *"here is an item, carry on"*, which
is indistinguishable from success unless somebody looks at the response.

So the setting is not wrong, it is **incomplete**. It has to be paired:

> Any node whose purpose is to *deliver* something must have its response
> asserted downstream. `continueRegularOutput` keeps the workflow alive; it
> does not tell you the delivery happened. Those are different jobs and they
> need different nodes.

`AfterNotify` already did this for Twilio, which is why the Twilio leg's
failures have always been visible. The two new email nodes did not, so the
first thing the new alert channel did was fail silently — the exact
class of problem it was built to remove.

Both now assert: the keepalive **throws** with the provider's message (it is
already failing, and a louder failure costs nothing), and the Concierge
**records** `email_alert_ok` in the run payload without throwing, because the
lead has already been handed off and the escalation still has to be written.
One is queryable, which matters more than either being loud.

### #11 is #4's shape again, and it reached a real lead

§4 says two green suites can share a blind spot. #11 is the same thing inside a
*single* suite: every case asked about a day the slot list covered, so "what if
the lead asks about a day that is not on the list" belonged to no case at all.
The suite was not weak — it was complete over the wrong space.

The tell was available and unread: **18/18, every run, for two gates.** A probe
that never varies is measuring one point, not a property.

Two things followed, and only one of them is a test:

- The root cause was a parser gap — `extractPreferredDate` had no "dia 12", so
  a request for the 12th resolved to the next Saturday and the model was handed
  slots for a day it had not been asked about. It invented the rest.
- **§9.10 is now a deterministic guard**, not a prompt instruction with a probe
  behind it: `ParseClaude` rejects any reply naming a time absent from the
  supplied list, and routes into the existing guard-retry. This is the standing
  ruling applied — when prompt wording cannot hold a line reliably, replace it
  with a check.

The guard is unit-tested against the exact reply that shipped, because *"the
bug is gone"* is not evidence that *"the net catches it"* — the defect and its
guard have to be demonstrated separately.

**And the new probe case is not the control — the guard is.** Suite 3c, added
to cover exactly this combination, scores **9/9**: asked about a day the list
does not cover, the model declines to invent a time. The live defect happened
anyway. So the failure rate is low but not zero, and a suite that passes 9/9 on
a defect that has *already occurred in production* is a reminder of what a probe
can and cannot tell you:

> A probe measures how often the model behaves. A guard determines what the
> system is allowed to send. For a rule that must never break, only the second
> one is a control.

Suite 3c stays because it will catch a regression that raises the rate. It is
not why the rule now holds.

### #9 runs the pattern backwards, which is why it nearly cost a day

Every other row is a test reporting **success** over a broken thing. #9 is a
test reporting **failure** over a working one, and the instinct it triggers is
worse: a red suite invites you to go and change the product. The prompt was
about to be reinforced against a leak the shipping prompt already handled.

What separated it from a real defect was a habit, not a new idea — before
acting on the result, print what the test actually sent and diff it against
what production sends. They differed by one sentence, and that sentence was the
fix for exactly the failure being reported.

So the rule generalises past its usual direction:

> A test result — green **or** red — is only as trustworthy as the evidence
> that the test fed the system the same input the real caller feeds it.

The structural fix is the one worth copying: the suite no longer holds a copy
of the prompt fragment at all. It renders it out of the shipping node
(`tests/render_slots_block.py`) and **raises** if it cannot, because a fallback
to a stale copy is the exact failure being designed out.

### #7 is the subtlest, because the feature worked

The no-backwards rule was correct, shipped, and did nothing during its own
acceptance test. Its input never contained the null it exists to reject. A test
can exercise the right *interface*, produce the right *outcome*, and still not
touch the mechanism it claims to prove.

Two things separated a real proof from a green one:

- **Ask what the input to the mechanism actually was**, not just what came out.
  Probing the model directly showed 0/6 nulls — the rule's trigger condition
  never occurred.
- **Force the condition.** The rule was then tested by running the shipping
  source with the null case injected: 10/10, including the case where six
  populated fields and a stage regression were all correctly refused.

It also revealed *when* the rule is actually load-bearing, which the natural
test could never show: not when the model forgets mid-window, but when the
conversation outgrows the 20-message history limit and the turn that carried the
budget falls out of the window entirely. At that point the model *cannot*
re-state it, and the rule is the only thing standing between a known budget and
a silent null.

### The clearest statement of it is #3

The migration-`0003` case is the sharpest because the test was not sloppy — it
was careful, it was specific, and it was green for the right-looking reason. It
just exercised a path that PostgREST never takes. n8n calls PostgREST. PostgREST
cannot restate an index predicate. So the one operation the index existed to
enable was the one operation never tested.

> **A test that exercises a path the real caller never takes proves nothing,
> however green it looks.**

The fix (`0004`) was to make the indexes non-partial — which is also *simpler*,
because a plain unique index already treats NULLs as distinct. The partial
predicate bought identical semantics and broke the upsert. That is a second,
quieter lesson: when the test finally exercises the real path, it often reveals
that the clever version was never buying anything.

### Rules that fall out of this

1. **Verify against the path the real caller takes**, not one constructed to
   make the check convenient. If your test and your caller speak to the system
   through different interfaces, you have tested the interface, not the system.
2. **Prefer checks that fail loudly over logs that pass quietly.** A workflow
   returning `{ok: false}` looks identical to a healthy one in a list of
   executions. Throw.
3. **When something reports success, ask what it would look like if the
   underlying thing had failed.** If the answer is "the same", the check is
   worthless. This is the fastest way to spot #1, #2 and #4 before they cost
   anything.
4. **Health signals must be independent of the thing they monitor.** The backup
   log could not see Supabase, so it stayed green through a 25-day outage. The
   keepalive alarm must not depend on the Twilio sandbox, whose session dies
   every 3 days.
5. **A safety mechanism that can only be tested destructively will never be
   tested.** `restore.sh` sat unexercised for months because the only way to run
   it was to destroy production. Build the drill mode first; an untested restore
   is not a backup.
6. **Guard against the empty-set pass.** #4 slipped through because "no
   differences" and "no data" are indistinguishable in a naive diff. Assert the
   row count is what you expect *before* concluding the comparison passed.
7. **When a system reports its own health, prefer the number over the
   adjective.** In #5 a boolean said `active=true` and a log line said
   `Activated workflow` — both adjectives, both false. The only thing that
   differed between the broken and working states was a *count*:
   `Processed N draft workflows, M published workflows`. Adjectives are written
   once by an optimist; counts are computed each time.
   **Then verify the number means what you assume** — `M=1` has since been seen
   with two workflows demonstrably running, so the count is a smoke alarm, not
   a certificate. The only thing that actually settles it is behaviour: a
   registered webhook that returns 403, and an execution *row*.
8. **A warning you have not yet been burned by is invisible.** The n8n CLI
   printed `Please use: publish:workflow --id=...` at Checkpoint A, in the
   normal output, at the exact moment it mattered. It was read past, because
   nothing had failed yet. Warnings are only legible in hindsight — so when a
   tool volunteers an instruction you did not ask for, treat it as a finding
   and act on it or write down why not.
9. **"Handles errors" usually means *some* errors.** n8n's `neverError`
   suppresses non-2xx responses and nothing else; DNS failures, refused
   connections and timeouts still throw. Whenever a setting claims to absorb
   failure, ask *which* failures — then check the one your system actually
   suffers. Ours was DNS, because an auto-paused Supabase project loses its
   DNS record, so the guard covered every case except the real one.
10. **"Only X throws, so X ran" is not evidence.** #8 was diagnosed by that
   inference and it was wrong — an upstream node threw. An execution's failure
   tells you it failed, not *where*. Check which node failed before reasoning
   from it; the answer is in the execution data.
11. **Read the evidence before cleaning up.** #8 took two attempts because the
   first run's execution rows were deleted during teardown before anyone had
   looked at them. Teardown is the last step, not a step that runs alongside
   inspection — and a throwaway artefact is worth nothing compared to the one
   diagnostic it carries.
12. **A red result is a claim too, and it needs the same provenance check as a
   green one.** Three retractions in this project now came from failures, not
   passes: the language leak that belonged to a stale prompt copy (#9), the
   inventory "regression" that was the judge grading against a rule the product
   was never given, and the deploy-durability alarm below.

   Red is the more dangerous direction, and the reason is asymmetric:

   > A green result invites you to **stop**. A red result invites you to
   > **change the product** — which costs more, and can install a real defect
   > while removing an imaginary one.

   A passing test that is wrong wastes the coverage you thought you had. A
   failing test that is wrong spends effort *and* moves working code. So the
   burden of proof on a failure is higher, not lower. Before acting on one:

   - **Print what the test actually sent**, and diff it against what the real
     caller sends. Twice now they differed by a single sentence.
   - **Ask what the product was told to do.** If the reply is executing its
     instruction verbatim, the disagreement is between the test and the spec —
     fix that, not the model.
   - **Alarming conclusions need more evidence, not less.** The deploy alarm
     was built from a table whose *name* fit the theory; one `grep` of the
     function that supposedly writes it would have killed the claim before it
     was written down. Urgency is the moment the bar should go up.
13. **A string-replace patch that half-applies is worse than one that fails.**
   Twice on 2026-09-04 an edit script made one of two related changes — the
   anchor for the declaration did not match, the anchor for the *use* did — and
   shipped `ea is not defined`, breaking every escalation until the next
   message. Two-line indent differences are enough to do it. **Assert every
   replacement** (`assert old in s`), and syntax-check the result before
   deploying: both incidents would have been caught by the `node --check` pass
   that already existed and was skipped because the edit "was small".
14. **Documenting a failure mode does not control it; checking the artefact
   does.** #6 recurred unchanged three days after being written up as the most
   cited entry here. Both times it was caught by querying the table, never by
   reading the execution status. Ask "what row, file or calendar entry should
   now exist?" and go and look at it — a green run is not evidence that it does.
15. **Never let a test hold its own copy of something the product also holds.**
   Two copies of a prompt fragment, a schema or a config will diverge, and the
   test will keep reporting confidently from the stale one. Render it from the
   shipping artefact, and make the renderer *raise* rather than fall back — a
   fallback to the stale copy reinstates the defect silently.
16. **A positional reference survives only until someone inserts a node.**
   `NotifyKeepaliveFailure` read `$json.statusCode` to report the ping's
   result. Inserting the email nodes upstream silently repointed `$json` at the
   *email provider's* response, so the alert said "keepalive FAILED (200)" —
   quoting the status of the thing that worked. Reference the node you mean
   (`$('PingSupabase')`), always. This is the same root cause as rule 17, and
   it does not announce itself: the expression stays valid and starts lying.
17. **A `dig` from one machine is a cache reading, not a fact about DNS.**
   Minutes after two duplicate records were removed, the server still returned
   both stale pairs with 550s of TTL remaining, while the authoritative
   nameservers and `1.1.1.1` both showed the corrected singles. Reported as-is
   it would have been a confident claim that the fix had not landed. When
   checking whether a DNS change is live, query the authoritative server
   (`dig +norecurse @ns1...`) or a public resolver — and build monitoring the
   same way, or the check alarms on staleness rather than on the fault.
18. **After an HTTP node, `$input` is a response envelope, not your data.** #6's
   node read `$input.first().json` expecting the accumulated item and got
   `{statusCode, headers, body}`. Every field it wanted was `undefined`. When a
   node follows an HTTP call, reference the upstream node explicitly
   (`$('AfterSend')`), and be suspicious of `neverError`: it converts a 4xx
   into a silent success, which is the entire failure mode of this section.

---

## 1c. A wrong invocation that produces a valid-looking config

`cd infra && docker compose up -d` is the natural thing to type and it took the
public endpoint down for several minutes on 2026-09-04.

Compose resolves `${VAR}` from a `.env` sitting **next to the compose file**.
This project's `.env` is at the repo root, so run from `infra/` every variable
became an empty string. The result was not an error — it was a *valid* config
for a host called `n8n.`, which Caddy correctly refused a certificate for and
then restart-looped on.

Three things made it worse than it needed to be:

- **The correct invocation was nowhere in the docs.** It had been typed
  correctly once, at provisioning, and never written down. An invariant that
  lives only in someone's shell history is not an invariant.
- **Compose warned, and the warning was truncated away.** It prints
  `WARN The "DOMAIN" variable is not set. Defaulting to a blank string.` — and
  the command piped through `| tail -4` to keep the output tidy. Rule 8 again,
  self-inflicted: *a warning you have not yet been burned by is invisible*, and
  trimming output is an excellent way to guarantee it stays that way.
- **An empty substitution is silent by default.** Compose is happy to build a
  config from blanks.

The fix is two layers, because documentation alone would have failed the same
way it already had:

1. `infra/scripts/compose.sh` — always passes `--env-file`, and is the only
   supported way to run the stack.
2. `${DOMAIN:?...}` in the compose file itself, so the wrong invocation **fails
   immediately with an instruction** instead of producing a plausible wrong
   config. Applied to `N8N_ENCRYPTION_KEY` too, where an empty value would make
   every stored credential undecryptable — a far quieter and worse outcome than
   a restart loop.

> Prefer a config that refuses to start over one that starts wrong. A crash
> loop is a bad afternoon; a silently-empty encryption key is a bad quarter.

---

## 2. The same pattern, applied to documentation

§1 is about tests that pass while testing the wrong thing. The identical failure
happens with *sources*: a confident, specific, well-formatted claim that is
simply out of date. It reads exactly like a correct one.

**2026-09-02.** The Sonnet 5 cost baseline was published at $3/$15 per MTok,
citing an introductory rate "expiring 2026-08-31". That expiry was cancelled on
2026-08-10 and $2/$10 made permanent — announced in an edit to Anthropic's own
launch post. The stale line survives in third-party pricing pages and in at
least one cached reference table, which is what got read. The cost baseline was
wrong by ~50%, and it was wrong in the confident direction: a specific number,
a specific date, a plausible mechanism.

The tell was available and ignored: **the claim was that a price would change
two days ago.** Anything asserting a recent change is exactly what a cached
source gets wrong, because the cache predates the change.

Rules:

1. **Check the authoritative source, not the convenient one.** A cached table,
   a summary, or a skill file is a starting point, never the citation. For
   prices, limits, deprecations, and dates: read the vendor's own current page.
2. **Recency is a red flag, not a reassurance.** A source describing something
   that changed recently — or is about to — is the most likely to be stale.
3. **Distrust specificity as evidence.** "$2/MTok through 2026-08-31" feels more
   trustworthy than "about $2/MTok". It is not; it is just more precise about
   something it may have wrong.
4. **When a number will end up in a commercial or contractual document, verify
   it at the source before publishing it**, however sure it looks.

---

## 3. A test written for one property finds a defect in another

**2026-09-02.** A probe was written to check one thing: that the Concierge never
implies property stock it cannot see. Running it surfaced something unrelated
and worse — an **English** question was getting **Portuguese** replies, on five
runs out of five. Portuguese examples embedded in the system prompt to
illustrate forbidden phrasing were biasing the model's output language.

It would have shipped. The replies were fluent, correct, on-brand, and
well-behaved on the property question — and in the wrong language. Nothing about
them looked like a bug except the language, and the person who wrote the prompt
was not looking at the language.

Two things follow:

- **Look at what the check produced, not only at its verdict.** The probe's own
  assertion passed. The defect was visible in the output beside it, and only
  because the output was printed rather than reduced to pass/fail.
- **Write probes that emit evidence, not just judgements.** A harness that
  prints only "15/15 passed" would have hidden this completely. Cheap, verbose
  output is worth more than a tidy summary while a system is young.

---

## 4. Two green suites can share a blind spot

§1 is a test exercising the wrong path. §3 is a test finding a defect it wasn't
looking for. This is a third thing: **two correct suites, both passing, with a
gap between them that neither owned.**

**2026-09-03.** After the Checkpoint C prompt change, three suites ran green:
inventory 15/15, language 18/18, never-invent-a-time 18/18. An English booking
request was nonetheless answering in Portuguese, about 1 time in 12.

Neither suite was wrong:

- The **never-invent** suite graded *times*. The times were correct, so it
  passed — it had no opinion about language.
- The **language** suite graded *language*. It had no case carrying a slot list,
  because slot lists did not exist when it was written.

The defect lived in the combination: a reply that is both a booking offer and in
a particular language. Each suite owned one dimension. Nothing owned the pair.

> **A passing suite tells you about the dimension it tests, not about that
> dimension's combinations with others.**

What follows:

1. **When a prompt changes, the risk is in every feature that shares the
   output** — not just the section edited. The system prompt is one artefact
   feeding one reply; language, inventory discipline, escalation and booking all
   ride the same generated string. Editing any part can move any other.
2. **New capability means new combinations.** Adding slot lists created a
   `booking × language` cell that had never existed. Ask what pairs the change
   creates, then decide which the suites should own.
3. **Make the combination a permanent case, not a one-off check.** It was caught
   by reading output rather than by an assertion, which is luck. It is now a
   standing case in `tests/prompt_suites.py`.

It was found the same way as §3 — by looking at what the check printed rather
than at its verdict. That is now twice. Verbose probe output has earned its cost.

---

## 5. The failure you can see is rarely the failure that matters

Related to §1 but distinct, and worth stating separately.

Every incident above was *visible* in principle — the data was there to notice.
What was missing was a signal pointed at the right thing. The Supabase pause
produced a perfectly informative silence: no errors, because nothing was asking.

When adding monitoring, the question is not "will this tell me when it breaks?"
It is "what breakage would this be blind to?" Answer that one honestly and the
gap is usually obvious.

---

## 5b. An empty result is not a fact about the world, but it always gets reported as one

A query returns nothing. There are two reasons, and the system almost always
picks the wrong one — because the wrong one is the plausible one.

- Zero free slots is reported as **"that day is fully booked"**. It might mean
  the working hours never parsed.
- Zero matching listings is reported as **"nothing matches your criteria"**. It
  might mean the filter is inverted.
- Zero escalated leads is reported as **"a quiet day"**. It might mean the
  predicate is reading the wrong column.

Each of those is a claim about the world, asserted from a result that was only
ever a claim about the query. Nobody investigates, because the answer is
completely ordinary. That is what makes this expensive: it does not look like a
bug at any point.

### It shows up as a design rule, not a debugging habit

`parseWorkingHours` refuses a closing time at or before the opening time. Not
because such a config is malformed in the abstract — it is perfectly
well-formed — but because of what it would *produce*: zero slots on every day,
for ever, reported to every lead as "fully booked". The misconfiguration would
have been indistinguishable from a permanently busy agency, and it would have
survived indefinitely with everyone reassured.

**So refuse the input that can only produce a misleading empty set.** It is much
cheaper than detecting the empty set later and asking why, and it is the only
point at which the true cause is still knowable.

`computeSlots` already had the other half of this and it is worth reading as the
same lesson twice: it tracks an `eligible` count separately from `free`,
purely so that "that day is fully booked" and "that day is inside our notice
period" can be told apart. Two identical empty lists, two different sentences to
a lead, and picking the wrong one is an invented fact.

### The general form

> When a result can be empty for more than one reason, the system must either
> **know which reason** or **say that it does not**. Reporting the plausible one
> is a fabrication with good manners.

This is §7 approached from the other side. There, the rule was to prove what a
filter *excludes*, because a filter that returns the right rows may be excluding
nothing. Here it is that a filter returning *no* rows is not evidence of
anything until you know why. Both come down to the same thing: the empty set is
the least informative output a system produces and the one it is most confident
about.

---

## 1g. A handler that reports "nothing was known" is indistinguishable from its own bug

The failure handler for the Code-node gate was wired to 31 nodes, deployed, and
drilled. It fired. It correctly named the node that threw, the zone, and the
error message. And every piece of context it was supposed to gather — client,
lead, phone, the handoff note — came back `null`.

That output is **completely plausible**. A failure early in the workflow really
would know none of those things. Zone 1 exists precisely because some failures
happen before there is a lead to answer. So the handler reporting "I knew
nothing" looked like the handler working.

It was a bug, and the reason is worth keeping:

```js
$('AfterLead').first()      // undefined
$('AfterLead').first(0)     // the item
```

An item arriving on an **error output** carries `$prevNode.outputIndex = 1`, and
on n8n 2.28.3 that leaks into the default branch index for every `$()` lookup in
the receiving node. So `$('AfterLead').all()` asks AfterLead for its *output 1*
— which does not exist — and returns `[]`. Every context read in the handler was
quietly asking the wrong output. `all(0)` returns the item.

### The part that generalises

> **A diagnostic path that degrades to "no information" produces the same output
> when it is broken as when it is working correctly.**

Every other guard in this project fails loudly. This one failed into its own
legitimate empty state, which is the one failure mode nobody investigates. It
would have shipped: the branches were wired, the drill "fired", the alert
arrived. The alert would just have been useless, for ever, and nobody would have
known there was anything to fix.

The fix was not the `first(0)`. It was making the handler **say why each read
failed** instead of swallowing it:

```js
const safe = (label, fn) => {
  try { const v = fn(); if (!v) { probe.push(label + '=empty'); return null; } return v; }
  catch (e) { probe.push(label + '=' + e.message); return null; }
};
```

One drill later the handler said
`AfterLead=Cannot read properties of undefined (reading 'json')`, and the cause
was obvious. **A silent catch inside a diagnostic is a contradiction**: the whole
purpose of the node is to explain a failure, and the first thing it did was hide
one. `probe` now travels all the way into the operator's email.

### And the thing that cost the most time

Two hypotheses about this came from *reading n8n's source*, and both were wrong.
The source said a thrown node sends its input items to output 0, which would
have made the whole design useless; a real run in a throwaway container showed
the item arriving on output 1 with `{error: '<message> [line N]'}`. A second
reading said variable node names (`$(name)`) break static analysis in the task
runner; a real run showed variables work fine.

The measurement took four minutes in a disposable container with no contact with
production. The two readings took considerably longer and were both confidently
wrong. **Reading an implementation tells you what someone wrote; running it
tells you what it does.** Rule 13 again, one level down: check the artefact, and
a source file is not the artefact — the running system is.

---

## 1d. A guard that never sees its own trigger, and the test that passes for the wrong reason

**2026-09-08.** §1 #7 records a rule that did nothing during its own acceptance
test because its input never contained the null it exists to reject. This is
the same shape one level worse: the guard was *wrong*, the test *covered it*,
and the test passed anyway — because the case it used never reached the guard.

The listing parser must not read a floor area as a price. The guard skipped any
price candidate containing a size unit, and the test asserted it on
`"T3 apartamento Estoril 95m2"`.

Both were wrong, in a way that cancelled out:

- `"95m2"` never becomes a price candidate at all, so the guard was never
  reached and the assertion passed on a path that does not exist.
- The form that *does* reach it is `"320m²"` — the correct typographic one, and
  the one a Portuguese agent is more likely to type. The candidate token is
  `"320m"` with the `²` as the **next character**, so a guard inspecting only
  the token found nothing wrong and the price was read as **€320,000,000**. In
  `"Ref A-2, T4 Cascais 320 m², 1.950.000€"` it beat the real price later in the
  same sentence.

> A test that exercises a case the guard cannot see is not weak coverage. It is
> **negative** coverage: it occupies the place where the real test would go, and
> reports that the property holds.

It was found by **deleting the guard and running the suite**. Nothing failed.
That is the whole technique, and it is cheap:

> **Before believing a guard, remove it.** If no test goes red, the test does
> not test the guard — whatever its name says.

This is the same instrument as the planted leak in `no-secret-in-bundle.sh` and
the forced null in `probe-filter-excludes.ts`, pointed at a guard rather than a
check. It has now caught three things in this project that ordinary review did
not, and it costs one command.

### And a comment is a claim, so it has to be earned

The same session produced a smaller version with the same root. `statusFromText`
carried a comment saying it was *"deliberately conservative"* about ambiguous
phrases, and a test proving one case — `"no longer available"` must not read as
`available`.

Every other negation was inverted: `"not sold"` → `sold`, `"não está reservado"`
→ `reserved`, six in total. The comment described an intention; the code
implemented one special case; the test checked that one case; and the three
together read as a property being held.

> A comment asserting a property is a **claim about code you have not checked**.
> It is worth less than nothing, because it stops the next reader checking —
> and the next reader is usually you.

Where a property matters, write it as a test that enumerates the space (all
five negations, all five statuses), not as a sentence above the function.

---

## 6f. A foreign key's ON DELETE behaviour is part of the deletion's blast radius, and `set null` destroys more quietly than `cascade`

**2026-09-08.** Automation 03's import needs to be reversible, so a revert
deletes the leads it created. The obvious safety rule is "never cascade" — do
not let removing a lead take its messages with it.

That rule would have been useless here, because `messages.lead_id` is:

```sql
lead_id uuid references public.leads(id) on delete set null
```

Deleting a lead does not delete one message. It **nulls the link**. The row
count is unchanged, nothing is reported as deleted, no cascade fires — and the
conversation is now evidence with its subject erased. You are left with a
message whose text says *"I couldn't compromise on the garden"* and no way to
say who said it.

> `cascade` announces itself: rows disappear and counts move. `set null` is
> silent by construction — it is a mutation dressed as a no-op, and it is
> invisible to exactly the check you would write to guard against a cascade.

Three things generalise:

1. **Read the ON DELETE clause of every inbound foreign key before writing a
   delete.** Not the table you are deleting from — the tables that *point at*
   it. `cascade`, `set null`, `set default` and `restrict` are four different
   blast radii, and only one of them stops you.
2. **"Nothing was deleted" is not the property you want.** The property is
   "nothing was damaged". A nulled foreign key satisfies the first and violates
   the second, which is why the audit-trail rule here is written as *refuse the
   lead*, not *do not cascade*. The refusal is the only thing that actually
   works.
3. **The safe-looking behaviour was the destructive one.** `set null` reads as
   the gentle option next to `cascade` — it preserves rows. It preserves them
   the way a shredder preserves paper.

Recorded as its own entry rather than under §1 because nothing here reported
success over a failure. The mechanism is different and worse: it is a
destructive operation with no failure to report at all.

---

## 6e. "Pushed" and "deployed" are two different facts, and only one of them is visible

**2026-09-07.** The cockpit redesign was committed, pushed to `main`, and
reported as deployed. It was not live. The GitHub integration on the Vercel
project had no Root Directory set, so every build cloned the repo, ran
`next build` at the root where there is no `app/` directory, and failed in
about six seconds:

> Couldn't find any `pages` or `app` directory. Please create one under the project root

This had been happening on **every push since the project was created**. The
failures sat in the deployment list interleaved with successful CLI deploys and
read as noise. Nobody was reading them, because nothing asked anyone to: the
site kept serving the previous version perfectly the whole time.

> A failed deploy is invisible in a way a failed test is not. The test goes
> red in front of you. The deploy leaves the last good version running, which
> is the most reassuring possible outcome and the least informative one.

This is §1 in its purest form. Nothing reported a failure because nothing was
asked whether it had succeeded, and the *absence* of change is indistinguishable
from the *correctness* of what is already there. It is the same shape as the
n8n `import`-without-`publish` window in the Phase 0 notes, and the same shape
as a monitoring check with no consumer (§15).

Three things generalise:

1. **Never infer state from an action.** "I pushed" is a fact about the local
   repository. "It is live" is a fact about a server, and the only way to know
   it is to ask the server. One command, and it belongs in the runbook next to
   the deploy instruction:

   ```bash
   curl -s https://ryvo-cockpit.vercel.app/login | grep -c login__mark   # a marker only the new build has
   vercel ls                                                            # Ready vs Error
   ```

2. **Pick a marker that only the new build carries.** A 200 response proves the
   site is up, not that it is current — the old build returns 200 all day. The
   check has to name something the change introduced, which means choosing it
   deliberately at deploy time rather than hoping for one.

3. **Errors that arrive on a schedule stop being read.** Six-second failures
   next to twenty-second successes, several a day, became furniture. If a
   channel produces routine noise, it is no longer a channel. Either make the
   failure impossible or make it loud; leaving it visible-but-ignorable is the
   worst of the three.

The Root Directory was corrected the same day and pushes deploy again. The
runbook entry is `docs/phase-2-checkpoint-e-cockpit-handoff.md` §2.0a.

---

## 6d. A breakpoint written at a round number is untested by construction

**2026-09-07.** The cockpit shipped unusable on a phone twice. The second time,
the stylesheet contained this:

```css
@media (max-width: 380px) { /* ... */ }
```

It has never fired on any device anyone owns. Phones are **360px** (the common
Android width), **390px** (iPhone 12 through 15) and **430px** (Pro Max). 380
sits in the gap between two of them. The rules inside that block were correct
CSS, reviewed and shipped, and they were dead on arrival — not wrong, just
never reached.

> A number chosen because it is round is a number chosen because it is not a
> measurement. It looks like a decision and behaves like an omission.

The same file also held `@media (max-width: 900px)`, which is a real
enhancement boundary rather than a device, and worked fine. The distinction is
whether the number describes a *device* the code must survive or a *layout*
the code chooses to change. Device numbers are facts you look up; layout
numbers are yours to pick.

Three things generalise:

1. **When a constant stands for a physical thing, write the physical thing
   down.** `360 / 390 / 430` with the device names beside them is checkable by
   anyone; `380` is not, and nobody could have caught it by reading.
2. **A dead branch reports success exactly like a passing one.** This is §1
   again. Nothing failed — the block simply never executed, so nothing could
   report on it. The tell is the same question: what would this look like if it
   were broken? Identical.
3. **Verify at the values, not near them.** The mobile probe now measures at
   360, 390 and 430 rather than at "mobile", which is why a 380px rule would
   now be caught: none of the three widths would see it.

The related mechanism, since it caused every symptom that made the screens
unusable: **a flex or grid child's `min-width` defaults to `auto`**, so it
refuses to shrink below its content's min-content width, and that refusal
propagates up to `<body>`. One `white-space: nowrap` label, one fixed px grid
track, or one unbreakable string — a Twilio sid, a Google calendar id — was
enough to widen the whole page. The old stylesheet had 82 flex/grid containers
and 4 declarations of `min-width: 0`.

The fix is one rule, `* { min-width: 0 }`, and it is deliberately **not** paired
with `overflow-x: clip` on `html`/`body`. Clipping would hide the symptom and
make the probe pass unconditionally, which is §6b: a check that cannot fail is
not a check. The probe therefore plants a 2000px element and requires the
measurement to report it, so a future `overflow-x: clip` would break the
control rather than silence the alarm.

---

## 1e. The guard existed. It was written the same day. It was not applied to the second caller.

**2026-09-08.** A negation guard was written for listing status changes so that
*"not sold"* could not read as `sold`. It was tested, sabotage-verified, and
shipped.

Hours later, in the same session, the matching engine's hard-versus-preference
markers were written **without it**:

```
"O jardim não é obrigatório mas faz muita diferença para nós."
  -> HARD constraint: garden
```

The lead said a garden is **not** required. It was recorded as non-negotiable,
and every listing without one would have been excluded — showing them fewer
properties, with nothing indicating why.

Same trap, same day, different caller. Knowing the pattern did not prevent it,
which §1 already says about #6 recurring three days later. What is new here is
how short the gap was: not months, not a different person — the same person,
the same afternoon, having just written the fix.

> A rule implemented once and *applied* once is not a rule. It is a local
> repair that happens to be correct where it was made.

The fix is not vigilance. It is that both callers now import one
implementation, `src/lib/text/negation.ts`, so a third caller gets the
behaviour by construction rather than by remembering. This is the same shape as
the D3 history bug, where two code paths each did their own thing with the
message window and only one of them was right.

The mechanical question, and it is cheap: **when you write a guard, grep for
the other places that take the same kind of input.** Not "where else might this
matter" — that is a judgement and judgement is what just failed. Grep for the
shape: another regex over lead text, another comparison of a user string, another
place the same word could appear.

---

## 1f. 105/105 after a sabotage is not a result, it is a smell

**2026-09-08.** The house technique is to remove a guard and confirm a test goes
red. A sabotage was applied to the area-strength rule and the suite reported
**105 passed, 0 failed** — the same as before.

The instinct that guard was designed to serve says: *the test does not cover
this*. The truth was duller and more dangerous: **the sabotage never applied.**
A shell escape had broken, the string replacement matched nothing, and the file
was unchanged. The suite was green because the code was still correct.

Either way the number was 105/105, and the two situations are indistinguishable
from the summary line:

> **A sabotage that changes nothing and a guard that nothing tests produce the
> same green.** If removing a guard does not turn something red, the first
> question is not "which test is missing" — it is "did my edit actually land".

So a sabotage needs its own assertion, exactly like the thing it is checking:
assert the anchor matched before believing the result. `assert old in s` in the
edit script, or a `grep -c` on the modified file, and only then run the suite.
Without that, the most reliable check in this project can quietly report the
opposite of the truth.

That is rule 13 again — a string-replace patch that half-applies is worse than
one that fails — pointed at the tooling that verifies the tests rather than at
the product.

---

## 6g. A keyboard assumption, which is worse than a locale assumption

**2026-09-08.** §6c records a guard whose regex boundaries were ASCII, so it
silently stopped working in Portuguese and Spanish. This is the same family and
it is worse, because it would have failed for **every** lead in every language.

The matching engine decides whether a stated requirement is a hard constraint
or a preference — the distinction the whole automation exists for. It looks for
markers:

```js
"couldn't live without"      // U+0027, a straight apostrophe
```

**Every phone on earth autocorrects that character to U+2019 (’).** iOS and
Android both do it by default. A lead typing *"we couldn't live without a
garden"* on the device they are actually holding produces a string that does
not contain the marker, so the hard constraint is read as a preference, and the
engine goes on to show them houses with no garden.

Nothing reports it. There is no error, no empty result, no failed parse — a
constraint is quietly downgraded and the only symptom is listings the lead
would not have wanted, which nobody can see is wrong.

> A locale assumption fails for some users. A **keyboard** assumption fails for
> all of them, and it passes every test written on a laptop — where the
> developer types the straight apostrophe the source file already contains.

The test that "covered" it was written by typing the phrase into a test file.
It matched because both sides came from the same keyboard. That is the tell,
and it generalises past apostrophes:

> **When a test and the code it tests were typed by the same person on the same
> keyboard, they can agree about a character neither of them will ever receive.**

Anything a human types on a phone arrives transformed: apostrophes and quotes
become curly, hyphens become en dashes, three dots become an ellipsis, and
autocorrect capitalises. Normalise before comparing, and write at least one
fixture using the characters a phone actually emits rather than the ones a
keyboard produces.

The fix is one `.replace()` over a small set of code points. The cost of not
having it would have been the product's central feature not working for any
real lead, while the suite stayed green.

---

## 6c. A guard whose boundaries are ASCII stops guarding where it matters most

**2026-09-07.** The draft assistant must never propose a viewing time — the
workflow owns slots, and a draft has none, so *any* time it names is invented.
That rule is a guard rather than a prompt instruction, and the guard was a set
of regexes:

```js
/\b(?:às|as|at)\s+([01]?\d|2[0-3])\b/i
/\b(?:amanhã|hoje|tomorrow|mañana)\b/i
```

It let `"Tenho disponibilidade às 15 horas"` and `"Marcamos para amanhã?"`
straight through.

**`\b` in JavaScript is ASCII-only.** It treats `à`, `ã`, `ç` and `ñ` as
non-word characters, so `\bàs` demands a word character immediately before the
`à`, and `amanhã\b` demands one immediately after the `ã`. Neither is ever
there. The guard worked perfectly in English and silently did nothing in
Portuguese and Spanish — the two languages it exists for, since the product
serves Portugal and Spain.

> A guard that fails on the alphabet of the language it protects has not
> failed loudly. It has narrowed to the cases nobody needed it for, and it
> still reports success on every one of them.

The fix is Unicode-aware boundaries with the `u` flag:

```js
const B = '(?<![\\p{L}\\p{N}])', E = '(?![\\p{L}\\p{N}])'
new RegExp(B + body + E, 'iu')
```

Three things generalise past regex:

1. **Test a guard in every language it will meet**, not in the one it was
   written in. The English cases all passed from the first attempt, which is
   exactly why the failure was invisible — a suite that is 7/9 green looks like
   a suite with two edge cases, not like a guard that is off in half the world.
2. **Any character-class assumption is a locale assumption.** `\b`, `\w`,
   `[a-z]`, `.toUpperCase()`, naive length checks and `localeCompare` defaults
   all carry one. Ask which alphabet the code assumes before trusting it on
   text a human wrote.
3. This is §1 in a new disguise. The guard *reported success* — it found no
   violation — and the reason it found none was that it could not see. Same
   question as always: **what would this look like if the thing it checks were
   broken?** Identical, which is the tell.

---

## 7. A JSON null is not a SQL NULL, and the operator you pick decides which one you are testing

**2026-09-06.** The cockpit's escalation queue selected leads with

```
.not('qualification->escalated', 'is', null)
```

It looked obviously correct and it was wrong. `->` returns **jsonb**, so a lead
carrying `{"escalated": null}` yields jsonb `null` — which is *not* SQL NULL.
`IS NULL` is false, and the row survives a filter written to exclude exactly it.
`->>` returns **text**, and the text of a jsonb null *is* SQL NULL, so it
excludes both the absent key and the explicit null.

Measured through PostgREST, which is what the caller actually uses:

| lead | expected | `->` | `->>` |
|---|---|---|---|
| key absent | OUT | OUT | OUT |
| `{"escalated": null}` | OUT | **IN** | OUT |
| a real escalation | IN | IN | IN |

Nothing was visibly broken, which is the interesting part. The screen re-parsed
every row and dropped what did not look escalated, so the render was correct
while the query was not. **The defect was invisible because a second, redundant
check was masking it** — and the redundant check is exactly the sort of thing a
later tidy-up deletes as unnecessary.

Where it would have surfaced is the next checkpoint. Clearing an escalation by
writing `escalated: null` is the obvious way to hand a lead back to the AI, and
every *other* consumer of that filter — a count, a health tile, a weekly report —
would have gone on counting a handled lead for ever, with no screen showing
anything wrong.

> Whenever a query reaches into JSON, ask which of the three nullish states you
> mean — key absent, JSON null, SQL NULL — and which one your operator actually
> tests. They are three different things and the syntax barely distinguishes
> them.

### The part that generalises: prove what a filter EXCLUDES

The first test of that query passed. It compared the filter's result against a
ground truth computed independently in JavaScript and reported *"agreed on all 1
rows"*.

It was worthless. The one lead in the table **was** escalated, so the filter
returned everything — and a filter that did nothing at all would have produced
an identical pass. The query had never once been asked to leave a row out.

> A filter is not tested by the rows it returns. It is tested by the rows it
> **refuses**. Until something has been excluded, `WHERE` might as well not be
> there.

This is §1's empty-set pass (#4, rule 6) in its third costume, and the third
occurrence *in a single session* — the first two being a bundle scan that
searched zero bytes and a differential over one row. Knowing the pattern did not
prevent any of them. What caught all three was the same mechanical habit, which
is the only thing that has ever worked here:

> **Make the check fail on purpose before believing it when it passes.**

Concretely, and this is the pattern to copy for any filter added later:

- Force the condition rather than waiting for it. `probe-filter-excludes.ts`
  inserts a row for each nullish state, asserts which ones the filter returns,
  and deletes them again — because the data needed to test the query did not
  exist and was never going to.
- Assert a negative. The probe fails if the filter excluded *nothing*, whatever
  else agreed.
- Carry a positive control. `no-secret-in-bundle.sh` plants a real leak, proves
  the search finds it, removes it, and only then reports a clean result.

### And a shell footgun worth naming, because it caused one of the three

```bash
grep -rl "SENTINEL" .next/static/ && echo "the grep works"
```

This prints *"the grep works"* whether or not the string exists, when a `| head`
sits in the pipeline: the exit status belongs to the **last** command, not to
`grep`. A check that reports success by construction is worse than no check,
because it is filed as evidence. Capture the count (`grep -c`) and branch on the
number, never on the exit status of a pipeline.

---

## 6b. Fixing the test instead of the code, and the check that cries wolf

§12 of rule-13's list says a red result needs the same provenance check as a
green one. This is the failure that lives one step *past* that: you correctly
establish the test was wrong, you fix the test — and you have now quietly
lowered the bar, with a green suite to prove everything is fine.

**2026-09-06.** A check asserted that every asset the PWA serves exceeds 500
bytes, to catch the case where a proxy redirects an icon to the login page and
the app silently gets a 6-byte redirect body. It failed. The manifest was
perfectly healthy and 380 bytes, because a manifest *is* a few hundred bytes of
JSON. The fix was per-path thresholds, which is right.

But notice the shape of the moment. The cheapest edit available was to drop the
threshold, or delete the assertion, and both would have gone green. One of them
would also have removed the only thing standing between a redirected icon and
nobody noticing — which is the exact defect the check had just been written to
catch, and which had already shipped once.

> Every failing test offers two repairs: make the test right, or make the test
> quiet. They are indistinguishable in the diff and in the summary line, and
> only one of them still catches the bug.

The tell is not subtle once you look for it: **ask what the weakened check would
no longer catch, and whether that thing has ever happened.** If the answer is
"the thing I am fixing right now", stop.

### The related failure: a check nobody trusts is a check nobody has

A threshold tuned to fire on healthy input does not survive. It gets an
exception, then a wider bound, then a comment saying it is flaky, then it is
deleted or skipped — and every one of those steps is locally reasonable. Nothing
in the history records that coverage was lost, because no commit ever said
"remove this check"; a sequence of small accommodations did it.

So a false alarm is not a cosmetic problem to be tolerated. It is a slow leak in
the thing that makes the suite worth running:

- **Calibrate a bound against real healthy input before shipping it**, not
  against a guess. 500 was a guess; 380 was the fact.
- **Assert the property, not a proxy for it.** The property was "this was not
  redirected". Content type and status carry that directly; byte count was a
  stand-in that happened to be wrong at the small end.
- **When you loosen a check, say in the commit what it no longer catches.** If
  that sentence is uncomfortable to write, the loosening is the defect.

This is why the bundle check plants a real leak and the filter probe forces the
null case: a check with a demonstrated failure mode can be trusted when it
passes, and a check that has never failed on purpose is a guess with good
formatting.

---

## 6. Prefer the boring mechanism the platform already arbitrates

Dedupe was originally specified as workflow logic: look up the message id, and
insert if absent. That is correct in the single-threaded story and wrong under
retries — Twilio delivers twice, both lookups miss, both insert.

Moving the guarantee into a unique index made the race unrepresentable rather
than unlikely. The workflow attempts the insert and treats `23505` / HTTP 409 as
"already handled".

The general shape: when a correctness property can be enforced by a constraint
the database already checks atomically, put it there. Application-level checks
are advisory the moment there is more than one caller.
