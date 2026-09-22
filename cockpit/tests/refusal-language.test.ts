/*
 * No agency-facing screen can render an English refusal (operator, 22 Sep 2026).
 *
 * /segmentation, /calibrate and the listing screens are used with somebody from
 * the agency beside the operator. Until 22 Sep 2026 every refusal their save
 * logic returned was an English sentence, carried in `?erro=` and printed as
 * given. Now the cores return a KEY (lib/refusals.ts), the sentences live in the
 * Portuguese copy files, and each screen says the key in the agency's language.
 *
 * What fails this file:
 *   - an English sentence in any locale's set;
 *   - a key a core can return that the catalogue does not have;
 *   - a core, an action or a screen that still carries a sentence (`erro=`,
 *     a raw database message, a prop that prints what it is given);
 *   - a second locale's set that does not have exactly the Portuguese keys and
 *     placeholders (the structure Spanish will be added in, as data).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DECLARATION_REFUSALS, FORBIDDEN_ON_SCREEN as SEG_FORBIDDEN } from '../src/lib/segmentation/copy'
import { SAVE_REFUSALS, FORBIDDEN_ON_SCREEN as MATCH_FORBIDDEN } from '../src/lib/matching/screen-copy'
import { say, localeFor, fill, refusalQuery, refusalFrom } from '../src/lib/refusals'

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const code = (rel: string) => src(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/[^\n'"`]*$/gm, '')

/**
 * English, as a detector: words that occur in any English refusal sentence and
 * in no Portuguese one. Whole words, any case. Deliberately the connective
 * tissue of English (the, was, nothing, could) rather than a dictionary: a
 * sentence cannot be written without it.
 */
const ENGLISH = ['the', 'and', 'was', 'were', 'is', 'has', 'have', 'this', 'that', 'nothing', 'recorded', 'could', 'be', 'of',
  'to', 'for', 'with', 'by', 'already', 'just', 'someone', 'reload', 'screen', 'form', 'while', 'who', 'which', 'belongs']
