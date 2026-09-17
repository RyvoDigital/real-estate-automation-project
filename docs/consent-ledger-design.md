# The consent ledger, and undoing what the importer wrote

**Design · 17 September 2026 · nothing in this document has been built**

> Automation 02 §5.2 calls for an append-only consent ledger. This document is
> the step before that: `leads.consent_status` and `leads.consent_at` are
> written today by code that is live, and one of those writes is false. The
> ledger cannot be added next to that. It has to replace it.

---

# 1. The defect, stated exactly

`cockpit/src/lib/import/store.ts:182`:

```ts
consent_status: c.consent_status,
consent_at: c.consent_status === 'opt_in' ? new Date().toISOString() : null,
```

`parseConsent` (`normalise.ts:137`) maps a spreadsheet cell — `y`, `yes`, `sim`,
`si`, `sí`, `true`, `1`, `consented`, `subscribed` — to `opt_in`. So a character
in a column an agency typed becomes, in our database, a person who consented.

Two separate faults, and the second is the worse one.

**The evidence is not evidence.** Meta places the burden of proof on the sender
and wants the timestamp, the source and the exact wording the person saw. GDPR
wants consent specific and informed as to channel. A cell reading `sim` is the
agency's *assertion* that consent exists somewhere. It is not the consent, and
it does not say what the person was shown or when.

**The timestamp is affirmatively wrong.** `new Date()` is the moment of import.
The field does not mean "when we learned of this"; in every reading a regulator
would give it, `consent_at` means when the person consented. We are writing
today's date into a field that asserts an act that happened years ago, if it
happened. A false record in a regulatory field is worse than an absent one,
because an absent one cannot be relied upon by mistake.

**Why it matters now rather than at send time.** Nothing outbound exists yet, so
no message has gone out on the strength of these rows. That is luck, not
design. §3.4 of the improvements file has recorded these two fields as *"never
tested, and legally material"* since before Automation 02 was specified, and
Automation 02's whole premise is that Segment B — documented consent — is the
only segment contactable with confidence anywhere. This code manufactures
Segment B out of Segment D.

---

# 2. Two clocks, which is the root of it

The schema has one timestamp where the world has two:

- **`occurred_at`** — when the act happened. The person ticked the box, said
  yes, replied SAIR.
- **`recorded_at`** — when we came to know it. The import ran, the reply
  arrived, the operator typed it in.

Every consent system that gets this wrong gets it wrong here. `consent_at` was
built as one field and is being written with the second clock while being read
as the first. The ledger carries both, always, and never derives one from the
other.

---

# 3. `consent_events` — the ledger

One row per event. Never updated, never deleted.

| Column | Meaning |
|---|---|
| `id` | uuid |
| `client_id` | the agency. Consent is to a controller, never global |
| `phone_e164` | **the identity.** Normalised, no `whatsapp:` prefix |
| `lead_id` | convenience link only, nullable, `on delete set null` |
| `kind` | `claimed` · `declared` · `consent_given` · `consent_withdrawn` · `objection` · `quarantined` · `erasure` |
| `occurred_at` | when the act happened. **Nullable** — see §3.3 |
| `recorded_at` | when we learned it. Defaults to `now()` |
| `segment` | `A`–`E` when the event declares one, else null |
| `source` | `import_declaration` · `agency_attestation` · `whatsapp_reply` · `web_form` · `operator` · `meta_block` |
| `wording` | the exact text shown to the person, or the exact cell asserted. Null means **not retained**, and is never filled in by guesswork |
| `evidence` | jsonb: batch id, line, message id, template id |
| `declared_by` | the human who declared it |
| `jurisdiction` | country resolved from the prefix at the time of the event |
| `note` | free text |

## 3.1 The identity is the phone, not the lead row

A lead row can be deleted by a revert, merged by dedupe, or recreated by the
next import. An objection must survive all three. Keying the ledger on
`(client_id, phone_e164)` is what makes "permanent and across campaigns"
(Enquadramento §7) true structurally rather than by care.

This also settles an interaction with GDPR erasure (§3.3): erasing a lead must
not erase the objection, or the person is re-imported and contacted again. The
standard answer is that a suppression record is retained precisely in order to
honour the objection. **That specific point goes to Margarida** — it is the one
place where erasure and suppression pull in opposite directions.

## 3.2 `occurred_at` is nullable, and that is the point

The obvious schema makes `occurred_at` `not null` — every event happened at some
moment, so how could it be unknown?

