/**
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT IS BLOCKED, BY WHOM, AND WHAT TO DO WHEN THEY ANSWER.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 FLIPPING A GATE TO `open: true` MAKES THE SUITE FAIL AND LIST THE WORK.
 * That is the whole design. Recording that a gate opened and surfacing what it
 * unblocks are the same act, which is the one property a document can never
 * have — a document has to be opened at the right moment, and the moment a
 * gate opens is the worst possible time to remember one exists.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY IT IS KEYED BY GATE AND NOT BY FEATURE
 * ───────────────────────────────────────────────────────────────────────────
 * Several things wait on other people. When one of them answers, the work it
 * unblocks is scattered across the repo and in the operator's head: Margarida's
 * answer changes the Enquadramento, the templates, the policy table and Spain's
 * rows; Meta's verification changes 02's send path and 05's runner. Asking
 * "what did this unblock" is the question somebody actually has at that moment,
 * and it is the question a list organised by feature cannot answer.
 *
 * 🔒 REPO-WIDE, NOT COCKPIT-ONLY. Entries point at workflows, documents and
 * database rows as readily as at TypeScript. Scoping it to this directory would
 * be the same mistake as scoping a boundary check to one folder.
 *
 * 🔒 IT ABSORBS RATHER THAN DUPLICATES. Anything recorded here whose blocker is
 * a PERSON should not also be recorded as a blocker elsewhere: two records of
 * one fact drift, and the cross-screen sweep found twenty-two disagreements
 * produced exactly that way. Work blocked on a DECISION or on our own effort
 * belongs in the improvements list instead — §3.22 is ours to do, not
 * somebody's to answer.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * IT IS NOT RENDERED ANYWHERE YET, AND THAT IS DELIBERATE
 * ───────────────────────────────────────────────────────────────────────────
 * Today's group 5 — "Waiting on someone else" — says it is not built, because
 * the waiting room had no source. This is that source. It lives in src/lib
 * rather than in tests/ so a screen can read it without moving anything, and
 * it is not rendered until group 5 is designed as the thing it is rather than
 * as the thing that completes a row of five.
 */

export type GateId =
  | 'meta_verified'
  | 'portugal_confirmed'
  | 'spain_analysed'
  | 'adene_credentials'
  | 'first_client'
  | 'first_close'
  | 'calibration_afternoon'
  | 'legal_entity'

export type Gate = {
  id: GateId
  /** What the gate is, in one line. */
  what: string
  /** 🔒 Whose act opens it. A named person or organisation, never "us". */
  whoHolds: string
  /** How we would know it had opened, so `open` is set from evidence. */
  evidence: string
  /** When we started waiting, where that is known. */
  since?: string
  /**
   * 🔴 FLIP THIS. The suite then fails, listing everything below that was
   * waiting on it, with what each needs doing.
   */
  open: boolean
}

