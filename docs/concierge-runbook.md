# Inbound Concierge — runbook

**Status:** Checkpoint A (plumbing) complete, 2026-09-01. No AI, no replies, no
calendar yet. Inbound WhatsApp messages are verified, stored and logged.

**Channel:** Twilio Sandbox for WhatsApp. The Meta Cloud API path is blocked —
the Facebook account needed for the Meta Business Portfolio was disabled and the
appeal denied. Everything downstream of the inbound parse is channel-agnostic;
switching back to Meta touches the parse node, the signature check and the send
node, and nothing else.

---

## 1. What is running

| Thing | Value |
|---|---|
| Workflow | `inbound_concierge_whatsapp` (id `ryvoInboundConc01`), active |
| Webhook | `POST https://n8n.ryvodigital.com/webhook/twilio-inbound` |
| Keepalive | `supabase_keepalive` (id `ryvoSupaKeepAlv`), active, daily 04:00 Europe/Lisbon |
| Sandbox number | `+14155238886` (shared, Twilio-branded) |
| Test client | `Ryvo Test Client`, matched by `clients.whatsapp_number = '+14155238886'` |
| Supabase credential | `Ryvo Supabase (service_role)`, n8n credential id `ryvoSupabaseCred` |

The workflow writes to `leads`, `messages`, `events` and `automation_runs`. It
does **not** reply — an empty TwiML document is returned so Twilio stops.

---

## 2. First thing to check when it breaks

Work down this list in order. The top item causes most outages.

### 2.1 "Messages stopped arriving" → the sandbox session expired

**The Twilio sandbox session expires 3 days after joining.** This is the single
most likely cause and it is silent: Twilio simply stops delivering. It is the
Twilio equivalent of Meta's 24h token expiry.

Fix: from the operator's WhatsApp, send `join <keyword>` to `+14155238886`
again. The keyword is in `TWILIO_SANDBOX_KEYWORD` in the server `.env`.

Do not start debugging the workflow until you have re-joined.

### 2.2 "Outbound replies go missing" (from Checkpoint B onward)

Twilio warns the sandbox may not reliably deliver **international** messages.
The operator's handset is Portuguese (`+351…`); the sandbox number is US
(`+1415…`). Suspect delivery before suspecting the code — check the message
status in the Twilio console rather than assuming a bug in the workflow.

### 2.3 "Everything 403s"

The signature is computed over the **exact public URL** Twilio signed against,
plus every POST parameter sorted by name and concatenated with no delimiters.
n8n sits behind Caddy and internally sees `http://n8n:5678/…`, which produces a
different signature. The workflow therefore hardcodes:

```
https://n8n.ryvodigital.com/webhook/twilio-inbound
```

in the `VerifySignature` node. If the domain, path or scheme ever changes, that
constant must change with it. A trailing slash also breaks it. The URL is built
in the node rather than read from `X-Forwarded-Host` so a forged header cannot
influence what gets verified.

A 403 is also correct and expected if `AccountSid` in the payload does not match
`TWILIO_ACCOUNT_SID` — a valid signature only proves the request came from *a*
Twilio account, not from ours.

### 2.4 "Nothing writes to Supabase"

The free tier **pauses a project after ~7 days of inactivity**, and it fails as
a dead connection, not a clean error. This has already happened once: 25 idle
days in August 2026 took the platform DB down.

**The nightly backup log is not a health signal for this.** `backup.sh` dumps
only the engine Postgres on our own server, so it keeps reporting exit 0 and a
successful push while Supabase is unreachable. That is exactly why
`supabase_keepalive` exists — see §4.

---

## 3. Twilio console

**The sandbox lives at:**

```
console.twilio.com  →  Develop  →  Messaging  →  Try it out
                    →  Send a WhatsApp message
```

Not `1console.twilio.com`, and not the "legacy console". Twilio's own
documentation links to a legacy-console URL that **404s** — ignore it and
navigate through the menu above.

**Inbound webhook setting:** *Sandbox settings* → **When a message comes in** →
`https://n8n.ryvodigital.com/webhook/twilio-inbound`, method **POST**.

Keep the path free of query strings. Query parameters form part of the signed
URL and add a failure mode for no benefit.

### Billing posture (set 2026-09-01)

Pay-as-you-go, **$20** balance, **auto-recharge off**, and a daily `totalprice`
usage trigger at **$10** emailing `hello@ryvodigital.com`. Auto-recharge being
off means a runaway loop stops when the balance runs out instead of billing
indefinitely — the alert is the warning, the balance is the hard stop.

---

## 4. The Supabase keepalive

`supabase_keepalive` runs daily at 04:00 Europe/Lisbon and does one
authenticated read against the platform DB. Two jobs in one: the read keeps the
idle timer from ever reaching 7 days, and a failed read is the alarm.

