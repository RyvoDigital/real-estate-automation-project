# Restore drill — verified procedure

**Last run:** 2026-08-07 · **Result:** PASS · **Dump under test:** `n8n-20260807.sql.gz`

`restore.sh` had never been executed before this drill. An untested restore is
not a backup, so this document records both the procedure and the evidence that
it actually works.

The drill restores a nightly dump into a **scratch database** and compares it
against live. It never writes to the live database and never stops n8n, so it
is safe to run on a working day. Run it after any change to `backup.sh`,
`restore.sh`, the Postgres image, or the n8n version — and at least quarterly.

---

## 1. The procedure

```bash
ssh ryvo
cd /opt/ryvo-automation-platform

# Restore the most recent dump into a scratch DB. Live is untouched.
./infra/scripts/restore.sh --target-db n8n_restore_drill backups/n8n-YYYYMMDD.sql.gz
```

The script prompts for the word `drill` before proceeding; add `--yes` to skip
the prompt in a scripted run. It refuses to continue unless the archive passes
`gzip -t` **and** ends with pg_dump's `PostgreSQL database dump complete`
trailer, so a truncated dump is caught before anything is created.

Expected output (~3 seconds on the current 14 MB database):

```
Verifying backups/n8n-20260807.sql.gz...
  -> gzip OK, dump trailer present
Recreating database 'n8n_restore_drill'...
Loading dump...
Verifying restored database...
  -> 110 tables in 'n8n_restore_drill'
  -> users=1
  -> workflows=0
  -> credentials=0
Drill restore complete into 'n8n_restore_drill'. Live database untouched.
```

### Clean up when finished — do not skip this

```bash
cd /opt/ryvo-automation-platform/infra
set -a; . ../.env; set +a
docker compose --env-file ../.env exec -T postgres \
  psql -U "$N8N_DB_USER" -d postgres \
  -c 'DROP DATABASE IF EXISTS "n8n_restore_drill" WITH (FORCE);'
```

The scratch DB is ~13 MB. Leaving it behind is not dangerous, but it will
confuse the next person reading `\l`.

---

## 2. What "correct" was verified to mean

Comparing the scratch DB against live is only meaningful if you know which
differences are expected. These checks all passed on 2026-08-07.

| Check | Result |
|---|---|
| `gzip -t` + `dump complete` trailer | pass |
| Tables | **110 = 110** |
| Columns (name, type, nullability, default) | **820 = 820**, identical |
| Sequences | **7 = 7**, identical |
| Sequence `last_value` (incl. `migrations_id_seq=212`) | identical |
| Indexes | 246 = 246 (1 cosmetic delta, §3) |
| Constraints | 915 = 915 (17 cosmetic deltas, §3) |
| Exact row count, all 110 tables | identical |
| **Full-content md5 of every row of every table** | **109/110 identical** (§4) |

Row counts restored, by non-empty table:

| Table | Rows | Table | Rows |
|---|---|---|---|
| `role_scope` | 558 | `settings` | 3 |
| `scope` | 213 | `deployment_key` | 3 |
| `migrations` | 212 | `user` | 1 |
| `mcp_registry_server` | 69 | `project` | 1 |
| `role` | 15 | `project_relation` | 1 |
| | | `instance_version_history` | 1 |

All 99 other tables are empty in both — correct for a pre-Phase-1 instance with
no workflows, credentials or executions.

The restored owner account, settings rows (`isInstanceOwnerSetUp=true`), the
personal project and the `global:owner` role assignment all match live exactly,
including the password hash.

---

## 3. Expected cosmetic difference — 18 index/constraint definitions

17 `CHECK` constraints and 1 partial-index predicate render differently between
live and restored:

```sql
-- live (as n8n's TypeORM migrations originally created it)
CHECK (((status)::text = ANY ((ARRAY['success'::character varying, ...])::text[])))

-- restored (after pg_dump emits it and psql re-parses it)
CHECK (((status)::text = ANY (ARRAY[('success'::character varying)::text, ...])))
```

**This is not data loss and not a defect.** Postgres stores the parsed
expression tree; dumping deparses it to SQL text, and re-parsing that text
yields an equivalent tree with a slightly different shape. Verified three ways:

1. **Normalisation** — strip the ARRAY-cast rendering and all 915 constraints
   are identical. No differing line was anything other than this one pattern.
2. **Semantics** — both predicate forms were evaluated over the same candidate
   values (valid, invalid, empty string, `NULL`); they agree on every case,
   `NULL` included.
3. **Convergence** — dumping the restored DB and restoring *that* produces a
   generation-2 dump byte-identical to generation 1. The rendering settles after
   one cycle and does **not** drift further with repeated backup/restore cycles.

