/*
 * §11 item 20 — every screen is usable at the sizes it is actually opened at,
 * checked in a real browser.
 *
 * WHY A BROWSER AND NOT THE STYLESHEET
 * The cockpit has shipped unusable on a phone twice. Both times the CSS looked
 * correct when read: the first fix hid the nav below 900px, the second wrote a
 * `@media (max-width: 380px)` block that never fires on any phone anyone owns.
 * Reading CSS cannot catch either. Measuring the rendered page can.
 *
 * WHY THREE WIDTHS AND NOT ONE ROUND NUMBER
 * 360 is the common Android width, 390 is iPhone 12 through 15, 430 is the Pro
 * Max. A breakpoint written at 380 sits in the gap between two real devices and
 * is dead on all of them — which is exactly the defect this file exists to find,
 * so the widths are the devices, not the round numbers near them.
 *
 * WHAT IT ASSERTS, per route per width:
 *   1. document.documentElement.scrollWidth <= clientWidth  (no page scroll)
 *   2. every rendered font is >= 11px
 *   3. every tap target is >= 44px on its short side
 * plus two controls, because a check that cannot fail is not a check:
 *   A. a deliberately 2000px-wide element MUST be reported as overflow
 *   B. /login?error=<180 unbreakable characters> must not widen the page —
 *      the .notice overflow case, exercised through a real URL
 *
 * DESKTOP IS HALF OF THIS FILE, and it is here because the mobile-first
 * rewrite shipped a desktop regression: the sidebar appeared on the RIGHT.
 * Nothing was wrong with the CSS — Shell.tsx renders <main> before <nav>,
 * which is correct, and on a phone the bar is `position: fixed` so order
 * cannot matter. On desktop it becomes a flex sibling and source order
 * silently becomes visual order. No stylesheet reading catches that either.
 *
 *   node node_modules/.bin/node node_modules/tsx/dist/cli.mjs tests/probe-layout.ts
 *   (Node 22+: this uses the global WebSocket. There is no browser dependency
 *   in package.json on purpose — it drives the Chrome already on the machine
 *   over the DevTools protocol.)
 */
import { readFileSync, mkdtempSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { splitRoutes } from './lib/routes'

for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000'
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const MIN_FONT = 11
const MIN_TAP = 44

/** Real devices, not round numbers. */
const WIDTHS = [
  { w: 360, h: 800, name: 'Android' },
  { w: 390, h: 844, name: 'iPhone 12–15' },
  { w: 430, h: 932, name: 'iPhone Pro Max' },
]

let failures = 0
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures++
}

// ------------------------------------------------------------------ session

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

/** The same door a real click uses — generateLink produces the token_hash the
 *  email carries, handed to the same /auth/callback route. */
async function sessionCookies(email: string): Promise<{ name: string; value: string }[]> {
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw new Error(`generateLink failed: ${error.message}`)
  const hash = (data!.properties as { hashed_token: string }).hashed_token
  const r = await fetch(`${BASE}/auth/callback?token_hash=${hash}&type=magiclink`, {
    redirect: 'manual',
  })
  const out: { name: string; value: string }[] = []
  for (const raw of r.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(';')[0]
    const i = pair.indexOf('=')
    const name = pair.slice(0, i).trim()
    const value = pair.slice(i + 1).trim()
    if (value) out.push({ name, value })
  }
  return out
}

// ------------------------------------------------------------- CDP plumbing

type Chrome = { send: (m: string, p?: unknown) => Promise<any>; kill: () => void }

async function launch(): Promise<Chrome> {
  const dir = mkdtempSync(join(tmpdir(), 'ryvo-probe-'))
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

  const port = await new Promise<number>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Chrome did not report a debugging port')), 20_000)
    proc.stderr.on('data', (b: Buffer) => {
      const m = b.toString().match(/ws:\/\/127\.0\.0\.1:(\d+)\//)
      if (m) {
        clearTimeout(t)
        resolve(Number(m[1]))
      }
    })
  })

  // The page target that already exists — no /json/new, which needs a PUT in
  // recent Chrome and is one more thing to get wrong.
  let wsUrl = ''
  for (let i = 0; i < 40 && !wsUrl; i++) {
    const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
      type: string
      webSocketDebuggerUrl?: string
    }[]
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? ''
    if (!wsUrl) await new Promise((r) => setTimeout(r, 100))
  }
  if (!wsUrl) throw new Error('no page target')

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
      if (msg.error) w.rej(new Error(`${msg.error.message}`))
      else w.res(msg.result)
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
      }, 30_000)
    })

  ;(send as any).once = (method: string) =>
    new Promise<void>((res) => events.set(method, [...(events.get(method) ?? []), res]))

  return {
    send: Object.assign(send, { once: (send as any).once }),
    kill: () => {
      ws.close()
      proc.kill()
    },
  }
}

