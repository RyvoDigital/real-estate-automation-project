# Phase 1 — AI Inbound Concierge (WhatsApp)

> ## ⚠️ Partly superseded — do not follow the WhatsApp sections as written
>
> This is still the **governing spec** for the Concierge's behaviour: the data
> contract, the Claude call, escalation, calendar booking and testing all stand.
>
> **But every instruction here about the WhatsApp channel is dead.** It assumes
> Meta's Cloud API. That path is blocked — the Facebook account required for the
> Meta Business Portfolio was disabled and the appeal denied with no further
> review. Phase 1 runs on the **Twilio Sandbox for WhatsApp** instead.
>
> Read [`phase-1-checkpoint-a-twilio-handoff.md`](phase-1-checkpoint-a-twilio-handoff.md)
> alongside this document. It replaces:
>
> - **§2** — credentials. `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
>   `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET` are **not in use**; they
>   remain in `.env.example` as empty placeholders for an eventual return to
>   Meta. The live values are `TWILIO_*`.
> - **§6** — WhatsApp specifics. There is **no `hub.challenge` GET verification**
>   (Twilio has no equivalent), and the signature is `X-Twilio-Signature`
>   (HMAC-SHA1 over the URL plus sorted POST parameters), **not**
>   `X-Hub-Signature-256` over the raw body. The dedupe key is Twilio's
>   `MessageSid`.
> - **§8, Checkpoint A** — superseded and already **completed and verified on
>   2026-09-01**.
> - **§3** — the diagram's entry point only. Everything from *resolve client*
>   onwards is accurate and was built as drawn; that separation is the point.
>
> Also stale here: **§10** says `restore.sh` has never been run — it was
> exercised on 2026-08-07 and six defects were fixed
> ([`restore-drill.md`](restore-drill.md)).
>
> **For what is actually deployed, read [`concierge-runbook.md`](concierge-runbook.md).**

**Project:** Ryvo real estate AI automation platform
**Audience:** Claude Code (executor)
**Prereq:** Phase 0 complete — server hardened, n8n live at `https://n8n.ryvodigital.com` on Postgres, Supabase (Frankfurt) with base schema + `0002_service_role_grants`, nightly backups running.

---

## 0. Read this first

This document specifies **Automation 01 — AI Inbound Concierge**, the first sellable automation.

**What it does, in one line:** a prospect messages a real estate agency on WhatsApp; within seconds an AI replies, answers their questions, qualifies them (budget, timeline, area, intent), books a viewing into the agent's calendar, and hands hot or sensitive leads to the human.

### Scope for this phase — read carefully

**IN scope:**
- WhatsApp only (via Meta Cloud API)
- One test client: Manuel / Ryvo acting as "client zero"
- Full lifecycle: receive → qualify → reply → book → log
- Human escalation path
- Runs and events logged to Supabase

**OUT of scope (do NOT build):**
- Instagram and email entry points (Phase 1b — same brain, extra triggers)
- The cockpit dashboard (Phase 2)
- Zero, the ops agent (Phase 3)
- Any client-facing login
- Multi-client onboarding tooling — one hardcoded test client row is fine

### Execution rules (non-negotiable)

1. **Build incrementally, pause at each checkpoint.** The checkpoints are in Section 8. Do not run the whole phase unattended.
2. **The operator holds all secrets.** Never generate, request in plaintext, echo, or commit real secret values. Read them from the server `.env`. When a new secret is needed, tell the operator exactly what to add and let them add it.
3. **`.env` edits:** one line per value, no trailing content. (A stray line previously caused the shell to execute a connection string.)
4. **Operator-only actions:** anything in the Meta / Google / Anthropic consoles. You provide exact settings; the operator clicks.
5. **Test before declaring done.** A checkpoint is complete only when a real message round-trip is demonstrated, not when the nodes exist.

---

## 1. Definition of done

Phase 1 is complete when:

