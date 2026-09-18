# Advertising jurisdiction — the rule lives below the country

**Design · 18 September 2026 · nothing in this document has been built**

> **The gate currently treats Portugal's answers as the question.** One energy
> class, one national licence. Spain answers the same question with two ratings
> registered in one of seventeen regional registers, and an agency registration
> that is mandatory in two regions, voluntary in four, and absent elsewhere.
>
> A Spanish property in Barcelona carries a requirement the same agency's
> property in Zaragoza does not. Nothing in the current shape can express that.

---

# 0. What this document decides

| | Decision |
|---|---|
| **A second table** | `advertising_policy`, keyed `(country, region)`. NOT columns on `jurisdiction_policy` — that answers a different question about a different subject (§1.2) |
| **Requirements are typed and layered** | A row declares *what facts must be present*, not *which columns to read*. A region adds to its country, never removes |
| **Resolution is the PROPERTY's location** | Not the recipient's phone, not the agency's address. And never inferred from a town name |
| **0028's columns** | The right facts in the wrong home. Superseded and dropped — one listing, two clients, no data. It is the cheapest it will ever be |
| **Four kinds of fact** | Property rating · agency registration · exemption declaration · lookup. Four failure modes, four refusals, never flattened |
| **A lookup is an upgrade** | Typing is the universal path. Where a register exists, the system proposes and the agency confirms (§5) — the operator's call, folded in |
| **Two corrections** | The fines are understated by an order of magnitude for companies; an AMI licence is a state, not a fact (§6) |

**What this does not do: it does not let Spain publish.** §7.

---

# 1. The finding, and why it is structural

## 1.1 The rule lives below the country

Spain's energy obligation is national in principle — every advertisement carries
the rating, ten-year validity, RD 390/2021 as updated by RD 659/2025 — and
**regional in operation**: the certificate is registered with the *órgano
competente* of the comunidad autónoma, and **until it is registered it has no
official validity**. Seventeen registers, no national ADENE.

Agency registration is not national at all:

| | |
|---|---|
| **Mandatory**, number in advertising | Cataluña (AICAT), Comunitat Valenciana (RAICV) |
| **Voluntary** | Madrid (announced June 2026 it moves to mandatory), Canarias, Baleares, Navarra |
| **None or in progress** | The rest |

And registration in one region does not carry to another.

So the unit of regulation is not the country. Our table has no level for that,
and a `country text primary key` cannot grow one without becoming a lie.

## 1.2 🔴 And it is a DIFFERENT jurisdiction from the one we already have

The tempting move is to add columns to `jurisdiction_policy`. It would be wrong,
and the reason is the two-gates argument arriving a second time.

| | `jurisdiction_policy` | `advertising_policy` |
|---|---|---|
| Subject | **A person** — may we message them? | **A property** — may it be advertised? |
| Resolved from | The recipient's **dialling prefix** | Where the **property is** |
| Law | GDPR, ePrivacy, Meta's policy | Advertising and estate-agency law |
| Unit | Country | **Country, then region** |
| Fails by | Messaging with no lawful basis | Publishing an unlawful advertisement |

One table answering both would let a caller satisfy *"may we message"* and
believe it covered *"may we advertise"* — which is exactly the failure
`two-gates.test.ts` exists to prevent, recreated one level down in the data.
**Two gates, two subjects, two tables.**

What DOES carry over is the principle, unchanged and deliberately copied: a row
says what is permitted, a missing row refuses, and **a row is inert until a
lawyer confirms it** (`confirmed_at` / `confirmed_by`, with the constraint that a
confirmation names its author).

## 1.3 Resolution, and the inference that must not happen

The property's region has to come from somewhere. `listings` today holds `area`
— a free-text town or zone — and `location_detail`. Neither is a region.

