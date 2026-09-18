import test from 'node:test'
import assert from 'node:assert/strict'

import { LANGS, renderReason, type Detail, type Lang, type Reason } from '../src/lib/matching/reason'

/**
 * Every reason must be sayable in every language.
 *
 * The defect this exists to prevent is not a crash. It is an English sentence
 * appearing inside a Portuguese screen — which nothing would report, and which
 * would be discovered by an agent reading their own screen in a meeting.
 *
 * So the check is not "does it render". It is: does it render DIFFERENTLY in
 * each language, in every branch. A renderer that silently returned the English
 * for an unmapped variant would pass any "it produced a string" test perfectly.
 */

/** One instance of EVERY Detail variant. Adding a variant fails to compile. */
const EVERY_DETAIL: Record<Detail['t'], Detail> = {
  budget_inside: { t: 'budget_inside', price: 900_000, max: 1_000_000 },
  budget_stretched: { t: 'budget_stretched', price: 2_200_000, max: 2_000_000, pct: 15, stated: true },
  budget_beyond: { t: 'budget_beyond', price: 950_000, ceiling: 840_000 },
  budget_nothing_to_compare: { t: 'budget_nothing_to_compare' },
  area_exact: { t: 'area_exact', area: 'Cascais' },
  area_adjacent: { t: 'area_adjacent', area: 'Estoril', near: 'Cascais' },
  area_none: { t: 'area_none' },
  area_no: { t: 'area_no', area: 'Faro', wanted: ['Cascais', 'Estoril'] },
  bedrooms_ok: { t: 'bedrooms_ok', has: 4, want: 4 },
  bedrooms_no: { t: 'bedrooms_no', has: 1, want: 4 },
  bedrooms_unknown: { t: 'bedrooms_unknown' },
  type_ok: { t: 'type_ok', type: 'moradia' },
  type_no: { t: 'type_no', type: 'apartamento', wanted: ['moradia'] },
  feature_has: { t: 'feature_has', feature: 'garden' },
  feature_no: { t: 'feature_no', feature: 'south facing' },
}

const DETAILS = Object.values(EVERY_DETAIL)

