# Ryvo — Real Estate AI Automation Platform

Productized AI-automation platform for real estate agencies. This repository holds
the **infrastructure foundation** (Phase 0): the automation engine, the database
spine, and the secure host that everything else sits on.

It deliberately contains **no** automation logic, **no** dashboard UI, and **no**
AI ops agent ("Zero") yet — those are Phase 1+.

## Architecture

| Layer | Choice | Role |
|---|---|---|
| Host | Hetzner Cloud (CX22, EU — Nuremberg/Falkenstein) | GDPR-friendly VPS |
| Automation engine | n8n (self-hosted, Docker) | Workflows as version-controlled JSON |
| Engine DB | Postgres 18 (Docker, same host) | n8n's operational state |
| Reverse proxy / TLS | Caddy 2.11 | Automatic HTTPS |
| Platform DB | Supabase (managed, EU — Frankfurt) | Clients, leads, runs, metrics |
| AI calls | Anthropic API (Claude) | Used by automations + Zero later |
| Source control | GitHub | Workflow exports, migrations, infra config |

**Two databases on purpose:** the Dockerized Postgres is n8n's own engine state.
Supabase is the platform's data spine that the cockpit and Zero will read. They
stay separate.

## Repository layout

```
.
├── README.md
├── .gitignore                  # ignores .env, *.local, /backups
├── .env.example                # required variables (no real values)
├── infra/
│   ├── docker-compose.yml      # caddy + n8n + postgres
│   ├── Caddyfile
│   └── scripts/
│       ├── backup.sh           # nightly pg_dump + n8n workflow export
│       └── restore.sh          # restore DB from a dump
├── db/
│   └── migrations/
│       └── 0001_base_schema.sql
├── workflows/                  # exported n8n workflow JSON (one file per workflow)
└── docs/
    └── phase-0-infrastructure-handoff.md
```

## Pinned versions

Verified against current stable releases on **2026-07-01**:

- **n8n** `2.28.3` — note n8n is on the 2.x line; pin deliberately, don't float on `latest`.
- **Postgres** `18` (latest stable major).
- **Caddy** `2.11` (latest stable, 2.11.4).

Re-verify and bump these as deliberate, reviewed changes.

## Secrets

The **operator** generates and holds every secret. The agent never generates,
stores, or commits real secret values. Copy `.env.example` to `.env` **on the
server**, fill every value, and keep a copy in a password manager.

Generate the random secrets with:

```bash
openssl rand -hex 24   # N8N_ENCRYPTION_KEY (NEVER lose this), N8N_JWT_SECRET, N8N_DB_PASSWORD
```

> `N8N_ENCRYPTION_KEY` encrypts all credentials stored in n8n. **If it is lost,
> every saved credential becomes unrecoverable.** Store it in two places.

`.env` is gitignored and must never leave the operator's control.

## Deploy (run only after the scaffold is reviewed and approved)

These steps provision live infrastructure and are intentionally **not** automated
by the agent. The operator performs the account/console actions; exact settings
are in `docs/phase-0-infrastructure-handoff.md`.

1. **Hetzner VPS** — CX22, Ubuntu 24.04 LTS, EU region. SSH key only, no password
   login. Harden: non-root sudo user, `ufw` allowing only 22/80/443, disable root
   SSH + password auth, enable unattended security upgrades. Install Docker Engine
   + Compose plugin.
2. **DNS** — `A` record `n8n.<DOMAIN>` → VPS public IPv4. On Cloudflare, set it to
   **DNS-only (grey cloud)** so Caddy can issue its own certificate.
3. **`.env`** — create on the server from `.env.example`, fill all values.
4. **Bring up the stack** from `infra/`:
   ```bash
   docker compose --env-file ../.env up -d
   docker compose ps          # caddy, n8n, postgres all running
   ```
   Visit `https://n8n.<DOMAIN>` and create the n8n owner account on first load.
5. **Supabase** — create a project in **EU (Frankfurt) / eu-central-1**. Apply
   `db/migrations/0001_base_schema.sql` via the SQL editor or Supabase CLI. Save
   `SUPABASE_URL`, `anon`, and `service_role` keys into `.env`.

## Backups

`infra/scripts/backup.sh` runs nightly (cron, 03:00 Europe/Lisbon):

- `pg_dump` the n8n Postgres → `/backups/n8n-YYYYMMDD.sql.gz` (last 14 retained).
- Export all n8n workflows to JSON into `workflows/` and commit them — this is the
  reusable automation library.

Restore a dump with `infra/scripts/restore.sh /backups/n8n-YYYYMMDD.sql.gz`
(destructive; re-confirms first). Supabase has its own managed backups — check the
current free-tier retention and plan accordingly.

## GDPR / security baseline

- **Data residency:** Hetzner (DE) + Supabase Frankfurt. All personal data stays in the EU.
- **Least privilege:** Postgres port unpublished (Docker-network only); `service_role`
  key server-side only; SSH key-only; firewall locked to 22/80/443.
- **Consent fields** (`consent_status`, `consent_at`) exist on `leads`; outbound
  automations in later phases must respect them and get a compliance review.
- **RLS** is enabled on all 9 tables with no public policies — browser clients are
  denied by default; all access goes through the server using `service_role`.

## Status

**Phase 0 — local scaffold.** Live infrastructure is provisioned only after the
operator reviews this scaffold and explicitly approves. See
`docs/phase-0-infrastructure-handoff.md` for the full spec and verification checklist.