Because for the rows we are about to correct, it *is* unknown, and the only
timestamp that survives is `consent_at = 2026-09-08 12:25:37`, which by the
two-clock rule of §2 is a `recorded_at`: it says when the claim entered our
system and nothing whatever about when any act occurred. A `not null` column
would force that value into `occurred_at`, and the resulting row would assert —
in the ledger, the artefact built to be read by a regulator — that a person
consented at 12:25:37 on a Tuesday in September because that is when we imported
a spreadsheet.

That is the defect being fixed, reappearing inside the fix. So:

> **`occurred_at` is null when the time of the act is not known, and is never
> filled in with a plausible substitute.** Same rule as `wording = null`, and
> for the same reason: an invented value in a regulatory record is worse than a
> recorded gap, because the gap is honest and can be closed later.

A null here is readable: *we know this was claimed, we do not know when it
happened*. Every consumer — the view, the gate, the segmentation screen — must
handle it, and handling it means refusing, not guessing.

## 3.3 Append-only, enforced rather than intended

A trigger that raises on `UPDATE` and `DELETE`, plus `revoke update, delete` from
`service_role`. Both, because 0002 exists as a monument to assuming a grant.
And the migration ends with the same verify block every migration since 0008
carries — a table without DML grants fails at the REST layer with 42501, not at
migration time.

---

# 4. How `consent_status` stops being stored

## 4.1 What writes it today

| Writer | What it writes | Live? |
|---|---|---|
| `store.ts:182` | `opt_in` / `opt_out` / `unknown` + a false `consent_at` | yes, the defect |
| `ryvoInboundConc01.json:343` | `consent_status: 'unknown'` on first contact | **yes, in production** |

The second one is why this cannot be a single migration that drops the column.
Dropping it breaks the live Concierge insert, and fixing the workflow means an
n8n `import` — which nulls `activeVersionId` and leaves a 404 window on the
inbound webhook until `publish`. That is a risk worth taking for a reason, and
"tidying a column" is not one.

## 4.2 The sequence that never leaves the live system broken

1. **The column stops being authoritative today.** The ledger lands, the view
   lands, and the cockpit reads the view.
2. **It stops being written at the next ordinary deploy.** The workflow's
   `consent_status: 'unknown'` is a no-op under the new model — absence of a
   ledger row already means undetermined — so removing it can wait for a deploy
   that was happening anyway.
3. **It is dropped after that,** in its own migration, once nothing reads or
   writes it.

Derivation is immediate. Removal is unhurried. Nothing forces an emergency
deploy of the one workflow that is carrying real conversations.

## 4.3 The view reports facts. It does not decide contactability

```
leads_consent(lead_id, client_id, phone_e164,
              state, segment, occurred_at, source, event_id)

state ∈ objected | consented | declared | claimed_unevidenced | undetermined
```

A contact with no events at all still appears, as `undetermined`. Absence from
the view would make "nobody has said anything" indistinguishable from "this
contact does not exist", which is §5b again and the reason rule 5 is written
down rather than left as a fall-through.

`state` resolves in this order, and the order is the design:

| # | Rule | `state` |
|---|---|---|
| 1 | **Any `objection` event exists** | `objected` |
| 2 | Latest `consent_given` with no later `consent_withdrawn` | `consented` |
| 3 | Latest un-revoked `declared` | `declared` (+ `segment`) |
| 4 | An un-revoked `claimed` or `quarantined` event exists | `claimed_unevidenced` |
| 5 | Nothing was ever said | `undetermined` |

## 4.3.1 Rule 1 is the only one that ignores what comes after it

Every other rule is last-write-wins. Rule 1 is not: **an objection is permanent,
and a later `consent_given` does not overturn it.** Not expirable, not
superseded, not overridable by an operator. Someone who said stop has said stop,
and a system that lets a subsequent event quietly re-open them has produced the
one outcome that cannot be apologised for afterwards.

This is the rule most likely to be broken by a well-meaning future edit — it
looks like an inconsistency until you know why it is there — so §4.3.3 makes it
provable rather than asserted.

## 4.3.1a Segment E is derived, never declared

The five segments are A–E, and the agency declares which one a contact is in —
except E. **E is not a declaration, it is the consequence of an `objection`
event**, and it arrives from the contact rather than from the agency. Nothing in
the system should offer E as a choice on the segmentation screen: an agency
cannot put someone in E, and it must not be able to take them out of it either.

Rule 1 of the derivation is what makes that true, and `src/opt_out.js` is what
decides an objection occurred.

## 4.3.2 `claimed_unevidenced` exists so that two different facts stay different

