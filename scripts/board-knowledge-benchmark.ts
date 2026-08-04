import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { pathToFileURL } from 'node:url'
import { deflateSync } from 'node:zlib'
import { z } from 'zod'
import { extractNativeDocument, type ExtractionBlock } from '../workers/board-knowledge-extractor/src/nativeParser'
import {
  createDocxFixture,
  createPdfFixture,
  createPptxFixture,
  createXlsxFixture
} from '../test/helpers/boardKnowledgeFixtures'

const DEFAULT_MANIFEST = 'test/fixtures/board-knowledge/benchmark-manifest.json'

const fixtureSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('file'), path: z.string().min(1) }),
  z.object({
    kind: z.literal('generated'),
    generator: z.enum(['digital_pdf', 'scanned_invoice', 'table_pdf', 'docx', 'xlsx', 'pptx'])
  })
])

const manifestSchema = z.object({
  version: z.literal(1),
  cases: z.array(z.object({
    id: z.string().min(1),
    documentClass: z.enum(['digital_pdf', 'scanned_invoice', 'table_pdf', 'docx', 'xlsx', 'pptx', 'csv', 'txt', 'json']),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    fixture: fixtureSchema,
    expected: z.object({
      textAnchors: z.array(z.string().min(1)),
      tables: z.array(z.object({
        headers: z.array(z.string().min(1)).min(1),
        rowAnchors: z.array(z.string().min(1)).min(1)
      })),
      pageNumbers: z.array(z.number().int().positive()),
      sheetNames: z.array(z.string().min(1)),
      slideNumbers: z.array(z.number().int().positive()),
      minimumCoverage: z.object({ native: z.number().min(0).max(1), ai: z.number().min(0).max(1) })
    })
  })).length(9)
})

export type BoardKnowledgeBenchmarkManifest = z.infer<typeof manifestSchema>
type BenchmarkCase = BoardKnowledgeBenchmarkManifest['cases'][number]

interface CoverageReport {
  score: number
  matchedChecks: number
  totalChecks: number
  missing: string[]
}

interface MethodReport {
  method: string
  outcome: string
  coverage: CoverageReport
  minimumCoverage: number
  passed: boolean
  warnings: string[]
  errorCode: string | null
  latencyMs: number
  characters: number
  tokens: { prompt: number | null, completion: number | null, total: number | null }
  costUsd: number | null
  model?: string
  provider?: string
  confidence?: number
}

interface NotRunReport {
  status: 'not_run'
  reason: 'native_only' | 'credentials_not_configured'
}

export interface BoardKnowledgeBenchmarkReport {
  manifestVersion: 1
  mode: 'native-only' | 'native-and-ai'
  generatedAt: string
  passed: boolean
  cases: Array<{
    id: string
    documentClass: BenchmarkCase['documentClass']
    fileName: string
    byteLength: number
    native: MethodReport
    ai: MethodReport | NotRunReport
  }>
}

const GLYPHS: Record<string, string[]> = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  'C': ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'G': ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  'I': ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110']
}

function rasterInvoicePdf(): Buffer {
  const width = 700
  const height = 240
  const scale = 7
  const pixels = Buffer.alloc(width * height, 255)
  const lines = ['INVOICE 2048', 'TOTAL 1250', 'DUE 7 AUG 2026']
  for (const [lineIndex, line] of lines.entries()) {
    let x = 35
    const y = 28 + lineIndex * 70
    for (const character of line) {
      const glyph = GLYPHS[character]
      if (!glyph) throw new Error(`Missing benchmark glyph: ${character}`)
      for (let row = 0; row < glyph.length; row++) {
        for (let column = 0; column < glyph[row]!.length; column++) {
          if (glyph[row]![column] !== '1') continue
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              pixels[(y + row * scale + dy) * width + x + column * scale + dx] = 0
            }
          }
        }
      }
      x += 6 * scale
    }
  }

  const compressed = deflateSync(pixels)
  const drawing = `q ${width} 0 0 ${height} 0 0 cm /Im1 Do Q`
  const objects: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>`),
    Buffer.from(`<< /Length ${Buffer.byteLength(drawing)} >>\nstream\n${drawing}\nendstream`),
    Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`),
      compressed,
      Buffer.from('\nendstream')
    ])
  ]
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n%\xff\xff\xff\xff\n', 'binary')]
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.concat(parts).length)
    parts.push(Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from('\nendobj\n'))
  }
  const xrefOffset = Buffer.concat(parts).length
  parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`))
  for (const offset of offsets.slice(1)) parts.push(Buffer.from(`${String(offset).padStart(10, '0')} 00000 n \n`))
  parts.push(Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`))
  return Buffer.concat(parts)
}

