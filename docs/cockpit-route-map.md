# The route map — C2

**20 September 2026.** Nothing has been moved. This is the map for approval.

The cockpit's URLs have no client level: the client is a query parameter on
three screens, a dedicated picker page on four, and absent on the rest. D1 makes
the client the top-level object, which means **every route moves**. This is the
change that touches every file, so it lands alone and it is mapped first.

---

## 1. The shape

| Level | Prefix | What lives there |
|---|---|---|
| **Operator** | `/`, `/today`, `/health`, `/onboarding` | the two landings, and the things that are not about one client |
| **Client** | `/c/<client>/…` | every client-level screen |
| **Presented** | `/p/<client>/…` | the same screens, in the frame's presented state, where the screen was designed for it |

🔒 **`/p/` is not a second set of pages.** It is the same route tree rendered by
`frameSide('presented')` — one frame function, two states (brief II §2). A `/p/`
path that has no `/c/` counterpart is a bug, and the route test asserts it.

---

## 2. Every route today, and where it goes

### 2.1 Moves to the client level

| Today | Becomes | Presented? | Note |
|---|---|---|---|
| `/leads/[id]` | `/c/<client>/contacts/<lead>` | no | the contact record (Q14) |
| `/segmentation/[clientId]` | `/c/<client>/declaration` | **yes** — `/p/…/declaration` | brief II §2.1 |
| `/calibrate/[clientId]` | `/c/<client>/thresholds` | **yes** — `/p/…/thresholds` | brief II §2.2 |
| `/silence/[clientId]` | `/c/<client>/silence` | no | brief III §8 |
| `/review/[clientId]` | `/c/<client>/review` | no | brief III §9 |
| `/listings?client=` | `/c/<client>/listings` | **yes** | brief III §5 |
| `/listings/[id]` | `/c/<client>/listings/<listing>` | **yes** | |
| `/listings/[id]/triage` | `/c/<client>/listings/<listing>/triage` | **yes** | brief II §2.3 |
| `/listings/[id]/exemption` | `/c/<client>/listings/<listing>/exemption` | **yes** | brief II §2.4 |
| `/report?client=` | `/c/<client>/report` | no | brief III §11 |
| `/import` + `/import/[id]` | `/c/<client>/import` + `/c/<client>/import/<batch>` | **the mapping step only** | brief III §10 |

### 2.2 New at the client level — designed in Stage B, no route today

`/c/<client>` (the landing) · `/escalations` · `/anomalies` · `/campaign` ·
`/expiries` · `/policy` · `/templates` · `/closes` · `/settings` ·
`/listings/<listing>/publish` (the gate in depth) ·
`/listings/<listing>/piece` (**presented**) · `/notice` (**presented**).

### 2.3 Stays at the operator level

`/health` · `/onboarding` · `/login` · `/auth/callback` · `/auth/signout` ·
`/api/*`. None is about one client.

**New at the operator level: designed, no route today (added 21 Sep 2026).**
**`/ops/expiries`**, Expiries (brief §1.2, §2.3). It is the cross-client home of
`recheckClearances()` and of **Ryvo's own expiries**: the n8n deploy key, the
domain, the certidão permanente, the procuração, and the payment cards (§2.3,
"Ryvo's own").
- It was missing from this map, and so from the screen count in §7, because §2.2
  lists only the client-level slice, `/c/<client>/expiries`. The ops screen is a
  different surface, not a copy: it holds the operator's own obligations
  (brief §1.1), which no client slice shows.
- Build stage **C5**, with the compliance screens.
- The other `/ops/*` routes in brief §1.2 (infrastructure, waiting, compliance,
  proofs, onboarding, templates) are not reconciled here: §5.4 and §7 already
  record that this map and the brief disagree about `/health` and
  `/onboarding`.

> 🔴 **"Stays" is about the URL, not about the screen.** `/onboarding` has NOT
> been rebuilt: red brand gradient, the old `Queue / Leads / Report` sidebar,
> the pre-§0.5 palette, and none of the frame work. It is **BUILT AND
> REACHABLE, on the old direction** — the third state, which this map did not
> previously distinguish from "done".
>
> It matters more than its position on the list suggests, for a reason that
> only became true on 20 September: **it is the screen that writes
> `clients.rehearsal`**, which `0038` has now made NOT NULL with no default.
> Every client that will ever exist is classified by this form, and getting the
> answer wrong is invisible for months — it surfaces as revenue that never
> existed, or a first dated to a test fixture.
>
> So when it is rebuilt, the rehearsal question is the part to carry over
> unchanged: required, nothing pre-selected, both options saying what the
> choice MEANS. `cockpit/tests/rehearsal.test.ts` reads the `EMPTY` literal out
> of `Onboarding.tsx` by name, so a rewrite that moves or renames that constant
> fails rather than silently dropping the guard.

