# Where we left off

**Last updated:** 2026-08-07
**Phase:** 0 (infrastructure) — **complete**, verification checklist passed,
restore drill passed
**Next:** Phase 1 — the AI Inbound Concierge automation (awaiting spec)

This file is the running state-of-play for whoever (human or agent) picks the
project up next. The durable *design* lives in
[`phase-0-infrastructure-handoff.md`](phase-0-infrastructure-handoff.md); this
file records what is actually deployed right now and what tripped us up.

---

## 1. What is live

| Thing | Value |
|---|---|
| Server | Hetzner CX22, Ubuntu 24.04 LTS, Falkenstein (EU) |
| Public IP | `167.233.16.22` |
| Hostname | `ryvo-n8n` |
| Domain | `ryvodigital.com` |
| n8n | <https://n8n.ryvodigital.com> — owner account claimed |
| Repo on server | `/opt/ryvo-automation-platform` |
| GitHub | `RyvoDigital/real-estate-automation-project` (private) |
| Supabase | EU / Frankfurt (`eu-central-1`), Postgres 17.6 |

### Container versions (pinned, running)

| Service | Image |
|---|---|
| caddy | `caddy:2.11` |
| n8n | `docker.n8n.io/n8nio/n8n:2.28.3` |
| postgres | `postgres:18` |

n8n is backed by Postgres (`DB_TYPE=postgresdb`), **not** SQLite. Postgres has
no published host port — it is reachable only inside the Docker network.

### TLS

Let's Encrypt cert for `n8n.ryvodigital.com`, valid to **2 Oct 2026**, renewed
automatically by Caddy. HTTP `:80` 308-redirects to HTTPS.

---

## 2. Access

```bash
ssh ryvo@167.233.16.22        # or just: ssh ryvo
```

A `~/.ssh/config` entry on the operator laptop defines the `ryvo` host alias
with `IdentityFile ~/.ssh/ryvo_ed25519`, `AddKeysToAgent yes` and
`UseKeychain yes`.

**Gotcha:** `~/.ssh/ryvo_ed25519` is passphrase-protected. If ssh starts
failing with `Permission denied (publickey)` and `ssh-add -l` says *"The agent
has no identities"*, the keychain entry was lost. Fix, in a real terminal
(not through an agent harness — the interactive passphrase prompt does not
round-trip):

```bash
ssh-add --apple-use-keychain ~/.ssh/ryvo_ed25519
```

Server access is key-only: `PermitRootLogin no`, `PasswordAuthentication no`,
`KbdInteractiveAuthentication no`. `ufw` allows **only** 22, 80, 443 inbound.
Unattended security upgrades are active.

---

## 3. Database state

### Engine DB (n8n's own Postgres, on the server)

Operational state for n8n only. 110 tables, all n8n-managed. Never hand-edit.

### Platform DB (Supabase — the spine the cockpit and Zero will read)

`0001_base_schema.sql` and `0002_service_role_grants.sql` are both applied.

- **9 tables:** `clients`, `automations`, `client_automations`,
  `automation_runs`, `leads`, `messages`, `events`, `metrics_daily`, `reports`
- **RLS enabled on all 9, with zero policies** — deliberate. v1 has no
  browser-side data access; everything goes through the server using the
  service_role key.
- **`automations` seeded** with the 5 catalogue rows (`inbound_concierge`,
  `db_reactivation`, `lead_nurture`, `listing_launch`, `reputation_loop`).
- All other tables are empty.

Verified functionally, not just by reading flags: the publishable key gets
**401** on every table; `service_role` does a full SELECT / INSERT / DELETE
round-trip.

### ⚠️ The free tier auto-pauses after ~1 week of inactivity

**This is not theoretical — the project paused during a 10-day break in
late July / early August 2026.** Supabase pauses free-tier projects after
roughly 7 days with no activity; the database stops answering and has to be
restored manually from the dashboard before anything works again.

Implications:

- Any n8n workflow hitting Supabase after a quiet week fails on a **dead
  connection**, not a clean error. Phase 1 automations must not assume the
  platform DB is reachable.
- "Inactivity" is measured on the Supabase project. The engine Postgres on our
  own server is unaffected and keeps running — so the nightly backup keeps
  succeeding and gives **no signal** that the platform DB has gone away. A
  green backup log does not mean Supabase is up.
- A real client's automations generate daily traffic, so a live project is
  unlikely to idle into a pause — but the gap between signing a client and
  their first steady traffic is exactly when this would bite.

**Decision to make before launch:** upgrade to Supabase Pro (no auto-pause,
longer backup retention) or move the platform DB onto the existing Hetzner
Postgres. Tracked in §7 under *Outstanding before the first client*.

