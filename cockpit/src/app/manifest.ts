import type { MetadataRoute } from 'next'

/**
 * Installed to the home screen and launched standalone, so iOS paints
 * background_color before the first frame. Leaving it unset gives a white
 * flash on every launch of a screen that is otherwise black — small, and
 * the sort of thing that decides whether a tool feels like an app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ryvo Cockpit',
    short_name: 'Cockpit',
    description: 'Leads waiting on a human, across all clients.',
    start_url: '/queue',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#08080a',
    theme_color: '#08080a',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}