### 2.4 🔴 Deleted — five client pickers

`/calibrate` · `/review` · `/segmentation` · `/silence` · and the picker half of
`/listings` and `/report`.

Each is a page whose only job is *"which client?"*, answered by a list of names.
**The switcher answers it once, in the frame** (D1). Keeping them would mean two
ways to choose a client, one of which forgets the choice on the next screen.

This is the second deletion the build makes — `/queue` is the first, in C3 — and
both are the point: a frame that carries the client makes five pages redundant.

---

## 3. Redirects, and the two that cannot be static

Old links exist in the operator's browser, in notes and in alerts.

**Static, in `next.config.ts`:**

```
/queue            → /today            (C4, not before — see §5)
/leads            → /today
/segmentation/:id → /c/:id/declaration
/calibrate/:id    → /c/:id/thresholds
/silence/:id      → /c/:id/silence
/review/:id       → /c/:id/review
/calibrate | /review | /segmentation | /silence → /
```

🔁 **`/import → /` is DROPPED (21 September 2026).** The upload flow — upload,
map, plan, commit, revert — lives only at `/import`, and the per-client screen
is deliberately the record, not the flow (commit `4f78050`). Redirecting
`/import` would strand the only way to import. `/import` stays where it is.

**🔴 Two cannot be static, because the new path needs a lookup the config
cannot do:**

- `/listings/<listing>` → the client is not in the old URL. It becomes a **route
  that reads the listing, finds its client, and redirects** — or 404s if the
  listing is gone, which is the honest answer rather than a guess.
- `/import/<batch>` → same shape, via `import_batches.client_id`.

Both are kept as thin server redirects rather than deleted, because a dead link
in an alert is how somebody finds out at the wrong moment.

---

## 4. What the route test must assert after the move

`tests/routes.test.ts` and `tests/probe-layout.ts` both enumerate routes from
the filesystem, so both change with the tree. Three new assertions:

1. **Every `/p/` route has a `/c/` counterpart.** A presented page with no
   ordinary page is a page nobody can reach.
2. **Every client-level route is explicitly presented-capable or explicitly
   refusing**, in one list. 🔒 Not a default — a screen that was never
   considered for presented mode must fail the test rather than quietly inherit
   an answer. This is what would have caught the exemption declaration sitting
   unplaced for four rounds.
3. **No route outside `/c/` and `/p/` reads a `client` query parameter.** The
   old shape's habit, mechanically prevented.

---

## 5. 🔴 Four consequences I need decided before I move anything

### 5.1 What is `/` until The Month exists?

D2′ makes `/` the Overview. The Month is **C7**, because six of its tables are
unwritten (`client_contracts`, `client_payments`, `web_*`, `costs`). So between
C2 and C7, `/` has nothing to render.

**My reading: `/` redirects to `/today` until C7, and the redirect is deleted
when The Month lands.** It is honest, it is one line, and it means the landing
is never a page apologising for itself. The alternative — shipping The Month
empty — would render a screen whose emptiness means *we have not built this*,
which is the one meaning the four states cannot express.

### 5.2 When does `/queue` actually move?

`/queue` is the operator-level queue and it works. Its replacement is **Today's
group 1**, which is C4. C3 builds the *client-level* escalations screen, which
is a different screen.

**My reading: `/queue` stays until C4.** Moving it in C2 would leave the operator
without a working queue for two stages. The redirect ships with Today.

### 5.3 Does a cross-client contact search survive?

`/leads` today lists contacts **across all clients**, with an "All clients"
filter and a total. Under D1 contacts are client-level, and no brief describes
an operator-level contact list.

**This is a genuine question rather than a reading.** *"Which client was that
person?"* is a real question with a phone number in hand, and the client-level
screens cannot answer it. Options: keep it as an operator-level search at
`/contacts`; fold it into a search in the frame; or drop it. **I would keep a
search and drop the list** — the list is a browse nobody does, the search is a
lookup somebody does with a phone ringing.