It **throws** on any non-2xx rather than returning cleanly, because a thrown
error is what makes n8n record a *failed* execution. A workflow that quietly
returns `{ok: false}` looks identical to a healthy one in the executions list.

Both paths were verified on 2026-09-01 by temporarily running it at one-minute
intervals: the real workflow recorded `success`, and a throwaway twin pointed at
a dead host recorded `error` three times. The twin was then deleted and the
daily schedule restored.

**Where the alarm shows up:** n8n → Executions, filtered to
`supabase_keepalive`, status Error.

> **Known gap — now unblocked, still open.** That is a pull signal: it only
> helps if somebody looks. There is still no push alert on the failure branch.
>
> The blocker is gone — `client_automations.config.escalate_to` is now
> `+351933048230`, confirmed joined to the sandbox — so a WhatsApp alert can be
> wired onto the failure branch as soon as a send node exists (Checkpoint B
> brings one). Do that then; it is a two-node addition.
>
> Note the dependency: a WhatsApp alert travels over the same sandbox whose
> session expires every 3 days (§2.1), so it is not a channel to rely on alone.
> Until it exists, treat "nobody has looked at n8n Executions this week" as a
> real risk.

---

## 5. Secrets

All live in `/opt/ryvo-automation-platform/.env`, mode 600, gitignored.
`.env.example` documents every key with no values.

### Add secrets with an editor. Never with `echo >>`

```bash
# WRONG — the whole command line, secret included, lands in shell history
echo "SOME_KEY=sk-real-value" >> .env

# RIGHT
nano /opt/ryvo-automation-platform/.env
```

This is not hypothetical. On 2026-09-01 an Anthropic key had to be rotated after
leaking into a screenshot **and** into the server's shell history; the history
was scrubbed and the repo confirmed clean, but the key was already burned.
A previous incident cost a Supabase password rotation when a malformed `.env`
line made `source .env` execute it and echo the value.

Rules that follow from those two incidents:

1. One line per value, `KEY=value`, no trailing content. `backup.sh` does
   `set -euo pipefail; source .env`, so a malformed `.env` breaks **every**
   nightly backup, not just the command in front of you.
2. Percent-encode any of `@ : / ? # & %` in a password inside `SUPABASE_DB_URL`.
3. After any rotation, check history: `grep -c 'sk-ant-api03' ~/.bash_history`
   (the server uses bash; there is no `.zsh_history` there).

### Two Anthropic organisations — rotate in the right one

| Org | Login | Use |
|---|---|---|
| **Ryvo** | `hello@ryvodigital.com` | **This project.** `ANTHROPIC_API_KEY` belongs here. |
| Personal | `manuel.seixasvale@gmail.com` | Not this project |

A key rotated in the wrong org will look valid in the console and fail at
runtime. Check the org before creating or revoking anything.

### Why the Supabase key is an n8n credential, not an env var

`n8n export:workflow` writes **node parameters** into the workflow JSON, and
`backup.sh` commits and pushes `workflows/` to GitHub nightly. A secret held in
a node parameter would therefore be published every night. Credentials are
encrypted at rest with `N8N_ENCRYPTION_KEY` and are **not** included in workflow
exports — verified: the exported JSON contains only
`{"id":"ryvoSupabaseCred","name":"Ryvo Supabase (service_role)"}`.

The Twilio auth token is the exception. Signature verification needs it inside a
Code node, and Code nodes cannot read credentials, so it is passed as a
container env var. Which required relaxing two n8n defaults — see §6.

### If `N8N_ENCRYPTION_KEY` is lost

Every credential stored in n8n, including the Supabase one, becomes permanently
unreadable. It must exist in a password manager, not only on the server.

---

## 6. n8n configuration this depends on

Set in `infra/docker-compose.yml` on the `n8n` service. Both were measured
against image `2.28.3`, not assumed:

