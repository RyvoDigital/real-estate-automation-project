# Cockpit build plan — Stage C

**Written 20 September 2026**, after Stage B closed with every screen in briefs
I–III designed and published. Stage A was the documents, Stage B the designs,
and this is the build. It decides order, structure and what is checked; it
writes no code and applies no migration.

Read with: `cockpit-design-brief.md` §0.4 (the eight properties) and §0.5 (the
visual direction), briefs II and III for the per-screen decisions, and
`engineering-lessons.md` §0, §0b, rule 13, §7.

---

## 0. What Stage C actually is, which is not what it sounds like

**The cockpit is not a greenfield.** `cockpit/src/app` already holds twenty-odd
routes — `/queue`, `/leads`, `/listings`, `/import`, `/report`, `/review`,
`/silence`, `/segmentation`, `/calibrate`, `/onboarding`, `/health` — all
working, all in production, all on a **flat URL shape with no client level**.
And `src/app/globals.css` is 1,426 lines carrying a **different visual
direction**: a brand red gradient on chrome, warm-neutral queue carriers, a
mobile-first base with one desktop block.

So Stage C is three different kinds of work wearing one name, and they have
different risks:

| Kind | What it is | Risk |
|---|---|---|
| **A re-frame** | the client becomes the top-level object; every route moves under `/c/<client>/…`, with `/p/<client>/…` beside it | every link in the app, and every probe that visits a route |
| **A re-skin** | §0.5 replaces the existing palette | 🔴 the palette erodes during the change, which is §2 of this plan |
| **New screens** | The Month, the client landing, the gate in depth, the prepared piece, expiries, the re-check notice, anomalies-per-client, client settings | the ordinary risk |

🔴 **The re-skin is a replacement, not a layer.** The existing palette is
deleted, not left underneath with §0.5 on top. A stylesheet with two palettes in
it is a stylesheet where a one-off hex is indistinguishable from an intentional
legacy value, and the erosion this plan exists to prevent starts there.

---

## 1. Build order, and where I disagree with the instinct

**The instinct — the frame and the two landings before anything beneath them —
is right about the frame and wrong about the landings**, and it is wrong for a
specific reason worth stating: the two landings are the least data-complete
screens in the cockpit.

- **The Month reads six tables that do not exist.** `client_contracts`,
  `client_payments`, `web_clients`, `web_contracts`, `costs`, `cost_checks` are
  all proposals in brief I §2.11. Building the landing first means building the
  hardest data story on an unproven shell, against tables that are still a
  document.
- **Today composes ten sources**, and every one of them is a screen below it. Its
  rows are the escalation row, the anomaly row, the expiry row. Building the
  composition before the things it composes means inventing each row twice.

Landings are where a design proves itself and the **worst** place for a
structure to prove itself. So: frame first, then one screen deep enough to prove
the whole apparatus on real data, then the landings.

### The order

| | What | Why here · what it unblocks |
|---|---|---|
| **C0** | **The cross-screen consistency sweep.** No code. | 🔴 The operator's rule, and the reason it exists: 04 was drawn as running on settings while the gate screen one click away refused every property. **Two screens can each be right on their own terms and disagree.** A brief cannot catch it, because each screen was checked against the brief separately. Output: one table of every state claim rendered on more than one screen, with the screens that render it. See §1.1. |
| **C1** | **`tokens.css` and the erosion guards.** | Must land before any screen. The first screen built sets the precedent for every one after it; if it can reach for a hex, they all can. §2. |
| **C2** | **The frame.** Route shape, `frameSide(mode)`, the sidebar, presented mode as a state, the counts source. | Every screen composes into it. The route move is a single mechanical change that gets harder with every screen added afterwards. |
| **C3** | **One vertical slice: escalations, then the contact record.** | 🔒 The proving ground. Real data that already exists, the row anatomy, the tier-as-position clock, the live/frozen contract, collapse-in-place — and it replaces `/queue`. If the token layer, the frame and the check harness survive this screen, they survive the rest. If they do not, we have learned it on one screen rather than twelve. |
| **C4** | **Today.** | Now its rows have a proven vocabulary. |
| **C5** | **The property and compliance screens** — listings, the gate in depth, the prepared piece, the exemption, expiries, policy, templates, the re-check notice. | All read tables that exist (0028–0034). The largest block, and the one where Portuguese copy modules gain their missing strings. |
| **C6** | **Anomalies, import, the weekly report, client settings.** | Existing screens re-framed; import is a reskin of a working flow, not a rebuild. |
| **C7** | **The Month, both halves.** | Last, because it is the only screen gated on migrations that are not written. §5. |

