import { describe, expect, it } from 'vitest'
import { buildKnowledgeChunks } from '~~/server/utils/boardKnowledge/chunking'
import type { NativeExtractionResult } from '~~/server/utils/boardKnowledge/extractNative'

const result = (blocks: NativeExtractionResult['blocks']): NativeExtractionResult => ({
  outcome: 'usable', method: 'native', blocks,
  metrics: { characters: blocks.reduce((sum, block) => sum + block.content.length, 0), blankRatio: 0, replacementRatio: 0 },
  warnings: [], errorCode: null
})

describe('semantic board knowledge chunking', () => {
  it('preserves page, sheet, and slide boundaries', () => {
    const chunks = buildKnowledgeChunks(result([
      { kind: 'text', content: 'Page one policy content.', heading: 'Policy', pageStart: 1, pageEnd: 1 },
      { kind: 'table', content: 'Supplier\tAmount\nExample\t100', sheetName: 'Forecast' },
      { kind: 'text', content: 'Approval process details.', slideNumber: 2 }
    ]))

    expect(chunks).toEqual([
      expect.objectContaining({ chunkIndex: 0, heading: 'Policy', pageStart: 1, pageEnd: 1 }),
      expect.objectContaining({ chunkIndex: 1, sheetName: 'Forecast' }),
      expect.objectContaining({ chunkIndex: 2, slideNumber: 2 })
    ])
  })

  it('splits a large structural block under the hard limit with bounded overlap', () => {
    const content = Array.from({ length: 900 }, (_, index) => `word${index}`).join(' ')
    const chunks = buildKnowledgeChunks(result([{ kind: 'text', content, pageStart: 1, pageEnd: 1 }]))

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(chunk => chunk.content.length <= 2_200)).toBe(true)
    const overlap = chunks[0]!.content.slice(-200)
    expect(chunks[1]!.content).toContain(overlap.trimStart())
    expect(chunks.every(chunk => chunk.pageStart === 1 && chunk.pageEnd === 1)).toBe(true)
  })

  it('removes empty and duplicate chunks and produces stable hashes', () => {
    const input = result([
      { kind: 'text', content: '  ' },
      { kind: 'text', content: 'Unique policy statement.' },
      { kind: 'text', content: 'Unique policy statement.' }
    ])
    const first = buildKnowledgeChunks(input)
    const second = buildKnowledgeChunks(input)

    expect(first).toHaveLength(1)
    expect(first[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(second[0]?.contentHash).toBe(first[0]?.contentHash)
  })
})
