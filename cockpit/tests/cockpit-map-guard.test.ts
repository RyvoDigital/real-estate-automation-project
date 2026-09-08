import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/*
 * The guard in cockpit_map's AfterClaude node, tested against the SHIPPING
 * workflow file rather than a copy of the code.
 *
 * Lesson 15: never let a test hold its own copy of something the product also
 * holds — the two diverge and the test keeps reporting confidently from the
 * stale one. So the node is rendered out of workflows/ryvoCockpitMap01.json,
 * and this RAISES if it cannot find it rather than falling back.
 *
 * What is being tested is not that the model behaves. It is that when the
 * model misbehaves — invents a field, invents a column, returns prose — the
 * mapping the operator is shown is still one of OUR fields, for one of THEIR
 * columns. A probe measures how often the model behaves; a guard determines
 * what the system is allowed to show.
 */

function afterClaude(): (input: unknown, dollar: unknown) => { json: Record<string, unknown> }[] {
  const wf = JSON.parse(
    readFileSync(new URL('../../workflows/ryvoCockpitMap01.json', import.meta.url), 'utf8'),
  )
  const node = (wf.nodes as { name: string; parameters: { jsCode?: string } }[]).find(
    (n) => n.name === 'AfterClaude',
  )
  if (!node?.parameters?.jsCode) {
    throw new Error('AfterClaude not found in ryvoCockpitMap01.json — the guard cannot be tested')
  }
  return new Function('$input', '$', node.parameters.jsCode) as never
}

const GIVEN = [
  { column: 'Coluna1', target: 'ignore', confidence: 'low', why: 'nothing recognisable', samples: ['Maria Santos'] },
  { column: 'Valor', target: 'budget_range', confidence: 'high', why: 'amounts', samples: ['1.500.000'] },
]

function run(claudeText: string, statusCode = 200) {
  const fn = afterClaude()
  const res = { statusCode, body: { content: [{ type: 'text', text: claudeText }] } }
  return fn(
    { first: () => ({ json: res }) },
    () => ({ first: () => ({ json: { given: GIVEN } }) }),
  )[0].json
}

test('a field that does not exist is discarded and OUR guess is kept', () => {
  const out = run(JSON.stringify({
    columns: [
      { column: 'Coluna1', target: 'marital_status', confidence: 'high', why: 'invented a field' },
      { column: 'Valor', target: 'budget_range', confidence: 'high', why: 'fine' },
    ],
  })) as { columns: { column: string; target: string }[]; note: string }

  const c1 = out.columns.find((c) => c.column === 'Coluna1')!
  assert.equal(c1.target, 'ignore', 'the invented field must not reach the operator')
  assert.match(out.note, /not one of our fields/)
})

test('a column that was never uploaded is discarded', () => {
  const out = run(JSON.stringify({
    columns: [
      { column: 'Coluna1', target: 'full_name', confidence: 'high', why: 'names' },
      { column: 'A Column Nobody Sent', target: 'email', confidence: 'high', why: 'invented' },
    ],
  })) as { columns: { column: string }[]; note: string }

  assert.equal(out.columns.length, 2, 'only the two real columns')
  assert.equal(out.columns.find((c) => c.column === 'A Column Nobody Sent'), undefined)
  assert.match(out.note, /not a column in this file/)
})

test('a column the model ignores keeps its deterministic guess — none can vanish', () => {
  const json = JSON.stringify({
    columns: [{ column: 'Coluna1', target: 'full_name', confidence: 'high', why: 'names' }],
  })
  const out = run(json) as { columns: { column: string; target: string }[] }
  assert.equal(out.columns.length, 2)
  assert.equal(out.columns.find((c) => c.column === 'Valor')!.target, 'budget_range')
})

test('prose instead of JSON falls back to the deterministic proposal, and says so', () => {
  const out = run('I think column one is probably names!') as {
    by: string
    note: string
    columns: unknown[]
  }
  assert.equal(out.by, 'headers', 'not headers+model — the model was not used')
  assert.match(out.note, /not JSON/)
  assert.equal(out.columns.length, 2)
})

test('a non-2xx is caught even though neverError makes the node green — lesson #13', () => {
  const out = run('', 529) as { by: string; note: string }
  assert.equal(out.by, 'headers')
  assert.match(out.note, /returned 529/)
})

test('the order of the operator’s own columns is preserved', () => {
  const out = run(JSON.stringify({
    columns: [
      { column: 'Valor', target: 'budget_range', confidence: 'high', why: 'x' },
      { column: 'Coluna1', target: 'full_name', confidence: 'high', why: 'y' },
    ],
  })) as { columns: { column: string }[] }
  assert.deepEqual(out.columns.map((c) => c.column), ['Coluna1', 'Valor'])
})

/*
 * §2.3 + the sub-processor rule: if the operator has excluded a column, its
 * values must not leave the server. Tested on BuildPrompt — the node that
 * composes the outgoing request — because that is the last place a bug in the
 * cockpit can be stopped.
 */
function buildPrompt(): (input: unknown) => { json: Record<string, unknown> }[] {
  const wf = JSON.parse(
    readFileSync(new URL('../../workflows/ryvoCockpitMap01.json', import.meta.url), 'utf8'),
  )
  const node = (wf.nodes as { name: string; parameters: { jsCode?: string } }[]).find(
    (n) => n.name === 'BuildPrompt',
  )
  if (!node?.parameters?.jsCode) {
    throw new Error('BuildPrompt not found in ryvoCockpitMap01.json')
  }
  return new Function('$json', `const $input = null; ${node.parameters.jsCode}`) as never
}

function build(columns: unknown[]) {
  return buildPrompt()({ columns })[0].json as {
    userPrompt: string
    withheld: string[]
    loadable: boolean
  }
}

test('an operator-excluded column sends NO values', () => {
  const out = build([
    { column: 'NIF', target: 'ignore', locked: true, confidence: 'high', why: 'operator excluded it', samples: ['123456789', '987654321'] },
    { column: 'Nome', target: 'full_name', locked: true, confidence: 'high', why: 'names', samples: ['Maria Santos'] },
  ])
  assert.ok(!out.userPrompt.includes('123456789'), 'an excluded column’s values must not leave the server')
  assert.ok(!out.userPrompt.includes('987654321'))
  assert.match(out.userPrompt, /withheld — the operator has excluded this column/)
  assert.deepEqual(out.withheld, ['NIF'])
  assert.ok(out.userPrompt.includes('Maria Santos'), 'a kept column still sends samples')
})

test('an `ignore` that is only OUR guess still sends samples — this is how Coluna1 was rescued', () => {
  const out = build([
    { column: 'Coluna1', target: 'ignore', confidence: 'low', why: 'nothing recognisable', samples: ['Maria Santos', 'João Silva'] },
  ])
  assert.ok(out.userPrompt.includes('Maria Santos'), 'an unconfirmed guess must still be reconsiderable')
  assert.deepEqual(out.withheld, [])
})

test('samples stay capped at five and truncated at sixty characters', () => {
  const out = build([
    { column: 'Notas', target: 'notes', confidence: 'low', why: 'free text', samples: Array.from({ length: 12 }, (_, i) => `${i}-`.padEnd(120, 'x')) },
  ])
  const quoted = out.userPrompt.match(/"[^"]*x{10,}[^"]*"/g) ?? []
  assert.equal(quoted.length, 5, 'at most five values per column')
  for (const q of quoted) assert.ok(q.length <= 62, 'each truncated to sixty characters')
})
