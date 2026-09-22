/*
 * /TODAY, RENDERED OUTSIDE NEXT, for a screenshot without a session (the same
 * reasons as tests/render-month-preview.tsx: no preview route, no auth
 * exemption, and never an operator session minted to look).
 *
 *   node --experimental-websocket --require ./tests/lib/render-outside-next.cjs --import tsx \
 *        --env-file=.env.local tests/render-today-preview.tsx <outdir>
 *
 * Scenarios:
 *   real      production, read-only, through the page's own read (lib/today/read.ts); all collapsed, as served
 *   real-open the same read, groups 3, 4 and 5 opened for review
 *   busy      SAMPLE: every group with rows; 1, 3, 4 and 5 opened
 *   quiet     SAMPLE: every group resting, group 2's read failed, the ⓘ open
 *   never     SAMPLE: S2, no client has any automation on
 * Every sample name is fictional by the design's rule.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { NotDone, TodayView } from '../src/components/today/TodayView'
import { Stamp } from '../src/components/Stamp'
import { buildToday, type TodayModel } from '../src/lib/today/model'
import { buildExpiries } from '../src/lib/expiries/model'
import { openGatesOldestFirst } from '../src/lib/gates'
import { readToday } from '../src/lib/today/read'
import type { QueueRow, AnomalyFeed } from '../src/lib/data'
import type { AnomalyGroup, AnomalyRow } from '../src/lib/anomaly'
import type { StillGood } from '../src/lib/publication/still-good'

const OUT = process.argv[2] ?? '/tmp/today-preview'
mkdirSync(OUT, { recursive: true })
const SRC = new URL('../src/', import.meta.url).pathname
const css = ['app/tokens.css', 'components/today/today.module.css', 'components/state-chip.module.css', 'components/clock.module.css', 'components/stamp.module.css']
  .map((f) => readFileSync(join(SRC, f), 'utf8')).join('\n')

function page(title: string, sample: boolean, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<style>${css}
:root{--font-bricolage:'Bricolage Grotesque';--font-instrument:'Instrument Sans';--font-geist-mono:'Geist Mono'}
body{margin:0;background:var(--black);color:var(--text);font:15px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:28px 36px 60px}
/* PREVIEW ONLY: outside Next the module class names are not hashed, so state-chip's .clock (a meaning) and
   Clock's .clock (a layout) collide here. In Next they are two classes; these two rules restore that. */
