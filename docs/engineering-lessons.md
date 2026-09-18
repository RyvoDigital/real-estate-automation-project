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
does not control it, checking the artefact does. Its twin is **rule 19**:
a source file is not the artefact either — the running system is. Then **§7**, which is the
empty-set pass again — a filter is tested by what it refuses, not by what it
returns. And **§5g**, which is three findings from one week collapsed into one
rule: a check that cannot reach its subject reports exactly what a clean check
reports, and only running it and printing what it reached tells them apart.

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

19. **A source file is not the artefact. The running system is.** This is rule
   13 one level down, and it earns its place beside it. Building the Code-node
   failure gate, two questions about n8n's behaviour were answered by reading
   n8n's own source, carefully, at length. Both answers were wrong — the first
   would have made the entire design useless, and the second sent the fix in a
   direction that did not exist. A throwaway container running one four-node
   workflow settled both in about four minutes, with no contact with production.
   Reading an implementation tells you what someone wrote; running it tells you
   what it does, on the version you actually have, with the flags you actually
   set. When the answer is cheap to observe, never infer it — and a disposable
   copy of the runtime is almost always cheap.

---

## 1h. An example inside a prompt outweighs the rule wrapped around it

The language rule sits at the top of the Concierge prompt in capitals: reply
in the language of the lead's most recent message, and "some examples in these
instructions are written in Portuguese purely to illustrate a pattern; they are
NOT a signal to reply in Portuguese." Lower down, the meeting rule said: call
the appointment a meeting, "for example *uma primeira reuniao com o nosso
colega*". One example, in one language.

On 12 September the prompt suite, running for the first time in three days,
failed two English booking requests with Portuguese replies. Both replies
contained that phrase. A probe of 48 calls put numbers on it: the shipping
prompt answered 44 in English, and only 21 of 24 when an English conversation
history preceded the request, the demo's exact shape. Every failure echoed the
example. The same prompt with the example given in all three languages
answered 48 of 48.

The instruction said "do not let the example's language decide". The example
decided anyway. An example is a demonstration of the wanted output, and a
model weights a demonstration above a description of it; a caveat next to the
example does not neutralise it, and this one had been reinforced twice already
(B1, C1 -- see §4) without anyone asking whether an example was the source.

**Rules that fall out of this:**
- Any example of output in a prompt is a specimen of the output wanted, *in
  every property it has*, including the ones you did not mean. If a property
  must vary (language, tone, register), the example must vary with it or be
  written so that it cannot be copied.
- When a rule keeps needing reinforcement, look for an example that contradicts
  it before strengthening the wording again.
- A prompt suite is only evidence about the shapes it contains. The
  with-slots language cases existed, but without a history; the failure rate
  with one was three times higher.

## 1i. A rule that fixes one behaviour can make its neighbour strictly worse, and only a real conversation shows it

On 13 September two rules went into the prompt: never promise to arrange a
meeting the workflow is not booking, and make an offer once. Both fixed
what they were written for, and both passed their suites. On 14 September
a fully qualified buyer — budget, area, bedrooms, timeline, financing —
got two consecutive replies with no next step: "a colleague will follow up".
The day before, the same prompt had volunteered times at that point.

The cause was already in the prompt: times were to be offered "only if the
lead is asking", and the forward move was "one qualifying question". When the
questions run out, the handoff phrase is all that is left. The two new rules
did not create that; they made the model more literal about it. A fix in one
place tightened a neighbour that no suite measured, because no suite held a
lead with nothing left to ask.

**Rules that fall out of this:**
- After any prompt change, run a whole conversation, not only the suites.
  The suites hold the state still; a conversation moves through the states
  the rules interact in.
- When a rule says "only when X", ask what the model does when not-X and
  nothing else applies. The answer is usually the oldest phrase in the prompt.
- Prefer a stated fact to a classified situation (improvements §0.4). The fix
  here is a `QUALIFIED` line the workflow writes from the row, not a better
  sentence the model has to recognise itself in.
- A guard covers the shapes someone thought of; the model produces a
  neighbour. The booking-claim guard had "vou marcar" (future) and missed
  "marco então quinta-feira" (present tense used as a future, ordinary
  Portuguese) twice in twelve on 14 September. When a guard gains a shape in
  one language, check the same tense in the other two before shipping —
  Spanish "reservo el jueves" and English "I'm booking you in for Thursday"
  had the identical gap.

---

## 1j. A fixture that needs an exemption is telling you something, and the exemption is the finding

Logged 2026-09-18, the second time in three days.

**First time.** `dispatch.test.ts` built a send row and could not mark it `sent`:
`send_requires_permission` and `send_requires_confirmed_policy` refused it. The
fixture carried a permission and a basis but no consent event and no policy
confirmation. The fix was not to relax the constraints — it was to hang the
fixture off a **real** consent event from the ledger, which the foreign key
would have refused to invent.

**Second time.** The same file's template fixture used the approval id
`HX_FIXTURE_DISPATCH_TEST`, and the moment `recordApprovedTemplate` began
validating the Twilio Content SID shape, that fixture became a row **no
supported path could have created.** It was replaced with a real shape.

Twice is a pattern:

> **A fixture should have to satisfy every constraint a real row satisfies. The
> moment it needs an exemption, the exemption is the finding** — either the
> constraint is wrong, or the fixture is testing something that cannot happen.

### Why this is not pedantry

A fixture that bypasses a constraint is a test that runs against a database
state production can never reach. Everything it then proves is about an
imaginary system. Worse, it usually proves the *happy* path — because the
exemption was needed precisely to get past the thing that would have stopped it
— so the suite stays green while the real path is untested.

And the exemption tends to arrive as a small kindness: a nullable column filled
with a placeholder, a check disabled "only in tests", a seed script with
`ON CONFLICT DO NOTHING`. Each reads as unblocking a test rather than as
weakening one.

### The diagnostic, which is quick

When a fixture will not insert, ask **which of these is true**:

1. **The constraint is right and the fixture is wrong** — build the fixture
   properly, out of real rows. Most common, and the answer both times here.
2. **The constraint is right and the test is about an impossible state** —
   delete the test. It was testing something the system cannot do.
3. **The constraint is wrong** — a genuine finding, and the reason to look
   rather than to reach for an exemption.

The one answer never available is "add an exemption and move on", because that
converts a question into a silence.

### And it works forwards, too

A fixture built only out of real rows is a small integration test of the write
path nobody wrote: `dispatch.test.ts` now proves, incidentally and on every run,
that a consent event can be found, a template can be recorded, and a send row
satisfying all four constraints can exist at all.

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

## 4b. A green suite proves the branches it ran, and says nothing whatever about the others

§1 is a test exercising the wrong path. §4 is two suites with a gap between
them that neither owned. This is sharper than both: **three independent checks
passed a build containing a certain, unconditional crash — because not one of
them entered the branch that crashes.**

**2026-09-17.** The AI-disclosure patch put the payload block above the
embedded `src/ai_disclosure.js` in all three `PrepRun*` nodes.
`disclosurePayload()` is a function *declaration*, so it hoists and the call
resolves; it then reads `DISCLOSURE_VERSION`, a `const` still in its temporal
dead zone. The read sits on one line:

```js
if (!dec.required) return out;   // <- every run that does not disclose leaves here
out.lang = lang || null;
out.v = DISCLOSURE_VERSION;      // <- ReferenceError, every single time
```

What passed it:

| Check | Why it passed |
|---|---|
| `node --check` / `new Function(code)` | the code parses perfectly; a TDZ violation is a *runtime* error |
| `tests/lint_code_nodes.js` | every identifier is declared somewhere in the node — the problem is **order**, not existence |
| two full prompt-suite runs, 134/138 twice | the suites call the Anthropic API directly; they never execute a Code node |

And then the deploy verification passed too: webhook 403, `active=t`,
`published=t`. Every gate was green and the build was certain to throw the
first time anyone was actually disclosed to.

**It threw on exactly the branch under test.** The whole change existed to make
`required` true; `required` true was the only path that crashed. The two live
runs that disclosed correctly — banner sent, `messages.disclosure` written —
logged `internal_error:PrepRunAI` and produced no run payload, no
`ai.disclosure.sent` event and no invariant 6 verdict. The operator saw three
correct messages on his phone and nothing else. It was visible only in
`automation_runs`, and the invariants could not catch it because the run died
before reaching `AssertDelivery`.

**The lesson is not "add another check."** It is that a green suite is a
statement about the lines it executed and about nothing else, and the
*newest* branch in a change is the one least likely to have been executed by
anything. Coverage of the old paths is what a regression suite is *for*; it is
structurally the wrong instrument for the path that did not exist an hour ago.

**What follows from it:**

- **Ask which check would have entered the new branch.** If the answer is none,
  the change is untested however many suites are green. Write the case that
  enters it before deploying, not after.
- **Hoisting hides initialisation order.** A function declaration resolves from
  anywhere in the scope, so calling it early *looks* fine and fails only when
  it touches a `const` from its own block. Where several sources are eval'd
  into one node scope, position is semantics.
- **A guard that runs after the side effect cannot protect the side effect.**
  `PrepRun*` runs after the send, which is why the duty survived and only the
  evidence was lost. That is the right order for a *logging* failure and the
  wrong one to rely on for anything else.
- The permanent check that came out of it — a call into an embedded source from
  above its own embed block — is in `tests/lint_code_nodes.js`, and was proven
  red against a reconstruction of the build that shipped (§0.7).

---

---

---

## 11. A decision that does not carry its reason has thrown away the only part anyone will need

Logged 2026-09-17, from the consent gate and everything that leads into it.

A function that authorises an action is tempting to write as a boolean. It reads
well at the call site — `if (mayContact(x))` — and it destroys the reason at the
exact moment the reason was known and cheap. Nobody needs the boolean later.
Everybody needs the reason.

It bites in both directions, and the second one is the one people miss.

### A refusal must say WHICH refusal

Four functions written in the same week all started as `T | null` and all had to
be changed:

| | collapsed | became |
|---|---|---|
| a consent cell | `'opt_in' \| 'unknown'` | a claim, with the exact cell text, or `null` for *no cell at all* |
| a phone number | `string \| null` | the number and its country, or one of four named refusals |
| an opt-out | `boolean` | three verdicts, because halting and recording have different costs |
| a jurisdiction | `boolean` | eleven named reasons, each with operator wording |

