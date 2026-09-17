# The send record, and the three invariants that watch it

**Design · 17 September 2026 · nothing in this document has been built**

> Asked for before any schema: what a completed send row looks like, filled in,
> and whether it answers *"why did this person receive this message"* on its own
> without a join anyone has to think about. Writing that row out changed the
> design — see §2.

---

# 1. A completed send row

Real values where real values exist. The four fields marked **†** cannot be real
yet, and the reason is itself the deny-by-default property working: **no contact
in the database can currently be sent to.** `PT` is unconfirmed, so a documented
consent would still be refused; the only real contact is
`claimed_unevidenced`; and every other contact is in the reserved range, which
the gate refuses outright. So the row below is what one will look like the day
after Margarida confirms `PT` and an agency declares a segment.

```
id                     9f2c4a10-… (generated)
client_id              20e5c7ec-eaa6-4f5d-bf38-49e9ab24fc12   ZZ TEST — Cascais Demo
lead_id                df345563-3d09-40d6-9902-357b66ceba5f   Maria Santos
phone_e164             +351912345678
automation             reactivation_02
campaign_id            (a campaign row)
idempotency_key        snd_9f2c4a10…                          generated BEFORE the send

--- what authorised it, copied at decision time -------------------------------
gate_verdict           permitted
gate_basis             documented consent · PT
gate_obligations       ["Art. 13.º-B: maintain lists of those who consented
                         AND of customers who did not object"]
country                PT
segment                B
consent_event_id       29052633-f1c8-4e29-aded-794fed2f07e3 †  the ledger row relied on
consent_occurred_at    2026-09-21T10:14:02Z †
policy_country         PT
policy_confirmed_at    2026-09-20T00:00:00Z †
policy_confirmed_by    M. de Sousa Pereira †
policy_statute         Lei n.º 41/2004, arts. 13.º-A e 13.º-B
gate_decided_at        2026-09-22T09:03:11.204Z

--- what was going to be sent, written BEFORE sending -------------------------
template_name          reactivacao_cliente_transaccionado_v1
template_language      pt_PT
template_approval_id   (Meta's id for the approved template)
body_intended          Olá Maria, fala a Ana da Cascais Demo. Já passou algum
                       tempo desde que tratámos da sua casa em Cascais…
status                 intended          →  sent
intent_recorded_at     2026-09-22T09:03:11.331Z

--- the outcome, written against the SAME row ---------------------------------
provider               twilio
provider_message_id    SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
body_sent              Olá Maria, fala a Ana da Cascais Demo. Já passou algum
                       tempo desde que tratámos da sua casa em Cascais…
sent_at                2026-09-22T09:03:12.918Z
delivered_at           2026-09-22T09:03:19.402Z
failed_at              null
error                  null
```

## 1.1 Does it answer the question on its own?

*Why did this person receive this message?*

> Because on 22 September at 09:03 the gate found documented consent recorded in
> ledger row `29052633`, given on 21 September; resolved `+351912345678` to
> Portugal; and read a Portuguese policy row confirmed on 20 September by
> M. de Sousa Pereira under Lei n.º 41/2004 arts. 13.º-A and 13.º-B. It was sent
> as approved template `reactivacao_cliente_transaccionado_v1`, the text is
> above, Twilio accepted it as `SMxxx…` and delivered it seven seconds later.
> The permission carried one obligation, recorded with it.

One row, no join. The two ids are there for anyone who wants to *verify* the
answer against the ledger, not to assemble it.

---

# 2. The evidence is COPIED, not joined — and this is the part writing the row taught

The obvious schema stores `consent_event_id` and `policy_country` and joins the
rest. It is wrong, and not for performance reasons.

> **`jurisdiction_policy` is mutable by design.** Ireland's expiry, Spain's
> segment C, the ePrivacy Regulation landing — each is an `UPDATE`, which is the
> whole reason the policy lives in data rather than code.

So a join answers *"what does the law say now"*. The question asked of a send
record is always *"what authorised this send then"*. In a year those are
different sentences, and the join gives the confident wrong one — a regulator
reading it would be told the message was sent under a policy that did not exist
on the day.

Hence `policy_confirmed_at`, `policy_confirmed_by`, `policy_statute` and
`gate_basis` are **snapshots taken at decision time**, stored as text on the
send row. The ledger id can be a foreign key, because `consent_events` is
append-only and a row there cannot change under us — the one table in the system
a join to is safe.

**The rule this generalises to:** a record that justifies a past action may join
only to immutable data. Everything mutable must be copied at the moment it was
relied upon.

## 2.1 And the authorisation must be immutable once written

The gate columns are writable on insert and never again — a trigger refusing any
`UPDATE` that touches them, while allowing the outcome columns. Otherwise a row
recording a send that should not have happened can be edited afterwards into one
that should have, which is the only edit anyone would ever be tempted to make.

The outcome columns stay writable because the outcome genuinely arrives later.

---

# 3. Intent before send, and the key that makes "intended" resolvable

§3.10, applied exactly: the row is written **before** the send, never after.

```
1. gate decides            → refused? write the row with status='refused' and stop
2. INSERT status='intended' with the evidence, the body and an idempotency_key
3. send, passing that key to the provider
4. UPDATE the same row: provider_message_id, body_sent, sent_at, status='sent'
   (or failed_at, error, status='failed')
```

