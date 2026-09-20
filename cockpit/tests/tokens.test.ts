import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PALETTE DOES NOT ERODE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * docs/cockpit-build-plan.md §2. The visual direction (brief §0.5) is the thing
 * most likely to be lost during the build, because a one-off hex always looks
 * harmless in a diff. Nobody decides to abandon a palette; it goes one colour
 * at a time, each with a good local reason.
 *
 * This file is the mechanical half. Four checks, in ascending order of how much
 * they actually prevent:
 *
 *   1. NO LITERAL COLOUR outside tokens.css — with a ratchet, because 18 files
 *      already have some. New files get none; old files may only lose them.
 *   2. THE BRIEF AND THE FILE AGREE, IN BOTH DIRECTIONS. One direction catches
 *      drift, the other catches orphans. Without both, the brief slowly becomes
 *      a subset of the truth and stops being the source it claims to be.
 *   3. THE SEMANTIC FIVE ARE UNREACHABLE except from the components that own a
 *      state. This is the one that survives a tired afternoon: a screen cannot
 *      reach for green because green looked right, because it has no way to
 *      name green. The grep is the backstop; this is the mechanism.
 *   4. THE DETECTOR CAN FAIL. A check that cannot fail proves nothing, so the
 *      last test feeds the detector something bad and requires it to complain.
 *
 * All four are pure functions over file text, so they are tests rather than
 * probes: no browser, no database, no network.
 */

const SRC = new URL('../src/', import.meta.url).pathname
const REPO = new URL('../../', import.meta.url).pathname
const TOKENS = join(SRC, 'app/tokens.css')
const BRIEF = join(REPO, 'docs/cockpit-design-brief.md')

// ── the detector ────────────────────────────────────────────────────────────
// Hex, rgb(), rgba(), hsl(), hsla(). Named CSS colours are deliberately NOT
// matched: "red" appears in prose, in class names and in aria labels, and a
// detector with false positives gets suppressed rather than obeyed.
const COLOUR = /#[0-9A-Fa-f]{3,8}\b|\brgba?\(|\bhsla?\(/g

export function literalColours(text: string): string[] {
  return text.match(COLOUR) ?? []
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(css|tsx|ts)$/.test(name)) out.push(full)
  }
  return out
}

/*
 * THE RATCHET.
 *
 * These files carried literal colours before tokens.css existed. The count is
 * recorded so the list can only shrink: a legacy file that GAINS a colour fails
 * this test exactly as a new one would. Each is removed from this list when its
 * screen is rebuilt — globals.css in C2 with the frame, the page components as
 * their screens land.
 *
 * Three of these are permanent and marked so: an icon, an apple icon and a
 * manifest generate images and metadata rather than CSS, so they cannot read a
 * custom property. They are the only entries that are allowed to stay.
 */
const LEGACY: Record<string, { count: number; until: string }> = {
  'app/globals.css': { count: 203, until: 'C6 — when the last screen depending on its classes is rebuilt; see build plan §2.2b' },
  'app/layout.tsx': { count: 1, until: 'C6 — the themeColor literal, which a manifest needs as a literal' },
  'app/calibrate/[clientId]/page.tsx': { count: 12, until: 'C5' },
  'app/calibrate/page.tsx': { count: 3, until: 'C5' },
  'app/listings/[id]/exemption/page.tsx': { count: 8, until: 'C5' },
  'app/listings/[id]/page.tsx': { count: 12, until: 'C5' },
  'app/listings/[id]/triage/page.tsx': { count: 15, until: 'C5' },
  'app/listings/page.tsx': { count: 9, until: 'C5' },
  'app/review/[clientId]/page.tsx': { count: 6, until: 'C6' },
  'app/review/page.tsx': { count: 3, until: 'C6' },
  'app/segmentation/[clientId]/page.tsx': { count: 7, until: 'C5' },
  'app/segmentation/page.tsx': { count: 2, until: 'C5' },
  'app/silence/[clientId]/page.tsx': { count: 6, until: 'C6' },
  'app/silence/page.tsx': { count: 3, until: 'C6' },
  'components/Queue.tsx': { count: 1, until: 'C3 — the escalations rebuild' },
  'lib/segmentation/surface.ts': { count: 13, until: 'C5 — 🔴 colour in a lib module, which is where erosion ends up' },
  // Permanent, and the reason is that they do not produce CSS:
  'app/icon.tsx': { count: 3, until: 'never — generates a PNG, cannot read a custom property' },
  'app/apple-icon.tsx': { count: 3, until: 'never — generates a PNG, cannot read a custom property' },
  'app/manifest.ts': { count: 2, until: 'never — a manifest theme colour is a literal by specification' },
}

test('no file outside tokens.css introduces a literal colour', () => {
  const offenders: string[] = []
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file)
    if (rel === 'app/tokens.css') continue
    const found = literalColours(readFileSync(file, 'utf8'))
    if (found.length === 0) continue
    if (!(rel in LEGACY)) {
      offenders.push(`${rel} — ${found.length} literal colour(s): ${[...new Set(found)].slice(0, 4).join(', ')}`)
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'A colour belongs in src/app/tokens.css and nowhere else.\n' +
      'If this is a legacy file being carried, add it to LEGACY with the stage that removes it.\n' +
      offenders.join('\n'),
  )
})

