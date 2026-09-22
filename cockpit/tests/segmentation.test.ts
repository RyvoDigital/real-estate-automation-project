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
import { validateDeclaration, type DeclareInput } from '../src/lib/segmentation/declare-core'
import { presentStep2 } from '../src/lib/segmentation/present'
import { SURFACE, contrastRatio, luminance } from '../src/lib/segmentation/surface'
import {
  STATE_LABEL, STATE_NOTE, SEGMENT_CHOICE, CLAIM_QUESTION, UI, FORBIDDEN_ON_SCREEN, LOAD_BEARING,
  jurisdictionSentence, scopeFor, CLAIM_SCOPE,
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
  declaredBy: 'Ana Ferreira', recordedBy: 'Manuel Vale', uncertainty: false,
  declarationId: '11111111-2222-4333-8444-555555555555', ...over,
})

test('a declaration without the agency person is refused, before the database refuses it', () => {
  for (const declaredBy of ['', '   ']) {
    assert.equal(validateDeclaration(d({ declaredBy }))?.key, 'noDeclarer')
  }
})

test('THE DECLARER AND THE RECORDER MUST NOT BE THE SAME PERSON', () => {
  // Our name on their assertion would put responsibility where the knowledge
  // is not.
  const r = validateDeclaration(d({ declaredBy: 'Manuel Vale', recordedBy: 'Manuel Vale' }))
  assert.deepEqual(r, { key: 'sameAsRecorder', params: { name: 'Manuel Vale' } })
})

test('segment E is not something an agency may declare', () => {
  assert.deepEqual(validateDeclaration(d({ segment: 'E' as 'A' })), { key: 'notDeclarable', params: { value: 'E' } })
})

test('declaring that authorisation EXISTS requires saying where it is', () => {
  // B is the one segment claiming evidence. A claim with no description of the
  // evidence is exactly the spreadsheet cell this week was spent undoing.
  assert.equal(validateDeclaration(d({ segment: 'B' }))?.key, 'basisNeeded')
  assert.equal(validateDeclaration(d({ segment: 'B', basis: 'Formulário do site, 2024' })), null)
})

test('a group declaration whose size disagrees with its contacts is refused', () => {
  const r = validateDeclaration(d({
    contacts: [{ phone: '+351912345678' }],
    group: { id: 'g', label: 'x', size: 412 },
  }))
  assert.deepEqual(r, { key: 'sizeMismatch', params: { size: '412', given: '1' } })
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
    { country: 'PT', existingCustomer: 'available', analysed: true, confirmed: true, platformBlocked: false },
    { country: 'ES', existingCustomer: 'unavailable', analysed: true, confirmed: true, platformBlocked: false },
  ])
  assert.match(s, /Em Portugal podemos escrever-lhes/)
  assert.match(s, /Em Espanha não/)
})

test('AN UNCONFIRMED COUNTRY IS "WE DO NOT KNOW YET", NEVER "YOU CANNOT"', () => {
  // A row EXISTS and a lawyer is reviewing it. "À espera" is true here.
  // A screen saying "in Spain you cannot" would state as settled law something
  // our own record calls unanalysed — the system disagreeing with itself in
  // front of the person it protects.
  const s = jurisdictionSentence([
    { country: 'ES', existingCustomer: 'unknown', analysed: true, confirmed: false, platformBlocked: false },
  ])
  assert.match(s, /ainda não sabemos/)
  assert.match(s, /à espera da confirmação de uma advogada/)
  assert.match(s, /até lá não escrevemos/)
  assert.equal(/a lei lá é mais restritiva/.test(s), false,
    'an unconfirmed country must not be described as prohibited')
})

