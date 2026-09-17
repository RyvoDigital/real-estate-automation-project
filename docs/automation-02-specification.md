# Automation 02 — Database Reactivation

**Specification v1 · 17 September 2026**

> This supersedes the outline description of Automation 02 in the operations reference. The research behind it changed what the product is. Read §1 before anything else.

---

# 1. What changed, and why

## 1.1 The original plan

Import the agency's old contact list. Send a friendly WhatsApp message to each contact in batches of 20–30 a day. Route replies to the Concierge. Record opt-outs.

**That plan cannot be built lawfully or compliantly.** Not in Spain, not reliably in Portugal, and not under Meta's own platform rules. Building it would expose the client to regulatory fines and near-certain number throttling, and — under the indemnity structure of our own service agreement — expose Ryvo.

## 1.2 The two gates that broke it

Reactivation must clear **two independent rule sets**. Satisfying one does not satisfy the other.

### Gate A — Meta's platform policy

Since the November 2024 Business Messaging Policy update, a business may message a person on WhatsApp only where the person gave their number **and** gave opt-in permission confirming they wish to receive subsequent messages from that business.

Three findings that kill the naive design:

**A past inbound message is not opt-in.** A customer sending a message to a business does not, in itself, constitute opt-in. It opens a 24-hour service window and nothing more. To send business-initiated messages outside that window a prior opt-in is required.

**Nor is a click-to-WhatsApp ad.** A tap opens a session and signals consent for that conversation, not an ongoing marketing subscription.

**The burden of proof is entirely on the sender.** Meta requires the timestamp, the source, and the exact consent wording the person saw. An opt-in that cannot be evidenced is an opt-in the business does not have.

**The sanction is graduated and lands on the client.** First offence is a quality-rating downgrade and a reset of tier progress. Repeat offences cut daily capacity to 250 unique users. Limits are managed at the business-portfolio level, so **one bad number degrades every number in the portfolio.**

### Gate B — European law

**Portugal.** Article 13.º-A of Lei n.º 41/2004 requires prior express consent for unsolicited direct-marketing communications to natural persons sent by automated systems, email, SMS, MMS "and other similar types of applications" — which covers WhatsApp. Article 13.º-B obliges the sender to maintain an updated list both of those who expressly consented and of customers who did not object. Portuguese practice recognises only two lawful bases for direct marketing — legitimate interest and explicit consent — and they are not freely interchangeable. The CNPD issued dedicated guidance in Diretriz 2022/1.

**Spain.** Article 21 of the LSSI prohibits commercial electronic communications that were not requested or expressly authorised. The existing-customer exception exists but the AEPD applies it so narrowly that practitioners treat it as unavailable. The standing advice is that if Spain is a meaningful market, the list should be built on documented consent and nothing else.

**And the decisive rule of thumb: what matters is where the recipient is, not where the business is registered.** A Lisbon agency messaging a Spanish contact is bound by Spanish law.

**The GDPR layer sits on top.** A generic marketing opt-in collected years ago, which never named WhatsApp, may satisfy Meta's platform rule while failing as valid GDPR consent — because GDPR consent must be specific and informed, and the privacy notice must disclose the channel and name Meta as a recipient.

## 1.3 The reframe

**Automation 02 is not "message the old list."**

**It is: turn a legally unusable contact list into a consented, reactivated database the agency can use lawfully for years.**

Every boutique agency has the same defect — a list of names and numbers with no recorded origin, no consent, and no lawful route to use it. The blast they think they want would fine them. **The asset they actually need is a clean list**, and nobody is selling them one.

## 1.4 Delta against the original plan

### What got worse

