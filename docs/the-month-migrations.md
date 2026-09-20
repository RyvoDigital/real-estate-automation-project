# The Month — the six migrations, designed before any of them is written

**21 September 2026.** The Month (brief I §2.10, §2.11) is the only remaining
operator surface whose data does not exist. This document decides what those
tables are and in what order they land, so that the migrations are written
against a settled design rather than discovered one file at a time.

🔒 **Nothing here is applied.** No write to production without asking. Each
migration is written, proved in rolled-back transactions, blessed and applied as
a separate deliberate act, with `0032`'s treatment throughout: alone, in a
transaction, proving its preconditions and refusing by name.

---

## 0. The one decision everything else follows from

> **Revenue is derived from contract PERIODS, never from who is active today.**

`clients.status` is free text with no dates. If a client churns in March,
recomputing "who is active" makes January's revenue drop retroactively, and the
progression chart would lie about the past — silently, and in the direction that
flatters nobody.

So a month's recurring revenue is the sum over the contract periods covering
that month. **History is then stable by construction** rather than by care, and
no figure on The Month can change because of something that happened later.

---

## 1. The six, in the order they must land

| # | Migration | Why this position |
|---|---|---|
| **0041** | `client_contracts` | Everything else refers to it. Nothing depends on it existing first |
| **0042** | `client_payments` | References a contract, so it follows 0041 |
| **0043** | drop `clients.monthly_fee_eur` | 🔴 **After** 0041, never before: the drop is only safe once the replacement exists, and `0036`'s lesson is that the deploy is a precondition of the migration |
| **0044** | `web_clients` | The second business. Independent of 0041–0043 |
| **0045** | `web_contracts` | References `web_clients`, so it follows 0044 |
| **0046** | `costs` + `cost_checks` | Refers to both client kinds, so it is last |

🔒 **0041–0043 are one business and 0044–0046 are the other.** The Month works
with only the first three — it shows the automation side's revenue and says the
web side is not recorded yet. That is deliberate: a page that needs all six
before it shows anything is a page that ships once.

---

## 2. What each table is, and the decisions inside it

### 0041 `client_contracts` — append-only

| Column | Meaning |
|---|---|
| `client_id` | the agency |
| `starts_on` | when billing starts |
| `ends_on` | null until it ends |
| `monthly_fee_eur` | 🔒 **net of VAT**, and the column comment says so |
| `setup_fee_eur` | net of VAT |
| `setup_terms` | the instalment plan, as text |
| `automations` | which automations the contract covers |
| `recorded_by`, `recorded_at` | §1.10 — who entered it, and when |
| `supersedes` | the record a correction replaces |

**Append-only by the `0012` mechanism, unchanged**: a `before update or delete`
row trigger, a `before truncate` statement trigger, **and** a `revoke`. All
three, for `0012`'s own stated reasons — the trigger is the guarantee, the
revoke is the belt, a future default-privileges change can restore what the
revoke took, and a future superuser can drop a trigger.

🔴 **A correction is a new row pointing at the old one.** There is no edit. The
Month shows the current terms and can show what they replaced, which is the
difference between a record and a rumour.

**Open question for the operator — Q1.** `automations` as a text array of
automation keys, or a join table? A text array cannot be constrained to real
keys without a trigger; a join table is correct and is a second migration. My
reading: **text array with a CHECK against the five keys**, because the set is
fixed and small and has not changed since `0001`.

### 0042 `client_payments`

`contract_id`, `client_id`, `amount_eur` (net), `received_on`, `recorded_by`,
`invoice_ref` (nullable until invoicing is read).

🔴 **`contract_id`, not just `client_id` — a correction to the plan.** Brief
§2.10 lists only `client_id`. That is not enough: a setup fee is owed **against
a contract**, and if the terms are superseded mid-instalment there is no way to
say which agreement a payment discharged. An outstanding balance computed
against the wrong contract is a figure that looks right and is not.