1. A real WhatsApp message sent from the operator's phone to the test number produces an AI reply within ~10 seconds.
2. Over a multi-turn conversation, the AI extracts budget, timeline, area and lead type, and these land correctly in `public.leads`.
3. A booking request results in a real calendar event and a confirmation message.
4. An escalation trigger (see 5.4) stops the AI and notifies the operator.
5. Every inbound and outbound message is stored in `public.messages`.
6. Every execution writes a row to `public.automation_runs`; failures write `error_type` / `error_message`.
7. The workflow JSON is exported to `workflows/` and committed.
8. A written runbook exists at `docs/concierge-runbook.md`.

---

## 2. Credentials & accounts needed

| Value | Where from | Who does it |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys | Operator adds to server `.env` |
| `WHATSAPP_TOKEN` | Meta app → WhatsApp → API Setup (temp token to start) | Operator |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta app → WhatsApp → API Setup | Operator |
| `WHATSAPP_VERIFY_TOKEN` | Operator invents a random string | Operator |
| `WHATSAPP_APP_SECRET` | Meta app → Settings → Basic → App Secret | Operator |
| `GOOGLE_CALENDAR_ID` | Google Calendar → settings → calendar ID | Operator |
| Google Calendar OAuth | n8n credential UI | Operator, in n8n |

Add each to `/opt/ryvo-automation-platform/.env`, and document each as an empty key in the committed `.env.example`.

### Meta setup (operator, guided by agent)

1. Create/confirm a Meta Business account at business.facebook.com.
2. developers.facebook.com → **Create App** → type **Business**.
3. Add the **WhatsApp** product.
4. In **API Setup**: note the **test number**, its **Phone number ID**, and generate a **temporary access token** (24h — fine for building; a permanent System User token comes before go-live).
5. Under **To**, add the operator's own WhatsApp number as a verified recipient (up to 5 allowed).
6. **Webhook config** comes later, at Checkpoint B, once the n8n URL exists.

> Note: the temp token expires every 24h. If replies suddenly stop working mid-build, that is the first thing to check.

---

## 3. Architecture

```
WhatsApp (Meta Cloud API)
        │  webhook POST
        ▼
   n8n workflow: inbound_concierge_whatsapp
        │
        ├─ verify signature ─────────► reject if invalid
        ├─ dedupe on message id
        ├─ resolve client + upsert lead   ──► Supabase
        ├─ store inbound message          ──► Supabase
        ├─ load conversation history      ◄── Supabase
        ├─ call Claude (structured JSON out)
        ├─ branch: book / escalate / reply
        │     └─ Google Calendar (create event)
        ├─ send WhatsApp reply (Graph API)
        ├─ store outbound message + update lead ──► Supabase
        └─ log automation_run + events           ──► Supabase
```

All Supabase writes use the **service_role** key (server-side only). RLS is deny-by-default with no policies; `0002_service_role_grants` is what makes these writes possible.

---

## 4. Data contract

Exactly what gets written where. Do not invent columns; the schema is fixed.

### `clients`
One seed row for testing:
```sql
insert into public.clients (name, agency_name, segment, status, whatsapp_number, email, timezone, locale)
values ('Ryvo Test Client','Ryvo Digital','luxury_boutique','active','<test number>','hello@ryvodigital.com','Europe/Lisbon','pt-PT');
```

### `client_automations`
Link the test client to the `inbound_concierge` automation. Store per-client behaviour in `config` jsonb:
```json
{
  "agency_name": "Ryvo Test Client",
  "agent_name": "Sofia",
  "languages": ["pt-PT", "en", "es"],
  "areas": ["Cascais", "Estoril", "Lisbon"],
  "booking_window_days": 14,
  "working_hours": { "start": "09:00", "end": "19:00", "days": [1,2,3,4,5,6] },
  "escalate_to": "<operator whatsapp number>",
  "handoff_note": "A member of the team will follow up personally."
}
```
Set `n8n_workflow_id` once the workflow exists.

### `leads`
Upsert key: `client_id` + `phone`.
- On first contact: `source='whatsapp'`, `stage='new'`, `consent_status='unknown'`.
- Claude's extraction fills: `full_name`, `lead_type`, `budget_min`, `budget_max`, `timeline`, `area`.
- Put anything structured-but-not-columnar into `qualification` jsonb (financing, bedrooms, purpose, notes).
- `stage` transitions: `new → contacted → qualified → viewing_booked` (or `nurturing`, `lost`).
- Always update `last_contact_at` and `updated_at`.

