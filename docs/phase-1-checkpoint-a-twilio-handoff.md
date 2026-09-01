# Phase 1 — Checkpoint A (Twilio adaptation)

> ## 📋 Historical record — not a live spec
>
> **This document was written *before* Checkpoint A was built.** Checkpoint A was
> completed and verified end to end on **2026-09-01**. Keep this for the
> reasoning behind the channel change; do not follow it as instructions.
>
> **For what actually exists, read [`concierge-runbook.md`](concierge-runbook.md).**
>
> Three things this document treats as open or planned have since been settled:
>
> | This document says | What is now true |
> |---|---|
> | §3.2 — "determine whether the n8n Code node has `crypto` available… report what you find" | **Answered.** In n8n 2.28.3 `crypto` is disallowed *and* `$env` is denied by default. Both were relaxed in `docker-compose.yml`; `$env` turned out to be the real gatekeeper, since the auth token cannot reach the workflow without it. See runbook §6, including the conditions attached to that decision. |
> | §3.2 — predicts the Caddy proxy will break signature validation | **Confirmed, exactly as predicted.** n8n sees `http://n8n:5678/…` internally, which produces a different signature and would 403 every request. The public URL is hardcoded in the `VerifySignature` node and built there rather than read from `X-Forwarded-Host`. |
> | §6 — specifies migration `0003` with partial unique indexes | **Superseded by `0004`.** The partial indexes broke the lead upsert: PostgREST emits `ON CONFLICT` with no predicate and fails `42P10` against a partial index. `0004` makes both non-partial. Do not re-apply §6 as written — see [`engineering-lessons.md`](engineering-lessons.md) §1, where this is the clearest instance of the pattern. |
>
> Two smaller deviations, both forced by the schema and documented in the
> runbook: an unknown recipient logs to `events` rather than `automation_runs`
> (whose `client_automation_id` is `NOT NULL`), and `ProfileName` seeds
> `leads.full_name` on first contact only.

**Project:** Ryvo real estate AI automation platform
**Audience:** Claude Code (executor)
**Supersedes:** §2, §6 and Checkpoint A of `phase-1-inbound-concierge-handoff.md`
**Leaves unchanged:** §1, §3, §4, §5, §7, §9, §10 of that document — read it first, it is still the governing spec.

---

## 0. Read this first

### Why this document exists

The original Phase 1 spec builds the Inbound Concierge on Meta's WhatsApp Cloud API. **That path is blocked** — the Facebook account required to create the Meta Business Portfolio was disabled by Meta, the appeal was denied with no further review, and the replacement account needs several weeks of warm-up before it can safely be used.

Rather than let one external blocker stall the entire build, Checkpoint A onwards runs on the **Twilio Sandbox for WhatsApp**, which requires no WhatsApp Business Account and no Meta account of any kind.

### What this changes, and what it doesn't

**Changes (this document):**
- The inbound webhook format — Twilio posts `application/x-www-form-urlencoded`, not Meta's JSON
- Signature verification — `X-Twilio-Signature` (HMAC-SHA1) instead of `X-Hub-Signature-256`
- No `hub.challenge` GET verification step — Twilio has no equivalent
- The dedupe key — Twilio's `MessageSid` instead of Meta's message id
- Credentials — Twilio Account SID and Auth Token instead of four Meta values

**Does not change (still per the original spec):**
- §4 the data contract — every table, column and stage transition
- §5 the Claude call, structured output, system prompt and escalation triggers
- §7 calendar booking
- §9 the test suite
- The architecture in §3 from "resolve client" onwards

This separation is deliberate and it is the point: **the channel is an entry point, everything downstream is channel-agnostic.** When Meta unblocks, swapping to the Cloud API touches the inbound parse node, the signature check and the send node. Nothing else.

### Execution rules (unchanged, non-negotiable)

