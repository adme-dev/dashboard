import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  createCorruptZipFixture,
  createDocxFixture,
  createOversizedDocxFixture,
  createPdfFixture,
  createPptxFixture,
  createXlsxFixture
} from '../../helpers/boardKnowledgeFixtures'
import { extractNativeDocument } from '~~/server/utils/boardKnowledge/extractNative'

const fixture = (name: string) => readFileSync(`test/fixtures/board-knowledge/${name}`)
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

describe('bounded native text extraction', () => {
  it.each([
    ['sample.txt', 'text/plain', 'Supplier bills'],
    ['sample.csv', 'text/csv', 'Example Media'],
    ['sample.json', 'application/json', 'Weekly cashflow review']
  ])('extracts structured text from %s', async (fileName, mimeType, anchor) => {
    const result = await extractNativeDocument({ bytes: fixture(fileName), fileName, mimeType })

    expect(result).toMatchObject({ outcome: 'usable', method: 'native', errorCode: null })
    expect(result.blocks.map(block => block.content).join('\n')).toContain(anchor)
  })

  it('records replacement characters from invalid UTF-8 without hiding the quality warning', async () => {
    const bytes = Buffer.concat([Buffer.from('Finance '), Buffer.from([0xff]), Buffer.from(' policy text')])
    const result = await extractNativeDocument({ bytes, fileName: 'policy.txt', mimeType: 'text/plain' })

    expect(result.warnings).toContain('INVALID_UTF8_REPLACED')
    expect(result.metrics.replacementRatio).toBeGreaterThan(0)
  })

  it('caps normalized text output independently of the compressed input limit', async () => {
    const result = await extractNativeDocument({
      bytes: Buffer.from('A'.repeat(100)),
      fileName: 'large.txt',
      mimeType: 'text/plain',
      limits: { maxCharacters: 20 }
    })

    expect(result.blocks[0]?.content).toHaveLength(20)
    expect(result.warnings).toContain('DOCUMENT_TEXT_TRUNCATED')
  })
})

describe('bounded native Office extraction', () => {
  it('preserves sheet coordinates and enforces row and column caps', async () => {
    const bytes = createXlsxFixture([
      ['Supplier', 'Due', 'Hidden column'],
      ['Example Media', 1250, 'hidden'],
      ['Capped row', 900, 'hidden']
    ])
    const result = await extractNativeDocument({
      bytes,
      fileName: 'forecast.xlsx',
      mimeType: XLSX_MIME,
      limits: { maxSpreadsheetRows: 2, maxSpreadsheetColumns: 2 }
    })

    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'table', sheetName: 'Weekly forecast' })
    ]))
    const content = result.blocks.map(block => block.content).join('\n')
    expect(content).toContain('Example Media')
    expect(content).not.toContain('Capped row')
    expect(content).not.toContain('Hidden column')
    expect(result.warnings).toContain('SPREADSHEET_TRUNCATED')
  })

  it('extracts DOCX paragraphs and PPTX slides with provenance', async () => {
    const docx = await extractNativeDocument({
      bytes: await createDocxFixture(['Cashflow policy', 'Enter every bill before Friday.']),
      fileName: 'policy.docx',
      mimeType: DOCX_MIME
    })
    const pptx = await extractNativeDocument({
      bytes: await createPptxFixture(['Review bills due', 'Approve the weekly forecast']),
      fileName: 'procedure.pptx',
      mimeType: PPTX_MIME
    })

    expect(docx.blocks.map(block => block.content).join('\n')).toContain('Enter every bill before Friday.')
    expect(pptx.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ content: 'Review bills due', slideNumber: 1 }),
      expect.objectContaining({ content: 'Approve the weekly forecast', slideNumber: 2 })
    ]))
  })

  it('rejects unsafe XML and decompression expansion before parsing content', async () => {
    const unsafe = await extractNativeDocument({
      bytes: await createDocxFixture(['Policy'], { entityDeclaration: '<!DOCTYPE doc [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>' }),
      fileName: 'unsafe.docx',
      mimeType: DOCX_MIME
    })
    const oversized = await extractNativeDocument({
      bytes: await createOversizedDocxFixture(20_000),
      fileName: 'oversized.docx',
      mimeType: DOCX_MIME,
      limits: { maxOoxmlUncompressedBytes: 10_000 }
    })

    expect(unsafe).toMatchObject({ outcome: 'failed', errorCode: 'UNSAFE_XML' })
    expect(oversized).toMatchObject({ outcome: 'failed', errorCode: 'OOXML_EXPANSION_LIMIT' })
  })

  it('returns a bounded parse failure for corrupt OOXML', async () => {
    const result = await extractNativeDocument({
      bytes: createCorruptZipFixture(),
      fileName: 'corrupt.docx',
      mimeType: DOCX_MIME
    })

    expect(result).toMatchObject({ outcome: 'failed', errorCode: 'DOCUMENT_PARSE_FAILED' })
    expect(result.blocks).toEqual([])
  })
})

describe('bounded native PDF extraction', () => {
  it('preserves page boundaries for a digital PDF', async () => {
    const result = await extractNativeDocument({
      bytes: createPdfFixture(['Cashflow policy page one', 'Supplier review page two']),
      fileName: 'policy.pdf',
      mimeType: 'application/pdf'
    })

    expect(result).toMatchObject({ outcome: 'usable', method: 'native' })
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ pageStart: 1, pageEnd: 1 }),
      expect.objectContaining({ pageStart: 2, pageEnd: 2 })
    ]))
  })

  it('checks the page limit before extracting and signals AI fallback for blank scans', async () => {
    const limited = await extractNativeDocument({
      bytes: createPdfFixture(['One', 'Two']),
      fileName: 'long.pdf',
      mimeType: 'application/pdf',
      limits: { maxPdfPages: 1 }
    })
    const blank = await extractNativeDocument({
      bytes: createPdfFixture(['']),
      fileName: 'scan.pdf',
      mimeType: 'application/pdf'
    })

    expect(limited).toMatchObject({ outcome: 'failed', errorCode: 'PDF_PAGE_LIMIT', blocks: [] })
    expect(blank).toMatchObject({ outcome: 'needs_ai', errorCode: 'NATIVE_TEXT_INSUFFICIENT' })
    expect(blank.metrics.blankRatio).toBe(1)
  })
})