A consent event cannot be undated: the `consent_given` check constraint in 0012
refuses one without `occurred_at`, because a consent that cannot be dated cannot
be expiry-checked, and Ireland's existing-customer route lapses twelve months
from the act. So an undated consent never enters the table, and the view can
always do its job on the rows that do.

What *does* exist is the row this ledger was built to hold: a contact the agency
asserted something about, where the assertion is not evidence — a `claimed`
event, or the `quarantined` correction of one. If that collapsed into
`undetermined` it would become indistinguishable from a contact nobody has ever
said a word about, and those are not the same fact:

> **A contact with an unevidenced claim is worth asking the agency about. A
> contact with nothing is not.** The first gets a question on the segmentation
> screen — *"your file said `sim` for this contact; do you have the record
> behind it?"* — and the second gets silence, because there is nothing to ask.

This is the empty-cell distinction from `readConsentClaim` appearing a second
time, one layer up: *said something we cannot use* and *said nothing* are
different states of the world, and a system that merges them loses the only
information that makes the next step possible.

**Both are equally not contactable.** The distinction is about what we ask a
human, never about what we send a lead — `claimed_unevidenced` is not a weaker
form of consent, it is a stronger form of nothing.

A claim carrying a later `claim_revoked` (§7.2) does **not** reach rule 4. It
falls through to `undetermined`, because the import behind it was undone and
there is no longer anything to ask the agency to confirm.

## 4.3.3 Rule 1, proved rather than asserted

`db/tests/0013_consent_view.test.sql`, run inside `begin … rollback`:

```sql
begin;
  -- a contact who objected, and then a consent event appended AFTER it
  insert into public.consent_events (client_id, phone_e164, kind, source, occurred_at) values
    (:client, '+351900000001', 'objection',     'whatsapp_reply', now() - interval '10 days'),
    (:client, '+351900000001', 'consent_given', 'web_form',       now() - interval '1 day');

  do $$ begin
    if (select state from public.leads_consent
        where phone_e164 = '+351900000001') <> 'objected' then
      raise exception 'RULE 1 BROKEN: a consent event appended after an objection changed the state';
    end if;
  end $$;
rollback;
```

Plus the neighbouring cases in the same file, because a rule proved on one input
is not proved: consent then withdrawal; a dated consent alone; a claim alone; a
claim with a later revocation; and a contact with no events at all, which must
be `undetermined` rather than absent from the view.

**Why the test is SQL in a transaction rather than a unit test.** The derivation
has exactly one definition — the view — and testing a TypeScript mirror of it
would create the second copy that lesson 15 is about, with the mirror passing
while the view drifts. And the ledger refuses `DELETE`, so a test that writes
rows can never clean up after itself; `rollback` is the only exit that leaves no
trace, which makes a transaction the only honest place to run it.

**That has a cost worth stating: this test cannot run in `npm test`,** because it
needs a real Postgres session rather than PostgREST. It is run by hand in the
SQL editor when the view changes. A check that depends on remembering is not a
control (rule 13), so the file names itself in the view's own migration header
and in `0013`'s verify block, which is the weakest form of enforcement available
and is being chosen consciously rather than by omission.

**What the view deliberately does not do is say whether a contact may be
messaged.** Contactability is a function of segment *and* jurisdiction policy
*and* suppression, and policy changes — Ireland's twelve-month expiry, Spain's
Segment C being switched off, a row added when a new country is sold into. If
the view bakes today's policy into SQL, then "one table changes and every client
is compliant the next day" (spec §6.3) stops being true. The view reports that
consent was given and when; **the gate applies the policy.** That line is where
this design will either hold up or rot.

---

# 5. The rows already written

## 5.1 Who they are — corrected 17 Sep, and the correction is the lesson

**The first version of this section identified the wrong object,** and the
operator's run of its own query proved it before anything was built. It is
written up as §5c of the engineering lessons; the short form is here because
the pass depends on it.

It said: leads joined to *committed* batches. Run against the database that
returns **no rows**, while the false record plainly exists. The batch
(`messy-contacts.csv`, 5 leads) was **reverted 106 seconds after it committed**,
and `revert.ts` retains any lead that has acquired a message or an event rather
than deleting it — correctly, since deleting it would null `messages.lead_id`
and orphan a real conversation (§6f). One lead survived the undo carrying the
false `opt_in`. A pass keyed on committed batches would have corrected nothing,
reported success, and been indistinguishable from a clean database.

> **Target the object that carries the defect, not the object that explains
> it.** The false value is on the lead. The batch is the story of how it got
> there, and stories go missing — reverted, deleted, superseded. Join to the
> batch for enrichment; never for identification.

So the population is defined on `leads` alone:

