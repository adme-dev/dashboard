import { describe, expect, it, vi } from 'vitest'

const mockLoadSourceAssetsByIds = vi.fn()
vi.mock('~~/server/utils/video-generation/sourceAssetStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/video-generation/sourceAssetStore')>()
  return {
    ...actual,
    loadSourceAssetsByIds: (...args: unknown[]) => mockLoadSourceAssetsByIds(...args),
  }
})

const { loadVideoGenerationSourceAssets } = await import('~~/server/utils/video-generation/sourceAssets')

describe('loadVideoGenerationSourceAssets', () => {
  it('loads source metadata in request order', async () => {
    mockLoadSourceAssetsByIds.mockResolvedValueOnce([
      { id: 'a2', client_id: 'dealer-1', status: 'approved', subject_type: 'unknown', r2_key: 'k2' },
      { id: 'a1', client_id: 'dealer-1', status: 'approved', subject_type: 'vehicle', r2_key: 'k1' },
    ])

    const assets = await loadVideoGenerationSourceAssets(['a1', 'a2'])

    expect(assets).toEqual([
      { id: 'a1', approved: true, subjectType: 'vehicle' },
      { id: 'a2', approved: true, subjectType: 'unknown' },
    ])
  })

  it('validates tenant ownership and approval when tenantId is provided', async () => {
    mockLoadSourceAssetsByIds.mockResolvedValueOnce([
      { id: 'a1', client_id: 'other-tenant', status: 'approved', subject_type: 'vehicle', r2_key: 'k1' },
    ])

    await expect(loadVideoGenerationSourceAssets(['a1'], 'dealer-1')).rejects.toThrow(/not owned by this tenant/)
  })

  it('allows agency-owned approved source assets for tenant-scoped validation', async () => {
    mockLoadSourceAssetsByIds.mockResolvedValueOnce([
      { id: 'a1', client_id: null, status: 'approved', subject_type: 'vehicle', r2_key: 'k1' },
    ])

    await expect(loadVideoGenerationSourceAssets(['a1'], 'dealer-1')).resolves.toEqual([
      { id: 'a1', approved: true, subjectType: 'vehicle' },
    ])
  })
})
