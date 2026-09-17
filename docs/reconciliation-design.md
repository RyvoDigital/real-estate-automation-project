# Reconciliation — resolving `intended`, and finding sends that have no row

**Design · 17 September 2026 · nothing in this document has been built**

> Two halves. The first completes rows left ambiguous by a provider that did not
> answer. The second is the one that was written down as *not built* in `0016`'s
> header — detecting a message that went out with no `sends` row at all — and it
> turns out the same pass can do it, because both are the same query read in
> opposite directions.

---

# 1. The constraint that shapes everything: Twilio has no idempotency

Checked 17 September 2026, not assumed. The `Idempotency-Key` header covers
configuration and orchestrator operations; **the Messages resource has no
client-supplied deduplication token.** The list endpoint filters by `To`, `From`
and `DateSent` (with `<` and `>` variants) and nothing else.

Three consequences, and the third is a rule rather than a mechanism:

1. Our `idempotency_key` is **our** handle. It prevents a duplicate intent row
   and names the attempt in our own logs. It cannot be asked about.
2. The only lookup available is **`To` + `From` + a `DateSent` window**, then
   disambiguation by body — which is why `body_intended` is stored.
3. **Reconciliation may never re-send.** Without provider-side deduplication an
   automatic re-dispatch is a coin flip on a second message to somebody whose
   consent is the entire product. Rows it can resolve, it resolves. Rows it
   cannot go to a human. This corrects the send-path design, which said it could
   re-permit from the same row.

---

# 2. Half one: completing `intended`

A row sits at `intended` when the provider did not answer. It has a body, a
recipient and a time, and no provider id.

```
every 10 minutes
  rows where status = 'intended'
    and intent_recorded_at < now() - 10 minutes     ← the grace period
  for each:
    list provider messages  To = phone, From = the client's number,
                            DateSent >= intent_recorded_at - 2 min
                                     <= intent_recorded_at + 15 min
    match on body == body_intended, direction outbound
      exactly one  → complete the row: sent, provider id, sent_at from the
                     provider's own timestamp, body_sent from the provider's copy
      none         → status 'unresolved', alert
      more than one→ status 'unresolved', alert, and say so loudly
```

**The grace period is not politeness.** A request that has not answered yet is
not a request that failed; searching for it immediately races the in-flight call
and finds nothing, which would mark a live send unresolved. Ten minutes is far
beyond any provider timeout and is invisible at a campaign's pace.

## 2.1 The disambiguation that matters, and it is not the obvious one

`To` + `From` + a time window will also match **the Concierge's own replies**.
The same WhatsApp number serves both, the Concierge replies to leads constantly,
and a reactivation contact who answers gets a Concierge reply within seconds —
inside the very window being searched.

So matching on recipient and time alone would happily complete a send row with
the provider id of an unrelated conversational reply, and the record would then
claim we sent a marketing template when we sent "Claro, qual é o seu horizonte
temporal?".

> **The body is the discriminator, and it must match exactly.** `body_intended`
> is the fully rendered text, variables substituted, so an exact comparison is
> available and a fuzzy one is never needed. Anything less than exact is
> refused: the cost of a wrong match here is a false record in a regulatory
> table, which is the thing this whole subsystem exists to prevent.

Two or more exact matches means we sent twice, which is the outcome the
never-retry rule exists to avoid. It is not resolved automatically — it is
alerted, because if it has happened the rule has been broken somewhere and a
human needs to know before anything else runs.

## 2.2 `unresolved` is a new status, and it exists to be counted

`0015` allows `intended | sent | failed | refused`. A row the pass could not
resolve must be distinguishable from one that is merely young, or the ten-minute
window silently becomes the definition of "unresolved for ever".

`0019` extends the check. `unresolved` behaves as not-sent everywhere: the
constraints keyed on `status <> 'sent'` are unaffected, and the operator screen
gets a number that should be zero and is worth looking at when it is not.

---

# 3. Half two: sends with no row, which `0016` said was not built

`0016`'s header records honestly that invariant 3 iterates `sends` rows, so a
**total bypass** — something that sent without inserting a row — is invisible to
it. That gap is the §4.9 *who watches the watchers* shape.

The same provider listing closes it, read in the other direction:

```
nightly, over the last 48 hours
  list every outbound provider message from each client's number
  for each, find a sends row with a matching provider_message_id
    matched                     → fine
    unmatched, body is a template we know → ORPHAN. critical alert, halt the client
    unmatched, free-form        → a Concierge reply, expected
```

**The template test is what makes this work.** Concierge replies are free-form
model output; campaign messages are rendered from approved templates whose
shapes we hold. An outbound message matching a known template with no `sends`
row means something sent a marketing message outside the gate, which is the one
event the entire architecture exists to make impossible.