async function generatedFixture(generator: Extract<BenchmarkCase['fixture'], { kind: 'generated' }>['generator']): Promise<Buffer> {
  if (generator === 'digital_pdf') return createPdfFixture(['Cashflow policy', 'Supplier review'])
  if (generator === 'scanned_invoice') return rasterInvoicePdf()
  if (generator === 'table_pdf') {
    return createPdfFixture(['Supplier Due Date Amount Example Media 2026-08-07 1250 Example Hosting 2026-08-10 480'])
  }
  if (generator === 'docx') {
    return createDocxFixture(['Bookkeeper work instruction', 'Enter approved bills before Friday'])
  }
  if (generator === 'xlsx') {
    return createXlsxFixture([
      ['Supplier', 'Due Date', 'Amount'],
      ['Example Media', '2026-08-07', 1250]
    ])
  }
  return createPptxFixture(['Review bills due', 'Approve weekly forecast'])
}

async function fixtureBytes(item: BenchmarkCase): Promise<Buffer> {
  if (item.fixture.kind === 'file') return readFile(resolve(process.cwd(), item.fixture.path))
  return generatedFixture(item.fixture.generator)
}

function normalized(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function coverage(blocks: ExtractionBlock[], expected: BenchmarkCase['expected']): CoverageReport {
  const content = normalized(blocks.map(block => block.content).join('\n'))
  const missing: string[] = []
  let matchedChecks = 0
  let totalChecks = 0
  const check = (matches: boolean, label: string) => {
    totalChecks += 1
    if (matches) matchedChecks += 1
    else missing.push(label)
  }
  for (const anchor of expected.textAnchors) check(content.includes(normalized(anchor)), `text:${anchor}`)
  for (const table of expected.tables) {
    check([...table.headers, ...table.rowAnchors].every(anchor => content.includes(normalized(anchor))), `table:${table.headers.join('|')}`)
  }
  for (const page of expected.pageNumbers) check(blocks.some(block => block.pageStart === page || block.pageEnd === page), `page:${page}`)
  for (const sheet of expected.sheetNames) check(blocks.some(block => block.sheetName === sheet), `sheet:${sheet}`)
  for (const slide of expected.slideNumbers) check(blocks.some(block => block.slideNumber === slide), `slide:${slide}`)
  return {
    score: totalChecks ? matchedChecks / totalChecks : 1,
    matchedChecks,
    totalChecks,
    missing
  }
}

export async function loadBenchmarkManifest(path = DEFAULT_MANIFEST): Promise<BoardKnowledgeBenchmarkManifest> {
  return manifestSchema.parse(JSON.parse(await readFile(resolve(process.cwd(), path), 'utf8')))
}

async function aiTelemetry(submissionId: string) {
  try {
    const { queryOne } = await import('../server/utils/db')
    return await queryOne<{
      prompt_tokens: number | null
      completion_tokens: number | null
      total_tokens: number | null
      estimated_cost_usd: number | null
    }>(`
      SELECT prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd
      FROM ai_invocations
      WHERE feature_key = 'board_knowledge_document_extraction'
        AND metadata->>'submissionId' = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [submissionId])
  } catch {
    return null
  }
}

function aiConfigured(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_URL
    && process.env.GOOGLE_AI_STUDIO_API_KEY
    && process.env.GOOGLE_AI_STUDIO_PAID === 'true'
  )
}

export async function runBoardKnowledgeBenchmark(options: {
  manifestPath?: string
  nativeOnly: boolean
}): Promise<BoardKnowledgeBenchmarkReport> {
  const manifest = await loadBenchmarkManifest(options.manifestPath)
  const cases: BoardKnowledgeBenchmarkReport['cases'] = []

  for (const [index, item] of manifest.cases.entries()) {
    const bytes = await fixtureBytes(item)
    const nativeStartedAt = Date.now()
    const nativeResult = await extractNativeDocument({
      bytes,
      fileName: item.fileName,
      mimeType: item.mimeType
    })
    const nativeCoverage = coverage(nativeResult.blocks, item.expected)
    const native: MethodReport = {
      method: nativeResult.method,
      outcome: nativeResult.outcome,
      coverage: nativeCoverage,
      minimumCoverage: item.expected.minimumCoverage.native,
      passed: nativeCoverage.score >= item.expected.minimumCoverage.native,
      warnings: nativeResult.warnings,
      errorCode: nativeResult.errorCode,
      latencyMs: Date.now() - nativeStartedAt,
      characters: nativeResult.metrics.characters,
      tokens: { prompt: 0, completion: 0, total: 0 },
      costUsd: 0
    }

    let ai: MethodReport | NotRunReport = {
      status: 'not_run',
      reason: options.nativeOnly ? 'native_only' : 'credentials_not_configured'
    }
    if (!options.nativeOnly && aiConfigured()) {
      const submissionId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
      const aiStartedAt = Date.now()
      const { extractDocumentWithAi } = await import('../server/utils/boardKnowledge/extractAi')
      const aiResult = await extractDocumentWithAi({
        submissionId,
        documentClass: item.documentClass,
        batchNumber: 1,
        bytes,
        mimeType: item.mimeType
      })
      const aiCoverage = coverage(aiResult.blocks, item.expected)
      const telemetry = await aiTelemetry(submissionId)
      const characters = aiResult.blocks.reduce((total, block) => total + block.content.length, 0)
      ai = {
        method: aiResult.method,
        outcome: 'usable',
        coverage: aiCoverage,
        minimumCoverage: item.expected.minimumCoverage.ai,
        passed: aiCoverage.score >= item.expected.minimumCoverage.ai,
        warnings: aiResult.warnings,
        errorCode: null,
        latencyMs: Date.now() - aiStartedAt,
        characters,
        tokens: {
          prompt: telemetry?.prompt_tokens ?? null,
          completion: telemetry?.completion_tokens ?? null,
          total: telemetry?.total_tokens ?? null
        },
        costUsd: telemetry?.estimated_cost_usd == null ? null : Number(telemetry.estimated_cost_usd),
        model: aiResult.model,
        provider: aiResult.provider,
        confidence: aiResult.confidence
      }
    }

    cases.push({
      id: item.id,
      documentClass: item.documentClass,
      fileName: item.fileName,
      byteLength: bytes.byteLength,
      native,
      ai
    })
  }

  return {
    manifestVersion: manifest.version,
    mode: options.nativeOnly ? 'native-only' : 'native-and-ai',
    generatedAt: new Date().toISOString(),
    passed: cases.every(item => item.native.passed && ('status' in item.ai || item.ai.passed)),
    cases
  }
}

function argumentValue(prefix: string): string | undefined {
  return process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length)
}

async function main() {
  try {
    loadEnvFile(resolve(process.cwd(), '.env'))
  } catch {
    // The native benchmark does not require an environment file.
  }
  const report = await runBoardKnowledgeBenchmark({
    manifestPath: argumentValue('--manifest=') || DEFAULT_MANIFEST,
    nativeOnly: process.argv.includes('--native-only')
  })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (!report.passed) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
