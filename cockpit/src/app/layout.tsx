import type { Metadata, Viewport } from 'next'
import { bricolage, display, geistMono, instrument, mono, sans } from './fonts'
import './tokens.css'
import './globals.css'
import './motion.css'

export const metadata: Metadata = {
  title: 'Ryvo Cockpit',
  description: 'Internal operations cockpit',
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Cockpit' },
}

export const viewport: Viewport = {
  themeColor: '#08080a',
  width: 'device-width',
  initialScale: 1,
  // Standalone on an iPhone runs under the notch and the home indicator.
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      // Both sets ship while both sets of screens exist: the §0.5 faces for
      // rebuilt screens, the originals for the ones still standing.
      className={`${display.variable} ${sans.variable} ${mono.variable} ${bricolage.variable} ${instrument.variable} ${geistMono.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
