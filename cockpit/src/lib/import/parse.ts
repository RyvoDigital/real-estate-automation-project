import Papa from 'papaparse'
import ExcelJS from 'exceljs'
import vCard from 'vcf'

/**
 * Turning whatever the agency sent into { headers, rows } of strings.
 *
 * §2.2: accept anything, never ask them to reformat. An agency that has to
 * restructure a spreadsheet before onboarding will not onboard.
 *
 * Everything below returns STRINGS. Typing happens later in normalise.ts,
 * against a mapping a human has approved — so a column we guessed wrong is a
 * mapping correction, not a parse failure.
 */

/**
 * A row WITH the line it came from.
 *
 * The line number is carried rather than inferred from array position, because
 * the moment one row is rejected every later index shifts by one — and the
 * report would then send the operator to the wrong line of their own
 * spreadsheet. Found by printing the report rather than by the tests, which
 * were green: 44 of them, and the row numbers were wrong.
 */
export type ParsedRow = { line: number; values: Record<string, string> }

export type Parsed = {
  format: 'csv' | 'xlsx' | 'vcard'
  headers: string[]
  rows: ParsedRow[]
  /** Rows the parser itself could not read. Reported, never dropped (§2.5). */
  parseErrors: { row: number; reason: string; raw: string }[]
  note?: string
}

export function detectFormat(filename: string, bytes: Buffer): Parsed['format'] {
  // CONTENT FIRST, EXTENSION SECOND. An extension is a claim; a magic number
  // is evidence. Agencies rename files constantly, and a .csv that is really a
  // workbook parses as one line of binary garbage and reports "1 row imported"
  // rather than failing — which is the shape of every incident in the lessons
  // file. Only sniff for signatures that are unambiguous.
  if (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) return 'xlsx' // PK zip
  if (/^BEGIN:VCARD/im.test(bytes.subarray(0, 200).toString('utf8'))) return 'vcard'

  const ext = filename.toLowerCase().split('.').pop() ?? ''
  if (ext === 'xlsx' || ext === 'xlsm') return 'xlsx'
  if (ext === 'vcf' || ext === 'vcard') return 'vcard'
  return 'csv'
}

/** Strip a UTF-8 BOM. Excel writes one and it poisons the first header name. */
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>()
  return raw.map((h, i) => {
    const name = (h ?? '').trim() || `column_${i + 1}`
    const n = seen.get(name) ?? 0
    seen.set(name, n + 1)
    return n === 0 ? name : `${name} (${n + 1})`
  })
}

export function parseCsv(text: string): Parsed {
  const out = Papa.parse<Record<string, string>>(stripBom(text), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => (h ?? '').trim(),
  })

  const headers = uniqueHeaders((out.meta.fields ?? []) as string[])

  // Papaparse reports a row whose field count does not match the header as
  // TooFewFields / TooManyFields and STILL returns a row for it. That row is
  // misaligned — every value after the bad comma belongs to the wrong column —
  // so it is a reject, not data. This is the single most common thing wrong
  // with a real spreadsheet: an unescaped comma inside an address.
  const badRows = new Set<number>()
  const parseErrors = (out.errors ?? [])
    .filter((e) => typeof e.row === 'number')
    .map((e) => {
      badRows.add(e.row as number)
      return {
        row: (e.row as number) + 2, // 1-based, plus the header line
        reason:
          e.code === 'TooManyFields'
            ? 'more values than columns — probably an unescaped comma'
            : e.code === 'TooFewFields'
              ? 'fewer values than columns — the row is short or misaligned'
              : e.message,
        raw: JSON.stringify(out.data[e.row as number] ?? {}),
      }
    })

  const rows: ParsedRow[] = out.data
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => !badRows.has(i))
    .map(({ r, i }) => {
      const values: Record<string, string> = {}
      for (const h of headers) values[h] = String((r as Record<string, unknown>)[h] ?? '').trim()
      return { line: i + 2, values } // 1-based, plus the header line
    })
    .filter(({ values }) => Object.values(values).some((v) => v !== ''))

  return { format: 'csv', headers, rows, parseErrors }
}

