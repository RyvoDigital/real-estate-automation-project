# Engineering lessons

Ways of thinking that outlived the component that taught them. This file is
deliberately *not* the runbook: the runbook tells you how to operate this
system, and it becomes wrong when the system changes. What is here should still
be true after the Concierge, n8n and Supabase have all been replaced.

Append to it. An entry earns its place by having cost real time at least once.

If you read only two things here, read **§0** — a generated message that
promises a future you have not secured — and **rule 13**: documenting a failure
mode does not control it, checking the artefact does.

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

## 1. Tests that pass while testing the wrong thing

**This has now bitten the project thirteen times in thirteen different disguises.** It
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
13. **Documenting a failure mode does not control it; checking the artefact
   does.** #6 recurred unchanged three days after being written up as the most
   cited entry here. Both times it was caught by querying the table, never by
   reading the execution status. Ask "what row, file or calendar entry should
   now exist?" and go and look at it — a green run is not evidence that it does.
14. **Never let a test hold its own copy of something the product also holds.**
   Two copies of a prompt fragment, a schema or a config will diverge, and the
   test will keep reporting confidently from the stale one. Render it from the
   shipping artefact, and make the renderer *raise* rather than fall back — a
   fallback to the stale copy reinstates the defect silently.
15. **After an HTTP node, `$input` is a response envelope, not your data.** #6's
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
