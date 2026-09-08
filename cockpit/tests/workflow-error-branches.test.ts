/**
 * Every Code node in the Concierge states what it does when it throws.
 *
 * On 2026-09-08, 0 of 32 Code nodes had an error branch while 33 of 35 HTTP
 * nodes did. Because `LogRun` is a leaf reached at the end of every branch, a
 * throw wrote no `automation_runs` row at all — so the 30-minute failed-run
 * health check, the catch-all for everything the D5 drills did not anticipate,
 * could not see any of them. Lead unanswered, operator unalerted, every
 * dashboard green.
 *
 * The drills prove the design works. THIS proves it stayed done, and it is the
 * half that would have caught that state on the day it arose. It is also what
 * stops the 34th Code node shipping without a branch.
 *
 * See docs/code-node-failure-handling-spec.md.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Overridable so the suite can be pointed at a deliberately sabotaged copy and
// shown to go red, without touching the shipping workflow.
const WF =
  process.env.CONCIERGE_WORKFLOW ?? join(__dirname, '..', '..', 'workflows', 'ryvoInboundConc01.json')

type Conn = { node: string; type: string; index: number }
type Node = { name: string; type: string; onError?: string }
type Workflow = { nodes: Node[]; connections: Record<string, { main?: Conn[][] }> }

const wf: Workflow = JSON.parse(readFileSync(WF, 'utf8'))
const HANDLER = 'CatchInternal'

/**
 * The two exceptions are NAMED, with their reasons, and never matched by a
 * pattern. A rule with a regex-shaped hole in it stops being a rule the first
 * time someone names a node conveniently.
 */
const EXEMPT: Record<string, string> = {
  ThrowDbOutage:
    'throws deliberately, so a database outage is recorded as an error execution ' +
    'instead of a quiet success. Catching it would undo the D5 fix.',
  [HANDLER]:
    'is the handler itself; nothing catches the catcher. Its whole body is one ' +
    'try/catch whose recovery block only builds a literal.',
}

const codeNodes = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code')

test('the Concierge still has Code nodes to check (the suite is not vacuous)', () => {
  assert.ok(codeNodes.length > 25, `only ${codeNodes.length} Code nodes found — has the file moved?`)
  assert.ok(wf.nodes.some((n) => n.name === HANDLER), `${HANDLER} is missing`)
})

test('every Code node has an error branch, or is a named exception', () => {
  const missing = codeNodes
    .filter((n) => !(n.name in EXEMPT))
    .filter((n) => n.onError !== 'continueErrorOutput')
    .map((n) => n.name)

  assert.deepEqual(
    missing,
    [],
    `these Code nodes end the execution when they throw, which means a lead ` +
      `hears nothing and no run row is written: ${missing.join(', ')}. ` +
      `Set onError: 'continueErrorOutput' and wire output 1 to ${HANDLER}, ` +
      `or add the node to EXEMPT with the reason.`,
  )
})

test("an exempt node must be real, and must not have quietly acquired a branch", () => {
  for (const [name, why] of Object.entries(EXEMPT)) {
    const n = codeNodes.find((x) => x.name === name)
    assert.ok(n, `EXEMPT names ${name}, which is not a Code node in the workflow`)
    assert.ok(why.length > 40, `${name}'s exemption needs a real reason, not a label`)
    assert.notEqual(
      n!.onError,
      'continueErrorOutput',
      `${name} is listed as exempt but now HAS an error branch — remove it from EXEMPT`,
    )
  }
})

test('every error branch actually lands on the handler', () => {
  // onError alone is not the guarantee. A node can declare an error output and
  // leave it dangling, which looks handled on the canvas and drops the item.
  const wrong: string[] = []
  for (const n of codeNodes) {
    if (n.name in EXEMPT) continue
    const main = wf.connections[n.name]?.main ?? []
    const errorOut = main[1]
    if (!errorOut?.length) {
      wrong.push(`${n.name}: error output is not connected to anything`)
      continue
    }
    if (!errorOut.some((c) => c.node === HANDLER)) {
      wrong.push(`${n.name}: error output goes to ${errorOut.map((c) => c.node).join('/')}, not ${HANDLER}`)
    }
  }
  assert.deepEqual(wrong, [], wrong.join('\n'))
})

test('the handler reaches the thing that writes the run row', () => {
  // The point of the whole gate: a failed execution leaves a record the health
  // check can find. If this path is broken the branches are decoration.
  const seen = new Set<string>()
  const walk = (from: string) => {
    for (const out of wf.connections[from]?.main ?? []) {
      for (const c of out ?? []) {
        if (!seen.has(c.node)) {
          seen.add(c.node)
          walk(c.node)
        }
      }
    }
  }
  walk(HANDLER)
  assert.ok(seen.has('LogInternalFailure'), `${HANDLER} cannot reach LogInternalFailure`)
  assert.ok(seen.has('EmailInternalFailure'), `${HANDLER} cannot reach EmailInternalFailure`)
  assert.ok(seen.has('SendInternalHandoff'), `${HANDLER} cannot reach SendInternalHandoff`)
})

test('the failure spine cannot itself fail silently', () => {
  // Every HTTP node on the failure path must survive its own errors, or the
  // handler becomes a second place a lead can be lost.
  const spine = [
    'LogInternalFailure',
    'SendInternalHandoff',
    'StoreInternalHandoff',
    'MarkInternalEscalated',
    'EmailInternalFailure',
  ]
  for (const name of spine) {
    const n = wf.nodes.find((x) => x.name === name)
    assert.ok(n, `${name} is missing from the workflow`)
    assert.equal(n!.onError, 'continueRegularOutput', `${name} has no error handling of its own`)
  }
})

test('every Code node is assigned a zone by the handler', () => {
  // A node the handler does not know about still gets caught, but it is
  // classified by a default rather than by a decision. Zones are the whole
  // organising principle, so an unlisted node is an unanswered question.
  const handler = wf.nodes.find((n) => n.name === HANDLER) as unknown as {
    parameters: { jsCode: string }
  }
  const src = handler.parameters.jsCode
  const zoneBlock = src.slice(src.indexOf('const ZONES = {'), src.indexOf('};', src.indexOf('const ZONES = {')))
  assert.ok(zoneBlock.length > 100, 'could not find the ZONES table in the handler')

  const unlisted = codeNodes
    .filter((n) => !(n.name in EXEMPT))
    .filter((n) => !new RegExp(`\\b${n.name}\\s*:\\s*[1-4]\\b`).test(zoneBlock))
    .map((n) => n.name)

  assert.deepEqual(
    unlisted,
    [],
    `not in the handler's ZONES table, so they would fall to the default: ${unlisted.join(', ')}`,
  )
})
