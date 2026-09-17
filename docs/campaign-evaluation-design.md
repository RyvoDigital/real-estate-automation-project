# The bulk refusal pass — a campaign of 300 that refuses 280

**Design · 17 September 2026 · nothing in this document has been built**

> Asked for: how a campaign of 300 contacts that refuses 280 produces its
> record, and what the operator sees. Working it through produced one finding
> that changes the send path, in §3.

---

# 1. The shape is recorded before the campaign runs

The reason for batching refusals was never efficiency. It is that **"300
evaluated, 20 contactable, 280 refused" must exist on disk before the first
message goes out.** A run that records refusals as it goes and dies at contact
140 leaves no answer to *how many there were* — and the count of people we
decided not to contact is the compliance artefact, not a by-product.

So evaluation and sending are two phases, and the first completes before the
second begins.

```
PHASE 1 · EVALUATE                      one pass, three writes
  read every fact in bulk
  decide all 300 purely
  write the run row, the refusals, and the permitted list
                                        ⟵ the campaign's shape is now durable
PHASE 2 · SEND                          one contact at a time
  re-decide immediately before each send   ⟵ see §3
  mint a permit, dispatch, record the outcome
```

---

# 2. Phase 1 reads in bulk, which is only possible because the gate is pure

Three hundred contacts through `mayContact()` would be six hundred round trips.
Instead:

```
1 query   consent_by_contact  where client = ? and phone_e164 in (…300)
1 query   jurisdiction_policy where country in (…the distinct countries)
300 calls decideGate({ phone, consent, policy })     ← pure, no IO
```

Two queries and three hundred pure decisions. **This is the purity of
`decideGate` paying a dividend it was not designed for** — it was made pure so
the layer order could be tested exhaustively, and the same property makes bulk
evaluation trivial. A gate that read the database itself would have forced
either 600 queries or a second, subtly different bulk implementation of the same
rules.

Contacts whose number does not resolve never reach the consent query: they are
refused at layer 2 from the number alone.

---

# 3. THE FINDING: a permission decided in phase 1 is stale by phase 2

If 300 are evaluated at 09:00 and the twentieth permitted contact is sent at
14:00, that send rests on a decision five hours old. An objection recorded at
10:00 would be missed — and `invariant_send_after_objection` would report it,
correctly, with `cause = 'stale_evidence'`.

**So a campaign built this way manufactures the exact condition the invariant
exists to catch.** The race the gate cannot close is supposed to be seconds
wide; this would widen it to the length of a campaign.

The resolution, and it is a distinction worth keeping in the vocabulary:

> **Phase 1 produces a FORECAST. Phase 2 takes the DECISION.**
>
> The gate runs twice per permitted contact. The first run tells the operator
> what the campaign looks like and writes the refusals. It authorises nothing.
> The second runs immediately before the send, and it alone mints a permit.

Consequences:

- A contact permitted in phase 1 and objecting at 10:00 is **refused in phase 2**
  and gets a refusal row of its own, with `gate_decided_at` at 14:00. The
  forecast said 20 contactable; the run reports 19 sent and 1 refused later.
  Both are true and both are recorded.
- The forecast's permitted contacts are therefore **not** `sends` rows. They are
  the run's target list. `sends` holds refusals and real attempts — decisions
  that were acted on — and nothing provisional.
- The window between decision and send returns to what it was: the seconds
  inside `dispatch()`.

This also answers a question §5 of the send-path design left open: nothing
pre-creates rows for permitted contacts, so `SendPermit.record` stays an insert
rather than becoming a claim.

---

# 4. What gets written

## 4.1 `campaign_runs` — the shape, one row

```
id, client_id, automation, campaign_id
started_at            2026-09-22T09:03:00Z
target_count          300        ← decided before anything else happens
forecast_permitted    20
forecast_refused      280
refusal_breakdown     {"no_ledger_basis": 214, "not_confirmed": 41,
                       "objected": 18, "unparseable": 5, "platform_blocked": 2}
status                evaluating → evaluated → sending → complete | halted
sent_count, refused_late_count, failed_count, halted_reason
evaluated_at, finished_at
```

`refusal_breakdown` is a count per reason and it is the operator's headline. It
is stored rather than derived because the run's own numbers must survive a
later re-evaluation that would produce different ones.

## 4.2 `sends` — one row per refusal, written in one insert

Per contact, not a summary: *"why did this person not receive it"* is the
question, and an aggregate cannot answer it. Each carries the layer, the reason,
the detail sentence and a deterministic key, `ref:<run_id>:<phone>`, so a
re-evaluation of the same run cannot duplicate them.

**A refusal row is a decision at a time, not a state.** Re-evaluating next month,
after Portugal is confirmed, will refuse far fewer — and the old rows stay,
because they record what was decided then.

### 4.2.1 A new row every time, and the volume is handled by not re-asking settled questions

The alternative — updating a count on an existing refusal — is rejected, and not
because of storage. **It would mutate a record of a past decision**, which is
precisely what the freeze on `sends` and lesson §11b forbid on the send side.
One table must not hold two philosophies. And any dedupe key is a new
opportunity for two decisions that differ to look identical: `no_ledger_basis`
arises both from a contact nobody has said anything about and from one carrying
an unevidenced claim, and the difference is in the detail sentence — deduping on
a reason would merge them, deduping on prose is worse.

