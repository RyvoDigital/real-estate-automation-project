/*
 * THE LOADING STATE, RENDERED OUTSIDE NEXT (23 Sep 2026) — the screen that used
 * to be the old dashboard for a moment on every navigation into onboarding.
 *
 *   node --experimental-websocket --require ./tests/lib/render-outside-next.cjs --import tsx \
 *        tests/render-skeleton-preview.tsx <outdir>
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { FrameSkeleton } from '../src/components/FrameSkeleton'

const OUT = process.argv[2] ?? '/tmp/skeleton-preview'
mkdirSync(OUT, { recursive: true })
const SRC = new URL('../src/', import.meta.url).pathname
const css = ['app/tokens.css', 'components/Frame.module.css', 'components/FrameSkeleton.module.css']
  .map((f) => readFileSync(join(SRC, f), 'utf8')).join('\n')

writeFileSync(join(OUT, 'onboarding.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>the loading state, on the frame</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&display=swap">
<style>${css}
:root{--font-bricolage:'Bricolage Grotesque';--font-instrument:'Instrument Sans'}
body{margin:0;background:var(--black);color:var(--text);font:15px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
</style></head><body>${renderToStaticMarkup(<FrameSkeleton current="onboarding" />)}</body></html>`)
console.log('onboarding')