// -------------------------------------------------------------- measurement

/** Runs INSIDE the page. One expression, returned by value. */
const MEASURE = `(() => {
  const de = document.documentElement
  const limit = de.clientWidth
  const over = de.scrollWidth - limit

  const label = (el) => {
    const c = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || ''
    return el.tagName.toLowerCase() + (c ? '.' + c.trim().split(/\\s+/).slice(0, 2).join('.') : '')
  }

  const offenders = []
  if (over > 0) {
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.right > limit + 1) offenders.push({ el: label(el), right: Math.round(r.right), w: Math.round(r.width) })
    }
    offenders.sort((a, b) => b.right - a.right)
  }

  let minFont = Infinity, minFontEl = ''
  for (const el of document.querySelectorAll('body *')) {
    let hasText = false
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) hasText = true
    if (!hasText) continue
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue
    const px = parseFloat(s.fontSize)
    if (px < minFont) { minFont = px; minFontEl = label(el) }
  }

  let minTap = Infinity, minTapEl = ''
  for (const el of document.querySelectorAll('a, button, summary, input:not([type=hidden]), select, textarea, [role=button]')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const side = Math.min(r.width, r.height)
    if (side < minTap) { minTap = side; minTapEl = label(el) }
  }

  return {
    over, limit,
    scrollWidth: de.scrollWidth,
    offenders: offenders.slice(0, 3),
    minFont: minFont === Infinity ? null : Math.round(minFont * 10) / 10,
    minFontEl,
    minTap: minTap === Infinity ? null : Math.round(minTap),
    minTapEl,
  }
})()`

type Shot = {
  over: number
  limit: number
  scrollWidth: number
  offenders: { el: string; right: number; w: number }[]
  minFont: number | null
  minFontEl: string
  minTap: number | null
  minTapEl: string
}

async function measure(c: Chrome, url: string): Promise<Shot> {
  const loaded = (c.send as any).once('Page.loadEventFired')
  await c.send('Page.navigate', { url })
  await Promise.race([loaded, new Promise((r) => setTimeout(r, 15_000))])
  // Fonts and the settle animation both change layout after load.
  await new Promise((r) => setTimeout(r, 600))
  const { result } = await c.send('Runtime.evaluate', {
    expression: MEASURE,
    returnByValue: true,
  })
  return result.value as Shot
}

// --------------------------------------------------------------------- main

