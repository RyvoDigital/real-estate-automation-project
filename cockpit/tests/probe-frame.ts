/*
 * THE CLIENT FRAME, IN A REAL BROWSER.
 *
 *   npm start                      # or npm run dev, then:
 *   npx tsx --env-file=.env.local tests/probe-frame.ts
 *
 * WHY A BROWSER AND NOT A UNIT TEST. Everything this file asserts is invisible
 * to anything reading the source, and all three of these were REAL defects
 * found on the first render of the first rebuilt screen, on 20 September 2026:
 *
 *   1. THE TYPEFACE SWAP WAS HALF DONE. `h1` resolved to Bricolage Grotesque
 *      and every paragraph under it was still Archivo, because globals.css
 *      sets the family on `body` and the new frame never claimed it. The
 *      screenshot looked entirely plausible — a grotesque heading over
 *      grotesque text — and the computed style is what gave it away.
 *      §0.5 is a decision about which faces; a half-applied swap is neither.
 *
 *   2. A BACKGROUND SEAM. The frame did not fill the viewport, so body's
 *      --page (#08080a) showed below the content as a band of a different
 *      black — close enough to read as a rendering artefact rather than a bug.
 *
 *   3. THE FIX FOR (2) CAUSED A THIRD. `min-height: 100dvh` on a grid with two
 *      auto rows distributes the slack BETWEEN them, so the phone's header row
 *      inflated from 68px to 192px. Caught by measuring the box; the
 *      screenshot just looked oddly spacious.
 *
 * Each has a control, because a check that cannot fail proves nothing.
 */

import { createClient } from '@supabase/supabase-js'
import { launch, sessionCookies } from './lib/chrome'

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } },
)

let failures = 0
function check(name: string, ok: boolean, detail: string) {
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}  — ${detail}`)
  if (!ok) failures++
}

async function main() {
  const email = (process.env.COCKPIT_ALLOWED_EMAILS ?? '').split(',')[0].trim()
  const cookies = await sessionCookies(email, BASE)
  if (cookies.length === 0) throw new Error(`no session cookie — is the app running at ${BASE}?`)

  const { data: clients } = await db.from('clients').select('id,name').limit(1)
  const client = clients?.[0]
  if (!client) throw new Error('no client to frame — this probe needs one row in clients')

  const c = await launch()
  await c.send('Page.enable')
  await c.send('Runtime.enable')
  await c.send('Network.enable')
  for (const { name, value } of cookies) {
    await c.send('Network.setCookie', { name, value, domain: new URL(BASE).hostname, path: '/' })
  }

  const evaluate = async (expression: string) => {
    const r = await c.send('Runtime.evaluate', { expression, returnByValue: true })
    return JSON.parse(r.result.value as string)
  }

  console.log(`\nThe client frame, ${BASE} — ${client.name}`)

  for (const [w, h, tag] of [
    [1440, 1000, 'desktop'],
    [390, 844, 'phone'],
  ] as const) {
    await c.send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: tag === 'phone',
    })
    await c.send('Page.navigate', { url: `${BASE}/c/${client.id}/escalations` })
    await new Promise((r) => setTimeout(r, 3000))

    console.log(`\n  ${tag} — ${w}px`)

    const seen = await evaluate(`JSON.stringify({
      h1: getComputedStyle(document.querySelector('h1')).fontFamily.split(',')[0].replace(/"/g,''),
      text: getComputedStyle(document.querySelector('main p')).fontFamily.split(',')[0].replace(/"/g,''),
      nav: getComputedStyle(document.querySelector('aside nav a, nav a')).fontFamily.split(',')[0].replace(/"/g,''),
      appH: Math.round(document.querySelector('aside').parentElement.getBoundingClientRect().height),
      asideH: Math.round(document.querySelector('aside').getBoundingClientRect().height),
      viewportH: window.innerHeight,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    })`)

    // 1. The faces actually in use, inside the frame.
    check(`${tag}: the display face is Bricolage Grotesque`, seen.h1 === 'Bricolage Grotesque', seen.h1)
    check(`${tag}: running text is Instrument Sans`, seen.text === 'Instrument Sans', seen.text)
    check(`${tag}: the navigation is Instrument Sans`, seen.nav === 'Instrument Sans', seen.nav)

    // 2. The frame fills the viewport, so no other black shows below it.
    check(
      `${tag}: the frame fills the viewport`,
      seen.appH >= seen.viewportH,
      `frame ${seen.appH}px in ${seen.viewportH}px`,
    )

    // 3. And filling it did not inflate the chrome.
    if (tag === 'phone') {
      check(
        'phone: the header row is a header row, not a stretched grid track',
        seen.asideH < 120,
        `${seen.asideH}px`,
      )
    }

    check(`${tag}: no sideways scroll`, seen.scrollW <= seen.clientW, `${seen.scrollW}px in ${seen.clientW}px`)
  }

  // ── controls ──────────────────────────────────────────────────────────────
  console.log('\n  controls — each must be REPORTED, or the checks above are decoration')

  const brokenFont = await evaluate(`(() => {
    const h = document.querySelector('h1'); const was = h.style.fontFamily;
    h.style.fontFamily = 'Comic Sans MS';
    const seen = getComputedStyle(h).fontFamily.split(',')[0].replace(/"/g,'');
    h.style.fontFamily = was;
    return JSON.stringify({ seen })
  })()`)
  check(
    'a wrong display face IS caught',
    brokenFont.seen !== 'Bricolage Grotesque',
    `forced ${brokenFont.seen}`,
  )

  const shrunk = await evaluate(`(() => {
    const app = document.querySelector('aside').parentElement; const was = app.style.minHeight;
    app.style.minHeight = '10px';
    const h = Math.round(app.getBoundingClientRect().height);
    app.style.minHeight = was;
    return JSON.stringify({ h, viewport: window.innerHeight })
  })()`)
  check(
    'a frame that does not fill the viewport IS caught',
    shrunk.h < shrunk.viewport,
    `${shrunk.h}px in ${shrunk.viewport}px`,
  )

  c.kill()
  console.log(failures === 0 ? '\n  all checks passed.\n' : `\n  ${failures} check(s) failed.\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
