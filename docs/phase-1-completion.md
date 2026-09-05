# Phase 1 — completion summary

**Status:** complete, 5 September 2026
**Audience:** someone picking this up cold, months later, who was not in the room

Phase 1 built the **Inbound Concierge**: a WhatsApp automation that answers a
property enquiry within seconds, qualifies the lead, books a viewing into a real
Google Calendar, and hands over to a human when it should.

Read this first, then [`concierge-runbook.md`](concierge-runbook.md) for how to
operate it and [`engineering-lessons.md`](engineering-lessons.md) for why it is
shaped the way it is. The lessons file is not optional reading — several
decisions here look arbitrary until you know which failure produced them.

---

## 1. What exists

| | |
|---|---|
| **Host** | Hetzner CX22, Ubuntu 24.04, Falkenstein. `ssh ryvo` |
| **Stack** | Docker Compose: n8n 2.28.3, Caddy 2.11, Postgres 18 |
| **Platform DB** | Supabase (EU/Frankfurt), reached over PostgREST with the `service_role` key held in an n8n credential |
| **Messaging** | Twilio **Sandbox** for WhatsApp |
| **Model** | `claude-sonnet-5`, `effort: low`, adaptive thinking, structured outputs |
| **Calendar** | Google Calendar API via an n8n OAuth2 credential |
| **Alerting** | Resend (EU/Ireland) to two mailboxes |

**Workflows:** `ryvoInboundConc01` (86 nodes) and `ryvoSupaKeepAlv` (8 nodes).

**Scheduled work** (`crontab -l`, `CRON_TZ=Europe/Lisbon`):

```
0  3 * * *   backup.sh        dump, export workflows, push offsite
20 3 * * *   metrics_daily.py derive yesterday and today
*/10 * * * * healthcheck.sh   12 assertions, alerts by email
```

### The conversation, end to end

Inbound webhook → **verify the Twilio signature** → respond 200 immediately →
resolve the client → upsert the lead → store the message → load history →
**query free/busy** → choose slots → **match a confirmation** → build the prompt
→ call Claude → parse and guard the reply → decide escalation → persist lead
fields → **create the calendar event** → reply → log the run.

Measured: **5.7–6.8s** from inbound webhook to outbound message, of which
4.0–5.2s is the model. Roughly **$0.006 per turn** at Sonnet 5's $2/$10.

### Design decisions that will look odd without their reason

- **The workflow chooses the appointment slots, never the model.** A
  confirmation has to be matched later against exactly what was offered, so the
  offer must be something the workflow knows. The model only phrases it.
- **The booking decision happens *before* the Claude call.** That keeps a
  booking turn at one model call and means the model is told what happened
  rather than asked what should happen — it cannot confirm a booking that
  failed.
- **The calendar event id is derived from the SLOT, not the lead.** Two leads
  confirming the same time generate the same id and Google rejects the second
  with `409`. See §4.
- **System messages are fixed config strings, never model-rendered.** The
  handoff note is what gets sent *when the model has failed*, which is exactly
  when you cannot ask a model to write it — or to say what language to write it
  in. Language is detected deterministically from the lead's own words.
- **Alerting runs outside n8n.** A check that needs n8n healthy to report that
  n8n is unhealthy tells you nothing on the day it matters.

---

## 2. What is proven, and how

Everything below was demonstrated by **breaking something and watching**, not by
reading code or a green run. That distinction is the house style and it earned
its place: most defects in this project were found in the reporting layer, where
a system said it was fine and was not.

### Automated

| Suite | Result | Covers |
|---|---|---|
| `tests/slot_engine.test.js` | **66/66** | Timezones against a non-Lisbon zone, DST, working hours, `min_hours_notice`, busy overlaps, free/busy validation, `preferDate` guards, confirmation matching, day-of-month parsing |
| `tests/language.test.js` | **31/31** | pt/en/es detection, and — more importantly — refusing to decide when unsure |
| `tests/prompt_suites.py` | inventory **15/15**, language **30/30**, never-invent **27/27** | Model behaviour against the live API |
| `tests/lint_code_nodes.js` | **30 nodes clean** | Identifiers used but never declared — runtime errors that `node --check` passes |
| `infra/scripts/healthcheck.sh` | **12 assertions**, every 10 min | Containers, published version, webhook, backup freshness and outcome, Supabase, mail DNS, metrics freshness, failed runs |

### Demonstrated against production

- **Booking works.** A real conversation qualifies, offers genuinely free slots,
  and books an event. Confirmed by the calendar itself: after two bookings,
  free/busy returned one merged busy interval and the next offer skipped exactly
  those hours.
- **It does not double-book.** The two-lead race was run **six times, six
  correct**, with Google's `409` arbitrating in all six — mechanism, not luck.
- **Dependencies fail loudly.** Anthropic, Twilio, Supabase and Google Calendar
  were each broken, observed, then **restored and verified before the next was
  touched**. See §4.
- **The alert channel itself works.** Verified end to end to both mailboxes,
  with `SPF PASS / DKIM PASS / DMARC PASS` read from the message headers.
- **A real failure was caught by the alerting rather than by us looking**: the
  nightly backup failed at 03:00 and the email arrived before anyone noticed.