| | |
|---|---|
| **Time to first reply** | Was days. Now weeks, because consent has to be obtained before marketing can be sent |
| **Reachable share of the list** | Was "everyone". Realistically 10–30% will convert to documented consent |
| **Build complexity** | A consent ledger, a jurisdiction engine and a segmentation gate that did not exist in the outline |
| **Dependency on the agency** | They must declare origin per segment. We cannot do this for them and must not pretend to |
| **Spanish clients** | Materially harder. The narrow AEPD reading means a Madrid agency's old list is close to unusable without fresh consent |
| **The demo story** | "Watch it wake your database" becomes "watch it build you a database you can actually use." Less immediate, harder to sell in four minutes |

### What got better

| | |
|---|---|
| **The client cannot be fined because of us** | The original design would eventually have produced a CNPD or AEPD complaint. That fine would have reached Ryvo through the indemnity |
| **The client's WhatsApp number survives** | Blasting an unconsented list degrades quality rating and throttles the number the Concierge depends on. The two automations would have undermined each other |
| **The output is a durable asset** | A consented, documented list is worth more than a burst of replies and keeps producing value after the campaign ends |
| **It is a genuine moat** | Any competitor shipping the naive version gets their client throttled and fined. Doing it properly is harder to copy than a message template |
| **It justifies the retainer** | Consent-building is continuous, not a one-off harvest. This is a better answer to the month-three question than the original design gave |
| **It creates a second sellable outcome** | "Your database is now lawful" is a deliverable in its own right, with an audit trail the agency can show a regulator |
| **Worldwide expansion becomes tractable** | Because jurisdiction is handled as data rather than assumption — see §6 |

### What did not change

Batching, opt-out handling, handover to the Concierge, and the weekly report all survive as designed. **The machinery was right. The premise was wrong.**

---

# 2. Segmentation is a legal instrument, not a marketing one

Segmentation in the original plan was about message relevance. It is now the **gate that decides whether a contact may be contacted at all, and by what route.**

Every imported contact lands in exactly one segment, and the segment determines the lawful route.

| Segment | Definition | Lawful route |
|---|---|---|
| **A · Transacted client** | Completed a purchase, sale or lease with this agency | Existing-customer route may be available. Portugal: yes, with the Article 13.º-B list obligation. Spain: treat as unavailable |
| **B · Documented consent** | Agency holds evidence of consent: timestamp, source, wording | Direct. The only segment contactable with confidence anywhere |
| **C · Prior enquiry, no transaction** | Enquired, viewed, registered — never transacted | **Not an existing customer.** Consent must be obtained first |
| **D · Unknown origin** | Name and number, no recorded provenance | **Not contactable.** Consent must be obtained by a channel outside this system |
| **E · Objected** | Opted out, blocked, or on a suppression list | **Never contactable.** Permanent |

**The agency declares the segment. We do not infer it.** A screen presents each imported batch and asks the agency to classify. The declaration is recorded with a timestamp and the identity of the person who made it, because if a regulator asks, that record is the answer.

**The system proposes a segmentation** — from CRM fields, transaction records, or the presence of prior WhatsApp history — and the agency confirms or corrects it. Proposing saves them hours. Declaring keeps the responsibility where the knowledge is.

**Segment D is the honest one.** For most boutique agencies it will be the largest group, and the product's answer is "we cannot message these, and here is why." Saying so is the difference between a compliance product and a liability.

---

# 3. The message

## 3.1 What the research says works

The consistent finding across every source: **do not lead with a pitch.** Opening with "are you looking to buy or sell" reads as desperation. The message must give something — a market observation, an answer to a question they once asked, a genuine reason for contact.

**Tone tracks dormancy.** Eight months dormant supports "following up on our last conversation." Three years dormant needs "I know it has been a while."

**Segment determines the angle.** A past client needs relationship re-engagement; a cold enquiry needs a market hook. Treating them identically is why generic blasts fail.

**And Meta rejects vague templates.** "Hello, we have an offer" gets refused. Templates must be specific and value-driven, with limited variable placeholders.

## 3.2 The first message, by segment

Written for Portugal, in Portuguese, as approved template drafts.

### Segment A — transacted client, first touch

