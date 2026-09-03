# Phase 1 — Checkpoint B: the brain

**Project:** Ryvo real estate AI automation platform
**Audience:** Claude Code (executor)
**Written:** 2 September 2026
**Supersedes:** Checkpoint B of `phase-1-inbound-concierge-handoff.md`, and §5.1 of it
**Still governs, unchanged:** §4 (data contract), §5.2–5.4 (structured output, system prompt content, escalation triggers), §9 (test suite), §10 (constraints)

---

## 0. Read this first

Checkpoint A built the pipe. A real WhatsApp message reaches n8n, is signature-verified, resolves to a client, and writes a lead and a message row to Supabase. Nothing replies.

**Checkpoint B makes it answer.** Load conversation history, call Claude, parse the structured response, send a reply through Twilio, persist what was learned about the lead, and hand off to a human when it should.

This is the checkpoint where the system stops being a pipeline and starts being a product. It is also the first time it can say something wrong to a real person, so the guardrails are not optional polish — they are the deliverable.

### Scope

**IN:**
- History load, scoped per lead
- The Claude call with structured JSON output
- Defensive parsing
- Twilio send + outbound message logging
- Lead field persistence and stage transitions
- **Escalation, including the operator notification** — moved forward from Checkpoint D, see §8
- **Keepalive push alert** — a small addition that closes a known gap, see §9

**OUT — do not build:**
- Calendar booking (Checkpoint C). If Claude returns `wants_booking: true`, acknowledge conversationally and escalate; do not invent availability.
- `metrics_daily` rollups, non-text media handling, forced-failure drills (Checkpoint D)
- The cockpit, Zero, Instagram, email

### Execution rules (unchanged, non-negotiable)

1. **Build incrementally. Stop at the sub-gates in §10 and report.** Do not run the whole checkpoint unattended.
2. **The operator holds all secrets.** No new secrets are needed for this checkpoint — see §2.
3. **Test before declaring done.** A real multi-turn conversation from the operator's phone, not a node that exists.
4. **Where this document states an API behaviour, verify it against live docs before implementing.** That discipline caught the `$env` gatekeeper in Checkpoint A and the partial-index defect in `0003`.

---

## 1. What has changed since the original spec was written

The original Phase 1 handoff predates most of what is now true. Corrections that matter here:

| Original spec assumed | Actual state |
|---|---|
| Meta Cloud API for sending | **Twilio**, via the Messages API. See §7. |
| `crypto` in Code nodes is the open question | Both `crypto` and `$env` are enabled (`NODE_FUNCTION_ALLOW_BUILTIN`, `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`). Conditions attached — `docs/concierge-runbook.md` §6. |
| Supabase reached via raw key in nodes | Supabase is an **n8n credential** (`ryvoSupabaseCred`). Keep it that way; it keeps key material out of workflow exports and therefore out of git. |
| "Verify the model string, do not guess" | Still correct. See §4.1. |
| Escalation lands in Checkpoint D | **Moved into B** — the send node makes it nearly free, and a `needs_human` flag nothing acts on is a lie in the data. |
| `metrics_daily` in Checkpoint D | Unchanged, still D. |

Also carry forward from Checkpoint A:

- **Execution status is not a health metric.** A rejected forgery runs to completion and records `status=success`. Count `automation_runs` rows; only the accepted path writes them.
- **Dedupe indexes are non-partial by design** (`0004`). Do not "optimise" them back to partial — PostgREST emits `ON CONFLICT` with no predicate and fails `42P10`.
- **The Twilio sandbox session expires every 3 days.** If inbound stops, re-join before debugging.
- **Sandbox international delivery is unreliable.** Twilio warns about it, the sandbox number is US and the test number is Portuguese. If sends fail, establish whether it is Twilio before assuming it is the code. This is the single most likely source of confusion in this checkpoint.

---

## 2. Credentials

**No new secrets are required.** Everything needed is already in place:

