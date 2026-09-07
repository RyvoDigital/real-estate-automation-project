import type { Metadata, Viewport } from 'next'
import { mono, sans, serif } from './fonts'
import './globals.css'

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
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