### `messages`
Every message, both directions:
- `channel='whatsapp'`, `direction='inbound'|'outbound'`
- `body` = message text
- `ai_generated=true` for AI replies, `false` for inbound
- `approved_by_human` = null in v1 (the Concierge sends autonomously within its guardrails)
- `external_id` = Meta's message id — **this is the dedupe key**
- `status`: `received` for inbound; `sent` / `failed` for outbound

### `automation_runs`
One row per webhook execution:
- `client_automation_id`, `status` = `success` | `error`
- `started_at`, `finished_at`, `duration_ms`
- On failure: `error_type` (e.g. `claude_timeout`, `whatsapp_send_failed`, `calendar_error`, `bad_json`), `error_message`
- `payload`: minimal execution metadata — **no full message bodies, no PII**

### `events`
Append-only, for the cockpit and Zero later:
- `lead.created`, `lead.qualified`, `viewing.booked`, `lead.escalated`, `run.failed`
- `severity`: `info` normally, `warning` for escalations, `critical` for failures
- `summary`: one human-readable line

---

## 5. The Claude call

### 5.1 Model & call shape
- Endpoint: `https://api.anthropic.com/v1/messages`
- Model: use a current Sonnet-class model. **Verify the exact model string against Anthropic's docs before hardcoding** — do not guess.
- `max_tokens`: 1024
- Include the last **20** messages of history, oldest first.
- Timeout: 20s. On timeout, retry once; if it fails again, escalate (5.4) rather than sending a broken reply.

### 5.2 Structured output
Claude must return **only** JSON, no prose, no markdown fences:

```json
{
  "reply": "string — the message to send, in the lead's language",
  "lead_type": "buyer|seller|renter|unknown",
  "full_name": "string|null",
  "budget_min": "number|null",
  "budget_max": "number|null",
  "timeline": "string|null",
  "area": "string|null",
  "qualification_notes": { "financing": "string|null", "bedrooms": "number|null", "purpose": "string|null" },
  "stage": "contacted|qualified|nurturing",
  "intent": "question|booking|not_interested|other",
  "wants_booking": true,
  "proposed_times": ["ISO8601", "..."],
  "needs_human": false,
  "escalation_reason": "string|null"
}
```

Parse defensively: strip stray fences, validate required keys, and if parsing fails, log `error_type='bad_json'`, escalate, and do **not** send anything to the lead.

### 5.3 System prompt — required content

Compose from `client_automations.config`. It must instruct Claude to:

- Act as a named assistant for the agency (e.g. "Sofia at Ryvo Test Client"), warm and professional, never pushy — this is luxury, not a call centre.
- **Reply in the language the lead writes in** (PT / EN / ES).
- Keep replies short and WhatsApp-native: 1–3 sentences, no email formatting, no bullet lists.
- Qualify **conversationally, one or two questions at a time** — never interrogate with a list.
- Gather over the conversation: buyer or seller, budget range, timeline, preferred area, financing status.
- Offer to book a viewing once there is genuine interest, and propose concrete times inside working hours.
- **Never invent property details, prices, availability, or legal/tax advice.** If it doesn't know, say a colleague will confirm.
- **Never negotiate price or terms.**
- Disclose it's an assistant if asked directly — do not claim to be human.
- Set `needs_human: true` for any of the triggers in 5.4.

### 5.4 Escalation triggers (hard rules)

Set `needs_human: true` and stop AI replies when:
- The lead asks to speak to a person
- Price negotiation, offers, or contractual/legal/tax questions arise
- The lead is upset, complaining, or the tone turns hostile
- A qualified lead's budget exceeds a configured high-value threshold
- Claude fails twice, or returns unparseable JSON
- Anything the prompt can't handle without inventing facts

On escalation: notify the operator (WhatsApp message to `config.escalate_to`), write `lead.escalated` to `events` with `severity='warning'`, and send the lead the configured `handoff_note` — never silence.

---

## 6. WhatsApp specifics