export const GATES: Gate[] = [
  {
    id: 'meta_verified',
    what: "Meta's business verification for the WhatsApp Business account",
    whoHolds: 'Meta',
    evidence:
      'the WhatsApp Manager shows the business as verified; it checks the certidão permanente, the NIPC and proof of address for the legal entity',
    since: '2026-09-03',
    open: false,
  },
  {
    id: 'portugal_confirmed',
    what: "a lawyer's confirmation of our reading of Portuguese advertising and contact law",
    whoHolds: 'Margarida',
    evidence:
      'advertising_policy and jurisdiction_policy rows for PT carry both confirmed_at and confirmed_by — the two columns are inert until both are set',
    since: '2026-08-24',
    open: false,
  },
  {
    id: 'spain_analysed',
    what: 'an analysis of what Spain requires of a property advertisement, and of whom we may contact there',
    whoHolds: 'Margarida, and us before her',
    evidence: 'an advertising_policy row exists for ES at all — today there is none, which is an absence of analysis rather than a pending confirmation',
    open: false,
  },
  {
    id: 'adene_credentials',
    what: "access to ADENE's register, so an energy certificate can be looked up rather than typed",
    whoHolds: 'ADENE',
    evidence: 'credentials in hand and a first successful lookup; registration was submitted',
    open: false,
  },
  {
    id: 'first_client',
    what: 'a signed agency that is not a rehearsal',
    whoHolds: 'an agency',
    evidence: 'a clients row with rehearsal = false — 0037 exists to make that a declared answer rather than a default',
    open: false,
  },
  {
    id: 'first_close',
    what: 'an agent reporting that a property sold, and saying who the buyer was',
    whoHolds: 'an agency',
    evidence: 'a closes row with a party recorded — the close and the party arrive separately and almost always will',
    open: false,
  },
  {
    id: 'calibration_afternoon',
    what: "an afternoon with an agency answering what their buyers actually want",
    whoHolds: 'an agency',
    evidence: 'client_automations config for 03 carries thresholds with an author and a date',
    open: false,
  },
  {
    id: 'legal_entity',
    what: 'which legal entity invoices, which decides the invoicing software and the VAT treatment',
    whoHolds: 'the operator and an accountant',
    evidence: 'the entity is registered and named in the operations reference',
    open: false,
  },
]

export type Blocked = {
  id: string
  /** What is blocked. */
  what: string
  /** Where it lives — a path, a document, a table. Repo-wide. */
  where: string
  gate: GateId
  /**
   * 🔴 WHAT TO RE-READ, BECAUSE THIS ENTRY EXPECTS TO BE WRONG.
   *
   * `onOpen` is what we know today. It is not what the answer will say.
   *
   * Two ways it goes stale, and both have happened to lists like this one:
   *
   *   A GATE OPENING CREATES GATES. Meta verifies, a template is submitted,
   *   and the wait is now on approval — a different gate, with a different
   *   holder, which nobody adds because the first one just opened and that
   *   felt like the end of it.
   *
   *   AN ANSWER IMPLIES WORK NOBODY PREDICTED. Question one to the lawyer
   *   could remove an entire segment from 02. No `onOpen` written in advance
   *   can contain that, and a ledger that only ever knows what was known when
   *   it was written is the stale-record failure arriving inside the thing
   *   built to prevent stale records.
   *
   * So every entry says what to go and READ when the gate opens, and the
   * report prints it beside the action.
   */
  thenReRead: string
  /**
   * 🔴 WHAT TO DO WHEN THE GATE OPENS. An instruction, not a status.
   *
   * "It becomes possible" and "waiting" both fail the rule below, for the same
   * reason the reachability ledger refuses an entry that says only that
   * something is unwired: a gap with no next action is indistinguishable from
   * a decision nobody made, and the moment a gate opens is exactly when
   * somebody needs the next action rather than a description.
   */
  onOpen: string
}

