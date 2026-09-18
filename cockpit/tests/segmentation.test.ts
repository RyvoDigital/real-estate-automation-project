/*
 * The segmentation screen's logic and its words.
 *
 * Two properties this file defends:
 *   the AGENCY declares and WE record, and the row keeps them apart
 *   nothing a client can see is written in our vocabulary
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { proposeGroups, describeContact, sharedClaimCell, type ContactRow } from '../src/lib/segmentation/groups'
import { validateDeclaration, type DeclareInput } from '../src/lib/segmentation/declare'
import {
  STATE_LABEL, STATE_NOTE, SEGMENT_CHOICE, CLAIM_QUESTION, UI, FORBIDDEN_ON_SCREEN, LOAD_BEARING, jurisdictionSentence,
} from '../src/lib/segmentation/copy'

/** Comment lines dropped, code kept — see one-sender.test.ts for why line-based. */
function codeOnly(text: string): string {
  return text.split('\n')
    .filter((l) => {
      const s = l.trimStart()
      return !s.startsWith('//') && !s.startsWith('*') && !s.startsWith('/*') && !s.startsWith('{/*')
    })
    .join('\n')
}

const c = (over: Partial<ContactRow> = {}): ContactRow => ({
  id: 'c1', phone: '+351912345678', fullName: 'Maria Santos',
  lastContactAt: '2023-04-15T00:00:00Z', area: 'Cascais',
  batchId: null, batchFilename: null, batchCommittedAt: null,
  state: 'undetermined', claimRaw: null,
  // `hasClaim` derives from `claimRaw` unless a case states it: a row with a
  // quoted cell and no claim is not a state read.ts can produce, and a fixture
  // that can build impossible rows tests a system nobody runs.
  hasClaim: over.hasClaim ?? over.claimRaw != null,
  ...over,
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

test('THE THREE LOAD-BEARING SENTENCES ARE STILL THERE, VERBATIM', () => {
  // Each is doing a job a shorter version would drop, and each is exactly the
  // kind of sentence trimmed for brevity by somebody who was not in the room.
  const all = everyRenderedString().map(([, s]) => s).join(' ')
  for (const sentence of LOAD_BEARING) {
    assert.ok(all.includes(sentence), `the copy no longer contains: "${sentence}"`)
  }
})

test('the objection is explained, not just stated', () => {
  // "É definitivo" is correct and cold: in a meeting an agency owner hears a
  // system being rigid rather than a person being protected. The permanence
  // stays; the reason comes with it.
  assert.match(STATE_NOTE.objected, /pediu para não receber/)
  assert.match(STATE_NOTE.objected, /Respeitamos isso/)
})

test('the jurisdiction sentence comes FROM THE TABLE, and names the limit', () => {
  // "Noutros países depende do país" is true and says nothing; an agency with
  // Spanish contacts would find out the hard way. But the sentence must also
  // never assert a conclusion the table does not hold.
  const s = jurisdictionSentence([
    { country: 'PT', existingCustomer: 'available', confirmed: true, platformBlocked: false },
    { country: 'ES', existingCustomer: 'unavailable', confirmed: true, platformBlocked: false },
  ])
  assert.match(s, /Em Portugal podemos escrever-lhes/)
  assert.match(s, /Em Espanha não/)
})

test('AN UNCONFIRMED COUNTRY IS "WE DO NOT KNOW YET", NEVER "YOU CANNOT"', () => {
  // Spain is `unknown` pending a lawyer. A screen saying "in Spain you cannot"
  // would state as settled law something our own record calls unanalysed — the
  // system disagreeing with itself in front of the person it protects.
  const s = jurisdictionSentence([
    { country: 'ES', existingCustomer: 'unknown', confirmed: false, platformBlocked: false },
  ])
  assert.match(s, /ainda não sabemos/)
  assert.match(s, /à espera da confirmação de uma advogada/)
  assert.match(s, /até lá não escrevemos/)
  assert.equal(/a lei lá é mais restritiva/.test(s), false,
    'an unconfirmed country must not be described as prohibited')
})

test('the wording changes because the TABLE changed, not the other way round', () => {
  // The same country, before and after a confirmation. Nothing in the copy is
  // edited between these two calls.
  const before = jurisdictionSentence([
    { country: 'ES', existingCustomer: 'unknown', confirmed: false, platformBlocked: false },
  ])
  const after = jurisdictionSentence([
    { country: 'ES', existingCustomer: 'available', confirmed: true, platformBlocked: false },
  ])
  assert.notEqual(before, after)
  assert.match(after, /Em Espanha podemos escrever-lhes/)
})

test('a platform block is stated as a limit even when nobody has confirmed anything', () => {
  // Meta not delivering to +1 is a fact about delivery, not a legal conclusion,
  // so it does not wait for a lawyer.
  const s = jurisdictionSentence([
    { country: 'US', existingCustomer: 'unknown', confirmed: false, platformBlocked: true },
  ])
  assert.match(s, /Em Estados Unidos não/)
})

test('and the static fallback claims nothing about any country', () => {
  assert.equal(/Portugal|Espanha/.test(SEGMENT_CHOICE.A.consequence), false,
    'the hardcoded sentence must not be a second source of truth about the law')
})

test('segment D leads with what survives, because the bias must point TOWARDS it', () => {
  // A false A authorises a send; a false D costs a contact. The wording must
  // not push away from the answer whose error is cheaper.
  assert.match(SEGMENT_CHOICE.D.consequence, /^Fica guardado/)
  assert.match(SEGMENT_CHOICE.D.consequence, /não escrevemos/)
})

test('THE PAGE NEVER PRE-SELECTS A SEGMENT', () => {
  // The most consequential line on the screen, and the easiest to add by
  // accident: `defaultChecked` on the first radio would look like a convenience
  // and would collect a click carrying the weight of a declaration.
  // Read as CODE, not as prose: the first version tripped on its own comment
  // explaining why pre-selection is forbidden. A check that fires on the words
  // describing it is measuring the wrong artefact (§6b).
  const page = codeOnly(readFileSync(
    new URL('../src/app/segmentation/[clientId]/page.tsx', import.meta.url), 'utf8'))
  assert.equal(/defaultChecked|defaultValue=\{?['"][ABCD]/.test(page), false,
    'the page pre-selects a segment — the system proposes, the agency confirms')
  assert.match(page, /type="radio" name="segment"/)
})

test('the page takes the RECORDER from the session, never from the form', () => {
  // A form field for it would let both names be set to the same value from the
  // browser, which is the collapse declare.ts refuses.
  const actions = readFileSync(new URL('../src/lib/segmentation/actions.ts', import.meta.url), 'utf8')
  assert.match(actions, /recordedBy: operator\.email/)
  assert.equal(/get\(['"]recordedBy['"]\)/.test(actions), false,
    'recordedBy is being read from the form — it must come from the session')
})

test('a failed declaration is SHOWN, never swallowed', () => {
  // A form action must resolve to void, and the obvious consequence — discard
  // the result — is unacceptable here: somebody says a sentence, nothing
  // visibly happens, and everyone in the room assumes it was recorded.
  const actions = readFileSync(new URL('../src/lib/segmentation/actions.ts', import.meta.url), 'utf8')
  assert.match(actions, /erro=\$\{encodeURIComponent\(result\.reason\)\}/)
  const page = readFileSync(
    new URL('../src/app/segmentation/[clientId]/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /role="alert"/)
})

test('the page is standalone: no cockpit Shell in front of a client', () => {
  // §3.17 says not to build into the old frame. And a nav bar listing other
  // clients' leads and queues is not a thing to show somebody across a table.
  for (const f of ['../src/app/segmentation/[clientId]/page.tsx', '../src/app/segmentation/page.tsx']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
    assert.equal(/<Shell/.test(src), false, `${f} renders the cockpit Shell`)
  }
})

test('THE PAGE CONTAINS NO PROSE AT ALL: every word comes from copy.ts', () => {
  // The first version tried to extract JSX text with a regex and matched CODE —
  // `const jurisdiction = …` and `c.claimRaw !== null` — because telling text
  // from code needs a parser. A crude heuristic produces false positives now
  // and false negatives later.
  //
  // So the rule is stronger and exactly checkable instead: ALL rendered text
  // lives in copy.ts, and the page therefore contains no string literal that
  // reads as a sentence. Two consecutive words of three or more letters is
  // prose; CSS ("1px solid #eee"), attributes and identifiers are not.
  //
  // And it caught a real leak on its first run: four Portuguese strings written
  // straight into the JSX, which would have bypassed the vocabulary guard
  // entirely without anybody meaning to.
  const page = codeOnly(readFileSync(
    new URL('../src/app/segmentation/[clientId]/page.tsx', import.meta.url), 'utf8'))
  // Newlines excluded, or the quotes pair across the whole file and one
  // "literal" spans three hundred lines of code.
  // TWO places prose can hide, and the first version only looked in one.
  //
  // Sabotage proved it: replacing {UI.noContacts} with bare JSX text passed
  // clean, because a text node is not a quoted literal. A guard that survives
  // its own sabotage has not been shown to work (§0.7) — and the hole was in
  // the more likely direction, since writing text straight into JSX is easier
  // than quoting it.
  const PROSE = /[a-zà-ú]{3,}\s+[a-zà-ú]{3,}/i

  // Newlines excluded, or the quotes pair across the whole file and one
  // "literal" spans three hundred lines of code.
  const literals = [...page.matchAll(/'([^'\n]{6,})'|"([^"\n]{6,})"/g)].map((m) => m[1] ?? m[2])
  // And JSX text nodes: a run between > and < on one line, containing no
  // braces, which is what distinguishes text from an expression.
  const textNodes = [...page.matchAll(/>([^<>{}\n]+)</g)].map((m) => m[1].trim())

  const prose = [...literals, ...textNodes].filter((s) => PROSE.test(s))
  assert.deepEqual(prose, [],
    'these strings are prose and belong in copy.ts, where the vocabulary guard can see them:\n' +
    prose.map((s) => `  ${JSON.stringify(s)}`).join('\n'))
})

// --- the degenerate case, which is the one people watch ------------------------

test('a group of one reads as one', () => {
  // The first real run had a single contact, and the label said "1 contactos".
  // A screen turned around in a meeting is judged on sentences like this one
  // long before it is judged on whether the grouping is correct.
  const g = proposeGroups([
    c({ id: '1', batchId: 'b1', batchFilename: 'lista.csv', batchCommittedAt: '2026-09-08T10:00:00Z' }),
  ])
  assert.equal(g[0].label, '1 contacto · lista.csv · importado 8 Set 2026')
  for (const [, s] of g.map((x) => [x.kind, x.label] as const)) {
    assert.equal(/\b1 contactos\b|\b1 \w+s\b/.test(s) && !/1 contacto\b/.test(s), false, s)
  }
})

// --- what we may quote back to them -------------------------------------------

test('THE QUOTED CELL COMES FROM THE FILE OR IT DOES NOT APPEAR', () => {
  // A claim whose wording was not retained. `?? 'sim'` in read.ts used to fill
  // this in, which put a word in the agency's mouth, in quotation marks, on the
  // one screen whose force depends on quoting their file exactly.
  assert.equal(sharedClaimCell([c({ hasClaim: true, claimRaw: null })]), null)

  // Disagreeing cells cannot be summarised by picking one of them.
  assert.equal(sharedClaimCell([
    c({ id: '1', hasClaim: true, claimRaw: 'sim' }),
    c({ id: '2', hasClaim: true, claimRaw: 'y' }),
  ]), null)

  assert.equal(sharedClaimCell([
    c({ id: '1', hasClaim: true, claimRaw: 'y' }),
    c({ id: '2', hasClaim: true, claimRaw: 'y' }),
  ]), 'y')
})

test('and no constant carries a quotation of its own', () => {
  // The quotation is DATA. A constant containing one is a claim about a file
  // nobody has read — which is how 'O seu ficheiro dizia «sim»' shipped.
  const q = CLAIM_QUESTION
  for (const [where, s] of [
    ['headingWithCell.before', q.headingWithCell.before],
    ['headingWithCell.after', q.headingWithCell.after],
    ['headingCellNotKept', q.headingCellNotKept],
    ['questionWithCell.before', q.questionWithCell.before],
    ['questionWithCell.after', q.questionWithCell.after],
    ['questionCellNotKept', q.questionCellNotKept],
  ] as const) {
    assert.equal(s.includes('«'), false, `${where} quotes a cell that no file was read for: ${s}`)
  }
})

test('a claim with no retained wording is still asked about', () => {
  // The page filtered on `claimRaw !== null`, so the honest null made the hard
  // question disappear for precisely the contacts it exists to ask about.
  const rows = [c({ hasClaim: true, claimRaw: null })]
  assert.equal(rows.filter((r) => r.hasClaim).length, 1)
})

test('NO FALLBACK EVER SUPPLIES A WORDING', () => {
  // read.ts is a database read, so nothing above covers the line that caused
  // this: `(e.wording as string) ?? ev?.claimed_consent?.raw ?? 'sim'`.
  //
  // Falling back to 'undetermined' or 'unknown' elsewhere in that file is fine
  // — those are the LOUD state, an admission. Falling back to a WORDING is the
  // opposite: it manufactures evidence, and the ledger design says in as many
  // words that `wording = null` means NOT RETAINED and is never invented.
  const src = codeOnly(readFileSync(new URL('../src/lib/segmentation/read.ts', import.meta.url), 'utf8'))
  const offences = src.split('\n')
    .filter((l) => /wording|claimRaw|claimed_consent/.test(l) && /\?\?\s*['\`"]/.test(l))
  assert.deepEqual(offences, [], `a literal stands in for a cell we do not hold:\n${offences.join('\n')}`)
  assert.match(src, /wording as string \| null\) \?\? ev\?\.claimed_consent\?\.raw \?\? null/,
    'the chain must end in null, which is what "we did not keep it" looks like')
})

test('and the screen asks about a claim, not about its text', () => {
  // `claimRaw !== null` as the has-a-claim test made the hard question vanish
  // for the contacts whose wording was not kept — silently, on the screen whose
  // entire purpose is to ask it.
  const page = codeOnly(readFileSync(
    new URL('../src/app/segmentation/[clientId]/page.tsx', import.meta.url), 'utf8'))
  assert.equal(/filter\(\(c\) => c\.claimRaw !== null\)/.test(page), false,
    'filtering on the wording drops the claims whose wording we never kept')
  assert.match(page, /filter\(\(c\) => c\.hasClaim\)/)
})
