import { describe, expect, it } from 'vitest'

const { loadBenchmarkManifest, runBoardKnowledgeBenchmark } = await import('../../scripts/board-knowledge-benchmark')

describe('Board Knowledge reference benchmark', () => {
  it('covers every required reference document class', async () => {
    const manifest = await loadBenchmarkManifest('test/fixtures/board-knowledge/benchmark-manifest.json')
    expect(manifest.cases.map(item => item.documentClass)).toEqual([
      'digital_pdf',
      'scanned_invoice',
      'table_pdf',
      'docx',
      'xlsx',
      'pptx',
      'csv',
      'txt',
      'json'
    ])
  })

  it('runs the native benchmark without retaining document payloads', async () => {
    const report = await runBoardKnowledgeBenchmark({
      manifestPath: 'test/fixtures/board-knowledge/benchmark-manifest.json',
      nativeOnly: true
    })

    expect(report.mode).toBe('native-only')
    expect(report.cases).toHaveLength(9)
    expect(report.cases.find(item => item.documentClass === 'scanned_invoice')?.native.outcome).toBe('needs_ai')
    expect(report.passed).toBe(true)
    expect(JSON.stringify(report)).not.toContain('documentPayload')
    expect(JSON.stringify(report)).not.toContain('base64')
  })
})
