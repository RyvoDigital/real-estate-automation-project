/*
 * THE MONTH, RENDERED OUTSIDE NEXT — for a screenshot without a session.
 *
 *   node --experimental-websocket --require ./tests/lib/render-outside-next.cjs --import tsx \
 *        --env-file=.env.local tests/render-month-preview.tsx <outdir>
 *
 * WHY THIS AND NOT A PREVIEW ROUTE. Every non-public path redirects to /login
 * in src/proxy.ts, and a page check on the live cockpit as the operator is the
 * operator's (a Supabase admin session is never minted to view it). A preview
 * route would mean exempting a path in the auth proxy for a screenshot. This
 * renders the SAME component to static HTML with its own stylesheets instead,
 * and touches nothing in the app.
 *
 * Scenarios:
 *   real      — production, read-only, through the page's own reads (the true state today)
 *   day3      — SAMPLE: 3 Oct 2026, web retainers, the net withheld
 *   closed    — SAMPLE: September 2026 closed
 *   first     — SAMPLE: the first automation contract, from 1 Oct
 *   failed    — SAMPLE: the costs read failed; only its panels say so
 * Every sample name is fictional by the design's rule: no sample amount beside a real client.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { TheMonth } from '../src/components/month/TheMonth'
import { buildMonth, lisbonToday, monthKey, monthOf, type MonthInputs } from '../src/lib/month/model'
import { readMonthInputs, type ReadFailure } from '../src/lib/month/read'

const OUT = process.argv[2] ?? '/tmp/month-preview'
mkdirSync(OUT, { recursive: true })
const SRC = new URL('../src/', import.meta.url).pathname
const css = ['app/tokens.css', 'components/month/month.module.css', 'components/state-chip.module.css']
  .map((f) => readFileSync(join(SRC, f), 'utf8')).join('\n')

const SAMPLE: MonthInputs = {
  automationClients: [
    { id: 'a-r1', name: 'Ryvo Test Client', status: 'active', rehearsal: true },
    { id: 'a-r2', name: 'ZZ TEST — Cascais Demo', status: 'active', rehearsal: true },
  ],
  webClients: [
    { id: 'w1', name: 'Alfaiataria Exemplo', status: 'active', rehearsal: false, started_on: '2023-03-01', ended_on: null },
    { id: 'w2', name: 'Estúdio Fictício', status: 'active', rehearsal: false, started_on: '2024-11-01', ended_on: null },
    { id: 'w3', name: 'Loja Modelo', status: 'active', rehearsal: false, started_on: '2025-06-01', ended_on: null },
  ],
  contracts: [
    { id: 'k1', automation_client_id: null, web_client_id: 'w1', monthly_eur: 250, setup_eur: null, setup_terms: null, starts_on: '2023-03-01', ends_on: null, automations: null, signed_by: 'sample', recorded_by: 'sample', recorded_at: '2026-09-21T10:00:00Z', created_at: '2026-09-21T10:00:00Z', supersedes_id: null },
    { id: 'k2', automation_client_id: null, web_client_id: 'w2', monthly_eur: 220, setup_eur: null, setup_terms: null, starts_on: '2024-11-01', ends_on: null, automations: null, signed_by: 'sample', recorded_by: 'sample', recorded_at: '2026-09-21T10:00:00Z', created_at: '2026-09-21T10:00:00Z', supersedes_id: null },
    { id: 'k3', automation_client_id: null, web_client_id: 'w3', monthly_eur: 300, setup_eur: null, setup_terms: null, starts_on: '2025-06-01', ends_on: null, automations: null, signed_by: 'sample', recorded_by: 'sample', recorded_at: '2026-09-21T10:00:00Z', created_at: '2026-09-21T10:00:00Z', supersedes_id: null },
  ],
  payments: [
    { id: 'p1', automation_client_id: null, web_client_id: 'w2', kind: 'project', amount_eur: 600, settled_on: '2026-09-11', settled_amount_eur: 600, written_off_on: null },
  ],
  costs: [
    { id: 'c1', label: 'Web hosting server', category: 'hosting', side: 'web', amount_eur: 20, cadence: 'monthly', started_on: '2023-01-01', ended_on: null },
    { id: 'c2', label: 'Domain .com', category: 'domain', side: 'web', amount_eur: 15, cadence: 'annual', started_on: '2024-10-28', ended_on: null, web_client_id: 'w2' },
    { id: 'c3', label: 'Server — Hetzner', category: 'infrastructure', side: 'automation', amount_eur: 18.5, cadence: 'monthly', started_on: '2026-07-01', ended_on: null },
    { id: 'c4', label: 'Database — Supabase', category: 'infrastructure', side: 'automation', amount_eur: 25, cadence: 'monthly', started_on: '2026-07-01', ended_on: null },
    { id: 'c5', label: 'Accountant', category: 'other', side: 'shared', amount_eur: 60, cadence: 'monthly', started_on: '2025-01-01', ended_on: null },
  ],
}

function page(title: string, sample: boolean, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<style>${css}
:root{--font-bricolage:'Bricolage Grotesque';--font-instrument:'Instrument Sans';--font-geist-mono:'Geist Mono'}
body{margin:0;background:var(--black);color:var(--text);font:15px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:1240px;margin:0 auto;padding:28px 36px 60px}
.banner{margin:0 0 18px;padding:10px 14px;border-radius:12px;border:1px dashed var(--edge-2);color:var(--text-2);font-size:13px}
</style></head><body><div class="wrap">
<p class="banner">${sample ? '<b>SAMPLE</b> — every name and amount on this page is fictional (the design’s rule). Rendered outside Next for review.' : '<b>REAL</b> — production, read-only, through the page’s own reads. Rendered outside Next for review.'} · ${title}</p>
${body}</div></body></html>`
}

function render(name: string, title: string, sample: boolean, inputs: MonthInputs, today: string, failures: ReadFailure[] = [], month = monthOf(today)) {
  const model = buildMonth(inputs, month, today)
  const html = renderToStaticMarkup(
    <TheMonth model={model} readAt={new Date().toISOString()} failures={failures} hrefFor={(m) => `?m=${monthKey(m)}`} />,
  )
  writeFileSync(join(OUT, `${name}.html`), page(title, sample, html))
  console.log(`${name}: ${join(OUT, `${name}.html`)}  (phase ${model.phase.kind}, S2 ${model.neverAnything}, failed [${model.failed.join(', ')}])`)
}

async function main() {
const real = await readMonthInputs()
render('real', `today, ${lisbonToday(new Date())}`, false, real.inputs, lisbonToday(new Date()), real.failures)
render('day3', '3 October 2026, in progress', true, SAMPLE, '2026-10-03')
render('closed', 'September 2026, closed', true, SAMPLE, '2026-10-03', [], { y: 2026, m: 9 })
render('first', 'the first automation contract, from 17 Oct (prorated)', true, {
  ...SAMPLE,
  automationClients: [...SAMPLE.automationClients!, { id: 'a1', name: 'Casa Atlântica', status: 'active', rehearsal: false }],
  contracts: [...SAMPLE.contracts!, { id: 'k9', automation_client_id: 'a1', web_client_id: null, monthly_eur: 650, setup_eur: 1500, setup_terms: 'two instalments', starts_on: '2026-10-17', ends_on: null, automations: ['inbound_concierge'], signed_by: 'sample', recorded_by: 'sample', recorded_at: '2026-09-18T10:00:00Z', created_at: '2026-09-18T10:00:00Z', supersedes_id: null }],
}, '2026-10-19')
render('failed', 'the costs read failed', true, { ...SAMPLE, costs: null }, '2026-10-19',
  [{ source: 'costs', message: 'costs read failed: canceling statement due to statement timeout' }])
}
main().catch((e) => { console.error(e); process.exit(1) })
