/*
 * Does the display face survive a phone in daylight?
 *
 * WHY THIS EXISTS. Bodoni Moda is a Didone: its extreme thick/thin is the
 * reason it was chosen — it makes a number feel urgent, which is the
 * escalation queue's whole job — and it is also the risk. On a near-black
 * screen the hairlines are the first thing to go. "Looks fine" was measured on
 * a laptop at specimen size; this measures the RENDERED PIXELS at the sizes the
 * app actually uses, on the backgrounds it actually uses.
 *
 * HOW. Every element whose computed font-family is the display face is found
 * by reading --font-display off :root — no hand-kept list of selectors, because
 * a list like that goes stale the moment someone adds a heading (lesson 15).
 * Each one is screenshotted at its own bounding box at device pixel ratio 3
 * (an iPhone), the PNG is drawn back onto a canvas in the page, and the pixels
 * are read:
 *
 *   background   median relative luminance of the clip — mostly background
 *   peak         99th percentile — the strongest part of the strokes
 *   nominal      contrast of the DECLARED colour against that background
 *   rendered     contrast of the peak against that background
 *   reach        rendered / nominal — how much of the intended colour the
 *                strokes actually attain. A hairline that never reaches its
 *                own colour is a hairline that is not really there.
 *
 * WHAT FAILS. Nominal below 4.5:1 (stricter than WCAG's 3:1 for large text,
 * because that allowance assumes weight the Didone does not have), or reach
 * below 0.9 — the strokes must arrive at the colour they were promised.
 *
 *   PROBE_BASE=http://localhost:3000 npx tsx tests/probe-contrast.ts
 */
import { readFileSync, mkdtempSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000'
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const MIN_NOMINAL = 4.5
const MIN_REACH = 0.9

let failures = 0
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures++
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function sessionCookies() {
  const email = (process.env.COCKPIT_ALLOWED_EMAILS ?? '').split(',')[0].trim()
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw new Error(`generateLink failed: ${error.message}`)
  const hash = (data!.properties as { hashed_token: string }).hashed_token
  const r = await fetch(`${BASE}/auth/callback?token_hash=${hash}&type=magiclink`, {
    redirect: 'manual',
  })
  return (r.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf('=')
      return { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim() }
    })
}

type Chrome = { send: (m: string, p?: unknown) => Promise<any>; kill: () => void }

async function launch(): Promise<Chrome> {
  const dir = mkdtempSync(join(tmpdir(), 'ryvo-contrast-'))
  const proc = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    `--user-data-dir=${dir}`,
    '--remote-debugging-port=0',
    'about:blank',
  ])
  const port = await new Promise<number>((res, rej) => {
    const t = setTimeout(() => rej(new Error('no debugging port')), 20_000)
    proc.stderr.on('data', (b: Buffer) => {
      const m = b.toString().match(/ws:\/\/127\.0\.0\.1:(\d+)\//)
      if (m) {
        clearTimeout(t)
        res(Number(m[1]))
      }
    })
  })
  let wsUrl = ''
  for (let i = 0; i < 40 && !wsUrl; i++) {
    const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
      type: string
      webSocketDebuggerUrl?: string
    }[]
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? ''
    if (!wsUrl) await new Promise((r) => setTimeout(r, 100))
  }
  const ws = new WebSocket(wsUrl)
  await new Promise<void>((res, rej) => {
    ws.onopen = () => res()
    ws.onerror = () => rej(new Error('devtools socket failed'))
  })
  let id = 0
  const waiting = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>()
  const events = new Map<string, (() => void)[]>()
  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data))
    if (msg.id !== undefined) {
      const w = waiting.get(msg.id)
      waiting.delete(msg.id)
      if (!w) return
      msg.error ? w.rej(new Error(msg.error.message)) : w.res(msg.result)
    } else if (msg.method) {
      const fns = events.get(msg.method) ?? []
      events.set(msg.method, [])
      for (const fn of fns) fn()
    }
  }
  const send = (method: string, params?: unknown) =>
    new Promise<any>((res, rej) => {
      const n = ++id
      waiting.set(n, { res, rej })
      ws.send(JSON.stringify({ id: n, method, params: params ?? {} }))
      setTimeout(() => {
        if (waiting.delete(n)) rej(new Error(`${method} timed out`))
      }, 90_000)
    })
  ;(send as any).once = (m: string) =>
    new Promise<void>((res) => events.set(m, [...(events.get(m) ?? []), res]))
  return { send: Object.assign(send, { once: (send as any).once }), kill: () => { ws.close(); proc.kill() } }
}

