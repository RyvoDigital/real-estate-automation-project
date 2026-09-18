import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import {
  assemblePiece, figuresIn, inventedFigures, missingMandatoryMentions,
  type PieceFacts,
} from '../src/lib/publication/piece'
import { mentionsFor, UnrenderableRequirement } from '../src/lib/publication/mentions'
import { decidePublication } from '../src/lib/publication/gate'
import type { PolicyRow } from '../src/lib/publication/requirements'

const NOW = new Date('2026-09-18T12:00:00Z')

const PT: PolicyRow[] = [{
  country: 'PT', region: null, regions_exhaustive: true, region_required: false,
  confirmed_at: '2026-09-18T00:00:00Z', confirmed_by: 'M. de Sousa Pereira',
  requires: [
    { id: 'pt_energy_class', kind: 'property_rating', exemptible: true },
    { id: 'pt_ami', kind: 'agency_registration', scope: 'national' },
  ],
}]

const cleared = (over: { rating?: Record<string, unknown> } = {}) => {
  const v = decidePublication({
    listingId: 'A-1042', status: 'available', price: 1_950_000, fromTheAgency: true,
    country: 'PT', region: null, policy: PT,
    propertyFacts: [{
      requirementId: 'pt_energy_class', values: { class: 'B' }, certificateNumber: 'CE-1',
      validUntil: '2031-01-01', registrationStatus: 'not_required', exemption: null,
      ...(over.rating ?? {}),
    }],
    agencyFacts: [{
      requirementId: 'pt_ami', country: 'PT', region: null,
      number: 'AMI 12345', status: 'valid', statusCheckedAt: '2026-09-01T00:00:00Z',
    }],
  }, NOW)
  assert.ok(v.cleared, 'the fixture must clear, or every test below is about nothing')
  return v.evidence
}

const facts = (over: Partial<PieceFacts> = {}): PieceFacts => ({
  reference: 'A-1042',
  propertyType: 'Moradia',
  area: 'Cascais',
  bedrooms: 4,
  sizeSqm: 320,
  price: 1_950_000,
  features: ['jardim', 'piscina'],
  ...over,
})

// --- the invariant, on the artefact ----------------------------------------

test('🔴 the mandatory statements are IN THE TEXT, and the check reads the text', () => {
  // §8.A: "Nenhuma peça publicada sem classe energética e sem número AMI."
  // Read on the artefact, never on a flag saying the mentions were added —
  // the AI-disclosure invariant's rule, for the same reason.
  const e = cleared()
  const p = assemblePiece(facts(), e)
  assert.deepEqual(missingMandatoryMentions(p.text, e), [])
  assert.match(p.text, /Classe energética: B\./)
  assert.match(p.text, /AMI 12345/)
})

test('🔴 a piece that lost its statements fails the invariant, whatever produced it', () => {
  // The point of checking the ARTEFACT: this text came from nowhere the code
  // controls, and the invariant judges it on what it says.
  const e = cleared()
  assert.deepEqual(
    missingMandatoryMentions('Moradia T4 em Cascais. €1.950.000', e).sort(),
    ['pt_ami', 'pt_energy_class'],
  )
  assert.deepEqual(missingMandatoryMentions('Classe energética: B.', e), ['pt_ami'])
  assert.deepEqual(missingMandatoryMentions('AMI 12345', e), ['pt_energy_class'])
})

test('a WRONG energy class fails the invariant, not just a missing one', () => {
  // A piece carrying "Classe energética: C" for a property cleared as B is not
  // a piece with the mention present — it is a piece making a different claim.
  const e = cleared()
  assert.deepEqual(missingMandatoryMentions('Classe energética: C.\nAMI 12345', e), ['pt_energy_class'])
})

test('the check cannot be satisfied by a letter that happens to be in the text', () => {
  // A bare "B" appears in any Portuguese sentence. Matching the whole phrase is
  // what stops this passing on nothing.
  const e = cleared()
  assert.deepEqual(missingMandatoryMentions('Boa moradia em Cascais. AMI 12345', e), ['pt_energy_class'])
})

