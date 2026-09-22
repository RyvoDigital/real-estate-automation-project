/*
 * /SEGMENTATION, RENDERED OUTSIDE NEXT, for a screenshot without a session
 * (the same reasons as tests/render-month-preview.tsx: no preview route, no
 * auth exemption, and never an operator session minted to look).
 *
 *   node --experimental-websocket --require ./tests/lib/render-outside-next.cjs --import tsx \
 *        tests/render-segmentation-preview.tsx <outdir>
 *
 * It renders the SAME components the page does (SegmentationView, and the
 * flow's own Step1 and Step2), from sample data. Step 2 is reached in the
 * product only by a click; here the flow's Step1 markup is swapped for its
 * Step2 markup, so there is no "start at step 2" switch in the product.
 *
 * Scenarios, all SAMPLE (every name fictional by the design's rule; no real
 * contact is rendered, because the rows are people):
 *   list      the groups, nothing open, with the history
 *   step1     one group open: the origin question, nothing chosen
 *   step2     the same group after answering B: the evidence field, "sure?" unanswered
 *   step2a    answering A for a group whose file claimed nothing: nothing more asked
 *   saved     back on the list after a save, and after a resubmission ("already recorded")
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { SegmentationView } from '../src/components/segmentation/SegmentationView'
import { Step1, Step2 } from '../src/components/segmentation/DeclareFlow'
import { proposeGroups, describeContact, type ContactRow } from '../src/lib/segmentation/groups'
import { presentStep2 } from '../src/lib/segmentation/present'
import { UI, jurisdictionSentence } from '../src/lib/segmentation/copy'
import type { ScreenData } from '../src/lib/segmentation/read'

const OUT = process.argv[2] ?? '/tmp/segmentation-preview'
mkdirSync(OUT, { recursive: true })
const SRC = new URL('../src/', import.meta.url).pathname
const css = ['app/tokens.css', 'components/segmentation/segmentation.module.css'].map((f) => readFileSync(join(SRC, f), 'utf8')).join('\n')

function page(title: string, body: string): string {
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&display=swap">
<style>${css}
:root{--font-bricolage:'Bricolage Grotesque';--font-instrument:'Instrument Sans'}
body{margin:0;-webkit-font-smoothing:antialiased}
.banner-x{position:absolute;right:12px;top:12px;margin:0;z-index:9;padding:6px 10px;border-radius:8px;background:#111;color:#eee;font:12px/1.4 system-ui}
</style></head><body>
<p class="banner-x"><b>SAMPLE</b> · rendered outside Next · ${title}</p>
${body}</body></html>`
}

const c = (over: Partial<ContactRow>): ContactRow => ({
  id: 'x', phone: '+351912000000', fullName: null, lastContactAt: null, area: null,
  batchId: null, batchFilename: null, batchCommittedAt: null, state: 'undetermined', claimRaw: null, hasClaim: false, ...over,
})
const batch = { batchId: 'b1', batchFilename: 'contactos-antigos.xlsx', batchCommittedAt: '2026-03-14T10:00:00Z' }
const contacts: ContactRow[] = [
  c({ id: 'l1', phone: '+351912480113', fullName: 'Inês Carvalhal', ...batch, claimRaw: 'sim', hasClaim: true }),
  c({ id: 'l2', phone: '+351936202871', fullName: 'Tomás Reigada', ...batch, claimRaw: 'sim', hasClaim: true }),
  c({ id: 'l3', phone: '+351918553407', fullName: 'Beatriz Lobato', ...batch }),
  c({ id: 'l4', phone: '+34611428093', fullName: 'Álvaro Medina', lastContactAt: '2021-06-02T00:00:00Z', area: 'Marbella' }),
  c({ id: 'l5', phone: '+34622190554', fullName: 'Lucía Ortega', lastContactAt: '2021-09-18T00:00:00Z', area: 'Marbella' }),
  c({ id: 'l6', phone: '+351965331902', fullName: null, state: 'objected' }),
]
const screen: ScreenData = {
  contacts,
  jurisdictions: [
    { country: 'PT', existingCustomer: 'available', analysed: true, confirmed: false, platformBlocked: false },
    { country: 'ES', existingCustomer: 'unknown', analysed: false, confirmed: false, platformBlocked: false },
  ] as ScreenData['jurisdictions'],
  history: [
    { phone: '+351917004455', segment: 'A', declaredBy: 'Marta Soares', recordedAt: '2026-09-10T15:02:00Z', wording: null, group: '3 contactos · compradores 2024', uncertain: false },
    { phone: '+351917004466', segment: 'C', declaredBy: 'Marta Soares', recordedAt: '2026-09-10T15:04:00Z', wording: null, group: null, uncertain: true },
  ],
}
const CLIENT = 'c-sample'
const groups = proposeGroups(contacts)
const jurisdiction = jurisdictionSentence(screen.jurisdictions)

function write(name: string, title: string, html: string) {
  writeFileSync(join(OUT, `${name}.html`), page(title, html))
  console.log(`${name}: ${html.length} chars`)
}

write('list', 'the groups, nothing open', renderToStaticMarkup(<SegmentationView clientId={CLIENT} screen={screen} />))

for (const [name, title, gIndex, segment] of [
  ['step2', 'answered B: the evidence is asked; "sure?" is unanswered', 0, 'B'],
  ['step2a', 'answered A for a group whose file claimed nothing', 1, 'A'],
] as const) {
  const g = groups[gIndex]
  const open = renderToStaticMarkup(<SegmentationView clientId={CLIENT} screen={screen} grupo={g.id} />)
  if (name === 'step2') write('step1', 'one group open: the origin question, nothing chosen', open)
  const members = g.contactIds.map((id) => contacts.find((x) => x.id === id)!)
  const views = {
    A: presentStep2({ contacts: members, segment: 'A', jurisdiction }), B: presentStep2({ contacts: members, segment: 'B', jurisdiction }),
    C: presentStep2({ contacts: members, segment: 'C', jurisdiction }), D: presentStep2({ contacts: members, segment: 'D', jurisdiction }),
  }
  const step1 = renderToStaticMarkup(<Step1 chosen={null} prompt={false} views={views} onChoose={() => {}} onContinue={() => {}} />)
  const step2 = renderToStaticMarkup(
    <Step2 clientId={CLIENT} group={{ id: g.id, label: g.label }} declarationId="00000000-0000-4000-8000-000000000000"
      segment={segment} view={views[segment]} onChange={() => {}}
      contacts={members.map((m) => { const d = describeContact(m); return { id: m.id, name: d.name, phone: d.phone, state: d.state, fromFile: m.claimRaw ? UI.fromFile(m.claimRaw) : null } })} />,
  )
  if (!open.includes(step1)) throw new Error(`${name}: the flow's Step1 markup was not found in the page, so the swap would show nothing`)
  write(name, title, open.replace(step1, step2))
}

write('saved', 'after a save, then after the same form again', renderToStaticMarkup(<SegmentationView clientId={CLIENT} screen={screen} guardado="3" />))
write('already', 'the same form sent twice: already recorded', renderToStaticMarkup(<SegmentationView clientId={CLIENT} screen={screen} jaGuardado="1" />))
