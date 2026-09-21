# The Month's tables — the schema as OBSERVED, not as intended

**Read from the live database on 21 September 2026**, through PostgREST's own
OpenAPI description (`GET /rest/v1/`), which reports the columns, their types,
their nullability and their comments as the database actually holds them.

**Re-read later on 21 September through the Supabase MCP connection**, which
queries `pg_catalog` directly. That second reading found four things the first
could not see or got wrong, each corrected below and marked 🔁:

1. `payments.received_on` is gone.
2. The money columns are `numeric(10,2)`, not plain `numeric`.
3. `client_contracts_uncorrected` is a view, so it has no key.
4. Every foreign key from a money table to its parent was `ON DELETE CASCADE`.

⚠️ **PostgREST's OpenAPI is itself an approximation.** It drops a numeric
type's precision, and it reports a view's key and foreign keys that it inferred
from the base table rather than read. When the two readings disagree,
`pg_catalog` is the answer.

> ## 🔴 THIS IS A RECORD. DO NOT RUN ANY OF IT.
>
> Nothing here is DDL and nothing here creates anything. It exists so that the
> next person — or the next session — builds against what the database *is*
> rather than against what a migration file in this repository *says*.

---

## Why this file exists

**The repository has been behind the database three times in one day**, and
each time it was found by a different accident:

| | how it surfaced |
|---|---|
| `client_contracts` | `0041` declares a `client_id` the table does not have; found when a foreign key was about to be written against it |
| `client_contracts_uncorrected` | `create or replace view` collided with an existing relation of the intended name; found by the migration failing |
| `payments` | `settled_on` / `written_off_on` found only by re-reading the schema before writing `0044` |

🔒 **What is verifiable about the cause, and what is not.**

What the repository can show: **no file in `db/` ever contained
`automation_client_id`, `monthly_eur`, `setup_eur`, `signed_by`, `settled_on`,
`settled_amount_eur` or `written_off_on` before the commits that read them back
out of the live database.** A pickaxe search over all history
(`git log --all -S<name> -- db/`) returns only `d314925`, `b618df0` and
`e94868f` — all written after those columns were observed in production. The
DDL that created these tables is therefore not recorded anywhere in this
repository, whatever its origin.

What the repository cannot show: **who wrote that DDL, or how.** This file does
not guess, because a confident account of a cause is exactly the kind of
durable record this project treats as a defect when it turns out to be wrong.

**The rule that follows does not depend on the cause**, which is why it is the
one worth keeping:

> **Read the deployed schema before writing a migration against it.** Not the
> migration file, not the design document, and not anybody's account of it —
> including my own from an hour earlier.

This record is the version of that rule which survives somebody forgetting it.

---

## How to re-read it

```bash
cd cockpit
node --env-file=.env.local -e "
  const u=process.env.NEXT_PUBLIC_SUPABASE_URL, k=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const s=await (await fetch(u+'/rest/v1/',{headers:{apikey:k,Authorization:'Bearer '+k}})).json();
  console.log(Object.keys(s.definitions.payments.properties).join(', '))"
```

⚠️ `supabase-js` cannot be used for this locally: the installed version needs a
WebSocket implementation Node 20 does not provide, and fails at `createClient`
before any query runs. `fetch` against PostgREST has no such dependency.

---

## The tables, as observed

### `client_contracts` — 0 rows

| column | type | null | notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `automation_client_id` | uuid |  | FK to `clients.id`, 🔁 **ON DELETE CASCADE** (see below). |
| `web_client_id` | uuid |  | FK to `web_clients.id`, 🔁 **ON DELETE CASCADE** (see below). |
| `monthly_eur` | numeric(10,2) | NOT NULL |  |
| `setup_eur` | numeric(10,2) |  |  |
| `setup_terms` | text |  | Free text deliberately. The shape of a real instalment plan is what a first contract teaches; structuring it now means inventing a shape the first rea |
| `starts_on` | date | NOT NULL |  |
| `ends_on` | date |  |  |
| `automations` | text[] |  | Text array with a CHECK rather than a join table: the relationship carries no attributes of its own, so a join table would buy only the key validation |
| `signed_by` | text | NOT NULL |  |
| `recorded_by` | text | NOT NULL |  |
| `recorded_at` | timestamp with time zone | NOT NULL |  |
| `created_at` | timestamp with time zone | NOT NULL |  |
| `updated_at` | timestamp with time zone | NOT NULL |  |
| `supersedes_id` | uuid |  | FK to `client_contracts.id`, NO ACTION. |
| `superseded_at` | timestamp with time zone |  |  |
| `superseded_by` | text |  |  |

### `client_contracts_uncorrected` — 0 rows — a VIEW, not a table

