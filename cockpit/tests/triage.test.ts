import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { groupForTriage, planPick, type TriageContact } from '../src/lib/matching/triage'
import { TRIAGE, FORBIDDEN_ON_SCREEN } from '../src/lib/matching/screen-copy'

/**
 * The triage floor: the product for an agency with no structured data.
 *
 * Its whole premise is that it works when nothing else does — no thresholds, no
 * criteria, no calibration. So the tests are about what it does with an empty
 * database and a name-and-phone list, not about a well-populated one.
 */

const c = (over: Partial<TriageContact> = {}): TriageContact => ({
  leadId: Math.random().toString(36).slice(2),
  name: 'Maria Santos',
  lastContactAt: null,
  area: null,
  batchId: null,
  batchFilename: null,
  alreadyChosen: false,
  ...over,
})

test('every contact lands in exactly one group', () => {
  // A person under their import batch AND again under their area is the same
  // person offered twice, and an agent who picks them in both places has not
  // made two decisions.
  const contacts = [
    c({ leadId: 'a', batchId: 'b1', batchFilename: 'contactos.xlsx', area: 'Cascais', lastContactAt: '2022-04-01' }),
    c({ leadId: 'b', area: 'Cascais', lastContactAt: '2022-06-01' }),
    c({ leadId: 'd', lastContactAt: '2023-01-01' }),
    c({ leadId: 'e' }),
  ]
  const groups = groupForTriage(contacts)
  const seen = groups.flatMap((g) => g.contacts.map((x) => x.leadId))
  assert.equal(seen.length, new Set(seen).size, 'a contact appears twice')
  assert.deepEqual([...seen].sort(), ['a', 'b', 'd', 'e'], 'and nobody is dropped')
})

test('the contact with no file, no date and no area is still offered', () => {
  // That row IS the name-and-phone list this screen exists for. Leaving them
  // out of the grouping would leave them out of the product.
  const groups = groupForTriage([c({ leadId: 'only' })])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].kind, 'rest')
  assert.deepEqual(groups[0].contacts.map((x) => x.leadId), ['only'])
})

test('the import batch wins over the year, because they chose the file', () => {
  const groups = groupForTriage([
    c({ leadId: 'a', batchId: 'b1', batchFilename: 'antigos.xlsx', lastContactAt: '2022-04-01' }),
  ])
  assert.equal(groups[0].kind, 'batch')
  assert.equal(groups[0].label, 'antigos.xlsx', 'a filename, never a uuid')
})

test('an empty list produces no groups rather than an empty one', () => {
  assert.deepEqual(groupForTriage([]), [])
})

// --- what a pick produces ---------------------------------------------------

const AREAS = ['Cascais', 'Estoril']

test('a criteria-shaped reason becomes requirements the engine can use', () => {
  const p = planPick({ reason: 'Quer uma casa em Cascais com jardim', knownAreas: AREAS })
  assert.equal(p.reasonWasNotCriteria, false)
  const kinds = p.requirements.map((r) => r.kind).sort()
  assert.ok(kinds.includes('area'), 'the town they named')
  assert.ok(kinds.includes('feature'), 'and the thing they want')
  assert.ok(p.requirements.every((r) => r.source === 'agent'), 'recorded as the agent’s, not the lead’s')
})

test('⚠️ a reason that is not criteria still counts as a pick, and says so', () => {
  // "she looked at the house two doors down last spring" is a perfectly good
  // reason and gives the engine nothing. The decision is kept on the match row
  // either way; what must NOT happen is the screen implying the list improved.
  const p = planPick({ reason: 'Ela viu a casa ao lado na primavera passada', knownAreas: AREAS })
  assert.deepEqual(p.requirements, [])
  assert.equal(p.reasonWasNotCriteria, true)
})

test('no reason at all is not a failure', () => {
  const p = planPick({ reason: null, knownAreas: AREAS })
  assert.deepEqual(p.requirements, [])
  assert.equal(p.reasonWasNotCriteria, false, 'an unanswered question is not a wrong answer')
  assert.deepEqual(planPick({ reason: '   ', knownAreas: AREAS }).reasonWasNotCriteria, false)
})

