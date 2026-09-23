/*
 * /CLIENTS, RENDERED OUTSIDE NEXT (23 Sep 2026).
 *
 *   real    production, read-only, through the page's own read — what Manuel
 *           will actually see
 *   sample  🔒 SAMPLE, and only here: every state on one screen, so the row can
 *           be judged. No invented agency exists in the product; this is a test.
 *   empty   the state Thursday's demo shows
 *
 *   node --experimental-websocket --require ./tests/lib/render-outside-next.cjs --import tsx \
 *        --env-file=.env.local tests/render-clients-preview.tsx <outdir>
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { ClientsView } from '../src/components/clients/ClientsView'
import { buildClientList, type ClientListInputs } from '../src/lib/clients/model'
import { readClientList } from '../src/lib/clients/read'
import type { Checklist, Step, StepKey, StepState } from '../src/lib/onboarding-checklist'

const OUT = process.argv[2] ?? '/tmp/clients-preview'
mkdirSync(OUT, { recursive: true })
const SRC = new URL('../src/', import.meta.url).pathname
const css = ['app/tokens.css', 'components/state-chip.module.css', 'components/clients/clients.module.css']
  .map((f) => readFileSync(join(SRC, f), 'utf8')).join('\n')
/** 🔒 The banner must say what the page really is: REAL reads production, SAMPLE
 * is fictional, and the empty one is neither — it is the shape with no rows. */
const page = (title: string, sample: boolean | 'neither', body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&display=swap">
<style>${css}
:root{--font-bricolage:'Bricolage Grotesque';--font-instrument:'Instrument Sans'}
body{margin:0;background:var(--black);color:var(--text);font:15px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:28px 36px 60px}
.banner-x{margin:0 0 20px;padding:10px 14px;border-radius:12px;border:1px dashed var(--edge-2);color:var(--text-2);font-size:13px}
</style></head><body><div class="wrap"><p class="banner-x">${sample === true
  ? '<b>SAMPLE</b>: every name here is fictional and exists only in this preview. Rendered outside Next.'
  : sample === 'neither'
    ? '<b>NO AGENCIES</b>: the screen with nothing on it. No sample data — this is the shape itself.'
    : '<b>REAL</b>: production, read-only, through the page’s own read. Rendered outside Next.'} · ${title}</p>${body}</div></body></html>`

const NOW = new Date()
const step = (key: StepKey, state: StepState): Step =>
  ({ key, title: key, kind: 'form', state, on: state === 'done' ? '2026-09-01' : null, line: '', href: null })
const checklist = (over: Partial<Record<StepKey, StepState>> = {}, onboarded = false): Checklist => {
  const states: Record<StepKey, StepState> = { agency: 'done', routing: 'done', disclosure: 'done', declaration: 'done', calibration: 'done', ...over }
  const steps = (Object.keys(states) as StepKey[]).map((k) => step(k, states[k]))
  return { steps, onboarded, outstanding: steps.filter((s) => s.state === 'outstanding'), unknown: steps.filter((s) => s.state === 'unknown'), headline: '' }
}
const ago = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString()

const sample: ClientListInputs = {
  now: NOW, faultWindowDays: 7,
  clients: [
    { id: '1', name: 'Marbella Sur', rehearsal: false, checklist: checklist({}, true) },
    { id: '2', name: 'Casa Atlântica', rehearsal: false, checklist: checklist({ declaration: 'outstanding' }, false) },
    { id: '3', name: 'Quinta do Vale', rehearsal: false, checklist: checklist({}, true) },
    { id: '4', name: 'Herdade do Sol', rehearsal: false, checklist: checklist({ routing: 'outstanding' }, false) },
    { id: '5', name: 'Foz Atlântico', rehearsal: false, checklist: null },
    { id: '6', name: 'Cascais rehearsal', rehearsal: true, checklist: checklist({ declaration: 'outstanding' }, false) },
    { id: '7', name: 'Vale do Lobo', rehearsal: null, checklist: checklist({}, true) },
  ],
  automations: new Map([
    ['1', [{ key: 'c', name: 'Concierge', enabled: true }, { key: 'n', name: 'Nurture', enabled: true }]],
    ['2', [{ key: 'c', name: 'Concierge', enabled: true }]],
    ['3', [{ key: 'c', name: 'Concierge', enabled: true }, { key: 'm', name: 'Matching', enabled: true }]],
    ['4', [{ key: 'c', name: 'Concierge', enabled: false }]],
    ['6', [{ key: 'c', name: 'Concierge', enabled: true }]],
    ['7', [{ key: 'c', name: 'Concierge', enabled: true }]],
  ]),
  waiting: new Map([['1', 3], ['6', 2]]),
  faults: new Map([['3', 4]]),
  lastActivity: new Map([['1', ago(0)], ['2', ago(2)], ['3', ago(1)], ['6', ago(160)], ['7', ago(5)]]),
  expiries: new Map([['3', { runOut: 1, aboutTo: 2, toConfirm: 1 }], ['1', { runOut: 0, aboutTo: 1, toConfirm: 0 }]]),
}

async function main() {
  writeFileSync(join(OUT, 'sample.html'), page('every state on one screen', true,
    renderToStaticMarkup(<ClientsView list={buildClientList(sample)} />)))
  writeFileSync(join(OUT, 'empty.html'), page('the empty cockpit, as Thursday will show it', 'neither',
    renderToStaticMarkup(<ClientsView list={buildClientList({ ...sample, clients: [] })} />)))
  const real = await readClientList(NOW)
  writeFileSync(join(OUT, 'real.html'), page('production, read-only', false,
    renderToStaticMarkup(<ClientsView list={real} />)))
  console.log(`sample · empty · real (${real.rows.length} rows, ${real.failures.length} failures)`)
}
main()
