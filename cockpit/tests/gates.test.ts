import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BLOCKED, GATES, gatesHoldingAutomation, type AutomationKey, type Blocked, type Gate, type GateId } from '../src/lib/gates'

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * WHEN A GATE OPENS, THE SUITE SAYS WHAT THAT UNBLOCKED.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The reachability ledger works because it fails, names what is missing, and
 * shrinks. This is the same shape for a different question: what is blocked,
 * by whom, and what to do the moment they answer.
 *
 * 🔴 IT PASSES WHILE EVERY GATE IS SHUT. Flipping one to `open: true` makes it
 * FAIL and list every entry that was waiting on it, with the next action for
 * each. Recording that a gate opened and surfacing the work are then the same
 * act — which is the property a document can never have, because a document
 * has to be opened at the right moment and the moment a gate opens is the
 * worst possible time to remember one exists.
 *
 * You clear the failure by doing the work and deleting the entries, not by
 * shutting the gate again.
 */

/** The reporting half, separated so the control below can drive it. */
export function openedWork(gates: Gate[], blocked: Blocked[]): { gate: Gate; waiting: Blocked[] }[] {
  return gates
    .filter((g) => g.open)
    .map((g) => ({ gate: g, waiting: blocked.filter((b) => b.gate === g.id) }))
    .filter((x) => x.waiting.length > 0)
}

function report(opened: { gate: Gate; waiting: Blocked[] }[]): string {
  const lines = [
    '',
    '  ═══════════════════════════════════════════════════════════════════',
    `  ${opened.length} GATE(S) OPENED. THIS IS THE WORK THEY UNBLOCKED.`,
    '  ═══════════════════════════════════════════════════════════════════',
    '',
    '  Clear this by doing the work and deleting the entries — not by',
    '  shutting the gate again.',
    '',
  ]
  for (const { gate, waiting } of opened) {
    lines.push(`  ── ${gate.id} — ${gate.what}`)
    lines.push(`     held by ${gate.whoHolds}${gate.since ? `, since ${gate.since}` : ''}`)
    lines.push('')
    for (const b of waiting) {
      lines.push(`     ${b.id}`)
      lines.push(`         blocked:  ${b.what}`)
      lines.push(`         where:    ${b.where}`)
      lines.push(`         DO NOW:   ${b.onOpen}`)
      // 🔴 Not optional, and not below the fold. The action is what we knew
      // when the gate was shut; this is the instruction to find out what we
      // did not. A report that printed only the action would be the ledger
      // asserting its own foresight.
      lines.push(`         RE-READ:  ${b.thenReRead}`)
      lines.push('')
    }
  }
  return lines.join('\n')
}

test('🔴 nothing is waiting on a gate that has opened', () => {
  const opened = openedWork(GATES, BLOCKED)
  if (opened.length === 0) return
  assert.fail(report(opened))
})

// ── the rules the ledger holds itself to ────────────────────────────────────

test('every entry says what to DO when its gate opens, not that it is waiting', () => {
  /*
   * The reachability ledger's own two entries failed this rule first, saying
   * only "the same screen". A gap with no next action is indistinguishable
   * from a decision nobody made — and the moment a gate opens is exactly when
   * somebody needs the action rather than the description.
   */
  const lazy = /^(waiting|blocked|it becomes possible|this becomes possible|unblocks?)\b/i
  for (const b of BLOCKED) {
    assert.ok(b.onOpen.length > 40, `${b.id}: onOpen is too short to be an instruction`)
    assert.doesNotMatch(b.onOpen, lazy, `${b.id}: onOpen describes a status rather than an action`)
    assert.ok(b.what.length > 20, `${b.id}: does not say what is blocked`)
    assert.ok(b.where.length > 10, `${b.id}: does not say where it lives`)
  }
})

