/*
 * /OPS/EXPIRIES, RENDERED OUTSIDE NEXT, for a screenshot without a session (the
 * same reasons as tests/render-month-preview.tsx). It renders the SAME
 * ExpiriesView the page does, from buildExpiries over SAMPLE inputs (every name
 * fictional), and ASSERTS on the drawn HTML before writing it:
 *   - every <form> carries its own actId, and no two are equal;
 *   - no radio is drawn checked;
 *   - no input could hold a card number.
 *
 *   node --experimental-websocket --require ./tests/lib/render-outside-next.cjs --import tsx \
 *        tests/render-expiries-preview.tsx <outdir>
 *
 * Scenarios, all SAMPLE:
 *   busy     every list with rows: a certidão run out, a card about to, a
 *            procuração with no expiry stated, a stale domain reading, a lapsed
 *            clearance with two causes, a check that could not look for one
 *            cause, a client whose read failed
 *   forms    the same, every form opened
 *   quiet    nothing due: the empty lines and the S1 note's denominators
 *   refused  back from a refusal (a pasted card number)
 *
 * 🔒 THE STATE AFTER A SAVE is busy.html + the anchor the action redirects to:
 *    busy.html?guardado=1#obl-00000000-0000-4000-8000-000000000003
 *    (the card), which :target marks for a moment — the same thing the browser
 *    lands on after recording one.
 */
import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { ExpiriesView } from '../src/components/expiries/ExpiriesView'
import { buildExpiries, type ExpiriesInputs, type ObligationCurrent } from '../src/lib/expiries/model'
import type { StillGood } from '../src/lib/publication/still-good'
import type { Recheck } from '../src/lib/publication/recheck'
import type { Refusal } from '../src/lib/refusals'

const OUT = process.argv[2] ?? '/tmp/expiries-preview'
mkdirSync(OUT, { recursive: true })
const SRC = new URL('../src/', import.meta.url).pathname
const css = ['app/tokens.css', 'app/motion.css', 'components/expiries/expiries.module.css', 'components/state-chip.module.css']
  .map((f) => readFileSync(join(SRC, f), 'utf8')).join('\n')
