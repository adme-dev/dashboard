import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import { extractText, getDocumentProxy } from 'unpdf'
import * as XLSX from 'xlsx'

export interface ExtractionBlock {
  kind: 'text' | 'table' | 'heading'
  content: string
  heading?: string
  pageStart?: number
  pageEnd?: number
  sheetName?: string
  slideNumber?: number
}

export interface NativeExtractionMetrics {
  pages?: number
  sheets?: number
  slides?: number
  characters: number
  blankRatio: number
  replacementRatio: number
}

export interface NativeExtractionResult {
  outcome: 'usable' | 'needs_ai' | 'failed'
  method: 'native'
  blocks: ExtractionBlock[]
  metrics: NativeExtractionMetrics
  warnings: string[]
  errorCode: string | null
}

export interface NativeExtractionLimits {
  maxInputBytes: number
  maxPdfPages: number
  maxOoxmlUncompressedBytes: number
  maxSpreadsheetSheets: number
  maxSpreadsheetRows: number
  maxSpreadsheetColumns: number
  maxCharacters: number
  timeoutMs: number
}

export interface ExtractNativeDocumentInput {
  bytes: Uint8Array
  fileName: string
  mimeType: string
  limits?: Partial<NativeExtractionLimits>
}

const DEFAULT_LIMITS: NativeExtractionLimits = {
  maxInputBytes: 25 * 1024 * 1024,
  maxPdfPages: 100,
  maxOoxmlUncompressedBytes: 50 * 1024 * 1024,
  maxSpreadsheetSheets: 50,
  maxSpreadsheetRows: 5_000,
  maxSpreadsheetColumns: 100,
  maxCharacters: 2_000_000,
  timeoutMs: 10_000
}

const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
} as const

function emptyMetrics(): NativeExtractionMetrics {
  return { characters: 0, blankRatio: 1, replacementRatio: 0 }
}

function failed(errorCode: string, warnings: string[] = []): NativeExtractionResult {
  return { outcome: 'failed', method: 'native', blocks: [], metrics: emptyMetrics(), warnings, errorCode }
}

function normalizedMime(mimeType: string): string {
  return mimeType.split(';', 1)[0]?.trim().toLowerCase() || ''
}

function extension(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index < 0 ? '' : fileName.slice(index + 1).toLowerCase()
}

function textQuality(blocks: ExtractionBlock[], unitCount = blocks.length): Pick<NativeExtractionResult, 'outcome' | 'metrics' | 'errorCode'> {
  const content = blocks.map(block => block.content).join('\n')
  const characters = content.length
  const replacementCharacters = [...content].filter(character => character === '\uFFFD').length
  const blankUnits = Math.max(0, unitCount - blocks.filter(block => block.content.trim().length > 0).length)
  const blankRatio = unitCount > 0 ? blankUnits / unitCount : 1
  const replacementRatio = characters > 0 ? replacementCharacters / characters : 0
  const usableCharacters = content.replace(/\s/g, '').length
  return {
    outcome: usableCharacters >= 12 && replacementRatio <= 0.05 ? 'usable' : 'needs_ai',
    metrics: { characters, blankRatio, replacementRatio },
    errorCode: usableCharacters >= 12 && replacementRatio <= 0.05 ? null : 'NATIVE_TEXT_INSUFFICIENT'
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('DOCUMENT_PARSE_TIMEOUT')), timeoutMs)
      })
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function decodeText(bytes: Uint8Array): { content: string, warnings: string[] } {
  const content = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  return {
    content,
    warnings: content.includes('\uFFFD') ? ['INVALID_UTF8_REPLACED'] : []
  }
}

function extractPlainText(bytes: Uint8Array, fileExtension: string, limits: NativeExtractionLimits): NativeExtractionResult {
  const decoded = decodeText(bytes)
  let content = decoded.content
  if (fileExtension === 'json') {
    try {
      content = JSON.stringify(JSON.parse(content), null, 2)
    } catch {
      return failed('INVALID_JSON', decoded.warnings)
    }
  }
  if (content.length > limits.maxCharacters) {
    content = content.slice(0, limits.maxCharacters)
    decoded.warnings.push('DOCUMENT_TEXT_TRUNCATED')
  }
  const block: ExtractionBlock = { kind: fileExtension === 'csv' ? 'table' : 'text', content }
  const quality = textQuality([block], 1)
  return { method: 'native', blocks: [block], warnings: decoded.warnings, ...quality }
}

