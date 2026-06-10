import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
}))

const { addDerivativeToProjectBucket } = await import('~~/server/utils/video-asset-intelligence/db')

describe('video asset derivative bucket persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates the existing derivative bucket item instead of inserting a duplicate and preserves canonical directive provenance', async () => {
    mockQueryOne.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('INSERT INTO video_project_buckets')) return { id: 'ensured-bucket' }
      if (sql.includes('SELECT id FROM video_project_buckets')) return { id: 'bucket-graphics' }
      if (sql.includes('SELECT * FROM video_project_bucket_items')) {
        return {
          id: 'existing-item',
          bucket_id: 'bucket-graphics',
          asset_id: null,
          r2_key: 'old-key.png',
          title: 'Old title',
          role: 'old-role',
          directive: { derivativeId: 'd1' },
          status: 'ready',
          created_at: 'created',
          updated_at: 'updated',
        }
      }
      if (sql.includes('UPDATE video_project_bucket_items')) {
        const directive = JSON.parse(params[4] as string)
        return {
          id: 'existing-item',
          bucket_id: 'bucket-graphics',
          asset_id: null,
          r2_key: params[1],
          title: params[2],
          role: params[3],
          directive,
          status: 'ready',
          created_at: 'created',
          updated_at: 'updated-again',
        }
      }
      throw new Error(`Unexpected query: ${sql}`)
    })

    const item = await addDerivativeToProjectBucket({
      derivative: {
        id: 'd1',
        sourceAssetId: 'a1',
        projectId: 'p1',
        kind: 'foreground-png',
        r2Key: 'new-key.png',
        width: 1080,
        height: 1920,
        metadata: { contentType: 'image/png', size: 12345 },
        createdAt: 'now',
      },
      bucketKind: 'graphics',
      role: 'hero-overlay',
      title: 'Lifted logo',
      directive: {
        prompt: 'place top right',
        source: 'caller-source',
        derivativeId: 'caller-derivative',
        sourceAssetId: 'caller-asset',
        kind: 'caller-kind',
      },
    })

    const existingLookup = mockQueryOne.mock.calls.find(([sql]) => String(sql).includes('directive->>\'derivativeId\' = $2'))
    expect(existingLookup?.[1]).toEqual(['bucket-graphics', 'd1'])
    expect(mockQueryOne.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO video_project_bucket_items'))).toBe(false)
    expect(item).toMatchObject({
      id: 'existing-item',
      r2Key: 'new-key.png',
      title: 'Lifted logo',
      role: 'hero-overlay',
      directive: {
        prompt: 'place top right',
        source: 'video_asset_derivatives',
        derivativeId: 'd1',
        sourceAssetId: 'a1',
        kind: 'foreground-png',
        width: 1080,
        height: 1920,
        contentType: 'image/png',
        size: 12345,
      },
    })
  })
})