### 5.4 Does `/health` stay where it is?

It is operator-level and it is not in any brief's navigation. **My reading: it
stays at `/health`, reachable from the operator level**, because it is the
screen you open when you already suspect something, not one you browse to.

---

## 6. The order of the move

1. The frame component and `frameSide(mode)`, with no routes moved.
2. `/c/<client>/…` created empty, one screen at a time as C3–C6 land.
3. Redirects added as each old route's replacement ships — **never before**, so
   no redirect ever points at a page that does not exist yet.
4. The pickers deleted last, when nothing links to them.
5. `globals.css` comes off the ratchet with step 1.

🔒 **No route is deleted in the same commit that creates its replacement.** The
replacement lands, is used, and only then does the old one become a redirect.

---

## 7. 🔴 The count, 21 September 2026: eleven old routes, and what retiring them costs

Nothing had counted this, and the build plan's stage table has no task for
retirement. The only schedule is the tokens ratchet's "until" labels, and all
of them have passed: /queue "C3"; listings, segmentation and calibrate "C5";
review and silence "C6". Every cell below is cited from the repository.

| Old route | Verdict | Where it goes | Built? |
|---|---|---|---|
| `/queue` | **replaced** | `/today` and `/c/<client>/escalations` (build plan C3/C4) | yes. There is **no redirect, and login still lands here** (`login/page.tsx:92`, `auth/callback/route.ts:65`, `manifest.ts:14` `start_url`) |
| `/leads` | **replaced, partly** | the list becomes `/c/<client>/contacts` (built). `/leads/[id]` becomes the contact record (§2 says `contacts/<lead>`, the built route is `contacts/[phone]`) | the list and the record are built; cross-client search is not (§5 open question) |
| `/listings` | **split** | the list becomes `/c/<client>/listings` (built). Detail, triage and exemption are **owed** (`frame.ts:129-130` `built:false`) | partly |
| `/import` | **replaced, partly** | `/c/<client>/import` and `[batch]` are the **record**. Upload, map, plan and commit **deliberately stayed at `/import`** (commit `4f78050`) | the record is built; the flow is old-direction on purpose |
| `/report` | **replaced** | `/c/<client>/report` (`3ee939c`) | yes, with a 🔴 **regression**: "Copy as text" (`Report.tsx:151-159`) is missing, and it is the send step. See the rule below |
| `/review` | **replaced** | `/c/<client>/review` (`75eb2bb`) | yes |
| `/silence` | **replaced** | `/c/<client>/silence` (`b153e20`) | yes |
| `/segmentation` | 🔴 **still owed a rebuild** | `/c/<client>/declaration` (§2; `frame.ts:93` `built:false`). **Not in any build-plan stage**: C5's list names listings, the gate, piece, exemption, expiries, policy, templates, the re-check notice, and no declaration | **no.** It is the **only screen that writes a consent declaration** (`lib/segmentation/actions.ts` `declareGroupAction`). Nothing has taken that job over |
| `/calibrate` | **still owed a rebuild** | `/c/<client>/thresholds` (§2; `frame.ts:115` `built:false`). Not in any build-plan stage | no. ⚠️ **The gated ledger holds the calibration *data*, not the route.** `gates.ts` `matching-thresholds` (gate `calibration_afternoon`) says "the calibration screen exists and is reachable", so the **old** screen is where that afternoon is planned to happen |
| `/onboarding` | **kept (URL); screen owed** | stays per §2 (onboarding row); the rebuild is noted in §2 and in `WHERE-WE-LEFT-OFF.md`; not in any build-plan stage | old direction |
| `/health` | **kept, but not settled** | §5.4: "My reading: it stays at `/health`", inside a section headed "decided before I move anything". Brief §1.2 puts it at `/ops/infrastructure` instead (`cockpit-design-brief.md` §1.2), so the two documents disagree | old direction |

**So:**
- **Replaced, fully or partly:** `/queue`, `/leads`, `/listings` (list), `/import` (record), `/report`, `/review`, `/silence`.
- **Still owed a rebuild:** `/segmentation`, `/calibrate`, and the listing detail, triage and exemption.
- **Kept:** `/onboarding` (URL) and `/health`, both unsettled.

### 🔒 The rule: no old route is retired until its replacement exists AND is reachable

Decided 21 September 2026, because of this count. **A redirect or a deletion
ships only after the new screen does every job the old one did, and can be
reached from where people actually arrive.** Being designed does not count, and
nor does being built while nothing links to it.

