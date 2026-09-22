/*
 * /ONBOARDING, RENDERED OUTSIDE NEXT, for a screenshot without a session
 * (the same reasons as tests/render-month-preview.tsx: no preview route, no
 * auth exemption, and never an operator session minted to look).
 *
 *   node --experimental-websocket --require ./tests/lib/render-outside-next.cjs --import tsx \
 *        --env-file=.env.local tests/render-onboarding-preview.tsx <outdir>
 *
 * Scenarios:
 *   real          production, read-only, through the page's own reads (0054 not applied yet)
 *   index         SAMPLE: the list of clients, and the form to take on a new one
 *   created       SAMPLE: a client just created: four outstanding (S6)
 *   conversations SAMPLE: routing and disclosure done; the two agency conversations outstanding
 *   onboarded     SAMPLE: every step done
 *   unmigrated    SAMPLE: 0054 not applied: the two records say so, not "outstanding"
 * Every sample name is fictional by the design's rule.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { Checklist } from '../src/components/onboarding/Checklist'
import { ClientList, type ListItem } from '../src/components/onboarding/ClientList'
import { NewClient } from '../src/components/onboarding/NewClient'
import { StateChip } from '../src/components/state-chip'
import { checklistFor, type ChecklistInputs } from '../src/lib/onboarding-checklist'
import { readOnboardingIndex } from '../src/lib/onboarding-read'
import { lisbonToday } from '../src/lib/month/model'

const OUT = process.argv[2] ?? '/tmp/onboarding-preview'
mkdirSync(OUT, { recursive: true })
const SRC = new URL('../src/', import.meta.url).pathname
const css = ['app/tokens.css', 'components/onboarding/onboarding.module.css', 'components/state-chip.module.css']
  .map((f) => readFileSync(join(SRC, f), 'utf8')).join('\n')

function page(title: string, sample: boolean, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<style>${css}
:root{--font-bricolage:'Bricolage Grotesque';--font-instrument:'Instrument Sans';--font-geist-mono:'Geist Mono'}
body{margin:0;background:var(--black);color:var(--text);font:15px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:28px 36px 60px}
.banner{margin:0 0 18px;padding:10px 14px;border-radius:12px;border:1px dashed var(--edge-2);color:var(--text-2);font-size:13px}
</style></head><body><div class="wrap">
<p class="banner">${sample ? '<b>SAMPLE</b>: every name on this page is fictional (the design’s rule). Rendered outside Next for review.' : '<b>REAL</b>: production, read-only, through the page’s own reads. Rendered outside Next for review.'} · ${title}</p>
${body}</div></body></html>`
}

const TODAY = '2026-09-22'
const B = '00000000-0000-0000-0000-0000000000b1'
const NAMES = new Map([[B, 'Casa Atlântica']])
const inputs = (over: Partial<ChecklistInputs>): ChecklistInputs => ({
  client: { id: 'c-new', name: 'Marbella Sur', rehearsal: false, createdOn: '2026-09-22' },
  records: [], declaredOn: null, calibratedOn: null, clientNames: NAMES, ...over,
})
const ROUTING = { step: 'routing_proved' as const, happenedOn: '2026-09-22', recordedBy: 'manuel@ryvodigital.com', detail: { new_client_answered: true, existing_client_answered: true, existing_client_id: B } }
const TOLD = { step: 'ai_disclosure_told' as const, happenedOn: '2026-09-22', recordedBy: 'manuel@ryvodigital.com', detail: { told: 'Lucía Ortega, the owner' } }

function one(name: string, title: string, i: ChecklistInputs, recordable = true, openFirst = false) {
  const model = checklistFor(i)
  let body = renderToStaticMarkup(
    <div className="page">
      <a className="back" href="#">← All clients</a>
      <div className="top">
        <h1 className="title">{i.client.name}</h1>
        {model.onboarded ? <StateChip meaning="through">onboarded</StateChip> : <StateChip meaning="grey">not onboarded</StateChip>}
      </div>
      <p className="lede">{model.headline}</p>
      <Checklist clientId={i.client.id} model={model} others={[{ id: B, name: 'Casa Atlântica' }]} recordable={recordable} today={TODAY} createdOn={i.client.createdOn} />
      <p className="note">Not on this checklist yet (brief §2.8): the signed services contract and the data-processing annex. The contract is recorded on The Month; the annex is not recorded anywhere yet.</p>
    </div>,
  )
  if (openFirst) body = body.replace('<details class="record">', '<details class="record" open="">')
  writeFileSync(join(OUT, `${name}.html`), page(title, true, body))
  console.log(`${name}: onboarded=${model.onboarded} outstanding=[${model.outstanding.map((s) => s.key)}] unknown=[${model.unknown.map((s) => s.key)}]`)
}

function index(name: string, title: string, sample: boolean, items: ListItem[] | null, failure: string | null) {
  const body = renderToStaticMarkup(
    <div className="page">
      <div className="top"><h1 className="title">Onboarding</h1></div>
      <p className="lede">A client is onboarded when <b>every</b> step is done, including the two conversations only the agency can have. Until then nothing may be sent to anybody, and this screen says what is left.</p>
      <div className="cols"><ClientList items={items} failure={failure} /><NewClient /></div>
    </div>,
  )
  writeFileSync(join(OUT, `${name}.html`), page(title, sample, body))
  console.log(`${name}: ${items?.length ?? 'no'} client(s)`)
}

async function main() {
  const real = await readOnboardingIndex()
  index('real', `today, ${lisbonToday(new Date())}`, false,
    real.clients?.map(({ client, checklist }) => ({ id: client.id, name: client.name, rehearsal: client.rehearsal, createdOn: lisbonToday(new Date(client.created_at)), checklist })) ?? null,
    real.failure)

  const sampleItems: ListItem[] = [
    { id: 'c-new', name: 'Marbella Sur', rehearsal: false, createdOn: '2026-09-22', checklist: checklistFor(inputs({})) },
    { id: 'c-b', name: 'Casa Atlântica', rehearsal: false, createdOn: '2026-08-04', checklist: checklistFor(inputs({ client: { id: B, name: 'Casa Atlântica', rehearsal: false, createdOn: '2026-08-04' }, records: [TOLD, { ...ROUTING, detail: { ...ROUTING.detail, existing_client_id: 'c-demo' } }], declaredOn: '2026-08-10', calibratedOn: '2026-08-12' })) },
    { id: 'c-demo', name: 'Estúdio Demonstração', rehearsal: true, createdOn: '2026-07-29', checklist: checklistFor(inputs({ client: { id: 'c-demo', name: 'Estúdio Demonstração', rehearsal: true, createdOn: '2026-07-29' }, records: [TOLD] })) },
  ]
  index('index', 'the list, and the form to take on a new client', true, sampleItems, null)
  one('created', 'a client just created (S6)', inputs({}), true, true)
  one('conversations', 'routing and disclosure recorded; the agency’s two conversations outstanding', inputs({ records: [ROUTING, TOLD] }))
  one('onboarded', 'every step done', inputs({ records: [ROUTING, TOLD], declaredOn: '2026-09-23', calibratedOn: '2026-09-24' }))
  one('unmigrated', 'migration 0054 not applied yet', inputs({ records: 'not_migrated' }), false, true)
}
main().catch((e) => { console.error(e); process.exit(1) })