test('🔴 every entry expects to be wrong, and says what to re-read', () => {
  /*
   * `onOpen` is written while the gate is shut, which is the moment we know
   * least. Twice now the answer to a question has been bigger than the
   * question: question one to the lawyer could remove a whole segment from 02,
   * and Meta verifying only moves the wait to Meta reviewing.
   *
   * So the instruction is not "do the work we planned". It is "go back and
   * read the answer for what it implies", and it has to name something to
   * read — a ledger whose every entry said "re-read the answer" would be a
   * field that costs a line and says nothing.
   */
  const vague = /^(re-?read|check|look|review) (it|this|the answer|everything)\.?$/i
  for (const b of BLOCKED) {
    assert.ok(b.thenReRead.length > 40, `${b.id}: thenReRead is too short to name anything`)
    assert.doesNotMatch(b.thenReRead, vague, `${b.id}: thenReRead does not name what to re-read`)
    assert.notEqual(b.thenReRead, b.onOpen, `${b.id}: re-reading the plan is not re-reading the answer`)
  }

  // At least one entry has to record the gate-creates-gates case explicitly,
  // or the lesson lives only in this comment.
  assert.ok(
    BLOCKED.some((b) => /different gate/i.test(b.thenReRead)),
    'no entry records that opening a gate can create one — that is how this ledger goes stale',
  )
})

test('every gate says whose act opens it, and how we would know', () => {
  for (const g of GATES) {
    assert.ok(g.whoHolds.length > 2, `${g.id}: nobody holds it`)
    assert.doesNotMatch(g.whoHolds, /^(us|me|the team)$/i, `${g.id}: a gate held by us is not a gate, it is work`)
    assert.ok(g.evidence.length > 30, `${g.id}: no evidence would tell us it opened, so open could only be a guess`)
  }
})

test('every entry names a gate that exists, and every gate has something waiting', () => {
  const ids = new Set(GATES.map((g) => g.id))
  for (const b of BLOCKED) {
    assert.ok(ids.has(b.gate), `${b.id} names a gate that does not exist: ${b.gate}`)
  }
  // A gate with nothing behind it is either finished work nobody deleted or a
  // gate nobody needed — both worth noticing.
  const used = new Set(BLOCKED.map((b) => b.gate))
  const idle = GATES.filter((g) => !used.has(g.id)).map((g) => g.id)
  assert.deepEqual(idle, [], `gates with nothing waiting on them: ${idle.join(', ')}`)
})

test('ids are unique, so deleting one entry cannot silently delete another', () => {
  const ids = BLOCKED.map((b) => b.id)
  assert.equal(new Set(ids).size, ids.length)
  const gateIds = GATES.map((g) => g.id)
  assert.equal(new Set(gateIds).size, gateIds.length)
})

test('🔴 what holds an automation is asked of the ledger, never assembled twice', () => {
  /*
   * `holds` is a claim, so it gets the same treatment as the rest: it must
   * name a real automation, and the reader must actually return the entry.
   *
   * The absences are deliberate and are asserted as such. An entry with no
   * `holds` is saying "this is not about one automation" — the Enquadramento
   * is a legal reading, invoicing is ours, rehearsal-not-null is a migration.
   * Left unasserted, a forgotten `holds` and a considered absence would look
   * identical, which is the S3-versus-S1 confusion in a different costume.
   */
  const KEYS: AutomationKey[] = [
    'inbound_concierge',
    'db_reactivation',
    'lead_nurture',
    'listing_launch',
    'reputation_loop',
  ]
  const NOT_ONE_AUTOMATION = ['enquadramento', 'month-revenue', 'rehearsal-not-null', 'invoicing', 'setup-instalments']

  for (const b of BLOCKED) {
    if (b.holds === undefined) {
      assert.ok(
        NOT_ONE_AUTOMATION.includes(b.id),
        `${b.id}: no holds, and it is not one of the entries we decided are not about one automation. ` +
          'Either give it one, or add it to that list with the reason.',
      )
      continue
    }
    assert.ok(KEYS.includes(b.holds), `${b.id}: holds a key that is not an automation: ${b.holds}`)
    const found = gatesHoldingAutomation(b.holds).some((x) => x.entries.some((e) => e.id === b.id))
    assert.ok(found, `${b.id}: claims to hold ${b.holds}, but the reader does not return it`)
  }

  for (const id of NOT_ONE_AUTOMATION) {
    assert.ok(BLOCKED.some((b) => b.id === id), `${id} is listed as not-about-one-automation but no longer exists`)
    assert.equal(BLOCKED.find((b) => b.id === id)?.holds, undefined, `${id} now holds an automation — remove it from the list`)
  }

  // 🔴 And an OPEN gate holds nothing. Without this the band would keep
  // showing a wait that ended, which is the stale record the ledger prevents.
  const held = gatesHoldingAutomation('db_reactivation')
  assert.ok(held.length > 0, 'nothing holds 02 — that would be news')
  assert.ok(held.every((x) => !x.gate.open))
})