| Variable | Why | Default behaviour without it |
|---|---|---|
| `NODE_FUNCTION_ALLOW_BUILTIN=crypto` | HMAC-SHA1 for the signature | `Module 'crypto' is disallowed` |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` | Code node reads `TWILIO_AUTH_TOKEN` | `access to env vars denied` |

**`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` lets any Code node read every variable in
that env block** — including `N8N_ENCRYPTION_KEY`, `DB_POSTGRESDB_PASSWORD` and
the JWT secret. Accepted deliberately, tolerable only while the operator is the
sole workflow author. **Treat the `environment:` block as a security surface:
anything added there becomes readable from any Code node.** Keep it minimal.

Note that `docker compose --env-file` only feeds *interpolation* of the compose
file; it does not inject `.env` into containers. Only what is listed under
`environment:` is present. The Supabase and Anthropic keys are deliberately not
there.

Changing any of this requires `docker compose --env-file ../.env up -d n8n`.

### Activating a workflow: use the UI, not the CLI

**Toggling a workflow active in the n8n UI takes effect immediately — no
restart.** The restart requirement is specific to `n8n update:workflow` from the
CLI, which prints *"Changes will not take effect if n8n is running"* and means
it: the trigger is not registered until n8n reloads.

Checkpoint A was built CLI-first and cost four bounces as a result — one for the
compose change, which was genuinely required, and three purely to pick up
activations. Later checkpoints should not accumulate restarts that way:

- **Config change** (anything in `environment:`) → restart, unavoidable.
- **Workflow create/update** → import via CLI is fine, but **activate in the
  UI**, or restart once at the end of a batch rather than after each workflow.

This matters more as soon as there is live traffic, when each bounce is a real
outage rather than a free 20 seconds.

---

## 7. Reading the logs

```bash
ssh ryvo
cd /opt/ryvo-automation-platform/infra

docker compose --env-file ../.env logs -f --tail=100 n8n   # live n8n
docker compose --env-file ../.env ps                        # container health
tail -50 /var/log/ryvo-backup.log                           # nightly backup
```

n8n UI → **Executions** is the fastest view of what a webhook actually did:
which node failed, with the input and output of each.

Query the platform DB directly (service_role, server-side only):

```bash
set -a; . /opt/ryvo-automation-platform/.env; set +a
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/automation_runs?select=status,error_type,duration_ms,started_at&order=started_at.desc&limit=10"
```

Supabase requires the `apikey` header — `Authorization` alone returns 401.

---

## 8. Data contract as built (Checkpoint A)

| Table | Written when | Notes |
|---|---|---|
| `leads` | every inbound from a known client | upsert on `(client_id, phone)`; `phone` stored **without** the `whatsapp:` prefix. First contact sets `source='whatsapp'`, `stage='new'`, `consent_status='unknown'`, and `full_name` from `ProfileName` as a first guess |
| `messages` | every inbound | `external_id` = Twilio `MessageSid` — the dedupe key. `channel='whatsapp'`, `direction='inbound'`, `status='received'`, `ai_generated=false` |
| `events` | first contact only | `lead.created`. Also `run.failed` (severity `critical`) for an unknown recipient |
| `automation_runs` | every execution | `status`, `duration_ms`, and a `payload` carrying **no message bodies and no PII** |

### Dedupe is enforced by the database, not by workflow logic

Migrations `0003` + `0004` add unique indexes on `messages (client_id,
external_id)` and `leads (client_id, phone)`. The workflow attempts the insert
and treats a **409 / 23505** as "already processed, stop here". Checking
"does this id exist?" first is not sufficient on its own — Twilio retries, and
two deliveries can both pass that check before either commits.

Both indexes are deliberately **non-partial**. A partial index (`where … is not
null`) is invisible to PostgREST's upsert, which emits `ON CONFLICT (client_id,
phone)` with no predicate and fails with `42P10`. Plain unique indexes already
treat NULLs as distinct, so null-phone leads and null-`external_id` outbound
messages are still unconstrained. **Do not "tidy" these back into partial
indexes.**

### Unknown recipient logs to `events`, not `automation_runs`

The spec says to log a run with `error_type='unknown_client'`, but
`automation_runs.client_automation_id` is `NOT NULL` with a foreign key — and by
definition there is no client automation for an unknown recipient. So the event
goes to `events`, whose `client_id` is nullable, as `run.failed` /
`severity='critical'`, with `error_type` in `data`.

---

## 9. Verified on 2026-09-01

40/40 automated checks, driven by genuinely Twilio-signed requests. The
signature implementation was first checked against Twilio's published test
vector (`L/OH5YylLD5NRKLltdqwSvS0BnU=`) before going anywhere near n8n.

Covered: forged signature → 403 with zero rows written; missing signature → 403;
signature from the wrong key → 403; valid message → exactly one lead, one
message, one run, one `lead.created`; replayed identical payload → no second
message row; a second distinct message → updates the lead, no duplicate, no
second `lead.created`; unknown recipient → `unknown_client` event, no lead;
inbound image (`NumMedia=1`) → stored without crashing; run payloads free of PII.

**End-to-end confirmed the same day.** A real WhatsApp message from the
operator's handset through the Twilio sandbox produced execution 18, `success`,
1.611s: one lead (`+351933048230`, `full_name` "Manuel Vale" taken from
`ProfileName`), one message row (inbound, correct body, `status='received'`,
`ai_generated=false`), no duplicates. Checkpoint A is closed.