`client_id` stays alongside it, denormalised deliberately, so a payment can be
read per client without a join and so a payment orphaned by a contract deletion
is impossible — contracts are append-only, so there are none, but the column
costs nothing and removes the question.

### 0043 drop `clients.monthly_fee_eur`

`0032`/`0036` treatment: **prove it empty, then drop it alone.**

Nothing writes it — the onboarding insert at `lib/actions.ts` never sets it —
and nothing reads it. Two sources for one fee would disagree, and the one with
no writer would be the one somebody trusted.

🔴 **The precondition is that 0041 exists AND the cockpit reads it.** `0036`'s
lesson, and `proof:bless`'s `deploy_precondition` now enforces exactly this.

### 0044 `web_clients`

D5: Ryvo also sells websites on retainers, and **that is today its only real
revenue.**

🔒 **A WEB CLIENT AND AN AUTOMATION CLIENT ARE DIFFERENT KINDS OF THING, AND THE
SCHEMA SAYS SO** — decided 21 Sep 2026. Not one table with nullable columns for
whichever half does not apply:

> **A nullable column meaning "not applicable here" is indistinguishable from
> one meaning "nobody has entered it yet"**, and that distinction is the one
> this entire system turns on. `clients.rehearsal` has no default for exactly
> this reason; a merged table would reintroduce the problem in a dozen columns
> at once.

And the practical half, which is worse: `clients` carries a WhatsApp number, a
sender SID, automation configs and a rehearsal flag, none of which a website
client has. Putting them in one table means **every automation screen has to
remember to exclude them**, and one screen forgetting is a web client appearing
in an escalation queue.

The two models differ in substance, not only in shape:

| | automation client | web client |
|---|---|---|
| revenue | contract, monthly fee derived from the period, setup fees as events | retainer and project fees |
| costs | the automation cost model — per-message, per-run, model spend | hosting, domains, tooling |
| beneath it | leads, listings, sends, a consent ledger | nothing |

### 0045 `web_contracts`

The same shape as `client_contracts`, append-only by the same mechanism.

**✅ Q2 answered, 21 Sep 2026: separate.** Follows directly from 0044 — they
are different kinds of thing, so a merged contracts table would need two
nullable party columns and a check that exactly one is set, and every query
would carry a filter it can forget. If a web client ever buys an automation, a
shared billing party links the two rows when it first happens — never a merged
table.

### 0046 `costs` and `cost_checks`

`costs`: scope (`client` · `web_client` · `automations` · `web` · `company`),
`amount_eur`, cadence, `renews_on`, `ended_on`, and 🔴 **both a paid and an
owed side — see below.**
`cost_checks`: supplier, month, `invoice_total_eur`, `checked_by`.

#### 🔴 Euros only, and NO currency column — decided 21 Sep 2026

Every money column is named `*_eur` so nobody has to look it up, and nothing
converts anything anywhere.

A `currency` column nobody sets is the fifth unwritten column of the week: it
would default to `'EUR'`, every row would carry it, no code would branch on it,
and the first time somebody billed in sterling they would set it and discover
that no figure on The Month had ever read it. If a client is ever billed in
another currency **that is a decision to make then**, with the conversion rules
and the as-at dates it actually needs — not a column prepared for now and
trusted later.

#### 🔴 Paid and owed are two facts, never one total

A cost you have paid and a cost you owe are different facts about the business.
Collapsing them makes the margin **optimistic or pessimistic depending on the
day of the month** rather than on how the business is doing — the same figure
reading differently on the 2nd and the 27th, for no reason anybody could name.

So `costs` carries the agreement, and what has actually gone out is recorded
against it. The Month shows **two lines, never one total**, and the absence of
a total here is the same rule as the weekly report's: the lie enters at the sum.

🔒 **Costs are not append-only.** A subscription's price changes and the row is
the current agreement, not a historical claim about a month. `ended_on` carries
the history that matters. This is the one table here where an update is the
correct operation, and saying so explicitly is the point — otherwise somebody
applies the append-only pattern by symmetry and makes a price change into a
second row that double-counts.