Every one of those nulls meant several different things at once, and each time
the collapse would have shown a human "not allowed" with no way to find out why.
That is §5b — an empty result narrated as a fact — reappearing wherever a
decision is returned rather than a value.

### A permission must say on what BASIS

This is the half that gets forgotten, because a permission feels
self-explanatory in the moment.

> A log line reading `allowed` explains nothing to a regulator. `allowed:
> existing-customer route, Lei n.º 41/2004 art. 13.º-A, policy row confirmed
> 2026-09-20 by <the lawyer>` answers the actual question, which is never *was
> it allowed* but *on what grounds did you allow it*.

And there is a failure mode worse than a thin log. **When a permission carries a
condition, returning them separately means the caller can take the permission
and drop the condition.** Portugal's existing-customer route is available *and*
obliges the sender to maintain the art. 13.º-B lists. A verdict shaped
`{permitted: true}` with the obligation left in the policy row for someone to
remember is an obligation that will be missed — not through carelessness, but
because nothing in the permission's own shape says it exists.

So the obligation travels *inside* the verdict, attached to the basis that
triggered it:

```ts
{ permitted: true, basis: 'existing-customer route, Lei n.º 41/2004',
  listObligation: 'art. 13.º-B lists' }
```

### The general form

> Any function whose answer authorises an action returns the authorisation and
> its grounds as **one value**. A permission carries its basis and every
> obligation attached to that basis; a refusal carries which refusal it is and
> wording a human can act on. Neither is ever a bare boolean, and neither is
> ever a null.

The test that follows from it is cheap and worth writing every time: **assert
that a permission states its basis and that no refusal reason lacks an
explanation.** Both are one loop over the enumerated cases, and both fail loudly
the day someone adds a twelfth reason and forgets its wording.

---

---

## 11c. A default is a claim made on behalf of every writer who omits the field

Logged 2026-09-18, from a migration that would have broken the live Concierge.

`messages.attribution_state` says where a conversation came from: `organic`,
`campaign`, or `unknown` when the lookup failed. The first draft was **NOT NULL
with no default**, and the reasoning sounded right: *a writer cannot omit it, so
nobody inherits a claim they did not make.*

It would have rejected every inbound message on the day it was applied. The n8n
workflow inserts into that table and knows nothing about the column.

### The reusable half is how it was caught

Not by reasoning harder about the migration. By reading **the schema the
workflow writes to**, and asking what its insert looks like.

> **A migration is written against a table. It lands on every writer of that
> table, and most of them are not in front of you** — a workflow in another
> system, a scheduled job, a webhook handler, a colleague's branch, a script
> somebody runs quarterly. The table is the thing you can see; the writers are
> the thing that breaks.

The habit: before adding a NOT NULL, a check, or a foreign key, enumerate the
writers. Not "who should write this" — who *does*. `git grep` the table name,
then look outside the repository, because the ones outside are the ones that
will not fail in CI.

### And the corrected rule is better than the one it replaced

The fix was a default of `unknown`. Which looks like a retreat — the writer can
now omit the field after all — and is not, because of *which* value it inherits:

> **What matters is not that a writer cannot omit a field, but that omitting it
> yields the LOUD state rather than the quiet one.** Default to the value that
> means *"we did not look"*, and an omission becomes a question instead of an
> answer.

A row inheriting `unknown` appears on its own line in the client's report, is
excluded from every figure, and alerts. A row inheriting `organic` would have
been a silent false claim about where a person came from — and the original
"no default" rule, had it been applied to a table with no live writers, would
have felt like the stricter choice while protecting nothing extra.

### The general form

Every nullable column and every default is a sentence spoken on behalf of
absent writers. Ask what it says:

| default | what it claims about a writer who omitted it |
|---|---|
| `attribution_state = 'organic'` | "we checked, and this came from nowhere" — **a lie** |
| `attribution_state = 'unknown'` | "nobody has established this" — **true, and loud** |
| `status = 'active'` | "this thing is live" — usually a lie about half-built rows |
| `verified = false` | "not verified" — true |
| `consent_status = 'unknown'` | true, and the reason that column survived three days of scrutiny before being retired for a different fault |

Choose the value that is true of a writer who did not think about the field,
because sooner or later every field has one.

## 11b. A record that justifies a past action may join only to immutable data

Logged 2026-09-17, found by writing one row out by hand before designing the
table that would hold it.

The send record has to answer *"why did this person receive this message"*. The
obvious schema stores the ids — the consent event, the country — and joins for
the rest: the statute, who confirmed the policy, when. It is the normal,
correct-looking answer and it is wrong.

**`jurisdiction_policy` is mutable by design.** Ireland's twelve-month expiry,
Spain's segment C, the ePrivacy Regulation landing: each is an `UPDATE`, and
that is the entire reason the policy lives in data rather than in code — "one
table changes and every client is compliant tomorrow" is only true if it can
change.

So the join answers *what does the law say now*. The question asked of a record
of a past action is always *what authorised it then*. Today those two sentences
agree. In a year they do not, and the join produces the confident wrong one: a
regulator reading the record would be told the message was sent under a policy
that did not exist on the day it went out.

### The rule

> **A record that justifies a past action may join only to immutable data.
> Everything mutable must be copied at the moment it was relied upon.**

In this case: `policy_confirmed_at`, `policy_confirmed_by`, `policy_statute` and
the basis sentence are snapshots stored as text on the send row.
`consent_event_id` stays a foreign key, because `consent_events` is append-only
and cannot change underneath the record — it is the one table a join to is safe,
and it is safe for a structural reason rather than a hopeful one.

### How to tell which kind of table you have

Ask what an `UPDATE` to it means.

- If an update means **"we were wrong about this"** — a policy, a price, a
  configuration, a tax rate, a threshold, a name — then it is mutable and a
  justifying record must copy from it.
- If an update is **impossible or meaningless** — an append-only ledger, an
  immutable event log, a content-addressed blob — a join is safe.

The trap is that the mutable tables are the ones that feel most authoritative,
because they hold the current truth. That is exactly what makes them the wrong
thing to point at from a record of the past.

### And the corollary, which is the half people skip

Once copied, **the copy must be unwritable.** The gate columns on the send row
are writable on insert and never again, enforced by a trigger that allows only
the outcome columns to change. A row recording a send that should not have
happened is the only row anyone would ever be tempted to edit, and an
authorisation that can be rewritten afterwards is not an authorisation, it is a
note.

---

---

## 4e. A filter that looks like hygiene can be the thing that blinds the check

Logged 2026-09-18, caught by an operator asking who else reads a field.

The orphan sweep asks one question: **is this outbound message one of ours?** It
answers it by compiling every approved template into a shape and testing the
wire text against them.

The vocabulary is built from `message_templates`, which carries a `status` —
`approved`, `paused`, `disabled`, `rejected`. Filtering it to `approved` is the
obvious thing to write. It looks like hygiene. It reads as *"only use templates
that are actually approved"*, which sounds like care.

**It would have made every orphan under a disabled template invisible.** Meta
pauses and disables templates on its own initiative; a message sent under one it
disabled yesterday is still a message we sent, and if that template drops out of
the vocabulary then a message sent outside the gate under it stops being
recognised as ours — on the one check whose entire job is recognising exactly
that.

### The tell

> **Ask what question the check is asking, as a sentence. Then ask whether the
> filter answers that question or a different one.**

Here the two questions are one word apart and completely different:

| the check asks | the filter answers |
|---|---|
| *is this one of ours?* | *may we send this?* |

Status is the right filter for the second question. The send path absolutely
should refuse a paused template. It is the wrong filter for the first, and
nothing about the code says so — both are `where status = 'approved'`, both
look prudent, and only the sentence distinguishes them.

### The same shape elsewhere, because it is not about templates

- An **audit log** filtered to *active* users: the actions of deleted accounts
  are exactly the ones an investigation wants.
- **Error monitoring** filtered to the *current release*: old clients keep
  running, and their errors are the ones nobody sees.
- A **security scan** filtered to *production* branches: the vulnerability was
  introduced on the branch that has not merged yet.
- A **reconciliation** filtered to *open* invoices: the ones wrongly closed are
  the ones worth finding.

Every one of them narrows the data by a property that is relevant to some other
question, and every one of them reads as tidying up.

### And the structural version

Where it can be arranged, **do not give the check the field to filter on**.
`buildVocabulary` takes `Template[]` with no status on the type at all, so
there is nothing to filter by and a future edit that wants to would have to widen
the input first — which is a visible act rather than a plausible one-line
tightening. A boundary again, rather than a rule (§12).

## 4d. A check's SCOPE is part of its claim, and the scope is the part that goes unread

Logged 2026-09-17, caught by a check's own vacuity guard rather than by anyone
reading it.

`one-sender.test.ts` asserts the thing that keeps the send path honest: **at most
one file may import the message provider, read its credentials, or call its API.**
It is the cheapest and most durable of the three defences around that path,
because it is the only one a person can apply without knowing the argument.

It scanned `cockpit/src`.

So what it actually asserted was *"no other file **under cockpit/src** may
send"*, and it read as *"no other file may send"*. Nothing in the test name, the
failure message or the assertion said otherwise. A sender added to the n8n
shared modules in `src/`, to a script in `infra/`, or to the test tree would
have been invisible — and the n8n side is precisely where a bypass would be both
plausible and catastrophic, because the whole architecture decision is that n8n
never sends marketing directly.

**A widened scan was then proved by sabotage**: a `src/blast.js` doing
`require('twilio')(process.env.TWILIO_ACCOUNT_SID, …)` — an n8n module sending
directly — turned two checks red and named the file. The old scan would have
stayed green.

### What generalises

> **Any check that searches rather than executes — a grep, a lint rule, a
> dependency-cruiser config, a "no imports from X" guard — makes two claims: what
> it looks for, and where it looked. Only the first is ever written down.**

### The operational form

> **When a check asserts a property about "the system", the first question is
> what it actually walked — and the answer is almost always narrower than the
> sentence.**

Ask it of every guard you inherit, and of every one you write. Not *does this
check work*, which it usually does, but *over what*. A passing check with a
narrow scope is more dangerous than a failing one, because it is producing
evidence: somebody will cite it as the reason a property holds.

Three habits:

1. **Say the scope in the name or the failure message**, so the next reader is
   told what the check does not cover.