1. **Build incrementally. Stop at the checkpoint and report.** Do not proceed past Checkpoint A.
2. **The operator holds all secrets.** Never generate, request in plaintext, echo, or commit real secret values. Read them from the server `.env`. When a new secret is needed, tell the operator exactly what to add and let them add it.
3. **`.env` edits:** one line per value, no trailing content.
4. **Operator-only actions:** anything in the Twilio, Google or Anthropic consoles. You provide exact settings; the operator clicks.
5. **Test before declaring done.** The checkpoint is complete only when a real message round-trip is demonstrated, not when the nodes exist.
6. **Where this document states a Twilio behaviour, verify it against Twilio's live docs before implementing.** The docs below were read on 2026-09-01 and Twilio changes webhook parameters without notice.

---

## 1. What the Twilio Sandbox is and what it costs us

The Sandbox is a pre-configured testing environment. No WhatsApp Business Account and no registered sender are required. Twilio provides a shared number, `+14155238886`, and only users who have joined your specific sandbox can exchange messages with it.

**Limitations that affect the build — read all of these:**

| Limitation | Consequence for us |
|---|---|
| **The sandbox session expires 3 days after joining** | The operator must re-send `join <code>` every few days. **If messages suddenly stop arriving, this is the first thing to check** — it is the Twilio equivalent of Meta's 24h token expiry. |
| Only joined users can be messaged | Fine — testing is operator-only. Messaging anyone else fails with error 63015. |
| One message every 3 seconds | Fine for conversational use. Do not build anything that bursts. |
| The number is Twilio's and shows Twilio branding | Fine for building. Not a client demo surface. |
| Business-initiated messages need pre-approved templates; custom templates are unavailable | Irrelevant to the Concierge, which is reactive and lives inside the 24h window. Relevant later for Automations 2, 3 and 5. |
| Sandbox is only configurable in the **legacy** Twilio Console | The operator must use `twilio.com/console/sms/whatsapp/sandbox`, not the new console. |
| Testing and discovery only — not for production | Correct. This is a build scaffold, not a launch plan. |

The 24-hour customer service window still applies exactly as described in the original §6, so that constraint carries over unchanged. Note that sending `join <code>` itself opens a window.

---

## 2. Credentials & operator setup

### 2.1 New `.env` values

| Key | Where from | Who |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio Console, starts `AC…` | Operator |
| `TWILIO_AUTH_TOKEN` | Twilio Console — **this is the signature-validation secret** | Operator |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+14155238886` (the sandbox number) | Operator |
| `TWILIO_SANDBOX_KEYWORD` | The join code shown in the console | Operator |

Add each to `/opt/ryvo-automation-platform/.env`, one line per value. Document each as an empty key in the committed `.env.example`.

The Meta keys (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`) should still be added to `.env.example` as empty keys, with a comment noting they are for the future Meta migration. Do not remove them from the spec.

### 2.2 Operator steps in Twilio (you provide, operator clicks)

1. Sign up at twilio.com. A trial account is sufficient to start.
2. Go to the **legacy** console: `twilio.com/console/sms/whatsapp/sandbox`. Acknowledge the terms and confirm.
3. Note the sandbox number and the join keyword.
4. From the operator's own WhatsApp, send `join <keyword>` to the sandbox number. Wait for the confirmation reply.
5. **Webhook configuration comes later in this checkpoint**, once the n8n URL exists — under *Sandbox settings → Sandbox configuration → When a message comes in*, method POST.
6. Copy the Account SID and Auth Token into the server `.env`.

---

## 3. The inbound webhook contract

### 3.1 Request shape

Twilio makes an HTTP POST in `application/x-www-form-urlencoded` format and expects TwiML in response.

Parameters we care about:

| Parameter | Notes |
|---|---|
| `MessageSid` | 34-char unique message id, `SM…` or `MM…`. **This is the dedupe key.** |
| `AccountSid` | `AC…` — verify it matches `TWILIO_ACCOUNT_SID` |
| `From` | **Prefixed**: `whatsapp:+351933048230`. Strip the `whatsapp:` prefix before storing in `leads.phone`. |
| `To` | The sandbox number, also prefixed |
| `Body` | Message text, up to 1600 chars |
| `NumMedia` | `0` for plain text; `MediaUrl0` / `MediaContentType0` when > 0 |
| `ProfileName` | The sender's WhatsApp profile name — **use this as a first guess at `leads.full_name`**, but let Claude's extraction override it later |
| `WaId` | Sender's WhatsApp ID, typically the phone number without `+` |