1. 🔴 **`/segmentation` above all.** It is the only screen that writes a
   consent declaration (`declareGroupAction`). Retiring it before
   `/c/<client>/declaration` exists and writes would leave no way to declare
   where a contact list came from. The gate, the forecast and every campaign
   read that declaration. `/c/<client>/declaration` is in no build stage
   today. That is the finding that changes the redesign estimate.
2. **`/calibrate`** likewise. The gated ledger plans the calibration afternoon
   on the old screen.
3. **`/leads/[id]`: 🔴 BLOCKER, the hand-back.** The only control that hands an
   escalated lead back to the AI (`HandBack`, `components/Reply.tsx`) exists
   only on the old `/leads/[id]` page. It was used for exactly that on
   21 September, during the Concierge deploy proof. The new escalation surface
   (`/today`, `/c/<client>/escalations`, the contact record) has no hand-back.
   Until it does, `/leads/[id]` cannot retire. Without it, an escalated lead is
   silenced permanently: `IsLeadEscalated` stops every reply, and no other
   screen clears the flag.
4. **`/report`: 🔴 REGRESSION on the new screen, not a nice-to-have.** The old
   page's "Copy as text" (`components/Report.tsx:151-159`) is how the report is
   sent: it goes to the agency by hand. `/c/<client>/report` has no
   equivalent, so the new screen cannot do the old one's job. It must be
   restored on `/c/<client>/report` before `/report` redirects.
5. **`/import`** is not retired at all (see §3).

### What retiring the replaced routes involves

**Redirects: none exist.** `next.config.ts` has headers only and
`src/proxy.ts` only refreshes sessions. §3 is intent, not code. Three problems
with §3 as written:
- `/import → /` would have stranded the upload flow. **Dropped** (§3).
- `/listings?client=` and `/report?client=` need query-to-path redirects that
  §3 does not list.
- `/leads/[id]` needs a lookup (lead → client and phone) and is missing from
  §3's "two that cannot be static".

**Inbound links from outside the cockpit: none found.** No n8n workflow links
to an old cockpit page. The `/leads` hits in workflows are Supabase `rest/v1`,
and `/listings/inbound` is the API. The runbook's prose mentions `/import` and
`/leads`.

**🔴 New screens that link back into old ones.** `/leads/[id]` cannot retire
while these links exist:
- `c/[client]/contacts/[phone]/page.tsx:339`
- `c/[client]/anomalies/page.tsx:68`
- `components/Anomalies.tsx:74`

**Navigation:**
- `Shell.tsx` (/queue, /leads, /report, /import) and `MoreSheet.tsx` (/import).
- The login redirect and the phone manifest's `start_url` both point at /queue.

**`revalidatePath` calls naming old paths:**
- `lib/actions.ts:87-88, 221-222, 444`
- `lib/import/actions.ts` (six places)
- `calibrate-actions.ts`, `triage-actions.ts` and `exemption-actions.ts`, which
  revalidate `/listings`.

**Tests and probes:**
- `routes.test.ts` and `probe-layout.ts` enumerate routes from the filesystem.
- `links-resolve.test.ts` fails on any href to a deleted route. That is the
  check that will catch a missed link.
- Hard-coded old paths: `probe-e2e.ts`, `probe-dod.ts`, `probe-timing.ts`,
  `probe-contrast.ts`, `probe-report.ts`, `matching-screen.test.ts`,
  `tokens.test.ts` (the "until" labels), `silence.test.ts:146` (reads the old
  page's source), `proxy-screen.test.ts` and `no-secret-in-bundle.sh`.

**Code used only by old routes:** `components/Queue.tsx`,
`components/Reply.tsx`, `components/Report.tsx`, and `Shell` / `MoreSheet`
once nothing renders them.

### Disagreements found while counting, none resolved here
1. **/queue timing:** the build plan says C3 replaces /queue. §5 says it
   stays until C4 and the redirect ships with Today. Today is live, and the
   redirect is not.
2. **/import:** the build plan calls it "a reskin of a working flow". The
   built screen deliberately left the flow behind (`4f78050`).
3. **Publish:** `frame.ts:132` says `publish` `built:false`, but the page
   exists and `reachability.test.ts` calls it wired.
4. **/health and /onboarding URLs:** brief §1.2 (`/ops/...`) and this
   document (unchanged URLs) disagree.