.chip.clock{display:inline-flex;flex-direction:row;align-items:center;gap:6px}
.clock:not(.chip){background:none;box-shadow:none}
.banner-x{margin:0 0 18px;padding:10px 14px;border-radius:12px;border:1px dashed var(--edge-2);color:var(--text-2);font-size:13px}
</style></head><body><div class="wrap">
<p class="banner-x">${sample ? '<b>SAMPLE</b>: every name on this page is fictional (the design’s rule). Rendered outside Next for review.' : '<b>REAL</b>: production, read-only, through the page’s own read. Rendered outside Next for review.'} · ${title}</p>
${body}</div></body></html>`
}

function draw(name: string, title: string, sample: boolean, model: TodayModel, queue: QueueRow[] | null, anomalies: AnomalyFeed | null, readAt: string, open: number[] = [], aboutOpen = false) {
  let body = renderToStaticMarkup(
    <div className="page">
      <header className="header">
        <h1 className="title">Today</h1>
        <NotDone />
        <span className="stampSlot"><Stamp serverAt={readAt} /></span>
      </header>
      <TodayView model={model} queue={queue} anomalies={anomalies} windowDays={7} now={Date.parse(readAt)} />
    </div>,
  )
  for (const n of open) body = body.replace(`<details class="group" id="group-${n}"`, `<details class="group" open="" id="group-${n}"`)
  if (aboutOpen) body = body.replace('<details class="about">', '<details class="about" open="">')
  writeFileSync(join(OUT, `${name}.html`), page(title, sample, body))
  console.log(`${name}: ${model.groups.map((g) => `${g.n}:${g.state}`).join(' ')}${model.never ? ' (S2)' : ''}`)
}

const NOW = new Date('2026-09-22T09:40:00Z')
const ago = (m: number) => new Date(NOW.getTime() - m * 60000).toISOString()
const qr = (id: string, name: string, client: string, minutes: number, reason: string, over: Partial<QueueRow> = {}): QueueRow => ({
  id, name, phone: '+351910000000', clientId: `c-${client}`, clientName: client, at: ago(minutes), minutes, tier: 0, reasons: [reason],
  primary: reason.startsWith('claude') ? 'system' : reason.startsWith('high_value') ? 'high_value' : 'person',
  classes: [reason.startsWith('claude') ? 'system' : reason.startsWith('high_value') ? 'high_value' : 'person'],
  lastMessage: null, handledElsewhere: false, handledAt: null, ...over,
})
const an = (kind: string, label: string, summary: string, minutesAgo: number, severity: 'critical' | 'warning', count: number): AnomalyGroup => ({
  latest: { id: kind, at: ago(minutesAgo), type: 'invariant.violated', severity, invariant: null, kind, label, summary, textSent: null, leadId: null, clientId: null, stage: null, executionUrl: null } as AnomalyRow,
  count, oldestAt: ago(minutesAgo + 900),
})
const sg = (over: Partial<StillGood>): StillGood => ({ documents: [], registrations: [], exempt: 0, warnWithinDays: 30, staleAfterDays: 90, at: NOW.toISOString(), notAnswered: [], ...over })
const doc = (id: string, ref: string, days: number, standing: 'past' | 'soon' | 'good', number: string | null = null) => ({ listingId: id, reference: ref, requirementId: 'pt_energy_certificate', certificateNumber: number, validUntil: new Date(NOW.getTime() + days * 86400000).toISOString().slice(0, 10), daysLeft: days, standing })
const reg = (n: string, standing: 'not_valid' | 'never_checked' | 'stale' | 'good', days: number | null = null) => ({ requirementId: 'pt_ami_licence', number: n, country: 'PT', region: null, status: 'valid' as never, checkedAt: null, daysSinceChecked: days, standing })

async function main() {
  const real = await readToday()
  draw('real', `today, as served (${real.readAt.slice(0, 16)}Z)`, false, real.model, real.queue, real.anomalies, real.readAt)
  draw('real-open', 'the same read, groups 3, 4 and 5 opened', false, real.model, real.queue, real.anomalies, real.readAt, [3, 4, 5])

  // ── busy ──
  const queue = [
    qr('l1', 'Inês Carvalhal', 'Marbella Sur', 312, 'needs_human:wants to talk to someone'),
    qr('l2', 'Tomás Reigada', 'Casa Atlântica', 64, 'high_value:3200000>=1500000'),
    // 🔒 no number on file: the row must render WITHOUT a link, not with one that cannot work
    qr('l3', 'Beatriz Lobato', 'Marbella Sur', 11, 'booking_lost_race', { phone: null }),
    qr('l4', 'Rui Fonsequinha', 'Casa Atlântica', 420, 'no_availability:window_full', { handledElsewhere: true, handledAt: ago(38) }),
  ]
  const feed: AnomalyFeed = {
    groups: [
      an('empty_reply', 'The model returned an empty reply', 'Retried once; the second reply was sent.', 26, 'warning', 3),
      an('lang', 'A reply went out in the wrong language', 'Replied in Portuguese to a lead writing in English.', 540, 'critical', 1),
    ],
    total: 4, capped: false, leadNames: new Map(),
  }
  const expiries = buildExpiries({
    deployKey: { exp: new Date(NOW.getTime() + 19 * 86400000).toISOString(), readAt: ago(6) },
    clients: [
      { id: 'c-ms', name: 'Marbella Sur', stillGood: sg({ documents: [doc('1', 'MS-114', -12, 'past', 'SCE123456'), doc('2', 'MS-120', 9, 'soon'), doc('3', 'MS-131', 210, 'good')], registrations: [reg('12877', 'never_checked')] }) },
      { id: 'c-ca', name: 'Casa Atlântica', stillGood: sg({ documents: [doc('4', 'CA-7', -2, 'past'), doc('5', 'CA-9', 27, 'soon')], registrations: [reg('9031', 'stale', 131), reg('8820', 'good', 4)] }) },
    ],
    now: NOW,
  })
  const busy = buildToday({ queue: { rows: queue, threw: '', cap: 100 }, anomalies: { groups: feed.groups, total: 4, capped: false, threw: '', windowDays: 7 }, clientsWithAutomation: 2, expiries, waiting: openGatesOldestFirst(), now: NOW })
  draw('busy', 'every group with rows; 1, 3, 4 and 5 opened', true, busy, queue, feed, NOW.toISOString(), [1, 3, 4, 5])
  draw('busy-closed', 'every group with rows, collapsed as served', true, busy, queue, feed, NOW.toISOString())

  // ── quiet, with one failed read ──
  const quiet = buildToday({
    queue: { rows: [], threw: '', cap: 100 },
    anomalies: { groups: null, total: 0, capped: false, threw: 'events: 503 Service Unavailable', windowDays: 7 },
    clientsWithAutomation: 2,
    expiries: buildExpiries({ deployKey: { exp: new Date(NOW.getTime() + 300 * 86400000).toISOString(), readAt: ago(4) }, clients: [{ id: 'c-ms', name: 'Marbella Sur', stillGood: sg({ documents: [doc('3', 'MS-131', 210, 'good')], registrations: [reg('1', 'good', 3)] }) }], now: NOW }),
    waiting: [],
    now: NOW,
  })
  draw('quiet', 'everything resting, group 2’s read failed, the ⓘ open', true, quiet, [], null, NOW.toISOString(), [2], true)

  const never = buildToday({ queue: { rows: [], threw: '', cap: 100 }, anomalies: { groups: [], total: 0, capped: false, threw: '', windowDays: 7 }, clientsWithAutomation: 0, expiries: buildExpiries({ deployKey: 'no_run', clients: [], now: NOW }), waiting: [], now: NOW })
  draw('never', 'S2: no client has any automation on', true, never, [], null, NOW.toISOString())
}
main().catch((e) => { console.error(e); process.exit(1) })
