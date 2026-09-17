/**
 * The note written into every quarantine row (docs/consent-ledger-design.md §5.2).
 *
 * It lives in its own module so the dry run and the writing pass can share it
 * without importing each other: `probe-quarantine.ts` calls `main()` at module
 * scope, so importing the constant FROM it would run the whole dry run as a
 * side effect of starting the pass. One constant, one home, no second copy to
 * drift — the operator approves this text once and that is the text written.
 *
 * Written in the active voice on purpose. Someone will read this row years from
 * now with no context, possibly a supervisory authority, and a record that
 * distances itself from its own cause reads worse under scrutiny than one that
 * states plainly what happened and who did it.
 */
export const QUARANTINE_NOTE =
  'Our own import code wrote this. cockpit/src/lib/import/store.ts read a cell from an ' +
  'uploaded spreadsheet, wrote it to leads.consent_status as a consent state, and stamped ' +
  'leads.consent_at with the upload clock as though it were the time of the act. Neither ' +
  'was true: the cell is the agency’s unevidenced assertion, and the timestamp is when ' +
  'we imported a file. Quarantined 2026-09-17, when the importer was corrected. ' +
  'This is not a withdrawal of consent — it is a correction of a record that should ' +
  'never have asserted consent. The contact is undetermined and not contactable.'