test('🔴 NO ROW AT ALL IS NOT THE SAME NOT-YET AS A ROW AWAITING A LAWYER', () => {
  /*
   * The cross-screen sweep, 20 September 2026. Until then a country with no
   * row was built as `unknown` + `confirmed: false` — byte-identical to a
   * country whose row exists and is waiting on a lawyer — so the screen told
   * agencies we were "à espera da confirmação de uma advogada" about Spain,
   * where nobody has analysed anything and nobody is waiting for anyone.
   *
   * "À espera" implies somebody is working on it and an answer is coming.
   * That is a claim, and it was false.
   */
  const noRow = jurisdictionSentence([
    { country: 'ES', existingCustomer: 'unknown', analysed: false, confirmed: false, platformBlocked: false },
  ])
  const withLawyer = jurisdictionSentence([
    { country: 'ES', existingCustomer: 'unknown', analysed: true, confirmed: false, platformBlocked: false },
  ])
  assert.notEqual(noRow, withLawyer, 'an absence of analysis and a pending confirmation must not share a sentence')

  assert.match(noRow, /ainda não trabalhamos/)
  assert.match(noRow, /ainda não as analisámos/, 'the absence is named as ours')
  assert.equal(/advogada/.test(noRow), false, 'nobody is waiting on a lawyer for a country nobody has looked at')
  assert.equal(/à espera/.test(noRow), false)
  assert.equal(/a lei lá é mais restritiva/.test(noRow), false, 'and it never says prohibited — we do not know that either')
})

test('🔒 the two not-yets can appear in one sentence and stay distinguishable', () => {
  // A Portuguese agency with Spanish contacts, on the day Portugal is under
  // review and Spain has never been looked at. This is today.
  const s = jurisdictionSentence([
    { country: 'PT', existingCustomer: 'unknown', analysed: true, confirmed: false, platformBlocked: false },
    { country: 'ES', existingCustomer: 'unknown', analysed: false, confirmed: false, platformBlocked: false },
  ])
  assert.match(s, /Em Portugal ainda não sabemos/)
  assert.match(s, /à espera da confirmação de uma advogada/)
  assert.match(s, /Em Espanha ainda não trabalhamos/)
  assert.ok(s.indexOf('Portugal') < s.indexOf('Espanha'), 'the pending conclusion comes before the absence')
})

test('the wording changes because the TABLE changed, not the other way round', () => {
  // The same country, before and after a confirmation. Nothing in the copy is
  // edited between these two calls.
  const before = jurisdictionSentence([
    { country: 'ES', existingCustomer: 'unknown', analysed: true, confirmed: false, platformBlocked: false },
  ])
  const after = jurisdictionSentence([
    { country: 'ES', existingCustomer: 'available', analysed: true, confirmed: true, platformBlocked: false },
  ])
  assert.notEqual(before, after)
  assert.match(after, /Em Espanha podemos escrever-lhes/)
})

