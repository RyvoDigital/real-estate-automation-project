import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CALIBRATE, FORBIDDEN_ON_SCREEN, LISTINGS, MATCHES, STATUS_WORD,
} from '../src/lib/matching/screen-copy'
import {
  EMPTY_ANSWERS, deriveThresholds, explainSaved, parseAdjacency, problemsWith, type Answers,
} from '../src/lib/matching/thresholds'
import { missingThresholds } from '../src/lib/matching/score'

/**
 * The three screens' words and the calibration arithmetic.
 *
 * The calibration screen is used with an agent sitting next to the operator, so
 * it gets the segmentation screen's guard: no internal vocabulary reaches a
 * rendered string, and no prose hides in the JSX where that guard cannot see it.
 */

// --- every string a screen can show -----------------------------------------

function everyRenderedString(): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const walk = (name: string, v: unknown) => {
    if (typeof v === 'string') out.push([name, v])
    else if (typeof v === 'function') {
      /*
       * Rendered strings behind a function are still rendered strings, and a
       * guard that skipped them would miss exactly the places a number or a
       * name is interpolated.
       *
       * CALLED AT THE FUNCTION'S OWN ARITY. The first version guessed two
       * arguments and then three, and pushed BOTH results — so a three-argument
       * template called with two produced "undefined" in the output and the
       * vocabulary guard dutifully reported it as a leak. The check was
       * accusing its own harness (lessons 13d), and the copy was fine.
       *
       * The assertion below makes that unfixable-by-accident: any `undefined`
       * in a rendered string is now a harness fault reported as one.
       */
      const fn = v as (...a: unknown[]) => string
      const produced = String(fn(...Array.from({ length: fn.length }, () => 2)))
      assert.doesNotMatch(
        produced, /undefined/,
        `${name} was called with ${fn.length} argument(s) and still produced "undefined" — ` +
          'the harness is mis-calling it, or the template reads an argument it was not given',
      )
      out.push([name, produced])
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) walk(`${name}.${k}`, x)
    }
  }
  walk('LISTINGS', LISTINGS)
  walk('STATUS_WORD', STATUS_WORD)
  walk('MATCHES', MATCHES)
  walk('CALIBRATE', CALIBRATE)
  return out.filter(([, s]) => s.length > 0)
}

test('NO INTERNAL VOCABULARY REACHES A RENDERED STRING', () => {
  const offences: string[] = []
  for (const [where, text] of everyRenderedString()) {
    for (const term of FORBIDDEN_ON_SCREEN) {
      if (new RegExp(`\\b${term}\\b`, 'i').test(text)) {
        offences.push(`${where}: "${term}" in ${JSON.stringify(text.slice(0, 70))}`)
      }
    }
  }
  assert.deepEqual(offences, [], offences.join('\n'))

  // §5c pairing: the rule above is only meaningful if there is copy to check
  // and every state has a human label. A screen rendering nothing would pass
  // the vocabulary rule perfectly.
  assert.ok(everyRenderedString().length > 40, 'too little copy for the guard to be meaningful')
  for (const status of ['available', 'reserved', 'under_offer', 'sold', 'withdrawn']) {
    assert.ok(STATUS_WORD[status], `${status} has no human word`)
    assert.equal(STATUS_WORD[status].includes(status), false, `${status} is labelled with its own name`)
  }
  for (const s of ['strong', 'possible', 'weak']) {
    assert.ok(MATCHES.strengthWord[s], `${s} has no human word`)
  }
})

test('the refusal is a sentence a person can act on, not a state', () => {
  // "not configured" is a dead end. This is the screen's whole reason to exist
  // today, because every run refuses.
  assert.ok(MATCHES.notCalibrated.length > 80)
  assert.doesNotMatch(MATCHES.notCalibrated, /config|threshold|valor|par[âa]metro/i)
  assert.ok(MATCHES.notCalibratedAction.length > 5, 'and it offers the way out')
})

test('no prose hides in a page where the vocabulary guard cannot see it', () => {
  // ALL rendered text lives in screen-copy.ts, so the page holds no string
  // literal and no JSX text node that reads as a sentence. Two consecutive
  // words of three or more letters is prose; CSS and identifiers are not.
  //
  // Both places are checked: the segmentation version of this guard originally
  // looked only at quoted literals and was sabotaged by writing text straight
  // into JSX, which is the easier thing to do by accident.
  const PROSE = /[a-zà-ú]{3,}\s+[a-zà-ú]{3,}/i
  const pages = [
    '../src/app/listings/page.tsx',
    '../src/app/listings/[id]/page.tsx',
    '../src/app/calibrate/page.tsx',
    '../src/app/calibrate/[clientId]/page.tsx',
  ]
  const offences: string[] = []
  for (const rel of pages) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const literals = [...src.matchAll(/'([^'\n]{6,})'|"([^"\n]{6,})"/g)].map((m) => m[1] ?? m[2])
    const textNodes = [...src.matchAll(/>([^<>{}\n]+)</g)].map((m) => m[1].trim())
    for (const s of [...literals, ...textNodes]) {
      if (PROSE.test(s)) offences.push(`${rel}: ${JSON.stringify(s)}`)
    }
  }
  assert.deepEqual(offences, [],
    'these belong in screen-copy.ts, where the vocabulary guard can see them:\n' + offences.join('\n'))
})