---

## 3. What every one of them shares

1. **Alone, in a transaction, with `0032`'s treatment.** Preconditions proven,
   never assumed; refusal names what it found.
2. **A proof in `db/tests/`, registered in `proofs.json`**, with the three cases
   — two refusals and 🔴 **the resting state, which must NOT refuse.** That
   third case is what caught `0036`, and it is the one that gets skipped.
3. **No defaults that assert anything** (lesson 13). A money column with
   `default 0` claims a contract worth nothing; every one of them is nullable
   or required, never defaulted.
4. **Net of VAT, in the column comment**, on every money column. The cockpit
   never computes VAT and the page says so.
5. 🔴 **Nothing is a foreign key to `clients` that should not cascade.**
   `on delete cascade` on a contract would let deleting a client erase the
   record that they were ever billed. **`on delete restrict`** — the record
   outlives the row.

---

## 3b. 🔴 Who enters what, and what the page says when nobody has

**Operator's instruction, 21 September 2026, and it changes what the page is:**

> *Every one of these tables needs somebody to enter something, and the page
> goes stale the moment that stops happening. Design the not-entered state as
> the PRIMARY one, because for the first months it is.*

This is the difference between a page that works and a page that works **on the
day it is demonstrated**. Every table below is empty today and will stay empty
until a person types into it, and there is exactly one person.

| Table | Who enters it | When | How often, realistically |
|---|---|---|---|
| `client_contracts` | the operator | a contract is signed; terms change; a contract ends | **once per client, ever**, plus rare corrections |
| `client_payments` | the operator | setup money arrives | **per instalment** — the only recurring entry on the automation side |
| `web_clients` | the operator | a website client is taken on | once per client |
| `web_contracts` | the operator | the retainer is agreed or changes | once per client |
| `costs` | the operator | a subscription starts, changes price, or ends | a handful a year |
| `cost_checks` | the operator | a supplier invoice is reconciled | **monthly, and this is the one that lapses** |

### The failure this table predicts

🔴 **`cost_checks` is monthly and everything else is almost never.** That
asymmetry is the whole risk: the tables somebody touches once are entered
correctly and stay correct, and the one that needs attention every month is the
one that quietly stops — leaving a margin computed from costs that were last
confirmed in March.

**A page whose costs half is four months stale looks exactly like a page whose
costs half is current.** That is the shape this project has found nine times
today, arriving in the one place where nobody will be looking for it.

### So the schema carries the answer, not the page

Each of these tables needs the moment it was last confirmed to be a **fact in
the row**, not a `max(created_at)` the page infers:

- `costs` carries `confirmed_on` and `confirmed_by` — *somebody looked at this
  subscription on this date and said it was still the price*. A row created in
  March and never confirmed since is four months stale **as a property of the
  row**, and any figure summing it says so.
- `cost_checks` is itself the record of a monthly look, so a missing month is
  visible by its absence — but 🔒 **only if the page enumerates the months and
  shows the gaps**, exactly as the weekly report's day-strip does. A list of
  the checks that exist can never show the month nobody checked.

### And the primary state, designed first

The Month's **empty state is its real state** for the next several months, so:

1. **A figure with no data says what is missing and who enters it** — not €0,
   and not a dash. *"No contract has been recorded for Marbella Sur. Their
   revenue is not zero, it is not known."*
2. **Every derived figure names its inputs' freshness.** A margin is recurring
   revenue minus costs; if the costs were last confirmed in March, the margin
   says so beside itself rather than in a footnote.
3. 🔴 **A month with an unconfirmed cost shows no margin at all** — the same
   mechanism as the weekly report's missing day, for the same reason. An
   incomplete figure presented as a figure is §5j, and the margin is the number
   most likely to be quoted at somebody.
