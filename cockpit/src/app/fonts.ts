import { IBM_Plex_Mono, Instrument_Serif, Manrope } from 'next/font/google'

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
export const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-display',
})

export const sans = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-body',
})

export const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
  variable: '--font-mono',
})