> **The region is never inferred from the area string.** §4.3 already forbids a
> hardcoded gazetteer for matching, and here the stakes are higher: guessing
> that "Sant Cugat" is in Cataluña applies a mandatory registration requirement
> to a property, or fails to. A wrong guess in either direction is a legal
> conclusion drawn from a string match.

So: the region is a **declared field on the listing**, and in a country whose
national row says regions regulate, **a listing with no region refuses** — the
same deny-by-default as a missing policy row, and for the same reason.

---

# 2. The structure

## 2.1 Requirements are typed, and they layer

A policy row does not name columns. It declares the facts that must be present:

```
advertising_policy (country, region)
  requires: [
    { id: 'pt_energy_class', kind: 'property_rating',
      shape: 'single_letter', scale: 'A+..F', exemptible: true },
    { id: 'pt_ami',          kind: 'agency_registration',
      scope: 'national', authority: 'IMPIC', revocable: true }
  ]
```

Portugal, national. Spain becomes:

```
('ES', null)   requires: [
    { id: 'es_energy_label', kind: 'property_rating',
      shape: 'two_ratings',            -- emissions AND consumption
      each: 'letter_and_colour',
      registration: 'required',        -- §1.1: unregistered has no validity
      registered_with: 'comunidad_autonoma' }
  ]
  region_required: true                 -- a listing with no region refuses

('ES', 'CT')   requires: [
    { id: 'es_cat_aicat', kind: 'agency_registration',
      scope: 'regional', authority: 'AICAT', revocable: true }
  ]

('ES', 'VC')   requires: [ { id: 'es_val_raicv', … } ]

('ES', 'MD')   requires: [ { id: 'es_mad_registro', …,
                             effective_from: '2027-??-??' } ]   -- §2.3
```

**Requirements ACCUMULATE.** A Barcelona property needs the national row's
requirements *and* Cataluña's. A Zaragoza property needs only the national
row's, because Aragón has no row — and **no row means no additional requirement,
not "unknown"**, which is the one place this table's default differs from the
consent table's and is called out in §2.4.

**A region may add, never remove.** Stated as an assumption rather than a fact:
it holds for every case researched so far, and if a country is found where a
region *relaxes* a national rule, that is a change to make with evidence in hand
rather than a generality to design around now.

## 2.2 The gate becomes requirement-driven

Today's five checks become two: *is this property on the market*, and *is every
requirement of its jurisdiction satisfied by a currently-valid fact*. The
refusal names the **requirement**, not the column:

```
not_on_the_market
requirement_unmet          — which one, and what would satisfy it
requirement_fact_expired   — the fact exists and its validity has run out
requirement_fact_unregistered  — Spain: it exists and was never registered
requirement_fact_revoked   — §6.2: the AMI licence is suspended or cancelled
region_undeclared          — the country regulates regionally and we do not know where it is
no_policy_row              — this country has not been analysed
policy_not_confirmed       — analysed, not confirmed by a lawyer, therefore inert
not_from_the_agency        — unchanged, and §5j
```

## 2.3 Requirements have dates, because Madrid is changing

Madrid announced in June 2026 that registration moves to mandatory. A
requirement therefore carries `effective_from` and `effective_until`, and the
gate resolves **the requirement set as of now**.

Which is the same shape as everything else here: a permission that can expire
without anyone acting has to be re-asked, and so does an obligation that can
*arrive* without anyone acting. The standing re-check (§6.2) covers both
directions — a fact that lapsed, and a requirement that began.

## 2.4 One deliberate difference from the consent table

`jurisdiction_policy` treats an absent row as **refuse**: an unanalysed country
is a stop, never a shrug. This table keeps that at the **country** level and
inverts it at the **region** level: a region with no row adds nothing.

The asymmetry is real and worth stating rather than discovering:

- **Country absent → refuse.** We have not analysed this country's advertising
  law. Correct, and the same as the consent table.
- **Region absent → no extra requirement**, *provided the country's row is
  confirmed and says so*. Aragón genuinely has no agency register; demanding one
  would refuse a lawful advertisement, and refusing lawful things is how an
  agency stops using the system.

