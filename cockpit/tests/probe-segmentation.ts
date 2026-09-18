/*
 * WHAT THE SEGMENTATION SCREEN WILL SAY, read through the real path.
 *
 *   npx tsx --conditions=react-server tests/probe-segmentation.ts <clientId>
 *
 * It calls readScreen() and proposeGroups() — the same functions the page
 * calls — and prints every sentence the page composes from them. No rendering,
 * so it is safe to run before showing anyone the screen, which is the point:
 * the last three defects in this feature were all found by predicting the
 * render and reading the prediction, not by opening the page.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2]
}

// Imports after the env is loaded, hence require rather than a static import:
// read.ts builds its client at module scope.
// Type-only imports do not execute the modules, so the env loading above still
// happens first while the probe stays type-checked like everything else.
import type { ScreenData } from '../src/lib/segmentation/read'
import type { ContactRow, Group } from '../src/lib/segmentation/groups'

const { readScreen } = require('../src/lib/segmentation/read') as
  { readScreen: (id: string) => Promise<ScreenData> }
const { proposeGroups, sharedClaimCell, describeContact } = require('../src/lib/segmentation/groups') as
  typeof import('../src/lib/segmentation/groups')
const { UI, SEGMENT_CHOICE, jurisdictionSentence } =
  require('../src/lib/segmentation/copy') as typeof import('../src/lib/segmentation/copy')
// The SAME composition the page renders. Printing it a second way is how this
// probe told me about an arrangement the screen had already stopped using.
const { presentStep2 } = require('../src/lib/segmentation/present') as
  typeof import('../src/lib/segmentation/present')

const clientId = process.argv[2]
if (!clientId) throw new Error('give me a client id')

main().catch((e) => { console.error(e); process.exit(1) })

async function main() {
const data = await readScreen(clientId)
const groups = proposeGroups(data.contacts)

const line = (s: string) => console.log(s)
line(`\n${UI.title}\n${'='.repeat(UI.title.length)}\n`)
line(UI.intro)
line(`\n${UI.groupHeading}`)
if (data.contacts.length === 0) line(`  ${UI.noContacts}`)

for (const g of groups) {
  const contacts: ContactRow[] = g.contactIds.map((id: string) => data.contacts.find((c) => c.id === id)!)
  const withClaim = contacts.filter((c) => c.hasClaim)
  const cell = sharedClaimCell(withClaim)

  line(`\n  ── ${g.label}`)
  line(`     ${g.proposal ? `${UI.proposalPrefix} ${g.proposal.why}. ${UI.proposalHint}` : UI.noProposal}`)

  line(`\n     STEP 1 ─ ${UI.segmentLegend}`)
  for (const s of ['A', 'B', 'C', 'D'] as const) {
    line(`       ( ) ${SEGMENT_CHOICE[s].label}`)
    line(`           ${s === 'A' ? jurisdictionSentence(data.jurisdictions) : SEGMENT_CHOICE[s].consequence}`)
  }
  line(`       [ ${UI.continueToDetail} ]`)

  for (const s of ['A', 'B', 'C', 'D'] as const) {
    const v = presentStep2({ contacts, segment: s, jurisdiction: jurisdictionSentence(data.jurisdictions) })
    line(`\n     STEP 2 (${s}) ─ ${v.youSaid}`)
    line(`       ${v.consequence}`)
    line(`       ${UI.changeAnswer}`)
    if (v.note) {
      line(`       ┌ ${v.note.heading}`)
      line(`       │ ${v.note.body}`)
      line(`       │ ${v.note.scope}`)
      if (v.note.extra) line(`       │ ${v.note.extra}`)
      line(`       └ ${v.note.count}`)
    }
    if (v.ask.kind === 'basis') {
      line(`       ${v.ask.question}  (obrigatório)`)
      line(`         ${v.ask.hint}`)
    } else {
      line(`       ${v.ask.text}`)
    }
    line(`       ${UI.whoIsDeclaring}: ____   [ ] ${UI.unsure}`)
    line(`       ${UI.exceptions}`)
    for (const c of contacts) {
      const d = describeContact(c)
      line(`         [ ] ${d.name} · ${d.phone} · ${d.state}${c.claimRaw ? ` · ${UI.fromFile(c.claimRaw)}` : ''}`)
    }
    line(`       [ ${UI.confirm} ]`)
  }
}
line('')
}
