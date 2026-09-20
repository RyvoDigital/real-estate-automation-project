# The Month's tables — the schema as OBSERVED, not as intended

**Read from the live database on 21 September 2026**, through PostgREST's own
OpenAPI description (`GET /rest/v1/`), which reports the columns, their types,
their nullability and their comments as the database actually holds them.

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
| `automation_client_id` | uuid |  | FK to `clients.id`. |
| `web_client_id` | uuid |  | FK to `web_clients.id`. |
| `monthly_eur` | numeric | NOT NULL |  |
| `setup_eur` | numeric |  |  |
| `setup_terms` | text |  | Free text deliberately. The shape of a real instalment plan is what a first contract teaches; structuring it now means inventing a shape the first rea |
| `starts_on` | date | NOT NULL |  |
| `ends_on` | date |  |  |
| `automations` | text[] |  | Text array with a CHECK rather than a join table: the relationship carries no attributes of its own, so a join table would buy only the key validation |
| `signed_by` | text | NOT NULL |  |
| `recorded_by` | text | NOT NULL |  |
| `recorded_at` | timestamp with time zone | NOT NULL |  |
| `created_at` | timestamp with time zone | NOT NULL |  |
| `updated_at` | timestamp with time zone | NOT NULL |  |
| `supersedes_id` | uuid |  | FK to `client_contracts.id`. |
| `superseded_at` | timestamp with time zone |  |  |
| `superseded_by` | text |  |  |

### `client_contracts_uncorrected` — 0 rows

| column | type | null | notes |
|---|---|---|---|
| `id` | uuid |  | PK |
| `automation_client_id` | uuid |  | FK to `clients.id`. |
| `web_client_id` | uuid |  | FK to `web_clients.id`. |
| `monthly_eur` | numeric |  |  |
| `setup_eur` | numeric |  |  |
| `setup_terms` | text |  |  |
| `starts_on` | date |  |  |
| `ends_on` | date |  |  |
| `automations` | text[] |  |  |
| `signed_by` | text |  |  |
| `recorded_by` | text |  |  |
| `recorded_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone |  |  |
| `supersedes_id` | uuid |  | FK to `client_contracts.id`. |
| `superseded_at` | timestamp with time zone |  |  |
| `superseded_by` | text |  |  |

### `payments` — 0 rows

| column | type | null | notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `automation_client_id` | uuid |  | FK to `clients.id`. |
| `web_client_id` | uuid |  | FK to `web_clients.id`. |
| `kind` | text | NOT NULL |  |
| `amount_eur` | numeric | NOT NULL |  |
| `invoiced_on` | date |  |  |
| `received_on` | date |  |  |
| `reference` | text |  |  |
| `note` | text |  |  |
| `recorded_by` | text | NOT NULL |  |
| `recorded_at` | timestamp with time zone | NOT NULL |  |
| `settled_on` | date |  | When the money actually arrived. NULL means it has not — which is a different fact from a payment nobody has invoiced yet, and both are different from |
| `settled_amount_eur` | numeric |  | What actually arrived, which may not be what was invoiced. A part payment is a fact, not a rounding error. |
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
| `amount_eur` | numeric | NOT NULL |  |
| `cadence` | text | NOT NULL |  |
| `started_on` | date | NOT NULL |  |
| `ended_on` | date |  |  |
| `recorded_by` | text | NOT NULL |  |
| `recorded_at` | timestamp with time zone | NOT NULL |  |

### `cost_checks` — 0 rows

| column | type | null | notes |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `cost_id` | uuid | NOT NULL | FK to `costs.id`. |
| `confirmed_on` | date | NOT NULL |  |
| `confirmed_by` | text | NOT NULL |  |
| `amount_eur` | numeric | NOT NULL |  |
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

## What this record makes visible

1. 🔴 **`payments.received_on` and `payments.settled_on` both exist**, and only
   the second carries a comment defining the fact. Two columns for *the money
   arrived* eventually disagree, and the one that disagrees is the one somebody
   trusted. `0044` drops `received_on`, and refuses to do so if `settled_on` is
   ever absent.
2. 🔴 **`client_contracts.updated_at` is dead.** `0042` made the table
   append-only, so nothing can update a row and the column can only ever equal
   `created_at`. Named in `0042`'s header and owed a `0032`-treatment drop.
   A column that cannot change while looking as though it can is exactly
   `client_automations.health`.
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