---

## 3. What is known-limited

Read this section before promising anything to a client.

### Blocking for a real client

- **Twilio Sandbox, not a production sender.** The sandbox session expires every
  **72 hours** and requires the recipient to re-join with a keyword. This is
  fine for demos and impossible for real leads. A WhatsApp Business sender
  (Twilio or Meta) is required before onboarding.
- **The Google OAuth app is set to "Internal".** Only `ryvodigital.com` accounts
  can authorise it. A real client's calendar lives elsewhere, so either they
  authorise through their own Google Cloud project, or the app goes External and
  through verification.
- **One client row, single-tenant in practice.** The schema is multi-tenant and
  the workflow reads everything from `client_automations.config`, but it has
  only ever run for one client.
- **n8n has never been booted against a restored database.** The restore drill
  proved the dump restores; nothing has proved n8n runs against the result.
  Outstanding since Phase 0.

### Accepted behaviour, deliberately

- **If Twilio is down, the lead cannot be reached.** There is no second channel
  to a WhatsApp lead. The compensating control is that a human is told within
  minutes by email, and the message is recorded `failed` rather than `sent`.
  "No lead left in silence" is not achievable when the messaging transport is
  the casualty.
- **Media is never downloaded.** Voice notes and images stay on Twilio; only a
  marker like `[voice note]` is stored. This is a data-protection posture, not
  an oversight — see the runbook before "improving" it.
- **Rescheduling and cancellation escalate** rather than being attempted.
- **`metrics_daily.reactivations` is always 0.** Nothing produces reactivations
  until Phase 2; the zero means "none happened", not "we did not look".
- **Deleting a calendar event burns that slot's identifier.** Google keeps
  deleted ids reserved, so re-booking that exact slot returns `409` with a
  cancelled event and escalates as `conflict_burned_id`. Correct, and surprising
  if you do not know.

### Unexplained

- On 4 September the webhook began returning **404 with "Active version not
  found"** with no deployment in the window. Republishing fixed it and the
  trigger was never identified. `export:workflow` was ruled out by experiment.
  The health check now asserts `activeVersionId IS NOT NULL`, so the *shape*
  is covered even though the cause is not.

---

## 4. The four findings worth knowing about

These are summarised because they shaped the system. Full write-ups are in
`engineering-lessons.md`.

**A generated message must never promise a future you have not secured.** An
early booking build told the lead *"Ficou confirmado!"* and then failed to
create the event. The fix is ordering — decide, act, then let the model describe
what happened — plus a retraction path that discards the reply if the action
fails. (§0)

**Check-then-act cannot be fixed by checking harder.** Double-booking was
guarded by re-checking free/busy immediately before writing. It still
double-booked: there is no window small enough that two concurrent actors cannot
both observe "free". Only something that *arbitrates* closes it, and arbitration
belongs in the system that owns the resource — hence the slot-keyed event id and
Google's `409`. (§0b)

**A nondeterministic test tells you what *can* happen, never what *always*
does.** The race test passed once and was reported as proof; the same test
double-booked the next day. Repeat such tests and state the run count. (§0b)

**Detection without a consumer is not detection.** `FlattenClient` had always
distinguished "we do not serve this number" from "the platform database is
down", with a comment explaining that conflating them would silently drop leads
during an outage — and no node ever branched on it, so exactly that happened.
The mechanical check is: *for every error flag the code produces, which node
branches on it?* (§1, instance 15)

A related one worth internalising: **an outage was logged as `success`.** With
the model broken, every lead escalated correctly and every run recorded
`status='success'` — so a total outage looked like a busy day of leads asking
for a human, and the weekly client report would have said everything was fine
while the AI was down. Runs now record *why* they escalated.

---

## 5. Carried into Phase 2

### Product

- **Reactivation automation**, which is what fills `metrics_daily.reactivations`.
- **The cockpit** — a dashboard reading Supabase directly.
- **Weekly client reports** — the `reports` table exists and is unused.

### Polish, flagged during Phase 1 and deliberately deferred

- **Travel time between viewings.** Free/busy shows that an agent is booked, not
  *where they are*. Two viewings can be booked back to back at opposite ends of
  Cascais and the calendar will report both as fine. Needs a buffer between
  bookings, and probably a property-location field before it can be done
  properly.
- **Alert noise once DMARC `rua` reports accumulate.** Aggregate reports arrive
  daily as XML from every large receiver, to `hello@ryvodigital.com`. They are
  the evidence needed to tighten the policy, so do not turn them off — route
  them to a parser when the volume becomes annoying.
- **DMARC is at `p=none` on purpose.** Read the reports for a few weeks until
  every legitimate sender is accounted for, then tighten to `quarantine`. Note
  that a `p=quarantine` record was already published by the registrar and
  removed; treat DNS changes here as a trap, not a tidy-up.
- **Per-language handoff strings exist for pt/en/es only.** A lead writing in
  another language gets the client's configured default.

### Operational

- Move off the Twilio sandbox before the first real client.
- Boot n8n against a restored database once, to close the Phase 0 gap.
- The laptop and the server both push to `main`; a long editing session on the
  laptop can leave the 03:00 backup unable to push. It alerts, and the fix is a
  pull.