async function main() {
  const email = (process.env.COCKPIT_ALLOWED_EMAILS ?? '').split(',')[0].trim()
  const cookies = await sessionCookies(email)
  if (cookies.length === 0) throw new Error('no session cookie — is the app running at ' + BASE + '?')

  const { data: lead } = await db.from('leads').select('id').limit(1)
  const leadId = lead?.[0]?.id as string

  // Derived from src/app — see tests/lib/routes.ts. A page added under
  // src/app is measured at 360/390/430/1440/1920 by construction, and a
  // dynamic route with no id is REPORTED as skipped rather than dropped.
  const BY_ROUTE: Record<string, string> = { '/leads/[id]': leadId || '' }
  if (process.env.PROBE_IMPORT_BATCH) BY_ROUTE['/import/[id]'] = process.env.PROBE_IMPORT_BATCH
  const { usable: ROUTES, skipped } = splitRoutes({ byRoute: BY_ROUTE })

  if (skipped.length) {
    console.log(`   note: ${skipped.join(', ')} skipped — no id supplied\n`)
  }

  const c = await launch()
  const host = new URL(BASE).hostname
  await c.send('Page.enable')
  await c.send('Runtime.enable')
  await c.send('Network.enable')
  for (const { name, value } of cookies) {
    await c.send('Network.setCookie', { name, value, domain: host, path: '/' })
  }

  console.log(`\n§11 item 20 — phone layout, ${BASE}`)

  const worst: Record<string, Shot & { width: number }> = {}

  for (const dev of WIDTHS) {
    await c.send('Emulation.setDeviceMetricsOverride', {
      width: dev.w,
      height: dev.h,
      deviceScaleFactor: 1,
      mobile: true,
    })
    console.log(`\n  ${dev.w}px — ${dev.name}`)
    for (const route of ROUTES) {
      const s = await measure(c, `${BASE}${route}`)
      const ok = s.over <= 0
      check(
        ok,
        `${route} does not scroll sideways`,
        ok
          ? `${s.scrollWidth}px in ${s.limit}px`
          : `${s.scrollWidth}px in ${s.limit}px — widest: ${s.offenders
              .map((o) => `${o.el} to ${o.right}px`)
              .join(', ')}`,
      )
      const key = route
      if (!worst[key] || (s.minTap ?? 99) < (worst[key].minTap ?? 99)) {
        worst[key] = { ...s, width: dev.w }
      }
    }
  }

  console.log('\n  Type and tap targets (smallest seen on any width)')
  for (const [route, s] of Object.entries(worst)) {
    check(
      (s.minFont ?? 99) >= MIN_FONT,
      `${route} smallest type >= ${MIN_FONT}px`,
      `${s.minFont}px on ${s.minFontEl}`,
    )
    check(
      (s.minTap ?? 99) >= MIN_TAP,
      `${route} smallest tap target >= ${MIN_TAP}px`,
      `${s.minTap}px on ${s.minTapEl} at ${s.width}px`,
    )
  }

  console.log('\n  Controls — a check that cannot fail is not a check')

  await c.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })

  // A. plant a leak and confirm the measurement notices.
  await measure(c, `${BASE}/queue`)
  await c.send('Runtime.evaluate', {
    expression: `(() => { const d = document.createElement('div'); d.style.cssText = 'width:2000px;height:4px'; document.body.appendChild(d) })()`,
  })
  const planted = (
    await c.send('Runtime.evaluate', { expression: MEASURE, returnByValue: true })
  ).result.value as Shot
  check(
    planted.over > 0,
    'a planted 2000px element IS reported as overflow',
    planted.over > 0
      ? `reported ${planted.scrollWidth}px in ${planted.limit}px`
      : 'the page is clipping, so every pass above is meaningless',
  )

  // B. the .notice case, through a URL a real failure produces.
  const junk = 'x'.repeat(60) + '-' + 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'.repeat(4)
  const notice = await measure(c, `${BASE}/login?error=${encodeURIComponent(junk)}`)
  check(
    notice.over <= 0,
    '.notice holds an unbreakable 180-character error',
    notice.over <= 0
      ? `${notice.scrollWidth}px in ${notice.limit}px`
      : `${notice.scrollWidth}px in ${notice.limit}px — ${notice.offenders
          .map((o) => o.el)
          .join(', ')}`,
  )

  // C. the onboarding form is not red before it has been touched. Same idea
  // as §6b: a warning shown before there is anything to warn about is one you
  // learn to ignore. The control is the second half — pressing Continue and
  // coming back MUST make the same errors appear, or the form would simply
  // have stopped validating.
  await measure(c, `${BASE}/onboarding`)
  const untouched = (
    await c.send('Runtime.evaluate', {
      expression: `document.querySelectorAll('.field--bad, .ofield__err').length`,
      returnByValue: true,
    })
  ).result.value as number
  check(
    untouched === 0,
    'onboarding shows no field errors before anything is touched',
    `${untouched} error(s) on load`,
  )

  await c.send('Runtime.evaluate', {
    expression: `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Continue').click()`,
  })
  await new Promise((r) => setTimeout(r, 300))
  await c.send('Runtime.evaluate', {
    expression: `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Back').click()`,
  })
  await new Promise((r) => setTimeout(r, 300))
  const attempted = (
    await c.send('Runtime.evaluate', {
      expression: `document.querySelectorAll('.field--bad, .ofield__err').length`,
      returnByValue: true,
    })
  ).result.value as number
  check(
    attempted > 0,
    'onboarding DOES show them once the step has been submitted',
    attempted > 0
      ? `${attempted} shown after Continue`
      : 'nothing appeared, so the check above proves nothing',
  )

  // ------------------------------------------------------------- desktop

  console.log('\n  Desktop — 1440px')
  await c.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })

  const NAVSHAPE = `(() => {
    const vis = (s) => [...document.querySelectorAll(s)].filter((e) => {
      const r = e.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }).length
    return { more: vis('.tab--more'), dtab: vis('.dtab'), brand: vis('.tabs__brand'), sheet: vis('.sheet') }
  })()`

  const DESK = `(() => {
    const de = document.documentElement
    const box = (s) => { const e = document.querySelector(s); if (!e) return null
      const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) } }
    const f = document.querySelector('.filters')
    return {
      over: de.scrollWidth - de.clientWidth,
      limit: de.clientWidth,
      tabs: box('.tabs'),
      main: box('.main'),
      search: box('.searchrow'),
      msg: box('.msg'),
      filtersScroll: f ? f.scrollWidth > f.clientWidth + 1 : null,
    }
  })()`

  const desk: Record<string, any> = {}
  for (const route of ROUTES) {
    await measure(c, `${BASE}${route}`)
    desk[route] = (await c.send('Runtime.evaluate', { expression: DESK, returnByValue: true }))
      .result.value
    check(desk[route].over <= 0, `${route} does not scroll sideways at 1440px`,
      `${desk[route].limit + desk[route].over}px in ${desk[route].limit}px`)
  }

  /*
   * THE TWO NAVIGATIONS MUST NOT BOTH EXIST.
   *
   * Desktop expands the sidebar — Health, Onboarding and Sign out are listed
   * outright and the More button and its bottom sheet are gone. Those elements
   * are `display: none` in the base stylesheet and styled only inside the
   * desktop media query. When that one base rule was briefly missing, the
   * entire expanded sidebar spilled into the phone's tab bar and overprinted
   * it. Nothing else would have caught it: the page did not scroll, no target
   * shrank, and the CSS read as correct.
   */
  await c.send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  })
  await measure(c, `${BASE}/health`)
  const navPhone = (
    await c.send('Runtime.evaluate', { expression: NAVSHAPE, returnByValue: true })
  ).result.value
  check(
    navPhone.dtab === 0 && navPhone.brand === 0,
    'the expanded sidebar is absent on a phone',
    `${navPhone.dtab} expanded row(s), ${navPhone.brand} brand mark(s) visible at 390px`,
  )
  check(navPhone.more === 1, 'the phone still has its More button', `${navPhone.more} visible`)

  await c.send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  })
  await measure(c, `${BASE}/health`)
  const navDesk = (
    await c.send('Runtime.evaluate', { expression: NAVSHAPE, returnByValue: true })
  ).result.value
  check(
    navDesk.dtab === 4 && navDesk.brand === 1,
    'the desktop sidebar is fully expanded',
    `${navDesk.dtab} expanded row(s), ${navDesk.brand} brand mark(s) at 1440px`,
  )
  check(
    navDesk.more === 0 && navDesk.sheet === 0,
    'desktop has no More button and no bottom sheet',
    `more=${navDesk.more} sheet=${navDesk.sheet}`,
  )

  // The regression itself. The sidebar must sit BEFORE the content, not after.
  const q = desk['/queue']
  check(
    q.tabs !== null && q.main !== null && q.tabs.r <= q.main.l,
    'the sidebar is to the LEFT of the content',
    q.tabs ? `nav ends at ${q.tabs.r}px, main starts at ${q.main.l}px` : 'no .tabs found',
  )

  // And the app is centred rather than pinned to the left edge, which only
  // shows up above the width the layout was designed at.
  await c.send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  })
  const wide = (
    await c.send('Runtime.evaluate', { expression: DESK, returnByValue: true })
  ).result.value
  const leftGap = wide.tabs.l
  const rightGap = wide.limit - wide.main.r
  check(
    Math.abs(leftGap - rightGap) <= 4,
    'the app is centred at 1920px, not pinned left',
    `${leftGap}px left, ${rightGap}px right`,
  )

  // Values chosen for a 390px column that must not survive to 1440px.
  await c.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  check(
    desk['/leads'].search.w <= 520,
    'the search field is a field, not a banner',
    `${desk['/leads'].search.w}px`,
  )
  check(
    desk['/leads'].filtersScroll === false,
    'filter chips wrap on desktop instead of hiding in a scroller',
    desk['/leads'].filtersScroll === false ? 'wrapped' : 'still scrolling',
  )
  const detailRoute = ROUTES.find((r) => r.startsWith('/leads/'))!
  check(
    desk[detailRoute].msg === null || desk[detailRoute].msg.w <= 620,
    'a chat bubble is capped, not 88% of the panel',
    desk[detailRoute].msg ? `${desk[detailRoute].msg.w}px` : 'no messages on this lead',
  )

  // Control for the desktop half: force the old source order back and require
  // the sidebar check to fail. Without this, "sidebar on the left" would pass
  // on a page that had no sidebar at all.
  await measure(c, `${BASE}/queue`)
  await c.send('Runtime.evaluate', {
    expression: `document.querySelector('.tabs').style.order = '1'`,
  })
  const flipped = (
    await c.send('Runtime.evaluate', { expression: DESK, returnByValue: true })
  ).result.value
  check(
    flipped.tabs.r > flipped.main.l,
    'forcing the old source order DOES trip the sidebar check',
    flipped.tabs.r > flipped.main.l
      ? `nav moved to ${flipped.tabs.l}px`
      : 'the check cannot see the bug it exists for',
  )

  c.kill()

  console.log(`\n  ${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
