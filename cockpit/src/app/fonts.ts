import { Archivo, Bodoni_Moda, DM_Mono } from 'next/font/google'

/**
 * Self-hosted, not a <link> to fonts.googleapis.com.
 *
 * The 4-second black screen on launch was not render time — server responses
 * measured 362–1889ms. It was the cold start: a render-blocking stylesheet
 * against two third-party origins (googleapis, then gstatic) before the first
 * paint, while iOS showed only the manifest's background_color.
 *
 * next/font downloads these at BUILD time and serves them from our own origin
 * with the CSS inlined, so there is no third-party request on the critical
 * path and no layout shift when they arrive.
 */

/**
 * Bodoni Moda — DISPLAY ONLY, 30px and up, never in a chip.
 *
 * A Didone is the typeface of luxury property advertising in Iberia and Italy,
 * and its extreme thick/thin is the whole point: it makes a number feel
 * urgent, which is the escalation queue's entire job. That same contrast is a
 * liability on a near-black screen in daylight, where the hairlines are the
 * first thing to disappear.
 *
 * Two levers are set here rather than left to defaults, both aimed at the
 * hairlines:
 *
 *   - `opsz` is exposed as an axis so the stylesheet can ask for a LOW optical
 *     size at large type. That is backwards from the usual instinct: in a
 *     Didone, a low optical size is the sturdier cut, drawn for text, and it
 *     thickens exactly the strokes that vanish. See --f-display-vars.
 *   - the lightest weight shipped is 500, not 400.
 *
 * tests/probe-contrast.ts measures what these are worth in rendered pixels, at
 * the sizes the app actually uses, rather than at specimen size.
 */
export const display = Bodoni_Moda({
  subsets: ['latin'],
  // Variable on both axes: next/font only allows `axes` when the weight is
  // left variable, and the stylesheet wants both — `font-weight: 500` as the
  // floor and `font-variation-settings: 'opsz' 11` for the hairlines.
  weight: 'variable',
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-display',
})

export const sans = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-body',
})

export const mono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
})