- `ANTHROPIC_API_KEY` — present, rotated 1 Sep, verified 200
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` — present, and already in the n8n container env
- Supabase — n8n credential

If you conclude something new is needed, stop and say so rather than working around it.

---

## 3. Architecture for this checkpoint

```
  [Checkpoint A, unchanged]
  webhook → verify signature → 200 → dedupe → resolve client
          → upsert lead → store inbound message → log run
                                │
                                ▼
  ┌─────────────────── NEW IN CHECKPOINT B ───────────────────┐
  │  load history (last 20 for this lead, oldest first)       │
  │            │                                              │
  │            ▼                                              │
  │  build system prompt from client_automations.config       │
  │            │                                              │
  │            ▼                                              │
  │  call Claude ──── timeout/error ──► retry once ──► fail   │
  │            │                                       │      │
  │            ▼                                       │      │
  │  parse JSON ──── unparseable ──────────────────────┤      │
  │            │                                       │      │
  │            ▼                                       ▼      │
  │  needs_human? ──── yes ──────────────► ESCALATE (§8)      │
  │            │ no                                           │
  │            ▼                                              │
  │  update lead fields + stage                               │
  │            │                                              │
  │            ▼                                              │
  │  send via Twilio ──── send fails ──► log failed, escalate │
  │            │                                              │
  │            ▼                                              │
  │  store outbound message + events + finalise run           │
  └───────────────────────────────────────────────────────────┘
```

Every path ends in a written `automation_runs` row. There is no branch that exits silently.

---

## 4. The Claude call

### 4.1 Model

**Use a current Sonnet-class model — Sonnet 5 unless docs say otherwise.** Verify the exact API model string against Anthropic's documentation before writing it anywhere. Do not guess, and do not copy a string from this document as authoritative.

**Put the model string in `client_automations.config.model`, not in the node.** Changing model becomes a config update rather than a workflow edit, and different clients can eventually run different models. Read it from config with a sane fallback, and log which model was used in the run's `payload`.

**Why Sonnet rather than Opus:** the task is short conversational replies plus structured field extraction, comfortably within Sonnet's range. Per-conversation cost lands directly on margin, because the commercial model absorbs variable costs into the retainer. Checkpoint D will compare quality against real accumulated transcripts; until then this is a reversible config value, not a commitment.

### 4.2 Call shape

- Endpoint `https://api.anthropic.com/v1/messages`
- `max_tokens`: 1024
- History: the last **20** messages for this lead, oldest first
- Timeout: **20s**. On timeout or 5xx, **retry once**. If it fails again, escalate per §8 — never send a degraded reply.
- Do **not** retry on 4xx. A 400 or 401 is a configuration fault and retrying wastes money and time. Log `error_type='claude_auth'` or `'claude_bad_request'` and escalate.
- Record `input_tokens` / `output_tokens` from the response into the run's `payload`. Cost per conversation is a commercial input, and without this we are guessing. **No message bodies or PII in `payload`.**

### 4.3 Structured output

Claude must return **only** the JSON object defined in §5.2 of the original spec. That schema is unchanged — do not redesign it.

**Parse defensively.** In order:

1. Strip markdown fences and any leading or trailing prose.
2. Parse.
3. Validate that required keys exist and have the right types.
4. If any step fails: log `error_type='bad_json'`, escalate per §8, and **send nothing to the lead**.

A malformed response must never reach a human. Silence plus an escalation is recoverable; a broken or hallucinated reply to a prospect is not.

**Sanity-check extracted values before persisting.** A budget of `50` probably means €50,000 and a budget of `999999999` is a parse artefact. Reject implausible numbers into `qualification` notes rather than writing them to `budget_min` / `budget_max`, and note the rejection. Bad structured data is worse than absent structured data, because everything downstream will trust it.

### 4.4 System prompt

Compose from `client_automations.config`. The required content is §5.3 of the original spec, unchanged. Reinforce these, as they are the ones with real consequences:

- **Never invent property details, prices, availability, or legal/tax advice.** If it does not know, say a colleague will confirm.
- **Never negotiate price or terms.**
- **Disclose it is an assistant if asked directly.** Do not claim to be human. This is an EU AI Act transparency obligation, not a style preference.
- **Reply in the language the lead writes in** (PT / EN / ES).
- Short and WhatsApp-native: 1–3 sentences, no email formatting, no bullet lists.
- Qualify conversationally, one or two questions at a time. Never interrogate with a list. This is luxury, not a call centre.

Assistant name is **Sofia**, from config.

Because booking is out of scope this checkpoint, add one instruction: **if the lead asks to book a viewing, acknowledge warmly and say a colleague will confirm a time — do not propose specific times.** Proposing slots the system cannot honour is exactly the "invent facts" failure the prompt otherwise forbids.

---

## 5. History load

