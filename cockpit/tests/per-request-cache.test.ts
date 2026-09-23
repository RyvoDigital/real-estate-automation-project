/*
 * 🔴 THE DEDUPE IS PER REQUEST, AND IT STILL REFUSES (Stage 2, 23 Sep 2026).
 *
 * Four reads were wrapped in React's cache() because the screens ask them over
 * and over in one render — `clients` seven times on Today, `hiddenClients` six.
 *
 * Two of the four are security-adjacent, and the operator asked for this
 * explicitly: "cache() on hiddenClients and requireOperator is
 * security-adjacent, so each wrap gets a test proving it still refuses."
 *
 * ── THE DANGEROUS VERSION OF THIS CHANGE ────────────────────────────────────
 *
 * A module-level `let cached` would also remove the duplicate requests, and it
 * would be a serious defect rather than an optimisation: the module lives for
 * the lifetime of the server process, so ONE operator's identity, or one
 * screen's answer about who is hidden, would be served to the next request —
 * possibly a different person. React's cache() is scoped to a single render
 * and is emptied between requests, which is why it is the one used.
 *
 * 🔒 So the first test asserts the MECHANISM, not the behaviour: a module-level
 * memo cannot be told apart from a per-request one by counting calls inside a
 * single test, and counting is what a behavioural test would do.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const CACHED: { file: string; name: string }[] = [
  { file: '../src/lib/auth.ts', name: 'requireOperator' },
  { file: '../src/lib/hidden-clients.ts', name: 'hiddenClients' },
  { file: '../src/lib/gate-clients.ts', name: 'gateClientIds' },
  { file: '../src/lib/data.ts', name: 'getClients' },
  { file: '../src/lib/switcher-read.ts', name: 'switcherClients' },
]

test('🔴 EVERY DEDUPE IS REACT’S PER-REQUEST cache(), never a module-level memo', () => {
  for (const { file, name } of CACHED) {
    const src = code(read(file))
    assert.match(src, new RegExp(`(export )?const ${name} = cache\\(`), `${name} must be wrapped in cache() from react`)
    assert.match(src, /import \{ cache \} from 'react'/, `${file} must take cache from react`)

    /*
     * 🔴 The shape that would leak across requests. A `let` or a Map at module
     * scope holding a result is a cache for the PROCESS, not the render.
     */
    assert.doesNotMatch(
      src,
      /^(let|const)\s+\w*[Cc]ache\w*\s*(:|=)\s*(new Map|new WeakMap|\{\}|null)/m,
      `${file} holds a module-level cache — that would survive between requests and serve one operator's answer to another`,
    )
  }
})

test('🔴 requireOperator STILL REFUSES: no claims, an error, or an address off the allowlist', () => {
  /*
   * 🔒 READ RATHER THAN RUN, and the limit is worth stating plainly.
   * src/lib/auth.ts imports next/navigation's redirect(), which cannot be
   * loaded outside a request — importing it here fails with
   * "createContext is not a function". So this asserts that every refusal is
   * still on the path the caller takes, and that cache() has not been wrapped
   * around something that skips them. What it cannot do is execute them.
   *
   * The refusals themselves are exercised where they can be: probe-dod.ts
   * checks that no unauthenticated route serves lead data, against a running
   * deployment.
   */
  const src = code(read('../src/lib/auth.ts'))
  const fn = src.slice(src.indexOf('const requireOperator = cache('))
  assert.match(fn, /getClaims\(\)/, 'it must verify the signature, not read the cookie')
  assert.doesNotMatch(fn, /getSession\(\)/, 'getSession does not revalidate and is not an authorization primitive')
  assert.match(fn, /if \(error \|\| !claims \|\| !email\) redirect\('\/login'\)/)
  assert.match(fn, /if \(!isAllowed\(email\)\) redirect\('\/login\?denied=1'\)/)
})

test('🔴 hiddenClients STILL HIDES NOTHING when it cannot read, and never hides on a null', () => {
  const src = code(read('../src/lib/hidden-clients.ts'))

  // A failed read hides nobody and says so — caching must not freeze a wrong answer.
  assert.match(src, /failed: true/, 'a failed read is reported as failed')
  assert.match(src, /rows === null/, 'and it is the read failing that sets it')

  // 🔒 `rehearsal IS NULL` is not hidden: only an explicit true.
  assert.match(src, /c\.rehearsal === true/, 'only an answered "yes" hides a client')
  assert.doesNotMatch(src, /!c\.rehearsal|c\.rehearsal \?/, 'a truthiness test would hide every unanswered client')

  // The empty answer hides nobody, and is the shape a caller falls back to.
  assert.match(src, /export const NONE_HIDDEN: Hidden = \{ ids: \[\], rehearsals: 0, gate: 0, failed: false/)
})

test('🔒 the answer is keyed by what was ASKED, so one caller cannot get another’s', () => {
  /*
   * hiddenClients takes `includeRehearsals`, and the two answers are different
   * lists. React's cache() keys on arguments, so this is true by construction —
   * but only while the argument stays an argument. A version that read the flag
   * from somewhere else inside the function would return whichever answer was
   * computed first, to everybody.
   */
  const src = code(read('../src/lib/hidden-clients.ts'))
  assert.match(src, /cache\(async \(includeRehearsals = false\)/, 'the flag must be an argument, so it is part of the cache key')
  assert.match(src, /includingRehearsals: includeRehearsals/, 'and the answer says which question it answered')
})
