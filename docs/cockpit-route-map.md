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
/calibrate | /review | /segmentation | /silence | /import → /
```

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
