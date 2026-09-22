/*
 * WHAT THE LISTINGS AND MATCHES SCREENS WILL SAY, read through the real path.
 *
 *   npx tsx --conditions=react-server tests/probe-matching-screen.ts <clientId>
 *
 * It calls readListings(), readMatches() and readCalibration() — the same
 * functions the pages call — and prints every sentence those pages compose from
 * them. No rendering, so it is safe to run before showing anyone the screen.
 *
 * That is the point, and it is the segmentation screen's lesson repeated: the
 * last three defects in that feature were found by predicting the render and
 * reading the prediction, not by opening the page.
 *
 * READ ONLY. It never triggers a matching run.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2]
}

import type { ListingRow, MatchesScreen, SavedCalibration } from '../src/lib/matching/screen-read'

const read = require('../src/lib/matching/screen-read') as {
  readListings: (id: string) => Promise<ListingRow[]>
  readMatches: (id: string) => Promise<MatchesScreen>
  readCalibration: (id: string) => Promise<SavedCalibration>
}
const { LISTINGS, MATCHES, CALIBRATE, STATUS_WORD } =
  require('../src/lib/matching/screen-copy') as typeof import('../src/lib/matching/screen-copy')

const clientId = process.argv[2]
if (!clientId) throw new Error('give me a client id')

main().catch((e) => { console.error(e); process.exit(1) })

async function main() {
  const line = (s = '') => console.log(s)

  line(`\n${LISTINGS.title}\n${'='.repeat(LISTINGS.title.length)}`)
  line(LISTINGS.intro)

  const cal = await read.readCalibration(clientId)
  line()
  // A failed read is its own line, never "not answered yet".
  line(`${CALIBRATE.title}: ${cal.saved ? CALIBRATE.saved : 'failed' in cal ? `${CALIBRATE.readFailed} (${cal.failed})` : CALIBRATE.notSavedYet}`)
  if (!cal.saved && 'missing' in cal) line(`  (${cal.missing.length} unanswered)`)

  const listings = await read.readListings(clientId)
  line()
  if (listings.length === 0) { line(LISTINGS.empty); return }
  line(listings.length === 1 ? LISTINGS.countOne : LISTINGS.countMany(listings.length))
  line(LISTINGS.onlyAvailableMatches)

  for (const l of listings) {
    const head = [l.reference, l.bedrooms === null ? null : `T${l.bedrooms}`, l.area,
      l.price === null ? null : `€${l.price.toLocaleString('pt-PT')}`].filter(Boolean).join(' · ')
    line()
    line(`  ${head}`)
    line(`  ${STATUS_WORD[l.status] ?? l.status}${l.status === 'available' ? '' : ` — ${LISTINGS.notMatched}`}`)

    const m = await read.readMatches(l.id)
    if (l.status !== 'available') { line(`    ${MATCHES.notAvailable}`); continue }
    if (m.missingThresholds.length > 0) {
      line(`    ${MATCHES.notCalibrated}`)
      line(`    → ${MATCHES.notCalibratedAction}`)
      continue
    }
    if (m.matches.length === 0) { line(`    ${MATCHES.none}`); continue }
    for (const x of m.matches) {
      line(`    ${x.name ?? ''} — ${x.origin === 'agent' ? MATCHES.chosenHeading : MATCHES.computedHeading}`)
      if (x.filterWouldFind === false) line(`      ${MATCHES.aFilterWouldMiss}`)
      for (const r of x.reasons) line(`      · ${r}`)
    }
  }
  line()
}