4. **The page states what it is waiting for a person to do.** Not an error, not
   an empty chart: a list of what has not been entered, with who enters it and
   how long it has been that way. The page's own backlog, visible on the page.

> **A page that depends on a person and does not say so is a page that will be
> wrong without ever looking wrong.**

---

## 3c. 🔴 The two zeros, and why one of them is a crisis

**Operator, 21 September 2026 — the sentence the page has to be built around:**

> *Zero revenue with zero clients and zero revenue with three clients both read
> as €0, and the first is Tuesday while the second is a crisis. That
> distinction has to be in the design rather than in a paragraph about the
> design.*

This is the six-meanings-of-nothing rule arriving on the one page where the
number has a person's livelihood behind it, and it is worse here than anywhere
else it has appeared, for a reason worth stating: **every other zero in this
system is a zero of activity. This one is a zero of income.**

### The four zeros, which must never share a rendering

| what is true | reads as | what it is |
|---|---|---|
| no clients, no contracts | €0 | **Tuesday.** The business has not started billing. Nothing is wrong |
| clients exist, no contracts recorded | €0 | 🔴 **unknown, not zero.** Somebody is being served and nobody has written down what they agreed to pay |
| clients exist, contracts exist, none current this month | €0 | 🔴 **a crisis.** Every contract has ended, or none has started yet |
| the read failed | €0 | 🔴 **we could not look** |

🔒 **The middle two are the ones that will actually happen**, and they are the
two most likely to be rendered identically — because both have rows in
`clients` and neither has a figure to show.

### So the schema and the page both carry it

- **The denominator is never the client count.** It is *clients with a contract
  recorded*, shown beside *clients without one*, by name. A €0 over three
  clients where two have no terms recorded is not a revenue figure at all.
- 🔴 **A client with no contract is listed by name**, with *revenue not known*,
  never counted as zero into anything. `client_contracts` permits no row for
  them, which is what makes this expressible: the absence of a row is a
  different fact from a row saying zero, and a `monthly_fee_eur default 0`
  would have destroyed the distinction at the schema level.
- **A month with contracts that have all ended says so in words**, and says
  when the last one ended. That is the crisis case and it must not be reachable
  by rendering a number.
- **The first-ever month has its own sentence.** *"No contract has been
  recorded. Ryvo has no recorded revenue yet — this is the beginning, not a
  fault."* Different words from every other zero on the page, permanently.

> **A page that renders €0 for four different reasons has one number and no
> information.** The figure is the same in all four; only the sentence beside
> it is doing any work, which means the sentence is the design and the figure
> is the decoration.

---

## 4. What The Month must never do with this data

Carried here because it constrains the schema rather than only the page:

- 🔴 **Recurring and setup are never summed into one headline.** One is a rate,
  the other an event. They are separate columns and separate figures.
- 🔴 **A client with no contract recorded is UNKNOWN, not €0.** The schema
  permits no row; the page says *"revenue for them is not known"*.
- 🔴 **No forecast beyond the dates contracts already hold.** A projection is a
  number computed as though it were a fact about the world (§5j).
- **The figures are contracted, not invoiced.** The legal record of revenue is
  the AT-certified invoicing software, and the cockpit never presents its own
  number as that record.

---

## 5. The three questions before 0041 is written

1. **Q1** — `automations` as a checked text array, or a join table? *My reading:
   checked text array.*
2. **Q2** — `web_contracts` separate, or one table with a party type? *My
   reading: separate.*
3. **Q3** — 🔴 **`setup_terms` as text, or structured instalments?** Brief §2.10
   says "the instalment plan". As free text, the outstanding balance cannot be
   computed — only the total setup fee minus payments received, which is right
   until somebody agrees three instalments and wants to know whether the second
   is late. *My reading:* **text for 0041**, because no contract exists yet and
   the shape of a real instalment plan is exactly the thing a first contract
   will teach. Recorded in the gated ledger against `first_client` rather than
   guessed now.
