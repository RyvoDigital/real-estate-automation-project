# Cockpit design brief — the frame and the operator level

**Written 19 September 2026.** Companion to `cockpit-mindmap.md`, which maps all
twenty-seven questions. This one specifies **the frame and the ten
operator-level surfaces** to the depth a design can be drawn against — nine
from the mindmap, plus the Overview (§2.10, Q28), added on the same day.

**What a brief is here:** constraints, stated so that a design cannot quietly
drop one. For each screen — the question it answers, every state it must carry,
what the operator can and cannot do, the exact data it reads, and what about it
is legally load-bearing.

**What it is not:** per-screen layout, hierarchy, density or component choice.
Where a constraint sounds like a layout instruction — *"the three counts are
side by side"*, *"the last-run stamp is the biggest thing"* — it is because the
arrangement is carrying the meaning, and those are marked 🔒 **structural**.

**The visual direction is decided, and it lives here — §0.5.** Canvas, colour
tokens, type, depth, the row's anatomy, the sidebar and the motion contract
(§1.14) were chosen by the operator on 19 September 2026 against Mobbin
references, after two published rounds of the Today landing. They are marked
🎨 **direction**. A 🔒 constraint comes from meaning and a 🎨 one from taste;
**both bind**, and a session building from this brief alone must be able to
reproduce the direction without anything else. *(Amended 19 Sep 2026: this
paragraph previously said visual direction was "not decided here". It was
written before any design existed, and left the chosen direction living only in
a memory note.)*

Everything unmarked is yours.

**Client-level screens (Q11–Q27) are not in this document.** Deliberately: the
frame and the operator level are worth having right rather than having all
twenty-seven half-specified.

---

# §0. What is already decided

## 0.1 The three decisions, taken