/** Runs in the page: every element actually painted in the display face. */
const FIND = `(() => {
  const root = getComputedStyle(document.documentElement)
  const family = root.getPropertyValue('--font-display').split(',')[0].trim().replace(/^['"]|['"]$/g, '')
  if (!family) return { family: null, items: [] }
  const items = []
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (!cs.fontFamily.includes(family)) continue
    let text = ''
    for (const n of el.childNodes) if (n.nodeType === 3) text += n.textContent
    if (!text.trim()) continue
    const r = el.getBoundingClientRect()
    // NOT just r.top < 0. An element BELOW the fold screenshots as a blank
    // clip unless captureBeyondViewport is set, and a blank clip measures as a
    // font with no strokes — which is a probe bug wearing the costume of the
    // exact defect this probe looks for. Both are handled: the flag is set on
    // the capture, and anything absurdly large is skipped rather than sent
    // through the base64 round trip.
    if (r.width < 4 || r.height < 4) continue
    if (r.width > 600 || r.height > 220) continue
    const c = typeof el.className === 'string' ? el.className : ''
    items.push({
      sel: el.tagName.toLowerCase() + (c ? '.' + c.trim().split(/\\s+/)[0] : ''),
      size: Math.round(parseFloat(cs.fontSize) * 10) / 10,
      weight: cs.fontWeight,
      color: cs.color,
      text: text.trim().slice(0, 22),
      x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height,
    })
  }
  return { family, items }
})()`

/** Runs in the page: read the captured PNG back and measure it. */
const MEASURE = (b64: string, color: string) => `(async () => {
  const img = new Image()
  img.src = 'data:image/png;base64,${b64}'
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth; c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, c.width, c.height).data

  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

  const L = []
  for (let i = 0; i < d.length; i += 4) L.push(lum(d[i], d[i + 1], d[i + 2]))
  L.sort((a, b) => a - b)
  const at = (q) => L[Math.min(L.length - 1, Math.max(0, Math.floor(q * (L.length - 1))))]

  const bg = at(0.5)

  const m = '${color}'.match(/[\\d.]+/g).map(Number)
  const declared = lum(m[0], m[1], m[2])
  const up = declared > bg

  /*
   * THE PEAK MUST BE TAKEN OVER THE INK, NOT OVER THE CLIP.
   *
   * The first version of this used the 99th percentile of every pixel in the
   * box. That works only while the glyphs cover more than 1% of it. A single
   * "1" in a wide stat card covers about 1%, so the 99th percentile landed on
   * a half-covered antialiased edge and the check reported the font failing at
   * 34px. It was the percentile failing, not the font — and it failed in the
   * direction that looks like the exact defect this probe hunts, which is the
   * most expensive kind of wrong.
   *
   * So: separate ink from background first (anything a fifth of the way to the
   * declared colour), then take a high percentile WITHIN the ink. That is
   * stable whether the glyph fills the box or sits alone in it.
   */
  const inkFloor = bg + (declared - bg) * 0.2
  const ink = L.filter((v) => (up ? v >= inkFloor : v <= inkFloor))
  ink.sort((a, b) => a - b)
  const peak = ink.length
    ? ink[Math.min(ink.length - 1, Math.floor((up ? 0.9 : 0.1) * (ink.length - 1)))]
    : bg

  const nominal = ratio(declared, bg)
  const rendered = ratio(peak, bg)
  // How many pixels get most of the way to the declared colour.
  const target = bg + (declared - bg) * 0.8
  let solid = 0
  for (const v of L) if (up ? v >= target : v <= target) solid++

  return {
    bg, peak, declared,
    nominal: Math.round(nominal * 100) / 100,
    rendered: Math.round(rendered * 100) / 100,
    reach: Math.round((rendered / nominal) * 1000) / 1000,
    solidPct: Math.round((solid / L.length) * 1000) / 10,
    px: L.length,
    inkPx: ink.length,
  }
})()`

