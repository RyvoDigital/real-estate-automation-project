# Calibration session — what we need from an agency, and why

**Purpose:** to find out whether Ryvo's listing-matching actually agrees with a
working agent. Until this happens, matching is untested against reality.
**Audience:** an estate agency principal or senior agent. Written to be sent as
it is.
**Time needed from them:** about 45 minutes, once.

---

## Why we are asking rather than testing it ourselves

We can prove the software does what we told it to. We cannot prove we told it
the right thing.

Every threshold in the matching engine — how far over budget still counts, which
neighbouring areas a buyer will accept, how many bedrooms is close enough — is
currently a number we chose. They are guesses, and we would rather say so than
present them as findings. Feeding the system a thousand invented leads would
prove the code runs; it would not prove the matching is right, because we would
be inventing both the leads and the correct answers.

**Half an hour with someone who does this for a living settles it.** That is the
whole reason for this session.

---

## What we are asking for

### 1. Twenty real leads — the messier the better

From your CRM, your spreadsheet, your WhatsApp, wherever they live. What matters
is that they are **real people who really enquired**, including:

- some who were vague ("something around a million, near the coast")
- some who changed their minds
- some who never bought
- at least a few where you remember the conversation

**Export it however it comes out.** CSV, Excel, a Google Contacts export, even a
screenshot of a spreadsheet. We do not need it reformatted — restructuring a
spreadsheet before you can start is exactly the kind of thing that stops this
being worth doing.

### 2. Three real listings, currently or recently on your books

One that is easy to place, one that is hard to place, and one that sold quickly.
Reference, type, area, price, bedrooms, size, and the features you would actually
mention.

### 3. The conversations, if you have them

**This is the part that matters most, and the part nobody else asks for.**

A CRM matches on what someone typed into a form. If a buyer never filled in
"bedrooms", a CRM can never match on bedrooms. What we do differently is read
what the buyer actually *said*:

> *"We'd want somewhere the kids can walk to school."*
> *"My wife works in Lisbon three days a week."*
> *"We're not in a rush but we'd move for the right thing."*

None of that is a field. All of it decides whether a property is right.

So: **any WhatsApp threads, emails or notes** from those twenty leads, in
whatever form. Exported chats, forwarded emails, pasted notes — all fine.

If you do not have them, say so. It changes what the system can honestly do for
you, and we would rather tell you that now than discover it later.

### 4. Forty-five minutes of your judgement

The actual session. We show you a listing and a lead, and you tell us:

- **would you send this to this person?** yes / no / maybe
- **why**, in your words

We are not asking you to score anything or fill in a form. We are asking you to
do the thing you already do, out loud, twenty or so times.

---

## The specific questions we need answered

These are the numbers we are currently guessing. Each one is a judgement call
that differs by agency, which is why they live in per-client configuration
rather than in our code.

| What we need to know | Why it matters | Our current guess |
|---|---|---|
| A buyer says €2M. Would you send them a €2.1M property? €2.2M? Where do you stop? | Decides whether a slightly-over listing is a match or noise | 3% over normally |
| Same buyer, but they said *"we could stretch for the right place"*. Now where do you stop? | This is the single case our whole approach rests on | 15% over |
| Which areas do your buyers treat as interchangeable? Cascais and Estoril? Estoril and São João? | A buyer who said one will often take the other, and only you know which | Cascais ↔ Estoril only |
| A buyer asks for 4 bedrooms. Would you send a good 3-bed? | Decides whether bedroom counts are a floor or a preference | never |
| *"We couldn't live without a garden"* versus *"it'd be nice if it faced south"* — is that distinction real to you? | It is the engine's highest-value job. If you do not think that way, we are solving the wrong problem | assumed real |
| How many listings a week is useful before it becomes noise? | Frequency caps — too many and your database stops reading them | not set |
| Would you rather see a possible match you disagree with, or miss one? | Sets how tight the matching runs | not set |

---

## What you get out of it

- Your contact list imported, deduplicated, and a plain statement of what it can
  and cannot support. If it is names and phone numbers only, we will say that
  rather than pretend it can do more.
- Matching tuned to your judgement rather than our assumptions.
- A written record of the calls you made, so a disagreement later is a
  conversation about a decision rather than about the software.

---

## What we will tell you honestly

- **If your data cannot support matching, we will say so** rather than shipping
  something that looks like it works. A list with no budgets and no
  conversations can be reactivated; it cannot be matched.
- **If your judgement disagrees with the system**, the system is wrong and we
  change it.
- **We will not contact any of your leads** as part of this. Nothing in this
  session sends a message to anybody.

---

## Notes for whoever runs the session (internal)

- Record the answers into `client_automations.config` under the `matching` key,
  per client. Nothing here belongs in code (§4.6).
- Capture the *disagreements* specifically. A match the agent rejects is worth
  more than five they accept — it is the only evidence that the thresholds are
  too loose, and §1 of the handoff says too loose is the failure that loses
  their trust permanently.
- Ask for the conversations before the session, not during. If they arrive at
  all, they take time to export.
- The twenty-leads figure comes from §4.6. It is enough to disagree about and
  small enough to review in one sitting. Do not scale it up to feel rigorous:
  the value is in the agent talking, not in the sample size.
- **Do not demo the matcher before this session.** Extraction is unvalidated
  (see the F3 report), and a bad match shown to an agent before they have
  calibrated it costs their trust at the exact moment we are asking for their
  judgement.