test('an exempt property states the exemption, and satisfies the invariant that way', () => {
  const e = cleared({ rating: {
    values: {}, validUntil: null,
    exemption: { declared_by: 'A. Ferreira', basis: 'Imóvel em ruína, sem uso', at: '2026-09-18' },
  } })
  const p = assemblePiece(facts(), e)
  assert.deepEqual(missingMandatoryMentions(p.text, e), [])
  assert.match(p.text, /isento de certificação energética/)
  assert.doesNotMatch(p.text, /Classe energética/, 'it must not claim a rating it does not have')
})

// --- figures ---------------------------------------------------------------

test('🔴 every figure in the piece was supplied by the agency', () => {
  const p = assemblePiece(facts(), cleared())
  // Assembled from FIELDS, so there is nowhere for an invented number to come
  // from — and the piece reports which figures it interpolated.
  assert.deepEqual([...p.figures].sort(), ['1950000', '320', '4'])
  // Separator-agnostic on purpose — see the test below for why.
  assert.match(p.text, /€1.950.000/)
})

test('🔴 a rephrasing may not introduce a figure the piece did not have', () => {
  const p = assemblePiece(facts(), cleared())
  assert.deepEqual(inventedFigures('Moradia T4 em Cascais por €1.950.000. AMI 12345', p), [])
  // A price nobody supplied.
  assert.deepEqual(inventedFigures('Moradia por €1.900.000', p), ['1900000'])
  // A figure DERIVED from one that was supplied — €/m². A real number, computed
  // by us, and not a fact about the property.
  assert.deepEqual(inventedFigures('6094 €/m²', p), ['6094'])
})

test('the same figure written differently is the same figure; a different magnitude is not', () => {
  const p = assemblePiece(facts(), cleared())
  assert.deepEqual(inventedFigures('€1 950 000', p), [], 'separators are not a different number')
  // Deliberately refused: normalising "1,95M" to 1950000 is how two numbers
  // start being treated as one fact.
  assert.deepEqual(inventedFigures('1,95M', p), ['195'])
})

test('figuresIn sees a figure where one is, and none where there is not', () => {
  // The guard's own control. A reader that found nothing would make every
  // assertion above pass perfectly.
  assert.deepEqual(figuresIn('€1.950.000 e 320 m²'), ['1950000', '320'])
  assert.deepEqual(figuresIn('Moradia em Cascais com jardim'), [])
})

// --- absent facts leave no gap ---------------------------------------------

test('a fact the agency did not supply leaves no placeholder', () => {
  // "T null" and "€NaN" are what a template produces when a field is missing,
  // and a piece carrying one is worse than a piece that does not mention the
  // typology at all.
  const p = assemblePiece(
    facts({ bedrooms: null, sizeSqm: null, price: null, features: [], propertyType: null }),
    cleared(),
  )
  assert.doesNotMatch(p.text, /null|undefined|NaN|€\s*$/m)
  assert.match(p.text, /A-1042/)
  assert.match(p.text, /Cascais/)
  assert.deepEqual(p.figures, [], 'nothing supplied, nothing interpolated')
  // And the mandatory statements survive a piece with almost nothing in it.
  assert.deepEqual(missingMandatoryMentions(p.text, cleared()), [])
})

test('the AMI number is rendered once, however the agency stored it', () => {
  for (const number of ['AMI 12345', '12345', 'ami 12345']) {
    const e = { ...cleared() }
    e.satisfied = e.satisfied.map((r) => r.requirementId === 'pt_ami' ? { ...r, number } : r)
    const ami = mentionsFor(e.satisfied).find((m) => m.requirementId === 'pt_ami')
    assert.equal(ami?.text, 'AMI 12345', number)
  }
})

// --- 🔴 prepared, never published -------------------------------------------