const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<style>${css}
:root{--font-bricolage:'Bricolage Grotesque';--font-instrument:'Instrument Sans';--font-geist-mono:'Geist Mono'}
body{margin:0;background:var(--black);color:var(--text);font:15px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:28px 36px 60px}
.banner-x{margin:0 0 18px;padding:10px 14px;border-radius:12px;border:1px dashed var(--edge-2);color:var(--text-2);font-size:13px}
</style></head><body><div class="wrap"><p class="banner-x"><b>SAMPLE</b>: every name on this page is fictional. Rendered outside Next for review · ${title}</p>${body}</div></body></html>`

const NOW = new Date('2026-09-22T16:45:00Z')
const iso = (days: number) => new Date(NOW.getTime() + days * 86400000).toISOString().slice(0, 10)
const sg = (over: Partial<StillGood> = {}): StillGood => ({ documents: [], registrations: [], exempt: 0, warnWithinDays: 30, staleAfterDays: 90, at: NOW.toISOString(), notAnswered: [], ...over })
const doc = (id: string, daysLeft: number, standing: 'past' | 'soon' | 'good') => ({ listingId: id, reference: `A-${id}`, requirementId: 'pt_energy_certificate', certificateNumber: null, validUntil: iso(daysLeft), daysLeft, standing })
const reg = (n: string, standing: 'not_valid' | 'never_checked' | 'stale' | 'good', days: number | null = null) => ({ requirementId: 'pt_ami_licence', number: n, country: 'PT', region: null, status: 'valid' as never, checkedAt: null, daysSinceChecked: days, standing })
const recheck = (over: Partial<Recheck> = {}): Recheck => ({ lapsed: [], expiringSoon: [], toConfirm: [], stillGood: 0, checked: 0, warnWithinDays: 30, staleAfterDays: 90, notCheckedFor: [], ...over })
/*
 * 🔒 DETERMINISTIC IDS, so the preview can be opened at #obl-<id> and show the
 * state after a save — the row the action sends the browser back to. Random
 * ids would make that anchor unrepeatable, and the screenshot unreviewable.
 */
let seq = 0
const sampleId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
const ob = (over: Partial<ObligationCurrent>): ObligationCurrent => {
  const id = sampleId()
  return {
  id, obligation_id: id, act: 'entered', kind: 'certidao', label: '', expires_on: null, no_expiry_stated: false,
  card_brand: null, card_last_four: null, card_exp_month: null, card_exp_year: null, services: null, note: null,
  recorded_by: 'manuelvale@ryvodigital.com', recorded_at: '2026-09-10T10:00:00Z', ...over,
  }
}

const busy: ExpiriesInputs = {
  now: NOW,
  deployKey: { exp: '2027-09-20T22:00:00Z', readAt: '2026-09-22T16:40:04Z' },
  domain: { expiresOn: '2027-03-18', readAt: '2026-09-22T11:40:00Z' },
  obligations: [
    ob({ kind: 'certidao', label: 'Certidão permanente, Ryvo Digital Lda', expires_on: iso(-4), act: 'checked', recorded_at: '2026-06-02T09:00:00Z' }),
    ob({ kind: 'procuracao', label: 'Procuração for the Twilio sender', no_expiry_stated: true }),
    ob({ kind: 'payment_card', label: 'Company Visa', card_brand: 'Visa', card_last_four: '4242', card_exp_month: 9, card_exp_year: 2026, services: ['Hetzner', 'Twilio', 'Vercel'] }),
    ob({ kind: 'payment_card', label: 'Backup Mastercard', card_brand: 'Mastercard', card_last_four: '8817', card_exp_month: 5, card_exp_year: 2029, services: ['Supabase'], act: 'renewed', recorded_at: '2026-05-30T15:00:00Z' }),
  ],
  clients: [
    { id: 'c1', name: 'Marbella Sur', stillGood: sg({ documents: [doc('114', -12, 'past'), doc('207', 9, 'soon'), doc('310', 200, 'good')], registrations: [reg('AMI-18442', 'never_checked')] }) },
    { id: 'c2', name: 'Casa Atlântica', stillGood: null },
  ],
  clearances: [
    { id: 'c1', name: 'Marbella Sur', recheck: recheck({ checked: 14, stillGood: 12,
      lapsed: [{ clearanceId: 'k1', listingId: 'l1', reference: 'A-114', causes: ['certificate_expired', 'requirement_arrived'], requirementIds: ['pt_energy_certificate'], since: iso(-12), daysAgo: 12, noticeSentAt: null }],
      expiringSoon: [{ clearanceId: 'k2', listingId: 'l2', reference: 'A-207', expiresOn: iso(9), daysLeft: 9 }] }) },
    { id: 'c3', name: 'Quinta do Vale', recheck: recheck({ checked: 6, stillGood: 6, notCheckedFor: ['registration_revoked'] }) },
  ],
}
const quiet: ExpiriesInputs = {
  now: NOW, deployKey: { exp: '2027-09-20T22:00:00Z', readAt: '2026-09-22T16:40:04Z' },
  domain: { expiresOn: '2027-03-18', readAt: '2026-09-22T16:40:04Z' }, obligations: [],
  clients: [{ id: 'c1', name: 'Marbella Sur', stillGood: sg({ documents: [doc('310', 200, 'good')] }) }],
  clearances: [{ id: 'c1', name: 'Marbella Sur', recheck: recheck({ checked: 9, stillGood: 9 }) }],
}

function S(name: string, title: string, inputs: ExpiriesInputs, opts: { refusal?: Refusal; open?: boolean } = {}) {
  let html = renderToStaticMarkup(<ExpiriesView e={buildExpiries(inputs)} refusal={opts.refusal ?? null} />)
  // The drawn HTML, checked before anyone looks at it.
  const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/g)].map((m) => m[0])
  const ids = forms.map((f) => f.match(/name="actId" value="([^"]+)"/)?.[1])
  assert.ok(ids.every(Boolean), `${name}: a form without an actId`)
  assert.equal(new Set(ids).size, ids.length, `${name}: two forms share an actId`)
  assert.doesNotMatch(html, /<input[^>]*type="radio"[^>]*checked/, `${name}: a radio is drawn checked`)
  for (const m of html.matchAll(/<input[^>]*name="card(LastFour|Exp\w+)"[^>]*>/g)) if (!/type="hidden"/.test(m[0])) assert.match(m[0], /maxLength="(2|4)"/i, `${name}: ${m[0]}`)
  if (opts.open) html = html.replaceAll('<details class="more">', '<details class="more" open="">')
  writeFileSync(join(OUT, `${name}.html`), page(title, html))
  console.log(`${name}: ${forms.length} forms, ${ids.length} distinct ids`)
}

S('busy', 'every list with rows', busy)
S('forms', 'every form opened', busy, { open: true })
S('quiet', 'nothing due', quiet)
S('refused', 'back from a refusal: a pasted card number', busy, { refusal: { key: 'cardNumber' } as Refusal })