`SmsSid` and `SmsMessageSid` carry the same value as `MessageSid` and are deprecated — ignore them.

Twilio also sends geographic parameters (`FromCountry` etc.) when available. Store nothing from these in v1, but **do not reject requests containing unexpected parameters** — see 3.2.

### 3.2 Signature verification — read carefully

Twilio signs every request with an `X-Twilio-Signature` header, HMAC-SHA1 over the webhook URL plus all request parameters sorted alphabetically and appended, using the account auth token as the key.

**Twilio explicitly warns against implementing your own validation**, because webhook parameters vary by event type and Twilio adds new ones without advance notice. An implementation that validates against a hardcoded list of expected parameters will silently start rejecting valid requests.

Therefore:

- The validation **must** iterate over every parameter actually received, not a fixed list.
- The URL used in the computation **must be the exact public URL Twilio called**, including scheme and any percent-encoding. Decoding or re-encoding it breaks validation.
- **This is the likely failure point.** n8n sits behind Caddy, so the URL n8n sees internally is not necessarily the public URL Twilio signed against. Confirm what n8n reports and, if it differs, construct the public URL explicitly from `DOMAIN` rather than trusting the request.
- Keep the webhook path free of query strings. Query parameters form part of the signed URL and add a failure mode for no benefit.

**Before implementing, determine whether the n8n Code node has `crypto` available.** It may require `NODE_FUNCTION_ALLOW_BUILTIN=crypto` in the n8n service environment, which needs a container restart. **Report what you find rather than assuming** — if a restart is needed, that is an operator decision, not yours.

Reject with 403 on mismatch. Log the rejection. Never process an unverified request.

### 3.3 Response

Twilio expects TwiML. For Checkpoint A there is no reply yet, so respond immediately with an empty TwiML document:

```xml
<?xml version="1.0" encoding="UTF-8"?><Response></Response>
```

Content-type `text/xml`, HTTP 200. **Respond first, process after** — the same discipline as the Meta path.

---

## 4. Client resolution

The sandbox number is shared, so `To` is always `+14155238886`. Resolve the client by matching `To` against `clients.whatsapp_number`.

This is deliberately the same shape the production logic needs — in production `To` is the client's own number, and the lookup is identical. **Do not hardcode a client id.** Resolve by `To`, and if no client matches, log a run with `error_type='unknown_client'` and stop.

---

## 5. Seed data

### `clients`

```sql
insert into public.clients
  (name, agency_name, segment, status, whatsapp_number, email, timezone, locale)
values
  ('Ryvo Test Client','Ryvo Digital','luxury_boutique','active',
   '+14155238886','hello@ryvodigital.com','Europe/Lisbon','pt-PT');
```

Note `whatsapp_number` is the **sandbox** number, stored without the `whatsapp:` prefix. When Meta comes online this row's number changes and nothing else does.

### `client_automations`

Link the test client to the seeded `inbound_concierge` automation row. Per the original §4, with two additions:

```json
{
  "agency_name": "Ryvo Test Client",
  "agent_name": "Sofia",
  "channel": "twilio_sandbox",
  "languages": ["pt-PT", "en", "es"],
  "areas": ["Cascais", "Estoril", "Lisbon"],
  "booking_window_days": 14,
  "working_hours": { "start": "09:00", "end": "19:00", "days": [1,2,3,4,5,6] },
  "escalate_to": "<operator whatsapp number, must have joined the sandbox>",
  "handoff_note": "A member of the team will follow up personally."
}
```

`channel` is new and exists so the eventual Meta migration is a config change with an explicit marker, not an archaeology exercise.

Set `n8n_workflow_id` once the workflow exists.

---

## 6. Migration 0003 — dedupe integrity

The original spec dedupes on message id in workflow logic. Logic alone is not sufficient: Twilio retries, and two near-simultaneous deliveries can both pass a "does this exist?" check before either writes.