> Olá {{1}}, fala a {{2}} da {{3}}. Já passou algum tempo desde que tratámos da sua casa em {{4}} e lembrei-me de si. O mercado nessa zona mudou bastante desde então. Se quiser, envio-lhe uma actualização do valor actual, sem qualquer compromisso.
>
> Para deixar de receber mensagens, responda SAIR.

**Why it works.** Names the person who handled it. References the specific property. Offers something concrete. No question about buying or selling. The opt-out is in the template, as Meta requires.

### Segment B — documented consent, first touch

> Olá {{1}}, fala a {{2}} da {{3}}. Registou interesse em {{4}} e continuamos atentos a essa zona. Quer que lhe diga o que está disponível neste momento?
>
> Para deixar de receber mensagens, responda SAIR.

### Segment C — consent request, not marketing

This is **not** a marketing message. Its only purpose is to obtain consent, and it must say so.

> Olá {{1}}, fala a {{2}} da {{3}}. Contactou-nos em {{4}} sobre imóveis em {{5}}. Para lhe podermos enviar novidades por WhatsApp precisamos da sua autorização. Quer continuar a receber? Responda SIM para autorizar ou SAIR para não voltarmos a contactar.

> ⚠️ **This one needs legal review before submission.** A consent request is itself arguably a commercial communication, which in Spain would place it inside the LSSI Article 21 prohibition. It is likely defensible in Portugal and likely not in Spain. **Segment C should be disabled for Spanish recipients until a lawyer says otherwise.**

### Segment D

No message exists. The system will not send one.

## 3.3 Template library, and agency customisation

Each agency chooses from a small approved library or writes their own, which we then submit for Meta approval on their behalf. Both routes end in the same place — a template with an approval ID.

**This is a real product requirement, not a nicety.** Every agency using the same three messages is how a template gets flagged. Variation between clients is protective as well as commercial.

---

# 4. Cadence

Research consensus for reactivation is three touches: **day 1, day 4–5, day 9–10**. That spacing gives each message room without losing momentum.

**But WhatsApp tolerance is lower than email**, so the rules tighten:

- **Maximum three touches**, then the contact goes dormant for at least 90 days
- **No reply after touch two** means touch three is the last, and it says so
- **Any reply stops the sequence immediately** and hands to the Concierge
- **A per-user cap of roughly two marketing messages a day exists across all brands**, so spacing also reduces the chance of being the message that does not get through
- **Never on consecutive days**, and never more than one touch per contact per week

**Touch two offers something rather than asking.** A local market figure, a recent comparable sale, something specific to their area.

**Touch three closes the loop honestly.** "I will not keep writing — if the time comes, you know where I am." That message consistently outperforms a fourth attempt and protects the number.

---

# 5. Opt-out, consent and the ledger

## 5.1 Opt-out

**In every template footer.** Meta requires it for marketing templates, and an easy exit is protective: users who can opt out easily are less likely to block, and blocks damage quality rating far more than opt-outs do.

**One step.** "Responda SAIR" — no link, no form, no confirmation question.

**Honoured immediately**, not at the next batch. Anyone who replies SAIR comes off the list that moment.

**Honoured permanently and across campaigns.** An opt-out is a property of the contact, not of the campaign.

**Recognised loosely.** SAIR, STOP, PARAR, BAJA, UNSUBSCRIBE, "não quero", "deixem-me em paz", and their Spanish and English equivalents. **When in doubt, treat it as an opt-out.** The cost of a false positive is one lost contact; the cost of a false negative is a complaint.

**A block is an opt-out.** If Meta reports the user blocked the number, that is the same signal.

## 5.2 The consent ledger

A table that exists for one purpose: **to answer a regulator.**

Per contact, per consent event: the timestamp, the source, the exact wording shown, the channel, the segment declared, the person at the agency who declared it, and every subsequent change of state.

**Append-only.** Nothing is overwritten. If consent is withdrawn, that is a new row.

