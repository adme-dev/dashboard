import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  isIndexableBoardKnowledgeFile,
  sourceVersionKey,
  type BoardKnowledgeProjection,
  type BoardKnowledgeSubmission
} from '~~/server/utils/boardKnowledge/types'

describe('board knowledge file admission', () => {
  it.each([
    ['policy.pdf', 'application/pdf'],
    ['procedure.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['forecast.xls', 'application/vnd.ms-excel'],
    ['forecast.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['brief.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['transactions.csv', 'text/csv; charset=utf-8'],
    ['notes.txt', 'text/plain'],
    ['config.json', 'application/json']
  ])('admits the supported extension and MIME pair %s', (fileName, mimeType) => {
    expect(isIndexableBoardKnowledgeFile(fileName, mimeType)).toBe(true)
  })

  it.each([
    ['policy.pdf', 'application/x-msdownload'],
    ['legacy.doc', 'application/msword'],
    ['legacy.ppt', 'application/vnd.ms-powerpoint'],
    ['scan.png', 'image/png'],
    ['archive.zip', 'application/zip'],
    ['fake.pdf.exe', 'application/pdf'],
    ['forecast.xlsx', 'application/octet-stream']
  ])('rejects unsupported or mismatched file identity %s', (fileName, mimeType) => {
    expect(isIndexableBoardKnowledgeFile(fileName, mimeType)).toBe(false)
  })

  it('matches extensions and MIME types case-insensitively', () => {
    expect(isIndexableBoardKnowledgeFile('POLICY.PDF', 'APPLICATION/PDF')).toBe(true)
  })
})

describe('board knowledge source versions', () => {
  const source = {
    id: 'file-1',
    checksum: null,
    storageKey: 'boards/finance/policy.pdf',
    size: 2048,
    updatedAt: '2026-08-04T01:02:03.000Z'
  }

  it('prefers an existing checksum as the immutable version identity', () => {
    expect(sourceVersionKey({ ...source, checksum: 'ABC123' })).toBe('sha256:abc123')
  })

  it('creates a deterministic digest without exposing the storage key', () => {
    const version = sourceVersionKey(source)

    expect(version).toMatch(/^record:[a-f0-9]{64}$/)
    expect(sourceVersionKey({ ...source })).toBe(version)
    expect(version).not.toContain(source.storageKey)
  })

  it('changes when an immutable source property changes', () => {
    expect(sourceVersionKey({ ...source, size: 2049 })).not.toBe(sourceVersionKey(source))
    expect(sourceVersionKey({ ...source, updatedAt: '2026-08-04T01:02:04.000Z' })).not.toBe(sourceVersionKey(source))
  })
})

describe('board knowledge runtime contracts', () => {
  it('keeps server submissions and frontend projections explicit', () => {
    expectTypeOf<BoardKnowledgeSubmission['reviewStatus']>().toEqualTypeOf<'pending' | 'approved' | 'rejected' | 'archived'>()
    expectTypeOf<BoardKnowledgeSubmission['sourceId']>().toEqualTypeOf<string>()
    expectTypeOf<BoardKnowledgeSubmission['extractionStatus']>().toEqualTypeOf<'queued' | 'processing' | 'ready' | 'failed'>()
    expectTypeOf<BoardKnowledgeSubmission['indexStatus']>().toEqualTypeOf<'not_indexed' | 'queued' | 'indexing' | 'indexed' | 'failed' | 'removed'>()
    expectTypeOf<BoardKnowledgeProjection['label']>().toEqualTypeOf<
      | 'Not submitted'
      | 'Extracting'
      | 'Ready for review'
      | 'Approved · indexing'
      | 'Used by AI'
      | 'Rejected'
      | 'Extraction failed'
      | 'Archived'
      | 'Not indexable'
    >()
  })
})