function spreadsheetResult(bytes: Uint8Array, limits: NativeExtractionLimits): NativeExtractionResult {
  const workbook = XLSX.read(bytes, {
    type: 'array',
    cellFormula: false,
    cellHTML: false,
    cellText: true,
    sheetRows: limits.maxSpreadsheetRows
  })
  const selectedSheets = workbook.SheetNames.slice(0, limits.maxSpreadsheetSheets)
  const warnings: string[] = workbook.SheetNames.length > selectedSheets.length ? ['SPREADSHEET_TRUNCATED'] : []
  const blocks: ExtractionBlock[] = []

  for (const sheetName of selectedSheets) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null
    if (range && (range.e.r + 1 > limits.maxSpreadsheetRows || range.e.c + 1 > limits.maxSpreadsheetColumns)) {
      if (!warnings.includes('SPREADSHEET_TRUNCATED')) warnings.push('SPREADSHEET_TRUNCATED')
    }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' })
      .slice(0, limits.maxSpreadsheetRows)
      .map(row => row.slice(0, limits.maxSpreadsheetColumns).map(value => String(value ?? '')))
    const content = rows.map(row => row.join('\t')).join('\n').slice(0, limits.maxCharacters)
    if (content.trim()) blocks.push({ kind: 'table', content, sheetName })
  }

  const quality = textQuality(blocks, selectedSheets.length)
  return {
    method: 'native',
    blocks,
    warnings,
    ...quality,
    metrics: { ...quality.metrics, sheets: selectedSheets.length }
  }
}

function containsUnsafeXml(xml: string): boolean {
  return /<!DOCTYPE|<!ENTITY/i.test(xml)
}

function collectXmlText(value: unknown, output: string[]): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach(item => collectXmlText(item, output))
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 't' && typeof child === 'string') output.push(child)
    else collectXmlText(child, output)
  }
}

async function ooxmlResult(
  bytes: Uint8Array,
  fileExtension: 'docx' | 'pptx',
  limits: NativeExtractionLimits
): Promise<NativeExtractionResult> {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
  const entries = Object.values(zip.files).filter(entry => !entry.dir)
  const uncompressedBytes = entries.reduce((total, entry) => {
    const size = Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0)
    return total + size
  }, 0)
  if (uncompressedBytes > limits.maxOoxmlUncompressedBytes) return failed('OOXML_EXPANSION_LIMIT')

  const paths = fileExtension === 'docx'
    ? ['word/document.xml']
    : entries.map(entry => entry.name)
        .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((left, right) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]))
  const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, processEntities: false })
  const blocks: ExtractionBlock[] = []

  for (const [index, path] of paths.entries()) {
    const entry = zip.file(path)
    if (!entry) continue
    const xml = await entry.async('string')
    if (containsUnsafeXml(xml)) return failed('UNSAFE_XML')
    const text: string[] = []
    collectXmlText(parser.parse(xml), text)
    const content = text.join('\n').slice(0, limits.maxCharacters)
    if (!content.trim()) continue
    blocks.push(fileExtension === 'pptx'
      ? { kind: 'text', content, slideNumber: index + 1 }
      : { kind: 'text', content })
  }

  const quality = textQuality(blocks, paths.length)
  return {
    method: 'native',
    blocks,
    warnings: [],
    ...quality,
    metrics: {
      ...quality.metrics,
      ...(fileExtension === 'pptx' ? { slides: paths.length } : {})
    }
  }
}

async function pdfResult(bytes: Uint8Array, limits: NativeExtractionLimits): Promise<NativeExtractionResult> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  try {
    if (pdf.numPages > limits.maxPdfPages) return failed('PDF_PAGE_LIMIT')
    const extracted = await extractText(pdf, { mergePages: false })
    const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text]
    const blocks = pages
      .map((content, index): ExtractionBlock => ({
        kind: 'text',
        content: content.slice(0, limits.maxCharacters),
        pageStart: index + 1,
        pageEnd: index + 1
      }))
      .filter(block => block.content.trim().length > 0)
    const quality = textQuality(blocks, pdf.numPages)
    return {
      method: 'native',
      blocks,
      warnings: [],
      ...quality,
      metrics: { ...quality.metrics, pages: pdf.numPages }
    }
  } finally {
    const destroy = (pdf as unknown as { destroy?: () => Promise<void> }).destroy
    if (typeof destroy === 'function') await destroy.call(pdf)
  }
}

export async function extractNativeDocument(input: ExtractNativeDocumentInput): Promise<NativeExtractionResult> {
  const limits = { ...DEFAULT_LIMITS, ...input.limits }
  if (input.bytes.byteLength > limits.maxInputBytes) return failed('DOCUMENT_SIZE_LIMIT')
  const fileExtension = extension(input.fileName)
  const mimeType = normalizedMime(input.mimeType)

  try {
    return await withTimeout((async () => {
      if (mimeType === MIME.pdf && fileExtension === 'pdf') return pdfResult(input.bytes, limits)
      if ((mimeType === MIME.xlsx && fileExtension === 'xlsx') || (mimeType === MIME.xls && fileExtension === 'xls')) {
        return spreadsheetResult(input.bytes, limits)
      }
      if (mimeType === MIME.docx && fileExtension === 'docx') return ooxmlResult(input.bytes, 'docx', limits)
      if (mimeType === MIME.pptx && fileExtension === 'pptx') return ooxmlResult(input.bytes, 'pptx', limits)
      if (['txt', 'csv', 'json'].includes(fileExtension)) return extractPlainText(input.bytes, fileExtension, limits)
      return failed('UNSUPPORTED_DOCUMENT_TYPE')
    })(), limits.timeoutMs)
  } catch (error) {
    const code = error instanceof Error && error.message === 'DOCUMENT_PARSE_TIMEOUT'
      ? 'DOCUMENT_PARSE_TIMEOUT'
      : 'DOCUMENT_PARSE_FAILED'
    return failed(code)
  }
}