Its response is the strongest in the system: halt every campaign for that client
immediately, alert critically, and record an `invariant.violated` event. Unlike
the objection race — where the damage is bounded and the gate still holds — an
orphan means the gate is not the only route, and every subsequent send is
suspect until a person says otherwise.

> This is the check that would have caught `src/blast.js` if it had ever run,
> rather than only if someone ran the suite. The one-sender test defends the
> repository; this defends the wire.

## 3.1 What it cannot do

It cannot see a message sent from a *different* provider account. Nothing can,
short of reconciling billing. Recorded here so the coverage claim stays honest:
this closes "sent outside the gate through our provider", not "sent by any means
whatsoever".

---

# 4. Cadence, decided

| pass | when | why that number |
|---|---|---|
| **Complete `intended`** | every 10 minutes | The grace period is already 10, so a shorter loop mostly re-examines rows it must skip. A row resolves within 20 minutes of the silence that created it, and nothing downstream depends on it resolving faster — the campaign has moved on |
| **Orphan sweep** | nightly, 48-hour window | The provider listing is the expensive call and an orphan is catastrophic-but-rare. 48 hours over a nightly run means every message is examined twice, so a single failed run cannot create a permanent blind spot — the §4c habit applied to a schedule |

Neither pass sends anything, and neither may. **The reconciliation pass must not
import the dispatcher**, and `one-sender.test.ts` already enforces that by
construction: it has no provider access of its own, and the only file that does
is the adapter.

---

# 5. What it needs

- `0019`: `unresolved` added to the status check; an index on
  `(status, intent_recorded_at)` for the first pass; `reconciled_at` already
  exists.
- A provider *reader* — list and filter — which is **not** the sender. It is the
  one place this design touches the credential boundary, and it is the question
  §6 leaves open.
- The matcher, pure over a list of provider messages and a row, so every case
  above is testable without a network: exact match, no match, several matches,
  and a Concierge reply inside the window that must not match.

---

# 6. The open question, which is a boundary question

`one-sender.test.ts` asserts that **at most one file** may import the provider
SDK, read its credentials, or call its API. Reconciliation needs to *read* the
provider's message list, which means credentials.

Three options, and I would take the third:

1. **Read through the adapter.** The adapter grows a `list()` alongside `send()`.
   Simple, and it means the single file that can send is also the single file
   that can read — a larger surface for the one file whose surface should be
   smallest.
2. **A second file, and widen the test to two.** Honest, and it weakens the
   assertion from "one" to "two", which is the first step of a sequence that
   ends at "some".
3. **Split the credential by capability.** A read-only API key for
   reconciliation, held in a different environment variable, in a separate
   `provider-reader.ts` — and `one-sender.test.ts` keeps asserting that exactly
   one file may hold the *sending* credential. The boundary that matters is not
   "who may talk to Twilio" but **"who may cause a message to exist"**, and a
   key that cannot send cannot cross it.

## 6.1 The scoping check — attempted 17 Sep 2026, and NOT settled

Three sources read. What is established:

- **Restricted API Keys are GA**, not beta.
- They scope by product, resource and **action**: *"which Twilio API Resources an
  API Key can access, and which action(s) the API Key is allowed to take on
  those API Resources"*. Messaging is among the supported products.
- A search summary quoted an operation shaped `twilio/messaging/messages/list`,
  which would mean list is grantable separately from create.

**What is not established: the permission identifiers themselves.** The
documentation page does not enumerate them; it points at a PDF permissions
matrix, and that PDF is font-encoded and does not yield text. So the last point
above rests on a search-engine summary rather than on a page I read, and it is
indicative rather than confirmed. Stated that way on purpose: a design that
depends on a capability should not record a maybe as a yes.

**The check that settles it takes two minutes and needs the Console**: begin
creating a Restricted API Key and read the Messaging permission list, or call
the Keys API's permission enumeration. Either shows whether a read/list
permission exists without a create permission.

### If it turns out read CANNOT be separated from create

Option 3 collapses and the choice is between the two it was preferred over.
Saying now what that forces, rather than discovering it while writing the file:

- **Option 1 becomes the answer, not option 2.** The adapter grows `list()`
  and remains the single file holding a credential. The assertion stays at
  exactly one file, which is the property worth protecting; what is lost is that
  the one file's surface grows, which is a smaller loss than "one" becoming
  "two".
- **`one-sender.test.ts` then needs a second assertion to compensate**: that
  reconciliation does not import the adapter's send path — it may import the
  module, but a call to `send()` outside `dispatch()` fails the suite. Weaker
  than a credential that cannot send, and it is the best available if the key
  cannot be scoped.
- **And it should be recorded as a carried risk** rather than absorbed: the
  boundary would then rest on a code check rather than on a capability, and a
  code check can be edited by the person adding the bypass.

None of this blocks the matcher, which is pure and already built.