test('every detail says something in every language', () => {
  for (const d of DETAILS) {
    for (const lang of LANGS) {
      const s = renderReason({ role: 'met', detail: d, evidence: null }, lang)
      assert.ok(s.length > 3, `${d.t} in ${lang} rendered nothing usable: ${JSON.stringify(s)}`)
      assert.doesNotMatch(s, /undefined|null|NaN|\[object/, `${d.t} in ${lang}: ${s}`)
    }
  }
})

/**
 * ⚠️ COMPARED ON THE WORDS, NOT ON THE RENDERED STRING.
 *
 * The first version compared whole renderings, and a sabotage that made the
 * Portuguese an exact copy of the English turned NOTHING red. The reason:
 * numbers are formatted for the locale, so
 *
 *   pt  "€900 000 cabe nos €1 000 000 que indicou"
 *   en  "€900,000 is inside their €1,000,000"
 *
 * differ on the separators alone. Two identical templates therefore produced
 * two different strings, and the guard was blind to a fallback in any detail
 * carrying a number — eight of the fifteen variants, including every budget
 * case. A check that cannot see part of its own subject (lessons 13d), found
 * by sabotage rather than by reading.
 */
const words = (s: string) => s.replace(/[\d.,\s€%]+/g, ' ').trim()

test('⚠️ no language silently falls back to another', () => {
  // The failure being designed out: a variant added to the union, mapped in
  // English, and left identical in Portuguese — which reads as working and is
  // the exact thing that would reach an agent's screen.
  const offenders: string[] = []
  for (const d of DETAILS) {
    const said = new Map<Lang, string>()
    for (const lang of LANGS) {
      said.set(lang, words(renderReason({ role: 'met', detail: d, evidence: null }, lang)))
    }
    // A detail with no words of its own — pure numbers and a place name — can
    // legitimately coincide. Those are listed, so a coincidence has to be
    // declared rather than discovered.
    // Details whose words legitimately coincide once the numbers are stripped.
    // Listed, so a coincidence is declared rather than discovered.
    const MAY_COINCIDE: Detail['t'][] = ['area_exact', 'bedrooms_ok']
    if (MAY_COINCIDE.includes(d.t)) continue
    for (const a of LANGS) {
      for (const b of LANGS) {
        if (a >= b) continue
        if (said.get(a) === said.get(b)) offenders.push(`${d.t}: ${a} and ${b} are identical — "${said.get(a)}"`)
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'))
})

test('every role renders, including the ones that carry no detail', () => {
  const roles: Reason[] = [
    { role: 'nothing_binding' },
    { role: 'met', detail: EVERY_DETAIL.area_exact, evidence: 'quero Cascais' },
    { role: 'missed', detail: EVERY_DETAIL.feature_no, evidence: null },
    { role: 'failed', detail: EVERY_DETAIL.area_no, evidence: null },
    { role: 'superseded', rule: 'later', evidence: 'ate 800 mil', instead: 'ate 1 milhao' },
    { role: 'superseded', rule: 'widest', evidence: 'ate 800 mil', instead: 'ate 1 milhao' },
    { role: 'superseded', rule: 'later', evidence: null, instead: null },
  ]
  for (const r of roles) {
    for (const lang of LANGS) {
      const s = renderReason(r, lang)
      assert.ok(s.length > 5, `${r.role} in ${lang} rendered nothing`)
      assert.doesNotMatch(s, /undefined|null\b/, `${r.role} in ${lang}: ${s}`)
    }
  }
})

test('the lead’s own words are quoted verbatim, in every language', () => {
  // The quote is the product (§4.2). It is the lead's sentence and must not be
  // translated, reworded or trimmed — only framed.
  const quote = 'não abdico do jardim'
  for (const lang of LANGS) {
    const s = renderReason({ role: 'met', detail: EVERY_DETAIL.feature_has, evidence: quote }, lang)
    assert.ok(s.includes(quote), `${lang} lost or altered the lead's own words: ${s}`)
  }
})

test('money is formatted for the reader, not for us', () => {
  const r: Reason = { role: 'met', detail: EVERY_DETAIL.budget_inside, evidence: null }
  // en-GB groups with commas, pt-PT with a narrow space. Asserting they DIFFER
  // rather than asserting an exact byte, because the separator is the runtime's
  // to choose and pinning it would break on a Node upgrade for no reason.
  assert.notEqual(renderReason(r, 'en'), renderReason(r, 'pt'))
  assert.match(renderReason(r, 'en'), /€900,000/)
  assert.doesNotMatch(renderReason(r, 'pt'), /€900,000/)
})

test('an unknown feature is shown as it is, never dropped and never guessed', () => {
  const s = renderReason(
    { role: 'met', detail: { t: 'feature_has', feature: 'adega' }, evidence: null },
    'pt',
  )
  assert.match(s, /adega/, 'a feature with no translation is still reported')
})

test('⚠️ the article belongs to the sentence, not to the word', () => {
  // Found by PRINTING the worked example, not by a test: the English feature
  // map held "a garden", which reads right after `has` and produced
  // "Misses: no a south aspect" after `no`. Every rendering is now checked for
  // the shapes an article in the wrong place makes.
  const BROKEN = /\b(?:no|has) a a\b|\bno a \b|\btem a \b|\btiene a \b/
  for (const f of ['garden', 'pool', 'parking', 'lift', 'south facing', 'adega']) {
    for (const lang of LANGS) {
      for (const t of ['feature_has', 'feature_no'] as const) {
        const s = renderReason({ role: 'met', detail: { t, feature: f }, evidence: null }, lang)
        assert.doesNotMatch(s, BROKEN, `${t} ${f} in ${lang}: ${s}`)
      }
    }
  }
  // And the two that must read right, stated rather than implied.
  assert.match(renderReason({ role: 'met', detail: { t: 'feature_has', feature: 'garden' }, evidence: null }, 'en'), /has a garden/)
  assert.match(renderReason({ role: 'missed', detail: { t: 'feature_no', feature: 'south facing' }, evidence: null }, 'en'), /Misses: no south aspect/)
  assert.match(renderReason({ role: 'met', detail: { t: 'feature_has', feature: 'parking' }, evidence: null }, 'en'), /has parking/)
})