test('🔴 NOTHING IN THE PUBLICATION PATH CAN PUBLISH ANYTHING', () => {
  // A prepared piece that can publish itself is the same failure as a match row
  // that knows its own audience: the decision to act moves into the thing that
  // only describes.
  //
  // Asserted the way the send boundary is — by reading source and naming the
  // offender — because the person who adds a Meta call will be solving a
  // reasonable local problem.
  const REPO = resolve(new URL('../..', import.meta.url).pathname)
  const DIR = resolve(REPO, 'cockpit/src/lib/publication')

  const CAN_PUBLISH =
    /twilio-adapter|@\/lib\/send\/dispatch|SendPermit|graph\.facebook\.com|api\.instagram|\bfetch\s*\(|process\.env\.[A-Z_]*(TOKEN|SECRET|KEY|PASSWORD)/

  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (!/\.tsx?$/.test(e)) continue
      const src = readFileSync(full, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      const m = src.match(CAN_PUBLISH)
      if (m) offenders.push(`${relative(REPO, full)}: ${m[0]}`)
    }
  }
  walk(DIR)

  assert.deepEqual(
    offenders, [],
    'The publication path PREPARES. A person at the agency publishes. These files reach a\n' +
    'platform, a credential or a dispatcher:\n\n' + offenders.map((f) => `  • ${f}`).join('\n') +
    '\n\nHolding a client\'s credentials to post under their brand risks the WhatsApp asset every\n' +
    'other automation runs on. See docs/automation-04-publication-gate-design.md §5.1.\n',
  )

  // §5c: the walk must have seen something, or this passes over an empty
  // directory exactly as it passes over a clean one.
  const seen = readdirSync(DIR).filter((f) => /\.ts$/.test(f))
  assert.ok(seen.length >= 4, `only ${seen.length} files in the publication path — did it move?`)
})

test('the piece returns a string, which is not a thing any platform accepts', () => {
  // template.ts's rule, for the same reason: a caller holding the text still
  // holds nothing that can leave the building.
  const p = assemblePiece(facts(), cleared())
  assert.equal(typeof p.text, 'string')
})

test('🔴 the price separator is a NO-BREAK space, and the guard sees through it', () => {
  // `(1950000).toLocaleString('pt-PT')` renders "1 950 000" with U+00A0, not a
  // plain space. A test written with a plain space silently fails to find the
  // price that is right there — which is how this was found.
  //
  // The load-bearing half is `figuresIn`: its class is `[\d.,\s]`, and `\s`
  // matches U+00A0. Narrow it to `[\d.,]` or a literal space and the price
  // splits into "1", "950" and "000" — so `inventedFigures` would report the
  // AGENCY'S OWN PRICE as invented, a guard firing on correct input, which is
  // the direction that gets a guard deleted (§13d).
  //
  // Third instance of this shape in this codebase: §6c's ASCII boundaries,
  // §6g's apostrophe, and now a separator. A character-class assumption is a
  // locale assumption.
  const rendered = (1_950_000).toLocaleString('pt-PT')
  assert.ok(rendered.includes('\u00a0'), `pt-PT no longer uses U+00A0: ${JSON.stringify(rendered)}`)
  assert.deepEqual(figuresIn(`€${rendered}`), ['1950000'], 'the guard must read it as ONE figure')

  const p = assemblePiece(facts(), cleared())
  assert.deepEqual(inventedFigures(`Por €${rendered}`, p), [],
    'the agency’s own price must never be reported as invented')
})

test('🔴 a requirement with no words THROWS rather than rendering nothing', () => {
  // The registry is keyed by requirement id, and a jurisdiction added without
  // wording must fail at the suite rather than at an agency. Rendering nothing
  // would produce a piece that LOOKS finished and is missing a statement the
  // law requires — which is the §8.A invariant's failure, arriving silently.
  const e = cleared()
  const unknown = { ...e, satisfied: [{ ...e.satisfied[0], requirementId: 'es_energy_label' }] }
  assert.throws(() => mentionsFor(unknown.satisfied), UnrenderableRequirement)
  assert.throws(() => assemblePiece(facts(), unknown), /es_energy_label/)
})