**Client settings is in C6 rather than earlier** because it unblocks nothing:
nothing composes into it and nothing reads from it. It is, however, the screen
that proves §0.4-7 hardest, so its checks are written in C1 and wait for it.

### 1.1 The consistency sweep, and how it stops being a sweep

Doing this once by hand catches today's disagreements. It does not stop the next
one, because the next one arrives when somebody changes one screen.

🔒 **The structural answer: a fact rendered on more than one screen comes from
one function.** Not from two correct readings of the same table.

Candidates found in Stage B, each currently rendered by two or more screens:

| The claim | Rendered on |
|---|---|
| *04's gate refuses every property today* | client settings, the gate in depth, the client landing, listings |
| *02 and 05 cannot send — Meta, and the review destination* | client settings, the client landing, The Month, Today |
| *Portugal's policy row is researched and unconfirmed* | policy, the gate, listings, the piece, the forecast |
| *this lead is waiting, and for how long* | escalations, Today, the client landing |
| *how many are waiting* | the sidebar, the page headline, Today's group header |

The last one is the count problem, and it has now bitten twice in two batches —
the nav said 4 beside a page saying 5, and a refusal banner said four over five
refusals. 🔴 **Counts come from one place by construction**: one `counts(client)`
read per request, passed into the frame and the page. The nav never computes;
it receives. A test asserts the nav's number and the page's headline resolve to
the same call.

---

## 2. Where the tokens live, and how a screen is stopped from inventing one

The palette is the thing most likely to erode, because a one-off hex always
looks harmless in a diff. Three mechanisms, in order of how much they actually
prevent.

### 2.1 One file

`cockpit/src/app/tokens.css` holds **every** colour, shadow, radius and type
face, as `:root` custom properties with the §0.5 names. `globals.css` keeps
layout, and imports it. Nothing else declares a colour.

### 2.2 The guard that fails the build

A test — `tests/tokens.test.ts`, in the existing `npm test` run — that:

1. **Greps every `.css`, `.tsx` and `.ts` under `src/` for a literal colour** —
   `#rgb`, `#rrggbb`, `rgb(`, `rgba(`, `hsl(` — and fails on any outside
   `tokens.css`. Exceptions are a named allowlist in the test with a reason
   beside each, so an exception costs a line in the file that reviews it.
2. **Asserts the two directions between §0.5 and `tokens.css`**: every token the
   brief names exists in the file, and every token in the file is named in the
   brief. One direction catches drift; the other catches orphans. 🔒 Both, or the
   brief slowly becomes a subset of the truth and stops being the source.
3. **Asserts the semantic five are unreachable except through one component.**
   `--through`, `--held`, `--clock`, `--red`, `--handled` may be referenced only
   inside the state-chip and clock components. Everywhere else, a state is
   rendered by asking for the state, not by asking for the colour. This is what
   makes "colour carries meaning or it does not appear" structural rather than a
   habit, and it is the only one of the three that survives a tired afternoon.

### 2.2b ⚠️ Correction, 20 September 2026 — when globals.css comes off the ratchet

The plan said `globals.css` is replaced "in C2, with the frame". **That was
wrong and it is corrected here.** Twenty-odd screens still depend on its
classes, and they serve until C3–C6 rebuilds each one. Replacing it with the
frame would break every page that has not been rebuilt yet, for no gain — the
new frame reads `tokens.css` and needs nothing from the old file.

So: `tokens.css` lands and is used; `globals.css` keeps its ratchet entry, with
`until` changed from **C2** to **C6 — when the last screen that depends on its
classes is rebuilt**. The two palettes coexist in two files rather than in one,
which is the distinction that matters: a one-off hex in `globals.css` is still
caught by the ratchet, and the new frame cannot reach for one at all.

### 2.3 The one that is not a test

§0.5 says the direction changes **by the operator, from a reference, recorded in
the brief with a date** — never by a taste skill and never by a build decision.
Stage C does not get to adjust the palette because something looked better; it
gets to report that something looked worse.

---

## 3. The two 21st retrievals

The principle from Stage B holds: **motion is a property of state transitions,
not a component you fetch.** So the retrievals go where the *geometry or the
measurement* is genuinely hard, and nowhere else.

