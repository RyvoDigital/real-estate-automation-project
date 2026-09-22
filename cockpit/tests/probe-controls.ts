/*
 * DOES A SELECTED CONTROL LOOK SELECTED? — closing lesson 15b.
 *
 *   npm start                                  # then, in another shell:
 *   npx tsx --conditions=react-server tests/probe-controls.ts
 *
 * 15b recorded a gap and refused to pretend it was covered: four origin radios
 * rendered as filled dark circles with NONE selected, on the screen whose
 * no-pre-selection rule exists precisely so nobody glances and thinks a choice
 * has been made. No token-level check can see that — the contrast probe
 * compares colours that those elements do not have, because the user agent
 * paints them. The stated fix was a real render and a pixel comparison, and the
 * stated trigger was "the second screen where a control's appearance carries a
 * decision".
 *
 * That has now fired twice: the calibration screen's select, where the empty
 * option is the honest unanswered state, and the segmentation screen's radios.
 * Both are used in the same meeting with an agency watching.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * HOW IT COMPARES PIXELS WITHOUT A PNG DECODER
 * ───────────────────────────────────────────────────────────────────────────
 * `Page.captureScreenshot` with a `clip` returns base64 PNG. Identical pixels
 * encode to identical bytes, so byte equality over the SAME region is an exact
 * "did this change" — no decoder, no dependency, no threshold to tune.
 *
 * Deliberately NOT comparing two different controls to each other: two radios
 * at different y positions can differ by a subpixel and be byte-different while
 * looking identical, which would make the check flaky in the direction that
 * gets a probe deleted.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE TWO ASSERTIONS, AND WHY THE SECOND IS THE ONE THAT CATCHES 15b
 * ───────────────────────────────────────────────────────────────────────────
 * 1. Selecting changes the group's appearance.        (nothing ever looks selected)
 * 2. Selecting a DIFFERENT one changes it again.      (everything always looks selected)
 *
 * The original defect passes (1) in principle — a filled circle is a change if
 * the browser draws any focus ring — and fails (2) outright: if all four are
 * painted the same regardless of state, moving the selection changes nothing.
 * The check that only asked "did anything change" would have missed it.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { launch, sessionCookies, type Chrome } from './lib/chrome'

for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2]
}

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

let pass = 0
let fail = 0
const ok = (what: string, note = '') => { pass += 1; console.log(`   PASS  ${what}${note ? `  — ${note}` : ''}`) }
const bad = (what: string, note = '') => { fail += 1; console.log(`   FAIL  ${what}${note ? `  — ${note}` : ''}`) }

async function shotOf(c: Chrome, selector: string): Promise<string> {
  const { result } = await c.send('Runtime.evaluate', {
    expression: `(() => {
      const e = document.querySelector(${JSON.stringify(selector)})
      if (!e) return null
      const r = e.getBoundingClientRect()
      // Rounded outward and padded, so the clip is stable between calls and
      // includes any ring the user agent draws outside the box.
      return { x: Math.floor(r.x) - 4, y: Math.floor(r.y) - 4,
               width: Math.ceil(r.width) + 8, height: Math.ceil(r.height) + 8 }
    })()`,
    returnByValue: true,
  })
  const clip = result.value as { x: number; y: number; width: number; height: number } | null
  if (!clip) throw new Error(`no element for ${selector}`)
  const { data } = await c.send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...clip, scale: 1 },
    captureBeyondViewport: false,
  })
  return data as string
}

async function click(c: Chrome, selector: string) {
  await c.send('Runtime.evaluate', {
    expression: `document.querySelector(${JSON.stringify(selector)}).click()`,
  })
  await new Promise((r) => setTimeout(r, 120))
}

async function setSelect(c: Chrome, selector: string, value: string) {
  await c.send('Runtime.evaluate', {
    expression: `(() => {
      const e = document.querySelector(${JSON.stringify(selector)})
      e.value = ${JSON.stringify(value)}
      e.dispatchEvent(new Event('change', { bubbles: true }))
    })()`,
  })
  await new Promise((r) => setTimeout(r, 120))
}

async function goto(c: Chrome, path: string) {
  await c.send('Page.navigate', { url: `${BASE}${path}` })
  await new Promise((r) => setTimeout(r, 900))
}

async function main() {
  const email = (process.env.COCKPIT_ALLOWED_EMAILS ?? '').split(',')[0].trim()
  const cookies = await sessionCookies(email)
  if (cookies.length === 0) throw new Error(`no session cookie — is the app running at ${BASE}?`)

  const { data: clients } = await db.from('clients').select('id').limit(1)
  const clientId = clients?.[0]?.id as string
  if (!clientId) throw new Error('no client to render a screen for')

  const c = await launch()
  const host = new URL(BASE).hostname
  await c.send('Page.enable')
  await c.send('Runtime.enable')
  await c.send('Network.enable')
  for (const { name, value } of cookies) {
    await c.send('Network.setCookie', { name, value, domain: host, path: '/' })
  }
  await c.send('Emulation.setDeviceMetricsOverride', {
    width: 430, height: 1400, deviceScaleFactor: 1, mobile: true,
  })

  console.log('\n  Does a selected control LOOK selected? (lesson 15b)\n')

  // ---- the calibration screen's select -----------------------------------
  try {
    await goto(c, `/calibrate/${clientId}`)
    const sel = 'select[name="showsOneFewerBedroom"]'

    const unanswered = await shotOf(c, sel)
    await setSelect(c, sel, 'yes')
    const yes = await shotOf(c, sel)
    await setSelect(c, sel, 'no')
    const no = await shotOf(c, sel)

    if (yes !== unanswered) ok('the calibration answer looks different from no answer')
    else bad('the calibration answer looks IDENTICAL to no answer',
      'the empty option is the honest unanswered state and it is invisible')

    if (no !== yes) ok('and a different answer looks different again')
    else bad('"Sim" and "Não" render identically', 'the control shows no answer at all')
  } catch (e) {
    bad('the calibration select could not be measured', (e as Error).message)
  }

  // ---- the segmentation screen's radios ----------------------------------
  try {
    // Since checkpoint 2 (22 Sep 2026) the radios appear once a group is opened
    // (`?grupo=`), in a fieldset held by the form's own state, not a GET form.
    await goto(c, `/segmentation/${clientId}`)
    const { result: href } = await c.send('Runtime.evaluate', {
      expression: 'document.querySelector(\'a[href*="grupo="]\')?.getAttribute("href") ?? null',
      returnByValue: true,
    })
    if (href.value) await goto(c, href.value as string)
    const group = 'fieldset:has(input[name="origem"])'
    const first = 'input[name="origem"]'
    const second = 'input[name="origem"] ~ *, input[name="origem"]'

    const { result: count } = await c.send('Runtime.evaluate', {
      expression: 'document.querySelectorAll(\'input[name="origem"]\').length',
      returnByValue: true,
    })
    const n = count.value as number
    if (n < 2) {
      console.log(`   note: ${n} origin radio(s) rendered — this screen needs a group with contacts on it`)
    } else {
      const none = await shotOf(c, group)
      await c.send('Runtime.evaluate', {
        expression: 'document.querySelectorAll(\'input[name="origem"]\')[0].click()',
      })
      await new Promise((r) => setTimeout(r, 120))
      const firstPicked = await shotOf(c, group)
      await c.send('Runtime.evaluate', {
        expression: 'document.querySelectorAll(\'input[name="origem"]\')[1].click()',
      })
      await new Promise((r) => setTimeout(r, 120))
      const secondPicked = await shotOf(c, group)

      if (firstPicked !== none) ok('a chosen origin looks different from none chosen')
      else bad('choosing an origin changes NOTHING on screen',
        'this is 15b exactly: a control that looks selected when it is not')

      // THE ONE THAT CATCHES THE ORIGINAL DEFECT. Four radios all painted as
      // filled circles regardless of state look the same whichever is chosen.
      if (secondPicked !== firstPicked) ok('and moving the choice moves what is visibly selected')
      else bad('the SAME picture whichever radio is chosen',
        'every option looks selected, which is the 15 September defect')

      void first; void second
    }
  } catch (e) {
    bad('the segmentation radios could not be measured', (e as Error).message)
  }

  // ---- the control, and it is a real one ---------------------------------
  // A probe that reported PASS because two screenshots of ANYTHING differ would
  // be worthless. Same region, no interaction: the bytes must be identical, or
  // this whole file is measuring rendering noise rather than selection.
  try {
    await goto(c, `/calibrate/${clientId}`)
    const a = await shotOf(c, 'select[name="showsOneFewerBedroom"]')
    const b = await shotOf(c, 'select[name="showsOneFewerBedroom"]')
    if (a === b) ok('two screenshots of an unchanged control are byte-identical',
      'so a difference above means a real visual change')
    else bad('the same unchanged control screenshots differently',
      'every comparison in this file is noise')
  } catch (e) {
    bad('the control check could not run', (e as Error).message)
  }

  c.kill()
  console.log(`\n  ${pass} passed, ${fail} failed.\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('PROBE THREW:', e.message); process.exit(2) })
