import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { REVIEW, FORBIDDEN_ON_SCREEN } from '../src/lib/matching/screen-copy'
import { LIMITS } from '../src/lib/review/reconcile-asks'
import type { CloseRow } from '../src/lib/review/disposition'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const SCREEN = 'src/app/review/[clientId]/page.tsx'

// --- 🔴 the control that must not exist -------------------------------------

test('🔴 THERE IS NO WAY TO SKIP ONE SALE, ANYWHERE ON THE PAGE', () => {
  /*
   * §8.B: pedir a todos é permitido; escolher a quem pedir não é. A per-sale
   * skip is review gating with extra steps, and a button for it would be the
   * offence with an audit trail showing who committed it.
   *
   * This is the one place in the system where the tempting act is the KIND
   * one — sparing the client who had a difficult sale is what a decent person
   * would do by hand — so the control is absent rather than justified.
   */
  const src = read(SCREEN)
  assert.doesNotMatch(src, /<button|<form|onClick|action=\{|useState/i,
    'this page has acquired a control, and the only controls it could grow are the wrong ones')
  // And no server action can be reached from it.
  assert.doesNotMatch(src, /from '[^']*actions?'/, 'no action module is imported')
})

test('🔴 a close carries no flag anybody could set to skip it', () => {
  /*
   * The same defence one layer down, and the one that would actually be
   * reached for: not a button but a column. `closes.skip`, or an
   * `excluded_reason`, or a nullable `ask_after` somebody sets to infinity.
   *
   * The key set is asserted whole, so ANY field added to a close fails here and
   * the person adding it has to say what it is for — the same technique as the
   * reason vocabulary's size assertion, which caught its own author.
   */
  const shape: CloseRow = {
    closeId: '', clientId: '', listingReference: null, partyLeadId: null,
    partyDeclaredAt: null, reportedAt: '', agentAskedWhoAt: null, closedOn: '',
  }
  assert.deepEqual(Object.keys(shape).sort(), [
    'agentAskedWhoAt', 'clientId', 'closeId', 'closedOn',
    'listingReference', 'partyDeclaredAt', 'partyLeadId', 'reportedAt',
  ], 'a new field on a close needs its own argument, written here')

  // And the migration grew no such column either.
  const sql = read('../db/migrations/0033_closes.sql')
  const columns = sql.slice(sql.indexOf('create table'), sql.indexOf('constraint close_party_is_whole'))
  assert.doesNotMatch(columns, /\b\w*(skip|exclud|opt_out)\w*\b/i)
})

// --- 🔴 the gap is on the screen --------------------------------------------

test('🔴 the three counts are rendered together, not one of them', () => {
  // Somebody noticing later that the ask list is shorter than the sales list
  // is the failure. They should notice HERE, next to the explanation.
  const src = read(SCREEN)
  for (const label of ['closesLabel', 'askedLabel', 'pendingLabel']) {
    assert.match(src, new RegExp(`REVIEW\\.${label}`), label)
  }
  assert.match(src, /REVIEW\.gapWhy/)
  assert.match(src, /REVIEW\.gapDoNotClose/)
})

test('the copy says the difference is correct and must not be closed', () => {
  assert.match(REVIEW.gapWhy, /nada tem que ver com a opinião da pessoa/)
  assert.match(REVIEW.gapWhy, /antes de alguém poder saber/)
  assert.match(REVIEW.gapDoNotClose, /não é um erro e não deve ser fechada/)
  assert.match(REVIEW.gapDoNotClose, /escolher a quem pedir não é/)
  assert.match(REVIEW.gapDoNotClose, /nenhum botão para saltar uma venda/)
})

// --- 🔴 the limits ----------------------------------------------------------

test('🔴 the limits are rendered, and they say what a clean page does NOT mean', () => {
  assert.match(read(SCREEN), /REVIEW\.limits\.map/)
  const closing = REVIEW.limits.find((l) => /comunicado/.test(l) && /não mostra/i.test(l))
  assert.ok(closing, 'the sentence that stops a clean page being read as a guarantee is missing')
  assert.match(String(closing), /nem pode/, 'and that it is not a gap we could close by trying harder')
})

test('🔴 the Portuguese limits and the internal ones cannot drift apart', () => {
  // Two lists of the same facts in two languages is lesson 13e waiting to
  // happen: one gains an entry, the other does not, and the screen quietly
  // under-reports what it cannot see.
  assert.equal(REVIEW.limits.length, LIMITS.length,
    'a limit was added to one list and not the other — the screen is the one that matters')
})

// --- the house rules --------------------------------------------------------

test('no internal vocabulary reaches this screen', () => {
  const strings: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') strings.push(v)
    else if (typeof v === 'function') strings.push(String((v as (...a: unknown[]) => string)(2, 'x')))
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(REVIEW)
  const offences = strings.flatMap((s) =>
    FORBIDDEN_ON_SCREEN.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(s)).map((t) => `"${t}" in ${s}`))
  assert.deepEqual(offences, [])
  assert.ok(strings.length > 15, 'too little copy for the guard to mean anything')
})

