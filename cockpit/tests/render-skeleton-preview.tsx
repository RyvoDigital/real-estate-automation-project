/*
 * THE LOADING STATE AND THE SCREEN IT COVERS, SIDE BY SIDE, IN THE REAL FRAME
 * (23 Sep 2026).
 *
 *   node --experimental-websocket --require ./tests/lib/render-outside-next.cjs --import tsx \
 *        --env-file=.env.local tests/render-skeleton-preview.tsx <outdir>
 *
 * 🔴 IT RENDERS THE FRAME, not a replica of it, because the whole question this
 * answers is geometric: does anything move when the real screen replaces the
 * skeleton? A preview that laid the chrome out by hand would be a test that
 * cannot fail (brief §0.5; tests/preview-fidelity.test.ts). So <Frame> is
 * awaited here exactly as a layout awaits it, and the loading component is the
 * one Next renders.
 *
 * Writes, per route, `<route>-loading.html` and `<route>-real.html`. The two
 * are measured against each other in a browser — a screenshot shows what a
 * screen looks like, not what it measures.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { Frame } from '../src/components/Frame'

import TodayLoading from '../src/app/(operator)/today/loading'
import ClientsLoading from '../src/app/(operator)/clients/loading'
import OnboardingLoading from '../src/app/(operator)/onboarding/loading'
import ExpiriesLoading from '../src/app/(operator)/ops/expiries/loading'
import InfrastructureLoading from '../src/app/(operator)/ops/infrastructure/loading'
import MonthLoading from '../src/app/(operator)/loading'

const OUT = process.argv[2] ?? '/tmp/skeleton-preview'
mkdirSync(OUT, { recursive: true })
const SRC = new URL('../src/', import.meta.url).pathname

/** Every stylesheet in src/, so the preview cannot be missing one the page has. */
function sheets(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) sheets(p, out)
    else if (p.endsWith('.css')) out.push(p)
  }
  return out
}
/*
 * 🔴 Namespaced, because this preview inlines the GLOBAL sheet too. Unhashed,
 * globals.css's `.main > * { animation: settle }` — written for the old Shell,
 * which really does use className="main" — also matched Frame.module.css's
 * `.main`, and every screen appeared to fade in over 200ms. It does not: Next
 * hashes the module's class to `.Frame-module__hzMlwG__main`. Run with
 * PREVIEW_NAMESPACE=1 so the two cannot meet here either.
 */
const { namespaceCss } = require('./lib/render-outside-next.cjs') as { namespaceCss: (f: string, t: string) => string }
if (process.env.PREVIEW_NAMESPACE !== '1') {
  throw new Error('run with PREVIEW_NAMESPACE=1 — without it this preview shows an animation the page does not have')
}
const css = sheets(SRC).map((f) => namespaceCss(f, readFileSync(f, 'utf8'))).join('\n')

function html(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<style>${css}
:root{--font-bricolage:'Bricolage Grotesque';--font-instrument:'Instrument Sans';--font-geist-mono:'Geist Mono'}
body{margin:0;background:var(--black);color:var(--text);font:15px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
</style></head><body>${body}</body></html>`
}

/*
 * The frame, awaited the way src/app/(operator)/layout.tsx awaits it. The
 * address is a placeholder of the same shape: the operator's own address is
 * personal data and this file is written to be screenshotted.
 */
async function framed(current: string, children: React.ReactNode): Promise<string> {
  const el = await Frame({ mode: 'operator', current, counts: null, operatorEmail: 'operator@example.com', children })
  return renderToStaticMarkup(el as React.ReactElement)
}

const ROUTES: { slug: string; name: string; Loading: () => React.ReactNode }[] = [
  { slug: 'today', name: 'today', Loading: TodayLoading },
  { slug: 'clients', name: 'clients', Loading: ClientsLoading },
  { slug: 'onboarding', name: 'onboarding', Loading: OnboardingLoading },
  { slug: 'expiries', name: 'expiries', Loading: ExpiriesLoading },
  { slug: 'infrastructure', name: 'infrastructure', Loading: InfrastructureLoading },
  { slug: 'month', name: 'month', Loading: MonthLoading },
]

async function main() {
  for (const { slug, name, Loading } of ROUTES) {
    writeFileSync(join(OUT, `${name}-loading.html`), html(`${name} · loading`, await framed(slug, <Loading />)))
    console.log(`${name}-loading`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
