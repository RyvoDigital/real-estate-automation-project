/*
 * THE THREE PIECES OF 22 SEP 2026, RENDERED OUTSIDE NEXT for screenshots
 * without a session (the same reasons as tests/render-month-preview.tsx):
 *   infra-*   /ops/infrastructure, the real InfrastructureView, five states
 *   handback  the per-lead hand-back under an escalation row, open and closed
 *   copy      "Copy as text" carried onto the weekly report
 *
 *   node --experimental-websocket --require ./tests/lib/render-outside-next.cjs --import tsx \
 *        tests/render-ops-preview.tsx <outdir>
 *
 * Every name is fictional. The HTML is asserted before it is written.
 */
import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { InfrastructureView } from '../src/components/infrastructure/InfrastructureView'
import { HandBack } from '../src/components/escalations/HandBack'
import { CopyAsText } from '../src/components/report/CopyAsText'
import { buildInfrastructure, type InfrastructureInputs } from '../src/lib/infrastructure/model'
import { monitorLine } from '../src/lib/infrastructure/monitor'

const OUT = process.argv[2] ?? '/tmp/ops-preview'
mkdirSync(OUT, { recursive: true })
const SRC = new URL('../src/', import.meta.url).pathname
/*
 * 🔒 ONE STYLESHEET PER PAGE. Outside Next the module class names are NOT
 * hashed, so .title, .note, .head and .banner exist in several modules at once
 * and the last one wins — which centred this screen's h1 and indented its notes
 * the first time (22 Sep 2026). In the build they are three different classes;
 * here they are kept apart by never inlining two modules into one page.
 */
const read = (f: string) => readFileSync(join(SRC, f), 'utf8')
const BASE = ['app/tokens.css', 'components/state-chip.module.css'].map(read).join('\n')
const CSS = {
  infra: [...['app/tokens.css', 'components/state-chip.module.css', 'components/infrastructure/infrastructure.module.css'].map(read)].join('\n'),
  handback: `${BASE}\n${read('app/c/[client]/escalations/escalations.module.css')}`,
  copy: `${BASE}\n${read('components/report/copy-as-text.module.css')}`,
}
const page = (title: string, body: string, css: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<style>${css}
:root{--font-bricolage:'Bricolage Grotesque';--font-instrument:'Instrument Sans';--font-geist-mono:'Geist Mono'}
body{margin:0;background:var(--black);color:var(--text);font:15px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:28px 36px 60px}
.banner-x{margin:0 0 18px;padding:10px 14px;border-radius:12px;border:1px dashed var(--edge-2);color:var(--text-2);font-size:13px}
</style></head><body><div class="wrap"><p class="banner-x"><b>SAMPLE</b>: every name is fictional. Rendered outside Next for review · ${title}</p>${body}</div></body></html>`

const NOW = new Date('2026-09-22T18:40:00Z')
const CHECKS = ['container ryvo-n8n is running', 'container ryvo-caddy is running', 'container ryvo-db is running',
  'every active workflow has activeVersionId set', 'webhook rejects an unsigned POST with 403', 'newest dump is 6h old',
  'last backup run exited 0', 'one SPF record on ryvodigital.com', 'one DMARC record on ryvodigital.com (quarantine)',
  'Supabase reachable (HTTP 200)', 'metrics_daily has a row for 2026-09-21', 'no failed automation runs in the last 30 minutes',
  'n8n API key expires 2027-09-20 (363 days left)']
const up = monitorLine({ ok: true, body: { data: [
  { attributes: { status: 'up', pronounceable_name: 'the cockpit', url: 'https://ryvo-cockpit.vercel.app/api/health' } },
  { attributes: { status: 'up', pronounceable_name: 'n8n', url: 'https://n8n.ryvodigital.com/healthz' } },
  { attributes: { status: 'up', pronounceable_name: 'the Concierge heartbeat', url: 'https://x' } },
] } }, NOW)
const notAsked = monitorLine({ ok: false, why: 'No Better Stack token is configured here, so the monitor was not asked.' }, NOW)
const run = (over: Partial<NonNullable<InfrastructureInputs['run']>> = {}) => ({
  ranAt: new Date(NOW.getTime() - 4 * 60_000).toISOString(), ok: true, passed: CHECKS, failed: [], durationMs: 2400, host: 'ryvo-hel1', ...over,
})

function S(name: string, css: string, title: string, el: React.ReactElement, forbid: RegExp[] = []) {
  const html = renderToStaticMarkup(el)
  for (const f of forbid) assert.doesNotMatch(html, f, `${name}: ${f}`)
  writeFileSync(join(OUT, `${name}.html`), page(title, html, css))
  console.log(name)
}
const REASSURING = [/all up/, /nothing is wrong/i]

S('infra-green', CSS.infra, 'S1: a fresh run, everything passing, the monitor asked',
  <InfrastructureView infra={buildInfrastructure({ run: run(), failure: null, monitor: up, now: NOW })} />)
S('infra-stale', CSS.infra, 'S8: stale, and louder than the checks',
  <InfrastructureView infra={buildInfrastructure({ run: run({ ranAt: new Date(NOW.getTime() - 47 * 60_000).toISOString() }), failure: null, monitor: up, now: NOW })} />)
S('infra-failing', CSS.infra, 'checks failing, and the monitor not asked (S3)',
  <InfrastructureView infra={buildInfrastructure({ run: run({ ok: false, passed: CHECKS.slice(2), failed: ['last backup run FAILED (exit 1)', '2 SPF records on ryvodigital.com'] }), failure: null, monitor: notAsked, now: NOW })} />,
  REASSURING)
S('infra-read-failed', CSS.infra, 'S4: the read failed, which is not "every check failed"',
  <InfrastructureView infra={buildInfrastructure({ run: null, failure: 'health_runs: canceling statement due to statement timeout', monitor: notAsked, now: NOW })} />,
  REASSURING)
S('infra-never', CSS.infra, 'S2: never run',
  <InfrastructureView infra={buildInfrastructure({ run: null, failure: null, monitor: up, now: NOW })} />)

S('handback', CSS.handback, 'the per-lead hand-back, open',
  <div className="card"><HandBack leadId="11111111-2222-3333-4444-555555555555" clientId="c-sample" name="Inês Cardoso" /></div>)

S('copy', CSS.copy, '"Copy as text" on the weekly report',
  <CopyAsText text={'Semana de 14 a 20 de setembro\n\nConversas recebidas: 18\n  das quais da lista antiga: 4\nReuniões marcadas: 3\n'} />)
