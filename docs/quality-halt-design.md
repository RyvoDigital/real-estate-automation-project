# The quality-rating halt

**Design · 18 September 2026 · nothing in this document has been built**

> The number a reactivation campaign risks is the number the Concierge runs on.
> A campaign that degrades it does not damage the campaign — it takes down the
> automation that already works and already has a client depending on it. That
> asymmetry is the whole reason this is built before the runner rather than
> after.

---

# 1. What it reads

`GET https://messaging.twilio.com/v2/Channels/Senders/{Sid}` — the Senders API
v2. The response's `properties` carries:

| field | example |
|---|---|
| `quality_rating` | `"HIGH"` |
| `messaging_limit` | `"10K Customers/24hr"` |

Checked in the documentation rather than assumed, as with the idempotency and
restricted-key questions. Three things about that source are worth recording
before anything depends on it:

**The values are not enumerated.** The documentation gives examples, not a
closed set. Meta's own vocabulary is GREEN / YELLOW / RED and Twilio surfaces
HIGH / MEDIUM / LOW, so the parser must treat **an unrecognised value as a
halt**, never as a pass. A rating we cannot read is not a rating we may ignore.

**It is Meta's number, not Twilio's.** *"Twilio has no ability to change a
WhatsApp Sender's Messaging Limit or Quality Rating"* — so there is nobody to
appeal to and nothing to override. It is an input, entirely.

**v1 is deprecated from 1 September 2026**, which is already past. This design
uses v2 and records the date so a future reader knows which version the field
names came from.

## 1.1 The credential question, again

Reading a sender is not sending. By the boundary settled for reconciliation —
*the boundary is not who may talk to Twilio, it is who may cause a message to
exist* — this belongs with the **read** key, in `provider-reader.ts`, not in the
adapter.

**Settled 18 Sep 2026, in the Console.** `whatsapp-senders` offers all five
actions separately, so Read and List were ticked on it alongside the existing
`messages` Read and List — **the same restricted key, edited in place.** No new
credential, no new environment variable, nothing to change on Vercel.

So the boundary holds unchanged: one read key, now covering two resources, still
unable to create anything. That it was a permission edit rather than a second
key matters — a second credential would have been a second thing
`one-sender.test.ts` had to reason about, and the count that assertion protects
only stays meaningful while it stays small.

---

# 2. How often, and why a start-of-campaign check is not a halt

> A rating checked once at campaign start is a **precondition**. The rating
> drops *during* a campaign, which is exactly when it matters — it drops
> because of the messages the campaign is sending.

Two mechanisms, for the same reason the objection race has two:

| | when | what it is for |
|---|---|---|
| **Before every batch** | in the runner's loop, synchronously | Tight where the risk is. A batch is up to 30 messages; the rating cannot be worse than one batch stale |
| **Every 15 minutes while any run is `sending`** | scheduled | Covers the paths that forget, including ones not yet written, and catches a drop during a long-running or paused batch |

**Why not after every message.** The rating is computed by Meta from user
signals — blocks, reports, mutes — and does not move message by message. Polling
per message would add a network round trip to every send for a number that
changes on the order of hours, and the batch boundary is where a halt can be
acted on cleanly anyway.

**Why not only before each batch.** Because that is a check the caller
remembers to make, and §12 says that is not a control. A run that stalls
mid-batch, or a batch loop written next year by someone who has not read this,
is covered by the scheduled sweep and by nothing else.

## 2.1 The thresholds

| rating | what happens |
|---|---|
| `HIGH` / `GREEN` | proceed |
| `MEDIUM` / `YELLOW` | **halt** and alert |
| `LOW` / `RED` | **halt**, alert critically |
| anything unrecognised, or unreadable | **halt** and alert |

Halting on MEDIUM rather than only on LOW is deliberate and is the expensive
choice. The Enquadramento §9 and the specification §10 both say to halt on *any*
drop below green, and the reasoning is the asymmetry at the top of this
document: the cost of halting early is a delayed campaign, and the cost of
halting late is the Concierge's number. Those are not comparable, so the
threshold is not a judgement call.

---

# 3. What it does to a run already in flight

**It stops before the next batch.** No in-flight `dispatch` is interrupted: a
message already handed to the provider has been handed over, and the row is
mid-lifecycle. Halting means *no further permits are minted*.

The run goes to `halted`, with `halted_reason` naming the rating and the moment
— `0018` already requires a halted run to state its reason.

## 3.1 A halted run cannot be resumed, and a fresh evaluation is required

**Agreed, and the strongest argument is not the one about staleness.**

The staleness argument is real but weaker than it first looks: phase 2 re-runs
the gate immediately before every send, so a resumed run could not message
somebody who objected in the interim. **Safety is already covered.** What breaks
is the record: the run's forecast said "20 contactable" at a moment that has
passed, its refusal rows were written then, and resuming would send under a
shape that no longer describes anything.

The stronger argument is structural:

> **A resume path is a send path that skipped phase 1.** Build one and it exists
> — available to any future caller, including the ones written after everybody
> has forgotten why evaluation comes first. The rule that phase 1 always
> precedes phase 2 is worth more than the convenience of continuing.

And the third, which is about what a quality drop *means*: the rating fell
because recipients blocked or reported the messages. That is evidence about the
content or the audience, not weather. Resuming assumes the cause was transient;
re-evaluating is the cheapest way to make the second run's shape true, and the
operator reading the new forecast is the point at which somebody notices the
audience was wrong.

## 3.2 The re-run must not message anyone twice, and it must not rely on memory

A fresh evaluation over the same list will include contacts the halted run
already messaged. Nothing about re-evaluating knows they were messaged.

**This is not solved by remembering.** It is solved by the pacing rule the
specification already requires — *never two touches to the same contact in a
week* — which reads `sends`, and which the runner must apply as a refusal like
any other, producing a refusal row with a reason an operator can read. A contact
messaged yesterday is refused today by a rule that exists anyway, not by a
special case that knows about halts.

Recorded here because the obvious implementation of "re-evaluate after a halt"
is to exclude the contacts already sent, by hand, in the resume logic — which is
a second copy of a rule that must exist regardless, and the copy that will
diverge.

---

# 4. What it is not

**Not a gate layer.** The gate answers a question about a contact; this answers a
question about a number. Adding it as layer 6 would mean asking Twilio about the
sender three hundred times per campaign evaluation, and would put a network call
inside a function whose purity is load-bearing (§12b).

**Not a reason to write to the provider.** It reads. If the rating is
unreadable, it halts; it never "checks again by sending a test message", which
is the obvious next idea and would be a send outside the gate.
