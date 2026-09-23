/*
 * THE CLIENT SWITCHER, RENDERED OUTSIDE NEXT, open, in its three states
 * (22 Sep 2026). Sample names, all fictional.
 *
 *   node --experimental-websocket --require ./tests/lib/render-outside-next.cjs --import tsx \
 *        tests/render-switcher-preview.tsx <outdir>
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { ClientSwitcher } from '../src/components/ClientSwitcher'
import { switchTargets } from '../src/lib/frame'

const OUT = process.argv[2] ?? '/tmp/switcher-preview'
mkdirSync(OUT, { recursive: true })
const SRC = new URL('../src/', import.meta.url).pathname
const css = ['app/tokens.css', 'app/motion.css', 'components/ClientSwitcher.module.css'].map((f) => readFileSync(join(SRC, f), 'utf8')).join('\n')
const CLIENTS = [
  { id: 'a', name: 'Marbella Sur' },
  { id: 'b', name: 'Casa Atlântica' },
  { id: 'c', name: 'Quinta do Vale' },
]

// The menu opens on a click, which a static render cannot do: the preview asks
// for it open (defaultOpen) so the screenshot shows the same markup the browser
// would, rather than a second copy of it written here.
const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600&family=Instrument+Sans:wght@400;500;600&display=swap">
<style>${css}
:root{--font-bricolage:'Bricolage Grotesque';--font-instrument:'Instrument Sans'}
body{margin:0;background:var(--black);color:var(--text);font:15px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:340px;margin:0;padding:28px}
.banner-x{margin:0 0 18px;font-size:12px;color:var(--text-3)}
</style></head><body><div class="wrap"><p class="banner-x"><b>SAMPLE</b> · ${title}</p>${body}</div></body></html>`

const S = (name: string, title: string, el: React.ReactElement) => {
  writeFileSync(join(OUT, `${name}.html`), page(title, renderToStaticMarkup(el)))
  console.log(name)
}

S('inside', 'inside a client: the same screen, the other agency',
  <ClientSwitcher defaultOpen current="Marbella Sur" openLabel="Open a client"
    targets={switchTargets(CLIENTS, { currentClientId: 'a', currentSlug: 'report' })} />)
S('form', 'on a screen that holds a form: the landing, and why',
  <ClientSwitcher defaultOpen current="Marbella Sur" openLabel="Open a client"
    targets={switchTargets(CLIENTS, { currentClientId: 'a', currentSlug: 'escalations' })} />)
S('operator', 'at the operator level: open a client',
  <ClientSwitcher defaultOpen current={null} openLabel="Open a client" targets={switchTargets(CLIENTS, {})} />)
S('alone', 'one agency and no other',
  <ClientSwitcher defaultOpen current="Marbella Sur" openLabel="Open a client"
    targets={switchTargets([CLIENTS[0]], { currentClientId: 'a', currentSlug: 'report' })} />)