export const BLOCKED: Blocked[] = [
  // ── Meta ─────────────────────────────────────────────────────────────────
  {
    id: 'campaign-send-path',
    // 🔒 "held", not "cannot send". The retired-phrase guard caught this line:
    // a consequence where the state machine has a word, and this ledger is
    // what Today's group 5 would render if it were built.
    what: 'runCampaign has no caller, so 02 is held and nothing goes out',
    where: 'cockpit/src/lib/send/runner.ts, and tests/reachability.test.ts holds the entry',
    gate: 'meta_verified',
    onOpen:
      'build the route or workflow that starts a run, wire checkBeforeBatch in front of it, and remove runCampaign and checkBeforeBatch from the reachability ledger',
    thenReRead:
      "the verification email itself: Meta\u2019s answer says WHICH account and WHICH number are verified, and 02\u2019s send path assumes both. Check the quality rating that arrives with it \u2014 a new sender starts rate-limited, a tier nobody has designed for",
  },
  {
    id: 'template-submission',
    what: 'no reactivation template can be submitted for approval, so none can be approved',
    where: 'message_templates, and the Templates screen at /c/<client>/templates',
    gate: 'meta_verified',
    onOpen:
      'submit the reactivation template in the WhatsApp Manager, then record the approval with recordApprovedTemplate — the screen reads the record rather than the account',
    thenReRead:
      "\ud83d\udd34 submitting is not approval. The moment a template is submitted the wait moves to Meta\u2019s REVIEW, which is a different gate with a different holder and no entry here yet \u2014 add it before doing the work",
  },
  {
    id: 'review-asks',
    what: 'planReviewAsks has no caller — 05 cannot ask anybody for a review',
    where: 'cockpit/src/lib/review/runner.ts',
    gate: 'meta_verified',
    onOpen:
      'wire the scheduled run, and check the review destination is set first — 05 is blocked on two things and Meta is only one of them',
    thenReRead:
      "Google\u2019s policy on review solicitation as it stands that week, not as it stands today. 05\u2019s obvious design is already expected to violate it",
  },

  // ── the lawyer ───────────────────────────────────────────────────────────
  {
    id: 'pt-publication-gate',
    what: 'every Portuguese property refuses at policy_not_confirmed, so no clearance can ever be produced',
    where: 'advertising_policy PT row; the gate at /c/<client>/listings/<id>/publish',
    gate: 'portugal_confirmed',
    onOpen:
      'set confirmed_at and confirmed_by on the PT row, then walk one property through the publish screen — the next refusal will be requirement_unmet for the AMI registration, which is improvements §3.22 and ours to fix',
    thenReRead:
      "the lawyer\u2019s answer in full rather than the confirmed flag. It may narrow what a confirmed row permits, or add a requirement the policy table has no column for",
  },
  {
    id: 'prepared-piece',
    what: 'assemblePiece has no caller, because it takes a cleared verdict and none can exist',
    where: 'cockpit/src/lib/publication/piece.ts',
    gate: 'portugal_confirmed',
    onOpen:
      'build the prepared-piece screen against a real cleared verdict, and remove assemblePiece from the reachability ledger',
    thenReRead:
      "what the confirmation says about mandatory mentions specifically \u2014 the assembler\u2019s invariant is read on the artefact, so a change in the wording is a change in the test",
  },
  {
    id: 'contact-jurisdiction',
    what: 'no contact in Portugal can be written to under segment A — the jurisdiction row permits nothing while unconfirmed',
    where: 'jurisdiction_policy PT row; lib/jurisdiction-policy.ts',
    gate: 'portugal_confirmed',
    onOpen:
      'set confirmed_at and confirmed_by, then re-read the declaration screen with an agency — the sentence it shows changes because the TABLE changed, which is the mechanism working',
    thenReRead:
      "\ud83d\udd34 question one especially. The answer could remove an entire segment from 02, which makes part of the campaign path dead code rather than blocked code \u2014 a different kind of work",
  },
  {
    id: 'enquadramento',
    what: "the Enquadramento's legal reading is ours and unreviewed",
    where: 'docs/ and legal/, the three lawyer notes',
    gate: 'portugal_confirmed',
    onOpen: 'fold the answers into the Enquadramento and the policy tables in the same pass, so the document and the rows cannot disagree',
    thenReRead:
      "all three notes against the answer, not only the question asked. A lawyer answering one question often settles two others in passing",
  },

  // ── Spain ────────────────────────────────────────────────────────────────
  {
    id: 'spain-rows',
    what: 'Spain has no advertising_policy row at all, so nothing can be published there and the reason is no_policy_row',
    where: 'advertising_policy; the Policy screen names the absence in its own section',
    gate: 'spain_analysed',
    onOpen:
      'add the ES rows including the regional ones, set regions_exhaustive honestly, and check the presented declaration sentence changes from "ainda não trabalhamos" on its own',
    thenReRead:
      "whether Spain regulates regionally in the way region_required and regions_exhaustive assume. If it does not, those flags are the wrong shape rather than unset",
  },

  // ── ADENE ────────────────────────────────────────────────────────────────
  {
    id: 'certificate-lookup',
    what: 'an energy certificate can only be typed, never confirmed against the register',
    where: 'listing_facts.source is typed | lookup_confirmed, and nothing produces the second',
    gate: 'adene_credentials',
    onOpen:
      'build the lookup as a PROPOSAL into fact_proposals — the system proposes and the agency confirms, and an unconfirmed lookup is not a fact',
    thenReRead:
      "what ADENE actually returns. The design assumes a lookup confirms a class and a date; if it returns less, fact_proposals is the wrong shape and typing stays the only path",
  },

  // ── a first real client ──────────────────────────────────────────────────
  {
    id: 'month-revenue',
    what: 'The Month cannot show revenue: there is no contract, no payment, and no client that is not a rehearsal',
    where: 'cockpit/src/app/page.tsx says it is not built; brief I §2.11 proposes the tables',
    gate: 'first_client',
    onOpen:
      'write the client_contracts and client_payments migrations, apply them one at a time with 0032’s treatment, then build The Month against real rows',
    thenReRead:
      "brief I \u00a72.11\u2019s proposed tables against the first real contract rather than the other way round. A contract with terms the proposal cannot express is the cheap moment to find out",
  },
  {
    id: 'rehearsal-not-null',
    what: '0038 cannot run — clients.rehearsal cannot become NOT NULL until something writes it for a real client',
    where: 'db/migrations/0038_clients_rehearsal_not_null.sql, recorded blocked in proofs.json',
    gate: 'first_client',
    onOpen: 'apply 0037, deploy the onboarding that asks the question, see it write true/false on a real row, then run 0038',
    thenReRead:
      "whether the first real client arrived through onboarding at all. If it was created another way, rehearsal may be null on it and 0038 will refuse by name",
  },

  // ── a first close ────────────────────────────────────────────────────────
  {
    id: 'close-intake',
    what: 'recordClose, recordParty and markAgentAsked have no caller — nothing can report a sale',
    where: 'cockpit/src/lib/review/closes-store.ts; the close-and-party screen is designed in brief II §2.5 and not built',
    gate: 'first_close',
    onOpen:
      'build the close-and-party screen, remembering that a close is born with no party and the answer is a second act by a second person at a second time',
    thenReRead:
      "how the agent actually reports it. The design assumes a WhatsApp message about a property; a phone call or a spreadsheet would make this a different screen",
  },

  // ── an agency afternoon ──────────────────────────────────────────────────
  {
    id: 'matching-thresholds',
    what: '03 ranks nobody: thresholds_not_configured is a configuration state, not a statement about leads',
    where: 'client_automations config for 03; the calibration screen exists and is reachable',
    gate: 'calibration_afternoon',
    onOpen:
      'run the calibration with the agency, in their words, nothing pre-filled — then the matching run, the notification wording and the triage floor can all be judged for the first time',
    thenReRead:
      "the answers for what they imply about the matching design, not only for the numbers. An agency saying something the thresholds cannot express is the finding, not the input",
  },
  {
    id: 'extract-criteria',
    what: 'extractForLead and recomputeRequirementsForLead have no caller',
    where: 'cockpit/src/lib/matching/',
    gate: 'calibration_afternoon',
    onOpen: 'wire extraction into the Concierge run once there are thresholds to rank against, and remove both from the reachability ledger',
    thenReRead:
      "whether extraction belongs in the Concierge run at all once thresholds exist \u2014 it may be cheaper and more honest as an operator action on a contact",
  },

  // ── the legal entity ─────────────────────────────────────────────────────
  {
    id: 'invoicing',
    what: 'no invoice can be issued or read, so The Month can only ever show what was contracted',
    where: 'docs/ryvo-operations-and-commercial-reference.md; Keyinvoice is chosen and unverified',
    gate: 'legal_entity',
    onOpen:
      'confirm whether the Keyinvoice API can list documents by date; if it cannot, the monthly SAF-T file is the fallback and the import is the work',
    thenReRead:
      "whether the entity decision changes who the contract is with. The contract names a party, and a different entity is a different contract rather than a different letterhead",
  },
]
