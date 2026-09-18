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
const { UI, CLAIM_QUESTION, SEGMENT_CHOICE, jurisdictionSentence } = require('../src/lib/segmentation/copy') as
  typeof import('../src/lib/segmentation/copy')

const clientId = process.argv[2]
if (!clientId) throw new Error('give me a client id')

main().catch((e) => { console.error(e); process.exit(1) })

async function main() {
const data = await readScreen(clientId)
const groups = proposeGroups(data.contacts)

console.log(`\n${UI.title}\n${'='.repeat(UI.title.length)}\n`)
console.log(UI.intro)
console.log(`\n[segmento A] ${jurisdictionSentence(data.jurisdictions)}`)
console.log(`\n${UI.groupHeading}`)

if (data.contacts.length === 0) console.log(`  ${UI.noContacts}`)

for (const g of groups) {
  const contacts: ContactRow[] = g.contactIds.map((id: string) => data.contacts.find((c) => c.id === id)!)
  const withClaim = contacts.filter((c) => c.hasClaim)
  const cell = sharedClaimCell(withClaim)
  console.log(`\n  ── ${g.label}`)
  console.log(`     ${g.proposal ? `${UI.proposalPrefix} ${g.proposal.why}. ${UI.proposalHint}` : UI.noProposal}`)
  if (withClaim.length > 0) {
    console.log(`\n     ${cell
      ? `${CLAIM_QUESTION.headingWithCell.before}«${cell}»${CLAIM_QUESTION.headingWithCell.after}`
      : CLAIM_QUESTION.headingCellNotKept}`)
    console.log(`     ${CLAIM_QUESTION.body}${cell ? '' : ` ${CLAIM_QUESTION.bodyCellNotKept}`}`)
    console.log(`     ${cell
      ? `${CLAIM_QUESTION.questionWithCell.before}«${cell}»${CLAIM_QUESTION.questionWithCell.after}`
      : CLAIM_QUESTION.questionCellNotKept}`)
    for (const o of Object.values(CLAIM_QUESTION.options)) console.log(`       · ${o.label}`)
    console.log(`     ${UI.claimCount(withClaim.length, contacts.length)}`)
  }
  console.log(`\n     ${UI.segmentLegend}`)
  for (const s of ['A', 'B', 'C', 'D'] as const) console.log(`       ( ) ${SEGMENT_CHOICE[s].label}`)
  console.log(`\n     ${UI.exceptions}`)
  for (const c of contacts) {
    const d = describeContact(c)
    console.log(`       [ ] ${d.name} · ${d.phone} · ${d.state}${c.claimRaw ? ` · ${UI.fromFile(c.claimRaw)}` : ''}`)
  }
}
console.log()
}
