/*
 * THE LISTING SCREENS, RENDERED OUTSIDE NEXT, for screenshots without a session.
 * The SAME views the pages draw (components/listings/), from sample data; every
 * name fictional.
 *
 *   node --experimental-websocket --require ./tests/lib/render-outside-next.cjs --import tsx \
 *        tests/render-listings-preview.tsx <outdir>
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { ListingDetailView } from '../src/components/listings/ListingDetailView'
import { TriageView } from '../src/components/listings/TriageView'
import { ExemptionView } from '../src/components/listings/ExemptionView'
import { groupForTriage, type TriageContact } from '../src/lib/matching/triage'
import type { MatchesScreen } from '../src/lib/matching/screen-read'
import type { TriageScreen } from '../src/lib/matching/triage-read'
import type { ExemptionScreen } from '../src/lib/publication/exemption-read'

const OUT = process.argv[2] ?? '/tmp/listings-preview'
mkdirSync(OUT, { recursive: true })
const SRC = new URL('../src/', import.meta.url).pathname
const css = ['app/tokens.css', 'app/motion.css', 'components/listings/listings.module.css'].map((f) => readFileSync(join(SRC, f), 'utf8')).join('\n')
const page = (title: string, body: string) => `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<style>${css}
:root{--font-bricolage:'Bricolage Grotesque';--font-instrument:'Instrument Sans';--font-geist-mono:'Geist Mono'}
body{margin:0;-webkit-font-smoothing:antialiased}
.banner-x{position:absolute;right:12px;top:12px;margin:0;z-index:9;padding:6px 10px;border-radius:8px;background:#111;color:#eee;font:12px/1.4 system-ui}
</style></head><body><p class="banner-x"><b>SAMPLE</b> · rendered outside Next · ${title}</p>${body}</body></html>`
const S = (name: string, title: string, el: React.ReactElement, openFirst = false) => {
  let html = renderToStaticMarkup(el)
  if (openFirst) html = html.replace('<details class="contact">', '<details class="contact" open="">')
  writeFileSync(join(OUT, `${name}.html`), page(title, html)); console.log(name)
}

const listing = { id: 'l1', reference: 'MS-131', area: 'Cascais', price: 1850000, status: 'available' }

const detail: MatchesScreen = {
  listing, clientId: 'c1', missingThresholds: [], failures: {},
  matches: [
    { leadId: 'd1', name: 'Inês Carvalhal', origin: 'computed', strength: 'strong', filterWouldFind: false,
      reasons: ['Procura em Cascais, e o imóvel é em Cascais.', 'Até €1.900.000: dentro do orçamento.'], chosenBy: null, chosenReason: null, monthsSinceContact: 14 },
    { leadId: 'd2', name: 'Tomás Reigada', origin: 'agent', strength: null, filterWouldFind: null, reasons: [],
      chosenBy: 'Marta Soares', chosenReason: 'Viu a casa ao lado na primavera', monthsSinceContact: null },
  ],
}
S('detail', 'the engine\'s match and the agency\'s pick, apart', <ListingDetailView id="l1" screen={detail} />)
S('detail-failed', 'the matches and the config could not be read', <ListingDetailView id="l1"
  screen={{ ...detail, matches: [], failures: { matches: 'canceling statement due to statement timeout', config: 'canceling statement due to statement timeout' } }} />)

const contacts: TriageContact[] = [
  { leadId: 'd3', name: 'Beatriz Lobato', lastContactAt: '2021-06-02', area: null, batchId: 'b1', batchFilename: 'contactos-antigos.xlsx', alreadyChosen: false },
  { leadId: 'd4', name: 'Álvaro Medina', lastContactAt: '2021-09-18', area: null, batchId: 'b1', batchFilename: 'contactos-antigos.xlsx', alreadyChosen: true },
  { leadId: 'd5', name: null, lastContactAt: null, area: 'Estoril', batchId: null, batchFilename: null, alreadyChosen: false },
]
const triage: TriageScreen = { listing, clientId: 'c1', groups: groupForTriage(contacts), total: 3, chosen: 1, failures: {} }
S('triage', 'the floor, one contact open to pick', <TriageView id="l1" screen={triage} />, true)
S('triage-saved', 'after a pick is recorded', <TriageView id="l1" screen={triage} guardado="1" />)
S('triage-race', 'a racing second form: someone else just chose', <TriageView id="l1" screen={triage}
  refusal={{ key: 'pick.justChosen', params: { name: 'Rui Antunes' } }} locale="pt-PT" />)
S('triage-failed', 'the picks could not be read: no picks offered', <TriageView id="l1" screen={{ ...triage, failures: { picks: 'permission denied for table listing_matches' } }} />)

const ex: ExemptionScreen = { listing: { id: 'l1', reference: 'MS-131', area: 'Cascais' }, clientId: 'c1', requirementId: 'pt_energy_class', ambiguous: false, rated: false, current: null, failures: {} }
S('exemption', 'nothing recorded yet: the form', <ExemptionView id="l1" screen={ex} />)
S('exemption-current', 'an exemption in force, and the form for a new one', <ExemptionView id="l1"
  screen={{ ...ex, current: { declaredBy: 'Marta Soares', basis: 'Edifício anterior a 1951, sem obras de fundo', at: '2026-09-12T10:00:00Z' } }} jaGuardado="1" />)
S('exemption-rated', 'already rated: no form', <ExemptionView id="l1" screen={{ ...ex, rated: true }} />)
