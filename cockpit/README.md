# Ryvo Cockpit

The internal cockpit. Turns "you were told a lead escalated" into "you can act on it".

Spec: [`../docs/phase-2-checkpoint-e-cockpit-handoff.md`](../docs/phase-2-checkpoint-e-cockpit-handoff.md).
Visual direction and locked palette: §2.2 of that document.

**Gate E1 is what exists here: login, the escalation queue, and lead detail. Read-only.**
No sending, no hand-back, no onboarding, no health, no weekly report — those are E2 and E3.

---

## What the operator has to supply

Nothing in this repo holds a secret. Copy `env.local.example` to `.env.local` for
local work, and set the same four values in Vercel's project settings.

| Variable | Where it comes from | Public? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page | yes, and harmless — RLS is deny-by-default with zero policies, so it can read nothing |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, **service_role** | **no. Never.** See below |
| `COCKPIT_ALLOWED_EMAILS` | you decide | no |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000`, or the deployed origin | yes |

`COCKPIT_ALLOWED_EMAILS` is a comma-separated list. **An empty value throws rather than
defaulting to an open cockpit** — a cockpit serving prospects' phone numbers and budgets to
everyone is the quiet, expensive failure; a page that refuses to render is the loud, cheap one.

Supabase also needs `${NEXT_PUBLIC_SITE_URL}/auth/callback` added under
Authentication → URL Configuration → Redirect URLs, or the magic link will bounce.

---

## Why authorisation is not in the proxy

`src/proxy.ts` refreshes the session cookie and nothing else. **The security boundary is
`requireOperator()`**, called directly by every page that touches lead data.

Next.js middleware has been bypassable by a crafted request header before now
(CVE-2025-29927), and a check the caller can skip is not a check. It is also rule 1 of
`engineering-lessons.md`: verify on the path the real caller takes. The real caller of a
server component is the render, not the proxy.

`requireOperator()` uses `getClaims()`, which verifies the JWT signature. `getSession()`
reads the cookie without revalidating it and is not an authorisation primitive however
convenient it looks.

The allowlist is checked in three places, deliberately: before sending a link (stops a
typo), at the auth callback (so an unlisted address never holds a session cookie at all),
and on every request (the actual gate). Supabase will issue a session to any address that
asks for a link — restricting the login form is cosmetic.

---

## The service_role key

It bypasses RLS entirely. If it reaches the browser, anything in front of the app can read
and write every client's leads.

Two controls, one of them mechanical:

1. `src/lib/supabase/admin.ts` starts with `import 'server-only'`. If any client component
   ever imports it — directly or through a chain — **the build fails**. A convention that
   says "server only" is a note-to-self; a build error is a consumer.
2. `npm run verify:bundle` searches everything the browser is actually handed.

```
npm run verify:bundle
```

That script **plants a deliberate leak first and proves it is caught**, then removes it and
reports on the real build. Without that control it would print PASS against an empty search
and mean nothing — which is §1 of `engineering-lessons.md`, four times over. Read its output,
not its exit code: if step 1 does not say the planted leak was found, step 2 is worthless.

The realistic leak is not an inlined env var — Next only inlines `NEXT_PUBLIC_*`. It is a
server component handing a secret to a client component as a prop, which serialises into the
RSC payload inside the served HTML. That is what the planted leak reproduces, and why the
script searches page HTML and not just `.next/static`.

---

## Node 22 is required, not preferred

`@supabase/supabase-js` v2.115 throws on construction under Node 20 — *"Node.js
detected but native WebSocket not found"* — so the app builds fine and then fails
the moment a request reaches a page that queries. Set the Vercel project to Node 22.
`engines.node` says `>=22`; Node 20 is not a degraded mode, it is a broken one.

## Commands

```
npm run dev              # local, needs .env.local
npm run build            # production build
npm test                 # escalation vocabulary — 11 tests
npm run verify:bundle    # §11 item 2, with its own control
npx tsc --noEmit         # types

npm run probe:queue      # the queue filter vs. an independent ground truth
npm run probe:excludes   # proves the filter EXCLUDES (writes 3 probe rows, deletes them)
npm run probe:e2e        # login -> queue -> lead detail against the running app
```

The three probes need `.env.local` and a running database. `probe:e2e` needs the app
running (`npm start`). They are not part of `npm test` because they touch the real
project — run them deliberately.

---

## What is worth knowing before changing anything

**Read `reasons[]`, never `reason`.** Both writers store `{ at, reason, reasons[] }`, but
`reason` is only `reasons[0]`. A lead that is both high-value and booking-failed has two, and
reading `reason` silently drops one. `src/lib/escalation.ts` is the single place this is
decided, and `tests/escalation.test.ts` guards it.

**There are three escalation classes and they must stay visually distinct** (§11 item 16).
A `high_value` lead is the AI working perfectly and handing over something too valuable to
automate — the best row on the screen, not an alarm. Rendering it like an outage is instance
9 of the lessons file rebuilt in the UI layer, and it fails silently because the screen looks
fine either way.

**Red is split by surface.** The brand gradient lives on chrome and stops at the escalation
queue, where red means how long someone has waited and nothing else. The ageing ramp is one
hue at rising chroma for that reason — see §2.2 of the spec before "simplifying" it.

**The queue sorts longest-waiting first**, and an outage is surfaced by a banner pinned above
the list rather than by reordering. A fresh outage produces the *newest* rows.