### ⚠️ Read this before writing migration 0003

Supabase's `ALTER DEFAULT PRIVILEGES` grants full DML only on tables created by
`supabase_admin`. Tables created by **`postgres`** — which is the role the
session pooler connects as, i.e. how we apply migrations — get only
`Dxtm` (TRUNCATE / REFERENCES / TRIGGER / MAINTAIN), **no
SELECT/INSERT/UPDATE/DELETE**.

This bit us: every table from `0001` was unreadable by `service_role`, and
because **GRANTs are evaluated before RLS**, service_role's `BYPASSRLS`
attribute did not compensate. The REST API returned `42501 permission denied`
for both reads and writes. Phase 1 n8n would have failed on its first write.

`0002` fixes it *and* sets default privileges so future tables inherit the
grants — so new tables should be fine. But if a future migration adds a table
that `service_role` unexpectedly cannot touch, this is the first thing to
check.

### Applying migrations

The publishable/secret API keys (`sb_publishable_…` / `sb_secret_…`) go through
PostgREST and **cannot run DDL**. Use the direct connection in
`SUPABASE_DB_URL` (session pooler, port **5432** — the transaction pooler on
6543 does not reliably handle multi-statement DDL).

There is no migration-tracking table yet; migrations have been applied by hand,
in order, in a single transaction each:

```bash
ssh ryvo
cd /opt/ryvo-automation-platform
set -a; . ./.env; set +a
cd infra
docker compose --env-file ../.env exec -T -e DBURL="$SUPABASE_DB_URL" postgres \
  sh -c 'psql "$DBURL" -v ON_ERROR_STOP=1 --single-transaction' \
  < ../db/migrations/000X_whatever.sql
```

Using the container's `psql` avoids installing a Postgres client on the host.
If Phase 1 adds many migrations, consider adopting a real migration tool
rather than growing this by hand.

---

## 4. Backups

`infra/scripts/backup.sh`, nightly at **03:00 Europe/Lisbon** via the `ryvo`
crontab. The host is UTC, so the crontab sets `CRON_TZ=Europe/Lisbon` — this
keeps the run at 03:00 local across DST instead of drifting an hour twice a
year.

What it does, in order: `pg_dump` the engine Postgres → gzip to `backups/` →
export n8n workflows to `workflows/` → commit → prune dumps older than 14 days
→ **push to GitHub**.

Retention runs *before* the push on purpose: a failing push must not leave
dumps accumulating until the disk fills.

- Log: `/var/log/ryvo-backup.log`, rotated weekly, 8 kept, compressed.
- Dumps: `backups/` — gitignored, they never enter git history.
- Offsite push uses a **repo-scoped deploy key** with write access:
  `~/.ssh/ryvo_github_deploy` on the server (no passphrase, required for
  unattended cron). The server remote is SSH, not HTTPS.

**Current run output is `-> No workflows in n8n yet` and that is correct** —
Phase 0 deliberately builds no automations. `n8n export:workflow --all` exits 1
on an empty instance, which used to fail the whole backup every night; that is
now handled. Once Phase 1 creates the first workflow this path starts producing
real commits.

Verified: last run exit 0; dump `n8n-20260727.sql.gz` (52K gz / 335KB raw)
passes `gzip -t` and ends with `PostgreSQL database dump complete`. Deploy-key
write access confirmed by pushing and deleting a throwaway branch.

### Restore drill — done 2026-08-07, PASS

`restore.sh` has now been exercised. `n8n-20260807.sql.gz` was restored into a
scratch database and compared against live: **110/110 tables, 820/820 columns,
7/7 sequences, exact row counts on all 110 tables, and a full-content md5 match
on 109 of 110.** The one differing table (`user`) matches the *dump* exactly —
live had simply moved its `lastActiveAt`/`updatedAt` on since the 03:00
snapshot. Live was never written to and nothing was restarted.

Six defects were found and fixed in `restore.sh` — the worst being that the
load ran without `ON_ERROR_STOP`, so a completely failed restore would print
"Restore complete." and bring n8n up against an **empty database**. The script
also had no way to restore anywhere but over production, which is why it had
never been tested.

Full procedure and evidence: [`restore-drill.md`](restore-drill.md). Re-run the
drill after any change to `backup.sh`, `restore.sh`, the Postgres image or the
n8n version, and at least quarterly:

```bash
./infra/scripts/restore.sh --target-db n8n_restore_drill backups/n8n-YYYYMMDD.sql.gz
# ...then drop the scratch DB (command is printed at the end of the run)
```

**Still untested:** booting n8n against a restored database, and the live
(destructive) restore path itself — drill mode skips the n8n stop/start.

---