2. **Give the scan a positive control per root**, not a total count. A count
   stays green when an entire tree stops being visited; asserting that a known
   file in each root was seen does not. This is exactly how the defect was
   found — the §5c vacuity check disagreed with the assertion it was guarding,
   and the vacuity check was right.
3. **Sabotage it in the place you just added.** A widened scope is a claim until
   a planted violation in the new territory turns it red.

### And the exception belongs in the code

Widening turned up one legitimate caller: the Concierge workflow calls the
provider ~35 times, because it REPLIES inside the 24-hour window the lead
opened, which is not a business-initiated message and needs no gate. That
exception is now an explicit path exclusion with the reasoning beside it —
rather than a silently narrow scan that happened to exclude it by accident.
**An exception that exists on purpose can be re-examined. One that exists by
oversight cannot, because nobody knows it is there.**

## 4c. A test is not green until it is green twice, and cleanup is what hides the difference

Logged 2026-09-17, caught by running a suite a second time for an unrelated
reason.

`suppression.test.ts` wrote a fixture objection to the consent ledger, appended
a `consent_given` after it to prove rule 1 end to end, and asserted that the
fixture held only objection rows. It passed. Run again immediately, it failed:
the consent it had appended on the first run was still there, because the ledger
refuses `DELETE`.

Two defects in one, and the second is the general one:

1. **The assertion was true only of a database this test had never run against.**
   Its first run was the only run it was written for.
2. **It appended a row on every run**, so the table grew without bound. Nobody
   would have noticed for months, and every row was permanent.

### The part that generalises, and it is not about ledgers

The only reason this was visible is that the storage refuses deletion. **On an
ordinary table, the same defect hides for ever behind a cleanup step.** A test
that truncates its fixtures in `beforeEach` is not idempotent — it is *reset*,
which is a different property that happens to look identical from the outside.
The moment the cleanup is skipped, reordered, or made conditional, or the moment
a second test starts sharing the same row, the hidden non-idempotence becomes a
failure that looks like the code broke rather than the test.

> **A test that has only ever been observed to pass once has not been shown to
> work.** Run it twice before believing it. If the second run needs a cleanup to
> pass, the test depends on state it does not own, and that dependency is the
> finding.

Three habits:

1. **Run a new test twice in a row, immediately.** It costs seconds and it is
   the only cheap check for state leakage.
2. **Write fixtures write-once rather than write-always** — check, then insert.
   It makes the test idempotent by construction instead of by cleanup, and it
   works on storage that cannot be cleaned.
3. **Name a fixture after what it contains, not what you meant it to contain.**
   When the rows could not be deleted, the honest fix was to rename
   `objected` to `objectedThenConsented`, which is what the accident had made
   it — and it turned out to be exactly the fixture rule 1 needed anyway.

This is §4b from the other side. There, a green suite proved only the branches
it ran; here, a green suite proved only the *state* it ran against. Both are the
same mistake: reading a pass as a statement about the system when it was only a
statement about one execution.

---

---

## 11d. A binary question forces a lie when the truth is "I do not know"

Logged 2026-09-18, designing the one screen that asks an agency something they
may not want to answer.

The question: *your file said `sim` in a consent column for this contact — what
is behind it?* It is asked of a person, in a meeting, about a list assembled
over ten years, and the answer decides whether somebody may lawfully be
messaged. **How it is phrased decides whether it is answered honestly**, and
four separate phrasings manufacture a false yes:

| | the failure |
|---|---|
| **Blame** | *"Your file claimed consent. Can you prove it?"* invites defence, and a defensive person says *yes, of course* to make the question stop |
| **A cheap yes** | a checkbox marked *"we have consent"* costs nothing to tick |
| **An expensive no** | if *no* reads as *this contact is lost*, the answer will be *yes*. Nobody deletes four hundred contacts to be tidy |
| **No third option** | **the one that generalises** |

### The fourth, which is not about consent at all

> **A yes/no question has no room for the most common true answer, so it
> converts uncertainty into whichever of the two is socially easier.** And
> socially easier is almost always the affirmative, because the affirmative is
> the one that does not require admitting something.

For a ten-year-old contact list, *"I do not know"* is not an edge case — it is
the modal answer, and a two-option question guarantees it is recorded as
consent. The data then looks complete, every row is populated, and every
populated row that should have said *unknown* says *yes*.

**Offering the third option is not enough. It has to be first-class.** A *"not
sure"* tucked under two real buttons reads as the answer for people who are not
paying attention, and a person in a meeting, being watched, will not choose the
option that looks like inattention. So it is offered at the same weight as the
others and it is **normalised in the text**: *"resposta perfeitamente normal
numa lista com anos"*.

### And honesty has to be affordable

The third and fourth failures compound. Even with an *I do not know* option, if
*no* and *don't know* both mean *this contact is dead*, the incentive still
points at *yes*.

> **Show the cost of each answer before it is given, and make sure the honest
> answers have a route.** *"O contacto não se perde: pedimos autorização por
> outra via"* is the sentence that makes the truth affordable. Without it the
> screen is compliance theatre — a form that collects the answers it was built
> to receive.

### The general form, because this system will ask humans other things

Every question a system puts to a person is a measuring instrument, and a
badly-shaped one does not fail to measure — it returns a confident wrong number.
Before asking:

1. **Name the true answers first**, including the uncomfortable ones and the
   uncertain one, then design the options around them. Not the reverse.
2. **Ask what each answer costs the person.** If one is cheaper, expect it, and
   expect it whether or not it is true.
3. **Require specificity for the answer that carries the most weight.** *"Which
   form, which system, what date"* is much harder to invent than a tick, and if
   they can answer it, that IS the evidence.
4. **Start from your own error where there is one.** *"We recorded this as
   consent, and that was our mistake"* is true here, and it removes the thing
   being defended before the question is asked.
5. **Record the uncertain answer as an answer**, with its own name, so a later
   change is visibly a change of KNOWLEDGE rather than a change of mind.

### The related trap, in the same screen

**A pre-selected default is not a proposal.** The Enquadramento requires that
the system propose and the agency confirm; a pre-ticked radio button collects a
click rather than a decision, and the click carries the legal weight of a
declaration. Show the proposal as text, beside choices that are all unselected.

## 12. The next obvious step is often the one that breaks the property you just argued for

Logged 2026-09-17, two messages after arguing the opposite.

The consent gate's decision was deliberately written as a pure function, and the
reason was stated out loud: a view can only be tested by writing rows, so the
rules had to be callable with synthetic input and no database — that is what
lets the layer ORDER be tested exhaustively, and the order is the part most
worth proving.

Then the same file was given `import 'server-only'` and a Supabase client,
because the next thing it needed was to read two rows. Both were the obvious
next step. Together they made the pure function unimportable from a plain test,
and the suite failed on its first run with an error about Client Components that
had nothing to do with consent.

**This is not carelessness, and treating it as carelessness is why it recurs.**
The property was "this decision can be tested without infrastructure". The next
requirement was "this decision needs two rows from the database". Satisfying the
second in the same file destroys the first, and nothing about writing the import
feels like a violation — it feels like finishing the job.

### The defence has to be structural, because intention has already failed once

The fix was not "remember to keep it pure". It was to split the file and write
into the second one:

> **If a rule appears in this file, it is in the wrong file.**

That works for one reason: it is *checkable*. Anyone can look at gate-read.ts
and see whether it contains a decision, and the answer is not a matter of
judgement. Compare "keep the gate pure", which is advice — true, agreed with,
and no obstacle whatsoever to the import that broke it.

The same move appears three times in this file already: rule 13 (documenting a
failure mode does not control it — check the artefact), §9b's docs guard (a rule
that depends on remembering is not a control), and the reserved test range,
where "everyone knows those numbers are fake" became a refusal in the send gate.
Each time the pattern is identical: a property everyone agrees with, one obvious
step that destroys it, and a structural statement of the property as the only
thing that survives.

### It happens again to a property you have already FOUND and FIXED elsewhere

The second instance, the same day. A prefix table for jurisdiction was rejected
in the morning with a specific finding: `+44` is four countries and `07911` is
Guernsey, so `startsWith('+44')` would apply English law to a Guernsey resident
with no symptom. The resolver was rewritten to use libphonenumber and the
finding was written into the findings log.

Three hours later the bulk evaluator needed to pick which policy row to hand the
gate, from a map keyed by country. It picked by dialling prefix.

Not from forgetting the morning. **Picking a row from a map by prefix is the
obvious way to pick a row from a map** — the local problem presents itself as a
lookup, not as a jurisdiction question, and the defect only becomes visible when
you hold both contexts at once. Which is why:

> A property you have defended once is not defended. Each new caller, helper or
> lookup re-poses the same question in a shape where the wrong answer is the
> convenient one, and **intention is not a defence against a step that does not
> feel like a violation.**

The fix that survives is again structural rather than attentive, and again it
went in the callee rather than the caller: `decideGate` now refuses a policy row
whose country is not the one it resolved. Every future caller — including the
ones written by someone who has never read the Guernsey finding — gets a refusal
instead of a wrong permission.

### What to do about it

1. **When you state a property, ask what the next requirement will be.** If the
   honest answer is "something that would break this in this file", split the
   file now rather than after.
2. **Prefer a boundary to a rule.** A separate module, a check constraint, a
   test that fails — anything a person can evaluate without remembering the
   original argument.
3. **Suspect the step that feels like finishing.** The import that broke this
   was the last thing needed to make the gate work, which is exactly the moment
   the property was worth re-reading.

---

## 12b. A property chosen for one reason paying for an unrelated one is evidence it was the right property

Logged 2026-09-17.

`decideGate` was written as a pure function for a single, narrow reason: a view
can only be tested by writing rows, and the consent ledger refuses DELETE, so
the rules had to be callable with synthetic input and no database. That is a
*testability* argument, and testability arguments are easy to wave away when
the pure version is more awkward to write — as this one was, since it forced a
second module and an injected store.

Weeks later the bulk evaluator needed to decide three hundred contacts.
Through a gate that read the database itself, that is six hundred round trips,
or a second bulk implementation of the same rules that would drift from the
first. Through a pure one it is **two queries and three hundred function
calls**: read every consent state in one `in (…)`, read the distinct countries
in another, then decide in memory.

Nobody designed for that. The property was chosen for tests and it paid for
throughput.

### Why this is worth noticing rather than enjoying

> When a property you adopted for one reason turns out to pay for an unrelated
> one, that is evidence the property was structural rather than stylistic — and
> it is an argument you can use on the next person who asks why the awkward
> version is worth it.