- **Webhook verification (GET):** Meta sends `hub.mode`, `hub.verify_token`, `hub.challenge`. Return the raw `hub.challenge` as plain text when the token matches `WHATSAPP_VERIFY_TOKEN`.
- **Signature (POST):** verify `X-Hub-Signature-256` — HMAC-SHA256 of the raw body using `WHATSAPP_APP_SECRET`. Reject mismatches. The raw body is needed, so ensure n8n isn't re-serialising before the check.
- **Respond 200 immediately.** Meta retries aggressively on slow or failed responses; acknowledge first, then process.
- **Dedupe on message id** — retries are common and would otherwise double-reply.
- **24-hour window:** free-form replies are only allowed within 24h of the lead's last message. Outside it, only approved templates may be sent. The Concierge is reactive so it lives inside the window, but any follow-up feature must respect this. Log and skip rather than failing loudly if a send is attempted outside it.
- Handle non-text inbound (image, audio, location) gracefully: acknowledge and either escalate or ask for text. Do not crash.
- Mark inbound messages as read via the Graph API so the agent's WhatsApp reflects reality.

---

## 7. Calendar booking

- Google Calendar, credential configured in n8n's UI by the operator.
- Before proposing: query free/busy for the next `booking_window_days`, filter to `working_hours`, propose up to 3 slots.
- On confirmation: create the event with the lead's name and phone in the title/description, set the client's timezone, and store the event id in `leads.qualification`.
- Then: set `leads.stage='viewing_booked'`, write a `viewing.booked` event, and increment `metrics_daily.viewings_booked`.
- If the slot was taken in the interim, apologise and offer alternatives — never double-book.

---

## 8. Build checkpoints

Pause and report at each.

**Checkpoint A — plumbing**
Seed the test `clients` and `client_automations` rows. Create the workflow skeleton: webhook → signature verify → 200 response → dedupe → resolve client → upsert lead → store inbound message → log run. No AI yet. *Proof: a real WhatsApp message creates a lead and a message row.*

**Checkpoint B — the brain**
Add history load, the Claude call, JSON parsing, and the WhatsApp send. *Proof: a real multi-turn conversation where the AI replies sensibly and qualification fields populate.*

**Checkpoint C — booking**
Add calendar free/busy, slot proposal, event creation, confirmation, stage update. *Proof: a booking request produces a real calendar event.*

**Checkpoint D — safety & polish**
Escalation path, operator notification, error handling on every external call, non-text handling, `metrics_daily` rollups, `events` for the main transitions. *Proof: deliberately trigger an escalation and a forced failure; both behave correctly.*

**Checkpoint E — hand-off**
Export workflow JSON to `workflows/`, commit and push, write `docs/concierge-runbook.md` (how to swap the token, rotate credentials, read the logs, common failures), update `docs/WHERE-WE-LEFT-OFF.md`.

---

## 9. Testing

Run these as real conversations from the operator's phone:

1. **Simple question** — "Is the apartment in Cascais still available?" → sensible reply, lead created.
2. **Full qualification** — over several turns, reveal budget, timeline, area → fields land in `leads`.
3. **Booking** — ask to view → slots proposed → confirm → calendar event exists.
4. **Escalation** — "I want to speak to a real person" → AI stops, operator notified, handoff note sent.
5. **Price negotiation** — "Would they accept 15% under asking?" → escalates, does not negotiate.
6. **Language** — send in Portuguese → replies in Portuguese.
7. **Duplicate delivery** — replay the same webhook payload → no second reply.
8. **Failure** — temporarily break the Anthropic key → run logs `error`, lead is not left in silence.

---

## 10. Known constraints

- **Temp WhatsApp token expires every 24h.** Replies stopping is usually this. A permanent System User token is needed before any real client.
- **Test number only reaches nominated recipients.** Real numbers require Meta business verification, which is outside our control and can take days. Build against the test number; swapping later is configuration, not a rebuild.
- **Supabase free tier is not backed up by us.** `backup.sh` covers only the engine Postgres. Before real client data lands, decide on a Supabase backup strategy. Flag it; do not silently proceed once real leads exist.
- **`restore.sh` has never been run.** Schedule a restore drill into a scratch database.
