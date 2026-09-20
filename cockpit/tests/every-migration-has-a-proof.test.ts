import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * A MIGRATION WITH NO PROOF IS INVISIBLE TO THE PROOF BOOK.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 🔴 FOUND 21 SEPTEMBER 2026, by trying to bless `0047` and discovering it was
 * not in the book at all. I had written the migration and never registered a
 * proof, and NOTHING NOTICED — every existing check reads `proofs.json` and
 * asks whether its entries are stale. An entry that does not exist has no
 * hashes to go stale and no `last_proved` to be null.
 *
 * 🔒 THE SAME SHAPE AS `0025`, ONE LEVEL UP. `audit_revoke_claims.sql`
 * compares every revoke a migration CLAIMS against the database, and cannot
 * see `0025`'s missing revoke because there is no claim to compare. This is
 * that failure applied to the proof book itself:
 *
 *   **AN AUDIT OF CLAIMS CAN ONLY EVER FIND CLAIMS THAT ARE FALSE. It cannot
 *   find a claim that was never made — and the missing ones are exactly the
 *   things nobody thought about.**
 *
 * So this check does not read `proofs.json` and ask what is stale. It reads the
 * MIGRATIONS DIRECTORY and asks what is absent.
 */

const REPO = join(import.meta.dirname, '..', '..')
const MIGRATIONS = join(REPO, 'db', 'migrations')

type Proof = { id: string; watches: string[] }
const BOOK = JSON.parse(readFileSync(join(REPO, 'db', 'tests', 'proofs.json'), 'utf8')) as {
  proofs: Proof[]
}

/**
 * Migrations that legitimately have no proof, each with the reason.
 *
 * 🔒 A RATCHET, NOT AN EXEMPTION LIST. Shrinking it is good; growing it needs
 * a reason written on the line. The three below all predate or sit outside the
 * proof book, and each is a DIFFERENT kind of absence — which is the point of
 * writing them out rather than counting them.
 */
const NO_PROOF_OWED: Record<string, string> = {
  '0014_jurisdiction_policy.sql':
    'Predates the book. A policy table with a confirmed_at; its constraints are exercised by the gate suite rather than by a SQL proof.',
  '0016_objection_race_check.sql':
    'Predates the book. Creates a VIEW used as an invariant, with no constraints of its own to refuse anything — there is no refusal to witness.',
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    // A file renamed .APPLIED-ELSEWHERE or .SUPERSEDED is a record, not a
    // migration: it is marked precisely so nobody runs it.
    .filter((f) => !/\.(APPLIED-ELSEWHERE|SUPERSEDED)\./.test(f))
    // 0001–0011 are the base schema, laid down before the proof book existed.
    .filter((f) => Number(f.slice(0, 4)) >= 12)
    .sort()
}

const WATCHED = new Set(BOOK.proofs.flatMap((p) => p.watches.map((w) => basename(w))))

test('🔴 every migration is registered in the proof book, or says why not', () => {
  const unregistered = migrationFiles().filter((f) => !WATCHED.has(f) && !(f in NO_PROOF_OWED))

  assert.deepEqual(
    unregistered,
    [],
    `\n\n  🔴 ${unregistered.length} migration(s) have no proof and no stated reason.\n\n` +
      unregistered.map((f) => `    ${f}`).join('\n') +
      '\n\n  Nothing else can catch this: every other check reads proofs.json and\n' +
      '  asks whether its entries are stale. An entry that does not exist has no\n' +
      '  hashes to go stale and no last_proved to be null.\n\n' +
      '  Register it with a proof, or add it to NO_PROOF_OWED with the reason.\n',
  )
})

test('the ratchet only tightens: a stated reason must name a file that exists', () => {
  // Otherwise a renamed migration leaves an exemption behind that silently
  // covers nothing, and the next file to take that name inherits it.
  const files = new Set(readdirSync(MIGRATIONS))
  const stale = Object.keys(NO_PROOF_OWED).filter((f) => !files.has(f))
  assert.deepEqual(stale, [], `exempted files that no longer exist: ${stale.join(', ')}`)
})

test('every stated reason says something, and the ledger is in the book rather than the excuses', () => {
  for (const [f, why] of Object.entries(NO_PROOF_OWED)) {
    assert.ok(why.length > 40, `${f}: the reason is too short to be one`)
  }
  /*
   * 🔴 The consent ledger is not an ordinary exemption and must not read like
   * one. It is the record of who may lawfully be messaged; a deletable ledger
   * is one whose absence of an objection means nothing. If this line ever
   * softens into "predates the book", the debt stops being visible.
   */
  // 🔴 0012 WAS THE ENTRY THIS ASSERTED ON, and it is now REGISTERED rather
  // than exempted — which is the ratchet tightening in the only direction it
  // should. The assertion is replaced by its stronger form: the ledger must be
  // in the book, not in the excuses.
  assert.ok(
    !('0012_consent_events.sql' in NO_PROOF_OWED),
    'the consent ledger is back in the exemption list — it has a proof, so it belongs in the book',
  )
})

test('the control: the checker can see an unregistered migration', () => {
  // Without this, "nothing unregistered" and "the directory read returned
  // nothing" are the same green.
  const files = migrationFiles()
  assert.ok(files.length >= 20, `only ${files.length} migrations found — has the path moved?`)
  assert.ok(WATCHED.size >= 15, `only ${WATCHED.size} watched files — is proofs.json being read?`)

  const invented = '0099_a_migration_nobody_registered.sql'
  assert.ok(!WATCHED.has(invented) && !(invented in NO_PROOF_OWED), 'the control file is somehow known')
})