It also works as a diagnostic in the other direction. A property that never pays
for anything but the reason it was adopted is often a preference wearing a
justification: "we keep this pure for testability" and nothing else ever
benefits usually means the tests could have been written differently and the
awkwardness bought nothing.

The same pattern elsewhere in this file: append-only was adopted so a
regulator's question had an answer, and it paid again by making a whole class of
test-cleanup bugs impossible to hide (§4c). Deny-by-default was adopted for
compliance, and it paid again by turning a wrong jurisdiction resolution into a
refusal instead of a wrong send.

### The caveat, which the same function supplied within the hour

Purity is not safety. A pure function takes its facts as arguments, which means
**it is only as correct as everyone who will ever look those facts up** — and it
cannot see them do it.

`decideGate` was handed a policy row by its caller and evaluated it without
checking that the row was for the country it had just resolved. Pure, total,
exhaustively tested, and one careless lookup away from authorising a send under
the wrong country's law. The tests could not have caught it: they pass the right
row, because the person writing them knows which one is right.

> **A pure function that trusts its inputs has not removed the validation, it
> has relocated it — to every call site, present and future.** Where an input is
> a looked-up fact rather than a caller's own value, the function should check
> the relationship it depends on. That is not defensive clutter; it is the
> difference between a guarantee and an assumption about colleagues.

The check is three lines and turns a caller's mistake into a refusal.

---

## 5e. "At most N" is satisfied by zero, so a check written before its subject exists is vacuous by construction

Logged 2026-09-18, on the day the thing being guarded finally appeared.

`one-sender.test.ts` asserts the property the send path rests on: **at most one
file may hold the credential that can cause a message to exist.** It was written
days before `twilio-adapter.ts` existed, ran on every commit, and passed.

Of course it passed. **Zero files satisfy "at most one".** For as long as the
slot was empty the assertion was true for a reason that had nothing to do with
the property it was written to defend, and it passed *most* convincingly exactly
when it proved *least*.

Worse than a test that never runs: a green check produces evidence. Somebody
cites it as the reason the boundary holds.

### The tell

> **Has this check ever been seen to fail for the reason it exists?** Not "has it
> failed" — a typo makes anything fail. For its reason.

An upper bound answers no by default, and keeps answering no while its subject
is missing, renamed, moved, or not yet written. It is §0.7 arriving through a
bound rather than through a missing branch: the same vacuity, wearing a number.

### The family, which is larger than it looks

Every one of these is green on an empty world:

- `at most one file imports X` — with X unused anywhere
- `no route handler lacks auth` — with no route handlers
- `every migration has a rollback` — with no migrations
- `all campaign rows have a client` — with no campaign rows
- `no user has an expired token` — after the user table was dropped

### What to do

**Pair every upper bound with an existence assertion.** The fix was two lines:
the sender must now *exist*, must hold the sending credential, and must not hold
the read one. The bound is unchanged; what changed is that it is now about a
file rather than about an absence, and the suite fails if the slot empties
again.

And where the subject genuinely does not exist yet, **say so in the test name or
message** rather than letting a green tick imply a guarantee that is years away
from meaning anything.

---

---

## 5g. A check that cannot reach its subject reports exactly what a clean check reports

Logged 2026-09-18, after the third instance in one week. This is the general
rule; §5c, §5d and §4e are three faces of it.

| | the check | what was absent | what it reported |
|---|---|---|---|
| **the address** | the orphan sweep listing provider messages | the `whatsapp:` prefix on the query | *"0 messages examined, all accounted for"* |
| **the vocabulary** | the same sweep matching bodies | any recorded template to match against | *"0 orphans"* |
| **the identifier** | the quality halt reading a sender | the column holding the Sender SID | *"quality unreadable"*, halting everything |
| **the artefact** | a deploy's four health checks | the changed file, which never reached the container | 404 → 403 → 403 → 200, all green, nothing deployed |

Three different subsystems, three different absences, one report: **nothing
wrong here.**

### The deploy instance, which is the clearest of the four

Deploy A of 18 September ran four checks and passed all of them:

```
after import    404   ← the expected window
after publish   403   ← the window closed
after restart   403
healthz         200
```

Every one confirmed the *mechanism*. The import ran, the publish restored the
active version, the restart held, the edge answered. **And the workflow served
afterwards was byte-identical to the one served before**, because the import
command read from `/dev/stdin` instead of a path inside the container and the
changed file never arrived.

Four green checks on a deploy that deployed nothing. None of them could see it,
because **none of them looks at what was deployed** — they look at whether the
deploying worked, which it did, perfectly, on no input.

What caught it was the served-version query: `position('consent_status' in
h.nodes::text)` came back `t` when the file on disk contains that string zero
times. That check reaches the *subject* — the code now being served — rather
than the mechanism that put it there.

> **A deploy's health checks confirm that deploying happened. Only reading the
> deployed artefact confirms that something was deployed.** They are different
> questions and the first one is the one everybody automates.

### Why reading the code cannot find these

**Because the code is correct.** There is no bug to spot. The query is
well-formed, the matcher works, the halt does exactly what it should with the
rating it was given. What is missing is a *value* — an address format, a set of
rows, an identifier — and a value's absence is invisible in the logic that
consumes it.

A reviewer reads the sweep and sees a sweep. A test passes, because the test
supplies the value. Only running it against the real world, **and printing what
it reached**, distinguishes *"I looked and found nothing"* from *"I could not
look"*.

> **Every check must report what it REACHED, not only what it FOUND.** "0
> orphans" is not a result. "16 messages examined against 3 templates, 0
> orphans" is. The first is a claim about the world; the second is a claim about
> the world plus the evidence that the claim was possible.

### And failing safe is not the same as failing usefully

The third instance is the one worth dwelling on, because it would have *worked*.
An unreadable quality rating halts — deliberately, and correctly. So the first
real campaign would have stopped dead with **"quality unreadable"**, which is
exactly the right direction to fail in and tells nobody anything.

The cost is not a bad outcome. It is **a morning debugging Twilio** — checking
the credential, the API version, the permissions, the sender's status in the
Console — when the answer was that no column held the identifier and no request
was ever made.

> **A safe failure with a misleading reason is the most expensive kind of safe**,
> because it spends the investigation somewhere the fault is not. Where a check
> can fail for want of a *value*, say which value, and say it before saying
> anything about the subject.

### Three habits, all cheap

1. **Print the query, the window and the size of the corpus beside the result.**
   Every dry run in this project does, and each of the three above was found by
   exactly that.
2. **Assert the identifier at startup rather than at first use.** A missing
   Sender SID should refuse to assemble a campaign, not produce an unreadable
   rating at contact one.
3. **Never let "none found" and "could not look" share a message.** They need
   different sentences, because they need different afternoons.
4. **Verify the artefact ARRIVED before acting on it.** A deploy that copies a
   file somewhere should checksum it at the far end. The step that failed above
   would have failed loudly one command earlier.

### And the fifth instance, which the fourth's own fix walked into

The habit added above — checksum the file at the far end — was used on the next
attempt, and it passed. Both sides printed the same hash. The deploy was still
wrong: **the server's checkout was seventeen commits behind, and `docker cp`
had faithfully copied the wrong file.**

```
shasum (host)      cfe4e31e…          ← the OLD file
sha256sum (in n8n) cfe4e31e…          ← the same OLD file
```

A consistency check between two copies confirms the **copy**. It cannot confirm
the **source**, and it will agree enthusiastically about the wrong one.

> **"Both sides agree" and "this is the right file" are different claims, and
> the first is the one that is easy to write.** Compare against a value known
> independently of both copies — a hash recorded when the artefact was built,
> or the content of the change itself — or the check is a tautology with a
> reassuring shape.

What actually caught it was two things neither of which is a consistency check:
a hash **given in advance** from the authoring side, and greps for the change
itself (`row.source = 'whatsapp'` → expect 1, `consent_status` → expect 0). Both
compare against an expectation rather than against another copy, which is why
they could disagree with reality.

The generalisation is uncomfortable, because self-consistency is what most
verification is made of: replicas agreeing, a cache matching its source, two
services reporting the same total, a backup restoring to an identical checksum.
Each proves the plumbing between copies and none proves the thing being copied
is the thing intended.

## 5f. A boundary crossed in both directions has a loud half and a quiet half, and the defect lives in the quiet one

Logged 2026-09-18, from the same mistake on two sides of one API.

Twilio addresses WhatsApp as `whatsapp:+351…`; every table here stores bare
E.164. The same omission on the two directions of that boundary:

```
READ    GET  Messages?From=+14155238886     200, zero messages     SILENT
WRITE   POST Messages To=+351…              error 21910            LOUD
```

The write path refuses, by documented error code, immediately. The read path
returns success and an empty list, which every consumer downstream reads as a
fact about the world — and did, for as long as it took a dry run to print the
query beside the result.

### Why this is not a coincidence

**Writes are validated by the receiver and reads are not.** A write asserts
something and the far side has every reason to check it — that is what its
error codes are for. A read asks a question, and *every* well-formed question
has an answer, including the questions you did not mean to ask. An empty result
is a perfectly good answer to a slightly wrong question.

> **Wherever data crosses a boundary in both directions, expect the outbound
> half to fail loudly and the inbound half to fail silently — and put the tests
> on the inbound half.** The loud half is tested by production; the quiet half
> is tested by nobody.

### The same shape elsewhere

- **Writing** to a queue with a bad topic errors; **reading** from a topic that
  does not exist returns no messages.
- **Inserting** with a wrong foreign key is refused; **selecting** by one
  returns no rows.
- **Publishing** to a webhook URL that 404s is visible; **filtering** an inbound
  webhook on a field that was renamed is not.
- **Setting** a feature flag that does not exist may throw; **reading** one
  returns the default, for ever.

In every pair the second is where a system quietly does nothing while reporting
that all is well.

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

---

## 5d. A query in the wrong identifier format returns SUCCESS AND NOTHING

Logged 2026-09-17, found by a dry run the evening before anything was scheduled.

Twilio addresses WhatsApp with a channel prefix — `whatsapp:+351912345678`.
Every table in this system stores bare E.164. The reconciliation reader was
built from our form:

```
From=+14155238886            200   0 message(s)
From=whatsapp:+14155238886   200   5 message(s)
```