🔁 `pg_class.relkind = 'v'`. A view has no primary key and no foreign keys.
The first reading showed them because PostgREST infers them from the base
table. Every column is nullable for the same reason: a view does not carry
`NOT NULL`.

| column | type | null | notes |
|---|---|---|---|
| `id` | uuid |  | (from `client_contracts.id`; not a key here) |
| `automation_client_id` | uuid |  | (from `client_contracts`; no FK on a view) |
| `web_client_id` | uuid |  | (from `client_contracts`; no FK on a view) |
| `monthly_eur` | numeric(10,2) |  |  |
| `setup_eur` | numeric(10,2) |  |  |
| `setup_terms` | text |  |  |
| `starts_on` | date |  |  |
| `ends_on` | date |  |  |
| `automations` | text[] |  |  |
| `signed_by` | text |  |  |
| `recorded_by` | text |  |  |
| `recorded_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |
| `supersedes_id` | uuid |  | (from `client_contracts`; no FK on a view) |
| `superseded_at` | timestamp with time zone |  |  |
| `superseded_by` | text |  |  |

### `payments` — 0 rows

| column | type | null | notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `automation_client_id` | uuid |  | FK to `clients.id`, 🔁 **ON DELETE CASCADE** (see below). |
| `web_client_id` | uuid |  | FK to `web_clients.id`, 🔁 **ON DELETE CASCADE** (see below). |
| `kind` | text | NOT NULL |  |
| `amount_eur` | numeric(10,2) | NOT NULL |  |
| `invoiced_on` | date |  |  |
| ~~`received_on`~~ | — | — | 🔁 **Absent** on the second reading. Attribute number 7 is a dropped slot, so the column existed and was dropped rather than never created. See below. |
| `reference` | text |  |  |
| `note` | text |  |  |
| `recorded_by` | text | NOT NULL |  |
| `recorded_at` | timestamp with time zone | NOT NULL |  |
| `settled_on` | date |  | When the money actually arrived. NULL means it has not — which is a different fact from a payment nobody has invoiced yet, and both are different from |
| `settled_amount_eur` | numeric(10,2) |  | What actually arrived, which may not be what was invoiced. A part payment is a fact, not a rounding error. |
| `settled_method` | text |  |  |
| `settled_reference` | text |  |  |
| `written_off_on` | date |  | When we stopped expecting it. A write-off is a decision somebody took, not a payment that aged out. |
| `written_off_by` | text |  |  |

### `costs` — 0 rows

| column | type | null | notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `label` | text | NOT NULL |  |
| `category` | text | NOT NULL |  |
| `side` | text | NOT NULL |  |
| `amount_eur` | numeric(10,2) | NOT NULL |  |
| `cadence` | text | NOT NULL |  |
| `started_on` | date | NOT NULL |  |
| `ended_on` | date |  |  |
| `recorded_by` | text | NOT NULL |  |
| `recorded_at` | timestamp with time zone | NOT NULL |  |

### `cost_checks` — 0 rows

| column | type | null | notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `cost_id` | uuid | NOT NULL | FK to `costs.id`, 🔁 **ON DELETE CASCADE** (see below). |
| `confirmed_on` | date | NOT NULL |  |
| `confirmed_by` | text | NOT NULL |  |
| `amount_eur` | numeric(10,2) | NOT NULL |  |
| `note` | text |  |  |
| `recorded_at` | timestamp with time zone | NOT NULL |  |

### `web_clients` — 0 rows

| column | type | null | notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `name` | text | NOT NULL |  |
| `status` | text | NOT NULL |  |
| `started_on` | date | NOT NULL |  |
| `ended_on` | date |  |  |
| `rehearsal` | boolean | NOT NULL | No default, for the same reason as clients.rehearsal: a default answers for every client that has ever existed. |
| `notes` | text |  |  |
| `created_at` | timestamp with time zone | NOT NULL |  |
| `updated_at` | timestamp with time zone | NOT NULL |  |

---

## 🔁 The foreign keys, and what a delete does

Read from `pg_constraint` on 21 September. **Every foreign key from a money
table to its parent was `ON DELETE CASCADE`.** Deleting a client, a web client
or a cost silently deleted the contracts, payments or price confirmations
recorded against it.

| constraint | child → parent | on delete |
|---|---|---|
| `client_contracts_automation_client_id_fkey` | client_contracts → clients | CASCADE |
| `client_contracts_web_client_id_fkey` | client_contracts → web_clients | CASCADE |
| `client_contracts_supersedes_id_fkey` | client_contracts → client_contracts | NO ACTION |
| `payments_automation_client_id_fkey` | payments → clients | CASCADE |
| `payments_web_client_id_fkey` | payments → web_clients | CASCADE |
| `cost_checks_cost_id_fkey` | cost_checks → costs | CASCADE |

🔴 **Neither the revoked privilege nor the table's triggers stop this.**
PostgreSQL carries out a referential action with the rights of the
referencing table's OWNER (`ri_triggers.c`), so `0046`'s revoke of DELETE from
the API roles does not reach a cascade. This comes from PostgreSQL's source,
not from anything seen on this database. A read-only connection cannot witness
it. And the
only trigger on `client_contracts` in the live database is
`client_contracts_freeze_trg`: **BEFORE UPDATE only**, calling
`client_contracts_freeze()`. That function and trigger appear nowhere in this
repository or its history. The repository's `0042` instead creates
`client_contracts_no_update` (BEFORE UPDATE **OR DELETE**) and
`client_contracts_no_truncate`, and **neither exists in the database.** So
what was applied as `0042` is not the file either, the same as `0045`.

**Where it came from is unrecorded.** I searched every branch's history by
content, the working tree including ignored files, unreachable git objects
(lost commits and dropped stashes) and the local Claude Code session
transcripts. Nothing names `client_contracts_freeze` before this reading. The
database's own migration history (`supabase_migrations`) is empty. What is
known: it is owned by `postgres`, as is everything the SQL editor creates, and
it is written in this repository's allowlist-freeze idiom (`0017`, `0020`,
`0025`). Neither fact says who wrote it.

It also carries a different correction model: stamp `superseded_at` on the old
row, and the view filters on that stamp. Under `0046`'s grants the application
cannot UPDATE, so it cannot stamp, and every correction it made would be
counted twice. **`0050` states the whole end state** (full append-only,
insert-only corrections, anti-join view). ✅ **Applied 21 September**,
proved before and after in the verdict shape, and confirmed through the MCP
connection. The freeze described above no longer exists.

✅ **Resolved by `0049`, applied on 21 September.** All six are now `RESTRICT`
and validated. I confirmed that independently through the read-only MCP
connection after Manuel's run: 45 foreign keys in the schema, all 45 as
expected, and the 19 non-money keys into `clients` still `CASCADE`. The table
above is the state *before* 0049, kept as the record of what it fixed.

---

## Where the database and the repository knowingly differ

**`0045`** — what was applied additionally revoked `insert, update, delete,
truncate` on **`public.client_contracts`** itself. The file in this repository
revokes only on the VIEW and never names the table. The applied version left
the application unable to record a contract until `0046` re-granted `insert`.

🔒 The file is NOT edited to match. The applied version was wrong, and
rewriting the file to agree would make the repository record a mistake as the
intent. The difference is recorded in `0045`'s own header and here.

---

## What this record makes visible

1. 🔁 **`payments.received_on` is gone; `settled_on` is the only column for
   *the money arrived*.** The first reading found both, and `0044` was written
   to drop `received_on`. The proof book (`db/tests/proofs.json`,
   `0044-drop-payments-received-on`) records 0044 as **applied and blessed**:
   `last_proved` 2026-09-21, by Manuel Vale, with a hash matching the file on
   disk. That agrees with what the catalogue shows.
   ⚠️ The same entry's `what` and `how` text still says the destructive guard
   is *UNPROVEN*. Commit `eabaf98` says it was later seen to fire and blessed,
   so the text was stale and the blessing is current. The Month may treat
   `received_on` as gone. The proof-book text was corrected on 21 September.
2. 🔴 **`client_contracts.updated_at` is dead.** `0042` made the table
   append-only, so nothing can update a row and the column can only ever equal
   `created_at`. Named in `0042`'s header and owed a `0032`-treatment drop.
   A column that cannot change while looking as though it can is exactly
   `client_automations.health`.
   🔁 **The live database disagrees.** Its `client_contracts_freeze()` allows
   `superseded_at`, `superseded_by` and `updated_at` to change, and sets
   `new.updated_at := now()` on every permitted update. So in production
   `updated_at` is when the row was superseded, not a copy of `created_at`.
   Settle what the freeze should be before dropping the column. The fact
   above rests on the repository's `0042`, which is not what was applied.
3. **`client_contracts` and `payments` both carry the
   `automation_client_id` / `web_client_id` pair** rather than one nullable
   party column — which is the shape the design argued for, arrived at
   independently: a nullable column meaning *not applicable here* is
   indistinguishable from one meaning *nobody has entered it yet*.
4. **`web_contracts` does not exist.** A web client currently has no contract
   table, so retainer terms have nowhere to live. The Month reads what is
   there and says the web side is not recorded, rather than waiting for it.
5. **Every table holds 0 rows.** Every schema change proposed against them is
   therefore free today and a data question tomorrow.
