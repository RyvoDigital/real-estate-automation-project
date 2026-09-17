# The send path — making the wrong order unwriteable

**Design · 17 September 2026 · nothing in this document has been built**

> The property to get right: the insert must be what *makes* the provider call
> possible, not a step the path performs before it. A path that inserts and then
> calls is one edited line away from calling without inserting.
>
> Four questions were put with it. Two changed the design and one requires
> amending `0015`, which is already applied — see §7.

---

# 1. Why "insert, then call" cannot be a convention

The natural shape is:

```ts
const row = await recordIntent(...)      // §3.10
const result = await provider.send(...)  // and this line does not need `row`
await recordOutcome(row.id, result)
```

Every guarantee here rests on the middle line not being moved, deleted, or
copied into a second file. Nothing about `provider.send(...)` requires the
insert to have happened: the arguments it needs — a number and a body — are
available before the row exists. **The ordering is correct and undefended**,
which is §12 exactly: a property everyone agrees with, and one obvious step
that destroys it.

So the design does not rely on the order being written correctly. It makes the
provider call *impossible to express* without the row.

---

# 2. Three mechanisms, at three different distances

## 2.1 The permit cannot be constructed outside the recorder (compile time)

`dispatch()` takes a `SendPermit` and nothing else. `SendPermit` is a class with
a **private constructor**, so `new SendPermit(...)` outside its module is a
compile error, and the only factory is the function that inserts the row:

```ts
// send-intent.ts
export class SendPermit {
  private constructor(
    readonly sendId: string,
    readonly idempotencyKey: string,
    readonly to: string,
    readonly body: string,
    readonly templateName: string,
  ) {}

  /** The ONLY way a permit comes into existence. */
  static async record(gate: GateVerdict & { permitted: true }, plan: SendPlan) {
    const row = await insertIntendedRow(gate, plan)   // the §3.10 insert
    return new SendPermit(row.id, row.idempotency_key, plan.to, plan.body, plan.template)
  }
}
```

A caller who wants to send and has not inserted has nothing to pass. The wrong
order is not *discouraged*; it does not typecheck.

## 2.2 The dispatcher re-reads the row before it calls (runtime)

A cast defeats any type. `as unknown as SendPermit` is possible, so the
dispatcher does not trust the permit:

```ts
async function dispatch(permit: SendPermit) {
  const row = await readSendRow(permit.sendId)
  if (!row) throw new Error('dispatch: no send row for this permit')
  if (row.status !== 'intended') throw new Error(`dispatch: row is ${row.status}`)
  if (row.idempotency_key !== permit.idempotencyKey) throw new Error('dispatch: key mismatch')
  if (row.gate_verdict !== 'permitted') throw new Error('dispatch: row is not a permission')
  // …only now does the provider exist in this scope
}
```

**The permit is not a token that can be forged, because the thing it points at
is a database row that had to satisfy `0015`'s constraints to exist.** A
fabricated id fails the lookup. A real id in the wrong state fails the check. A
row that recorded a refusal fails the verdict check.

## 2.3 One module owns the credential, and a test proves it (checkable)

The strongest of the three, and the cheapest. The provider SDK is imported in
**exactly one file** — the dispatcher — and nothing else in the repository can
construct a client, because nothing else has the credential in scope.

That is a boundary rather than a rule, and unlike the other two it is
*checkable by someone who does not know the argument* (§12):

```
tests/one-sender.test.ts
  - the provider SDK is imported in exactly one file
  - TWILIO_* / provider credentials are read in exactly one file
  - that file is the dispatcher
  - and it fails with the offending path named, not just a count
```

A future path that wants to send has to either go through `dispatch()` or add a
second import, and the second import turns the suite red with a message saying
why. Three layers: it will not compile, it will not run, and it will not pass.

---

# 3. When the provider call fails — and the rule is *never retry in-path*

The row is at `intended` with a key. The question is whether the path retries.