**Both are HTTP 200.** The wrong one is not an error, not a 400, not a warning,
not something a retry or a status check would catch. It is a clean, confident,
permanently empty answer, and every consumer downstream reads an empty answer as
a fact about the world.

### It cost two subsystems at once, from one root cause, neither failing loudly

- **The orphan sweep** would have reported *"0 outbound messages examined, all
  accounted for"* every night while examining nothing — on the one check whose
  entire job is detecting a message sent outside the gate.
- **The matcher** compares the provider's `to` against our stored number, so
  every reconciled row would have gone `unresolved` for ever, and the unresolved
  count would have been read as a provider problem rather than a format one.

Neither would have thrown. Both would have looked like diligent machinery
producing reassuring numbers.

### What generalises

> **When a check queries an external system, the identifier format is part of
> the query — and a mismatched format returns success.** Type systems do not
> help: both values are strings, both are valid, and the API accepts both.

The operational rule that follows:

> **A zero from an external query must be accompanied by evidence that the query
> could have returned something.** Print the query beside the result; assert a
> known-present control; or compare against a broader query that is expected to
> be non-empty. A bare zero from a remote system is not a measurement, it is a
> question nobody asked.

This is §5b at the network boundary, and harder, because a local empty result at
least came from data you can inspect. Here the emptiness arrives from a machine
that has every reason to be trusted and is answering a question you did not mean
to ask.

### And the probe that lied about its own query

The dry run logged its parameters **as passed** rather than as sent, so the
moment the prefix was introduced at the boundary the printed query stopped
matching the real one. It read `From=+14155238886` while sending
`From=whatsapp:+14155238886`.

> **A probe that reports what it meant to ask cannot detect the class of defect
> it exists to find.** Log the values at the point they leave, after every
> transformation, or the log is a record of intention rather than of action.

It is rule 19 once more — the source is not the artefact, the running system is
— applied to a diagnostic rather than to a deploy.

### The structural fix

The prefix now lives in one boundary module, `provider-address.ts`, whose header
is the warning rather than a comment inside one function. Anything that talks to
the provider converts through it; nothing else in the repository ever sees a
prefixed address. **The next place that queries Twilio will be written by
somebody who has not read this file, and the module they must import is named
for the thing they would otherwise get wrong.**

## 5c. A remediation pass that cannot find its target reports success identically to one that had nothing to fix

Logged 2026-09-17, found before the pass was written, by running its own
targeting query against real data.

`cockpit/src/lib/import/store.ts` was writing a false consent record: a
spreadsheet cell reading `sim` became `consent_status = 'opt_in'`, and
`consent_at` was stamped with `new Date()` — the moment of import, in a field
that asserts when a person consented. The remediation was designed to find its
rows this way:

```sql
from public.import_batches b
join public.leads l on l.qualification->'imported'->>'batch_id' = b.id::text
where b.status = 'committed'
```

Read as prose that is unobjectionable: *the leads that committed imports
created*. Run against the database it returned **no rows**, while a second
query over `leads` alone found the false record sitting there.

The batch had been **reverted** 106 seconds after it committed. `revert.ts`
deletes the leads an import created *except* those that have since acquired a
message or an event — it refuses those deliberately, because deleting them
would null `messages.lead_id` and leave a conversation with its subject erased
(§6f). So one lead survived its own import's undo, still carrying the false
`opt_in`, and the pass built to correct it would have skipped every row it
existed for.

**And it would have reported success.** No error, no empty-set warning: zero
rows corrected, zero rows failed, exit clean — the exact output of a run with
genuinely nothing to do. The false record stays, the log says the remediation
ran, and the next person reads that log as evidence the problem is gone.

### Why this is worse than an ordinary empty set

§5b is about a *query* whose empty result gets narrated as a fact about the
world. This is the same shape with the stakes inverted, because a remediation
pass is run precisely once, by someone who has already decided the problem is
real, and its success is measured by there being nothing left to see. **The
evidence of the fix working and the evidence of the fix missing are the same
evidence.** Every other kind of pass gets a second opinion eventually; this one
is trusted permanently on the strength of one clean run.

### The general form

> A pass that changes data must state the population it expects **before** it
> runs, and fail — not pass quietly — when what it finds does not match.

Three rules that follow:

1. **Target the object that carries the defect, not the object that explains
   it.** The false value was on the lead. The batch was the *story* of how it
   got there, and stories go missing: reverted, deleted, superseded. Join to
   context for enrichment, never for identification.
2. **Count first, correct second, and make the count a precondition.** The
   operator ran the targeting query as a read before anything was written,
   which is the only reason this was found before it shipped. A pass whose
   count comes back different from the count that justified it should stop.
3. **A zero nobody checked is not a zero.** The operator's phrase, and it is
   the whole lesson in six words. Zero is an answer that has to be earned by a
   query proven to be able to return something.

This is also §1f — *105/105 after a sabotage is not a result, it is a smell* —
at a different altitude: a number that means "everything is fine" deserves more
suspicion than a number that means "something is broken", because nobody
investigates the first one.

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
tells you what it does.**

This is rule 13 one level down and carries the same weight, so it is **rule 19**
in its own right: check the artefact, and a source file is not the artefact —
the running system is.

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

---

## 6h. Bundle a deploy by what can be PROVED, not by what shares a window

Logged 2026-09-18, deciding what to put in one n8n deploy.

Three changes were owed to the live Concierge: stop writing a column that is no
longer authoritative, stop overwriting a lead's origin, and add an opt-out gate
that must run before the model replies. One deploy was the obvious answer — the
deploy itself carries risk (an `import` nulls `activeVersionId` and the webhook
404s until `publish`), so fewer windows is fewer exposures.

It is the wrong axis. The right question is **which of these can this deploy
show to work**:

| change | provable by this deploy? |
|---|---|
| stop writing `consent_status` | yes — read the served version's code |
| guard `source` | yes — send one message, read the row |
| opt-out gate on campaign replies | **no.** Nothing can send a campaign message yet |
| attribution of campaign replies | **no.** Same |

> **A change that cannot be exercised by the deploy that carries it is a change
> deployed on faith. Putting it next to changes that CAN be exercised makes the
> whole deploy look verified when half of it is not.**

And the cost lands later, on whoever debugs the first anomaly: four suspects
instead of two, and the two nobody could have checked are the ones they will
reach for last.

### The asymmetry that decided it here

The opt-out gate sits between a person saying *stop* and us honouring it. If it
is wrong it does not fail loudly — it silently suppresses legitimate replies, or
silently lets an objection through to the model. Of all four changes it is the
one most worth exercising and the only one that cannot be.

So it waits for a deploy that can exercise it: send a campaign message to a test
number, reply `SAIR`, confirm the objection is recorded and the model stayed
silent. That deploy is not available until a campaign can send, and the gate is
inert until then anyway — **the thing it guards does not exist, so it costs
nothing to wait and costs a class of unverifiable failures not to.**

### And the cost of splitting is small and nameable

One extra deploy window. Which is a real cost, and a much smaller one than
either half of the alternative: deploying an unexercisable change, or delaying
two one-line fixes to live data loss until the campaign work is finished.

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

---

## 7b. A constraint is proved by the cases it must LEAVE ALONE

Logged 2026-09-18, from a migration whose obvious form would have broken the one
row that must never be refused.

`0024` requires a declaration to name its author. The obvious way to write that:

```sql
-- the version that looks right
alter table public.consent_events
  alter column declared_by set not null;
```

It would have made **a contact's own opt-out unrecordable.** An `objection`
comes from the contact — nobody at the agency declares it, `declared_by` is
correctly null, and a NOT NULL on the column would refuse the single row in that
table that must always be accepted. The one we would find out about by a person
saying *stop* and the system dropping it.

The shipped version governs one kind and leaves the rest alone:

```sql
check (kind <> 'declared' or declared_by is not null)
```

### The general form

> **A constraint is not proved by the case it exists for.** That case is the one
> you had in mind while writing it, and it will pass. It is proved by the cases
> it must NOT govern — and those are the ones nobody enumerates, because they
> are not what the constraint is about.

So the verify block for `0024` has three cases, and the third is the one that
earns its place:

```
declaration with no author   → REFUSED     ← the case it exists for
declaration with an author   → accepted    ← the happy path
OBJECTION with no author     → accepted    ← the case it must leave alone
```

Without the third, a constraint that refused every objection would have passed
its own verification.

### This is §7 turned around

§7 says a filter is tested by what it **refuses**, because a filter returning
the right rows may be excluding nothing. A constraint is the mirror: it is
tested by what it **permits**, because a constraint that refuses the wrong thing
still refuses the right thing too, and a test that only tries the violation sees
a green tick either way.

### Where to look for the cases it must leave alone

Whenever a constraint applies to a table holding more than one kind of thing —
and most tables do — enumerate the kinds and try one of each:

- a check on `kind = 'X'` → try every other kind
- a NOT NULL on a column some rows legitimately lack → try those rows
- a foreign key → try the rows where the reference is genuinely absent
- a uniqueness constraint → try the duplicates that are real events

The ledger is a single table holding eight event kinds, which is exactly the
shape where a constraint written for one of them quietly governs all eight.

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

## 8. Every defect on 2026-09-11 was a belief that had stopped being true

Recorded by the operator after the rehearsal-defect pass, for later work — no
action now.

None of the day's defects was broken logic. Each was the system **holding or
presenting a belief that had stopped being true**:

- an escalation flag that outlived the human's handling of it;
- a booking object that outlived the calendar event (and the slot);
- a stage of `viewing_booked` that outlived the booking;
- handoff notes and a human's cockpit replies presented to the model as its
  own words, so it inherited promises it never made;
- and finally an **absence never stated** — the workflow knew a booking was
  gone, told the model once, and then said nothing on later turns, so the model
  refilled the gap from its own earlier confirmation.

Every fix had the same shape too: verify the belief at the moment it is about
to be acted on (the hand-back stamp, `VerifyBooking`, the transcript labels,
the no-booking note each turn), and record the verification where a person can
see it.

**Where testing should aim next: state transitions, not message variety.** The
prompt suites vary the *message*; none of them moved the *state* underneath a
conversation. The cases that found today's defects are all transitions:

- a booking is cancelled in the calendar after it was confirmed;
- a slot passes;
- a lead is handed back, and messages again;
- an escalation is resolved by a reply rather than by the button;
- a config value changes under a live lead (calendar id, handoff note,
  working hours).