The safety comes from the country row: it must explicitly state
`regions_exhaustive: true` — meaning *we have enumerated the regions that add
requirements, and the rest add none*. Without that flag, a missing region row
refuses. **So the default is still deny; the country row is where somebody takes
responsibility for the enumeration**, and a lawyer confirms it.

---

# 3. What happens to what is already built — honestly

`0028` added `energy_class`, `energy_certificate_number`,
`energy_certificate_expires_at`, `energy_exemption` to `listings`, and
`ami_licence` to `clients`. The gate reads them by name.

**They were the right facts and the wrong home**, and the honest reckoning is:

| Column | Verdict |
|---|---|
| `energy_class text` | **Wrong shape.** Cannot hold Spain's two ratings, and has nowhere for the registration that gives a Spanish certificate its validity |
| `energy_certificate_expires_at` | **Right idea, wrong owner.** Validity belongs to the fact, and a property may hold several facts (a rating and, in Spain, its registration) |
| `energy_certificate_number` | Right, and belongs on the fact |
| `energy_exemption jsonb` | **Right artefact, wrong assumption** — it presumes exemption is a property of the *property*, when it is a property of a *requirement*. Whether a requirement is exemptible is the jurisdiction's answer, not ours |
| `clients.ami_licence text` | **Wrong in two ways.** A registration can be regional, so an agency may hold several; and it is revocable, so a bare string cannot express suspension |

**They were not wrong to write.** They were the minimum that made the gate real,
they cost one migration, and building the gate against them is what produced the
five refusals that are now the requirement vocabulary. That is the cheap way to
discover a shape is too small.

**They are wrong to keep.** Leaving them beside typed facts is two sources of
truth, and lesson 15 is unambiguous about which one keeps answering confidently.

> **Drop them.** One listing, two clients, and not a single value in any of the
> five columns. This is the cheapest this change will ever be, and it will never
> be cheaper again — the next agency onboarded is the moment it stops being free.

`0027`'s description correction stands and is unaffected.

---

# 4. Four kinds of fact, four failure modes

The structure must hold these apart. Flattening them into "a credential" is what
produces a gate that cannot say what is wrong.

| | Belongs to | Fails by | What the operator does |
|---|---|---|---|
| **Property rating** | The property | absent · expired · **unregistered** (ES) | Ask the agency for the certificate |
| **Agency registration** | The agency, **and in Spain a region** | absent · **suspended or cancelled** · held for the wrong region | Ask once per agency per region; check the register |
| **Exemption declaration** | A named person at the agency | incomplete · used where the jurisdiction does not permit one | Ask them to declare it, or tell them it is not available here |
| **Lookup** | An external register | unreachable · disagrees with what was typed · stale | **Nothing — it degrades.** §5 |

Two consequences worth stating now:

**An agency holds registrations, plural.** A Spanish agency operating in Cataluña
and Valencia holds two, and one of them does not satisfy the other's
requirement. `clients.ami_licence` cannot express that, and neither can any
single column.

**"Unregistered" is not "expired".** A Spanish certificate that exists, is
within its ten years, and was never lodged with the comunidad autónoma **has no
official validity** — and an operator told "expired" would go and ask for the
wrong thing. Different refusal, different sentence.

---

# 5. The lookup is an upgrade, never the mechanism

**The operator's decision, recorded here because the design has to respect it in
three places.**

> **Typing stays the universal path.** It works in every country, including the
> ones with no register at all — which is most of Spain and all of whatever
> comes third.

Where an official register exists — ADENE publishes a webservice for advertising
entities under Article 33 of DL 101-D/2020, and access is being registered for —
the system **fetches, shows what it found, and the agency confirms with one tap
before anything is committed.**

## 5.1 Reading a register is not inferring

