-- ============ Base spine (stable across all automations) ============
-- Apply via the Supabase SQL editor or the Supabase CLI against the EU
-- (Frankfurt / eu-central-1) project. This schema is the stable spine: every
-- automation in the catalogue reads/writes these tables. Automation-specific
-- tables are added in later phases without touching these.

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