The volume is handled instead by a distinction that is real rather than
convenient:

| | |
|---|---|
| **Terminal refusals** — `objected`, `unparseable`, `invalid`, `reserved_test_number` | Facts about the CONTACT. They cannot become permissions: an objection is permanent by design, and a number that cannot be read will not start parsing. Recorded **once**, and the contact is then excluded from future target lists |
| **Provisional refusals** — `not_confirmed`, `no_ledger_basis`, `existing_customer_unknown`, `consent_request_unknown`, `consent_expired` | Facts about OUR state, or about what the agency has told us. Every one of them flips the day a lawyer confirms a row, an agency declares a segment, or an import lands. Recorded **per run**, because the answer really did change |

So the 18 who objected and the 5 unreadable numbers are written once ever and
then excluded, with the exclusion visible in the run's shape — *"23 excluded
before evaluation: 18 objected, 5 unreadable"* — rather than silently dropped.
The 198 with nothing recorded are written each run, because the next run may
genuinely differ.

That reduces volume exactly where repetition is **guaranteed** rather than
merely likely, and it never rewrites a decision.

## 4.3 The permitted list

Held on the run so phase 2 can resume after a crash, and so the forecast can be
compared with what actually happened. Not in `sends`, per §3.

---

# 5. What the operator sees

```
Reactivação — Cascais Demo                     22 Sep, 09:03      EVALUATED
──────────────────────────────────────────────────────────────────────────
  300 contacts evaluated          20 contactable          280 refused

  Why the 280                                              contacts
  ─────────────────────────────────────────────────────────────────
  Nothing recorded about them                                   214   ▸
    · 198 nobody has said anything about
    · 16 the agency claimed something we cannot use
  Portugal is not confirmed by a lawyer                          41   ▸
  They objected                                                  18   ▸
  The number could not be read                                    5   ▸
  Meta will not deliver to +1                                     2   ▸

  ▸ expands to the contacts, each with the sentence the gate produced
──────────────────────────────────────────────────────────────────────────
  [ Send to the 20 ]        [ Re-evaluate ]        [ Export the refusals ]
```

## 5.0 The screen must not read as a statement about the present

Opened a month later, that view says *"41 refused — Portugal is not confirmed by
a lawyer"* about a Portugal that was confirmed three weeks ago. Everything on it
is true about 22 September and false about today, and nothing in the layout says
which of the two it is describing.

So the run's age is not a detail in the corner:

```
Reactivação — Cascais Demo
Evaluated 22 Sep 09:03 · 26 days ago · the world has changed since

  ⚠ Portugal was confirmed on 20 Sep, after this evaluation ran.
    41 of these refusals would not happen today.
    [ Re-evaluate ]
```

Three rules for that view:

1. **The evaluation timestamp is in the header, with an age**, not a tooltip.
   "26 days ago" is read; a date is skimmed.
2. **A run older than its inputs says so.** The check is cheap: any
   `jurisdiction_policy.confirmed_at` or ledger event later than `evaluated_at`
   means at least one refusal is stale, and the banner can name which reason.
3. **Re-evaluate is the action offered from that banner**, not buried with the
   other buttons. The most common reason a campaign refused is a thing that has
   since been fixed.

This is the same failure as §5b one level up: a refusal count is a true fact
about one execution, and a screen that shows it without its age invites it to be
read as a fact about the world.

Three things this screen is designed to do:

**Make the largest refusal the most legible.** 214 of 280 is "nothing recorded
about them", and the split underneath is the one that matters commercially: 198
are genuinely unknown, 16 carry a claim the agency could still evidence. The
second number is a worklist; the first is not. That is the whole point of
`claimed_unevidenced` being a separate state, arriving on a screen.

**Say "Portugal is not confirmed by a lawyer" rather than "not_confirmed".** The
refusal reasons already carry operator wording (§11); this screen is where that
work is spent. An operator who sees 41 blocked by a missing confirmation knows
to chase Margarida. One who sees `not_confirmed` files a bug.

**Offer re-evaluation as a first-class action**, because the most common cause
of a large refusal count is a thing that gets fixed — a confirmation, a segment
declaration, an import. The campaign is not wrong; it is early.

## 5.1 And the per-contact answer

Searching a number anywhere in the cockpit shows its send history: every
refusal with its date, reason and sentence, and every message with its basis.
That is the same query behind *"why did this person receive this message"* and
*"why did this person not"* — one table, no join anyone has to think about.

---

# 6. What this needs

- `campaign_runs`, as above — a new migration, `0018`.
- `sends.gate_layer` / `gate_reason` / `gate_detail` already exist and already
  have the constraint that a refusal must state its layer and reason.
- The bulk evaluator, which is pure over the facts it is handed and therefore
  testable with 300 synthetic contacts and no database.
- The screen, built standalone per the §3.17 decision, not wired into the
  single-agency navigation.

Nothing here can send: phase 2 ends at `dispatch()`, whose provider adapter
still throws `not implemented`.