A suite built on those would replay a conversation, change one fact underneath
it, and assert what the next turn says — the mirror of `prompt_suites.py`,
which holds the state still and varies the words.

### 8b. Not properly closed: the cockpit's "the lead was told" is an inference

Logged 2026-09-12, at the operator's request, while rewording the display.

When a booking is retired the lead page now says *"The lead was sent a note
saying it is no longer in the diary…"*. That sentence is **derived from the
code path** — the retired-booking note is a fixed string sent on every
cancelled/missing retirement since the fix landed — not from evidence that the
message went. It replaced a claim that was false the other way ("has not been
told why"), so it is less wrong, but it is the same defect class as the rest
of §8: a display asserting a belief instead of reading a fact.

**The proper close:** derive it from a `messages` row with `origin = 'handoff'`
and `status = 'sent'`, written for that lead after the `viewing.retired`
event — and say "no note was sent" when there is none. That is a small change
to `getViewing()` in the cockpit; it is recorded here rather than made now
because the retired-note send status is not yet joined to the retirement
event, and doing it by timestamp proximity would be another inference.

### 8c. A new member of the family: the system acting for the lead without telling them

Logged 2026-09-13, at the operator's request.

On 12 September at 23:46 the lead asked *"What should I bring to the first
meeting?"* and the workflow created a calendar event for Monday 09:00. The
confirmation matcher read "first" as "the first slot"; the offer from 35
minutes earlier was still on the row; one ordinal was enough. The reply
answered about documents and never mentioned a booking. The calendar knew.
The lead did not. The agent would have found out on Monday. On the next
message, *"Is Tuesday still available?"*, the model, correctly told a
booking existed, escalated it as a change request.

Every earlier member of §8 was a belief that had stopped being true. This one
is an **action taken on the lead's behalf that the lead was never told
about** — the same family, because the reply asserted a world (nothing
booked) that the workflow had just made false, but a new member, because
nothing stale was involved. Three rules came out of it:

- **A question is not an acceptance.** The matcher confirms nothing from a
  message that ends in "?" or opens with an interrogative unless it also says
  yes. *"Is Tuesday still available?"* with one Tuesday on offer would have
  booked it.
- **A booking made this turn is stated in the reply, or it is not made.**
  `ParseClaude` checks the draft names the slot's time and day; one targeted
  retry; then the booking is withheld with a `booking.withheld` warning.
  Even a perfect matcher leaves this gap, and this rule closes it.
- **Our own phrasing becomes a booking trigger.** *"Uma primeira reunião com
  o nosso colega"* is what every reply calls the appointment, in three
  languages, since Checkpoint C. Leads say it back. **Any deterministic
  matcher that reads lead text must be checked against the phrases our own
  replies put in their mouths** — list the nouns the prompt teaches and make
  sure none of them is also a trigger word. The ordinal rule now refuses an
  ordinal followed by the appointment's own name.

Persist-then-send (improvements §3.10) is still the structural close for the
family; this member would not have needed a special rule under it, because a
reply drafted after the write would have been drafted knowing the event existed.

---

## 10. Two clocks collapsed into one column, and the impossible timestamp that proved it

Logged 2026-09-17, found in a dry run rather than in the source.

`leads.consent_at` was written by the importer as `new Date()` — the moment of
upload — in a field that every reader, including a supervisory authority, takes
to mean *when this person consented*. The argument that this is wrong can be
made from the source code, and it was. But the proof was in the row:

```
leads.consent_at    2026-09-08T12:25:37.265Z
batch committed_at  2026-09-08T12:25:37.375Z   (+110ms)
leads.created_at    2026-09-08T12:25:37.376Z   (+111ms)
```

**The consent timestamp precedes the creation of the record it describes.** The
field asserts that Maria Santos consented 111 milliseconds before our record of
Maria Santos existed — because `new Date()` fired while the row objects were
being built in memory, ahead of the insert that created her.

### Why one column was always going to produce this

The world has two clocks and they answer different questions:

- **`occurred_at`** — when the act happened. The person ticked the box, replied,
  said yes.
- **`recorded_at`** — when we came to know it. The import ran, the webhook
  fired, the operator typed it in.

A system that keeps one column writes it with whichever clock is to hand at the
moment of writing — always the second, because the first is usually unknown —
and then reads it as the first, because that is what the column is named for.
Nothing in the code looks wrong at either end. The write is a sensible
`new Date()`. The read is a sensible interpretation of the field name. **The
defect exists only in the gap between them, which is exactly where nobody
looks.**

### What generalises

> When a timestamp can be produced by more than one clock, name the clock in the
> column. `created_at` and `updated_at` are safe because they can only mean the
> record. Anything describing an event in the world needs both, and the one that
> is unknown must be allowed to be null rather than filled with the one that is
> to hand.

And the habit that found it, which is the transferable part:

> **Look for orderings in the data that cannot be true.** A child timestamp
> before its parent's. A "last seen" before a "first seen". A confirmation
> before the thing confirmed. These are free to check, they need no knowledge of
> the code, and they are the one class of evidence nobody can argue with — it is
> the same move as §0.1 and rule 19, verifying the artefact rather than the
> source, applied to time.

Worth noticing where it surfaced: not in a review of the source, but in the
**dry run** of the pass built to correct the defect, printing real rows before
writing any. A dry run that prints what it would do is not only a safety
measure; it is the cheapest read of production data you will ever get, and it
routinely knows more than the design it is testing.

## 9. A 2xx from the alert provider is not the alert arriving, and the channel that looks fine can be the one that is lying

Logged 2026-09-16, at the operator's request, from the first live firing of the
error workflow (improvements §3.7, Layer 1).

The probe threw on purpose. The handler delivered on three channels and
recorded three status codes: email `200`, WhatsApp `201`, event row `201`.
Every check was green, the handler's own delivery assertion passed, and by any
measure inside the system the alert had worked.

The WhatsApp said:

> Ryvo run error
> ryvo_error_probe
> node: ThrowOnPurpose
> **55.836Z) [line 2]**

n8n hands a Code node's thrown error with `message` cut to the text after the
last colon. The message contained an ISO timestamp, so the last colon was
inside `11:10:55.836Z` and what survived was its tail. The first line of the
`stack` still carried the sentence whole.

**The part that matters is which channel showed it.** The email was *correct on
the same run*, because it prints the stack trace underneath the message and the
sentence was there. So:

- checking the email alone would have confirmed the alert worked
- the three 2xx codes would have been quoted as proof
- and the channel actually read at 3am would have been the useless one

**This is §0.1 turned on the alerting itself: verify what arrived, not that the
send succeeded.** An alert path is a feature like any other, and "the provider
accepted it" is the same class of claim as "the row was written" or "the reply
was sent" — a statement about the call, not about the outcome. The runbook has
said since D1 that *acceptance is not delivery* and that both inboxes must be
confirmed by eye; this extends it. **Read the text of every channel, on every
channel, at least once.** Two channels carrying the same event are two chances
to be wrong independently, and the one that is wrong will be the one whose
formatting you never looked at.

Three rules:

1. **Prove an alert by reading it, not by counting status codes.** A delivery
   assertion that checks `2xx` is worth having — it catches the silent
   credential failure — but it cannot see content, and content is the whole
   product of an alert.
2. **Never build an alert line out of a provider's `message` field alone.**
   Error objects are reshaped by every layer they cross. Take the longest
   faithful source available and say where it came from.
3. **A message with a colon in it is a message with a truncation hazard in
   it.** Timestamps, URLs and `key: value` prefixes all carry one.

And the corollary the operator named, which is why the email's opening line is
written the way it is: **an alert should lead with the consequence, not the
cause.** "No run row and no handoff came out of it: whatever this run was doing
for a lead did not happen, and nobody was told except by this message" is what
a person needs at 3am. The stack trace can wait until they are at a keyboard.

---

## 9c. A guard proved against one role is not a guard proved

Logged 2026-09-17, from the consent ledger's two layers.

`consent_events` is append-only, enforced twice: a trigger that raises on
`UPDATE`/`DELETE`/`TRUNCATE`, and `revoke update, delete` from `service_role`.
Both were proved, and the interesting part is that **each proof came back
different, and neither would have established the other.**

In the Supabase SQL editor, which runs as the table's owner:

```
ERROR: P0001: consent_events is append-only: UPDATE refused.
CONTEXT: PL/pgSQL function consent_events_append_only() line 3 at RAISE
```

Through the `service_role` key, which is the path the cockpit actually takes:

```
UPDATE → 42501 permission denied for table consent_events
DELETE → 42501 permission denied for table consent_events
```

The owner is a role the `revoke` does not touch, so that session reached the
trigger and stopped there. The application's key never reaches the trigger at
all, because the privilege check refuses it first. **Two roles, two mechanisms,
two different errors, and only one of them is exercised on any given path.**

### Why one proof would have been a false negative

Had we only run the owner test, we would know the trigger fires and would have
learned nothing about whether the application's key can write — and the revoke
is the layer that matters for every write the product actually makes. Had we
only run the `service_role` test, a `42501` proves the grant is missing and says
*nothing* about the trigger, so the day someone re-grants `UPDATE` — or 0002's
`ALTER DEFAULT PRIVILEGES` quietly does it for a table created later — the
guarantee would rest entirely on a trigger nobody had ever seen fire.

Worse, a `42501` is exactly what you would also get from a table that was never
created properly, a schema-cache miss, or a key with the wrong role. **A generic
permission error is weak evidence.** The trigger's own message is strong
evidence, because nothing else in the system produces that sentence.

### The general form

> A guard with more than one enforcement layer must be proved **once per layer,
> through the role and the path that layer governs.** A single green result tells
> you which layer you happened to reach first, not that the guard holds.

Practically, for anything protected both by a database privilege and by
application or trigger logic:

1. **Test as the privileged role** to prove the in-database logic fires, since
   the privilege check would otherwise mask it forever.
2. **Test as the application's role** to prove the privilege actually landed,
   since the logic would otherwise mask that.
3. **Read the error text, not just the failure.** `42501` and `P0001` mean
   different things, and a test that asserts only "it failed" cannot tell a
   working guard from a missing table.

This is §9 at a different altitude — there, a 2xx from the alert provider was
not the alert arriving; here, a refusal from one role is not the refusal the
next caller will meet.

## 9b. Committing a hunk without writing it to the working tree, and the plain `git add` that silently reverted four of them

