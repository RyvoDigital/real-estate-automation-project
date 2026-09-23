/*
 * THE SCREEN CHANGING, MEASURED WHILE IT CHANGES.
 *
 *   npm start            # or: next start -p 3123
 *   PROBE_BASE=http://127.0.0.1:3123 npx tsx --env-file=.env.local tests/probe-transition.ts
 *
 * WHY A BROWSER. Everything Stage 3 claims is invisible to anything reading
 * the source. Whether React's <ViewTransition> actually starts a browser
 * transition in this Next build, whether the chrome is held still, and above
 * all whether the DESTINATION arrives at full strength — none of that can be
 * read off a stylesheet, because the rules live on pseudo-elements that only
 * exist for the 120ms the transition is running.
 *
 * 🔴 THE ONE THAT MATTERS IS `newScreen`. §1.14 rule F: a loud state never
 * animates its entrance, and the operator's own constraint is that no motion
 * may delay reading a number or a sentence. Both are satisfied by exactly one
 * fact — that the arriving screen has no animation at all — and this is where
 * that fact is checked.
 *
 * 🔒 It drives the Chrome already on the machine over CDP (tests/lib/chrome.ts)
 * against a LOCAL server. It reads no rows and prints no data.
 */
import { launch, sessionCookies } from './lib/chrome'

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:3123'

type Part = { animationName: string; animationDuration: string; display: string; zIndex: string }
type Sample = {
  oldScreen: Part; newScreen: Part; groupChrome: Part; oldChrome: Part
  overlayPointerEvents: string
}

let failures = 0
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures++
}

/** Installed before the click: wraps startViewTransition and samples the run. */
const HOOK = `
  window.__vt = { called: 0, samples: [] };
  const orig = document.startViewTransition && document.startViewTransition.bind(document);
  if (orig) {
    document.startViewTransition = (cb) => {
      window.__vt.called++;
      const t = orig(cb);
      const style = (sel) => {
        const cs = getComputedStyle(document.documentElement, sel);
        return { animationName: cs.animationName, animationDuration: cs.animationDuration, display: cs.display, zIndex: cs.zIndex };
      };
      t.ready.then(() => {
        window.__vt.samples.push({
          oldScreen: style('::view-transition-old(screen)'),
          newScreen: style('::view-transition-new(screen)'),
          groupChrome: style('::view-transition-group(chrome)'),
          oldChrome: style('::view-transition-old(chrome)'),
          overlayPointerEvents: getComputedStyle(document.documentElement, '::view-transition').pointerEvents,
        });
      }).catch(() => {});
      return t;
    };
  }
  window.__vtSupported = typeof orig === 'function';
`

async function run(reducedMotion: boolean) {
  const chrome = await launch()
  const { send } = chrome
  const evaluate = async (expression: string) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? 'evaluate failed')
    return r.result?.value
  }
  try {
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Network.enable')
    if (reducedMotion) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    }

    const cookies = await sessionCookies((process.env.COCKPIT_ALLOWED_EMAILS ?? '').split(',')[0].trim(), BASE)
    await send('Network.setCookies', { cookies: cookies.map((c) => ({ ...c, url: BASE })) })

    const loaded = (send as unknown as { once: (m: string) => Promise<void> }).once('Page.loadEventFired')
    await send('Page.navigate', { url: `${BASE}/today` })
    await loaded
    await new Promise((r) => setTimeout(r, 1200)) // let the app hydrate

    await evaluate(HOOK)
    const supported = await evaluate('window.__vtSupported')

    // The navigation: a real click on a real nav link, which is what rule G
    // means by "something the operator did".
    const clicked = await evaluate(`(() => {
      const a = [...document.querySelectorAll('aside a')].find((x) => x.getAttribute('href') === '/clients');
      if (!a) return false; a.click(); return true;
    })()`)
    await new Promise((r) => setTimeout(r, 1500))

    const vt = await evaluate('JSON.stringify(window.__vt)')
    return { supported, clicked, vt: JSON.parse(vt ?? '{}') as { called: number; samples: Sample[] } }
  } finally {
    chrome.kill()
  }
}

async function main() {
  console.log(`\nThe screen changing — ${BASE}\n`)

  const normal = await run(false)
  check(normal.supported === true, 'the browser supports view transitions', String(normal.supported))
  check(normal.clicked === true, 'a nav link was clicked', 'the operator caused it (rule G)')
  check(normal.vt.called > 0, 'the navigation starts a view transition', `startViewTransition called ${normal.vt.called}×`)

  const s = normal.vt.samples[0]
  if (!s) {
    check(false, 'the transition was sampled while running', 'no sample — nothing to measure')
  } else {
    console.log('')
    check(
      s.oldScreen.animationName === 'screen-leaves',
      'the screen you are LEAVING dissolves',
      `${s.oldScreen.animationName} ${s.oldScreen.animationDuration}`,
    )
    // 🔴 The one that matters.
    check(
      s.newScreen.animationName === 'none',
      '🔴 the screen you are ARRIVING at has no animation — full strength, first frame',
      `animation-name: ${s.newScreen.animationName}`,
    )
    check(s.groupChrome.animationName === 'none', 'the chrome is held still', `group animation: ${s.groupChrome.animationName}`)
    check(s.oldChrome.display === 'none', 'and it does not ghost against itself', `old chrome display: ${s.oldChrome.display}`)
    check(s.overlayPointerEvents === 'none', 'a click during the transition is not swallowed', `pointer-events: ${s.overlayPointerEvents}`)
  }

  console.log('\n   prefers-reduced-motion: reduce\n')
  const reduced = await run(true)
  const r = reduced.vt.samples[0]
  if (!r) {
    check(reduced.vt.called > 0, 'the navigation still happens', 'no sample taken')
  } else {
    check(r.oldScreen.animationDuration === '0s', '🔴 nothing moves at all', `old screen: ${r.oldScreen.animationDuration}`)
    check(r.newScreen.animationDuration === '0s', 'including the arrival', `new screen: ${r.newScreen.animationDuration}`)
  }

  console.log(`\n  ${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
