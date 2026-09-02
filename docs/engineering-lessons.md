# Engineering lessons

Ways of thinking that outlived the component that taught them. This file is
deliberately *not* the runbook: the runbook tells you how to operate this
system, and it becomes wrong when the system changes. What is here should still
be true after the Concierge, n8n and Supabase have all been replaced.

Append to it. An entry earns its place by having cost real time at least once.

---

## 1. Tests that pass while testing the wrong thing

**This has now bitten the project six times in six different disguises.** It
is the single most useful thing in this file.

| # | Incident | What reported success | What was actually true |
|---|---|---|---|
| 1 | `restore.sh` loaded the dump without `ON_ERROR_STOP` | Script printed "Restore complete." and started n8n | Every statement had failed. n8n was starting against an **empty database** |
| 2 | Nightly backup during a Supabase pause | Exit 0, fresh dump, clean push to GitHub | The database holding every lead was **offline and unreachable** |
| 3 | Migration `0003` unique-index test (1 Sep 2026) | Duplicate rejected, `ON CONFLICT` worked, all green | The test wrote the index predicate **by hand in raw SQL**. PostgREST — the actual caller — emits `ON CONFLICT (client_id, phone)` with no predicate and fails `42P10` against a partial index |
| 4 | Schema comparison during the restore drill | `columns: IDENTICAL`, `indexes: IDENTICAL` | **Both sides had errored to empty.** Shell quoting had mangled the SQL, and comparing two empty result sets reports a perfect match |
| 5 | n8n workflow deployed via CLI (2 Sep 2026) | `active=true` in the database, and the boot log said `Activated workflow "inbound_concierge_whatsapp"` | **No webhook was registered and every request 404'd.** n8n 2.28 also requires `publish:workflow`; without it activation aborts for *every* workflow, silently taking the Supabase keepalive down too |
| 6 | Run logging after the Twilio send (2 Sep 2026) | Execution status `success`, reply delivered to the lead | **No `automation_runs` row was ever written.** A node read `$input` while sitting after an HTTP node, so `client_automation_id` was `undefined`, the insert failed a NOT NULL constraint, and `neverError` swallowed the 4xx |

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
9. **After an HTTP node, `$input` is a response envelope, not your data.** #6's
   node read `$input.first().json` expecting the accumulated item and got
   `{statusCode, headers, body}`. Every field it wanted was `undefined`. When a
   node follows an HTTP call, reference the upstream node explicitly
   (`$('AfterSend')`), and be suspicious of `neverError`: it converts a 4xx
   into a silent success, which is the entire failure mode of this section.

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

## 4. The failure you can see is rarely the failure that matters

Related to §1 but distinct, and worth stating separately.

Every incident above was *visible* in principle — the data was there to notice.
What was missing was a signal pointed at the right thing. The Supabase pause
produced a perfectly informative silence: no errors, because nothing was asking.

When adding monitoring, the question is not "will this tell me when it breaks?"
It is "what breakage would this be blind to?" Answer that one honestly and the
gap is usually obvious.

---

## 5. Prefer the boring mechanism the platform already arbitrates

Dedupe was originally specified as workflow logic: look up the message id, and
insert if absent. That is correct in the single-threaded story and wrong under
retries — Twilio delivers twice, both lookups miss, both insert.

Moving the guarantee into a unique index made the race unrepresentable rather
than unlikely. The workflow attempts the insert and treats `23505` / HTTP 409 as
"already handled".

The general shape: when a correctness property can be enforced by a constraint
the database already checks atomically, put it there. Application-level checks
are advisory the moment there is more than one caller.