```sql
select id, client_id, phone, consent_status, consent_at,
       qualification->'imported'->>'batch_id' as batch_id,
       qualification->'imported'->>'line'     as line
from public.leads
where consent_status in ('opt_in', 'opt_out')
order by created_at;
```

Any batch metadata that happens to still exist is enrichment, fetched with a
**left** join and absent without complaint.

**How many there are is not knowable from the repository.** It needs a read-only
query against Supabase, and it has to be run before anything is written:

```sql
select b.id as batch_id, b.filename, b.committed_at,
       count(*) filter (where l.consent_status = 'opt_in')  as false_opt_in,
       count(*) filter (where l.consent_status = 'opt_out') as opt_out,
       count(*)                                             as rows_from_batch
from public.import_batches b
join public.leads l
  on l.qualification->'imported'->>'batch_id' = b.id::text
where b.status = 'committed'
group by 1, 2, 3
order by b.committed_at;
```

If it returns nothing, the backfill is a no-op — but the migration still runs,
because a zero that was never checked is not a zero.

## 5.2 Three rules for the treatment

**Do not launder.** Do not turn these into `consent_given` rows. The ledger is
the artefact shown to a regulator; writing the false claim into it in a better
font is the worst available outcome.

**Do not erase.** Append-only means the correction is recorded, not hidden. Each
affected contact gets one `quarantined` event:

| Field | Value | Why |
|---|---|---|
| `recorded_at` | the lead's `consent_at` — `2026-09-08 12:25:37` for our one row | This is the only true thing that field ever said: when the claim entered the system |
| `occurred_at` | **null** | Unknown, and §3.2 forbids substituting the plausible value |
| `source` | `import_declaration` | |
| `wording` | null where not retained (§5.3) | |
| `evidence` | `{batch_id, line, batch_status}` where the batch still exists | Enrichment. Absent without complaint |
| `note` | that the claim was recorded by an importer which could not evidence it | |

The inversion is worth naming: **the false field becomes the evidence of when
the claim was recorded.** `consent_at` was wrong as a consent timestamp and is
exactly right as a record timestamp, so the correction does not discard it — it
moves it to the clock it always belonged to.

**Keep the assertion as an assertion.** The cell said something. That is exactly
the input Fase 6 wants — the agency's own statement about origin — only
unverified. The segmentation screen can then ask the useful question: *"your
file said `sim` for this contact. Do you have the record behind it?"* The bug
becomes the first input of the declaration flow rather than something to be
ashamed of.

Only then does the column get cleared: `consent_status = 'unknown'`,
`consent_at = null`. **Quarantine event first, column second**, so a crash
between them leaves evidence rather than losing it — §3.10's shape exactly.

## 5.3 The wording is probably gone, and the ledger must say so

`import_batches.staged` is cleared on commit, by deliberate design — a second
copy of a client's contact list in a jsonb column is personal data held for no
purpose. `qualification.imported` keeps `batch_id`, `line`, `bedrooms`,
`property_type` and `notes`. **It does not keep the consent cell.**

So for batches already committed, the literal text that was read as consent is
most likely unrecoverable. The quarantine event records `wording = null`, which
is the ledger's way of saying *not retained*, and it never invents one. That is
a permanent, honest gap in the record for those contacts, and it is an argument
for the forward fix below rather than a reason to paper over it.

---

# 6. The importer, corrected

- **`parseConsent` keeps reading the column and stops producing consent.** Its
  output becomes a claim, not a state.
- **The raw cell is retained this time** — `qualification.imported.claimed_consent
  = {raw, parsed}` — so the next version of this document does not have to
  write "wording not retained" again.
- **`store.ts` writes neither `consent_status` nor `consent_at`.** Imported leads
  land `stage = 'dormant'` as they do today and are undetermined by the absence
  of a ledger row. Deny-by-default holds with no new flag to forget.
- **The preview screen stops showing consent as a fact** and shows the claim,
  with "not contactable until declared" next to it.
- **`toE164` already resolves the country for free** (`normalise.ts`), and the
  jurisdiction engine will need it on every row. Capture it at import rather
  than re-deriving it later — but that is Stage 1 work, not this fix.

## 6.1 The tests currently assert the defect

`cockpit/tests/import-plan.test.ts:141` and `:148` assert that `sim` and `sí`
produce `consent_status = 'opt_in'`. They pass today and they encode the bug.
They invert, and per §0.6 one more is added that no import path can produce a
consented state — the first invariant of Automation 02, provable before the gate
it will eventually live in exists.

---

# 7. A revert leaves the claim standing, and that is how our one row exists