- Query `messages` for this `lead_id`, ordered oldest first, limit 20.
- Map to Anthropic's format: `direction='inbound'` → `user`, `direction='outbound'` → `assistant`.
- The message just stored by Checkpoint A **is** the current turn. Do not append it twice; verify empirically rather than reasoning about it.
- If history is empty or the query fails, do not silently proceed with no context — a failed history query and a genuinely first message are different situations, and only one is normal. Distinguish them, and log the failure.

---

## 6. Persisting what was learned

Per §4 of the original spec, unchanged. Points worth restating:

- Update `full_name` only if Claude extracted something better than the `ProfileName` seed.
- `budget_min` / `budget_max` / `timeline` / `area` / `lead_type` from extraction, subject to the sanity check in §4.3.
- Anything structured but not columnar → `qualification` jsonb.
- Stage transitions: `new → contacted → qualified` (or `nurturing`). **Not `viewing_booked`** — nothing can book yet.
- Always update `last_contact_at` and `updated_at`.
- Write `lead.qualified` to `events` on the transition, once, not on every subsequent message.

**Never let a field go backwards.** If Claude returns null for something already known, keep the existing value. A lead that mentioned a budget in message 3 still has that budget in message 7, even if message 7 was about parking.

---

## 7. Sending via Twilio

- Anthropic's Messages API and Twilio's are both called `Messages`. Name nodes unambiguously; this will otherwise cause a confusing bug at 1am.
- POST to Twilio's Messages endpoint with `From` = `TWILIO_WHATSAPP_FROM`, `To` = `whatsapp:` + the lead's phone, `Body` = the reply.
- Twilio returns a `sid`. **Store it as the outbound message's `external_id`** — that is what the `(client_id, external_id)` unique index expects, and it makes delivery traceable in Twilio's logs.
- Outbound row: `direction='outbound'`, `ai_generated=true`, `approved_by_human=null`, `status='sent'` or `'failed'`.
- **On send failure:** write the message row with `status='failed'`, log `error_type='whatsapp_send_failed'` with Twilio's error code, and escalate. Do not retry blindly — if it failed because the sandbox session expired, retrying just fails again.
- **24-hour window:** the Concierge is reactive so it lives inside it. If a send is ever attempted outside the window, **log and skip** rather than failing loudly.
- **Expect international delivery flakiness.** If sends fail, check Twilio's console logs for the error code before touching the workflow. Error 63015 means the recipient has not joined the sandbox; a 3-day-expired session presents the same way.

---

## 8. Escalation — moved into this checkpoint

The triggers are §5.4 of the original spec, unchanged: the lead asks for a person; price negotiation, offers, or contractual/legal/tax questions; the lead is upset or hostile; budget over the configured high-value threshold; Claude fails twice or returns unparseable JSON; anything the prompt cannot handle without inventing facts.

**On escalation, all four of these, in this order:**

1. **Stop the AI.** No further AI replies on this lead until a human clears it. Add `escalated: true` (with a timestamp and reason) to `leads.qualification`, and check it early in the workflow so subsequent inbound messages are logged but not answered.
2. **Send the lead the configured `handoff_note`.** Never leave someone in silence — that is worse than the AI having answered imperfectly.
3. **Notify the operator** via WhatsApp to `config.escalate_to` (+351933048230). Include the lead's phone, the reason, and their last message. Keep it short enough to read on a lock screen.
4. **Write `lead.escalated` to `events`** with `severity='warning'`.

If the parse failed, step 2 still applies — the handoff note is a fixed string from config and does not depend on Claude having succeeded.

**One trap to avoid:** the operator notification and the lead reply both go through the same Twilio sandbox. If the sandbox is the reason the send failed, the escalation notification will fail too. Handle that case explicitly — log it as `error_type='escalation_notify_failed'` at `severity='critical'` — rather than letting the alert die with the thing it is alerting about.

---

## 9. Keepalive push alert

Small, and it closes a gap noted at Checkpoint A. The `supabase_keepalive` workflow currently records a failed execution on error, which is pull-only — it only helps if someone looks.

Add a failure branch that sends a WhatsApp message to `config.escalate_to`.

**State the limitation in the runbook rather than pretending it is solved:** this alert rides the same Twilio sandbox whose session expires every three days, so it cannot be the only channel. It is strictly better than nothing and strictly worse than a real alerting path. An email or a second channel belongs in Checkpoint D.

---

## 10. Build order and sub-gates

**Pause and report at each gate.** Three gates, not one — this checkpoint is large enough that a single report at the end would bury whatever went wrong.

