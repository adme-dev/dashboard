import { describe, expect, it } from 'vitest'
import { PageStudioContentEditSchema, PageStudioContentRevisionSchema } from '../../shared/pageStudio/businessContent'

const collections = [{ id: 'profile', records: [{ id: 'brand', title: 'Example', summary: '', status: 'draft', attributes: {} }] }]

describe('business content browser contract', () => {
  it('accepts bounded plain records but rejects caller-owned authority', () => {
    expect(PageStudioContentEditSchema.parse({ collections, expectedRevision: 0 })).toEqual({ collections, expectedRevision: 0 })
    for (const authority of ['scope', 'actorId', 'businessId', 'environment', 'bindingName']) {
      expect(PageStudioContentEditSchema.safeParse({ collections, expectedRevision: 0, [authority]: 'forged' }).success).toBe(false)
    }
  })
  it('rejects duplicates, nested attributes, oversized values and unsafe revisions', () => {
    const record = collections[0].records[0]
    for (const data of [
      { collections: [...collections, ...collections], expectedRevision: 0 },
      { collections: [{ id: 'profile', records: [record, record] }], expectedRevision: 0 },
      { collections: [{ id: 'profile', records: [{ ...record, attributes: { html: { raw: 'x' } } }] }], expectedRevision: 0 },
      { collections: [{ id: 'profile', records: [{ ...record, summary: 'x'.repeat(4001) }] }], expectedRevision: 0 },
      { collections, expectedRevision: Number.MAX_SAFE_INTEGER }
    ]) expect(PageStudioContentEditSchema.safeParse(data).success).toBe(false)
  })
  it('validates provider revision metadata as well as records', () => {
    expect(PageStudioContentRevisionSchema.safeParse({ revision: 0, content: {}, actorId: 'a', createdAt: '' }).success).toBe(false)
  })
})