test('a count of one reads as one', () => {
  // The first real run of the segmentation screen had a single contact and said
  // "1 contactos". Every count on these screens has its own singular.
  assert.equal(LISTINGS.countOne, '1 imóvel')
  assert.doesNotMatch(LISTINGS.countOne, /imóveis/)
  assert.doesNotMatch(MATCHES.consideredOne, /1 contactos/)
  assert.doesNotMatch(MATCHES.lastSpokeOne, /meses/)
  // "1 desses contactos não tem" is correct Portuguese — the plural belongs to
  // the SET, not to the one. The rule is about a number sitting directly on a
  // plural noun ("1 contactos"), which is the thing that reads as a bug, so the
  // assertion is on that shape and not on the word appearing at all.
  assert.doesNotMatch(MATCHES.nothingOnRecordOne, /\b1 contactos\b/)
  assert.match(MATCHES.nothingOnRecordOne, /não tem\b/, 'and the verb agrees with the one')
  assert.match(MATCHES.nothingOnRecordMany(3), /não têm\b/, 'while the plural agrees with many')
  // And the plural forms really are plural, so the pair is not two singulars.
  assert.match(LISTINGS.countMany(4), /imóveis/)
  assert.match(MATCHES.lastSpokeMany(4), /meses/)
})

// --- the calibration arithmetic ---------------------------------------------

const ANSWERED: Answers = {
  budgetSaid: 2_000_000,
  budgetMost: 2_100_000,
  budgetStretchMost: 2_300_000,
  showsOneFewerBedroom: true,
  ofHowMany: 4,
  strongAtLeast: 3,
  possibleAtLeast: 2,
  adjacency: 'Cascais: Estoril, Parede',
}

test('an agent answers in euros and the engine gets its six numbers', () => {
  const t = deriveThresholds(ANSWERED)
  assert.equal(t.budget_stretch, 0.05)
  assert.equal(t.budget_stretch_with_evidence, 0.15)
  assert.equal(t.bedrooms_tolerance, 1)
  assert.equal(t.min_score_strong, 0.75)
  assert.equal(t.min_score_possible, 0.5)
  assert.deepEqual(missingThresholds(t), [], 'a complete answer leaves nothing missing')
})

test('nothing is pre-filled, and an empty form is refused', () => {
  // §4.6: a pre-filled field collects a click rather than a decision, and the
  // click would be recorded as an agency's judgement about their own market.
  for (const v of Object.values(EMPTY_ANSWERS)) {
    assert.ok(v === null || v === '', 'a default answer is a guess wearing an agency’s name')
  }
  const p = problemsWith(EMPTY_ANSWERS)
  assert.ok(p.length >= 7, 'every unanswered question is named')
  assert.ok(p.every((x) => CALIBRATE.problem[x.why]), 'every problem has words a person can hear')
})

test('adjacency works in both directions, because the agent means it that way', () => {
  // A one-way adjacency would show the Cascais lead an Estoril house while
  // refusing the Estoril lead the Cascais one — a difference nobody intended
  // and nobody would see.
  const a = parseAdjacency('Cascais: Estoril, Parede')
  assert.deepEqual(a.Cascais, ['Estoril', 'Parede'])
  assert.deepEqual(a.Estoril, ['Cascais'])
  assert.deepEqual(a.Parede, ['Cascais'])
})

test('adjacency ignores what is not a pair, and may be empty', () => {
  assert.deepEqual(parseAdjacency(''), {})
  assert.deepEqual(parseAdjacency('Cascais'), {}, 'a line with no colon is not a pair')
  assert.deepEqual(parseAdjacency('Cascais: Cascais'), {}, 'an area is not adjacent to itself')
  // An agency whose buyers treat no two areas as interchangeable is a real
  // agency, and §4.3 says only they know. Empty is an answer.
  assert.deepEqual(problemsWith({ ...ANSWERED, adjacency: '' }), [])
})

test('an answer that contradicts itself is caught in the agent’s terms', () => {
  const below = problemsWith({ ...ANSWERED, budgetMost: 1_900_000 })
  assert.deepEqual(below.map((p) => p.field), ['budgetMost'])
  assert.equal(below[0].why, 'below')

  // Somebody who SAID they could stretch cannot end up seeing less.
  const backwards = problemsWith({ ...ANSWERED, budgetStretchMost: 2_050_000 })
  assert.deepEqual(backwards.map((p) => p.field), ['budgetStretchMost'])

  // And "worth showing" must be easier than "really for you", or the two
  // bands are the wrong way round and everything sorts backwards.
  const inverted = problemsWith({ ...ANSWERED, possibleAtLeast: 4 })
  assert.ok(inverted.some((p) => p.why === 'above_strong'))
})

test('the agency can recognise its own answer months later', () => {
  // The number is ours; the sentence is theirs. A percentage cannot be turned
  // back into "you said you'd stretch to €2,100,000" without the reference.
  const e = explainSaved(deriveThresholds(ANSWERED), 2_000_000)
  assert.equal(e.plainCeiling, 2_100_000)
  assert.equal(e.statedCeiling, 2_300_000)
  assert.equal(e.bedrooms, true)
  assert.deepEqual(e.areas.map(([k]) => k), ['Cascais', 'Estoril', 'Parede'])
})

test('the screen does not promise a number of questions it does not ask', () => {
  // It said "Seis perguntas" and asked eight — three about budget, one about
  // typology, three about when it is worth showing, and one about areas. Six
  // is what is STORED, which is our number and not theirs. Somebody reads this
  // aloud to an agency and then counts the fields.
  assert.doesNotMatch(CALIBRATE.intro, /\b(tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|\d+)\s+perguntas/i)
})
