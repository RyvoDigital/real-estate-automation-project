# The shared-claims register — C0

**The cross-screen consistency sweep, 20 September 2026.** Every Stage B design
read against every other, looking for the class of defect a brief cannot catch:
**two screens that are each right on their own terms and disagree with each
other.** The known example — automation 04 drawn as running on settings while
the gate screen one click away refused every property — was found by luck. This
was the deliberate pass.

It found **22 disagreements**, and the register below is what the build
consumes: the facts that must come from one function rather than from two
correct readings of the same table.

---

## 0. The root cause, which most of the list collapses into

🔴 **The screens were designed in two sample worlds that were never reconciled.**

- A **mid-September world** — Today, the client landing, Policy, The Month,
  settings, the property screens, the operations batch. Portugal is unconfirmed,
  02 cannot send, nothing has been calibrated.
- An **October world** — the contact record, Templates, the forecast's stale
  branch, the presented calibration. Portugal was confirmed on 2 October, 02 and
  05 have sent, Ana Costa answered the calibration on 23 September.

Nearly every disagreement is a screen from one world sitting beside a screen
from the other.

**Why this matters less than it looks, and more.** Less: the built screens read
one database, so a disagreement about *what is true today* cannot survive
contact with real data. More: the sample world is where a designer reasons, and
two incompatible worlds meant **every screen was checked against a brief and
none against its neighbour**. The defects that survive the build are the ones
below marked 🔴 structural — and they would have shipped.

🔒 **The lesson, and it outlives these screens:** sample data is not decoration.
One world, one date, one set of identifiers, fixed before the first screen — or
the screens cannot be read against each other at all, which is the only way this
class of defect is found.

---

## 1. Structural — survives contact with real data, must be fixed

### S1. 🔴 "Price with VAT" instructs a computation the system is forbidden to perform
- **Compliance → Policy**, the *Requires* column: `energy class · AMI licence ·
  price with VAT`.
- **Property → the gate**, the third requirement: *"The price, as the agency
  supplied it"*, law: *"never generated or inferred by this system"*.

These are opposite instructions about the same field. **The gate is right**, and
the code settles it: `publication/piece.ts` — *"The agency's price. Never
computed, rounded or converted"*; `publication/gate.ts` refuses with
`not_from_the_agency` when no price was supplied. A policy cell reading *price
with VAT* would have a screen asking for arithmetic that the piece assembler
exists to refuse. **Fixed in the design 20 Sep.**

### S2. 🔴 Spain is told to the agency as a conclusion, and it is an absence
- **Compliance → Policy**: *"Spain — no analysis … Not a row with blanks: no
  row."*
- **Presented → the declaration**: *"Em Espanha e Portugal ainda não sabemos:
  estamos à espera da confirmação de uma advogada, e até lá não escrevemos."*

The presented screen tells the agency Spain is **awaiting a lawyer**. Nobody has
analysed Spain at all. This collapses the conclusion/absence distinction on the
one screen an agency actually reads — the distinction Policy spends a paragraph
defending, in the words *a conclusion and an absence are never one glance apart*.
**Needs a Portuguese sentence that says the two countries are in different
states**, which is the operator's call on wording; flagged, not invented.

### S3. 🔴 The AMI licence appears as held, missing and revoked — and one of them contradicts the refusal order
Held (settings, the gate), missing (the client landing, `requirement_unmet`),
revoked (Today, the re-check notice). Sample-world in part — but the landing's
`requirement_unmet` also **contradicts the gate screen's central finding** that
`policy_not_confirmed` fires first and *"would refuse even if all three were
held"*. A screen showing a requirement-level refusal while the policy row is
unconfirmed is showing a refusal that cannot have fired.

### S4. 🔴 "Still advertisable" applied to a property whose region is undeclared
- **Compliance → expiries** puts `CA-0420` under *Expiring soon · still
  advertisable*.
- **Property → listings** says of the same property: *não sabemos o que a região
  exige*.

Calling a region-undeclared property advertisable is exactly the conclusion the
gate refuses to draw, on the screen that argued hardest for not drawing it.

### S5. 🔴 47 clearances exist on a day when no clearance can exist
Expiries asserts 47 granted clearances; Policy on the same day says every
Portuguese property is refused before any clearance exists. Both cannot be true
of one date.