**The distinction that settles it: did the provider ANSWER?**

| What came back | What it means | What the path does |
|---|---|---|
| **4xx, a rejection** — unapproved template, bad number, policy refusal | The provider answered *"I did not accept this"* | `status='failed'`, the error recorded. **No retry** — the same content will be rejected identically |
| **429 / an explicit "not now"** | The provider answered *"I did not accept this, try later"* | The only retryable answer. Same row, same key, bounded attempts, `attempts` incremented |
| **A timeout, a dropped connection, a 5xx with no body** | **The provider did not answer.** It may have accepted and delivered | **Nothing.** The row stays `intended`. The path stops and hands over to reconciliation |

> **The path never retries an ambiguous outcome, and silence is always
> ambiguous.** Retrying silence is how a person receives the same message
> twice, and a duplicate marketing message to someone whose consent is the
> whole product is a worse failure than a message that never arrived.

The tempting middle path — "retry once, the timeout was probably a network
blip" — is exactly the 2am fallback §gate warns about. It trades a visible
`intended` row for an invisible double send.

## 3.1 What reconciliation does with `intended`

A separate pass, on a schedule, over rows at `intended` older than a few
minutes. It asks the provider what became of the idempotency key and completes
the row: `sent` with the provider id, or `failed`, or — if the provider has
never heard of it — re-permits through `dispatch()` from the same row.

**This depends on the provider honouring an idempotency key or exposing a
lookup, and I have not verified which Twilio offers for WhatsApp messages.** If
it turns out neither is available, the design has one fallback and it must be
stated rather than discovered: a bounded time-window search of the provider's
own message log by recipient and body, which is weaker and needs the body
stored — which it already is. **This is the one open technical dependency in
this design** and it should be checked against Twilio's documentation before
the reconciliation pass is written, not before the send path is.

---

# 4. Refusals are batched, and written *before* any send

A campaign of 300 where 280 refuse must not write 280 rows one at a time
through the permit machinery. The machinery exists to make a provider call
possible, and a refusal never makes one.

**Decision: the campaign is evaluated in full, refusals are written in one bulk
insert, and only then are the permitted contacts dispatched one at a time.**

Three reasons, and the third is the one that matters:

1. Refusals are all knowable before any message goes out. Nothing about a
   refusal needs to be interleaved with sending.
2. It keeps the two lifecycles apart. A refusal has no outcome phase, no key to
   reconcile, no provider.
3. **The campaign's shape becomes a record before the campaign runs.** "300
   evaluated, 20 permitted, 280 refused with reasons, at 09:03" is itself the
   compliance artefact, and if the run dies halfway through it cannot be
   reconstructed afterwards. A campaign that recorded its refusals as it went
   and stopped at contact 140 leaves no answer to *how many were there*.

Refusal rows still carry a **deterministic** idempotency key —
`ref:<campaign_id>:<phone>` — so re-evaluating a campaign does not duplicate
them. The unique index does the work, and re-evaluation after a policy change
is a thing that will happen.

Per-contact rows, not a summary: *"why did this person not receive it"* is the
question, and an aggregate cannot answer it.

---

# 5. Obligations — and an undischargeable obligation is a refusal

The gate returns permissions carrying obligations, today as prose: *"Art. 13.º-B:
maintain lists of those who consented AND of customers who did not object"*.
Nothing discharges it. The objection to leaving it there is exactly right: **a
recorded obligation nobody acted on is worse than an unrecorded one, because the
record proves we knew.**

The send path cannot discharge this one. Art. 13.º-B is not a per-message act —
it is a standing requirement that two lists exist and are current. So the path
hands off. What makes the handoff real rather than notional is three changes:

## 5.1 Obligations become codes, not prose

`gate_obligations` carries `["pt_13b_lists"]` and the prose comes from a
registry. A free-text obligation cannot be checked, counted, or discharged.

## 5.2 A registry maps each code to its discharge and its check