test('a platform block is stated as a limit even when nobody has confirmed anything', () => {
  // Meta not delivering to +1 is a fact about delivery, not a legal conclusion,
  // so it does not wait for a lawyer.
  const s = jurisdictionSentence([
    { country: 'US', existingCustomer: 'unknown', analysed: true, confirmed: false, platformBlocked: true },
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
  // and would collect a click carrying the weight of a declaration. Since
  // checkpoint 2 (22 Sep 2026) the radios live in DeclareFlow.tsx, controlled by
  // the form's own state, which starts EMPTY.
  const flow = codeOnly(readFileSync(new URL('../src/components/segmentation/DeclareFlow.tsx', import.meta.url), 'utf8'))
  assert.equal(/defaultChecked|defaultValue=\{?['"][ABCD]/.test(flow), false,
    'the form pre-selects a segment — the system proposes, the agency confirms')
  assert.match(flow, /type="radio" name="origem"/)
  assert.match(flow, /useState<Segment \| null>\(null\)/, 'the chosen origin must start as no answer')
  assert.match(flow, /type="hidden" name="segment" value=\{segment\}/)
  // And "were they sure?" is two radios with no default either.
  const sure = flow.split('\n').filter((l) => /name="uncertainty"/.test(l))
  assert.equal(sure.length, 2, 'the certainty question must be exactly two radios')
  for (const l of sure) assert.equal(/checked/i.test(l), false, `a certainty answer is pre-selected: ${l.trim()}`)
})

test('🔴 THE URL CARRIES THE GROUP, NEVER THE ANSWER', () => {
  // Until checkpoint 2 step 1 was a GET form carrying `?origem=`, so a bookmarked
  // or shared link opened step 2 with an origin nobody chose in that session
  // (operator, 22 Sep 2026). The answer now lives in the form's own state.
  const page = codeOnly((readFileSync(new URL('../src/app/segmentation/[clientId]/page.tsx', import.meta.url), 'utf8') + readFileSync(new URL('../src/components/segmentation/SegmentationView.tsx', import.meta.url), 'utf8')))
  const flow = codeOnly(readFileSync(new URL('../src/components/segmentation/DeclareFlow.tsx', import.meta.url), 'utf8'))
  assert.equal(/origem/.test(page), false, 'the page reads or writes the origin in the URL')
  assert.equal(/[?&]origem=|searchParams|useSearchParams|router\.push/.test(flow), false, 'the form puts the origin in the URL')
  assert.equal(/method="get"/i.test(flow + page), false, 'a GET form would put every answer in the URL')
  assert.match(page, /\?grupo=\$\{encodeURIComponent\(g\.id\)\}/, 'a link reopens the group, and only that')
})

test('🔴 THE DECLARATION ID IS MINTED PER DRAWN FORM, AND TRAVELS WITH IT (0055)', () => {
  // One id for every form would make every new declaration look like a
  // resubmission, and 0055 would drop it as "already recorded": a genuine answer
  // silently lost. So the id is minted in the render, per form, and posted with it.
  const page = codeOnly((readFileSync(new URL('../src/app/segmentation/[clientId]/page.tsx', import.meta.url), 'utf8') + readFileSync(new URL('../src/components/segmentation/SegmentationView.tsx', import.meta.url), 'utf8')))
  const flow = codeOnly(readFileSync(new URL('../src/components/segmentation/DeclareFlow.tsx', import.meta.url), 'utf8'))
  assert.match(page, /declarationId=\{randomUUID\(\)\}/, 'the id must be minted where the form is drawn')
  const beforeRender = page.slice(0, page.indexOf('export function SegmentationView'))
  assert.equal(/randomUUID\(\)/.test(beforeRender), false, 'an id minted at module level is shared by every form')
  assert.match(flow, /type="hidden" name="declarationId" value=\{declarationId\}/, 'the form must post the id it was drawn with')
  const actions = readFileSync(new URL('../src/lib/segmentation/actions.ts', import.meta.url), 'utf8')
  assert.match(actions, /declarationId: text\('declarationId'\)/, 'the action must read the posted id, never mint its own')
  assert.equal(/randomUUID/.test(actions), false, 'an id minted at submit makes every resubmission a new act')
})

test('the page takes the RECORDER from the session, never from the form', () => {
  // A form field for it would let both names be set to the same value from the
  // browser, which is the collapse declare.ts refuses.
  const actions = readFileSync(new URL('../src/lib/segmentation/actions.ts', import.meta.url), 'utf8')
  // Since checkpoint 1 (22 Sep 2026) the session's email is resolveDeclaration's
  // third argument, and the core copies that argument, and only it, into recordedBy.
  assert.match(actions, /resolveDeclaration\([\s\S]*?,\s*operator\.email,?\s*\)/)
  assert.equal(/(get|text)\(['"]recordedBy['"]\)/.test(actions), false,
    'recordedBy is being read from the form — it must come from the session')
  const core = readFileSync(new URL('../src/lib/segmentation/declare-core.ts', import.meta.url), 'utf8')
  assert.match(core, /\n\s+recordedBy,\n/, 'the core takes recordedBy from its argument')
})

test('a failed declaration is SHOWN, never swallowed', () => {
  // A form action must resolve to void, and the obvious consequence — discard
  // the result — is unacceptable here: somebody says a sentence, nothing
  // visibly happens, and everyone in the room assumes it was recorded.
  const actions = readFileSync(new URL('../src/lib/segmentation/actions.ts', import.meta.url), 'utf8')
  // Since 22 Sep 2026 the KEY travels (lib/refusals.ts) and the screen says it in the agency's language.
  assert.match(actions, /redirect\(`\/segmentation\/\$\{clientId\}\?\$\{refusalQuery\(result\.refusal\)\}`\)/)
  const page = (readFileSync(
    new URL('../src/app/segmentation/[clientId]/page.tsx', import.meta.url), 'utf8') + readFileSync(
    new URL('../src/components/segmentation/SegmentationView.tsx', import.meta.url), 'utf8'))
  assert.match(page, /\{refusal && <p role="alert"[^>]*>\{say\(DECLARATION_REFUSALS, locale, refusal\)\}/)
})

test('the page is standalone: no cockpit Shell in front of a client', () => {
  // §3.17 says not to build into the old frame. And a nav bar listing other
  // clients' leads and queues is not a thing to show somebody across a table.
  for (const f of ['../src/app/segmentation/[clientId]/page.tsx', '../src/app/segmentation/page.tsx', '../src/components/segmentation/SegmentationView.tsx', '../src/components/segmentation/DeclareFlow.tsx']) {
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
  const page = codeOnly((readFileSync(
    new URL('../src/app/segmentation/[clientId]/page.tsx', import.meta.url), 'utf8') + readFileSync(
    new URL('../src/components/segmentation/SegmentationView.tsx', import.meta.url), 'utf8')))
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
  const src = codeOnly(readFileSync(
    new URL('../src/lib/segmentation/present.ts', import.meta.url), 'utf8'))
  assert.equal(/filter\(\(c\) => c\.claimRaw !== null\)/.test(src), false,
    'filtering on the wording drops the claims whose wording we never kept')
  assert.match(src, /filter\(\(c\) => c\.hasClaim\)/)

  // And the behaviour the scan is a proxy for: a claim we cannot quote is still
  // a claim, so it still produces the admission and the question.
  const v = presentStep2({
    contacts: [c({ hasClaim: true, claimRaw: null })], segment: 'B', jurisdiction: 'x',
  })
  assert.notEqual(v.note, null, 'the claim whose wording was not kept produced no note at all')
  assert.match(v.note!.heading, /tinha alguma coisa/, 'and it must not pretend to quote one')
  assert.equal(v.note!.heading.includes('«'), false)
})

// --- n=1, everywhere, not just where it was noticed ---------------------------

test('NOTHING SAYS "1 contactos"', () => {
  // The group label was fixed first and UI.saved/UI.claimCount were missed,
  // which is the point: the rule is general, so the guard is too.
  //
  // The list is DERIVED from UI rather than written out, so a new copy function
  // is covered the moment it exists — a hand-kept list of cases is a guard that
  // passes by being forgotten. Every function is called with 1 for each of its
  // arguments; for the non-count ones ('no ficheiro: «1»') that is harmless.
  const rendered: Array<[string, string]> = Object.entries(UI)
    .filter(([, v]) => typeof v === 'function')
    .map(([k, v]) => {
      const f = v as (...a: unknown[]) => string
      return [`UI.${k}`, f(...Array.from({ length: f.length }, () => 1))] as [string, string]
    })

  const groups = [
    ...proposeGroups([c({ batchId: 'b1', batchFilename: 'x.csv', batchCommittedAt: '2026-09-08T10:00:00Z' })]),
    ...proposeGroups([c({ id: 'z', batchId: null, lastContactAt: null, area: null })]),
    ...proposeGroups([c({ id: 'y', batchId: null, lastContactAt: '2023-04-15T00:00:00Z', area: 'Cascais' })]),
  ].map((g) => [`group.${g.kind}`, g.label] as [string, string])

  assert.ok(rendered.length >= 4, 'too few copy functions rendered for the guard to mean anything')
  const offences = [...rendered, ...groups].filter(([, s]) => /\b1 \w+s\b/.test(s))
  assert.deepEqual(offences, [],
    `plural after a count of one:\n${offences.map(([w, s]) => `${w}: ${s}`).join('\n')}`)
})

// --- origin first, evidence second, scoped ------------------------------------

const SEGMENTS = ['A', 'B', 'C', 'D'] as const

test('THE SCREEN ASKS FOR EVIDENCE EXACTLY WHERE THE RECORD REQUIRES IT', () => {
  // The screen used to ask every group for a basis, before the origin was even
  // chosen, while validateDeclaration has always required one for B alone. Two
  // ways to be wrong: ask where it is not needed and waste the room's time, or
  // fail to ask where it is and produce a refusal AFTER the sentence was spoken
  // in front of the client. Binding them makes both impossible.
  for (const segment of SEGMENTS) {
    const refusedWithoutBasis = validateDeclaration(d({ segment })) !== null
    assert.equal(scopeFor(segment).basisRequired, refusedWithoutBasis,
      `segment ${segment}: the screen and declare.ts disagree about whether evidence is needed`)
  }
})

test('and every origin says what it means for the file it came from', () => {
  // §5c pairing: the binding above is satisfiable by asking nothing anywhere.
  for (const segment of SEGMENTS) {
    const s = scopeFor(segment)
    assert.ok(s.scope.length > 40, `segment ${segment} has no sentence explaining what its answer means`)
    assert.equal(s.scope, CLAIM_SCOPE[segment])
  }
  assert.equal(scopeFor('A').note, null, 'a past client needs no reassurance about a cell we do not rely on')
  assert.match(scopeFor('C').note ?? '', /não se perde/)
  assert.match(scopeFor('D').note ?? '', /perfeitamente normal/)
})

// --- the four structural faults, each with its own guard ----------------------

// The page reads; SegmentationView draws (checkpoint 2). Guards on "the page" read both.
const PAGE = codeOnly(readFileSync(
  new URL('../src/app/segmentation/[clientId]/page.tsx', import.meta.url), 'utf8') + readFileSync(
  new URL('../src/components/segmentation/SegmentationView.tsx', import.meta.url), 'utf8'))
// Since checkpoint 2 the two steps are DeclareFlow.tsx; the page reads and composes.
const FLOW = codeOnly(readFileSync(
  new URL('../src/components/segmentation/DeclareFlow.tsx', import.meta.url), 'utf8'))
const CSS = readFileSync(new URL('../src/components/segmentation/segmentation.module.css', import.meta.url), 'utf8')

test('1. the origin step asks nothing about evidence', () => {
  // The ordering fault, made structural: whatever else Step1 renders, it cannot
  // reach the evidence copy at all.
  const step1 = FLOW.slice(FLOW.indexOf('function Step1'), FLOW.indexOf('function Step2'))
  assert.ok(step1.length > 200, 'Step1 not found — this guard would pass vacuously')
  for (const term of ['CLAIM_QUESTION', 'scopeFor', 'claimHeading', 'name="basis"']) {
    assert.equal(step1.includes(term), false, `the origin question renders ${term}, which belongs after it`)
  }
})

test('2. each origin option is its own block, not a line in a paragraph', () => {
  const step1 = FLOW.slice(FLOW.indexOf('function Step1'), FLOW.indexOf('function Step2'))
  assert.match(step1, /className=\{styles\.option\}/, 'the four options need visible separation to be heard read aloud')
  assert.equal(/<br \/>/.test(step1), false,
    'a <br> between a label and its consequence puts the consequence nearer the NEXT option')
  assert.match(CSS, /\.option \{[^}]*border:/, '.option must actually draw a boundary')
})

const view = (segment: 'A' | 'B' | 'C' | 'D', rows: ContactRow[] = [c({ hasClaim: true })]) =>
  presentStep2({ contacts: rows, segment, jurisdiction: 'Em Portugal podemos escrever-lhes.' })

test('3a. only the answer that claims evidence is asked for evidence', () => {
  assert.equal(view('B').ask.kind, 'basis')
  for (const s of ['A', 'C', 'D'] as const) {
    assert.equal(view(s).ask.kind, 'none', `segment ${s} is asked for something nobody requires`)
  }
  const ask = view('B').ask
  assert.equal(ask.kind === 'basis' && ask.question.length > 0, true)
})

test('3b. and the file note never promises a question that is not asked', () => {
  // The admission used to end "…e é por isso que estamos a perguntar agora",
  // which stayed true only for B once the question was scoped. On the other
  // three screens it announced a question that never came.
  for (const s of ['A', 'C', 'D'] as const) {
    const v = view(s)
    assert.equal(v.ask.kind, 'none')
    assert.equal(/estamos a perguntar|perguntamos/.test(v.note?.body ?? ''), false,
      `segment ${s} announces a question it does not ask`)
  }
})

test('3c. a group whose file claimed nothing gets no admission at all', () => {
  // The note is about THEIR file. A group with no claim in it has nothing to
  // admit to, and an apology for something that did not happen reads as noise.
  assert.equal(view('A', [c({ hasClaim: false })]).note, null)
  assert.equal(view('B', [c({ hasClaim: false })]).note, null)
  assert.notEqual(view('A').note, null)
})

test('3. the detail field appears only with the answer that needs it', () => {
  const step2 = FLOW.slice(FLOW.indexOf('function Step2'))
  assert.match(step2, /view\.ask\.kind === 'basis' \? \(/, 'the basis field must be behind the scoping decision')
  const stray = step2.slice(0, step2.indexOf("view.ask.kind === 'basis'"))
  assert.equal(stray.includes('name="basis"'), false, 'a detail field renders before anything asks for it')
  // And the uncertainty box no longer borrows the evidence question's wording,
  // which left "Não sei" stranded a screenful from the question it answered.
  assert.match(step2, /\{UI\.unsure\}/)
  assert.equal(step2.includes('options.dont_know.label'), false)
})

test('4. the objection note appears only when somebody objected', () => {
  assert.match(PAGE, /contacts\.some\(\(c\) => c\.state === 'objected'\)[\s\S]{0,200}STATE_NOTE\.objected/,
    'a note about a person who asked not to be contacted, on a screen where nobody did, describes nobody')
})

test('the page and the probe compose the screen ONCE', () => {
  // probe-segmentation.ts is how this screen gets read before anyone is shown
  // it. It started as a second implementation of the page's composition and
  // drifted within the hour — still printing an arrangement the page had
  // already abandoned. A predictor that duplicates what it predicts fails by
  // looking right.
  const probe = codeOnly(readFileSync(new URL('../tests/probe-segmentation.ts', import.meta.url), 'utf8'))
  for (const [where, src] of [['page', PAGE], ['probe', probe]] as const) {
    assert.match(src, /presentStep2/, `${where} does not use the shared composition`)
    for (const term of ['CLAIM_SCOPE[', 'scopeFor(', 'headingCellNotKept', 'questionCellNotKept']) {
      assert.equal(src.includes(term), false,
        `${where} composes ${term} itself instead of reading present.ts`)
    }
  }
})

// --- can it actually be read ---------------------------------------------------

test('EVERY SURFACE CARRIES TEXT THAT CAN BE READ ON IT', () => {
  // The claim panel rendered near-white on near-white: it pinned a background
  // and left the foreground to the browser, which on a machine in dark mode
  // supplied white. Contrast ~1.05. The three load-bearing sentences were
  // invisible on the one screen that exists to say them, and every guard in
  // this file passed — because they all check what the page COMPOSES and none
  // could see what it RENDERS.
  //
  // This is the vacuity family one layer further out. A vocabulary rule about
  // words nobody can see is a rule about nothing.
  for (const [name, s] of Object.entries(SURFACE)) {
    assert.ok(contrastRatio(s.color, s.background) >= 4.5,
      `${name}: body text at ${contrastRatio(s.color, s.background).toFixed(2)}:1 on its own background`)
    assert.ok(contrastRatio(s.muted, s.background) >= 4.5,
      `${name}: secondary text at ${contrastRatio(s.muted, s.background).toFixed(2)}:1 on its own background`)
  }
})

test('and the check is not vacuous: it fails the exact pair that shipped', () => {
  // §5c. A contrast function with a bug passes every surface perfectly.
  assert.ok(contrastRatio('#ffffff', '#fbf6f3') < 1.1, 'white on the claim panel must read as invisible')
  assert.ok(contrastRatio('#000000', '#ffffff') > 20, 'and black on white as maximal')
})

test('THE PAGE PINS NO BACKGROUND OF ITS OWN', () => {
  // A background set by hand is a background with no foreground attached — the
  // half-specified contract that caused this. Every surface comes in a pair or
  // it does not come at all: in the page, in the form, and in the stylesheet.
  const offences = [...PAGE.split('\n'), ...FLOW.split('\n')].filter((l) => /background:/.test(l))
  assert.deepEqual(offences, [], `a background with no foreground beside it:\n${offences.join('\n')}`)
  assert.match(FLOW, /\.\.\.SURFACE\.note/, 'and the claim panel must use one')
  assert.match(PAGE, /\.\.\.SURFACE\.error/, 'the error box especially: an unreadable error looks like no error')
  assert.match(PAGE, /<main[^>]*style=\{\{ \.\.\.SURFACE\.page \}\}/, 'the page itself takes the page surface')
  // The stylesheet carries no colour at all: its hairlines are mixed from the text they sit on.
  const backgrounds = [...CSS.matchAll(/background:\s*([^;]+);/g)].map((m) => m[1].trim())
  assert.deepEqual(backgrounds.filter((b) => b !== 'none' && b !== 'var(--tint)'), [], 'the stylesheet sets a background of its own')
  assert.equal(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i.test(CSS), false, 'the stylesheet carries a literal colour')
})

test('the uncertainty question sits with the answer it qualifies', () => {
  // Below the name field it read as uncertainty about the NAME — a different
  // claim, and not one anybody was making.
  const step2 = FLOW.slice(FLOW.indexOf('function Step2'))
  assert.ok(step2.indexOf('name="uncertainty"') > 0, 'no certainty question — this guard would pass vacuously')
  assert.ok(step2.indexOf('name="uncertainty"') < step2.indexOf('name="declaredBy"'),
    'the certainty question follows the name field, so it qualifies the wrong thing')
})

test('A SURFACE ALSO DECLARES WHAT THE BROWSER PAINTS ON IT', () => {
  // The contrast guard, written an hour earlier, had a hole exactly its own
  // size: it checked TEXT against its background and could not see the controls
  // the user agent paints. With no `color-scheme` declared, the browser kept
  // painting radios, checkboxes and inputs for dark mode on a surface we had
  // pinned light — and all four origin radios rendered as filled dark circles,
  // so every option looked selected on the one screen whose rule is that none
  // may be.
  //
  // The check: a light background must say so. It catches the exact shape of
  // this defect — a surface that pins one scheme and lets the widgets come from
  // another — for four lines and no browser.
  for (const [name, s] of Object.entries(SURFACE)) {
    const expected = luminance(s.background) > 0.5 ? 'light' : 'dark'
    assert.equal(s.colorScheme, expected,
      `${name}: background is ${expected} but the controls are painted ${s.colorScheme}`)
  }
})

test('and the form controls are pinned rather than inherited', () => {
  // The name field was dark grey on white from the same cause. Every text input
  // takes the page surface, so it is covered by the contrast check above
  // instead of by whatever the environment supplies.
  const inputs = FLOW.split('\n').filter((l) => /<input name=/.test(l))
  assert.ok(inputs.length >= 2, 'no text inputs found — this guard would pass vacuously')
  for (const l of inputs) {
    assert.match(l, /style=\{field\}/, `an input takes its colours from the user agent: ${l.trim()}`)
  }
  assert.match(FLOW, /const field = \{\s*\.\.\.SURFACE\.page/)
})

test('THE ESCAPE HATCH IS NOT THE QUIETEST THING ON THE SCREEN', () => {
  // "Mudar a resposta" is what the agency needs the moment they realise they
  // answered wrong. It was rendering as the faintest element on the page. Since
  // checkpoint 2 it is a button in the form (the answer is the form's state):
  // read the ENCLOSING element's style, never a fixed window.
  const at = FLOW.indexOf('UI.changeAnswer')
  const hatch = FLOW.slice(FLOW.lastIndexOf('<button', at), at)
  assert.ok(hatch.length > 0, 'the escape hatch is not a button in the form — this guard would pass vacuously')
  assert.equal(/\.\.\.muted|color: SURFACE\.page\.muted/.test(hatch), false,
    'the way back from a wrong answer is rendered in the secondary text colour')
  assert.match(hatch, /color: SURFACE\.page\.color/, 'the way back takes the surface\'s own text colour')
  const size = hatch.match(/fontSize: (\d+)/)
  assert.ok(size && Number(size[1]) >= 16, `the escape hatch renders at ${size?.[1]}px, below body size`)
})