/** A cell out of exceljs is not always a string, and the shapes are load-bearing. */
function cellToString(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    // A formula cell carries its computed result — that is the value a human
    // sees in Excel, so it is the value we import.
    if ('result' in o) return cellToString(o.result)
    // Rich text: a name with one bold word arrives as an array of runs.
    if (Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map((t) => t.text).join('').trim()
    }
    // A hyperlinked email cell carries both the label and the mailto.
    if ('text' in o) return cellToString(o.text)
    if ('hyperlink' in o) return String(o.hyperlink).replace(/^mailto:/i, '')
    if ('error' in o) return '' // #REF!, #N/A — a spreadsheet error is not a value
  }
  return String(v).trim()
}

export async function parseXlsx(bytes: Buffer): Promise<Parsed> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]
  if (!ws) {
    return { format: 'xlsx', headers: [], rows: [], parseErrors: [], note: 'The workbook has no sheets.' }
  }

  const note =
    wb.worksheets.length > 1
      ? `The workbook has ${wb.worksheets.length} sheets. Only the first, "${ws.name}", was read.`
      : undefined

  const headerRow = ws.getRow(1)
  const width = Math.max(ws.columnCount, headerRow.cellCount)
  const headers = uniqueHeaders(
    Array.from({ length: width }, (_, i) => cellToString(headerRow.getCell(i + 1).value)),
  )

  const rows: ParsedRow[] = []
  const parseErrors: Parsed['parseErrors'] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const values: Record<string, string> = {}
    for (let c = 0; c < width; c++) values[headers[c]] = cellToString(row.getCell(c + 1).value)
    if (Object.values(values).every((v) => v === '')) continue
    rows.push({ line: r, values })  // the worksheet's own row number
  }

  return { format: 'xlsx', headers, rows, parseErrors, note }
}

export function parseVcard(text: string): Parsed {
  // The spec says CRLF and real exports use it, but a file that has been
  // through an editor or a git checkout may not — and the parser throws a
  // misleading "Unsupported version" if it is not. Verified against the
  // installed library, not assumed.
  const normalised = stripBom(text).replace(/\r?\n/g, '\r\n')
  const headers = ['name', 'phone', 'phone_2', 'email', 'note', 'org', 'address']
  const rows: ParsedRow[] = []
  const parseErrors: Parsed['parseErrors'] = []

  const blocks = normalised.split(/(?=BEGIN:VCARD)/i).filter((b) => /BEGIN:VCARD/i.test(b))
  blocks.forEach((block, i) => {
    try {
      const [card] = vCard.parse(block)
      if (!card) throw new Error('no card in block')
      const val = (k: string): string[] => {
        const v = card.get(k)
        if (!v) return []
        return (Array.isArray(v) ? v : [v]).map((x) => String(x.valueOf())).filter(Boolean)
      }
      const tel = val('tel')
      const name = val('fn')[0] || [...val('n')].join(' ').replace(/;/g, ' ').trim()
      rows.push({ line: i + 1, values: {
        name,
        phone: tel[0] ?? '',
        phone_2: tel[1] ?? '',
        email: val('email')[0] ?? '',
        note: val('note').join(' — '),
        org: val('org')[0] ?? '',
        address: val('adr')[0]?.replace(/;+/g, ' ').trim() ?? '',
      } })
    } catch (e) {
      parseErrors.push({
        row: i + 1,
        reason: `vCard could not be read: ${(e as Error).message}`,
        raw: block.slice(0, 200),
      })
    }
  })

  return { format: 'vcard', headers, rows, parseErrors }
}

export async function parseFile(filename: string, bytes: Buffer): Promise<Parsed> {
  const format = detectFormat(filename, bytes)
  if (format === 'xlsx') return parseXlsx(bytes)
  const text = bytes.toString('utf8')
  return format === 'vcard' ? parseVcard(text) : parseCsv(text)
}