test('🔴 every gate says which side of the landing it falls on', () => {
  /*
   * The client landing's bands are ordered by WHO CAN ACT, so a gate on the
   * wrong side is not a cosmetic error — it puts an afternoon the agency could
   * book this week into the band labelled "nobody's yet", where the whole
   * point is that it is not re-examined.
   *
   * The two anchors below are the brief's own examples of each band, so if
   * either flips, the screen has stopped matching its design.
   */
  for (const g of GATES) {
    assert.ok(
      g.answerable === 'the agency' || g.answerable === 'outside',
      `${g.id}: no side`,
    )
  }
  const by = (id: GateId) => GATES.find((g) => g.id === id)
  assert.equal(by('calibration_afternoon')?.answerable, 'the agency', 'the calibration afternoon is theirs to book')
  assert.equal(by('first_close')?.answerable, 'the agency', 'reporting a close is theirs to do')
  assert.equal(by('meta_verified')?.answerable, 'outside', 'nobody here can make Meta verify')
  assert.equal(by('portugal_confirmed')?.answerable, 'outside', 'nobody here can answer for the lawyer')
  assert.equal(by('adene_credentials')?.answerable, 'outside')

  // 🔒 And no gate may be answerable by the agency while being held by a party
  // that is plainly not one. That pairing is how a wait ends up in the band
  // where somebody is expected to act on it and nobody can.
  for (const g of GATES.filter((x) => x.answerable === 'the agency')) {
    assert.doesNotMatch(
      g.whoHolds,
      /Meta|ADENE|Margarida|lawyer|advogada|accountant/i,
      `${g.id} is marked answerable by the agency but is held by ${g.whoHolds}`,
    )
  }
})

// ── the control ─────────────────────────────────────────────────────────────

test('the control: an opened gate with work behind it IS reported', () => {
  /*
   * Without this, a silent pass means either "no gate has opened" or "the
   * reader is broken", and those are the same output. The reachability
   * ledger's control asserts the detector can see requireOperator; this one
   * drives the same function with a gate that is open.
   */
  const gate: Gate = {
    id: 'meta_verified',
    what: 'a synthetic gate',
    whoHolds: 'nobody',
    evidence: 'this is a control and never appears in the real ledger',
    answerable: 'outside',
    open: true,
  }
  const waiting: Blocked = {
    id: 'synthetic',
    what: 'a synthetic entry, to prove the reader sees one',
    where: 'this test',
    gate: 'meta_verified',
    onOpen: 'nothing — it exists so that an empty report cannot mean a broken reader',
    thenReRead: 'nothing — the control proves the reader prints this field, not that this sentence is true',
  }

  const opened = openedWork([gate], [waiting])
  assert.equal(opened.length, 1, 'an open gate with work behind it must be reported')
  assert.equal(opened[0].waiting.length, 1)

  const text = report(opened)
  assert.match(text, /DO NOW/, 'the report must carry the next action, not only the fact')
  assert.match(text, /RE-READ/, 'the report must tell the reader to go and check what the answer implies')
  assert.match(text, /synthetic entry/)

  // And a shut gate with the same work behind it is silent.
  assert.equal(openedWork([{ ...gate, open: false }], [waiting]).length, 0)
  // As is an open gate with nothing behind it — that is finished, not pending.
  assert.equal(openedWork([gate], []).length, 0)
})

test('the control: the real ledger is not empty, so a pass means something', () => {
  // A ledger that had quietly become empty would also pass the first test.
  assert.ok(BLOCKED.length > 8, `only ${BLOCKED.length} entries — has the ledger been emptied rather than cleared?`)
  assert.ok(GATES.length >= 6)
  const byGate = new Map<GateId, number>()
  for (const b of BLOCKED) byGate.set(b.gate, (byGate.get(b.gate) ?? 0) + 1)
  console.log(
    `\n  ${BLOCKED.length} entries behind ${byGate.size} gates, all shut:\n` +
      [...byGate].map(([g, n]) => `    ${g}: ${n}`).join('\n') +
      '\n',
  )
})