test('an agent’s remark is unorderable, so it widens rather than overrides', () => {
  // Nothing says where an agent's remark sits against what the lead said, so it
  // takes the excludes-least branch of the recency rule. An agent's convenience
  // must not silently narrow a lead's own stated position.
  const p = planPick({ reason: 'Cascais, ate 900 mil', knownAreas: AREAS })
  assert.ok(p.requirements.every((r) => r.order === null || r.order === undefined))
})

// --- the words --------------------------------------------------------------

test('the triage screen claims exactly what it delivers, and no more', () => {
  // The tier ladder's own rule, applied to the screen built to honour it: a
  // pick only improves the ranking if the sentence was criteria-shaped, and the
  // copy must say so rather than promising the list gets better every time.
  assert.match(TRIAGE.whyHelps, /Se for outra coisa/, 'the other case is stated, not implied')
  assert.match(TRIAGE.whyHelps, /não ajuda a ordenar/)
  // And it must not describe the contacts as deficient. "Nothing on record" is
  // a fact about our data; "incomplete" or "poor quality" is a judgement about
  // somebody's client list, said to their face.
  for (const s of [TRIAGE.intro, TRIAGE.what, TRIAGE.title]) {
    assert.doesNotMatch(s, /incomplet|mau|má qualidade|inútil/i)
  }
})

test('no internal vocabulary reaches the triage screen', () => {
  const strings: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') strings.push(v)
    else if (typeof v === 'function') strings.push(String((v as (...a: unknown[]) => string)(2)))
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(TRIAGE)
  assert.ok(strings.length > 15, 'too little copy for the guard to mean anything')
  const offences: string[] = []
  for (const s of strings) {
    for (const term of FORBIDDEN_ON_SCREEN) {
      if (new RegExp(`\\b${term}\\b`, 'i').test(s)) offences.push(`"${term}" in ${JSON.stringify(s.slice(0, 60))}`)
    }
  }
  assert.deepEqual(offences, [], offences.join('\n'))
})

test('a count of one reads as one', () => {
  assert.equal(TRIAGE.countOne, '1 contacto')
  assert.doesNotMatch(TRIAGE.countOne, /contactos/)
  assert.doesNotMatch(TRIAGE.chosenSoFarOne, /pessoas/)
  assert.match(TRIAGE.countMany(3), /contactos/)
  assert.match(TRIAGE.chosenSoFarMany(3), /pessoas/)
})

test('no prose hides in the page where the vocabulary guard cannot see it', () => {
  const PROSE = /[a-zà-ú]{3,}\s+[a-zà-ú]{3,}/i
  const src = readFileSync(new URL('../src/app/listings/[id]/triage/page.tsx', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  const literals = [...src.matchAll(/'([^'\n]{6,})'|"([^"\n]{6,})"/g)].map((m) => m[1] ?? m[2])
  const textNodes = [...src.matchAll(/>([^<>{}\n]+)</g)].map((m) => m[1].trim())
  const prose = [...literals, ...textNodes].filter((s) => PROSE.test(s))
  assert.deepEqual(prose, [], 'these belong in screen-copy.ts:\n' + prose.join('\n'))
})

test('⚠️ the triage path does not read consent, the ledger or the suppression list', () => {
  // §2.1 as written said the screen shows the REACHABLE contacts. It does not:
  // the matching side must not consult the gate, and a screen reaching around
  // that boundary is the same hole with a nicer view. The agent's next act is
  // to write to their own client personally, which is the agency's
  // communication and not ours to gate.
  for (const f of ['triage.ts', 'triage-read.ts', 'triage-actions.ts']) {
    const src = readFileSync(new URL(`../src/lib/matching/${f}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    assert.doesNotMatch(src, /@\/lib\/gate|@\/lib\/suppression|decideGate|consent_by_contact|consent_events/, f)
  }
})