The round-trip dump of the restored database is identical to the original
backup apart from exactly these 18 definitions (8444 lines both; 226 bytes
difference) and pg_dump 18's per-dump random `\restrict` nonce.

If a future drill reports differing constraints that do **not** match this
pattern, that is a real finding — investigate it.

---

## 4. Expected data difference — the `user` row

The full-content checksum flags `user` as the one differing table. This is
correct behaviour, not corruption:

| Field | Live (16:39) | Restored | Dump |
|---|---|---|---|
| `updatedAt` | `2026-08-07 16:20:46` | `2026-08-06 22:00:35` | `2026-08-06 22:00:35` |
| `lastActiveAt` | `2026-08-07` | `2026-08-06` | `2026-08-06` |

**The restored row matches the dump exactly.** Live simply moved on after the
03:00 snapshot — n8n updates `lastActiveAt`/`updatedAt` when the owner uses the
UI. Every other field (id, email, name, password hash, settings,
personalization, `roleSlug`) is identical.

When drilling, always compare **restored vs the dump**, not restored vs live.
Live-vs-restored differences in activity-timestamp columns are expected and
grow with the age of the dump.

---

## 5. Defects found and fixed in `restore.sh`

The script had never run. Six defects were found; all are fixed in the version
committed alongside this document.

1. **The load could fail silently.** `psql` was invoked with no
   `ON_ERROR_STOP`, so it exits 0 even when every statement fails. Combined
   with `set -euo pipefail` the script would print `Restore complete.` and
   restart n8n against an **empty database** — the worst possible failure mode,
   because it looks like success during a real outage.
   *Fixed:* `-v ON_ERROR_STOP=1 --single-transaction`. The restore is now
   all-or-nothing.

2. **No way to restore anywhere except over production.** Every invocation
   dropped the live DB, so the only way to test the script was to destroy the
   thing it was meant to protect. That is precisely why it sat untested.
   *Fixed:* `--target-db NAME` drill mode, which never touches the live
   database and never stops n8n.

3. **`DROP DATABASE` could fail on lingering connections.** Stopping n8n does
   not guarantee every backend is gone, and any stray `psql` blocks the drop —
   leaving n8n stopped and the restore half-done.
   *Fixed:* `DROP DATABASE ... WITH (FORCE)`.

4. **n8n could be left down.** Between `compose stop n8n` and
   `compose start n8n` any failure exits under `set -e` with n8n stopped and
   the database dropped.
   *Fixed:* an `EXIT` trap restarts n8n on any exit path in live mode.

5. **The archive was never checked before the database was destroyed.** A
   truncated dump was discovered only after the live DB was already gone.
   *Fixed:* `gzip -t` plus a check for the `dump complete` trailer, both
   **before** anything is dropped.

6. **Success was asserted, never verified.** *Fixed:* the script now counts
   tables in the restored DB, fails if there are none, and reports user /
   workflow / credential counts.

Hardening also added: refuses an empty `N8N_DB_NAME`/`N8N_DB_USER` from a
malformed `.env`, constrains database identifiers to `[A-Za-z_][A-Za-z0-9_]*`
before interpolating them into SQL, and refuses to target `postgres`,
`template0` or `template1`. Restoring over the live database still always
requires typing `restore`, even with `--yes`.

---

## 6. Known gaps

Tracked as blockers in
[`WHERE-WE-LEFT-OFF.md`](WHERE-WE-LEFT-OFF.md) §7, *Outstanding before the
first client*.

- **n8n has not been booted against a restored database.** The drill proves the
  data and schema round-trip faithfully; it does not prove n8n starts against
  the result. Doing so means pointing an n8n container at the scratch DB, which
  is a service action, so it was left out of a working-hours drill. Schema,
  `migrations` (212 rows) and `settings` all restore exactly, so this is
  expected to work — but it is untested. Worth doing in a maintenance window.

- **Credentials would not survive a host loss.** n8n credentials are encrypted
  with `N8N_ENCRYPTION_KEY`. Restoring the database onto a host without that
  exact key leaves every stored credential unreadable. The key must live in a
  password manager, not only in the server's `.env`. There are currently 0
  credentials, so this is cheap to get right *now*.

- **Only the engine DB is backed up.** The Supabase platform DB is not dumped
  by anything we control. Unchanged by this drill; still open.

- **The live-restore path is still untested end-to-end.** Drill mode
  deliberately skips the `stop n8n` / `start n8n` steps, so those two lines and
  the `EXIT` trap have not been exercised against a real failure.
