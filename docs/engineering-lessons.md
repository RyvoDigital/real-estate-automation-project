# Engineering lessons

Ways of thinking that outlived the component that taught them. This file is
deliberately *not* the runbook: the runbook tells you how to operate this
system, and it becomes wrong when the system changes. What is here should still
be true after the Concierge, n8n and Supabase have all been replaced.

Append to it. An entry earns its place by having cost real time at least once.

---

## 1. Tests that pass while testing the wrong thing

**This has now bitten the project four times in four different disguises.** It
is the single most useful thing in this file.

| # | Incident | What reported success | What was actually true |
|---|---|---|---|
| 1 | `restore.sh` loaded the dump without `ON_ERROR_STOP` | Script printed "Restore complete." and started n8n | Every statement had failed. n8n was starting against an **empty database** |
| 2 | Nightly backup during a Supabase pause | Exit 0, fresh dump, clean push to GitHub | The database holding every lead was **offline and unreachable** |
| 3 | Migration `0003` unique-index test (1 Sep 2026) | Duplicate rejected, `ON CONFLICT` worked, all green | The test wrote the index predicate **by hand in raw SQL**. PostgREST — the actual caller — emits `ON CONFLICT (client_id, phone)` with no predicate and fails `42P10` against a partial index |
| 4 | Schema comparison during the restore drill | `columns: IDENTICAL`, `indexes: IDENTICAL` | **Both sides had errored to empty.** Shell quoting had mangled the SQL, and comparing two empty result sets reports a perfect match |

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

---

## 2. The failure you can see is rarely the failure that matters

Related to §1 but distinct, and worth stating separately.

Every incident above was *visible* in principle — the data was there to notice.
What was missing was a signal pointed at the right thing. The Supabase pause
produced a perfectly informative silence: no errors, because nothing was asking.

When adding monitoring, the question is not "will this tell me when it breaks?"
It is "what breakage would this be blind to?" Answer that one honestly and the
gap is usually obvious.

---

## 3. Prefer the boring mechanism the platform already arbitrates

Dedupe was originally specified as workflow logic: look up the message id, and
insert if absent. That is correct in the single-threaded story and wrong under
retries — Twilio delivers twice, both lookups miss, both insert.

Moving the guarantee into a unique index made the race unrepresentable rather
than unlikely. The workflow attempts the insert and treats `23505` / HTTP 409 as
"already handled".

The general shape: when a correctness property can be enforced by a constraint
the database already checks atomically, put it there. Application-level checks
are advisory the moment there is more than one caller.