**Spend one: the accordion** — [micka_design
Accordion](https://21st.dev/@micka_design/components/accordion). Measured-height
collapse with a spring, nested interactive content, and correct behaviour under
`prefers-reduced-motion`. It has **four uses**: Today's five groups, the contact
record's send rows, the anomaly expander, the import reject list. Height
measurement that does not jump when the content reflows is the part that is
fiddly to get right from first principles, and getting it wrong is visible on
the landing every morning.

**Hold the second.** Nothing else in the designs is hard enough to spend it on
today, and a retrieval spent on something writable is gone. It is reserved for
**the live-reordering list** — rows entering, leaving and changing position
while the clocks tick — if `motion`'s `layout` proves insufficient in C3. That
is the one piece of geometry whose difficulty we genuinely cannot predict from
here.

**Explicitly not retrieved**, with the reason:

| Not fetched | Because |
|---|---|
| Segmented control with a sliding indicator | ~30 lines; the indicator is a transform on a measured child |
| The number roll | `@number-flow/react` is open source and needs no retrieval |
| Row enter/exit | `motion`'s `AnimatePresence` and `layout` do it directly |
| The month calendar grid, the week strip | CSS grid |
| The clock track with notches | three absolutely-positioned marks on a 300-minute scale |

⚠️ **Any 21st component is a rewrite, not an install.** The cockpit has no
Tailwind, no shadcn, no Radix (`package.json`: Next 16.3, React 19.2, Supabase,
and nothing else). What a retrieval buys is the geometry and the measurement
logic, which is then written against `tokens.css`.

⚠️ **Adding `motion` is a dependency decision, checked through context7 against
Next 16.3 and React 19.2 before it is added** — per CLAUDE.md, documentation
first, not from memory. If it does not sit cleanly with React 19.2's compiler
behaviour, the fallback is CSS transitions plus the View Transitions API, and
the motion contract (§1.14) is written to survive that substitution.

---

## 4. What gets checked, and what was only ever a design-time check

Stage B's artifacts carry roughly 150 assertions. They are not all tests, and
pretending they are would produce a suite that fails on legitimate change. Three
buckets.

### 4.1 Real tests — `node:test`, pure, in `npm test`

These take rows or props and return a verdict, so every rule is a test (the
shape `report/attribution.ts` already uses).

- **S1 ≠ S2 per screen.** Every screen's resting sentence and never sentence come
  from a copy module, and a test asserts no screen's two are equal. This is the
  oldest rule in the briefs and it has never been mechanically enforced.
- **The forbidden vocabulary, including denials.** Extends the existing guard to
  the absences lists — §0.4-8, after it happened twice.
- **Counts carry their denominator** (§0.4-2): the count component's props make a
  bare count unrepresentable, so it is a type error rather than a test.
- **The report never sums overlapping categories**: no caller of `weeklyFigures`
  adds two fields, asserted by inspecting the render output for a total line.
  `renderWeekly` is already pure; this is a test of its callers.
- **Listings' two vocabularies are disjoint** (brief III §5) — the status set and
  the advertisability set share no member.
- **The shared-claims module** (§1.1): one test per shared claim asserting every
  screen that renders it calls the same function.
- Already existing and kept: tier thresholds, the eight review reasons, the
  gate's refusal ordering, the import guard against the shipping workflow file.

### 4.2 Probes — a real browser, extending `tests/probe-*.ts`

The harness exists and it is the right one: `probe-layout.ts` already renders
every discovered route at 360/390/430 and asserts no page scroll, no font under
11px, no tap target under 44px — with two deliberate controls so the probe can
fail. `probe-controls.ts` already compares pixels for lesson 15b. New probes go
beside them, each with its control.

- 🔴 **No greyed control, anywhere** (§0.4-7): across every route in every state,
  zero elements are `disabled`, `readonly` or `aria-disabled`. Control: a
  deliberately disabled element must be reported.
- **Nothing pre-selected** where a choice is a declaration — extends the existing
  15b probe rather than duplicating it.
- **A frozen field has no control**: where a value is marked as unchangeable, no
  `input`, `select` or `button` exists inside it.
- 🔒 **The live/frozen clock contract**: two reads a minute apart. With the read
  succeeding, the clock values must advance; with it failing, they must be
  **identical**, and the stamp must carry an age. This is the one probe that
  cannot be replaced by reading source, because the defect is a number that
  changes when it should not.
- **Desktop widths added**: 1280 and 1440 beside the three phone widths, because
  every Stage B screen was checked there and the operator reads the cockpit on a
  desktop.
- **The presented-frame DOM probe** (§1.4), unchanged in intent: no other
  client's name, no counts, no operator link under `/p/`.

🔒 **Every new check ships with its sabotage run, and the sabotage asserts it
applied** before the result is believed (§1f). A check that cannot fail proves
nothing, and a sabotage that did not apply proves less than nothing.

### 4.3 Design-time only — deliberately not tests

Stated so that their absence is a decision rather than an oversight:

- **Whole-page screenshot comparison.** It fails on every legitimate change, so
  it trains people to approve diffs. The pixel probe stays scoped to lesson
  15b's question — *does a selected control look selected* — which is narrow
  enough to be trustworthy.
- **Spacing rhythm, type scale, whether a stale flag reads as stronger than the
  row colour it sits on.** These were judgements made with a render in front of
  us, and they are re-made the same way when a screen changes.
- **The scenario switchers themselves.** They were a design device for showing
  ten states on one page. The built screens render one state, from data.

---

## 5. What is deliberately not built, and how an empty screen stays legible

The operator's question is the right one: a screen that renders nothing must be
readable as correct rather than broken. 🔒 **The answer is that "nothing" is
never rendered as one thing** — it is one of four, and each has its own words.

| | What it means | Example in Stage C |
|---|---|---|
| **S1 resting** | it ran, and there was nothing | no escalations this morning — *and this is the state you want* |
| **S2 never** | it has never happened | this client has never had a lead |
| **S3 not checked** | nobody looked, or the look failed | the calendar could not be probed; a `metrics_daily` day with no row |
| **S5 refused** | something is stopping it, and it is named | 02 and 05 cannot send |

🔒 **A `why-empty` helper ships in C1**, so no screen invents its own wording for
this and no two screens word the same emptiness differently.

### 5.1 Real today — build against live data

`leads`, `messages`, `events`, `listings`, `listing_matches`, `listing_facts`,
`agency_facts`, `advertising_policy`, `import_batches`, `consent_events`,
`metrics_daily`, `reports`, `closes`, `client_automations`, `clients` — through
migration 0036.

### 5.2 Empty by construction — the screen is right, the world is quiet

Built in full, expected to render an empty state, and **that empty state is the
delivered feature**:

- **Escalations, anomalies, the silence, the review reconciliation** for a client
  with no traffic. S1 or S2, never a blank.
- **02 Reactivation and 05 Review requests**: S5 everywhere they appear, with
  Meta's verification and the review destination named. 🔴 Never zero activity —
  a gated automation rendered as a zero is the defect brief I §2.10 names.
- **04 Advertising compliance**: S5 until a lawyer confirms Portugal's policy
  row. This is the claim §1.1 makes shared, so all four screens say it at once.
- **The rehearsal client**, until 0037/0038 apply.

### 5.3 Waiting on a migration — not built in Stage C

🔴 **The Month's revenue and cost halves are not built until their tables
exist.** `client_contracts`, `client_payments`, `web_clients`, `web_contracts`,
`costs`, `cost_checks` are proposals in brief I §2.11 and nothing more. Building
the screen against a table that does not exist produces a screen whose emptiness
means *we have not built this*, which is the one meaning the four states above
cannot express.

**So The Month ships in C7 in two steps:**

1. The migrations, **written, reviewed and applied one at a time**, following the
   0036 pattern — prove the precondition, change one thing, and never bundle. No
   write to production without asking.
2. The screen, against real tables.

Also outstanding and unchanged: **0037 and 0038 are written and not applied**.
0038 is blocked on the onboarding deploy that writes `rehearsal`, and `npm test`
is red by design on `0037-clients-rehearsal` until it is blessed.

### 5.4 Not built, and not waiting on anything

- **Keyinvoice.** Contracts and payments stay hand-entered (brief I §2.11 phase
  1). The API is SOAP, its method documentation is behind a login, and whether it
  can list documents by date is unverified. Nothing is designed against it.
- **`viewing_duration_minutes` is not renamed.** The workflow reads the key; the
  screen shows the honest word and the key in its hint. A rename is a migration
  plus a workflow change plus a redeploy, and it belongs on the improvements
  list, not inside a form.
- **Dismiss, acknowledge and snooze** stay unbuilt on anomalies. §4.8 defers them
  *with a trigger*, and the trigger has not fired.

---

## 6. The standing rules this plan does not get to relax

- **No writes to the production database without asking.**
- **Check the artefact, not the execution status.**
- **A test that cannot fail proves nothing** — sabotage it, and assert the
  sabotage applied.
- **Every defect becomes a permanent test.**
- **Migrations go alone**, and prove their precondition before they change
  anything.
- **The operator holds all secrets.**
- **context7 before memory** for any library question — `motion`, Next 16.3,
  React 19.2.

---

## 7. What this plan does not decide

- Whether Stage C is one branch or seven. My reading: one branch per stage
  above, because C2's route move touches every file and wants to land alone.
- The order of the C5 block internally.
- Whether the proposed Portuguese copy is reviewed by the operator before or
  after it lands in its module. It must land in the module either way — 🔴 no
  proposed string is inlined in a component.
