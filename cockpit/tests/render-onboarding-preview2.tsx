/*
 * ONBOARDING, RENDERED OUTSIDE NEXT (23 Sep 2026) — the checklist and the
 * client list, after the visual pass.
 *
 * 🔒 SAMPLE, and only here: every agency named below is fictional and exists in
 * this preview alone. Nothing in the product invents a client.
 *
 *   node --experimental-websocket --require ./tests/lib/render-outside-next.cjs --import tsx \
 *        tests/render-onboarding-preview2.tsx <outdir>
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { Checklist } from '../src/components/onboarding/Checklist'
import { ClientList } from '../src/components/onboarding/ClientList'
import type { Checklist as Model, Step, StepKey, StepState } from '../src/lib/onboarding-checklist'

const OUT = process.argv[2] ?? '/tmp/onb2'
mkdirSync(OUT, { recursive: true })
const SRC = new URL('../src/', import.meta.url).pathname
const css = ['app/tokens.css', 'app/motion.css', 'components/state-chip.module.css', 'components/onboarding/onboarding.module.css']
  .map((f) => readFileSync(join(SRC, f), 'utf8')).join('\n')
const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&display=swap">
<style>${css}
:root{--font-bricolage:'Bricolage Grotesque';--font-instrument:'Instrument Sans'}
body{margin:0;background:var(--black);color:var(--text);font:15px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:28px 36px 60px}
.banner-x{margin:0 0 20px;padding:10px 14px;border-radius:12px;border:1px dashed var(--edge-2);color:var(--text-2);font-size:13px}
</style></head><body><div class="wrap"><p class="banner-x"><b>SAMPLE</b>: every name is fictional. Rendered outside Next · ${title}</p>${body}</div></body></html>`

const TITLES: Record<StepKey, string> = {
  agency: 'The agency', routing: 'Where its enquiries go', disclosure: 'The AI disclosure',
  declaration: 'The contact declaration', calibration: 'The calibration',
}
const LINES: Record<StepKey, string> = {
  agency: 'Created as a rehearsal: kept out of the business’s own figures.',
  routing: 'Nothing routes here yet, so an enquiry would reach nobody.',
  disclosure: 'Recorded on 12 September, with the wording the agency approved.',
  declaration: 'The agency declares, in its own name, where its contacts came from. Until it does, the gate refuses every contact, correctly.',
  calibration: 'Not part of this client’s contract: the follow-up automation was not sold, so there is nothing to calibrate.',
}
const step = (key: StepKey, state: StepState, href: string | null = null): Step =>
  ({ key, title: TITLES[key], kind: key === 'declaration' || key === 'calibration' ? 'conversation' : key === 'disclosure' ? 'proof' : 'form',
     state, on: state === 'done' ? '2026-09-12' : null, line: LINES[key], href })
const steps: Step[] = [
  step('agency', 'done'), step('routing', 'outstanding'), step('disclosure', 'done'),
  step('declaration', 'outstanding', '/segmentation'), step('calibration', 'not_applicable'),
]
const model: Model = { steps, onboarded: false, outstanding: steps.filter((s) => s.state === 'outstanding'), unknown: [], headline: '2 outstanding' }

writeFileSync(join(OUT, 'checklist.html'), page('the checklist, mid-onboarding', renderToStaticMarkup(
  <Checklist clientId="c1" model={model} others={[{ id: 'c2', name: 'Casa Atlântica' }]} recordable today="2026-09-23" createdOn="2026-09-01" />)))

writeFileSync(join(OUT, 'list.html'), page('the client list', renderToStaticMarkup(
  <ClientList items={[
    { id: '1', name: 'Marbella Sur', rehearsal: false, createdOn: '2026-09-01', checklist: { ...model, onboarded: true, outstanding: [], headline: 'onboarded' } },
    { id: '2', name: 'Casa Atlântica', rehearsal: false, createdOn: '2026-09-12', checklist: model },
    { id: '3', name: 'Cascais rehearsal', rehearsal: true, createdOn: '2026-09-18', checklist: { ...model, unknown: [steps[0]], headline: '2 outstanding · 1 not known' } },
  ]} failure={null} />)))
console.log('checklist · list')