const english = (s: string) => ENGLISH.filter((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(s))

const CATALOGUES = [
  ['DECLARATION_REFUSALS', DECLARATION_REFUSALS as Record<string, Record<string, string>>, SEG_FORBIDDEN as readonly string[]],
  ['SAVE_REFUSALS', SAVE_REFUSALS as Record<string, Record<string, string>>, MATCH_FORBIDDEN as readonly string[]],
] as const

test('🔴 no refusal sentence, in any locale\'s set, is English', () => {
  const offences: string[] = []
  for (const [name, cat] of CATALOGUES) {
    for (const [locale, set] of Object.entries(cat)) {
      for (const [key, sentence] of Object.entries(set)) {
        const hits = english(sentence)
        if (hits.length) offences.push(`${name}.${locale}.${key}: English (${hits.join(', ')}) in ${JSON.stringify(sentence.slice(0, 60))}`)
      }
    }
  }
  assert.deepEqual(offences, [], offences.join('\n'))
})

test('and the detector is not vacuous: it catches the sentences that shipped', () => {
  // §5c: a detector with a bug passes everything. These are the exact English refusals the screens printed until today.
  assert.ok(english('The agency chooses and we record; the record keeps them apart. Nothing was recorded.').length > 3)
  assert.ok(english('Rui Antunes just chose this contact for this property, while this form was open.').length > 3)
  assert.ok(english('This group changed after the screen was drawn (a contact was added or removed).').length > 3)
  assert.deepEqual(english(SAVE_REFUSALS.pt['pick.justChosen']), [], 'and it does not fire on the Portuguese')
})

test('🔒 every refusal sentence passes its screen family\'s vocabulary guard', () => {
  const offences: string[] = []
  for (const [name, cat, forbidden] of CATALOGUES) {
    for (const [locale, set] of Object.entries(cat)) {
      for (const [key, sentence] of Object.entries(set)) {
        for (const term of forbidden) {
          if (new RegExp(`\\b${term}\\b`, 'i').test(sentence)) offences.push(`${name}.${locale}.${key}: "${term}"`)
        }
      }
    }
  }
  assert.deepEqual(offences, [], offences.join('\n'))
})

test('🔴 every key a core can return is in its catalogue, so none can fall through to the fallback', () => {
  const keysIn = (rel: string) => [...code(rel).matchAll(/\bkey: '([\w.]+)'/g)].map((m) => m[1])
  const declaration = keysIn('../src/lib/segmentation/declare-core.ts').concat(keysIn('../src/lib/segmentation/actions.ts'))
  const save = ['../src/lib/matching/calibrate-core.ts', '../src/lib/matching/pick-core.ts', '../src/lib/publication/exemption-core.ts', '../src/lib/publication/exemption.ts']
    .flatMap(keysIn)
  assert.ok(declaration.length >= 10 && save.length >= 20, 'too few keys found — this guard would pass vacuously')
  for (const k of declaration) assert.ok(k in DECLARATION_REFUSALS.pt, `declare-core returns "${k}", which DECLARATION_REFUSALS does not have`)
  for (const k of save) assert.ok(k in SAVE_REFUSALS.pt, `a save core returns "${k}", which SAVE_REFUSALS does not have`)
})

test('🔴 no core carries a sentence, and no database message reaches a refusal', () => {
  for (const rel of ['../src/lib/segmentation/declare-core.ts', '../src/lib/matching/calibrate-core.ts', '../src/lib/matching/pick-core.ts',
    '../src/lib/publication/exemption-core.ts', '../src/lib/publication/exemption.ts']) {
    const c = code(rel)
    assert.doesNotMatch(c, /\breason: [`'"]/, `${rel} returns a sentence as a reason`)
    assert.doesNotMatch(c, /refusal:[^\n]*error\.message/, `${rel} passes a database message into a refusal`)
    // String literals of three or more English words: a sentence written in code.
    const sentences = [...c.matchAll(/'([^'\n]{12,})'|`([^`\n]{12,})`/g)].map((m) => m[1] ?? m[2]).filter((s) => english(s).length >= 3)
    assert.deepEqual(sentences, [], `${rel} still carries English sentences:\n${sentences.join('\n')}`)
  }
})

test('🔴 no action puts a sentence in the URL, and no screen prints one it was given', () => {
  for (const rel of ['../src/lib/segmentation/actions.ts', '../src/lib/matching/calibrate-actions.ts',
    '../src/lib/matching/triage-actions.ts', '../src/lib/publication/exemption-actions.ts']) {
    const c = code(rel)
    assert.doesNotMatch(c, /erro=/, `${rel} still redirects with ?erro=`)
    assert.match(c, /refusalQuery\(/, `${rel} does not redirect with the refusal's key`)
  }
  for (const rel of ['../src/components/segmentation/SegmentationView.tsx', '../src/components/calibrate/CalibrateView.tsx',
    '../src/components/listings/TriageView.tsx', '../src/components/listings/ExemptionView.tsx',
    '../src/app/segmentation/[clientId]/page.tsx', '../src/app/calibrate/[clientId]/page.tsx',
    '../src/app/listings/[id]/triage/page.tsx', '../src/app/listings/[id]/exemption/page.tsx']) {
    const c = code(rel)
    assert.doesNotMatch(c, /\berro\b/, `${rel} still takes or prints ?erro=`)
  }
  for (const rel of ['../src/components/segmentation/SegmentationView.tsx', '../src/components/calibrate/CalibrateView.tsx',
    '../src/components/listings/TriageView.tsx', '../src/components/listings/ExemptionView.tsx']) {
    assert.match(code(rel), /\{refusal && <p role="alert"[^>]*>\{say\((DECLARATION|SAVE)_REFUSALS, [^)]*refusal\)\}/, `${rel} does not say the refusal through the catalogue`)
  }
})

test('🔒 SPANISH IS DATA: a second set must have exactly the Portuguese keys and placeholders, and is then chosen by locale', () => {
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
  for (const [name, cat] of CATALOGUES) {
    const pt = cat.pt
    for (const [locale, set] of Object.entries(cat)) {
      assert.deepEqual(Object.keys(set).sort(), Object.keys(pt).sort(), `${name}.${locale} does not have exactly the Portuguese keys`)
      for (const k of Object.keys(pt)) assert.equal(placeholders(set[k]), placeholders(pt[k]), `${name}.${locale}.${k} has different placeholders`)
    }
  }
  // The mechanism, with a Spanish set supplied as data only: no code changes.
  const withEs = { pt: SAVE_REFUSALS.pt, es: { ...SAVE_REFUSALS.pt, 'pick.justChosen': '{name} acaba de elegir este contacto.' } }
  assert.equal(localeFor(withEs, 'es-ES'), 'es')
  assert.equal(say(withEs, 'es-ES', { key: 'pick.justChosen', params: { name: 'Lucía' } }), 'Lucía acaba de elegir este contacto.')
  assert.equal(localeFor(SAVE_REFUSALS, 'es-ES'), 'pt', 'an agency whose language has no set yet reads Portuguese, not English')
  assert.equal(localeFor(SAVE_REFUSALS, null), 'pt')
})

test('the key and its params survive the URL; nothing else does', () => {
  const r = { key: 'pick.justChosen', params: { name: 'Rui Antunes' } }
  const q = new URLSearchParams(refusalQuery(r))
  assert.deepEqual(refusalFrom({ recusa: q.get('recusa') ?? undefined, p: q.get('p') ?? undefined }), r)
  assert.deepEqual(refusalFrom({ recusa: 'x', p: '{"name":{"evil":1},"ok":"y"}' }), { key: 'x', params: { ok: 'y' } }, 'a non-string param is dropped')
  assert.deepEqual(refusalFrom({ recusa: 'x', p: 'not json' }), { key: 'x', params: undefined })
  assert.equal(refusalFrom({}), null)
  assert.equal(say(SAVE_REFUSALS, 'pt-PT', { key: 'no.such.key' }), SAVE_REFUSALS.pt.unknown, 'an unknown key is said as the set\'s own fallback, in Portuguese')
  assert.equal(fill('{name} escolheu', {}), '{name} escolheu', 'a missing param stays visible, never silently blank')
})
