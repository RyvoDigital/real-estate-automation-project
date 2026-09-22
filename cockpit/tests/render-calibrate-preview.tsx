/*
 * /CALIBRATE, RENDERED OUTSIDE NEXT, for a screenshot without a session (the
 * same reasons as tests/render-month-preview.tsx). It renders the SAME
 * CalibrateView the page does, from sample data (every name fictional).
 *
 *   node --experimental-websocket --require ./tests/lib/render-outside-next.cjs --import tsx \
 *        tests/render-calibrate-preview.tsx <outdir>
 *
 * Scenarios, all SAMPLE:
 *   recal     a previous sitting: fields EMPTY, last time's answers beside them
 *   first     no previous sitting: "not answered yet", no reference column
 *   failed    the read failed: said so, and nothing claimed about a previous sitting
 *   refused   back from a server refusal: the fields named
 *   already   the same form sent twice
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { CalibrateView } from '../src/components/calibrate/CalibrateView'
import type { CalibrationScreen } from '../src/lib/matching/calibrate-read'
import { EMPTY_ANSWERS } from '../src/lib/matching/thresholds'

const OUT = process.argv[2] ?? '/tmp/calibrate-preview'
mkdirSync(OUT, { recursive: true })
const SRC = new URL('../src/', import.meta.url).pathname
const css = ['app/tokens.css', 'components/calibrate/calibrate.module.css'].map((f) => readFileSync(join(SRC, f), 'utf8')).join('\n')
const page = (title: string, body: string) => `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<style>${css}
:root{--font-bricolage:'Bricolage Grotesque';--font-instrument:'Instrument Sans';--font-geist-mono:'Geist Mono'}
body{margin:0;-webkit-font-smoothing:antialiased}
.banner-x{position:absolute;right:12px;top:12px;margin:0;z-index:9;padding:6px 10px;border-radius:8px;background:#111;color:#eee;font:12px/1.4 system-ui}
</style></head><body><p class="banner-x"><b>SAMPLE</b> · rendered outside Next · ${title}</p>${body}</body></html>`

const client = { id: 'c-sample', name: 'Marbella Sur' }
const previous: CalibrationScreen['previous'] = {
  answers: { ...EMPTY_ANSWERS, budgetSaid: 2000000, budgetMost: 2100000, budgetStretchMost: 2300000, showsOneFewerBedroom: true,
    ofHowMany: 5, strongAtLeast: 4, possibleAtLeast: 3, adjacency: 'Cascais: Estoril, Parede\nSintra: Colares' },
  answeredBy: 'Marta Soares', recordedBy: 'manuel@ryvodigital.com', recordedAt: '2026-09-12T14:20:00Z',
  thresholds: { budget_stretch: 0.05, budget_stretch_with_evidence: 0.15, bedrooms_tolerance: 1,
    area_adjacency: { Cascais: ['Estoril', 'Parede'], Estoril: ['Cascais'], Parede: ['Cascais'], Sintra: ['Colares'], Colares: ['Sintra'] },
    min_score_strong: 0.8, min_score_possible: 0.6 },
}
const S = (name: string, title: string, el: React.ReactElement) => { writeFileSync(join(OUT, `${name}.html`), page(title, renderToStaticMarkup(el))); console.log(name) }

S('recal', 'a previous sitting: fields empty, last time beside them', <CalibrateView clientId="c-sample" screen={{ client, previous, failure: null }} />)
S('first', 'no previous sitting', <CalibrateView clientId="c-sample" screen={{ client, previous: null, failure: null }} />)
S('failed', 'the read failed', <CalibrateView clientId="c-sample" screen={{ client, previous: null, failure: 'calibration_records: canceling statement due to statement timeout' }} />)
S('refused', 'back from a server refusal, the fields named', <CalibrateView clientId="c-sample" screen={{ client, previous, failure: null }} campos="budgetMost:below,showsOneFewerBedroom:missing,answeredBy:missing" />)
S('already', 'the same form sent twice', <CalibrateView clientId="c-sample" screen={{ client, previous, failure: null }} jaGuardado="1" />)