| | Decision | Consequence for the design |
|---|---|---|
| **D1** | The client is the top-level object | Every noun below it is client-scoped. `clients` is the spine, not `leads`. |
| **D2** | The landing is a cross-client worklist, not the client list — ⚠️ *the landing half is superseded by D2′ below; "not the client list" stands* | Sort by what has to happen, not by volume of problems. The client list exists and answers a different question. |
| **D3** | Presented mode is a frame property | A second user exists — an agency person operating a screen through the operator's hands. §1.4 is its contract. |
| **D4** | The cockpit carries the business's own numbers — at operator level only | A new surface, the **Overview** (§2.10, Q28). Reverses `cockpit-mindmap.md` §1.4, which kept *"how is Ryvo doing commercially"* out of the cockpit. Operator level only: no `/p/` route, no phone, and never a ranking of clients by what they pay. |
| **D5** | **One company, two businesses** — decided 19 Sep 2026 | Ryvo Digital also sells website design and development on monthly retainers, and that is today its only real revenue. The cockpit carries both. **The Month** (the Overview, §2.10 — the operator's name for it) and Today are the company's. Only the automation side has a client level: **a web client is a row with its terms and its costs, and nothing beneath it**. There is no mode switch between businesses — a mode hides half the day and goes sticky, as §1.3 refuses for clients. Web clients are **not rows in `clients`**: every automation query assumes a `clients` row is an agency. §2.11 |
| **D2′** | **Amended 19 Sep 2026: the landing is the Overview, not Today** | `/` is the Overview; Today moves to `/today` and keeps everything in §2.1. The operator's decision, recorded as a reversal rather than an edit — see below. |

**Why D2′ is recorded as a reversal.** D2 argued the landing must be the
worklist because attention is allocated by clock. That argument is not
withdrawn; it is outweighed by the operator's choice that the first thing seen
is how the business stands. Three consequences keep what D2 protected:

1. **The chrome's one permanent count (§1.5) is what carries Today onto the
   landing** — *how many things are waiting on a human*, always visible, one
   click from the worklist. The Overview does **not** restate Today's groups as
   cards: that is the summary strip §0.5 rejects, and it would be a second
   rendering of the same reads.
2. **The phone lands on Today, not on the Overview.** §1.13 gives the phone
   Today alone; the Overview refuses the phone. So on a phone `/` renders the
   Overview's refusal with Today as its one link, and **every alert links to
   `/today` directly** — the car-park question never passes through the
   refusal.
3. **What would prove it wrong:** the Overview is opened and left, and Today is
   reached by the chrome count every single morning. Then the landing is Today
   in practice and should be in the URL too.

## 0.2 The two corrections, taken

**The contact, not the lead, is the addressable object beneath a client.**
`consent_events` is keyed `(client_id, phone_e164)` so that an objection
survives revert, dedupe and re-import — `lib/suppression.ts` reads through
`consent_by_contact` for exactly that reason, and says so: *"an objection
outlives the lead row that carried it."* A lead-scoped screen shows a person's
history with the part that matters most missing.

**`client_automations.health` and `last_run_at` are derived and the columns are
dropped.** Nothing has ever written to either. A column nobody writes to is a
fallback asserting that nobody has checked (§13), and it stops being true the
first time anyone writes to it once — the same shape as the flat publication
columns `0032` dropped. The migration that drops them proves they are empty
first, as `0032` did.

## 0.3 The rule for defaults

> Where a number decides **what an operator is shown**, rather than **whether
> something is sent**, it may be defaulted — with its reasoning written down and
> with what would prove it wrong.

This is not a new rule and not a relaxation of §4.6. The codebase already draws
the line and states it in `recheck.ts`, beside `WARN_WITHIN_DAYS = 30`:

> *"A guess, and stated as one — but not the kind §4.6 refuses to default. That
> rule exists because a wrong matching threshold silently spams a database or
> silently hides a buyer. This decides how early somebody is told about a date
> that is already in the row… neither reaches a lead or publishes anything.
> **Different blast radius, different treatment.**"*

Every number in this brief is in §1.12, with what it decides, its blast radius,
why that value, and the observation that would change it.

## 0.4 The universal contract — every surface, without exception

Five properties. A design that drops one has dropped a defect back in.

1. **Which of the ten states it is in is always answerable from the screen.**
   Never inferable only from the absence of content. (§1.6)
2. **Every number carries its denominator or its scope.** A count with neither
   is a claim about the world computed from a query. (§1.9)
3. **Every time carries an absolute alongside any relative.** (§1.8)
4. **Every assertion carries its author and its date where a person made it.**
   (§1.10)
5. **A read that failed says so where it failed, and the rest of the screen
   still renders.** (§1.7)
6. 🔴 **Every figure computed at a moment says which moment** — added 20 Sep
   2026, after the forecast. *"23 refused because Portugal is not confirmed"* is
   true about the run and false about today, and a page that says nothing about
   which is the stale-record failure on the most commercially visible screen in
   the cockpit. The rule has a fixed shape everywhere it appears: **carry the
   age, name what went stale, offer the re-run — and never quietly recompute.**
   A figure silently refreshed is worse than a stale one labelled, because
   nobody can tell which they are reading. Already applied: the contact record's
   stale refusals (brief II §1.4.1), Expiries' stale sweep (§2.3), The Month's
   month in progress (§2.11), the forecast (brief III §4.1). **Every remaining
   screen is checked against this shape.**
7. 🔴 **A greyed control is not a refusal** — added 20 Sep 2026, the operator's
   rule, after the weekly report. A disabled button still reads as one click
   from going, and it invites the very action it was meant to prevent. **Where
   an action is not available, there is no control at all**, and the absence
   carries the reason beside it: a frozen field is its value as text plus why it
   is frozen (brief III §12), an automation the gate would refuse is the refusal
   plus a route to what is blocking it (§12), a report that cannot honestly be
   sent has no send control (brief III §11). This is the same principle as the
   absences footer — **the absence is the statement** — applied to controls.
   🔒 **Every screen asserts it**: nothing `disabled`, `readonly` or
   `aria-disabled` in any state.
8. 🔒 **One sample world, or the screens cannot be read against each other** —
   added 20 September 2026, after the cross-screen sweep. Stage B was designed
   in **two** sample worlds that were never reconciled: a mid-September one
   where Portugal is unconfirmed and nothing is calibrated, and an October one
   where Portugal was confirmed on 2 October and 02 has already sent. The
   result was 22 disagreements between screens that were each checked against
   this brief and none against its neighbour.
   🔴 **Sample data is not decoration.** One world, one date, one set of
   clients, and identifiers that differ in more than a prefix — `CA-0388` and
   `MS-0388` shared their number, which is why an entire block of items
   attributed to the wrong client stayed invisible. Without this, **two screens
   cannot be read against each other, and that reading is the only way a
   disagreement between them is ever found**: a brief catches neither, because
   each screen conforms to it separately.
9. 🔒 **A screen never forbids a word by printing it** — added 20 Sep 2026, after
   it happened twice: the re-check notice named the verbs it was denying, and
   the weekly report's absences printed the word it exists to avoid. A guard
   that fails on a word fails on it wherever it appears, including in the
   sentence promising not to use it. **Absences describe what the page does
   instead**, in the words the page would use. 🔒 A permanent check greps every
   screen for the forbidden vocabulary, including its own denials.

10. 🔒 **A figure derived over a set says what was examined, or says nothing
    was** — added 20 Sep 2026, ruled by the operator while reviewing the client
    landing. The tempting shape is a forward-looking summary — *"next lapse in
    34 days"*, *"nothing expires this month"* — computed over whatever rows
    came back. Over an EMPTY set every one of them renders as reassurance.
    **A summary derived from nothing is a not-checked wearing a
    nothing-is-wrong sentence**, and it is worse than the same mistake in a
    list, because nobody expects a summary to be the thing that lies.

    The test is not "is the figure correct". It is: **could this sentence be
    produced by having looked at nothing?** If it could, the figure carries
    what it examined, or it is not rendered.

    Already honoured where it arises: `still-good.ts` returns `notAnswered` in
    the value rather than as a footnote — *"no clearance is recorded anywhere,
    so this screen reads documents rather than decisions"* — and `recheck.ts`
    returns `notCheckedFor` on the same principle. The client landing renders
    no forward-looking figure at all, which is the other legitimate answer.

## 0.5 Visual direction 🎨

**Decided 19 September 2026 by the operator**, from Mobbin references, after
two published rounds of the Today landing (`claude.ai/artifact/JAzwFmbiaAocUt8dDXamQV`
is the round the direction was taken from). This section is the source. The
memory note that used to hold it is now a pointer here.

### It binds every screen
**Settled 19 Sep 2026, after Today v3 and the Overview were signed off:** this
section is the visual direction for the whole cockpit. Every remaining screen —
operator level, client level, presented mode — follows it: true black, the
sidebar's light source, the C1 row's typography and rhythm, depth only on what
can be pressed, and motion that only encodes change. 🔒 **A screen that departs
from it needs a reason written in the brief, not a preference.** The reason goes
next to the screen's own section, in the form of Today's group-4 exception
below.

*The standing example of a reasoned departure:* Today's collapsed group 4
previews **two labelled lines**, where every other group previews one. Days left
and days since checked are different clocks, and picking one head would rank
them — the exact mistake the preview rule exists to prevent. **Two lines, never
side by side:** two labelled lines say *two lists*; one combined line says *one
list with a tie*.

### How this section changes
By the operator, from a named reference, recorded here with a date. **Never by
an aesthetic or "design taste" skill** — on 19 Sep the `frontend-design` skill
was stopped mid-load: *"the aesthetic direction is coming from Mobbin references
and from me, not from a skill."* Those skills inject their own palette and type
system, which pre-empts exactly the decision this section records.

### The canvas
- **True black.** `--black` is the page, and the working area stays `#000`.
- **Surfaces are lifted off it**, never a neutral dark-grey plane. Rejected as
  *"bland and safe"*: a flat grey plane with hairline dividers.
- **One light source, confined to the sidebar** — decided 19 Sep 2026. It is a
  soft achromatic falloff from the sidebar's top-left corner, from the Revolut
  Business home
  ([Mobbin](https://mobbin.com/screens/7a782d65-9d82-4178-ad92-ca77dc3180bd)),
  whose "modern" feel is mostly this. 🔒 **It never reaches the content area.**
  The operator's reasoning: a single source that only touches the chrome keeps
  the list plane honest. Every row sits at the same depth, so depth still means
  *you can press this* rather than *this is further away*. A light washing the
  content would make rows near the top look different from rows lower down —
  a hierarchy nobody chose. **Its hue is never borrowed:** Revolut's is blue,
  and violet would spend `--handled`'s meaning on atmosphere.
- **Translucent surfaces** (adopted 19 Sep for v3): containers are white at
  3.5–5% alpha with a single top-edge highlight, so the light reads through
  them — replacing the opaque `--lifted` gradient plus border. Same Revolut
  screen.

### Tokens — exact values
These are the values of the published round. **The colour scheme is fixed**:
new surfaces reuse these, and a new hue needs an entry here first. At build
(stage C) the values move to `cockpit/src/app/tokens.css`; this table then keeps
the names and the reasons, and a test asserts every name below exists there.

| Token | Value | Use |
|---|---|---|
| `--black` | `#000000` | the canvas |
| `--lift-1` | `#0E0E10` | first lift; the gradient's foot |
| `--lift-2` | `#151517` | row hover |
| `--lift-3` | `#1C1C1F` | icon wells |
| `--edge` | `rgba(255,255,255,.07)` | the only border a surface gets, and the divider between rows in a list (see below) |
| `--edge-2` | `rgba(255,255,255,.11)` | the border of a pressable thing |
| `--text` | `#F4F3F0` | primary text — warm, never pure white |
| `--text-2` | `#A3A29D` | secondary |
| `--text-3` | `#85847F` | tertiary; still passes contrast on black |
| `--red` | `#FF6A5C` | **only** a breach, a read that failed, a critical. Never decoration |
| `--handled` | `#B9A9FF` | **only** `handledElsewhere`. Never ambient, never a brand accent |
| `--handled-ground` | `rgba(185,169,255,.07)` | the violet tray's ground |
| `--ms-a` / `--ms-b` / `--ms-fg` | `#23355C` / `#15213A` / `#A9C3FA` | a client mark (sample: Marbella Sur) |
| `--ca-a` / `--ca-b` / `--ca-fg` | `#4A3620` / `#2B1F12` / `#F2C890` | a client mark (sample: Casa Atlântica) |
| `--web` / `--web-ground` | `#E7A3C4` / `rgba(231,163,196,.1)` | **the web business** — its heading and its chart. Identity, not state; added 21 Sep 2026 (The Month redesign, operator) |
| `--automation` / `--automation-ground` | `#7FCFE0` / `rgba(127,207,224,.1)` | **the automation business** — its heading and its chart. Clear of every semantic hue: aqua is not `--held` |
| `--lifted` | `linear-gradient(180deg,#141416 0%,#0E0E10 100%)` | a lifted surface (v2; v3 moves to translucency) |
| `--lift-shadow` | `inset 0 1px 0 rgba(255,255,255,.05), 0 1px 0 rgba(0,0,0,.9), 0 24px 48px -12px rgba(0,0,0,.9)` | a lifted surface |
| `--press` | `linear-gradient(180deg,#232326 0%,#1A1A1D 100%)` | a pressable thing |
| `--press-shadow` | `inset 0 1px 0 rgba(255,255,255,.08), 0 1px 2px rgba(0,0,0,.8), 0 4px 10px -4px rgba(0,0,0,.8)` | a pressable thing |
| `--display` | `"Bricolage Grotesque"` | headings, group names, **clocks and amounts** |
| `--sans` | `"Instrument Sans"` | all running text |
| `--mono` | `"Geist Mono"` | **only** text stored verbatim — an event's summary, a message as sent |

### 🔴 A preview renders what the page renders (23 September 2026)

Screens are reviewed by rendering them outside Next (`tests/render-*-preview.tsx`)
and screenshotting the result. That only works while the preview draws **the
page's own components inside the page's own layout**. The moment it wraps them
in a hand-written container, it is showing a screen that does not exist.

**It cost two defects in one day.** `render-month-preview.tsx` wrapped the forms
in `style={{ marginTop: 32 }}` — exactly the separation the real page did not
have — so the collision between "What this page does not do" and "Record a
contract" was invisible in every screenshot for as long as it existed. The
onboarding preview was the opposite case: it rendered the real grid, and caught
a layout bug that no test could see, twice.

**The rule:** a preview imports the real component and the real layout class. No
inline `style` in a preview's JSX, and no wrapper the page does not have. A
preview that does not render what the page renders is a test that cannot fail.

### 🔒 Rows are divided; blocks are not (23 September 2026)

A **list** is a sequence of like things, and it is read down. It gets a hairline
between its rows — `1px solid var(--edge)`, never above the first — so the eye
can track one row across without the rows fusing into a block of text.

A **block** is not a list: sections, panels and groups are still separated by
**space and never by stacked rules**, which is what the cockpit has said since
the first screen.

This refines that rule rather than reversing it. Before this, five screens drew
the same list five ways — 4px gaps on Today, 12px on The Month, 8px on
Onboarding, a separate glass card per row on Expiries — and the operator read
the result as unfinished, which it was. `--edge-2` stays reserved for the border
of something pressable.


**Named 20 September 2026, during the build.** These seven were used by every
Stage B design and named in none of the tables above — found by the second
direction of the `tokens.css` test (every token in the file is named here), on
its first run. 🔒 **That direction exists for exactly this**: without it the
brief silently becomes a subset of the truth and stops being the source it
claims to be.

| Token | Value | Use |
|---|---|---|
| `--through-ground` | `rgba(142,209,166,.085)` | the ground of a *went through* chip |
| `--held-ground` | `rgba(147,180,234,.085)` | the ground of a *held by a rule* chip |
| `--clock-ground` | `rgba(230,186,116,.085)` | the ground of a *a clock is the reason* chip, and of a stale banner |
| `--red-ground` | `rgba(255,106,92,.085)` | the ground of a *broken* chip, and of a failed-read banner |
| `--glass` | `rgba(255,255,255,.038)` | 🔒 the v3 translucent surface — the card, the group container, the stamp. It replaces `--lifted` on new surfaces |
| `--glass-hi` | `inset 0 1px 0 rgba(255,255,255,.06)` | its single top-edge highlight, which is what makes the sidebar's light read *through* a surface rather than off it |
| `--side-light` | `radial-gradient(140% 70% at 0% 0%,#121215 0%,#0A0A0C 38%,#040405 70%,#000 100%)` | the sidebar's one light source. 🔒 Achromatic, and it never reaches the content area |

### Semantic colour — decided 19 Sep 2026

🔒 **Colour carries meaning or it does not appear.** Each colour below means one
thing on every screen. A screen that needs a meaning not in this table adds a
row here first — with the operator's agreement — rather than inventing a colour.
All of them live *inside* the black the way `--handled` does: a light,
desaturated foreground on a ground of about 8.5% — never a saturated fill.

| Token | Value · ground | Means — everywhere | Where it appears today |
|---|---|---|---|
| `--through` | `#8ED1A6` · `rgba(142,209,166,.085)` | **Went through, or is in force** | a sent row · a ledger event currently giving a basis (consent given, a declaration) · an obligation discharged · a policy row **confirmed** |
| `--held` | `#93B4EA` · `rgba(147,180,234,.085)` | **A rule held it back** — a decision, not an error (S5) | a refused row · an objection · consent withdrawn · a jurisdiction's **legal conclusion** (`available` / `unavailable` / `prohibited`) · a template Meta rejected · the frozen objection banner. 🔒 **Not an unconfirmed row** — corrected 20 Sep 2026: an unconfirmed policy row is the *absence* of a confirmation, not a conclusion, so it is grey. Blue and grey then keep a conclusion and an absence apart, which the jurisdiction table has depended on since it was written |
| `--clock` · `--clock-dim` | `#E6BA74` · `#B79A6E` · `rgba(230,186,116,.085)` | **A clock is the reason** | a paced row · a stale refusal (§1.4.1 of brief II) · Today's *ageing* (dim) and *late* (full) · the waiting room's 1-week (dim) and 3-week (full) steps |
| `--red` | `#FF6A5C` · `rgba(255,106,92,.085)` | **Broken, or past its limit** | a failed send · a breach · a critical anomaly · a read that failed · a body that differs from what was intended |
| `--handled` | `#B9A9FF` · `rgba(185,169,255,.07)` | **Replied outside the cockpit** — `handledElsewhere`, and nothing else | Today's violet tray |

| `--through` · `--clock` **on the read stamp** | *This page can still reach the server* · *it cannot* | Added 20 Sep 2026 during the build, when the token guard refused a third component reaching for a semantic colour and asked what state it owned. 🔒 **The stamp owns the live/frozen state**, which is why it may: the pulse is green while re-reads succeed and the whole stamp turns amber when one fails, because a clock is then the reason every figure below it has stopped. It is the only ambient motion in the cockpit and it encodes exactly one thing |

**Never coloured, by rule:**
- 🔒 **Uncertainty and absence** — *we do not know* (`unresolved`), *never*
  (S2), *not checked* (S3), *no policy row*, **a row no lawyer has confirmed**,
  **a date we do not hold** (a lapsed row is red; its *"we do not know when"* is
  grey), attribution *unknown*. They are
  grey, and dashed where they have a shape. Colouring them would assert
  something the system does not know.
- 🔒 **Sequence and position** — the gate's layer dots, a clock's tier track
  notches, the fixed group order. Six layers, one deciding and five passed, are
  steps, not severities; colouring them would read as six grades of bad.
- **An anomaly *warning*.** It is not a clock and not broken; it stays grey
  beside a red *critical*.
- **"New since you last looked."** It is a fact about the reader, not the item.
- **Colour follows effect, not name.** A ledger event is coloured by what it
  does *now*: an imported *consent given* that our correction voided carries no
  colour and says *voided* — green there would claim a consent in force that no
  longer counts.

🔒 **Colour is never the only signal.** Every coloured state keeps its **word**,
its **shape** or its **position**, and colour is the second signal that makes it
fast. This system is full of distinctions colour would flatten — unavailable
versus unknown, objected versus withdrawn, stale versus current, ageing versus
late — so each one must survive greyscale. The contact record's outcome marks
carry a word (*sent · refused · paced · unknown · failed*), a glyph shape and a
colour; Today's tiers carry a track position, a weight and a colour.

**Client marks:** each client gets one gradient pair, stable per client id.
**A mark's colour carries identity, never meaning:** no client may be given red
or violet, and no mark's hue may be read as a status.

### Type
Bricolage Grotesque has character; Instrument Sans is quiet beside it; Geist
Mono marks *"this is exactly what was stored"*. **Amounts are typeset, not
printed** (from the Revolut home): in a clock, `5h` is large and `02m` small and
dimmer; in money, `€1 200` is large and `,00` small. This is the most
"designed rather than printed" signal available, and it costs nothing in colour.

### Depth
**Depth marks only what can be pressed or filled** — the client switcher, the
active nav item, fold pills, the outage card, form fields. A row lifts on hover
because it can be opened; stored text sits in a sunk well because it cannot be
edited. Nothing is raised for emphasis.

### The row
From Coinbase web transactions (the "C1" reference):
- **The verb is the status.** There is no status column. The group says what
  kind of thing a row is; the row's first line says what happened.
- **The clock is the right edge**, set in the display face like an amount, with
  a second line naming what it measures — *"since 05:43"*, *"left · Tue 29 Sep"*.
- **Real vertical rhythm** — about 17px above and below each row, nothing
  between rows but space.
- **Three columns: mark | body | clock.** A fourth column of tier words was
  tried and removed, because it floated (§2.1).

### The frame
- **A left sidebar**, holding the client switcher and the operator sections.
  **Never a horizontal top strip.**
- The sidebar lists sections with filled icons, and the active one is a
  translucent pill.
- **No summary-card row that restates group headers.** Counts live on the group
  header and in the sidebar. Rejected: a five-card summary strip.
- Page titles are small (about 28px); the display face goes where the
  information is.

### References, by decision
| Decision | Reference |
|---|---|
| The row: verb is the status, clock at the edge, rhythm | Coinbase web transactions |
| List structure | Vercel deployments; Railway |
| Group over rows | Linear (dark) |
| The light source, translucency, typeset amounts, composite marks, small title | [Revolut Business home](https://mobbin.com/screens/7a782d65-9d82-4178-ad92-ca77dc3180bd) |
| Each group its own container; a section index in the sidebar | [Graphite inbox](https://mobbin.com/screens/63d17c47-9c4f-410c-9575-940981b7eb46) |
| Tier distribution in the group header | [Vanta tests](https://mobbin.com/screens/eb1d71b4-2b3c-4a83-8435-bdc0e7cbb9e2) |
| Status attached to the value it qualifies | [Deputy timesheets](https://mobbin.com/screens/40b0eeda-18ea-4067-ba0f-1b757cdbe424) |
| The Overview's references | §2.10 |

---

# §1. The frame

## 1.1 The object model

```
operator level          belongs to no client. The operator's own obligations.
  └── client            the top-level object. `clients.id`.
        └── contact     the durable identity: (client_id, phone_e164).
              └── lead  one thing that has happened to a contact.
        └── listing     a property.
        └── close       a transaction.
        └── batch       an import.
        └── run         a campaign evaluation or send.
```

Two rules that fall out and must not be softened:

- **Nothing at the operator level is a rollup of client data being used to rank
  clients.** Operator-level surfaces hold the operator's own obligations —
  expiries, blockers, proofs, law, infrastructure. The Clients screen states
  facts per client; it does not score them.
- **Nothing crosses from one client to another.** No screen shows two clients'
  contacts, leads, listings or contents together. Counts per client on a
  cross-client screen are fine; contents are not. (§3.17's confidentiality
  limit: *the clients' side limited to what he can actually help with, never
  anything confidential.*)

## 1.2 The URL shape

```
/                        The Overview (D2′, §2.10)
/today                   Today
/clients                 Clients
/ops/expiries            Expiries
/ops/infrastructure      Infrastructure
/ops/waiting             The waiting room
/ops/compliance          Compliance watch
/ops/proofs              The proof book
/ops/onboarding          Onboarding
/ops/templates           Templates
/ops/policy              Policy (read-only)

/c/<client>/…            everything beneath a client
/p/<client>/…            presented mode
```

**The client is in the URL, always.** A screen whose subject is implicit is a
screen that can be read about the wrong agency. This is not a routing
preference; it is the guard that makes the switcher safe.

## 1.3 The client switcher — contract

| | |
|---|---|
| **What it is** | A control in the chrome. Never a page. |
| **What it kills** | Five implementations of "which client?" — `/segmentation`, `/calibrate`, `/silence`, `/review` (four near-identical index pages) and the inline picker branch in `/listings`. |
| **Persistence** | Not sticky across sessions. A remembered client is a screen that looks current and is about somebody else. |
| **Switching with a form open** | Either carries the form's subject with it, or refuses and says why. Never silently re-points an in-progress declaration, threshold answer or close at a different agency. |
| **Redundancy is required** | The page states whose screen it is **in its own words**, independently of the chrome. Every standalone screen already prints the client name under its `h1`. That is not duplication; it is the check. 🔒 **structural** |
| **Absent in presented mode** | §1.4. |

## 1.4 Presented mode — contract

**Why it exists.** Five screens are used with the laptop turned around, in a
room with the agency. `segmentation/page.tsx` states it: *"this screen is used
in a meeting with the laptop turned around: a nav bar listing other clients'
leads and queues is not a thing to show somebody."* `triage-actions.ts` records
`chosen_by` as the agency's person, not the operator. There is a second user.

**Which screens have it** (all client-level, listed here because the mode is a
frame decision): the segmentation declaration, thresholds/calibrate, the triage
floor, the exemption declaration, close and party declaration.

**The contract:**

| | |
|---|---|
| Route | `/p/<client>/…` |
| Chrome | No switcher, no cross-client navigation, no cross-client counts, no operator-level links |
| DOM | **No other client's name or id appears anywhere in the served HTML**, including in `<option>` elements, data attributes, JSON payloads and inline scripts |
| Identity | The client's own name is stated prominently — the person in the room must see their own name, not infer it |
| Authentication | None beyond the operator's. The operator is driving. This is not a client login and does not reopen that decision |
| Enforcement | 🔒 A probe asserts the DOM property above, per client, for every `/p/` route. A convention living in reviewers' heads is not a control |

**What presented mode is not:** a different set of screens, a read-only mode, or
a theme. The same screen, the same actions, without anything that would expose
another agency.

## 1.5 The chrome

**Always visible:** where you are (operator level, or which client), the client
switcher when at client level, and one count — *how many things on Today are
waiting on a human*. Nothing else earns permanent space.

**Never visible:** cross-client totals that mix kinds into one number; any
badge that aggregates incommensurable clocks into a colour; another client's
name in presented mode.

**The existing Shell does not survive as-is.** It is phone-first — a fixed
bottom tab bar, four tabs, a More sheet, built around the 755px body-widening
defect. §1.13 says most operator screens should refuse the phone, so that
apparatus is serving screens that should not be there. Its *lessons* survive
(two element sets rather than one that changes shape; a precise `active` value;
never letting a desktop rule reach the phone layout); its structure does not.

## 1.6 The ten states — rendering contract

Every read in the cockpit answers which of these it is. Where it cannot, the
screen says it cannot, which is S3.

| | State | The screen must | Never |
|---|---|---|---|
| **S1** | **Resting** — nothing happened, by design | Name the scope it looked at and the window | Show a blank region |
| **S2** | **Never** — nothing has *ever* happened | Say so in different words from S1 | Share a sentence with S1 |
| **S3** | **Did not run** — a precondition was unmet | Name what it could not check and why | Render as S1. `?? []` is the whole defect (§5k) |
| **S4** | **Broke** — we asked, the query failed | Show the thrown sentence, in place, naming the subject | Take down the rest of the screen. Fall back to an empty |
| **S5** | **Refused** — the system decided not to act | Show the refusal, its layer and reason, in operator words | Read as an error or an emptiness |
| **S6** | **Partial** — some of the answer, and it knows how much | Show the cap and the total (`500+`, never a silent 500) | Under-count silently |
| **S7** | **Partial and blind** | — | **Exist.** Any read with an implicit limit and no count is in this state; it is designed out, never rendered |
| **S8** | **Stale** — true then, not now | Carry the age, and where an input is newer than the run, say which | Show a relative time alone |
| **S9** | **Frozen** — correct and unchangeable because somebody acted | Show it as frozen | Show it as editable and refuse on submit |
| **S10** | **Withheld** — we deliberately do not offer this | State the absence on the page | Leave it to be discovered as a missing button |

**S1–S4 occupy the same blank rectangle**, and picking the plausible one is a
fabrication with good manners (§5b). This is the single most important sentence
in the brief.

## 1.7 Error boundaries

**Per surface, not per page.** Today has five groups; one group's read failing
must show that group's thrown sentence and leave four groups standing. A blank
Today because one read failed is a worse screen than a Today with one section
saying what broke.

**The throw is right and stays.** Every read does
`if (error) throw new Error('<subject> read failed: <message>')` — loud, and
impossible to mistake for an empty. **The gap is that there is no `error.tsx`
anywhere in `app/`**, so today the carefully-written sentence is replaced by a
generic page. The boundary renders the thrown sentence and the subject; it does
not translate it into "Something went wrong".

## 1.8 Time, everywhere

- **Every relative time has an absolute beside it.** *"A relative time on a page
  left open overnight says '5 minutes ago' for twelve hours"* — `/health`.
- **Every live screen carries a rendered-at stamp**, because the screen most
  likely to be left open is the landing.
- **Every timestamp shown to the operator is in one declared zone** (Europe/
  Lisbon at operator level), stated on the screen. Client-level times are in the
  client's zone; the server is Vercel and runs in UTC, and a 09:00 Lisbon
  booking rendering as 08:00 once sent an agent an hour early.
- **A null date is not zero.** `Lapsed.since` and `ToConfirm.daysSinceChecked`
  are nullable because a revocation does not date itself: IMPIC suspended the
  licence on a day nobody told us about. Rendering "0 days ago" would be this
  system stating a fact about the world computed from an absence (§5j).
  🔒 Null renders as *"we do not know when"*, never as a zero, a dash, or today.

## 1.9 Counts, caps and denominators

- **Every count carries its denominator or its scope.** *"3 lapsed"* is
  meaningless; *"3 lapsed of 47 checked"* is a fact.
- **Every cap is visible.** `500+`, not 500.
- **A zero says which zero it is.** Zero because nothing qualified, zero because
  nothing was looked at, zero because the query failed.
- **`undefined` and `[]` never collapse.** The one operator that does it is
  `?? []` and it is forbidden on any path feeding a screen.

## 1.10 Attribution

Where a person asserted something, the screen shows **who** and **when**, and
distinguishes **the person who said it** from **the person who recorded it**.
This already holds in three places and generalises:

- `jurisdiction_policy` / `advertising_policy`: a CHECK constraint makes
  `confirmed_at` and `confirmed_by` null or non-null together — *"a date with no
  name is not a confirmation, it is a date."*
- The segmentation declaration records the agency's declarer, not the operator.
- `partyRecord` keeps `declaredBy` (the agency) and `recordedBy` (us) apart.

At operator level this binds on: compliance-watch reviews, proof blessings,
template recordings, and anything in the waiting room marked answered.

## 1.11 Language

Operator-level surfaces are **English**. Client-facing and agency-facing text is
PT/EN/ES and is rendered only by the modules that own it — `reason.ts` is the
single place matching prose becomes words, and its exhaustiveness is structural:
a new variant does not compile until it can be said in all three.

🔒 **The cockpit never re-renders a sentence another module already produced for
a human.** Anomaly rows show the event's own `summary` — the same sentence the
WhatsApp carried — because a second formatter drifts from the first and the two
then disagree about the same event. This applies to gate refusals, lapse
notices, and match reasons equally.

## 1.12 The volume defaults register

Per §0.3. Each: what it decides, blast radius, why this value, and what would
prove it wrong.

| Default | Decides | Blast radius | Why | Would be wrong if |
|---|---|---|---|---|
| **Anomaly window — 7 days** (`ANOMALY_WINDOW_DAYS`) | how far back Today looks for faults | display only | The list answers *what has this system got wrong lately*, not *what is on fire* — that is the group above it | Faults are routinely older than a week when first noticed |
| **Anomaly groups visible — 4** | how many before an expander | display only | Four keeps the escalations above it on screen; the expander states the severity of what it hides, so collapsing cannot re-bury | The expander is opened every single time |
| **Escalation read cap — 100** | rows fetched | display only | Far above any real morning. Must render as `100+` if reached | It is ever reached |
| **Anomaly read cap — 500** | rows fetched | display only | One regressed guard firing on every run is the volume case; grouping by kind handles it, the cap only bounds the read | Reached while distinct kinds are still under ten |
| **Outage — 3 of one system reason in 15 min** (`detectOutage`) | whether Today shows one fault instead of N leads | display only | Three unrelated faults is a bad afternoon; three of the same is a dependency down | Real outages produce two, or normal days produce three |
| **Expiry warning — 30 days** (`WARN_WITHIN_DAYS`) | how early an agency is told | display + a notice | Already argued in `recheck.ts`: too early is a longer list, too late is a shorter warning, neither publishes anything | An agency cannot obtain a certificate in 30 days |
| **Registration staleness — 90 days** (`STATUS_STALE_AFTER_DAYS`) | when an agency's own assertion stops counting | produces a **question**, never a refusal | Already argued: a quarter surfaces while it matters and is not asked so often it gets clicked through. Same number as the silence screen's, deliberately — two numbers for one shape each need defending | Licences are suspended and re-advertised inside a quarter |
| **Health staleness — 25 minutes** (`HEALTH_STALE_MINUTES`) | when the stamp goes loud | display only | Cron is 10 minutes; 25 allows one missed run plus skew without crying wolf | Normal operation trips it |
| 🆕 **Today rows per group — 5** | before folding within a group | display only | The groups are a worklist, not an archive; five is a morning's span for one kind. The fold states how many and of what severity | A normal morning routinely has more than five of one kind |
| 🆕 **Clients — no cap** | — | — | N is 2 and will be under 20. A cap now would be designing for a scale that would change every other decision on the screen too | A twentieth client is signed |
| 🆕 **Compliance sweep — weekly; *note* items listed 30 days** | what the watch shows | display only | *Act now* alerts immediately and is not governed by this; *review* is a weekly cadence by §5.12's own wording; *note* is context and a rolling month is enough to have seen it | An *act now* is ever discovered by the weekly sweep rather than by its alert |
| 🆕 **Waiting room — an item changes appearance at 7 and at 21 days** | how an unanswered question looks | display only | A two-week-old lawyer question must not look like a two-day-old one. Two steps, not a gradient, so the state is nameable | Nothing is ever answered inside a week, making the first step meaningless |
| 🆕 **Today re-reads every 60 s while visible** (paused when the tab is hidden) | how current the landing's worklist is | display only | The escalation clock is in minutes; a minute's lag is below anything it decides. Faster buys load, not truth | An escalation is routinely cleared and still shown for a whole minute in a way that causes a duplicate reply |
| 🆕 **Clock staleness — 3 missed re-reads (≈3 min)** | when the clocks stop and the stamp goes loud (§1.14) | display only | One failed read is a blip; three is a page that has stopped knowing | The stamp goes loud on a normal connection |
| 🆕 **Every group opens collapsed, on every visit; an opened group is never remembered** | what the landing shows first | display only | Five collapsed headers, each with its own most urgent item, are one screen and one glance (§2.1). A remembered *open* would make the page different every morning; a remembered *collapse* would be a group that looks quiet | Every group is opened by hand every morning — then the preview is not carrying the group, and the default should be open |
| 🆕 **The contact attention set: 7 days, and a cap of 25** (`ATTENTION_WINDOW_DAYS`, `ATTENTION_CAP`) | on `/c/<client>/contacts`, which is a search plus the contacts with something currently wrong — an unresolved send, a refusal inside the window, a quarantined claim | 🔒 **The window's justification is the MATCH, not the number.** It reads `ANOMALY_WINDOW_DAYS`, because two screens that both answer *what needs doing* disagreeing about what *recent* means is a defect nobody would ever diagnose — they would simply, quietly, mean different things. 🔒 The unresolved state is **not** windowed: *we do not know whether they received it* stops being true when somebody reconciles it, not after a week. 🔒 The cap is **stated** — a list of 25 meaning "25" and one meaning "at least 25" are different facts | The refusal window routinely matters longer than a week — a policy confirmation lands and invalidates three-week-old refusals — or the set is empty so often that the screen stops being opened. Either changes it **in both places**, and a test fails if only one moves |
| 🆕 **A forecast goes stale at 7 days** (`FORECAST_STALE_DAYS`) | when the campaign screen's banner appears without an input having changed | display only — it decides what the operator is *shown*, never whether anything is sent, so brief I §0.3 applies rather than §4.6 | A week is the span over which a declaration afternoon, a lawyer's answer or an import can change who is contactable without anything in the run's own inputs moving. Shorter cries wolf on a quiet week; longer lets a month-old projection read as current. 🔒 **The banner's shape is fixed** (§0.4-6): it names what went stale, offers re-evaluate, and never recomputes a figure in place | A forecast is routinely acted on at ten days with nothing having changed, or refusals are found to go stale inside two |
| 🆕 **Overview periods — month (default), week, day** | the Overview's granularity | display only | Month is recurring revenue's native unit. Week and day exist for setup payments and operational counts; recurring revenue at week/day is a **step line**, never bars (§2.10) | The week view is the one opened by default in practice |

**Not defaulted, and must not be:** anything in `client_automations.config` —
matching thresholds, pacing, the silence threshold. Those reach leads.

## 1.13 The phone

Operator level: **Today earns a phone, read-only. Nothing else does** — the
Overview included, although it is the landing (D2′): on a phone `/` renders the
Overview's refusal with Today as its one link, and alerts link to `/today`.

Every other operator surface **refuses the phone** — a stated refusal naming
what it is and that it needs a desk. Not a squeezed layout. A compliance log, a
proof book, a policy table or an onboarding form rendered at 390px invites
somebody to do at a traffic light a thing that needs an hour.

🔒 **Today's phone view carries no action that reaches outside the cockpit.**
Navigation and a telephone call to a human. No reply, no notice, no dismissal.

**And the highest-value mobile work is not a screen.** `anomaly.ts` already
decided the principle: the row shows the event's own summary because it was
judged readable on a phone at 1am. Making the alert sufficient — client, wait,
last message, reason — means the phone screen is not opened at all.

## 1.14 Motion 🎨 — contract

The cockpit is opened every morning and should feel alive rather than printed.
**Alive here means current**, and motion is how currency is shown. So one rule
governs every animation:

> **Motion encodes a change in state or in time. Nothing moves for any other
> reason.**

**What moves:**

| Motion | What it encodes |
|---|---|
| **Clocks tick** (the minute advances in place) | **Only while the data is live.** When a re-read fails, or three are missed (§1.12), **the clocks stop and the rendered-at stamp goes loud** (S8). A clock ticking over stale data is a relative time drifting from the truth — the escalation it measures may already be cleared. Ticking *is* the liveness signal: moving means live, still means stale |
| **A changed number rolls** — digits roll individually | *This changed since the last read*, instead of a silent re-render |
| **A figure counts up after a save** (The Month) — about 500 ms, easing out, from the figure it replaced to the new one | *Your save changed this.* 🔒 **Only on a change that follows a save, never on a page load** (a fresh load starts at the final value). 🔒 **The exact final value is in the accessible text from the first frame**; only the visible digits move, and they are hidden from screen readers. Off under `prefers-reduced-motion`: the new value simply appears. Added 22 Sep 2026 (operator) |
| **A new row fades in** with a brief glow; **a cleared row collapses out**; rows move with layout animation when a clock re-sorts them | what happened between two reads |
| **A tier crossing animates once** — the clock's track fill passes a notch (§2.1) | the moment a lead became late |
| **A group opens and closes** with a spring height of about 220 ms | continuity between collapsed and open |
| **The Overview's period control** slides its indicator; bars and lines **morph** between periods; a line strokes in **once** on first draw | continuity between views of the same data |
| **Hover lift** on what can be pressed | the depth rule (§0.5), as motion |

**What never moves:**
- **No entrance choreography on a routine load.** A page opened every morning
  that staggers its rows in every morning is charming on day one and noise by
  day three. First paint is instant.
- **No looping or ambient animation.** No pulsing dots, shimmering skeletons,
  or animated gradients. The light source (§0.5) is still.
- **Nothing animates to draw the eye to a row.** Urgency is in the clock and
  the group order, not in movement — a moving row among still ones is a sort
  by animation.
- **Presented mode** runs the same motion. Nothing in any animation may carry
  another client's name, count or row.

**`prefers-reduced-motion`:** every transition off. Clocks still update, as a
plain text change. The liveness signal survives without animation because the
stamp says it in words.

**New since you last looked — decided 19 Sep 2026: yes, quietly.** Today is
read every morning, and *"what changed since I looked"* is a real question. But
**"new to me" and "urgent" are different facts**, and the second is the one
that decides what to do first. So the marker:
- is **a small mark, achromatic** — no colour, least of all red or violet;
- **sits beside the row's client mark, never beside the clock**, and never
  changes the clock's weight or the tier track;
- has **no count** — not in the group header, not in the sidebar, not in the
  chrome;
- **never reorders, groups, hides or animates** a row — it appears with the
  row and does not pulse;
- is held in `localStorage`, per viewer, as the time of the previous visit. If
  storage is unavailable it shows nothing, and the page is otherwise
  identical. Never *everything is new*: with no previous visit recorded, no
  row is marked.

---

# §2. The operator level

Ten surfaces. Two exist today. The Overview (§2.10) is the landing (D2′) and
is specified last only because it was added last.

---

## 2.1 Today

### The question
**Q1 — what needs me right now, across everybody?**

Not *which client has the most problems*. The row is the unit, the clock is the
sort, and the client is an attribute of the row.

### Structure
🔒 **Five groups in a fixed order. Never sorted across groups.**

1. Waiting on a human
2. Something went wrong
3. Something has run out
4. Something is about to run out
5. Waiting on someone else

The order is a declared editorial decision, not a computed priority. Ranking
across incommensurable clocks — minutes for an escalation, days for a
certificate, weeks for a lawyer — would be inventing a threshold, and §4.6
refuses that. Within a group, the group's own clock sorts.

🔒 **Every row names its client.** A row without one is an operator-level item,
and that is legible precisely because every other row has one.

**Route: `/today`** — no longer the landing (D2′), unchanged in everything else.

### Organisation 🎨 — added 19 Sep 2026

The second published round put all five groups on one sheet with dividers and
read as one long run of text. These organise it without touching the order.

- 🔒 **Every group opens collapsed** — decided 19 Sep 2026, after the v3
  render. The landing's job is one glance: *what is my day*. Five collapsed
  groups fit on one screen and read top to bottom in the fixed order, which is
  exactly what the order is for.
  - **Why not five pages:** that would mean five visits to learn your day.
    The fixed order would stop being a reading order and become navigation,
    and group 5, empty most weeks, would stop being visited while something
    sat in it for a month.
  - **A collapsed group shows** its name, its count with its denominator, its
    distribution, and **one preview: its own most urgent item, by its own
    clock.** That is longest waiting (1), most recent (2), longest since it
    ran out (3) and longest waiting (5). 🔒 **Never the most urgent item on the
    page.** Minutes, days and weeks are not ranked against each other, and a
    preview implying otherwise would undo the fixed order.
  - **Group 4 previews the head of each of its two lists**: expiring (fewest
    days left) and to confirm (longest since checked). They are two clocks,
    and choosing one head would rank them.
  - The preview is one line. The tier stays in the clock's weight and colour;
    the track is on the open row.
  - **Opening a group never closes another.** Two may be open at once.
- **Each group is its own container**, five stacked in the fixed order, with
  space between them rather than rules (Graphite inbox, §0.5).
- **A resting (S1) or never (S2) group collapses to one line in place**,
  holding its sentence in short form: *"Nothing waiting · looked at 7 flagged
  leads, 08:14"*. 🔒 **It keeps its position.** Rejected: pulling empty groups
  into one shared "empty" strip, as incident.io does — that reorders the page.
- 🔒 **A group with rows cannot collapse below a header** that states its
  count with its denominator, its worst clock and its tier distribution.
  Collapse is never remembered (§1.12).
- **Sub-sections inside a group, each with its own clock:**
  - group 1: the outage card, then the rows, then the violet
    `handledElsewhere` tray at the foot;
  - group 3: clearances, then templates, then senders;
  - group 4: expiring, then to confirm.
- **The sidebar indexes the page.** Under the Today item: the five groups with
  their counts. A click jumps to the group, and the item in view is marked.
  This is how the page gets an overview **without** a summary-card strip.
- **Two lines per row; stored text on demand.** The verb and the subject are
  always shown; *"Sent to the lead, as stored"* opens in place under its row.
  🔒 **An anomaly's own `summary` is never behind a disclosure** — §1.11 makes it
  the row's content.
- **The page stops narrating itself.** The *"five groups, always in this
  order"* sentence and each group's long scope sentence sit behind an ⓘ on the
  header. 🔒 **The denominator stays visible inside the count** — *"6 open · 7
  read · cap 100"* — because §0.4 requires it.

### Tiers are positions, not labels 🎨 — added 19 Sep 2026

The second round carried *Breach / Late / Ageing / Critical / Warning / 1 week+ /
3 weeks+* as a fourth column. They looked accidental because they are **three
unrelated vocabularies in one column**. Each now goes to the thing it qualifies,
and the column is removed — the row is mark | body | clock.

| Words | What they really are | Where they go |
|---|---|---|
| Settled · Ageing · Late · Breach | A function of the clock: `tierFor` in `lib/escalation.ts`, at 30, 90 and 240 minutes of wall-clock wait | **Into the clock.** A hairline track under the clock value with notches at 30, 90 and 240 min, and the fill shows where the wait sits. The clock's weight and luminance step with the tier; **`--red` only at breach.** The word remains in the accessible name and on hover |
| Critical · Warning | A property of the anomaly's **kind** (`lib/anomaly.ts` — an unset severity is critical) | **Onto the mark, as its overlay badge** — the badge slot `handledElsewhere` already uses. The mark says *who*; the badge says *what kind of trouble*. Critical is a filled ring, warning an outline |
| 1 week+ · 3 weeks+ | The waiting room's 7- and 21-day steps (§1.12) | **Into the clock**, with the same track and two notches — clocks of the same shape look the same |

**The group header carries the distribution** — *"6 open — 1 breach · 1 late ·
1 ageing · 3 settled"* — as a thin segmented bar (Vanta, §0.5). It is the tier
overview, so no row has to shout. **The outage row shows overlapping client
marks** when it spans clients (Revolut's composite avatars), so its reach is
seen before it is read.

### States

| State | Where | Must say |
|---|---|---|
| S1 | any group | *nothing in this group*, with the window it looked at |
| S2 | whole screen | no client has any automation enabled — different words from S1 |
| S3 | per group | this group could not be checked, and why. **The other four still render** |
| S4 | per group | the thrown sentence, in place |
| S6 | groups 1, 2 | `100+` / `500+` and the fold count |
| S8 | whole screen | rendered-at stamp |
| — | group 1 | 🔴 **`handledElsewhere`** — the escalation flag is still set *and* an outbound message has since gone out. Somebody replied outside the cockpit. Neither open nor closed, and it must be its own visible state, not folded into either |
| — | group 1 | **outage** — three or more of one system reason within 15 minutes renders as *one fault*, with the count, above the individual rows |

### Can do
- Open the thing the row is about.
- Call a human (phone only).

### Cannot do
- **No action on any row from this screen.** No dismiss, no acknowledge, no
  reply, no mark-as-read, no snooze. Today is a worklist, and a worklist you can
  clear without doing the work becomes a list of things you clicked.
- **No cross-client bulk action.** Ever. The frame makes this newly possible and
  it is closed at the frame.
- **No re-sort by client.** That is the Clients screen.
- **No dismissing an anomaly** — §4.8 defers that with a trigger: only if a kind
  is still firing after its cause is understood.

### Reads

| Group | Source |
|---|---|
| 1 | `leads` where `qualification->>'escalated'` is set (`->>` not `->`, load-bearing), joined to `clients.name`; most recent outbound `messages` row per lead for `handledElsewhere`; `escalation.ts` for tier, class and `detectOutage` |
| 2 | `events` where `type in ('invariant.violated','invariant.check_failed','run.errored')`, last 7 days, shaped by `lib/anomaly.ts` — grouped by `kind`, most recent occurrence with `N× since` |
| 3 | `recheckClearances(...).lapsed`; obligation discharges past `staleAfterDays`; `message_templates.status in ('rejected','paused','disabled')`; a sender quality rating not in `{HIGH, GREEN}` |
| 4 | `recheckClearances(...).expiringSoon` and `.toConfirm`; Layer 4's calendar items (read-only, no mechanism) |
| 5 | The waiting room's store (§2.5) |

### Legally load-bearing
- The anomaly summary is **the record an agent needs when a lead complains about
  something the system got wrong** (§4.8). It shows the text the lead was sent,
  as stored. It is not re-worded here.
- Group 3's lapse rows carry the `requirement_unresolvable` distinction: *we
  cannot confirm this is still in order* is not *this is unlawful*, and Today
  must not compress the four causes into one word.

---

## 2.2 Clients

### The question
**Q2 — how is each client actually doing, and is it our fault or theirs?**
**Q10 — which automations is each client actually running?**

Read deliberately, not triaged. This is the screen you open to think about a
client, not to find work.

### States

| State | Must say |
|---|---|
| S1 | clients exist, nothing notable — the cards still show their clocks |
| S2 | no clients at all — with the onboarding route, as `/report` and `/import` already do |
| S3 | a derived column unavailable for one client — 🔴 *not checked*, **never a dash**. Casting an absence is a decision to invent (§5i) |
| S4 | a read failed — that cell, not the screen |
| S8 | rendered-at |

### Can do
- Open a client.
- Open onboarding.

### Cannot do
- **No green/amber/red per client.** That is the rollup D2 rejected: it collapses
  a ninety-minute wait and a twenty-seven-day certificate into one dot. The card
  states facts with their clocks and the operator compares.
- **No ranking or sorting by severity.** Alphabetical, or by onboarding date.
- **No pausing, disabling or configuring an automation from this screen.** That
  is the client's own settings, one level down, where the client's name is the
  page's subject rather than one row among several.
- **No client contents.** Counts, never names.

### Reads

🔴 **Derived, per §0.2. Never `client_automations.health` or `last_run_at`.**

| Column | Derived from |
|---|---|
| automations enabled | `client_automations.enabled` joined `automations.key` |
| did it run, when | most recent `automation_runs` row per `client_automation_id` |
| did it fail | `automation_runs.status = 'error'`, plus `run.errored` events |
| did it do nothing | `invariant.violated` / `invariant.check_failed` events |
| anyone waiting | escalated `leads`, oldest wait |
| blocked, and by what | the gates' own refusals: `thresholds_not_configured` (03), `policy_not_confirmed` (04), `no_ledger_basis` (02/05), no approved template (02/05) |

### Legally load-bearing
- 🔴 **The automation names in the database are wrong.** `automations.name` still
  holds *"Database Reactivation & Referral Engine"* and *"Post-Close Reputation &
  Referral Loop"*, both corrected on 19 September: "Referral" appeared in two of
  five names and was built into neither, and 05 is one message once. `0027`
  updated a *description* only. **The screen must not display `automations.name`
  until a migration corrects it**, or it reintroduces a claim the project
  retired — including a referral product that was refused, because a referred
  contact has no documented origin.
- 🔴 **Never the word "viewings"** for what the Concierge books. It books an
  introductory meeting, not a property visit (§3.15). `leads.stage` says
  `viewing_booked` and `metrics_daily` says `viewings_booked`; the screen shows
  the truthful word regardless of the column name. A client reading "3 viewings"
  when nobody visited a property is a trust problem that surfaces in the first
  weekly report.
- Confidentiality: counts, never contents.

---

## 2.3 Expiries

### The question
**Q3 — is anything about to expire, lapse, or arrive?**
**Q21 — what was lawfully advertised and has stopped being so?**

The cross-client home for `recheckClearances()`, which is the largest thing in
the codebase with no surface.

### Structure
Four axes, and 🔒 **they do not merge**, because `Recheck` keeps them apart for
reasons that are each a defect avoided:

1. **Lapsed** — no longer advertisable. The agency has to be told.
2. **Expiring soon** — still advertisable, will stop being.
3. **To confirm** — registrations. 🔒 **Keyed by the registration, never by the
   property.** One AMI licence behind forty cleared properties is one line; as
   forty lines the notice becomes something nobody reads, which costs more than
   the thing it surfaces. Not counted in `checked`; does not stop a clearance
   being `stillGood`.
4. **Other expiries** — template approvals, obligation discharges, sender
   quality, Layer 4's calendar items, and **Ryvo's own** (below).

### Ryvo's own expiries (added 21 Sep 2026, operator)
**On `/ops/expiries` only. They are the operator's obligations, never shown in a
client's slice.** Each row states an expiry date and **warns at 30 days**, amber
by the batch's colour rule. Past the date, it is red.

| item | the date comes from | entry |
|---|---|---|
| **The n8n deploy key** | its own JWT `exp` claim, read by `healthcheck.sh` on the server and published as `health_runs.n8n_api_key_exp` (migration 0051). Today: **2027-09-20 22:00 UTC** | automatic |
| **ryvodigital.com** | the registry, over RDAP (`rdap.verisign.com`), read on the server. Today: **2027-03-18**, registrar GoDaddy. The registry date says when the name lapses. Whether it renews depends on the card below | automatic |
| **The certidão permanente** | the "válida até" on the certidão (its access-code subscription). Entered by hand: the code is sensitive and is not stored | manual |
| **The procuração** | the document itself. 🔒 If it states no validity, the row says **"no expiry stated"**, in words. **Never a blank and never a dash**: a blank is indistinguishable from "not entered", and §2.3's rule already makes an unknown date grey, never "no expiry" | manual |
| **Payment cards** | the card. 🔒 **Stored as brand, last four and expiry month/year ONLY, never a full number.** **One line per card**, listing the services charged to it (Hetzner, Vercel, Supabase, Twilio, Anthropic, Resend, GoDaddy…), in the way §2.3 keys a licence by its registration and never by the property. A card behind eight services is one line, and when it lapses, all eight stop | manual |

- **The deploy key also alerts by email at ≤ 7 days** (`healthcheck.sh`, the
  ordinary failure path), because a lapsed key blocks every deploy. The screen
  row is the 30-day notice; the email is the one that cannot be missed.
  - Shown working on 21 Sep with a test threshold: the email arrived in the
    inbox.
- The manual rows need a small table: label, kind, expiry, source, entered by,
  last checked. **The migration is written when the screen is built (C5), not
  before.**
- 🔒 **An automatic row whose source has not been read is grey with its age**
  ("RDAP last read 3 days ago"), the same as §2.3's stale-sweep rule. It is
  never shown as a clean date.

### States

| State | Must say |
|---|---|
| S1 | 🔒 *"checked N clearances, none lapsing"* — **with N**. A bare "all clear" is indistinguishable from nothing to check |
| S2 | no clearance has ever been granted — today's state |
| **S3** | 🔴 **the state this screen exists to render.** `notCheckedFor` names each `LapseCause` that could not be checked and why. A run given no policy rows once reported every standing clearance as unconfirmable — four hundred properties as findings, from our own missing argument. *"A silent clean bill would have been worse still"* |
| S4 | a policy read failed — 🔒 and it is **not** rendered as `requirement_unresolvable`, which is a finding about the world, not about us |
| S6 | caps, with totals |
| S8 | the sweep's own last-run age. A clearance list is only as current as the sweep that made it |

### Can do
- Open the listing or the client.
- **Notify the agency** — and the notice records only that they were told.
- Re-run the sweep.

### Cannot do
- 🔴 **No verb claiming we acted on the outside world.** We cannot withdraw a
  post we did not publish. Nothing on this screen, in any notice it sends, or in
  any confirmation it shows may say *removed*, *corrected*, *taken down*,
  *republished* or *suspended-by-us*. A test fails on any such verb — **and the
  guard asserts its own cases before using them**, after listing only masculine
  singular participles while every noun in the feature (*publicação*, *menção*,
  *licença*, *peça*) is feminine, and `despublic` sat inside a `\b` group so it
  had matched nothing since the day it was written.
- **No editing a certificate, licence, expiry or exemption here.** Those are
  declarations with authors, made client-side.
- **No bulk notify across clients.**
- **No suppressing a cause.** All applicable causes are reported, never the
  first found — an agency told only that the certificate expired buys a
  certificate, and the licence is still suspended.

### Reads

`recheckClearances(rows, opts)` and nothing reinterpreted:

| Field | Renders as |
|---|---|
| `lapsed[].causes` | 🔒 **all of them, each in its own sentence.** Four causes, four different claims |
| `lapsed[].since` / `daysAgo` | nullable — *"we do not know when"*, never zero |
| `lapsed[].noticeSentAt` | told already, so a second notice is a choice rather than an oversight |
| `expiringSoon[].daysLeft` | with `warnWithinDays` stated |
| `toConfirm[].affects` | how many clearances rest on this registration |
| `toConfirm[].daysSinceChecked` | nullable — 🔴 **never checked is not stale-after-90-days.** No check date at all, or status `unknown`, surfaces **immediately**; waiting ninety days would be inventing a grace period out of a missing value |
| `stillGood`, `checked` | the denominators |
| `notCheckedFor` | S3, above |

Also: `message_templates.status` and `status_changed_at`; `OBLIGATIONS[*].staleAfterDays` against the discharge check; the sender's quality rating via `assessQuality`.

### Design decisions 🎨 — the compliance batch, 19 Sep 2026
*Design: `claude.ai/artifact/ToHmRvy8sSt1VrUEFyhfn3` (Expiries, Policy,
Templates, the re-check notice).*
- **Colour, one meaning across the batch:**
  - red — lapsed (past its limit);
  - amber — a clock: expiring, a licence to confirm, an approval not
    re-verified, a template waiting on Meta;
  - blue — held by a rule: a policy researched but unconfirmed, a template Meta
    rejected;
  - green — in force: a lawyer's confirmation, an approval, an agency told.
  - 🔒 **`requirement_unresolvable`, *never confirmed* and a null date are grey
    on every screen.** They are statements about us, and uncertainty is never
    coloured. A lapsed row's *"we do not know when"* is grey even though the
    row is red.
- **Every cause in its own line, each with its own chip.** No verb claims we
  acted on an advert, in English or Portuguese, on any of the four. The design
  check runs the verb guard over every scenario and was seen to fail on an
  injected *retirado*.
- **Operator-level cause sentences in English do not exist in any module.**
  The design proposes four, the fourth as soft as `NOTICE.causeUnresolvable`.
  They belong in a copy module, never inline.
- **Policy lights the one row that unblocks Portugal**: a blank cell outlined in
  `--held`, with what it is refusing counted. There is no control that
  confirms, anywhere on the page.
- **Templates show bodies inside one client's section at a time.** An approval
  belongs to one client's WhatsApp account, and a body is that client's content.
- **The re-check notice** — `NOTICE` in `lib/matching/screen-copy.ts` — **had no
  brief section in any document**, only a mindmap row (Q21). It is the client
  slice of Expiries at `/c/<client>/expiries`, in the agency's language, and it
  is read aloud to the agency. So it carries the presented state of the frame,
  which **makes it a sixth presented-mode screen** that brief II §2 does not
  yet list.

### 🔒 A stale sweep flags; it never greys and never recomputes
*Added 20 Sep 2026.* When the clearance sweep has not run, **every row it
produced keeps its own colour** — what was true on Wednesday is still true about
Wednesday — and each carries a stale flag in a heavier weight, with an amber
rule down the row's edge. Greying them would say *this is fine now*, when what
is true is *nobody has looked*. The same rule as a stale refusal on the contact
record (brief II §1.4.1): **never recompute, always flag.** The flag is scoped
to the sweep's own axes; templates, senders and the calendar are read live and
are not flagged.

### Legally load-bearing
- 🔴 **`requirement_unresolvable` is not an allegation.** *"We cannot confirm
  this is still in order"* is what is true; *"this is unlawful"* is not. Four
  causes, four sentences, and this one is the one that must not be sharpened.
- 🔴 **A notice that reads like an action is worse than one that reads like a
  warning**: somebody reads it, believes the problem is closed, and the unlawful
  advertisement is still up — with our record saying it was handled.
- The company fine range is €2,500–€44,890, not the €250–€3,741 that §8.A
  carried until 18 September. If the screen states exposure at all, it states
  the company range; understating it twelvefold is the opposite of what the
  sentence is for.
- 04 is **Portugal only**. §8.A.3 and the findings register both say it cannot
  enter service in Spain without its own analysis. A Spanish row appearing here
  is a bug, not a feature.

---

## 2.4 Infrastructure

### The question
**Q4 — is the system alive, and is the thing that watches it alive?**

🔒 **And its real question is narrower than its title.** Nobody opens this to
*discover* a fault — Better Stack emails first. They open it to **confirm**
one: before telling a client the system is fine, or after an alert, to see which
of twelve checks went. It is a pre-flight screen, and the last-run stamp is the
whole of it.

### States

| State | Must say |
|---|---|
| S1 | twelve green |
| S2 | never run — *"Never"* |
| S4 | the health read failed — 🔴 distinct from twelve red |
| S8 | 🔒 stale after 25 minutes, **and the staleness is louder than the checks** |
| S3 | Better Stack's line: *we could not ask the monitor* ≠ *the monitor says nothing is wrong* |

🔴 **The self-reference, which is not a gap.** One of the twelve checks is
"Supabase reachable", and `health_runs` lives in Supabase. **When Supabase is
down this screen cannot report it — it can only stop updating.** That is correct
behaviour and is why the stale state is louder than the checks, and why email
remains the alerting channel that does not depend on the thing it watches. The
screen says this in words, so a stale stamp during an outage is read as the
design rather than as a broken page.

### Can do
- Read. Follow a link to Better Stack.

### Cannot do
- **No re-run.** The check runs from cron on the server; a button here would
  either do nothing or build a second trigger path for a thing whose value is
  that it runs on a schedule outside the app.
- 🔴 **No rebuilding Better Stack's dashboard.** §4.9: it already has history,
  incident timelines and uptime percentages; duplicating them is work done twice
  and maintained forever. **One line** — healthy or not, last checked, a link.

### Reads
`health_runs`: `ran_at, ok, passed[], failed[], duration_ms, host`, most recent
row only. Plus one call to Better Stack's API for the monitor's own state.

### Legally load-bearing
Nothing. This surface carries no legal obligation and the brief says so rather
than manufacturing one.

---

## 2.5 The waiting room

### The question
**Q5 — what is blocked on somebody who is not me, and for how long?**

Ten lawyer questions across three notes, Meta verification, ADENE credentials,
one agency's afternoon.

### Why it is a screen rather than a markdown list
🔒 **The age is the content.** *"Sent 17 September, unanswered"* is a fact that
gets worse silently, and a list in a file does not change appearance as it ages.
A screen with a clock on it is the only artefact that makes a two-week-old
question look like a two-week-old question.

### What an item holds
Who we are waiting on · what was asked · when it was sent · what it unblocks ·
where the full text lives (`legal/fonte/nota-questoes-automacao-0N.md` §N) ·
whether an answer has arrived, and from whom.

### States

| State | Must say |
|---|---|
| S1 | nothing outstanding |
| S8 | intrinsic — every row is an age (§1.12: appearance changes at 7 and 21 days) |
| S2 | nothing has ever been asked |

### Can do
- Add, annotate, and close an item — closing names who answered and when.

### Cannot do
- **No chasing.** No reminder emails, no "nudge". It is a record of what we are
  owed.
- 🔴 **No marking an item answered without the answer.** The waiting room's only
  value is that it distinguishes *asked* from *answered*, and a status that can
  be set without the substance re-creates exactly the thing it exists to
  prevent. An answer is recorded with who gave it and what they said.
- 🔴 **No acting on a provisional answer.** Nothing here changes a policy row, a
  template, or a gate. A confirmation is made in the policy table by a named
  lawyer (§2.9), and an item in this screen being green is not that.

### Reads
A new table. Nothing existing holds this; it is tracked in prose today.

### Legally load-bearing
Indirectly, and worth stating: **this is the record that the questions were
asked.** A supervisory authority does not expect omniscience — they expect a
documented process for noticing and responding (§5.12's own argument). A dated
list of questions put to a lawyer, with what was blocked meanwhile, is that
document. Which is also why an item may not be closed without an answer: a log
that can be tidied is not evidence.

---

## 2.6 Compliance watch

### The question
**Q6 — what changed in the law this week that touches what we run?**

§5.12, assigned to the mindmap by name. Compliance is not a state that is
reached; it is a state that decays.

### Sources
Meta's WhatsApp Business Messaging Policy and platform changelog; CNPD decisions
and directives; AEPD guidance; EDPB opinions; the AI Act implementation timeline
and Commission guidance; national ePrivacy transpositions for **each
jurisdiction in the policy table** — so the source list is derived from
`jurisdiction_policy` and `advertising_policy`, not hardcoded. A jurisdiction
added without a source is itself a finding.

### Three severities, mirroring the alerting tiers
- **Act now** — something in production is now non-compliant. Alerts immediately,
  on the same channel as an invariant violation.
- **Review** — probably affects us, needs a human read within the week.
- **Note** — context, no action.

### States

| State | Must say |
|---|---|
| S1 | the sweep ran and found nothing — with the date **and the source list it read** |
| S2 | never swept |
| **S3** | 🔴 some sources unreachable — **named**. A sweep that read four of six sources and reports nothing is asserting something about two sources it never opened |
| S4 | the sweep itself failed |
| S8 | 🔒 the sweep's age, prominently. A compliance log that has not run for three weeks is worse than none — same reasoning as the health stamp |

### Can do
- **Mark an item reviewed, with a name.**
- Correct a severity by hand, once, on an item the sweep got wrong — recorded as
  a human override with its author.
- Open the source.

### Cannot do
- 🔴 **No reviewing without a name.** The reviewed state **is** the compliance
  artefact. *"We monitor regulatory change and here is the log"* is worth
  something only if the log says who read what, when. Same rule as
  `confirmed_by`.
- 🔴 **No deleting an item.** Append-only. A log that can be tidied is not
  evidence.
- 🔴 **No acting on a summary.** Nothing here changes a policy row, a template,
  or a gate. An *act now* raises an alert and an item; a human decides.
- **No suppressing a source.** A source that stops being read is a finding, not
  a setting.

### Reads
A new table. Derives its source list from the two policy tables.

### Legally load-bearing
- 🔴 **The whole screen is the artefact.** Its value to a regulator is the
  documented process, not the summaries.
- 🔴 **A model reading legal sources will eventually produce a confident sentence
  about a rule it misread.** So: every item shows its source, its date and a
  link; the summary is **labelled as ours**; and the item is never rendered in a
  way that lets the summary be mistaken for the source. This is §5j at the
  operator level — never publish a number, or a conclusion, you computed as
  though it were a fact about the world.
- *Act now* shares a channel with invariant violations, which means it shares
  their fatigue budget. §3.7: alert on everything and it is muted within a week,
  and the muting takes the *wake me* tier with it.

---

## 2.7 The proof book

### The question
**Q7 — what have we proved, and has any of it gone stale?**

22 proofs that cannot run in the test suite, their hashes, and what each one
proved.

### States

| State | Must say |
|---|---|
| S1 | all proofs current |
| **S2** | 🔴 **never run** (`last_proved: null`) — and this is **not** the same as stale. A proof whose hash answers *has the file moved since it was proved* cannot answer *was it ever proved*, and `last_proved: null` once sat there green |
| **S8** | a hash mismatch — proved once, the file moved since. A regression, where S2 is an absence |
| **S3** | a `blocked` proof whose `runnable_when` path does not yet exist — *not yet runnable*, which is neither pass nor fail. The moment the path exists it becomes S2 and says so |
| S4 | the book could not be read |

### Can do
- Read. Open the proof's `how`, its `watches` list, and the files it hashes.

### Cannot do
- 🔴 **No blessing from the screen.** Blessing is a claim that a human ran
  something, and a button is how that claim gets made by accident. It stays
  `npm run proof:bless <id>` — which requires an id, because *"a claim made about
  four things when one was intended is three lies"*, and because a convenience
  call once replaced ten true dates with today's and stamped two never-run
  proofs as proved.
- **No editing `proofs.json`.** Read-only.
- **No hiding blocked proofs.** They are alarms with a trigger, not silences.

### Reads
`db/tests/proofs.json` — `id, what, how, watches[], hashes{}, last_proved,
proved_by, blocked{reason, runnable_when}` — plus the on-disk hashes of the
watched files, computed at render.

### Legally load-bearing
Nothing directly. Worth noting anyway: several proofs are the evidence that a
constraint refusing an unlawful row actually refuses it, so the book is the
closest thing the project has to a record that its guards were seen to work.

---

## 2.8 Onboarding

### The question
**Q8 — can I take on a new client, and what does that actually require?**

### 🔒 It becomes a checklist that links out, not a longer form
Today's form writes **one** `clients` row and **one** `client_automations`
config — for `inbound_concierge` only. There are five automations, and two of
the required steps are conversations that cannot be performed in a form:

| Step | Kind | Where |
|---|---|---|
| The agency row — name, WhatsApp number, timezone, locale, default language | form | here |
| Concierge config — working hours, booking window, notice, duration, high-value threshold, escalate-to, calendar id, the three handoff notes | form | here |
| **Areas** | form | here — §3.14: hand-edited in config today, does not scale past one client |
| **Meeting kind, duration, location** | form | here — §3.16: a lead asks all three in the first conversation and currently gets nothing |
| Per-automation config for 02–05 | form | here, one section each |
| **AMI licence number** (04) | form | here, once per client |
| **Review destination** (05) | form | here — `0034`, host allow-listed |
| **Prove inbound routing** | 🔴 proof, not a form | here — see below. Required from client two onward |
| **The AI-disclosure conversation** (§3.0) | 🔴 conversation | recorded here as done, with a date |
| **The contact declaration** (§3.18) | 🔴 conversation | `/c/<client>/declaration` |
| **The calibration** (§3.20, §4.6) | 🔴 conversation | `/c/<client>/thresholds` |

### States

| State | Must say |
|---|---|
| S1 | the form, empty |
| S5 | validation refusals: a non-IANA timezone, a phone failing the country-aware check, a WhatsApp number already held by another client (`0007`) |
| **S4** | 🔴 **the calendar probe could not run** — distinct from *the calendar is wrong*. A wrong calendar id returns **200 with `busy: []`** and hides the failure in `calendars[id].errors`; that is C1's first find and it lives here |
| S6 | the client exists and the checklist is partly done — 🔒 the two conversations shown as outstanding, by name |
| S2 | no clients at all |

### Can do
- Create a client; validate a calendar; configure each automation; record that
  the disclosure conversation happened; link to the two conversations.

### Cannot do
- 🔴 **No "onboarded" state while either conversation is outstanding.** A
  checklist showing them as outstanding is honest; a form that omits them
  implies a client is ready when nothing may yet be sent to anybody. Until the
  declaration exists the gate refuses every contact, correctly.
- 🔴 **No declaring, classifying or calibrating from this screen.** Those are the
  agency's assertions, made in their name, in presented mode.
- **No enabling an automation that cannot run.** Enabling 02 or 05 without an
  approved template, or 04 without a confirmed policy row, is a switch whose
  only effect is a refusal later; the checklist states the gate instead.
- **No two clients on one WhatsApp number.** `0007` is a partial unique index on
  `clients.whatsapp_number`; the form refuses a duplicate too, but *"an
  application check is advisory the moment there is more than one caller."*

### Reads / writes
Reads `automations` (the catalogue), `clients` (for the duplicate-number check).
Writes one `clients` row and one `client_automations` row per enabled
automation. Validation is `lib/onboarding.ts`, which is deliberately free of
React and `server-only` so every rule is directly testable — *"a rule whose only
test is 'the form looked right' is not a rule."*

### Legally load-bearing
- 🔴 **§3.0 — the AI-disclosure conversation.** Article 50 has applied to the
  provider since 2 August 2026; exposure is up to €15M or 3% of turnover; **we
  carry that duty, not the client**; it is one line at the top of the first
  message only; and it may measurably depress reply rates, which is the client's
  number. The client hears it **from us, at onboarding, before they find it in
  their own transcripts.** A client who finds it themselves reads it as
  something we did to their funnel without telling them. This is a checklist
  item with a date, not a note.
- 🔴 **The data-processing agreement and the services contract** — `anexo-ii-
  acordo-tratamento-dados-v1.md` and `contrato-prestacao-servicos-v1.md`. A
  client processing personal data through us without the annex signed is the
  exposure onboarding exists to close.
- 🔴 **Prove inbound routing — its own checklist step, and it is a proof rather
  than a field.** The Concierge resolves the client from the number a message
  arrived on: `whatsapp_number=eq.<To>&limit=1`, no `ORDER BY`. `0007` forbids
  the collision that would make that non-deterministic, but the Twilio sandbox
  provides exactly one sender number, so **two clients have never been tested
  simultaneously and routing has never once been exercised.** Onboarding says
  this out loud rather than letting it be discovered:

  > **The second real client is also the first proof that routing works.**

  The step is: send an inbound message to the new client's number and confirm
  it was answered with *this* client's config, areas and assistant name — and
  that the existing client's number still answers with theirs. 🔒 **Both halves.
  Checking only the new one proves nothing**, because the failure mode is a
  real client's leads being answered with another client's assistant, and the
  row that loses is the one nobody thought to check (lesson 7b: a constraint is
  proved by the cases it must leave alone). Until that has been done and
  recorded with a date, the client is not onboarded.
- 🔴 **Test clients and reserved numbers must be visible and removable.** The
  `ZZ TEST` client has to be gone before go-live, and the gate's first layer
  refuses `reserved_test_number` before anything else. A screen that creates
  clients must show which of them are not real. **Since 19 Sep, that is a
  column:** onboarding asks *"Is this a real agency or a rehearsal?"* as a
  required choice with **nothing pre-selected**, and writes
  `clients.rehearsal` (migrations 0037/0038). There is no default: an unanswered
  question is not an answer.
- **§3.1 — there is no agent entity anywhere in the system.** No table, no
  column. Escalations cannot route to the right person and the calendar cannot
  tell whose availability it reads. Honest at one agency of one or two people;
  🔴 **the form must not imply otherwise** by collecting an "agent name" that
  routes nothing. Collect it as a label and say what it does.

---

## 2.9 Templates and policy

Two surfaces, adjacent because they answer the same shape of question: *what
may we lawfully say, and where does that permission come from?*

### 2.9a Templates

#### The question
**Q9 — what may we lawfully say, to whom, in which language?**

`0020` names this screen as one of four readers of `message_templates` and
specifies what it reads: **current status. A "now" question, no history needed.**

#### States

| State | Must say |
|---|---|
| S1 | approvals recorded |
| **S2** | 🔴 none ever recorded — **today's state, and the true reason 02 and 05 cannot send** |
| S5 | a malformed approval id refused at recording — `^HX[0-9a-f]{32}$`; a body whose `{{n}}` variables are not contiguous, or contain `{{0}}` |
| **S8** | 🔴 an approval whose status may have changed at Meta since we wrote it down — *"unverified since <date>"*. **Nothing syncs.** The Content API could be polled and is not |

#### Can do
- Record an approval: client, name, language, version, body, category, approval
  id, submitted/approved dates, source document.
- Update a status by hand when Meta changes one.

#### Cannot do
- 🔴 **Nothing that makes this table describe a campaign.** `0020` names five
  columns that must never appear, because each *"will be proposed by somebody
  solving a reasonable local problem"*: `default_recipients`,
  `auto_send_on_approval`, `send_to_segment`, `schedule`,
  `enabled_for_campaign`. **Every one turns a record of what was approved into a
  campaign definition, and something will eventually read it and act.** The
  screen must not offer any of them as a field, a toggle or a convenience.
- **No sending.** `template-record.ts` writes one table and reads one table;
  it names no recipient, holds no provider credential, and imports neither the
  dispatcher nor the permit. The screen inherits that.
- **No sharing a template between clients.** An approval belongs to the WhatsApp
  Business Account, so per client; a shared row would let one client's campaign
  send under another's approval, which Meta rejects and which would put one
  agency's identifier in another's send record.
- **No editing a frozen field.** `body`, `category`, `approval_id`,
  `submitted_at`, `approved_at`, `source_document` are what a send names and
  what a record reproduces. A correction is a new version.

#### Reads
`message_templates` — all columns. Frozen half rendered as frozen;
mutable half (`status`, `status_changed_at`, `status_note`, `quality_rating`)
rendered as current, with its age.

#### Legally load-bearing
- 🔴 **The stated risk goes on the screen, not only in the source.** A mistyped
  `HX…` is accepted at recording and refused by Twilio at send time as a
  terminal 4xx — *"a loud failure on the first send rather than a silent one,
  but a failure in production rather than at recording."* The operator recording
  it should be told that while recording it.
- The orphan sweep **must not read status at all** — a message sent under a
  template Meta disabled yesterday is still one of ours. The screen showing
  status must not become the sweep's source.
- The forecast reads a **snapshot**, not this live status: phase 1 says "20
  contactable with template X" at 09:00, Meta pauses X at 10:00, phase 2
  re-decides at 14:00. Without the snapshot, *"why did the forecast say 20"* has
  no answer. This screen must not be repurposed as that snapshot.

### 2.9b Policy

#### The question
Where does a permission come from, and has a lawyer actually said so?

#### States

| State | Must say |
|---|---|
| **S5** | 🔴 a row with `confirmed_at` null is **inert — it permits nothing**. Today that is Portugal's `advertising_policy` row, and it is why every Portuguese property refuses `policy_not_confirmed` before anybody's missing certificate is reached |
| **S3** | 🔴 `existing_customer` is **three-way**: `available`, `unavailable` (a legal conclusion) and `unknown` (an absence of analysis). 🔒 **Rendering it as two states lets an unanalysed country look decided.** Same for `consent_request`: `permitted` / `prohibited` / `unknown` |
| S2 | a country with no row at all — distinct again from `unknown` |
| S8 | `researched_at` beside `confirmed_at`: when *we* read the sources versus when a lawyer confirmed |

#### Can do
- Read. Open the statute, authority, traps and source note. See which clients
  and listings a row is currently refusing.

#### Cannot do
- 🔴 **No confirming a row from the cockpit. Ever.** The whole value of
  `confirmed_by` is that it names a lawyer who said so. A button makes it name
  whoever clicked. `campaign-evaluation-design.md` §5.2: *"a system that would
  let us fake a lawyer's confirmation in order to test itself is a system whose
  confirmations mean nothing"* — and the cost of that, accepted deliberately, is
  that there will be no rehearsal and the first true end-to-end run is the first
  real one.
- **No editing `requires`.** A typed requirement changes what the gate demands
  of every property in a jurisdiction. It is a migration with a review, not a
  form.
- **No creating a region row.** A region code is the jurisdiction's own,
  upper-case, no spaces, **never a name**: "Cataluña", "Catalunya" and
  "Catalonia" are three rows for one place. And a null region is **the national
  row**, not an empty one — null and `''` would be two rows meaning the same
  thing.

#### Reads
`jurisdiction_policy` (all columns) and `advertising_policy` (all columns),
read-only, plus a count of what each row is currently refusing.

#### Legally load-bearing
- 🔴 **`confirmed_at` and `confirmed_by` are null or non-null together**, by
  CHECK constraint — *"a date with no name is not a confirmation, it is a
  date."* The screen never shows one without the other.
- 🔴 **`consent_expiry_months` null means no expiry is known, not that consent is
  eternal.** The gate treats an unconfirmed row as permitting nothing, so null is
  never relied on — and the screen must not render it as "no expiry".
- 🔴 **One sentence from a lawyer on Portugal's `advertising_policy` row unblocks
  Portugal entirely.** It is question 4 of the 04 batch. The screen should make
  that visible as one row with a blank in it, because it is the single
  highest-leverage row in the database.
- `platform_blocked` is a platform fact, not law, and is not negotiable either.
  Shown as its own thing, never merged into the legal columns.

---

## 2.10 The Overview — the landing

*Added 19 September 2026 (D4, D2′). Route `/`. No `/p/` route — it names every
client's money. Refuses the phone (§1.13).*

### The question
**Q28 — is the business growing, and what did the system do to earn it?**

Read deliberately, not triaged. It is the landing because the operator chose to
see first how the business stands (D2′); what needs doing is one click away,
through the chrome's count.

### What products like this actually carry
Researched on Mobbin on 19 Sep. None of them carries the template set of four
KPI cards, an area chart, a donut and a table.

| Product | What it carries | Taken |
|---|---|---|
| [Stripe Billing overview](https://mobbin.com/screens/80db4fcd-360a-4ee9-8be0-f69f7edf83f8) | MRR; MRR growth **as a composition** (new, expansion, churn); an **"Updated 10 Dec, 00:00" stamp under every chart** | Recurring revenue's movement as a composition; a freshness stamp per panel |
| [Revolut Analytics](https://mobbin.com/screens/44300a52-bfa9-4da4-b51b-a75431958233), [period filter](https://mobbin.com/screens/0a54e1f7-1c37-4190-810a-2f39d0731bf4) | Hero value with a drill chevron; **the line solid to today and dashed after**; a Weekly / Monthly / Yearly control | Time that has not happened is drawn differently from a zero; the period control |
| [Mercury home](https://mobbin.com/screens/8fd5635e-a61d-4d11-b4c9-c1963ddd0da1) | Money in and out per month with a **month stepper**; an empty month says **"No incoming transfers"** in words | Empty is a sentence, not a drawn zero; the month stepper |
| [Copilot Money](https://mobbin.com/screens/1bfa784d-99eb-4850-88e2-4064d4d06452) | **"Next two weeks"** of scheduled items; an endpoint dot marking *now* | Recurring revenue already scheduled by contract dates; the *now* dot |
| [Origin](https://mobbin.com/screens/6dc04a92-bb71-4e7c-8b51-053c20f536e9) | **A month calendar, each day cell holding its amount**, with an en dash for empty days | The day view as a calendar, not thirty thin bars |
| [Zendesk bot insights](https://mobbin.com/screens/1e6a8cfc-8ca3-4e40-ad05-ca3b14da22b7), [Chatbase](https://mobbin.com/screens/ba0c1d2b-7d87-47a2-96e6-6e26264008b7) | AI agents report **automated resolutions against transferred to an agent**; Zendesk shows *"–"* and *"No data available"* rather than 0 | Handled by the system against handed to a human; unknown is not zero |
| [Kajabi payments](https://mobbin.com/screens/8a8ebd2b-dc7f-4317-8a57-5c9f0d8c5ea5), [beehiiv](https://mobbin.com/screens/09ca6292-ce2b-40ee-8844-d579b6a67ccd) | **Anti-patterns:** $0.00 above a flat line that reads as measured data; *"0 — 0%"* change from a zero base | 🔒 **Never** draw a line for a series that has never existed. 🔒 **Never** show a percentage change from a zero base |

### Structure
1. 🔒 **Recurring and setup revenue are separate series and never summed into
   one headline.** One is a rate and the other an event; a blended total hides
   the difference in how they behave.
2. **Recurring:**
   - contracted monthly revenue now;
   - this month's movement — new, expansion, contraction, ended;
   - what is already scheduled by contract dates (Copilot's "next two weeks").
   - **Month is its native period.** At week or day it is a **step line**
     that changes only on the days a contract starts or ends — never bars.
3. **Setup:**
   - payments received;
   - contracted but not yet received, beside them;
   - by month, week or day (the day view is a calendar).
4. **What the system did**, over the same period, per automation — the table
   under *Reads*.
5. **Firsts** — a dated register (see *The empty state*).
6. **Clients and their terms, in onboarding order.** 🔒 **Never sorted by
   fee.** §1.1 forbids ranking clients, and a revenue-sorted list is the
   scoreboard §2.2 refuses.

### The empty state is the primary design
Zero clients under contract and zero revenue is the real state for months, so
the page is designed from empty outward, not with a fallback added at the end.

- **One sentence at the top, in S2's words:** *"No contract has been recorded.
  Ryvo has no recorded revenue yet — this is the beginning, not a fault."*
  Failures are per panel (S4), with the thrown sentence, so *nothing has
  happened* and *something failed* can never share the headline.
- **Charts draw their frame, never a false zero.** The time axis runs from
  the ledger's first record (or today) to now, with the future dashed. **No
  line exists until the first contract does.** Inside the empty frame is a
  sentence: *"The line starts when the first contract is recorded."*
- **Unknown, not zero.** Every client without recorded terms is listed, each
  with *Record terms*. The page states its own dependency on a person.
- **Firsts** — each row is *Never* (S2) until it happens, then its date and a
  link to the record:
  - first client;
  - first lead handled;
  - first system reply;
  - first introductory meeting booked;
  - first contract;
  - first setup payment;
  - first full month of recurring revenue;
  - first campaign send and first review request — both gated by Meta, so
    each shows S5 with its waiting-room item and age.

  This is what makes a zero-revenue page worth opening: the business's own
  history, honestly incomplete.
- **What is holding it:** the gated automations link to their waiting-room
  items with their ages. The page explains why it is empty **without inventing
  a pipeline** that the system does not hold.

### States

| State | Where | Must say |
|---|---|---|
| **S2** | whole page | 🔴 **The primary state.** *"No contract has been recorded…"*, in different words from S1 |
| **S1** | per panel | *"No setup payment in September"* — the window named |
| **S3** | per client | 🔴 **A client without recorded terms is *unknown*, not €0.** *"1 client has no contract terms recorded — revenue for it is not zero, it is not known."* |
| **S3** | per client | 🔴 **A conflict:** a client whose `status` is `churned` or `paused` while its contract has no end date. Shown as unresolved, **never counted as revenue** |
| **S3** | operations | Missing `metrics_daily` days, named and never interpolated. `reactivations` never reaches the screen — the writer hard-codes it to 0 (`infra/scripts/metrics_daily.py`), a not-checked wearing a resting sentence |
| **S3** | per client | A client whose `rehearsal` is still null — created between migrations 0037 and 0038 — is listed by name as **undeclared**, and is counted in neither the business's numbers nor the rehearsals' |
| **S4** | per panel | The thrown sentence, in place; the other panels still render |
| **S5** | per automation | 02 and 05 sent nothing **because they are gated** — *"cannot send: waiting on Meta's verification"*, linked to the waiting room. Never rendered as zero activity |
| **S8** | per panel | *"derived 03:20 UTC (04:20 Lisbon in summer, 03:20 in winter)"* on panels from `metrics_daily`; *"live"* on panels read from `messages` and `events` |
| **S9** | contracts | Terms are append-only: a correction is a new record superseding the old, with its own author |
| **S10** | footer | No forecast beyond contract dates, no blended total, no ranking, **no *time saved*** (below) |

### Rehearsal clients are not the business 🔒 — added 19 Sep 2026

Every client row today is a rehearsal: `ZZ TEST — Cascais Demo` and
`Ryvo Test Client`. **Every figure, first and count on this page reads
`clients.rehearsal = false` only** — revenue, firsts, what the system did, and
the client list. A rehearsal row is never counted and then explained. *"A
caption explaining a wrong number is worse than a right number"* — the
operator, 19 Sep.

- The marker is `clients.rehearsal`: **no default**, declared per row, and
  written by migrations **0037** (add it, classify the existing rows, refuse
  anything unaccounted for) and **0038** (prove every row is declared, then
  make it NOT NULL). Onboarding asks the question as a required choice with
  nothing pre-selected.
- **So today, the honest page says there are no clients, no leads and no
  replies** — because there are none for the business. That is the S2 page,
  and it is correct.
- **Rehearsals are kept apart, not hidden.** One separate, clearly scoped
  section — *"Rehearsals — not counted above"* — shows how many rehearsal
  clients there are and what the system did for them. It is a right number
  about a different scope, never a correction to a number above it. It proves
  the machinery runs while the business number is honestly zero.

### Can do
- Record contract terms.
- Record a contract's end.
- Record a setup payment received.
- Navigate.

Each recording is attributed — who recorded it and when (§1.10). When a figure
comes from a signed contract, the record names the contract, not the operator's
memory of it.

### Cannot do
- **Edit or delete a history row.** Supersede it.
- **Issue, or claim to have issued, an invoice.** The legal record of revenue
  is the AT-certified invoicing software (below).
- **Compute VAT.** Every amount is net of VAT, and every input and figure says
  so.
- **Project revenue** beyond what contract dates already hold.
- **Show *time saved*.** Withheld, S10 — decided 19 Sep 2026:
  - nothing measures it;
  - it would be an assumed minutes-per-reply multiplied by a count, which is a
    number computed as though it were a fact about the world (§5j);
  - `ryvo-operations-and-commercial-reference.md` already says *never quote
    hours or an implied hourly rate*.

  The measured substitutes below say the same thing truthfully.

### Reads

**Money**

| Figure | Source |
|---|---|
| Recurring, any month | 🔒 the sum over the `client_contracts` periods covering that month — **never from `clients.status`**. Recomputing "who is active" would rewrite past months every time a client left |
| Setup received | `client_payments` |
| Setup outstanding | `client_contracts.setup_fee_eur` minus the payments recorded against it |

**What the system did** — measured, never estimated:

| Number | Source | Note |
|---|---|---|
| Leads received | `events` `lead.created` | |
| **Replies sent by the system** | `messages.origin = 'ai'` | ⚠️ **Not** `metrics_daily.messages_sent`, which counts every outbound row, including handoff, system and human messages |
| **Handed to a human** | `events` `lead.escalated` | Beside the line above: handled by the system against handed over |
| Replies by a person | `messages.origin = 'human'` | |
| **Introductory meetings booked** | `events` `viewing.booked` | The outcome the agency pays for. 🔴 **Never "viewings"** — the Concierge books an introductory meeting with one of the agency's people, not a property visit (improvements §3.15; the Clients rule above). The event and column names are wrong; the screen says the true thing regardless. *Corrected 19 Sep 2026 — the first draft of this section said "Viewings booked".* |
| **Median time to first reply** | per lead, the first inbound message → the first outbound after it | Measured, so the pitch's *"roughly six seconds"* becomes a fact or is corrected by one |
| Per automation: live, or gated and why | `client_automations`; the gate's refusals | 02 and 05 show S5, not zeros |

Day history per client is in the client's local day, from `metrics_daily`
(derived nightly at 03:20 UTC (04:20 Lisbon in summer, 03:20 in winter)) — except where it is lossy, as noted.

### Writes — a proposal, not a migration

Nothing here is applied until the operator says yes. **No write to production
without asking.**

**`client_contracts` — append-only:**

| Column | Meaning |
|---|---|
| `client_id` | the client |
| `starts_on` | when billing starts |
| `ends_on` | null until the contract ends |
| `monthly_fee_eur` | net of VAT |
| `setup_fee_eur` | net of VAT |
| `setup_terms` | the instalment plan |
| `automations` | what the contract covers |
| `recorded_by`, `recorded_at` | who entered it, and when |
| `supersedes` | the record a correction replaces |

**`client_payments`:** `client_id`, `amount_eur` (net), `received_on`,
`recorded_by`, `invoice_ref` (nullable — filled once invoicing is read, below).

**`clients.monthly_fee_eur` is dropped**, following the 0032/0036 pattern: prove
it empty, then drop it alone. Nothing writes it and nothing reads it (the
onboarding insert never sets it), and two sources for one fee would disagree.

**What a person must enter, and when — nothing else:**

| When | What |
|---|---|
| A contract is signed | the client, start date, monthly fee, setup fee and its instalments, and the automations covered — once, about a minute |
| Terms change | a new record superseding the old one |
| A contract ends | the end date |
| Setup money arrives | the amount and the date, per instalment |

**Monthly revenue is never logged.** Every silent dependency on a person is
made visible instead:
- a forgotten payment stays on the page as *outstanding*;
- a forgotten end date shows as a *conflict* with the client's status;
- forgotten terms show as *unknown*, never as €0;
- *net of VAT* is written at the field.

### Invoicing — the tool is Keyinvoice (decided 19 Sep 2026)

🔒 **The page is complete without invoicing.** Nothing in its structure,
states or empty state depends on an invoicing integration existing, or on
which answer Keyinvoice gives. An integration is an **upgrade to a page that
already works** — it adds *invoiced* and *received* beside *contracted* and
replaces a manual entry — never a dependency. If phase 2 never happens, phase 1
is still the whole page.

**Phase 1 (now):** contracts and payments are entered by hand, with every gap
visible as above.

**Phase 2:** read invoices and receipts from **Keyinvoice** to replace manual
payment entry, and show **contracted, invoiced and received together** — the
review reconciliation's three-counts-together shape, where disagreement is
displayed rather than investigated as a defect.

**What is known about its API**, from `keyinvoice.com/api.php` as quoted in
search results — the page itself returns 403 to an automated fetch, and
context7 does not cover it:
- a free **SOAP** web service at `login.keyinvoice.com/API3_ws.php?wsdl`;
- **5,000 calls a day**;
- **method documentation only inside an account** (Configurações → API
  KEYINVOICE);
- a `getSAFTfile` method, visible in the documentation's URLs.

**Unverified, and needed before phase 2 is designed:** whether it can **list
documents and receipts by date**. That needs an account login, which the
operator holds. **The fallback is the monthly SAF-T (PT) file** — the legally
complete record, which the business must produce by the 5th of each month
anyway.

**Blocked upstream:** who invoices depends on the legal entity question
(`ryvo-operations-and-commercial-reference.md` §5). Phase 2 waits for it.

### Legally load-bearing
- 🔴 **The figures are contracted, not invoiced.** The page says so, and it
  never presents its own number as the record of revenue. That record is the
  AT-certified invoicing software, by law above €5,000 turnover.
- **Amounts are net of VAT.** Spanish B2B clients are reverse-charged; that
  lives in the invoice, not here.
- **Operator level only.** Client money never appears under `/p/`, and never
  beside another client's contents (§1.1). Whether a client's own landing
  (`/c/<client>/`) shows its own terms is not decided here.


---

## 2.11 Two businesses, and what they cost — added 19 Sep 2026 (D5)

*Design: The Month v3, `claude.ai/artifact/LAxEUFaC95X1pe3H77sYeD`.*

### The frame
- **Sidebar sections, no switch:**
  - The Month and Today at the top — the company's;
  - *Automations* — the client switcher, and everything beneath a client;
  - *Web* — one item, *Web clients*, with no client level;
  - *Shared* — Costs, Expiries, Waiting room, Compliance watch, Onboarding.
- **Today spans both businesses.** Its groups are defined by kind of clock, not by
  business. A web domain about to lapse is group 4, and a web client owing
  content is group 5. Groups 1 and 2 are automation-only by nature.

### The Month, in two halves
- 🔒 **The sums are done on the page:**
  - recurring revenue across both businesses, with its composition;
  - one-off revenue, never added to recurring;
  - costs, with how much of them is not yet checked;
  - recurring revenue minus costs.
- 🔒 **The two halves have identical slots in identical order** — recurring, the
  year, clients, costs, what the business leaves, one-off — so a full half and
  an empty one read as two true states, not as a page half-rendered.
- **The automation half is not blank today.** It has real running costs and no
  revenue, and says so: *the cost of building it — real, expected, and not a
  fault.* The approved empty-state panels (what the system did, what is
  holding it, Firsts) sit beneath the halves.

### A month has three states — and the net waits for the month to close 🔒
*Added 19 Sep 2026.* The first days of every month are a permanent state, not a
hypothetical one, and the stale-record failure lives in them:

| State | Revenue | Costs | Net (recurring minus costs) |
|---|---|---|---|
| **In progress** (day 3 of 31) | the month's contracted recurring | *so far*: fixed costs for the month, plus usage for the days measured, with a day track | 🔒 **withheld** — *"When October closes"*, with the day track. Beneath it: **the last closed month's net, dated and with its check state** |
| **Closed, not checked** | the month's | the month's; usage marked *computed, not checked* | shown, marked *includes €X computed, not checked* (grey) |
| **Closed and checked** | the month's | the month's, with the invoice totals entered | shown, *checked against the invoices* (`--through`) |

- 🔒 **A net is never computed for a month in progress.** It would compare a whole
  month of revenue with part of a month of cost: a number that looks current and
  is not.
- 🔒 **Last month's costs never stand in for this month's.**
- **The one stated exception:** the web half's *what it leaves* is complete from
  day one, because web clients have no usage costs. The page says why, rather
  than letting it look inconsistent.
- **Invoices are always checked for the last closed month**, because they
  arrive after it.
- **Samples are fictional by rule:** a design never puts a sample amount beside
  a real client's name.
- **The page heading is *Two businesses, one company*** (the operator's
  sentence); *The Month* is the page's name in the sidebar.

### Costs — at their own level, never apportioned
🔒 **A cost belongs to a client, to one business, or to the company, and is shown
at that level only.**
- **Per client:** the figure is what the client brings in, minus what it alone
  costs.
- **Shared costs** appear once, where they belong.
- **Why no apportioning:** infrastructure costs about the same with one client
  or five. Apportioning would be arithmetic dressed as insight — a precise-looking
  number resting on a split nobody chose. It would also move every client's
  figure whenever someone new signs. *(The operator's words: total cost against
  total revenue, per-client variable costs only where they are genuinely
  per-client, nothing apportioned.)*

**How each cost is known — and what the page says about it:**

| Kind | Examples | Source | What a person enters | State shown |
|---|---|---|---|---|
| **Fixed** | Hetzner, Supabase, a domain, the accountant | a recurring-cost record: amount, cadence, scope, next renewal | **once**, and again only when the price changes or it ends | *fixed*. A renewal inside 30 days is `--clock` |
| **Computed** | WhatsApp per message; the model per reply | Twilio's `price`/`price_unit`, filled in after sending and read back per message (confirmed via context7); `automation_runs.payload.input_tokens`/`output_tokens` × a recorded per-model price | the per-model price, when the provider changes it | *computed · not checked* — grey, because uncertainty is never coloured |
| **Checked** | the same two, once the invoice arrives | **one number: the invoice total** | ~5 seconds, per variable supplier per month | *checked against the invoice* — `--through` |
| **One-off** | a plugin, a freelancer on a web project | recorded only when tied to a client or a project | when it happens | only what was recorded — and the page says so |

🔒 **The page never looks more complete than it is.** It states how much of the
month's cost is computed and not yet checked. It never shows a computed figure as a
checked one. It says in words that it is not the books — the accountant and the
invoicing software hold every expense.

**Known gaps, unverified or not built:**
- the Concierge stores one call's token usage when a language or name retry
  makes a second call, so model cost is under-counted today;
- whether Twilio's WhatsApp `price` includes Meta's fee is unconfirmed — check
  in the console;
- USD-billed suppliers need a dated conversion rate, which is itself a computed
  figure and is labelled as one.

**Rehearsal clients** have real usage cost and no revenue. It is shown as part of
the cost of building, and never billed against a client.

### Writes — a proposal, not a migration
- `web_clients`;
- `web_contracts` (append-only, the same shape as `client_contracts`);
- `costs` (scope: `client` · `web_client` · `automations` · `web` · `company`;
  amount; cadence; currency; renews_on; ended_on);
- `cost_checks` (supplier, month, invoice total, checked_by).

If a web client ever buys an automation, a shared billing party links the two
rows when it first happens — never a merged table.

### After a save, the page is already current 🔒
*Added 21 Sep 2026, operator.* After a contract, a payment or a cost is saved,
**the page updates at once, with no manual reload.** Every sum, state and panel
that the new row touches is re-read from the database: the halves, the year,
Firsts, and outstanding setup. A save that succeeded while the page still showed
the old figures would read as a save that failed, or would invite a second
entry of the same payment. The re-read is of the database, never a local
patch of the old numbers, so what the page shows after a save is what anyone
reloading would see. If the save fails, the page says so in place and keeps
the form's contents. Nothing is lost, and nothing is shown as saved.

### Reads — named columns, from the view, and never three dead ones 🔒
Added 21 September 2026, after `0050`.

- **Contracts are read from `client_contracts_uncorrected`, never from the
  table.** A superseded row still carries its period and its fee, so summing
  the table counts every correction twice.
- **Select named columns, never `*`.** The Month reads exactly: `id`,
  `automation_client_id`, `web_client_id`, `monthly_eur`, `setup_eur`,
  `setup_terms`, `starts_on`, `ends_on`, `automations`, `signed_by`,
  `recorded_by`, `recorded_at`, `created_at`, `supersedes_id`.
- **Never read `superseded_at`, `superseded_by` or `updated_at`.** Since
  `0050` a correction is recorded only by the new row's `supersedes_id`:
  - `superseded_at` and `superseded_by` are always null, enforced by
    `contract_is_never_stamped`;
  - `updated_at` can never change, because no UPDATE survives.
  All three are owed a drop, and the drop changes the view's shape. A page
  that names its columns survives that drop, and one using `*` or reading a
  dead column breaks.
  The drop is not written yet. When it is, it is a one-migration change
  *because* nothing reads them.
- **Nothing on the page may infer a correction from a stamp.** "This contract
  was corrected" is true exactly when another row's `supersedes_id` names it.
---

# §3. The checklist a design is measured against

Twelve items — ten from the first writing, and two added on 19 Sep 2026 with
§0.5 and §1.14. If a drawn screen cannot answer all twelve, it has dropped a
constraint.

1. **Which state is this?** All ten of §1.6 answerable from the screen.
2. **Which zero is this?** Nothing looked at / nothing qualified / query failed.
3. **Where is the denominator?** Every count.
4. **Where is the absolute time?** Every relative one.
5. **Who said this, and when?** Every human assertion, with the declarer and the
   recorder kept apart.
6. **What did this screen not check?** `notCheckedFor`, unreachable sources,
   unavailable columns — named, never blank.
7. **Does one failed read take the screen down?** It must not.
8. **Does any control act on more than one client?** It must not.
9. **Does any text claim we acted on the outside world?** It must not.
10. **Is every absence stated?** S10 is on the page, not discovered as a missing
    button.
11. **Does anything move for a reason other than a change?** It must not — and
    when the data is stale, the clocks must be still (§1.14).
12. **Is anything drawn for a series that has never existed?** A line, a bar, a
    zero or a percentage change from zero — none of these (§2.10). S2 is a
    sentence.

---

# §4. What this brief does not cover

- **The twenty-seven client-level screens.** `cockpit-mindmap.md` §6 and §7 hold
  their states and absences; they need this treatment next, and the four with
  presented mode need it first.
- **The contact record and the send history** (Q13, Q14) — the sharpest gap, and
  a first-class screen rather than a filter. It is client-level and deserves its
  own brief.
- **Per-screen layout, hierarchy, density and components** for any screen
  other than Today and the Overview. The direction — canvas, colour, type,
  depth, the row, the frame, motion — **is** covered, in §0.5 and §1.14.
- **Build order.** Every operator-level surface is new; sequencing wants a
  conversation about what a first real client's first week looks like.
- **Whether the Shell is rewritten or replaced.** §1.5 says its structure does
  not survive; what replaces it is a design question.
- **The waiting room's and compliance watch's tables.** Both need a migration.
  Shape follows the design, not the other way round.
