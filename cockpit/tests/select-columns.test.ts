import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * EVERY COLUMN A SELECT ASKS FOR IS A COLUMN A MIGRATION CREATED.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 🔴 FOUND BY THE OPERATOR LOOKING AT A RENDERED PAGE, 20 September 2026.
 *
 * The contact record's Leads panel said *"Leads could not be read, so this page
 * is not saying there is nothing"* — correctly, in red, while three other
 * panels succeeded. The query asked for `name`. The column is `full_name`.
 * PostgREST 400s, the panel catches it, and the page is honest about a defect
 * that is entirely mine.
 *
 * WHY NOTHING CAUGHT IT EARLIER, and this is the part worth keeping:
 *
 *   `admin()` returns `SupabaseClient` with NO `Database` generic. There are no
 *   generated database types in this repo. So the column names inside
 *   `.select('…')` are checked against ABSOLUTELY NOTHING. They are a string.
 *
 * And the near-miss that made it worse: while writing that query I hit a real
 * tsc error — a concatenated select string makes every column
 * `GenericStringError`. Fixing it felt like satisfying a type checker, and I
 * wrote a comment saying the literal gave type safety. It does not. The error
 * was the parser failing to produce a row shape, not a schema check. **A type
 * error that appears near the thing you got wrong is not evidence that the
 * thing you got wrong is checked.**
 *
 * The suite had 784 passing tests over a page with a broken panel, because
 * every one of them tests logic with supplied inputs. This reads the schema out
 * of the migrations and checks the strings that ship against it.
 */

const REPO = join(import.meta.dirname, '..', '..')
const SRC = join(import.meta.dirname, '..', 'src')

/* ── the schema, as the migrations build it ───────────────────────────────── */

type Schema = Map<string, Set<string>>

function schemaFromMigrations(): { columns: Schema; views: Set<string> } {
  const dir = join(REPO, 'db', 'migrations')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  const columns: Schema = new Map()
  const views = new Set<string>()

  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf-8')
      // Comments are prose ABOUT the schema and routinely contain example DDL.
      .replace(/^\s*--.*$/gm, '')

    // create table [if not exists] public.X ( … );
    for (const m of sql.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\)\s*;/gi)) {
      const table = m[1]
      const cols = columns.get(table) ?? new Set<string>()
      for (const line of m[2].split('\n')) {
        const c = /^\s{2,}(\w+)\s+[a-z]/i.exec(line)
        // Skip table-level constraints, which also start with a word.
        if (c && !/^(constraint|primary|unique|check|foreign|exclude)$/i.test(c[1])) cols.add(c[1])
      }
      columns.set(table, cols)
    }

    for (const m of sql.matchAll(/alter table (?:only )?public\.(\w+)([\s\S]*?);/gi)) {
      const table = m[1]
      const body = m[2]
      const cols = columns.get(table) ?? new Set<string>()
      for (const a of body.matchAll(/add column (?:if not exists )?(\w+)/gi)) cols.add(a[1])
      for (const d of body.matchAll(/drop column (?:if exists )?(\w+)/gi)) cols.delete(d[1])
      for (const r of body.matchAll(/rename column (\w+) to (\w+)/gi)) {
        cols.delete(r[1])
        cols.add(r[2])
      }
      columns.set(table, cols)
    }

    for (const m of sql.matchAll(/create (?:or replace )?view public\.(\w+)/gi)) views.add(m[1])
  }
  return { columns, views }
}

/* ── the selects, as they ship ────────────────────────────────────────────── */

type Select = { file: string; line: number; table: string; columns: string[] }