Raised by the operator from the query output, and it is the part none of the
design covered.

The reverted batch created 5 leads and exactly one survived, because
`revert.ts` refuses to delete a lead that has acquired a message or an event —
deleting it would null `messages.lead_id` and leave a conversation with its
subject erased (§6f). That refusal is right and stays.

But `revertBatch` (`store.ts:231`) deletes the removable leads, updates the
batch row, and **touches no field on a retained lead.** So the false `opt_in`
outlived the operator's own instruction to undo the import that produced it.
The agency said "this should not have happened" and the regulatory field
disagreed.

## 7.1 Should revert clear `consent_status`? Yes now, no afterwards

**While the column is still authoritative** — between today and step 9 of §9 —
a revert would have to clear `consent_status` and `consent_at` on every retained
lead. In practice the importer fix all but closes this window on its own: after
§6, an import writes no consent at all, so a revert has nothing to clear. The
only exposure is a batch committed *before* the fix and reverted *after* it, and
there is exactly one such batch in existence — already reverted, and already the
subject of the quarantine pass. **So the interim clear is not written as code.**
It is folded into the quarantine pass, which finds its rows on `leads`
regardless of what any batch's status is (§5.1).

**Once the ledger is the source, revert must not clear anything.** It appends a
`claim_revoked` event: `recorded_at` = the revert's timestamp, `occurred_at` =
null, `source` = `operator`, `evidence` = `{batch_id}`. Erasing on revert would
be the laundering mistake mirrored — the same instinct to make an inconvenient
record go away — and it contradicts `revert.ts`'s own doctrine that a revert
never destroys evidence.

The two answers are consistent because append-only changes what is available. A
mutable column can only be corrected by overwriting; a ledger can be corrected
by saying what happened next.

## 7.2 The severity drops but does not reach zero

After §6, an import writes a *claim*, never consent. So a future revert leaves
behind an unverified claim rather than a false regulatory record — a real
improvement, and not sufficient on its own. The claim still feeds the
segmentation screen, which is designed to ask the agency *"your file said `sim`
for this contact — do you have the record behind it?"* **That question must not
be asked from a batch the agency explicitly undid.** Asking an agency to
confirm the origin of a contact from an import they reversed is worse than
silence: it invites them to re-affirm, in a regulatory record, a claim they have
already withdrawn, and it arrives with our name on it as though the reversal had
not registered.

So this is a requirement on the screen and not only on the ledger:

> **The segmentation screen filters out any claim carrying a later
> `claim_revoked` event, and shows no question for it.** The contact still
> appears — it is a real contact, and hiding it would be its own kind of lie —
> but it appears as undetermined with no claim attached, which is exactly what
> it is.

The view enforces the same rule when it resolves a segment, so a screen that
later forgets the filter still cannot act on a revoked claim. Two layers,
because the screen is the one that will be rewritten.

## 7.3 The rule underneath

> Anything that undoes an import must undo the ledger claims it created, by
> appending rather than deleting — and the retained-lead branch is exactly
> where that gets forgotten, because it is the exception path.

`cockpit/tests/import-revert.test.ts` exists and covers `planRevert`'s refusals.
It gains a case: a retained lead comes out of a revert with no live claim
against it.

---

# 8. Two documents become wrong the moment this lands

- `README.md:114` — *"Consent fields (`consent_status`, `consent_at`) exist on
  `leads`"* — becomes a description of a legacy column.
- `docs/automation-03-listing-match-handoff.md:229` — *"The `leads` table has
  `consent_status` and `consent_at`. Nothing outbound may bypass them."* — is
  the right instinct pointed at the wrong object once the ledger is the source.

Both are one-line corrections, and both are the kind that quietly does not get
made.

---

# 9. Order of work

1. The read-only query of §5.1, run by the operator. Nothing proceeds without
   the count.
2. `0012_consent_events.sql` — table, append-only trigger, grants, verify block.
3. `0013_leads_consent_view.sql` — the derivation of §4.3.
4. The quarantine pass, with a dry run that prints every row it would touch
   before it touches one.
5. The importer change of §6, with the tests inverted. **Done 17 Sep** — the
   three cases were shown red against the old code first, then green.
6. The cockpit reads the view.
7. Revert appends `claim_revoked` once the ledger is the source, and the
   segmentation screen filters on it (§7.2).
8. *Later, at an ordinary deploy:* the workflow stops writing the column.
9. *Later still:* the column is dropped.

Steps 1–7 touch nothing that is live on WhatsApp. Step 8 is the only one that
needs the n8n publish dance, and by then it is a tidying commit rather than a
correction.