Logged 2026-09-16, found while recording the heartbeat drill.

The operator had uncommitted edits in `docs/improvements-and-opportunities.md`
throughout a long session. To commit my own additions to the same file without
taking theirs, I built the file's content from `git show HEAD:<path>`, wrote it
to a scratch file, hashed it with `git hash-object -w` and staged it with
`git update-index --cacheinfo`. That is a correct way to stage a subset of a
file, and it worked: each commit contained exactly my paragraph and none of
theirs.

**The working tree never received those paragraphs.** So after four such
commits the index and HEAD held them and the file on disk did not — a
divergence nothing reported, because `git status` showed the file as modified
either way, which is what it had been showing all session.

Then one later commit added the same file the ordinary way, `git add <path>`.
That staged the working tree's version, which was the operator's edits on top
of a base that had never contained mine. **Four paragraphs were deleted in a
commit whose message described adding something else** — the Layer 1 and
Layer 3 status entries, the §3.10 sequencing correction the operator had
explicitly asked for, and the §3.11 invariants entry.

Nothing failed. The commit succeeded, the push succeeded, the diff was never
read line by line, and the loss surfaced only because a later edit's anchor
text could not be found.

**What generalises.** This is rule 19 again — the source file is not the
artefact, the running system is — turned around: *the index is not the working
tree either, and a deliberate divergence between them is a trap armed for the
next ordinary command.* The technique is not wrong; leaving it in place is.

Three rules:

1. **Do not leave the index ahead of the working tree.** If a hunk is worth
   committing, write it to the file as well, in the same step. Stage the subset
   for the commit, then restore the file to contain everything.
2. **`git add <path>` after any surgical staging is a revert.** Treat it as
   one. Diff `HEAD:<path>` against the working tree before staging it whole.
3. **Prefer not to co-edit a file the operator is holding open.** The honest
   alternatives are to ask them to commit first, or to write to a different
   file and merge later. Both cost a message; this cost four paragraphs and
   only luck exposed it.

And a verification rule with teeth: **`git log -S"<a distinctive phrase>"` on a
paragraph you believe you wrote is a two-second check that it is still there.**
It is the same move as checking the artefact rather than the source, and it is
what finally found this.

**The check is now a script, because a rule that depends on remembering is not
a control (rule 13).** `./tests/docs_guard.sh` answers one question — *would
committing right now delete anything from a doc?* — by diffing the working
tree against both the index and HEAD and printing every line that would go.
It exits 1 when there is anything to see. The one-liner underneath it, if the
script is ever not to hand:

```bash
git diff HEAD -- docs/ | grep -E '^-[^-]'     # anything printed is about to be lost
```

Proven by reconstructing the failure: stage a paragraph, delete it from the
file, run the guard, watch it name the paragraph. A guard that has never been
shown to fire has not been shown to work (§0.7).

**And the operating rule the operator set, which removes the need for the
trick entirely: never stage content without also writing it to the working
tree on a file they are holding edits in. Ask them to commit theirs first.
That costs one message and has no failure mode.**

## 13. A fallback is an assertion, so decide what it asserts

Found in the segmentation screen on 18 September 2026, in the read that builds
the one question the screen exists to ask:

```ts
claims.set(phone, (e.wording as string) ?? ev?.claimed_consent?.raw ?? 'sim')
```

`wording` is null whenever the imported cell was NOT RETAINED — which is the
normal case for everything imported before the September fix, because
`import_batches.staged` is cleared on commit. The ledger design says so in as
many words: *`wording = null` means NOT RETAINED, never invented.*

So the `?? 'sim'` did not fill in a display default. It **manufactured
evidence**, and then rendered it inside guillemets, under the heading *"o seu
ficheiro dizia «sim»"*, on a screen designed to be turned around in front of the
agency whose file it claimed to be quoting. The one screen whose persuasive
force comes entirely from quoting their file accurately was the screen inventing
the quotation.

### The distinction that matters, because not all fallbacks are this

Two lines further down the same file:

```ts
state: states.get(phone) ?? 'undetermined',
existingCustomer: p?.existing_customer ?? 'unknown',
```

Both are fine, and the difference is not subtlety — it is direction:

| Fallback | Asserts | Failure mode |
|---|---|---|
| `?? 'undetermined'`, `?? 'unknown'` | **we do not know** | loud; refuses; costs a question |
| `?? 'sim'`, `?? 'yes'`, `?? true`, `?? now()` | **we know, and here it is** | silent; permits; costs the record |

A fallback to the loud state is an admission. A fallback to a *value the domain
treats as evidence* is a lie the code tells on your behalf, every time the
absence occurs, without a log line. **In any regulatory record, a recorded gap
beats an invented value — always, and not by a small margin.** The gap costs a
conversation. The invention costs the document's standing as a record, including
for every row that was accurate.

Checklist when writing `??` or `COALESCE` in a path that produces a record:
if the right-hand side is something you would be willing to **quote, testify
to, or act on**, it does not belong there. Return null and make the caller say
"we did not keep it".

### It had three symptoms and only one cause

The same hardcoded «sim» had spread into places that looked unrelated:

1. `heading: 'O seu ficheiro dizia «sim»…'` — a *constant* quoting a file no
   reader had opened. Wrong for a file that said `y`, wrong for a mixed group.
2. The radio `<legend>` reused that same question, so a group **with no claim at
   all** was asked what lay behind a «sim» that never existed.
3. `contacts.filter((c) => c.claimRaw !== null)` as the has-a-claim test — so
   once the fallback was removed, the honest `null` made the hard question
   **disappear for exactly the contacts it exists to ask about**.

(3) is the one to remember: removing an invention exposes every place that was
silently depending on it. Deleting the fabrication is half the fix; the other
half is finding what had been leaning on it. The repair was to split the fact in
two — `hasClaim` (is there a claim?) and `claimRaw` (what did it say?) — because
they are different questions and only one of them is always answerable.

### The guard, since the file talks to a database and no unit test reaches it

A line-level scan, in the same suite:

```ts
src.split('\n').filter((l) => /wording|claimRaw|claimed_consent/.test(l)
                           && /\?\?\s*['`"]/.test(l))