function selectsInSource(): Select[] {
  const out: Select[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) {
        walk(p)
        continue
      }
      if (!/\.tsx?$/.test(p)) continue
      const text = readFileSync(p, 'utf-8')
      /*
       * `.from('t')` … `.select('a, b')` — the two may be separated by
       * whitespace, a newline and a comment, which is how they are actually
       * written in this repo.
       */
      for (const m of text.matchAll(/\.from\(\s*'(\w+)'\s*\)([\s\S]{0,400}?)\.select\(\s*'([^']*)'/g)) {
        // Only bind a select to a from when nothing else intervenes.
        if (/\.from\(/.test(m[2])) continue
        const columns = m[3]
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
        out.push({
          file: relative(REPO, p).split(sep).join('/'),
          line: text.slice(0, m.index).split('\n').length,
          table: m[1],
          columns,
        })
      }
    }
  }
  walk(SRC)
  return out
}

/* ── the check ────────────────────────────────────────────────────────────── */

const { columns: SCHEMA, views: VIEWS } = schemaFromMigrations()
const SELECTS = selectsInSource()

test('the schema reader actually read a schema', () => {
  // 🔴 Without this, a regex that matched nothing would make every select pass.
  assert.ok(SCHEMA.size >= 10, `only ${SCHEMA.size} tables parsed from the migrations`)
  assert.ok(SCHEMA.get('leads')?.has('full_name'), 'leads.full_name not found — the parser is wrong')
  assert.ok(SCHEMA.get('leads')?.has('phone'))
  assert.ok(!SCHEMA.get('leads')?.has('name'), 'leads.name should NOT exist — that was the defect')
  assert.ok(SCHEMA.get('sends')?.has('gate_decided_at'))
  // 0036 dropped these two, so the parser must have applied the drop.
  assert.ok(!SCHEMA.get('client_automations')?.has('health'), '0036 dropped health; the parser did not apply it')
  assert.ok(!SCHEMA.get('client_automations')?.has('last_run_at'))
})

test('the select reader actually found selects', () => {
  assert.ok(SELECTS.length >= 20, `only ${SELECTS.length} selects found — has the reader broken?`)
  assert.ok(SELECTS.some((s) => s.table === 'leads'), 'no select on leads was found')
})

test('🔴 every selected column exists on the table it is selected from', () => {
  const problems: string[] = []

  for (const s of SELECTS) {
    // A view's columns are not created by a `create table`, so they cannot be
    // checked this way. Named, so an unknown table is still an error.
    if (VIEWS.has(s.table)) continue
    const cols = SCHEMA.get(s.table)
    if (!cols) {
      problems.push(`${s.file}:${s.line} selects from "${s.table}", which no migration creates`)
      continue
    }
    for (const c of s.columns) {
      if (c === '*' || c.includes('(')) continue // count(*), embedded resources
      const bare = c.split(':').pop()!.trim() // alias:column
      if (!cols.has(bare)) {
        problems.push(
          `${s.file}:${s.line} selects ${s.table}.${bare}, which does not exist. ` +
            `Columns: ${[...cols].sort().join(', ')}`,
        )
      }
    }
  }

  assert.deepEqual(
    problems,
    [],
    `\n\n  🔴 ${problems.length} select(s) ask for a column no migration creates.\n\n` +
      problems.map((p) => `    ${p}`).join('\n') +
      '\n\n  These compile: admin() has no Database generic, so a select string is\n' +
      '  checked against nothing. They 400 at runtime, on whichever page reads\n' +
      '  them, and a caught read renders as "could not be read".\n',
  )
})

test('the control: the checker can see a column that does not exist', () => {
  /*
   * Drives the same comparison with the real defect, so a silent pass cannot
   * mean the loop never ran. `name` is what the leads panel asked for.
   */
  const cols = SCHEMA.get('leads')!
  assert.ok(!cols.has('name'), 'leads.name exists, so this control proves nothing')
  assert.ok(cols.has('full_name'), 'the column it should have asked for is missing from the parse')

  const fake: Select = { file: 'x', line: 1, table: 'leads', columns: ['id', 'name'] }
  const missing = fake.columns.filter((c) => !cols.has(c))
  assert.deepEqual(missing, ['name'], 'the comparison does not flag a missing column')
})