**This is the deliverable.** When an agency is asked to prove a contact consented, this ledger is the answer, and no competitor selling a blast tool has one.

---

# 6. Jurisdiction — how this works worldwide

The rule that makes worldwide expansion tractable: **the recipient's country determines the applicable law, not the agency's.**

That is a property of the phone number, which means it is **data, not judgement**, and can be resolved automatically.

## 6.1 The mechanism

1. Every imported number is normalised to E.164 and its country resolved from the dialling prefix
2. The country is looked up in a **jurisdiction policy table**
3. The policy, combined with the segment, decides: contactable, contactable-with-consent-first, or not contactable
4. A contact whose country has no policy entry is **not contactable** until one is written

**The default is refusal.** An unknown jurisdiction is a stop, never a shrug.

## 6.2 The policy table

Each entry records what is permitted, the statutory basis, and the specific traps.

| Country | Existing-customer route | Notes |
|---|---|---|
| **Portugal** 🇵🇹 | Available | Lei 41/2004 arts. 13.º-A, 13.º-B. Consent lists must be maintained. CNPD Diretriz 2022/1. Lista Robinson (Lei 6/99) should be screened |
| **Spain** 🇪🇸 | Treat as unavailable | LSSI art. 21. AEPD reads the exception so narrowly that practitioners treat it as unusable. B2B gets the same protection as B2C |
| **Ireland** 🇮🇪 | Available, expires | Soft opt-in valid for 12 months from the sale or last compliant message |
| **Germany** 🇩🇪 | Effectively unavailable | UWG §7 treats advertising without prior express consent as harassment. Single opt-in ruled insufficient evidence — double opt-in is the de facto standard. Same rule B2B and B2C |
| **France** 🇫🇷 | Restricted | CNIL requires separate consent for marketing and restricts reuse of data collected for other purposes |
| **Netherlands** 🇳🇱 | Unavailable | Strict opt-in. Fines issued for using purchased lists without verifying consent |
| **United Kingdom** 🇬🇧 | Available | PECR soft opt-in, similar products, opt-out at collection and in every message |
| **United States** 🇺🇸 | **Blocked at platform level** | Meta does not deliver marketing templates to +1 numbers at all. Utility and authentication only |

## 6.3 Why this is a feature rather than overhead

**It turns the hardest part of selling abroad into a configuration entry.** An agency in Dubai or Miami is a new row in a table plus a legal review, not a rebuild.

**It survives legal change.** When Spain's reading softens or the ePrivacy Regulation finally lands, one table changes and every client is compliant the next day.

**It is demonstrable.** "The system knows your Spanish contacts are governed by Spanish law and treats them differently" is a sentence no competitor can say.

**And it protects against the mixed list**, which is the common case: a Lisbon agency with Brazilian buyers, British retirees and Spanish investors in the same spreadsheet. A single-jurisdiction assumption breaks on the first import.

> **Every row in that table needs legal confirmation before a client is onboarded in that country.** The table is the structure; the content is a lawyer's.

---

# 7. Reply handling

A reply arrives. Four possible readings:

| Reading | Example | Action |
|---|---|---|
| **Opt-out** | SAIR · "não quero" · "parem" | Suppress permanently. Confirm once. Do not hand to the Concierge |
| **Interest** | "ainda tenho interesse" · "quanto vale?" · "quais opções?" | Stop sequence. Open Concierge. Full qualification |
| **Identification** | "quem é?" · "não conheço" | **Not an opt-out and not interest.** One clarifying reply naming the agency and the prior relationship, then stop unless they answer |
| **Ambiguous** | "ok" · "obrigado" · a thumbs-up | Stop the sequence. Do not treat as interest. Do not send touch three |

**"Quem é?" is the one that matters.** It is the most common reply to a reactivation message and the easiest to mishandle. Treating it as interest produces a pushy follow-up to someone who does not remember the agency. Treating it as an opt-out throws away a warm contact. It needs its own path.