§8.A says the automation never generates or infers. Somebody will read the
lookup as breaking that rule, so: **it does not.** Inferring is producing a fact
from something that is not that fact — a region from a town name, a price from a
market average. Reading an official register is *obtaining* the fact from the
body that holds it. The distinction is the same one §2 of the no-CRM design
draws between reading a notes column and guessing a budget.

What keeps it honest is the confirmation. **The system proposes; the agency
confirms** — exactly the segmentation pattern, and for exactly the reason: the
responsibility follows the knowledge, and the agency is the one answerable to
IMPIC.

## 5.2 Three properties that follow, and none is optional

**A lookup result is a PROPOSAL, not a fact.** It is stored as one, it does not
satisfy any requirement, and the gate cannot see it until somebody at the agency
has confirmed it. A fact therefore carries `source: 'typed' | 'lookup_confirmed'`
and a proposal carries neither.

**A lookup that DISAGREES with what was typed is surfaced, never applied.** §4.7:
record, surface, do not silently adjust. The agency decides which is right —
and a disagreement is itself worth knowing, because one of the two is wrong
about their own property.

**An unreachable lookup changes nothing.** It is not a refusal, not a warning on
the gate, and not a degraded clearance. The typed path was always the path; the
lookup was an upgrade that happened to be unavailable. ⚠️ And it must say so
**loudly in the operator's view** rather than silently falling back — §2.4's
no-silent-degradation rule, which is the one thing that would otherwise rot
here: a lookup quietly failing for a month while everyone believes it is
checking.

---

# 6. Two corrections, both wrong in the code today

## 6.1 🔴 The fines are understated by an order of magnitude

§8.A of the Enquadramento says **€250 to €3,741**. That is the range for
**individuals**. For companies it is **€2,500 to €44,890** — and our clients are
companies.

This is not only a documentation error. `publication/gate.ts`'s
`REFUSAL_MEANS.no_energy_class` says *"a fine of €250 to €3,741"*, and that
sentence exists specifically to make an operator's conversation with an agency
happen. **Understating the consequence by twelvefold is the opposite of what the
sentence is for.**

Corrected in three places: the Enquadramento §8.A, the refusal text, and the
calibration/onboarding material that will quote it.

## 6.2 🔴 An AMI licence is a state, not a fact

IMPIC suspends and cancels licences, and publishes the list. The gate treats
`ami_licence` as a permanent string: present means valid, forever.

It is the certificate problem in a second place. **A permission that can be
withdrawn without anyone acting is one that has to be re-asked** — so:

- an agency registration carries a **status** (`valid` / `suspended` /
  `cancelled` / `unknown`) and the date it was last confirmed
- the **standing re-check widens** from certificates to every kind of fact: a
  lapsed rating, a revoked registration, and (§2.3) a requirement that has just
  become effective
- `unknown` is not `valid`. A registration nobody has checked since it was typed
  is a registration whose status we do not know, and after some interval it
  should say so rather than continue asserting

And the re-check's limit is unchanged and must stay in the copy: **we cannot
withdraw a post we did not publish.** A revoked licence produces a notice, not
an act.

---

# 7. What this does NOT do

**It does not let Spain publish.** The structure lets Spain be *represented*; a
Spanish row is inert until confirmed by counsel, and §8.A.3 and the findings
register both already say 04 cannot enter service there without its own
analysis. **Designing the shape is not granting the permission**, and the
confirmation discipline is exactly what stops one being mistaken for the other.

**⚖️ And an open question that may be larger than the table.** Spain requires the
*etiqueta* — two ratings, each with a letter **and a colour**. A prepared piece
is text. A colour-coded label is an image, and we do not hold one.

So either the agency supplies the etiqueta image and the piece carries it, or a
text piece **cannot satisfy the Spanish requirement at all**. That is not a
schema question and it should go to counsel with the two questions already
drafted: *does a text advertisement carrying both letters satisfy the
obligation, or must the graphical label appear?*

