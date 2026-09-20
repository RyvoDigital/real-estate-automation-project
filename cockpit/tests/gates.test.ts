import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BLOCKED, GATES, type Blocked, type Gate, type GateId } from '../src/lib/gates'

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
    open: true,
  }
  const waiting: Blocked = {
    id: 'synthetic',
    what: 'a synthetic entry, to prove the reader sees one',
    where: 'this test',
    gate: 'meta_verified',
    onOpen: 'nothing — it exists so that an empty report cannot mean a broken reader',
  }

  const opened = openedWork([gate], [waiting])
  assert.equal(opened.length, 1, 'an open gate with work behind it must be reported')
  assert.equal(opened[0].waiting.length, 1)

  const text = report(opened)
  assert.match(text, /DO NOW/, 'the report must carry the next action, not only the fact')
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