async function main() {
  const cookies = await sessionCookies()
  const { data: lead } = await db.from('leads').select('id').limit(1)
  const ROUTES = [
    '/login',
    '/queue',
    '/leads',
    `/leads/${lead?.[0]?.id}`,
    '/onboarding',
    '/health',
    '/report',
  ]

  const c = await launch()
  const host = new URL(BASE).hostname
  await c.send('Page.enable')
  await c.send('Runtime.enable')
  await c.send('Network.enable')
  for (const { name, value } of cookies) {
    await c.send('Network.setCookie', { name, value, domain: host, path: '/' })
  }
  // An iPhone: 390 CSS px at device pixel ratio 3.
  await c.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  })

  console.log(`\nDisplay face in rendered pixels — ${BASE}, 390px @3x\n`)
  console.log(
    '   element                  size  wt   nominal  rendered  reach   ink%   sample',
  )

  let family = ''
  let seen = 0
  const rows: { sel: string; size: number; nominal: number; reach: number; text: string }[] = []
  const blanks: string[] = []

  for (const route of ROUTES) {
    const loaded = (c.send as any).once('Page.loadEventFired')
    await c.send('Page.navigate', { url: `${BASE}${route}` })
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 15_000))])
    await new Promise((r) => setTimeout(r, 900))

    const found = (await c.send('Runtime.evaluate', { expression: FIND, returnByValue: true }))
      .result.value as { family: string | null; items: any[] }
    family ||= found.family ?? ''

    for (const it of found.items) {
      const shot = await c.send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: it.x, y: it.y, width: it.w, height: it.h, scale: 1 },
        captureBeyondViewport: true,
      })
      const m = (
        await c.send('Runtime.evaluate', {
          expression: MEASURE(shot.data, it.color),
          returnByValue: true,
          awaitPromise: true,
        })
      ).result.value

      if (m.solidPct === 0) {
        console.log(
          `   ${it.sel.padEnd(24)} ${String(it.size).padStart(4)}  ${String(it.weight).padStart(3)}` +
            '   BLANK CAPTURE — not measured, and not counted as a pass',
        )
        blanks.push(it.sel)
        continue
      }
      seen++
      rows.push({ sel: it.sel, size: it.size, nominal: m.nominal, reach: m.reach, text: it.text })
      console.log(
        `   ${it.sel.padEnd(24)} ${String(it.size).padStart(4)}  ${String(it.weight).padStart(3)}` +
          `  ${String(m.nominal).padStart(7)}  ${String(m.rendered).padStart(8)}` +
          `  ${m.reach.toFixed(2).padStart(5)}  ${String(m.solidPct).padStart(5)}   ${it.text}`,
      )
    }
  }

  console.log(`\n   display face in use: ${family || '(none found)'}   sites measured: ${seen}\n`)

  check(seen > 0, 'the display face was actually found on the pages', `${seen} site(s)`)
  check(
    blanks.length === 0,
    'every site was actually captured',
    blanks.length === 0 ? 'no blank clips' : `blank: ${blanks.join(', ')} — measurement not valid`,
  )

  const tooSmall = rows.filter((r) => r.size < 30)
  check(
    tooSmall.length === 0,
    'the display face is never used below 30px',
    tooSmall.length === 0
      ? 'smallest is ' + Math.min(...rows.map((r) => r.size)) + 'px'
      : tooSmall.map((r) => `${r.sel} at ${r.size}px`).join(', '),
  )

  const dim = rows.filter((r) => r.nominal < MIN_NOMINAL)
  check(
    dim.length === 0,
    `every display site clears ${MIN_NOMINAL}:1 against its own background`,
    dim.length === 0
      ? 'lowest is ' + Math.min(...rows.map((r) => r.nominal)) + ':1'
      : dim.map((r) => `${r.sel} ${r.nominal}:1`).join(', '),
  )

  const thin = rows.filter((r) => r.reach < MIN_REACH)
  check(
    thin.length === 0,
    `the strokes reach the colour they were promised (>= ${MIN_REACH})`,
    thin.length === 0
      ? 'lowest reach ' + Math.min(...rows.map((r) => r.reach)).toFixed(2)
      : thin.map((r) => `${r.sel} at ${r.size}px reaches ${r.reach.toFixed(2)}`).join(', '),
  )

  /*
   * CONTROLS. Both assertions above returned the healthiest possible number on
   * every site, and a check that only ever says "fine" is not a check (§6b).
   * So two deliberately bad cases are planted on a real page and measured by
   * the same code path.
   *
   * They also mark the limit of what this probe can see. At device pixel ratio
   * 3 a 34px Didone hairline is two or three device pixels wide and does reach
   * its colour, so `reach` answers "did the strokes render", not "will they
   * survive glare". The honest proxy for the second question is the ink column
   * — how much of the box is actually inked — which is reported for every site
   * and compared against the outgoing face rather than asserted against a
   * number nobody can defend.
   */
  console.log('   Controls — planted failures, measured by the same code')

  const plant = async (css: string) => {
    await c.send('Runtime.evaluate', {
      expression: `(() => {
        document.querySelector('#ryvo-plant')?.remove()
        const s = document.createElement('span')
        s.id = 'ryvo-plant'
        s.textContent = 'Escalations'
        s.style.cssText = 'position:fixed;left:12px;top:400px;z-index:9999;font-family:var(--f-display);' + ${JSON.stringify(css)}
        document.body.appendChild(s)
        const r = s.getBoundingClientRect()
        return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, color: getComputedStyle(s).color }
      })()`,
      returnByValue: true,
    })
  }

  const measurePlant = async () => {
    const r = (
      await c.send('Runtime.evaluate', {
        expression: `(() => { const s = document.querySelector('#ryvo-plant'); const b = s.getBoundingClientRect()
          return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height, color: getComputedStyle(s).color } })()`,
        returnByValue: true,
      })
    ).result.value
    const shot = await c.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 },
      captureBeyondViewport: true,
    })
    return (
      await c.send('Runtime.evaluate', {
        expression: MEASURE(shot.data, r.color),
        returnByValue: true,
        awaitPromise: true,
      })
    ).result.value
  }

  const loaded = (c.send as any).once('Page.loadEventFired')
  await c.send('Page.navigate', { url: `${BASE}/queue` })
  await Promise.race([loaded, new Promise((r) => setTimeout(r, 15_000))])
  await new Promise((r) => setTimeout(r, 800))

  // 1. dim: the colour itself is too close to the background.
  await plant("font-size:34px;font-weight:500;color:var(--ink-4);background:var(--page);padding:4px")
  const dimPlant = await measurePlant()
  check(
    dimPlant.nominal < MIN_NOMINAL,
    'a deliberately dim colour IS caught by the contrast assertion',
    `planted ink-4 on page reads ${dimPlant.nominal}:1, under the ${MIN_NOMINAL}:1 floor`,
  )

  // 2. thin: the strokes never attain the colour they declare.
  await plant("font-size:34px;font-weight:500;color:#fff;opacity:0.28;background:var(--page);padding:4px")
  const thinPlant = await measurePlant()
  check(
    thinPlant.reach < MIN_REACH,
    'strokes that never attain their colour ARE caught by the reach assertion',
    `planted 28% ink reaches ${thinPlant.reach.toFixed(2)}, under the ${MIN_REACH} floor`,
  )

  c.kill()
  console.log(`\n  ${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