A send row written *after* a successful send cannot record a send that failed
halfway, and "we sent something and lost the record" is the worst available
outcome in a regulatory table.

**What a crash between 2 and 3 leaves:** a row at `intended` with a body and no
provider id. That state is ambiguous — did it go out? — and an ambiguity in this
table is not acceptable, so:

> **The `idempotency_key` is generated before the send and passed to the
> provider.** A reconciliation pass asks the provider what became of that key
> and completes the row. Without the key, `intended` is permanently
> undecidable; with it, it is a question with an answer.

That is the difference between write-before-send and write-before-send *done
properly*. The first version of this design had the ordering and not the key,
which would have produced rows nobody could ever resolve.

**Refusals are recorded too**, in the same table with `status='refused'`, the
layer and the reason. "Why did this person NOT receive it" is a real operator
question, and the refusal counts per client are how §3.17's "which client needs
me today" gets answered without inventing a second table.

---

# 4. The three invariants, and two of them are check constraints

Two of the three are structural rather than observed, which is better than the
Concierge's six managed to be:

```sql
-- 1. Nothing is recorded as sent without a permission on the same row.
constraint send_requires_permission check (
  status <> 'sent' or (
    gate_verdict = 'permitted'
    and consent_event_id  is not null
    and gate_basis        is not null
  ))

-- 2. Nothing is sent into a jurisdiction no lawyer confirmed.
constraint send_requires_confirmed_policy check (
  status <> 'sent' or (
    policy_confirmed_at is not null
    and policy_confirmed_by is not null
  ))

-- 3. The reserved range is never sendable, at the database as well as the gate.
constraint send_never_reserved check (
  status <> 'sent' or phone_e164 !~ '^\\+351900000[0-9]{3}$'
  )
```

Because the row is written before the send, a send cannot occur without a row
that passed these — so invariants 1 and 2 are enforced by the database rather
than checked afterwards. The gate could be bypassed by a future caller and the
database would still refuse to record the send, which is the only version of
this guarantee worth having.

**The third invariant cannot be a constraint** and has to be observed, because
it spans tables:

> *No message was sent to a contact after an objection was recorded.* For every
> `sends` row with `sent_at`, there must be no `consent_events` objection for
> that `(client_id, phone_e164)` with `recorded_at <= sent_at`.

### 4.2 Its cadence, decided rather than defaulted

**Every 5 minutes over a rolling window, plus a nightly full sweep over 30
days.** The number matters less than the reasoning, which is in `0016`'s header
and turns on one fact:

> The violation condition uses `recorded_at`, not `occurred_at`. An objection we
> learn of tomorrow, about a send from yesterday, has `recorded_at > sent_at`
> and is **not** a violation — we could not have known. So nothing arrives late
> that turns an old send into a violation, every violation is detectable within
> seconds of happening, and a rolling window is sufficient.

Hourly or daily would bound the damage identically — the messages are already
sent — but would delay the *apology*, and a client learning on Thursday that we
messaged someone who opted out on Tuesday is a different conversation from
learning within the hour. Every 30 seconds buys nothing, because the response is
a human one.

Not event-driven after each batch, though that would be tighter: a check that
runs because a caller remembered to call it is not a control (§12). The
scheduled sweep covers the paths that forget, including the ones not written
yet.

**The nightly sweep exists for a different reason than late data** — it catches
a bug in the rolling check itself: a window boundary, a timezone, a clock skew.
A check that only ever examines the last fifteen minutes can be quietly broken
for months.

### 4.3 What happens when it fires: alert AND halt

The same asymmetry as opt-out recognition — halting is cheap and reversible, so
it happens automatically; anything irreversible waits for a person.

| | |
|---|---|
| **Halt** | the client's campaigns stop immediately. If this fired, either a decision was acted on too late or something is sending outside the gate. Both mean the *next* send is unsafe, and the cost of being wrong is a pause |
| **Alert** | critical, on the invariant channel (§3.7), naming the send row, the objection row, and the gap between them |
| **Record** | an `invariant.violated` event, consistent with the existing six |
| **Does not** | write an objection — one already exists, which is the point. And it does not try to unsend: it cannot, and pretending otherwise is §0, narrating a state we have not secured |

The view also reports **which of two causes** it was: `race` if the objection
was recorded after the gate decided, `stale_evidence` if before. A race is a
design limit; stale evidence is a bug in whatever held the decision, and they
need different responses.

### 4.4 What this invariant cannot catch, said plainly

A **total bypass** — something sending without inserting a `sends` row at all —
is invisible to it, because it iterates `sends` rows. Closing that needs a
different check: reconciling the provider's own message log against this table.
That is the §4.9 *who watches the watchers* shape, and it is **not built**.
Written down so nobody reads this invariant as covering more than it does.

## 4.1 And one check on the wire, not on a flag

`body_sent` is recorded from what the provider actually accepted, and a fourth
check compares it with `body_intended`. The AI-disclosure lesson: a guarantee
verified against an internal variable is a guarantee about the variable. If the
two differ, something rewrote the message between the gate and the wire, and
that is worth knowing loudly.

---

# 5. What this does not include

No sending. No template submission. No campaign engine. This is the record and
its guarantees; the thing that fills it in comes after, and after the Meta gate.

`mayContact()` still has no caller, deliberately. The first caller will be the
send path, and it will be written so that the insert of §3 step 2 is the only
way it can proceed.