**Gate B1 — it replies at all.**
History load, Claude call, parse, Twilio send, outbound message row. No field persistence, no escalation. Hardcode nothing that config should provide.
*Proof: a real message from the operator's phone gets a sensible reply in the same language, and an outbound row exists with Twilio's sid as `external_id`.*

**Gate B2 — it remembers and learns.**
Field persistence, stage transitions, the no-backwards rule, `events`.
*Proof: a genuine multi-turn conversation in Portuguese where budget, timeline and area are revealed across different messages and all land correctly in `leads`. Then a fourth message on an unrelated topic that does **not** wipe them.*

**Gate B3 — it knows when to stop.**
Escalation path, all four steps. Keepalive alert.
*Proof: "quero falar com uma pessoa" stops the AI, sends the handoff note, notifies the operator, and writes the event. Then a follow-up message on the same lead is logged but not answered.*

Export the workflow, commit and push at the end of each gate, not only at B3.

---

## 11. Definition of done

Checkpoint B is complete when all of these are demonstrated with evidence, not asserted:

1. A real WhatsApp message produces an AI reply within ~10 seconds.
2. Over a multi-turn conversation, `budget_min`, `budget_max`, `timeline`, `area` and `lead_type` land correctly in `leads`.
3. A later message on an unrelated topic does not erase previously extracted fields.
4. Portuguese in → Portuguese out. Same for English and Spanish.
5. A price-negotiation question escalates rather than being answered.
6. "I want to speak to a real person" triggers all four escalation steps.
7. After escalation, further inbound messages are stored but not answered.
8. Every inbound and outbound message is in `messages`, outbound carrying Twilio's sid.
9. Every execution writes an `automation_runs` row; failures carry `error_type` and `error_message`.
10. A forced bad-JSON response results in escalation and **no message sent to the lead**.
11. The workflow JSON is exported, committed, pushed.
12. `docs/concierge-runbook.md` updated with the Claude call, the escalation path, the model config field, and how to clear an escalated lead.

Items 3, 7 and 10 are the ones that matter most. The rest is visible in normal use; those three fail silently.

---

## 12. Testing

Run these as real conversations from the operator's phone. Adapted from §9 of the original spec.

1. **Simple question** — "Ainda está disponível o apartamento em Cascais?" → sensible PT reply, no invented details about a property that does not exist.
2. **Full qualification** — reveal budget, timeline and area across several turns → all fields land.
3. **Memory** — then ask something unrelated → prior fields survive.
4. **Language switch** — send in English mid-conversation → replies in English.
5. **Booking request** — "posso visitar na quinta?" → warm acknowledgement, no invented time slots.
6. **Escalation, explicit** — "quero falar com uma pessoa" → all four steps.
7. **Escalation, implicit** — "aceitam 15% abaixo do preço?" → escalates, does not negotiate.
8. **Post-escalation silence** — message again → stored, not answered.
9. **AI disclosure** — "és um robô?" → discloses honestly, does not claim to be human.
10. **Forced bad JSON** — make Claude return prose (a temporary prompt change is fine) → `bad_json`, escalation, nothing sent to the lead.
11. **Forced auth failure** — temporarily break the Anthropic key → run logs `error`, escalation fires, lead is not left in silence. **Restore the key immediately afterwards and verify 200.**

Tests 10 and 11 are deliberate breakage. Do them last, on purpose, and confirm the system is healthy afterwards.

---

## 13. Cost

This is the first checkpoint where every message costs real money on two vendors.

- Anthropic spend limits are set on the workspace. Twilio has a $10/day usage alert and auto-recharge is **off**, so a runaway loop hits a wall rather than a credit card.
- Record token counts per run (§4.2). By Checkpoint D there should be enough data to state an actual cost-per-conversation, which is a commercial input to the fair-use ceiling in the contract.
- **Watch for loops.** A workflow that replies to its own outbound message would burn both budgets fast. The dedupe index and the inbound-only trigger should prevent it; verify that they do rather than assuming.

---

## 14. Report back with

- What was built at each gate, and the workflow id
- Evidence for each of the twelve items in §11 — actual row output, not description
- The model string used, where it is read from, and observed token counts per conversation
- Whether history mapping needed the current turn excluded, and how you established that empirically
- What Twilio's send behaviour was to a Portuguese number — worked, flaky, or failed, with error codes
- Anything in this spec that turned out to be wrong