test('🔴 the ratchet only turns one way — a legacy file may lose colours, never gain them', () => {
  const grown: string[] = []
  for (const [rel, { count }] of Object.entries(LEGACY)) {
    const found = literalColours(readFileSync(join(SRC, rel), 'utf8')).length
    if (found > count) grown.push(`${rel}: was ${count}, now ${found}`)
    // A file that has lost colours is good news, and the note is how the list
    // gets shorter rather than a failure.
    if (found < count) {
      console.log(`  ↓ ${rel}: ${count} → ${found}. Lower the count, or remove the entry if it is 0.`)
    }
  }
  assert.deepEqual(grown, [], `A file already carrying the old palette gained more:\n${grown.join('\n')}`)
})

// ── the brief and the file, both directions ─────────────────────────────────

export function tokenNamesIn(css: string): string[] {
  return [...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1])
}

/** Every `--token` written in a table cell of §0.5. */
export function tokenNamesInBrief(markdown: string): string[] {
  const start = markdown.indexOf('## 0.5 Visual direction')
  assert.ok(start > -1, '§0.5 must exist in the brief — it is the source this file is checked against')
  const after = markdown.slice(start)
  const end = after.indexOf('\n## ', 3)
  const section = end > -1 ? after.slice(0, end) : after
  return [...new Set([...section.matchAll(/`(--[a-z0-9-]+)`/g)].map((m) => m[1]))]
}

test('every token named in brief §0.5 exists in tokens.css', () => {
  const inBrief = tokenNamesInBrief(readFileSync(BRIEF, 'utf8'))
  const inFile = new Set(tokenNamesIn(readFileSync(TOKENS, 'utf8')))
  const missing = inBrief.filter((t) => !inFile.has(t))
  assert.deepEqual(missing, [], `§0.5 names tokens the stylesheet does not define: ${missing.join(', ')}`)
})

test('🔴 and every token in tokens.css is named in §0.5 — the other direction, which catches orphans', () => {
  const inBrief = new Set(tokenNamesInBrief(readFileSync(BRIEF, 'utf8')))
  const inFile = tokenNamesIn(readFileSync(TOKENS, 'utf8'))
  const orphans = inFile.filter((t) => !inBrief.has(t))
  assert.deepEqual(
    orphans,
    [],
    'These exist in tokens.css and are named nowhere in §0.5: ' +
      orphans.join(', ') +
      '\nAdd them to the brief with their reason. Without this direction the brief becomes a subset ' +
      'of the truth and stops being the source it claims to be.',
  )
})

// ── the semantic five ───────────────────────────────────────────────────────

/*
 * A state is rendered by asking for the state, never by asking for the colour.
 * These five may be referenced only by the components that own a state; the
 * owners do not all exist yet, and they are listed here before they are built
 * so that the first one cannot quietly become "wherever it was convenient".
 */
const SEMANTIC = ['--through', '--held', '--clock', '--clock-dim', '--red', '--handled']
const SEMANTIC_OWNERS = [
  'app/tokens.css',
  'components/state-chip.tsx',
  'components/state-chip.module.css',
  'components/clock.tsx',
  'components/clock.module.css',
]

test('🔴 the semantic colours are reachable only from the components that own a state', () => {
  const reaching: string[] = []
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file)
    if (SEMANTIC_OWNERS.includes(rel)) continue
    const text = readFileSync(file, 'utf8')
    const used = SEMANTIC.filter((t) => new RegExp(`var\\(\\s*${t}\\b`).test(text))
    if (used.length) reaching.push(`${rel} → ${used.join(', ')}`)
  }
  assert.deepEqual(
    reaching,
    [],
    'A screen reached for a semantic colour directly:\n' +
      reaching.join('\n') +
      '\nRender the state instead. If a genuinely new owner is needed, add it to SEMANTIC_OWNERS ' +
      'and say in §0.5 what state it owns.',
  )
})

// ── the control ─────────────────────────────────────────────────────────────

test('the detector can fail — it flags colours in text that has them', () => {
  // If this ever passes trivially, every test above is decoration.
  assert.deepEqual(literalColours('color: #FF6A5C;'), ['#FF6A5C'])
  assert.deepEqual(literalColours('background: rgba(0,0,0,.5)'), ['rgba('])
  assert.deepEqual(literalColours('outline: hsl(12 90% 60%)'), ['hsl('])
  assert.equal(literalColours('.st.bad { color: var(--red) }').length, 0, 'a token reference is not a literal')
  assert.equal(literalColours('the row turns red').length, 0, 'prose is not a colour — a noisy detector gets suppressed')
  // And the brief parser must actually find something, or both directions pass
  // by finding nothing on each side.
  assert.ok(tokenNamesInBrief(readFileSync(BRIEF, 'utf8')).length > 20, '§0.5 parsed as almost no tokens — the parser is wrong, not the brief')
  assert.ok(tokenNamesIn(readFileSync(TOKENS, 'utf8')).length > 20, 'tokens.css parsed as almost no tokens')
})
