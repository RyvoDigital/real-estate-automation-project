/*
 * The segmentation screen's logic and its words.
 *
 * Two properties this file defends:
 *   the AGENCY declares and WE record, and the row keeps them apart
 *   nothing a client can see is written in our vocabulary
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { proposeGroups, describeContact, type ContactRow } from '../src/lib/segmentation/groups'
import { validateDeclaration, type DeclareInput } from '../src/lib/segmentation/declare'
import {
  STATE_LABEL, STATE_NOTE, SEGMENT_CHOICE, CLAIM_QUESTION, UI, FORBIDDEN_ON_SCREEN,
} from '../src/lib/segmentation/copy'

const c = (over: Partial<ContactRow> = {}): ContactRow => ({
  id: 'c1', phone: '+351912345678', fullName: 'Maria Santos',
  lastContactAt: '2023-04-15T00:00:00Z', area: 'Cascais',
  batchId: null, batchFilename: null, batchCommittedAt: null,
  state: 'undetermined', claimRaw: null, ...over,
})

// --- grouping ---------------------------------------------------------------

test('the import batch is the first group, because they chose the file', () => {
  const rows = [
    c({ id: '1', batchId: 'b1', batchFilename: 'contactos-antigos.xlsx', batchCommittedAt: '2026-03-14T10:00:00Z' }),
    c({ id: '2', batchId: 'b1', batchFilename: 'contactos-antigos.xlsx', batchCommittedAt: '2026-03-14T10:00:00Z' }),
    c({ id: '3', batchId: null }),
  ]
  const g = proposeGroups(rows)
  assert.equal(g[0].kind, 'batch')
  assert.equal(g[0].label, '2 contactos · contactos-antigos.xlsx · importados 14 Mar 2026')
  assert.deepEqual(g[0].contactIds, ['1', '2'])
})

test('A CONTACT APPEARS IN EXACTLY ONE GROUP', () => {
  // Overlapping groups would let the same person be declared twice in one
  // sitting, with two different answers and no way to tell which was meant.
  const rows = [
    c({ id: '1', batchId: 'b1', batchFilename: 'f.xlsx', lastContactAt: '2023-01-01T00:00:00Z', area: 'Cascais' }),
    c({ id: '2', batchId: null, lastContactAt: '2023-01-01T00:00:00Z', area: 'Cascais' }),
    c({ id: '3', batchId: null, lastContactAt: null, area: 'Cascais' }),
    c({ id: '4', batchId: null, lastContactAt: null, area: null }),
  ]
  const g = proposeGroups(rows)
  const all = g.flatMap((x) => x.contactIds)
  assert.equal(all.length, new Set(all).size, 'a contact is in two groups')
  assert.equal(all.length, 4, 'every contact is in exactly one group')
})

test('a group counts how many carry a claim, because that drives the hard question', () => {
  const rows = [
    c({ id: '1', batchId: 'b1', batchFilename: 'f.xlsx', claimRaw: 'sim' }),
    c({ id: '2', batchId: 'b1', batchFilename: 'f.xlsx', claimRaw: null }),
  ]
  assert.equal(proposeGroups(rows)[0].withClaim, 1)
})

test('NO GROUP ARRIVES WITH A PRE-SELECTED PROPOSAL', () => {
  // The Enquadramento requires the system to propose and the agency to confirm.
  // A pre-ticked option collects a click rather than a decision, and the click
  // carries the legal weight of a declaration (§11d).
  const rows = [c({ id: '1', batchId: 'b1', batchFilename: 'f.xlsx' }), c({ id: '2' })]
  for (const g of proposeGroups(rows)) {
    assert.equal(g.proposal, null, `${g.id} arrived with a proposal pre-attached`)
  }
})

// --- the declaration --------------------------------------------------------

const d = (over: Partial<DeclareInput> = {}): DeclareInput => ({
  clientId: 'client', contacts: [{ phone: '+351912345678' }], segment: 'A',
  declaredBy: 'Ana Ferreira', recordedBy: 'Manuel Vale', ...over,
})

test('a declaration without the agency person is refused, before the database refuses it', () => {
  for (const declaredBy of ['', '   ']) {
    assert.match(validateDeclaration(d({ declaredBy }))!, /person at the agency/)
  }
})

test('THE DECLARER AND THE RECORDER MUST NOT BE THE SAME PERSON', () => {
  // Our name on their assertion would put responsibility where the knowledge
  // is not.
  const r = validateDeclaration(d({ declaredBy: 'Manuel Vale', recordedBy: 'Manuel Vale' }))
  assert.match(r!, /the agency declares and we record/i)
})

test('segment E is not something an agency may declare', () => {
  assert.match(validateDeclaration(d({ segment: 'E' as 'A' }))!, /not something an agency may declare/)
})

test('declaring that authorisation EXISTS requires saying where it is', () => {
  // B is the one segment claiming evidence. A claim with no description of the
  // evidence is exactly the spreadsheet cell this week was spent undoing.
  assert.match(validateDeclaration(d({ segment: 'B' }))!, /which form, which system, what date/)
  assert.equal(validateDeclaration(d({ segment: 'B', basis: 'Formulário do site, 2024' })), null)
})

test('a group declaration whose size disagrees with its contacts is refused', () => {
  const r = validateDeclaration(d({
    contacts: [{ phone: '+351912345678' }],
    group: { id: 'g', label: 'x', size: 412 },
  }))
  assert.match(r!, /must agree or the record misstates/)
})

// --- the words --------------------------------------------------------------

function everyRenderedString(): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const walk = (name: string, v: unknown) => {
    if (typeof v === 'string') out.push([name, v])
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(`${name}.${k}`, x)
  }
  walk('STATE_LABEL', STATE_LABEL); walk('STATE_NOTE', STATE_NOTE)
  walk('SEGMENT_CHOICE', SEGMENT_CHOICE); walk('CLAIM_QUESTION', CLAIM_QUESTION); walk('UI', UI)
  return out.filter(([, s]) => typeof s === 'string' && s.length > 0)
}

test('NO INTERNAL VOCABULARY REACHES A RENDERED STRING', () => {
  // The screen is used in a meeting, on a laptop turned around. A word that has
  // to be explained in front of a client has already cost you the room.
  const offences: string[] = []
  for (const [where, text] of everyRenderedString()) {
    for (const term of FORBIDDEN_ON_SCREEN) {
      if (new RegExp(`\\b${term}\\b`, 'i').test(text)) offences.push(`${where}: "${term}" in ${JSON.stringify(text.slice(0, 60))}`)
    }
  }
  assert.deepEqual(offences, [], offences.join('\n'))
})

test('and the guard is not vacuous: every state has a human label', () => {
  // A screen that renders nothing passes the check above perfectly. This is the
  // §5c pairing: the vocabulary rule is only meaningful if the states are
  // actually shown.
  for (const state of ['consented', 'declared', 'objected', 'claimed_unevidenced', 'undetermined']) {
    assert.ok(STATE_LABEL[state], `${state} has no human label — the screen cannot show it at all`)
    assert.ok(STATE_NOTE[state], `${state} has no explanatory sentence`)
    assert.equal(STATE_LABEL[state].includes(state), false, `${state} is labelled with its own internal name`)
  }
  for (const seg of ['A', 'B', 'C', 'D'] as const) {
    assert.ok(SEGMENT_CHOICE[seg].label.length > 10, `segment ${seg} has no human label`)
    assert.ok(SEGMENT_CHOICE[seg].consequence.length > 10,
      `segment ${seg} does not say what happens if it is chosen — the consequence must be shown BEFORE the answer`)
  }
  assert.ok(everyRenderedString().length > 25, 'too little copy for the guard to be meaningful')
})

test('the hard question has three options and the honest ones are not punished', () => {
  const o = CLAIM_QUESTION.options
  assert.equal(Object.keys(o).length, 3, 'a binary question forces a lie when the truth is "I do not know"')
  assert.ok(o.dont_know.label.length > 0, '"I do not know" must be first-class, not a fallback')
  assert.match(o.dont_know.note, /perfeitamente normal/, 'and normalised in the text')
  assert.match(o.no_record.note, /não se perde/, 'honesty has to be affordable or you get compliance theatre')
  assert.equal(o.have_record.needsDetail, true, 'a yes must be specific — harder to invent than a tick')
  assert.match(CLAIM_QUESTION.body, /erro nosso/, 'it starts from OUR error, which is true and removes the thing being defended')
})

test('a contact is described without its internal state ever appearing', () => {
  const shown = describeContact(c({ state: 'claimed_unevidenced', fullName: null }))
  assert.equal(shown.state, 'O seu ficheiro dizia que sim')
  assert.equal(shown.name, 'Sem nome no ficheiro')
  assert.equal(/claimed|unevidenced/i.test(JSON.stringify(shown)), false)
})