If the answer is that the label must appear, Spain needs an image pipeline
before it needs anything in this document — and it is much better to know that
before building the table than after.

---

# 8. Data model

```
advertising_policy
  country, region              -- region null = the national row
  requires                 jsonb   -- typed requirements, §2.1
  regions_exhaustive       boolean -- §2.4: somebody enumerated the regions
  region_required          boolean -- a listing with no region refuses
  statute, authority, traps
  confirmed_at, confirmed_by      -- INERT until both are set
  researched_at, source_note
  primary key (country, coalesce(region, ''))
  check: a confirmation names its author            -- copied from 0014

listings
  region                       -- DECLARED, never inferred from `area` (§1.3)
  (energy_* columns dropped — §3)

listing_facts                  -- the property's side
  listing_id, requirement_id
  values                  jsonb  -- shape declared by the requirement
  certificate_number
  valid_from, valid_until
  registration_status     -- ES: where registration is what confers validity
  registered_with, registered_at
  source                  -- 'typed' | 'lookup_confirmed'
  confirmed_by, confirmed_at
  exemption               jsonb  -- {declared_by, basis, at} — §4, and only
                                 -- where the requirement is exemptible

agency_facts                   -- the agency's side
  client_id, requirement_id, country, region
  number, authority
  status                  -- valid | suspended | cancelled | unknown  (§6.2)
  status_checked_at
  source, confirmed_by, confirmed_at

fact_proposals                 -- what a lookup found, §5.2
  subject (listing_id | client_id), requirement_id
  found                   jsonb
  disagrees_with_typed    boolean
  fetched_at, register
  confirmed_at, confirmed_by   -- null = still a proposal, satisfies nothing
```

**Migration notes:** read `0002` first — the `service_role` grant has bitten
twice and the check is through PostgREST. Non-partial unique indexes only where
`ON CONFLICT` is used (`42P10`, twice).

---

# 9. Order of work

| | | Proof |
|---|---|---|
| **1** | The two corrections of §6 — the fine range and the AMI status. Smallest, and one of them is a sentence an operator will say to a client | *The refusal text quotes the company range; a suspended registration refuses* |
| **2** | `advertising_policy` + the typed requirement shape, with **Portugal only** and its row confirmed | *The gate's five refusals become requirement-driven and every existing test still passes — the shape changed, the behaviour did not* |
| **3** | Drop `0028`'s columns, move Portugal onto `listing_facts` / `agency_facts` | *Zero rows migrated, because there are zero rows. Verified, not assumed* |
| **4** | Region on listings, `region_required`, `regions_exhaustive` | *A listing with no region in a regionally-regulated country refuses by name, and one in Portugal does not* |
| **5** | Spain's rows, researched and **left unconfirmed** | *Every Spanish property refuses with `policy_not_confirmed` — the structure represents Spain and does not permit it* |
| **6** | The standing re-check widened to every fact kind (§6.2) | *A revoked registration and a just-effective requirement both produce a notice* |
| **7** | The lookup, as a proposal path only | *An unreachable register changes no verdict and says so loudly; a disagreement is surfaced and applied by nobody* |

Steps 1–4 are Portugal-only and change no behaviour an agency would see. Step 5
is where Spain becomes representable. Step 7 needs the ADENE credential.

---

# 10. Open, and not mine to close

- ⚖️ **The etiqueta** — §7. Possibly the largest question here.
- ⚖️ **Spanish advertising law generally** — unanalysed and already recorded in
  the findings register.
- ⚖️ **Exemptions in Spain** — the Portuguese question, asked again per country.
  The `exemptible` flag has no answer for `ES` yet, and the honest default is
  `false`: an exemption nobody has confirmed exists is one we should not offer.
- **The third country.** Everything above is shaped by two data points. The
  first country to have a *national* register with *regional* variation in
  something other than agency registration will test whether `requires` is the
  right axis. Written down so that day is a decision and not a discovery.