Add `db/migrations/0003_messages_external_id_unique.sql`:

- A unique index on `public.messages (client_id, external_id)` where `external_id is not null`
- The workflow then relies on the constraint, not just the lookup: attempt the insert, and treat a unique-violation as "already processed, stop here" rather than as an error

**Before writing it, re-read §3 of `WHERE-WE-LEFT-OFF.md` on service_role grants.** Migration `0002` set default privileges so new tables inherit grants, and an index on an existing table should be unaffected — but verify `service_role` can still read and write `messages` after applying, functionally, not by reading flags. This project has already been bitten once by grants that looked fine and were not.

Apply using the documented session-pooler procedure. **Report before applying** — this is a schema change and falls under the review gate.

---

## 7. Build order

Work in this order and report at the end. Do not proceed to Checkpoint B.

1. Confirm `.env` has the four Twilio values (presence only — never echo them).
2. Write and report migration `0003`. Apply after approval. Verify grants functionally.
3. Seed the `clients` and `client_automations` rows.
4. Create workflow `inbound_concierge_whatsapp`. Nodes:
   - Webhook (POST, form-urlencoded)
   - Signature verification → reject 403 on mismatch
   - Respond 200 with empty TwiML
   - Normalise the payload: strip `whatsapp:` prefixes, extract `MessageSid`, `From`, `Body`, `ProfileName`, `NumMedia`
   - Resolve client by `To`
   - Upsert lead on `client_id` + `phone`, per original §4
   - Insert inbound message, per original §4, with `external_id = MessageSid`, `channel='whatsapp'`, `direction='inbound'`, `status='received'`, `ai_generated=false`
   - Log `automation_runs` row — success or error, with `duration_ms`
   - Write `lead.created` to `events` on first contact only
5. Give the operator the production webhook URL and the exact console setting.
6. Test per §8.
7. Export the workflow JSON to `workflows/`, commit, push.

**No AI, no reply, no calendar in this checkpoint.** The lead and message rows appearing correctly is the whole deliverable.

---

## 8. Definition of done

Checkpoint A is complete when **all** of these are demonstrated, not asserted:

1. A real WhatsApp message from the operator's phone to the sandbox number creates exactly one `leads` row with the correct phone number, `source='whatsapp'`, `stage='new'`, `consent_status='unknown'`.
2. The same message creates exactly one `messages` row with `external_id` equal to the `MessageSid`.
3. A second message from the same number updates the existing lead and does **not** create a duplicate.
4. An `automation_runs` row exists per execution with a plausible `duration_ms`.
5. **A forged request with an invalid `X-Twilio-Signature` is rejected with 403** and creates no rows.
6. **A replayed identical payload creates no second `messages` row** — the unique index holds.
7. A message from a number with no matching client logs `unknown_client` and creates no lead.
8. An inbound image (`NumMedia=1`) does not crash the workflow.
9. The workflow JSON is committed and pushed.

Items 5 and 6 are the ones that matter. The rest is plumbing; those two are where silent failure lives.

---

## 9. Known constraints to carry forward

- **Sandbox session expires every 3 days.** Messages silently stopping is usually this, not a bug. Document it in the runbook.
- **Supabase free tier auto-pauses after ~7 days of inactivity** and fails as a dead connection, not a clean error. This workflow must handle Supabase being unreachable — log the run as an error with `error_type='platform_db_unreachable'` rather than dying silently. See `WHERE-WE-LEFT-OFF.md` §3.
- **The nightly backup does not cover Supabase.** Real lead data will accumulate here during testing. It is test data for now; this must be resolved before a client.
- **Twilio adds webhook parameters without notice.** Any validation or parsing that assumes a fixed parameter set will break silently at some future date.

---

## 10. Report back with

- What you built, and the workflow id
- The migration `0003` SQL, and the functional grant verification result
- Evidence for each of the nine items in §8 — actual row output, not a description
- Whether `crypto` was available in the Code node or an env change was needed
- What the signature-validation URL had to be, and whether the Caddy proxy caused the mismatch predicted in 3.2
- Anything in this spec that turned out to be wrong
