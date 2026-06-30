# Phase 0 — Infrastructure Handoff

**Project:** Ryvo real estate AI automation platform
**Audience:** Claude Code (executor)
**Scope:** Stand up the foundation only. No automation logic, no dashboard UI, no AI agent ("Zero") in this phase — those are Phase 1+.

---

## 0. Read this first

This document tells you (Claude Code) how to build the **infrastructure foundation** for a productized AI-automation platform serving real estate agencies. The platform has two surfaces that are built later:
- **The cockpit** — a single-operator dashboard (only the Ryvo team logs in) showing every client, every automation's health, and metrics.
- **The client deliverable** — outcomes landing in the client's own channels (WhatsApp, Instagram, calendar, email) plus a weekly report. Clients do **not** get a login in v1.

Phase 0 builds neither surface. It builds the **engine, the database spine, and the secure host** everything else sits on.

**Important execution notes:**
- Version numbers and image tags below are illustrative. **Verify the current stable release of each tool (n8n, Caddy, Postgres, Supabase CLI) before pinning** and adjust.
- Everything that touches personal data must stay in the **EU** (Hetzner is in Germany; use Supabase's **Frankfurt / eu-central** region). This is a foundational GDPR posture, not legal advice.
- Do not commit secrets. Use `.env` files that are gitignored, and document required variables in `.env.example`.

### Execution rules (non-negotiable)

These govern *how* you proceed, not just what you build.

1. **Build local first, then pause for review.** Produce ALL local artifacts — repo structure, `infra/docker-compose.yml`, `infra/Caddyfile`, `db/migrations/0001_base_schema.sql`, `.env.example`, `.gitignore`, `README`, `infra/scripts/backup.sh` — and commit them to git. Then **stop and present the scaffold for human review.** Do **not** provision the Hetzner server, create any cloud resource, point DNS, or deploy anything until the operator explicitly says go.
2. **Before doing anything, return a short execution plan** plus a complete list of every secret, account, and decision you need from the operator. Wait for those before live steps.
3. **The operator holds all secrets.** You (the agent) never generate, request in plaintext, store, or commit real secret values (`N8N_ENCRYPTION_KEY`, `N8N_JWT_SECRET`, DB passwords, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`). You may show the *commands* to generate them (e.g. `openssl rand -hex 24`), but the operator runs those, fills the real `.env` on the server, and keeps copies in a password manager. `.env` is gitignored and never leaves the operator's control.
4. **Operator-only actions (web consoles).** The following are performed by the operator in the respective dashboards, not by the agent — the agent provides exact settings to choose but does not click through: creating the Hetzner Cloud account and server, creating the Supabase project (EU/Frankfurt), pointing DNS, and creating the GitHub repo if remote. These map to the "Explicit permission required" class of actions: account creation, DNS/config changes, and accepting provider terms.

---

## 1. Outcome / definition of done

Phase 0 is complete when all of the following are true:

1. A Hetzner Cloud VPS is provisioned, hardened (SSH key auth only, firewall, non-root user), and running Docker.
2. `n8n` runs on the VPS via Docker Compose, behind a Caddy reverse proxy with automatic HTTPS, reachable at `https://n8n.<domain>`, protected by authentication.
3. A dedicated Postgres database backs n8n (not SQLite).
4. A Supabase project exists in the **EU (Frankfurt)** region with the **base schema** (Section 6) applied and Row Level Security enabled on every table.
5. A GitHub repo exists with the structure in Section 3, including `.env.example`, a `README`, and the SQL migration.
6. A backup routine exists: nightly Postgres dump + n8n workflow export committed to git.
7. The verification checklist (Section 9) passes end to end.

---

## 2. Stack decisions and rationale

| Layer | Choice | Why |
|---|---|---|
| Host | Hetzner Cloud (CX22 or similar, Nuremberg/Falkenstein) | Cheap (~€5–10/mo), EU-based (GDPR), reliable |
| Automation engine | n8n (self-hosted, Docker) | Workflows are JSON → version-controllable → this *is* the reusable automation library |
| Engine DB | Postgres (Docker, same host) | n8n needs Postgres for production; SQLite won't scale |
| App / platform DB | Supabase (managed, EU Frankfurt) | Postgres + auth + good Next.js DX for the cockpit later; free tier covers early days |
| Reverse proxy / TLS | Caddy | Automatic HTTPS, trivial config |
| AI calls | Anthropic API (Claude) | Used by automations + Zero later; key stored as secret |
| Source control | GitHub | Workflow exports, schema migrations, infra config |

**Why two databases:** n8n's Postgres is operational (the engine's own state). Supabase is the platform's data spine (clients, leads, runs, metrics) that the cockpit and Zero will read. Keep them separate.

---

## 3. Repository structure

Create a GitHub repo `ryvo-automation-platform` with:

```
ryvo-automation-platform/
├── README.md
├── .gitignore                  # must ignore .env, *.local, /backups
├── .env.example
├── infra/
│   ├── docker-compose.yml      # n8n + postgres + caddy
│   ├── Caddyfile
│   └── scripts/
│       ├── backup.sh           # pg_dump + n8n export
│       └── restore.sh
├── db/
│   └── migrations/
│       └── 0001_base_schema.sql
├── workflows/                  # exported n8n workflow JSON (one file per workflow)
│   └── .gitkeep
└── docs/
    └── phase-0-infrastructure-handoff.md   # this file
```

`.gitignore` must include at minimum:
```
.env
*.local
/backups/
node_modules/
```

---

## 4. Server provisioning (Hetzner)

1. Create a Hetzner Cloud project and a CX22 VPS (2 vCPU / 4GB) running **Ubuntu 24.04 LTS**, located in an EU region (Nuremberg or Falkenstein).
2. Add an SSH key at creation; **disable password login**.
3. After first boot, harden:
   - Create a non-root sudo user; use it for everything after.
   - `ufw` firewall: allow `22`, `80`, `443` only. Deny everything else inbound.
   - Disable root SSH and password auth in `/etc/ssh/sshd_config` (`PermitRootLogin no`, `PasswordAuthentication no`), reload sshd.
   - Enable unattended security upgrades.
4. Install Docker Engine + the Docker Compose plugin (official Docker apt repo). Verify with `docker run hello-world`.
5. Point DNS: create an `A` record `n8n.<domain>` → the VPS public IPv4. (Domain registrar / Cloudflare — if Cloudflare, set the n8n record to **DNS-only / grey cloud** so Caddy can issue its own certificate.)

---

## 5. n8n + Postgres + Caddy (Docker Compose)

Place these in `infra/`. **Verify current stable image tags before deploying.**

### `infra/docker-compose.yml`
```yaml
services:
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - n8n

  n8n:
    image: docker.n8n.io/n8nio/n8n:latest   # pin to a specific stable tag in production
    restart: unless-stopped
    environment:
      - N8N_HOST=n8n.${DOMAIN}
      - N8N_PROTOCOL=https
      - N8N_PORT=5678
      - WEBHOOK_URL=https://n8n.${DOMAIN}/
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=${N8N_DB_NAME}
      - DB_POSTGRESDB_USER=${N8N_DB_USER}
      - DB_POSTGRESDB_PASSWORD=${N8N_DB_PASSWORD}
      - N8N_USER_MANAGEMENT_JWT_SECRET=${N8N_JWT_SECRET}
      - GENERIC_TIMEZONE=Europe/Lisbon
      - N8N_DIAGNOSTICS_ENABLED=false
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      - postgres
    expose:
      - "5678"

  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      - POSTGRES_DB=${N8N_DB_NAME}
      - POSTGRES_USER=${N8N_DB_USER}
      - POSTGRES_PASSWORD=${N8N_DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    expose:
      - "5432"

volumes:
  caddy_data:
  caddy_config:
  n8n_data:
  postgres_data:
```

### `infra/Caddyfile`
```
n8n.{$DOMAIN} {
    reverse_proxy n8n:5678
}
```

### Notes
- n8n's own user management (email + password, set on first visit) provides the login. Do not expose n8n without auth.
- The `N8N_ENCRYPTION_KEY` is critical: it encrypts stored credentials. Generate it once (`openssl rand -hex 24`), store it in `.env` and your password manager. **If lost, all saved credentials in n8n are unrecoverable.**
- Postgres has no published host port — it's only reachable inside the Docker network. Keep it that way.
- Bring it up with `docker compose --env-file ../.env up -d` from `infra/`.

---

## 6. Supabase project + base schema

1. Create a Supabase project in **Region: EU (Frankfurt) / eu-central-1**.
2. Save the project URL, the `anon` key, and the `service_role` key into `.env` (service_role is server-side only — never ship it to a browser).
3. Apply `db/migrations/0001_base_schema.sql` (below) via the Supabase SQL editor or the Supabase CLI.

This is the **stable spine** — every automation in the catalogue reads/writes these tables. Automation-specific tables get added in later phases without touching these.

### `db/migrations/0001_base_schema.sql`
```sql
-- ============ Base spine (stable across all automations) ============

create extension if not exists "pgcrypto";

-- Clients = the real estate agencies you serve
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  agency_name text,
  segment text default 'luxury_boutique',
  status text not null default 'active',          -- active | paused | churned
  whatsapp_number text,
  instagram_handle text,
  email text,
  timezone text default 'Europe/Lisbon',
  locale text default 'pt-PT',
  monthly_fee_eur numeric,
  onboarded_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Catalogue of automation types you offer
create table public.automations (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,                        -- 'inbound_concierge', etc.
  name text not null,
  description text,
  created_at timestamptz default now()
);

-- Which client has which automation enabled + per-client config
create table public.client_automations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete restrict,
  enabled boolean not null default true,
  config jsonb not null default '{}',
  n8n_workflow_id text,                            -- maps to the deployed n8n workflow
  health text not null default 'unknown',          -- healthy | degraded | failing | unknown
  last_run_at timestamptz,
  created_at timestamptz default now(),
  unique (client_id, automation_id)
);

-- Every execution of any automation (monitoring spine — Zero reads this)
create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  client_automation_id uuid not null references public.client_automations(id) on delete cascade,
  status text not null,                            -- success | error | running
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  error_type text,
  error_message text,
  payload jsonb,
  created_at timestamptz default now()
);

-- Universal contact/lead record (people, across all automations)
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  full_name text,
  phone text,
  email text,
  instagram_handle text,
  source text,                                     -- whatsapp | instagram | email | portal | referral | sphere
  stage text not null default 'new',               -- new | contacted | qualified | nurturing | viewing_booked | won | lost | dormant
  lead_type text,                                  -- buyer | seller | both | unknown
  budget_min numeric,
  budget_max numeric,
  timeline text,
  area text,
  qualification jsonb default '{}',
  consent_status text default 'unknown',           -- opt_in | opt_out | unknown  (GDPR)
  consent_at timestamptz,
  last_contact_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- All messages in/out across channels
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  channel text not null,                           -- whatsapp | instagram | email
  direction text not null,                         -- inbound | outbound
  body text,
  status text,                                     -- sent | delivered | read | failed | received
  ai_generated boolean default false,
  approved_by_human boolean,
  external_id text,
  created_at timestamptz default now()
);

-- Append-only activity feed (cockpit + Zero read this)
create table public.events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  type text not null,                              -- lead.created | viewing.booked | run.failed | report.sent ...
  severity text default 'info',                    -- info | warning | critical
  summary text,
  data jsonb default '{}',
  created_at timestamptz default now()
);

-- Daily rollups for fast dashboard charts
create table public.metrics_daily (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  date date not null,
  leads_new integer default 0,
  leads_qualified integer default 0,
  viewings_booked integer default 0,
  messages_sent integer default 0,
  reactivations integer default 0,
  unique (client_id, date)
);

-- Weekly report snapshots delivered to clients
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  summary text,
  metrics jsonb default '{}',
  delivered_at timestamptz,
  channel text,                                    -- email | whatsapp | pdf
  created_at timestamptz default now()
);

-- ============ Indexes ============
create index on public.automation_runs (client_automation_id, started_at desc);
create index on public.automation_runs (status) where status = 'error';
create index on public.leads (client_id, stage);
create index on public.leads (client_id, last_contact_at);
create index on public.messages (client_id, created_at desc);
create index on public.events (client_id, created_at desc);
create index on public.events (severity) where severity in ('warning','critical');

-- ============ Row Level Security ============
-- v1 has no public/anon access. All reads/writes go through the server using the
-- service_role key (Next.js server actions / n8n). Enable RLS and add NO public
-- policies, so anon/auth'd browser clients are denied by default.
alter table public.clients            enable row level security;
alter table public.automations        enable row level security;
alter table public.client_automations enable row level security;
alter table public.automation_runs    enable row level security;
alter table public.leads              enable row level security;
alter table public.messages           enable row level security;
alter table public.events             enable row level security;
alter table public.metrics_daily      enable row level security;
alter table public.reports            enable row level security;

-- ============ Seed the automation catalogue ============
insert into public.automations (key, name, description) values
  ('inbound_concierge', 'AI Inbound Concierge', 'Instant reply, qualification and viewing booking across WhatsApp/Instagram/email'),
  ('db_reactivation',   'Database Reactivation & Referral Engine', 'Works opted-in past clients and sphere to surface sellers and referrals'),
  ('lead_nurture',      'Lead Nurture & Listing-Match Drip', 'Re-engages cold leads and drips matching new listings'),
  ('listing_launch',    'Listing Launch Engine', 'On a new mandate: listing copy, social, email blast and launch checklist'),
  ('reputation_loop',   'Post-Close Reputation & Referral Loop', 'Post-transaction reviews, testimonials, referrals and stay-in-touch')
on conflict (key) do nothing;
```

---

## 7. Secrets and environment

### `.env.example`
```
# --- Domain ---
DOMAIN=yourdomain.com

# --- n8n / engine Postgres ---
N8N_ENCRYPTION_KEY=            # openssl rand -hex 24  (NEVER lose this)
N8N_JWT_SECRET=               # openssl rand -hex 24
N8N_DB_NAME=n8n
N8N_DB_USER=n8n
N8N_DB_PASSWORD=              # strong random

# --- Supabase (EU / Frankfurt) ---
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # server-side only

# --- Anthropic (used by automations + Zero later) ---
ANTHROPIC_API_KEY=
```

Generate the real `.env` on the server, fill every value, and store a copy in a password manager. Never commit it. Per Execution Rule 3 (Section 0), the **operator** generates and holds these values — the agent must not generate, store, or commit them.

---

## 8. Backups

### `infra/scripts/backup.sh`
- `pg_dump` the n8n Postgres (inside the container) to `/backups/n8n-YYYYMMDD.sql.gz`.
- Export all n8n workflows to JSON (n8n CLI: `n8n export:workflow --all --output=...`) and copy into the repo's `workflows/` directory.
- Commit the workflow exports to git (these are your reusable library).
- Retain the last 14 daily DB dumps; delete older.

Schedule via cron (e.g. nightly 03:00 Europe/Lisbon). Supabase has its own managed backups on paid tiers — note the current retention on the free tier and plan accordingly.

---

## 9. Security & GDPR baseline

- **Data residency:** Hetzner (DE) + Supabase Frankfurt. Keep all personal data in the EU.
- **Least privilege:** Postgres ports unpublished; `service_role` key server-side only; SSH key-only; firewall locked to 80/443/22.
- **No PII in logs:** automation_runs `error_message` / `payload` should avoid storing full personal data where possible.
- **Consent fields exist** on `leads` (`consent_status`, `consent_at`) — later automations must respect them, especially anything outbound. (Not legal advice; flag any outbound-messaging automation for a compliance review before launch.)
- **Secrets rotation:** document how to rotate the Anthropic key and DB passwords.

---

## 10. Verification checklist

- [ ] Local scaffold was built, committed, and reviewed by the operator **before** any live infrastructure was provisioned (Execution Rule 1).
- [ ] `https://n8n.<domain>` loads with a valid certificate and prompts for n8n login.
- [ ] n8n is using Postgres (not SQLite) — confirm via container env / DB connection.
- [ ] Supabase project is in Frankfurt; `0001_base_schema.sql` applied; all 9 tables present; RLS enabled on all.
- [ ] Seeded `automations` table contains the 5 catalogue rows.
- [ ] `.env` is populated on the server and gitignored; `.env.example` is committed.
- [ ] `docker compose ps` shows caddy, n8n, postgres all `running`.
- [ ] `backup.sh` runs successfully and produces a dump + workflow export; cron scheduled.
- [ ] Repo pushed to GitHub with the Section 3 structure.

---

## 11. Explicitly NOT in Phase 0 (do not build yet)

- Automation logic / the n8n workflows themselves (Phase 1+).
- The cockpit dashboard UI (Phase 2).
- Zero, the AI ops agent (Phase 3+).
- WhatsApp Business API / Instagram / calendar integrations (Phase 1, per automation).
- Any client-facing login.

Stop at the foundation. Confirm the verification checklist, then await the Phase 1 spec for the AI Inbound Concierge.