test('🔴 the guard can see the words it forbids, in this screen’s own vocabulary', () => {
  // A vocabulary guard that has never been shown to match anything is
  // indistinguishable from one that matches everything it should.
  for (const leak of [
    'Há 3 closes sem disposition',
    'Motivo: party_not_named',
    'Estado unaccounted',
  ]) {
    assert.ok(
      FORBIDDEN_ON_SCREEN.some((t) => new RegExp(`\\b${t}\\b`, 'i').test(leak)),
      `the guard cannot see: ${leak}`,
    )
  }
})

test('a count of one reads as one', () => {
  assert.doesNotMatch(REVIEW.findingOne, /vendas/)
  assert.match(REVIEW.findingOne, /1 venda\b/)
  assert.match(REVIEW.findingMany(4), /4 vendas/)
})

test('the screen states the states that are not findings', () => {
  // An agency with no link, or with 05 switched off, is not a problem — and a
  // page that showed zeroes without saying why would read as one.
  assert.match(REVIEW.noLink, /não há para onde enviar/)
  assert.match(REVIEW.switchedOff, /desligados/)
  assert.match(REVIEW.nothingYet, /Ainda não há vendas comunicadas/)
  assert.match(REVIEW.notChecked, /não quer dizer que esteja tudo bem/)
})

test('🔴 the screen cannot send, and its reader cannot either', () => {
  for (const f of [SCREEN, 'src/lib/review/screen-read.ts']) {
    const src = read(f)
    for (const forbidden of ['dispatch', 'twilio', 'adapter', 'permit', 'runner']) {
      assert.doesNotMatch(src, new RegExp(`from '[^']*${forbidden}`, 'i'), `${f}: ${forbidden}`)
    }
  }
})

test('🔴 the reader has ONE path, so `asks` has one meaning', () => {
  /*
   * The first version skipped the sends query when there were no closes, which
   * gave `asks` a second meaning — undefined, "we did not look" — and would
   * have told an agency with no closes yet that the page could not be trusted.
   *
   * ⚠️ FOUND BY AN EMPTY SABOTAGE PREDICTION. Swapping the two branches broke
   * no test, because no test could tell them apart: the branch itself was the
   * defect. Lesson 1m — the test that makes an empty row non-empty is usually
   * the test the feature most needed — and the fix was to delete the branch
   * rather than to test both sides of it.
   */
  const src = read('src/lib/review/screen-read.ts')
  assert.match(src, /const asks: AskRow\[\] =/, 'not optional, because it is always read')
  assert.doesNotMatch(src, /AskRow\[\] \| undefined/, 'no second meaning in this file')
  assert.doesNotMatch(src, /if \(closes\.length\)/, 'the read is not conditional on the closes')
  // And the sends read is not nested inside anything.
  const sendsRead = src.slice(src.indexOf("from('sends')"))
  assert.doesNotMatch(sendsRead.slice(0, 200), /\belse\b/)
})

test('a caller that genuinely did not read the sends still says so', () => {
  // The distinction did not disappear — it moved to where it is real. The pure
  // function keeps it, and `reconcile-asks.test.ts` proves both sides.
  const src = read('src/lib/review/reconcile-asks.ts')
  assert.match(src, /asks: AskRow\[\] \| undefined/)
})