```

Narrow on purpose. It permits `?? 'unknown'` on the state lines and forbids a
string literal standing in for a *cell*, which is the actual rule. Paired with a
guard that no copy constant contains `«` in the heading/question fields — the
quotation is data, and a constant holding one is a claim about a file nobody
read. Both were proved by reverting the fix and watching the right test fail.

## 13b. The degenerate case is the first one anyone sees

The same screen's group heading read **"1 contactos · lista.csv · importados 8
Set 2026"**.

The grouping was correct. The label was not Portuguese. And n=1 was not an edge
case here — it was the *first live run*, deliberately: ten contacts, watched,
before anything larger. The first render of a cautiously-staged rollout is
almost always the degenerate one, because that is what caution looks like.

Nobody in the room assesses whether the grouping logic is sound. They read the
sentence. A screen is judged on its worst sentence long before it is judged on
its best behaviour, and `${n} contactos` is the cheapest possible way to look
careless while being correct.

### And then it happened twice more, in the same hour

The group label was fixed and the lesson above was written — and predicting the
render before handing over the URL found `UI.saved(1)` → *"Guardado: 1
contactos."* and `UI.claimCount(1, 1)` → *"1 de 1 contactos deste grupo."*

Writing down that a rule is general and then fixing only the instance you
happened to see is the most common way a lesson fails to take. The tell is the
shape of the guard: the first test asserted one expected label, so it could only
ever catch the one site. The replacement **derives its cases from the copy
object** — every function-valued key, called with 1 for each argument, checked
against `\b1 \w+s\b` — which covers the two that were missed and every string
added after today, without anyone maintaining a list.

**A guard over a hand-kept list of cases passes by being forgotten.** When the
rule is general, enumerate from the data structure, not from memory.

The general form: **when a UI string interpolates a count, the n=0 and n=1
renders are requirements, not polish** — and if the feature is being rolled out
to a small group first, they are the *only* renders that will be seen for days.
Write them into the test as literal expected strings, because that is the form
in which the defect is visible.

## 14. Two questions in the wrong order, and the validator that had known for a week

The segmentation screen asked the agency what lay behind their file's consent
marker, and *then* asked whether these people were past clients at all.

Backwards, for a reason that has nothing to do with software. A client who
bought through the agency is segment A **whether or not the marker means
anything** — so the first question framed the conversation around something that
may be irrelevant. And because that question opens with an admission of our
error, the screen opened a meeting by apologising for a mistake that, for those
contacts, did not matter. The right sentence in the wrong place.

### The duplicate nobody had seen

Reordering exposed something better. The three answers to the evidence question
*were* three of the four segments:

| evidence answer | segment |
|---|---|
| "we have the record" | **B** — deu autorização e temos o registo |
| "we have no record" | **C** — contactou-nos, mas nunca avançou |
| "I don't know" | **D** — já não sabemos de onde veio |

The screen was asking one question twice, the second time worse — and the write
path had known this the whole time. `validateDeclaration()` requires `basis` for
**B alone**:

```ts
if (input.segment === 'B' && !input.basis?.trim()) return '…which form, which system, what date'
```

So the screen asked every group for evidence that the record required of one,
and asked it before it knew which. **When a UI and its validator disagree about
which question belongs to which answer, the validator is usually right** — it
was written against the record, and the record is the thing that has to survive
being read back.

The fix made the agreement structural rather than remembered: `scopeFor()`
returns what step 2 must ask, and a test asserts, segment by segment, that
`scopeFor(s).basisRequired` equals whether `validateDeclaration` refuses that
segment without a basis. Neither can move without the other.

### What scoping broke, which is the part worth remembering

The admission ended *"Corrigimos o registo, e é por isso que estamos a perguntar
agora."* True while everyone was asked. After scoping it was true on one screen
in four: the other three announced a question that never came.

**A sentence's truth can depend on control flow that is nowhere near it.** When
a question becomes conditional, every sentence that referred to it is now a
claim about a branch it cannot see. Grep for the promise, not just the code.

## 14b. A predictor that duplicates what it predicts will eventually lie

`probe-segmentation.ts` prints what the screen will say without rendering it.
Every defect in this feature was found by reading its output — the invented
«sim», the `1 contactos`, the stranded question.

Then it drifted. The page moved the evidence question onto the field that
answers it; the probe was still printing the old arrangement. **It was wrong in
the worst possible direction: it looked right.** A prediction that no longer
matches the thing predicted is more dangerous than no prediction, because the
whole point of reading it is to stop looking at the real screen.

The cause was structural, not carelessness: the probe was a *second
implementation* of the page's composition. So the composition moved into
`present.ts` — pure, no `server-only`, no database — and the page renders it, the
probe prints it, and the tests assert on it. Three readers, one sentence.

Two things that fall out of this, and they are why it is worth the file:

1. **The guards got better.** Assertions that had to scan JSX text
   (`/\{ask\.basisRequired \? \(/`) became assertions on a returned value
   (`view('A').ask.kind === 'none'`). A source scan proves a line exists; a
   composition test proves the screen says the right thing.
2. **The staleness is now itself guarded.** A test reads both files and fails if
   either composes the copy directly instead of calling `present.ts`, so the
   next person to add a sentence cannot add it to only one of them.

The general rule: **when you build a tool to check a thing, make the tool read
the thing — never re-describe it.** A second description of the same behaviour
is a second thing to keep true, and the one nobody looks at is the one that rots.

## 15. Every guard in the feature passed on a screen where nothing could be read

The claim panel rendered near-white text on a near-white background. The shape
of the paragraphs was visible; not one word was. The three sentences the whole
screen exists to say — *uma célula num ficheiro não é prova de nada*, *foi um
erro nosso, não seu*, *resposta perfeitamente normal numa lista com anos* — were
invisible, on the one screen that exists to say them.

The cause is a half-specified contract, not a style slip:

```ts
const noteBox = { background: '#fbf6f3', /* and no color */ }
```

Pinning a background without pinning a foreground inherits one half of a pair
from an environment that is free to change it. On a machine in dark mode the
browser supplied white. Contrast ratio **1.05**. The error box and the success
box had the identical bug, which is worse in kind: an unreadable error message,
in a meeting, is indistinguishable from a screen where nothing went wrong.

### The part that generalises, and it is not about colour

By this point the feature had thirteen guards. A vocabulary guard over every
rendered string. A guard that no constant carries a quotation. A guard that the
origin step asks nothing about evidence. A guard binding the screen's questions
to the validator's requirements. A guard that the page and the probe compose the
screen once.

**All thirteen passed.** Every one of them checks what the page *composes*, and
not one can see what it *renders*. A vocabulary rule about words nobody can see
is a rule about nothing.

This is the vacuity family (§5c) one layer further out. §5c says a guard must be
paired with a check that the thing guarded actually exists. This says something
harder: **a guard is bounded by the artefact it can observe, and an entire class
of failure lives one layer beyond that boundary.** Asking "what would still pass
if this were completely broken?" is not enough — you have to ask "broken in what
*medium*?" Composition, rendering, layout, the network, the eye.

You cannot close that gap in general. You can usually close it cheaply in
particular, and cheaply is the whole point:

```ts
for (const [name, s] of Object.entries(SURFACE)) {
  assert.ok(contrastRatio(s.color, s.background) >= 4.5, name)
}
```

Thirty lines, no browser, no screenshot, no dependency — and it fails on the
exact pair that shipped. Paired with a guard that the page pins no background of
its own, so every surface arrives with its foreground or does not arrive.

**When a class of defect is invisible to your guards, the fix is rarely a
harness that renders the real thing. It is finding the cheapest artefact that
still carries the property** — here, two hex strings and a luminance formula.
The expensive version of this check never gets written; this one took an hour
and will outlive the styling it was written against, because what it defends is
not the palette, it is that text and the thing behind it are decided together.

## 15b. The guard from lesson 15 had a hole exactly its own size, found an hour later

All four origin radios rendered as **filled dark circles**. Every option looked
selected, on the screen whose no-pre-selection rule exists precisely so that
nobody glances and thinks a choice has been made. The name input rendered dark
grey on the white page.

Same root cause, and it is the lesson 15 defect one layer further in. The page
pinned a background and a foreground — and said nothing about `color-scheme`.
Radios, checkboxes and text inputs are painted by the **user agent**, so with no
scheme declared the browser kept painting them for dark mode on a surface we had
pinned light. A surface declares three things, not two: what is behind the text,
what the text is, and **what the browser should draw on it**.

The guard written an hour earlier could not see this. It compared text colours
to background colours, and the failing elements had neither — their colours came
from the environment. A guard closes the medium it can observe and leaves the
one next to it wide open, which is lesson 15 applied to lesson 15.

The check is four lines and no browser: **a light background must declare a
light scheme.**

```ts
const expected = luminance(s.background) > 0.5 ? 'light' : 'dark'
assert.equal(s.colorScheme, expected)
```

Plus a guard that every text input takes a surface rather than inheriting one,
which folds the controls into the contrast check that already exists.

### THE GAP THAT IS STILL OPEN, recorded rather than closed

What is now checked is that we **declare** a light scheme. What was actually
wrong is that four radios **looked identical when none was selected** — and no
token-level check can see that. Proving it needs a real render: a headless
browser, a screenshot, a pixel comparison of a checked control against an
unchecked one. That is not cheap, and it is not being built today.

So the honest statement of coverage is:

| | covered |
|---|---|
| text unreadable against its own surface | yes, by contrast ratio |
| controls painted in the wrong scheme | yes, by the luminance/scheme check |
| a control that *looks* selected when it is not | **no** |

The third line is a real residual risk on a screen where a mistaken glance
becomes a legal declaration. It is written down here rather than left as an
assumption that it was handled, because **a gap you have named is a decision and
a gap you have not is a belief** — and §8 is the whole file's answer to what
happens to beliefs that stop being true.

The trigger for closing it, when it comes, is not this screen: it is the second
screen where a control's *appearance* carries a decision. One instance is a note;
two is a harness.

---

## 7c. A requirement whose value is a set of alternatives cannot be ANDed

**2026-09-18.** The matching engine requires every hard requirement to hold —
that is what makes a hard constraint hard rather than a heavy weight, and it is
correct. A lead said two things:

> *"Procuro T3 em Cascais."* … *"Também estamos a ver em Estoril."*

Two hard area requirements, `['Cascais']` and `['Estoril']`. **Nothing matched,
anywhere.** A Cascais listing failed for not being Estoril and an Estoril
listing failed for not being Cascais, and the reasoning printed both:

```
Cascais is exactly what they asked for — "Procuro T3 em Cascais."
Fails: Cascais is not Estoril, and not adjacent to them — "Também estamos a ver em Estoril."
```

The code reads as obviously correct. The output is obviously wrong the moment
anybody looks at it, which is the whole distance between the two.

> **When a requirement's value is itself a set of acceptable options, combining
> two of them with AND inverts the requirement rather than tightening it.**

`areaAccepted(listing, wanted[])` passes if the listing matches ANY entry — the
OR already lives *inside* one requirement. So a second requirement of that kind
is not "and also this", it is "and simultaneously not that". Accumulating has to
mean one requirement holding both values, never two requirements holding one
each.

**How to spot the family.** Look at the judge, not the extractor: any criterion
whose comparison is `includes`, `some`, or "matches any of", and whose value is
a list, is an alternatives kind. Every other kind — a garden and a pool — is a
genuine AND and must be left alone. The two are indistinguishable in the
requirement type and completely different in meaning, which is why the
distinction now lives in a named list (`ALTERNATIVE_KINDS`) with the reason
attached rather than in whoever is editing.

And it is §7 again from a new angle: the defect is invisible in what the filter
*returns* — an empty result reads exactly like a lead with nothing suitable on
the books — and only visible in what it refuses and why.

---

## 5h. Fix the visible half, leave the invisible half live

**2026-09-18, twice in two days.** §1e records a guard that existed, was written
the same day, and was not applied to the second caller. This is its sibling and
it is harder to see, because there is no second caller to forget — there is a
second *instance of the same defect inside the thing you just fixed*.

Two in one session:

| Found | The half that was nearly missed |
|---|---|
| Portuguese had no hard marker for *"precisamos"*, so a stated requirement read as a wish | **Spanish had the identical gap.** English had carried `we need` all along, so the defect was in two of three languages |
| Two areas stated in two messages ANDed together and matched nothing (§7c) | `knownAreas.find()` returned the **first match only**, so two areas in *one* sentence silently dropped the second |

In both cases the fix to the found half would have shipped, the tests would have
been green, and the remaining half would have gone on failing in the invisible
direction — a lead shown fewer properties, with nothing reporting the
constraint that was quietly dropped.

> **A defect is a member of a family until you have enumerated the family.**
> The question after finding one is never "is it fixed" — it is "what is the
> set this belongs to, and have I looked at every member".

The enumeration is mechanical and cheap, which is the point: for a marker list,
every language; for a lookup, `find` vs `filter`, `some` vs `every`, first-match
vs all-matches; for a guard, every call site. Doing it by grep takes a minute.
Relying on the judgement that just failed to produce the list is how the second
half survives.

---

## 1j. A guard whose removal breaks nothing may be a guard the test rescued

**2026-09-18.** §1f says a sabotage that turns nothing red means *"did my edit
land"* before it means *"which test is missing"*. Here is the third answer, and
it is the one that nearly shipped.

The negation guard was changed to stop at a clause boundary, so that

> *"Na verdade não, precisamos mesmo de um jardim."*

is read as a requirement — the `não` refutes the previous clause, not the one
stating the requirement. The edit landed. The test that should have covered it
was green **with the guard removed**, and for a reason that looks like nothing:
the scenario used two sentences, and the second one (*"É essencial."*) upgraded
the requirement through a different rule entirely. The outcome was right; the
guard under test had contributed nothing to it.

> **A second mechanism that produces the correct outcome hides the first one
> completely.** The test is not wrong, and it is not missing — it is *rescued*,
> and a rescued test reports on the rescuer.

The pair that fixes it, and both halves are needed:

1. **Isolate it with no rescue.** One sentence, no following sentence to
   upgrade anything, so the only thing that can produce the right answer is the
   guard being tested.
2. **A control against over-widening.** *"Não precisamos de um jardim"* must
   still be a non-requirement, or "stop at the clause boundary" quietly becomes
   "negation never applies".

**Where to look for this.** Any time a sabotage fails to turn a test red and the
edit is confirmed to have landed, ask what *else* in the path produces the
correct answer. If something does, the test is measuring that instead — and the
guard you believe you have has never been shown to work.
