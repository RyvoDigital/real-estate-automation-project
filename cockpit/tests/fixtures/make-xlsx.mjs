// Builds tests/fixtures/messy-contacts.xlsx with the cell types a real export
// contains: a Date object, a formula, rich text, a hyperlink and a #REF! error.
// Regenerate with: node tests/fixtures/make-xlsx.mjs
import ExcelJS from 'exceljs'
const wb = new ExcelJS.Workbook()
const ws = wb.addWorksheet('Contactos')
const other = wb.addWorksheet('Notas')
other.addRow(['this second sheet must be reported, not silently ignored'])

ws.addRow(['Nome', 'Telemóvel', 'Email', 'Orçamento', 'Zona', 'Tipologia', 'Último Contacto'])
ws.addRow([
  { richText: [{ text: 'Ana ' }, { text: 'Ferreira', font: { bold: true } }] },
  '+351 915 000 111',
  { text: 'ana@example.com', hyperlink: 'mailto:ana@example.com' },
  1750000,
  'Cascais',
  'T4',
  new Date(Date.UTC(2026, 3, 15)),
])
ws.addRow(['Rui Costa', '915000222', 'rui@example.com', { formula: 'B2*0+1200000', result: 1200000 }, 'Estoril', 'T3', new Date(Date.UTC(2026, 1, 3))])
ws.addRow(['Erro Cell', '915000333', 'erro@example.com', { error: '#REF!' }, 'Sintra', 'T2', ''])
await wb.xlsx.writeFile(new URL('./messy-contacts.xlsx', import.meta.url).pathname)
console.log('wrote messy-contacts.xlsx')