| code | what discharges it | who owns it | how it is checked |
|---|---|---|---|
| `pt_13b_lists` | a view over the ledger producing both lists, exportable | the agency, from an artefact we provide | a scheduled check that the view is current and non-empty for every client with sends under that basis |

## 5.3 An obligation with no registered discharge makes the permission a refusal

The strong part, and deny-by-default applied one level up:

> If `evaluatePolicy` returns an obligation code the registry does not know how
> to discharge, **the gate refuses** — a new refusal reason,
> `obligation_undischargeable`.

So a lawyer adding "and you must also do X" to a policy row cannot silently
create an obligation that nothing performs. Either X has a discharge mechanism
and a check, or that jurisdiction stops permitting sends. The failure mode is a
blocked campaign and a visible reason, which is the right direction for it to
fail in.

## 5.4 And a periodic check, because the discharge can lapse

Every obligation code appearing on a send in the last thirty days must have a
current discharge. It is the same shape as the proof-staleness guard: the
obligation cannot quietly stop being met while sends continue under it.

---

# 6. `claimed_unevidenced` is never sendable, and the refusal is made structural

**It is already refused today.** The gate maps ledger state to segment, and
anything that is not `consented` or an explicit `declared` segment becomes `D`,
which layer 4 refuses as `no_ledger_basis` — *before* any policy row is read. So
no policy row, however permissive, can reach it. That is the right order and it
is already the order.

Two things this design adds, because "already true" is not the same as
"defended":

**A test that says it by name, quantified over policies.** Not one permissive
policy — every shape of permissive policy, including one where every field is
maximally open and the row is confirmed:

```
gate.test.ts
  'claimed_unevidenced is refused for EVERY policy configuration'
    for each of: PT open, PT open + segment A available, consent_request
    permitted, no expiry, confirmed by a real name…
      decideGate({ consent: {state:'claimed_unevidenced'}, policy })
        → refused, layer 'basis'
```

**Exhaustiveness at compile time, so a new ledger state forces a decision.** The
refusal currently depends on the state→segment mapping falling through to `D`.
A future state added to the ledger would fall through silently, which is the
wrong default for a decision about sending. The mapping becomes exhaustive over
the union with a `never` check, so adding a state to `consent_by_contact`
without deciding its segment stops compiling.

> The state means *the agency asserted something we cannot use*. It is not a
> weaker form of consent, it is a stronger form of nothing — and the comment
> saying so belongs on the mapping, where the next person will be editing.

---

# 7. What this needs that `0015` does not have

`0015` is applied, so these are `0017`, small and additive:

| column | why |
|---|---|
| `attempts integer not null default 0` | the 429 case is the only retryable one and it must be bounded |
| `last_attempt_at timestamptz` | so reconciliation can tell a stalled row from a fresh one |
| `last_error text` | the error of the most recent attempt, distinct from the final `error` |

`gate_obligations` already exists as `jsonb` and will hold codes rather than
prose — a content change, not a schema change.

Nothing else. The record was designed before the path and it mostly fits, which
is the argument for having written it in that order.

---

# 8. Order of work

1. `0017` — the three columns.
2. The obligation registry and `obligation_undischargeable`, because it changes
   what the gate returns and everything downstream reads that.
3. `claimed_unevidenced`: the named test and the exhaustive mapping. Smallest,
   and it closes a real gap in what is defended rather than what is true.
4. `SendPermit`, `insertIntendedRow`, `dispatch()`, and `one-sender.test.ts` —
   the three mechanisms of §2, with the dispatcher's provider call left as a
   function that throws `not implemented`, so the whole path can be tested
   before a single message can physically go out.
5. The bulk refusal pass of §4.
6. Reconciliation — **after** the Twilio idempotency question of §3.1 is
   answered, and not before.

Steps 1–5 cannot send anything: the provider call does not exist yet, and the
gate refuses every contact in the database today.