### S6. 🔴 Four vocabularies for one state machine
`held` · `off` · `never run` · `enabled, not run` (the landing's clock strip);
`held by its gate` · `off` (settings); `Cannot send` (The Month). One automation
state, four sets of words. 🔒 This is the clearest candidate for one function
returning one vocabulary.

### S7. 🔴 Two conventions for a lead's name on operator screens
Today, the landing and the contact record mask (`Inês …5521`); the operations
batch prints full names (`Inês Brito`). Read side by side, the masking looks
like a different person.

### S8. 🔴 One registration, two clock rules
The gate: *re-confirm after 90 days · 13 days ago*. The re-check notice: *never
confirmed — asked now, not after 90 days*. The same AMI registration under two
different rules about when it is asked again.

### S9. ⚠️ A contact's phone is also the agency's escalation number
`+351 912 345 678` is a lead's number on the contact record, an imported row in
the import plan, **and** `escalate_to` on settings — whose refusals scenario
states the rule that one number cannot be both. Sample data, but it reveals a
missing validation: nothing refuses an import row that matches the client's own
escalation or agent numbers. **Worth a guard**, not just a sample fix.

---

## 2. Sample-world — evaporates on real data, recorded so it is not re-found

D1 the client attribution swap (Today gives Casa Atlântica's certificates to
Marbella Sur and vice versa; Today is right about RAICAA only, because RAICAA is
the Andalusian register) · D2/D22 rehearsal-or-real and three onboarding dates ·
D3 47 clearances split 10/2/35 against 2/2/43 · D5 six properties against
thirty-eight · D6 Portugal confirmed on three different dates · D10 thresholds
calibrated or not · D11–D13 the landing's sidebar counts against the screens they
open · D15 a weekly report of work The Month says never happened · D17 a lead
both escalated 96 minutes ago and silent for 121 days · D18 six different
contact-list sizes · D20 a review request sent for a close with no party.

🔒 **D1 was invisible for a reason worth keeping**: sample property references
share their numeric part across clients (`CA-0388` / `MS-0388`), so only the
prefix distinguished them. **Sample identifiers must differ in more than a
prefix**, or a swap is undetectable by eye.

---

## 3. The register — facts that must come from one function

This is C0's deliverable. Each row is rendered by two or more screens; each gets
one function, and a test asserts every screen that renders it calls that
function. Ordered by how many screens depend on it.

| The fact | Screens | Owner (to build) |
|---|---|---|
| Portugal's policy row: confirmed or not, and when | 8 | `policyStatus(country, region)` |
| 04's gate refuses every Portuguese property today | 7 | the same one |
| The AMI licence: held, missing, revoked, with its clock | 6 | `registrationStatus(client)` |
| A client's contact-list size | 6 | `counts(client)` |
| Automation on / off / held, and the reason | 5 (+S6) | `automationState(client, key)` |
| 02 cannot send, and why | 5 | the same one |
| Thresholds calibrated, by whom, when | 5 | `calibrationState(client)` |
| 05 cannot send, and why | 4 | `automationState` |
| Clearance denominators: total, lapsed, expiring, good | 2 | `clearanceCounts(client)` |
| Which client owns each certificate and sender | 3 | the read itself — never re-attributed in a view |
| Template approvals and rejections | 4 | `templateState(client)` |
| Escalations waiting, for this client | 3 | `counts(client)` — **built, `lib/counts.ts`** |
| Anomaly count and its window | 3 | `counts(client)` |
| Closes reported and asked | 2 | `reviewCounts(client)` |
| The Meta verification and lawyer waits, with their ages | 3–4 | `waitingRoom()` |
| Spain's status | 3 | `policyStatus` — see S2 |
| What an advertisement must carry in Portugal | 2 | `policyStatus(...).requires` — see S1 |
| The operator-level waiting count | 6 | `counts()` — **built** |

**Already done:** `lib/counts.ts` (C2, committed) is the first of these. It was
written before this sweep landed and the sweep confirms its premise — the
landing's sidebar disagreed with **every** screen it links to.

---

## 4. What this changes in the plan

1. **C0 produced a register, not a clean bill.** The nine functions above are
   built as their screens land, each with the test that every caller uses it.
2. 🔒 **One sample world.** Before C3, a single fixture: one date, one set of
   clients, identifiers that differ in more than a prefix. Screens are then
   readable against each other, which is the only way this class is caught.
3. **S2 and S6 need the operator**: the Portuguese sentence that keeps Spain's
   absence from reading as a conclusion, and which vocabulary wins for the
   automation state machine.
4. **S9 wants a guard**, not a sample fix: an import row matching the client's
   own escalation or agent number is refused at the plan step.