**Any reply opens the 24-hour window**, at which point the Concierge takes over with free-form messages and all the guards it already carries.

---

# 8. Import

Every route ends in the same place: normalised rows, deduplicated, awaiting segment declaration.

**CSV upload.** The workhorse. Column mapping, a preview, a validation pass before anything is stored.

**Phone contact export.** vCard, which is what an agent who works from their phone actually has.

**Manual entry.** For the handful of high-value contacts an agent adds by name.

**CRM connection.** Later, and only for agencies that have one. The eGO footer test already tells us who does.

**Cleaning happens at import**, not later: duplicates merged keeping the most recent interaction, invalid numbers flagged, non-mobile numbers separated, and each contact's country resolved.

---

# 9. What the operator sees

These screens should be designed into the reframed cockpit (§3.17), not bolted onto the current one.

**Import** — upload, map, preview, validate, commit.
**Segment** — the proposed classification, per batch, for the agency to confirm. Shows the consequence of each choice plainly.
**Campaign** — which templates, which segments, which jurisdictions, how many contactable and how many refused with reasons.
**Live status** — batches sent, delivered, replied, opted out, and the quality rating trend.
**The ledger** — searchable by contact, exportable, because that is what a regulator asks for.

---

# 10. Protecting the number

The Concierge and Reactivation share a phone number. **A reactivation campaign that degrades the quality rating throttles the Concierge too.** That coupling is the single biggest operational risk in this automation.

- **First send is 10–20% of the list**, then stop and check the quality rating before scaling
- **Batches of 30 a day maximum**, unchanged
- **Campaigns designed in stoppable batches** — batch one must deliver standalone value if batch two is paused
- **Quality rating checked before every batch.** Any drop below green halts the campaign automatically and alerts
- **Tier awareness** — new portfolios start around 250 conversations a day, stepping up as quality volume is proven. Limits are portfolio-level, so one bad number drags the rest
- **Never two touches to the same contact in a week**

---

# 11. What we will not build

**A blast to an unsegmented list.** The thing every agency will ask for.

**Inferred consent.** If the agency cannot say where a contact came from, the answer is segment D.

**Scraped contacts.** Already rejected, and this makes it structural rather than a matter of taste.

**Marketing content dressed as utility templates.** Meta polices category misuse and the penalty lands on the client.

**Reactivation to +1 numbers.** Meta does not deliver them.

**A fourth touch.** The data does not support it and the number cannot afford it.

---

# 12. Build order

**Buildable now, with Meta gated until ~22 September:**

1. Import pipeline — CSV, vCard, manual, with cleaning and E.164 normalisation
2. Consent ledger — the table, append-only, with its query surface
3. Jurisdiction engine — the policy table and resolution from dialling prefix
4. Segmentation — proposal logic and the declaration screen
5. Opt-out handling — recognition, suppression, permanence
6. Reply classification — the four readings, especially "quem é?"
7. Sequence engine — three touches, stop conditions, batching
8. Template drafts — written and ready, in Portuguese and Spanish

**Gated until Meta verification:**

9. Template submission and approval tracking
10. Actual sending
11. Quality-rating monitoring and the automatic halt

**Before any client:**

12. Legal confirmation of every jurisdiction row
13. The §0.8 adversarial gate — 20 unscripted conversations
14. Invariants specific to this automation. Candidates: *no message is sent to a contact without a ledger row permitting it*; *no message is sent to a contact in a jurisdiction with no policy entry*; *an opt-out is never followed by another message*

---

# 13. The honest summary

The original plan was faster, simpler, and would have worked for a few weeks before producing a fine, a throttled number, and a client who blamed us.

**What replaces it is slower to first reply and produces a better asset.** It is harder to build, harder to copy, and it is the version that can be sold to an agency in any country rather than one.

**The thing to be careful about commercially:** do not sell "watch your database wake up." Sell "your database becomes something you can actually use, and we can prove it." The second is true, and the first would eventually have to be retracted.