## 5. Secrets

All live in `/opt/ryvo-automation-platform/.env` on the server (mode `600`,
gitignored, never committed). The operator holds them; `.env.example` documents
every key with no values.

Present: `DOMAIN`, `N8N_ENCRYPTION_KEY`, `N8N_JWT_SECRET`, `N8N_DB_NAME`,
`N8N_DB_USER`, `N8N_DB_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`.

**`ANTHROPIC_API_KEY` is present but empty** — needed before any Phase 1 AI
work.

This Supabase project uses the **new key format** (`sb_publishable_…` /
`sb_secret_…`), not legacy anon/service_role JWTs.

Two hard-won rules for `.env`:

1. **Keep each value on exactly one line, `KEY=value`.** A stray bare line
   (a paste that lost its variable name) makes `source .env` try to *execute*
   it, which echoes the whole line — password included — to the terminal. This
   happened on 2026-07-27 with the connection string; that DB password was
   rotated afterwards.
2. `backup.sh` does `set -euo pipefail; source .env`, so a malformed `.env`
   breaks every nightly backup, not just the command in front of you.

Percent-encode any of `@ : / ? # & %` in a password inside `SUPABASE_DB_URL`,
or avoid those characters entirely.

`N8N_ENCRYPTION_KEY` decrypts every credential stored in n8n. **If it is lost,
all saved n8n credentials are unrecoverable.** It must exist in a password
manager, not only on the server.

---

## 6. Verification checklist — all passing as of 2026-07-27

| Item | Status |
|---|---|
| Local scaffold committed and reviewed before provisioning | ✅ commits `0808523`, `7057240` |
| `https://n8n.ryvodigital.com` loads, valid cert, prompts login | ✅ HTTP 200, LE cert to 2026-10-02 |
| n8n uses Postgres, not SQLite | ✅ `DB_TYPE=postgresdb` |
| Supabase in Frankfurt, `0001` applied, 9 tables, RLS on all | ✅ 9/9 RLS, 0 policies |
| `automations` has the 5 catalogue rows | ✅ 5/5 |
| `.env` populated and gitignored, `.env.example` committed | ✅ mode 600, untracked |
| `docker compose ps` — caddy, n8n, postgres all running | ✅ all up, postgres healthy |
| `backup.sh` runs, produces dump, cron scheduled | ✅ exit 0, 03:00 Europe/Lisbon |
| Repo pushed to GitHub with the Section 3 structure | ✅ in sync |

Security baseline also re-checked: ufw 22/80/443 only, root SSH and password
auth disabled, unattended upgrades active, no Postgres port published.

---

## 7. Open items / next steps

**Before Phase 1 work begins:**

1. Fill `ANTHROPIC_API_KEY` in the server `.env`.
2. ~~Do a restore drill~~ — **done 2026-08-07, PASS** (see §4).
3. Confirm the Supabase free-tier backup retention and decide whether the
   platform DB needs its own dump alongside the engine DB. `backup.sh`
   currently backs up **only the engine Postgres** — Supabase is not dumped by
   anything we control.

### ⚠️ Outstanding before the first client

These are acceptable to carry while the platform has no real data or users.
They are **not** acceptable once a paying client's leads are in the system.

1. **Boot n8n against a restored database.** The 2026-08-07 drill proved the
   data and schema round-trip faithfully (§4), but not that n8n actually
   *starts* against the result. Needs a maintenance window and a throwaway n8n
   container pointed at a scratch DB — never the live container. Until this is
   done, the recovery path is verified only up to the database layer.
2. **The live (destructive) restore path is still unexercised.** Drill mode
   deliberately skips the `stop n8n` / `start n8n` steps and the `EXIT` trap,
   so those specific lines have never run against a real failure.
3. **Put `N8N_ENCRYPTION_KEY` in a password manager.** Restoring the database
   onto a new host without that exact key leaves every stored n8n credential
   permanently unreadable. There are currently **0 credentials**, which makes
   this cheap to get right now and expensive to get wrong later.
4. **Decide on the Supabase plan** — see the auto-pause note in §3. A paused
   platform DB during a live client's business hours is an outage.
5. **Alerting on backup failure.** A failed nightly run is currently visible
   only in `/var/log/ryvo-backup.log`, which nobody reads until something
   already looks wrong.

**Deferred by design (Section 11 of the handoff):** automation logic, the
cockpit UI, Zero, WhatsApp/Instagram/calendar integrations, any client-facing
login.

**Worth doing when it starts to hurt:** a migration-tracking table (or a real
migration tool), and alerting on backup failure — right now a failed nightly
run is only visible in `/var/log/ryvo-backup.log`, which nobody reads unless
something already looks wrong.
