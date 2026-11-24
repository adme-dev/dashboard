import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()

const freshReads: string[] = []
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  // Fresh reads share the same fakes; freshReads records which statements asked for them.
  queryOneFresh: (...args: unknown[]) => { freshReads.push(String(args[0])); return mockQueryOne(...args) },
  queryRowsFresh: (...args: unknown[]) => { freshReads.push(String(args[0])); return mockQueryRows(...args) },
}))

const { addAssetToProjectBucket, addDerivativeToProjectBucket, syncProjectVideoAssetsIntoGeneratedBucket } = await import('~~/server/utils/video-asset-intelligence/db')

describe('video asset derivative bucket persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    freshReads.length = 0
  })

  it('upserts derivative bucket items through the unique derivative conflict target and preserves canonical directive provenance', async () => {
    let bucketItemSql = ''
    mockQueryOne.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('INSERT INTO video_project_buckets')) return { id: 'ensured-bucket' }
      if (sql.includes('SELECT id FROM video_project_buckets')) return { id: 'bucket-graphics' }
      if (sql.includes('INSERT INTO video_project_bucket_items')) {
        bucketItemSql = sql
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

    expect(bucketItemSql).toContain('ON CONFLICT')
    expect(bucketItemSql).toContain("(directive->>'derivativeId')")
    expect(bucketItemSql).toContain("directive->>'source' = 'video_asset_derivatives'")
    expect(bucketItemSql).toContain('DO UPDATE')
    expect(mockQueryOne.mock.calls.some(([sql]) => String(sql).includes('SELECT * FROM video_project_bucket_items'))).toBe(false)
    expect(mockQueryOne.mock.calls.some(([sql]) => String(sql).includes('UPDATE video_project_bucket_items'))).toBe(false)
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

  const derivative = {
    id: 'd1',
    sourceAssetId: 'a1',
    projectId: 'p1',
    kind: 'edited-image' as const,
    r2Key: 'video-asset-derivatives/t/p1/j1/edited.png',
    width: 1280,
    height: 720,
    metadata: {},
    createdAt: 'now',
  }
  const assetRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'asset-kept', created_by: 'user-1', r2_key: derivative.r2Key, format: 'still', created_at: 'now', updated_at: 'now', ...overrides,
  })

  // Runs "Keep in assets" against a fake database and returns what was written.
  async function keep(input: { existingAsset?: boolean, derivative?: typeof derivative | Record<string, unknown>, createdBy?: string | null }) {
    const written: { assetParams?: unknown[], itemSql?: string, itemParams?: unknown[] } = {}
    mockQueryOne.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('INSERT INTO video_project_buckets')) return { id: 'ensured' }
      if (sql.includes('SELECT id FROM video_project_buckets')) return { id: 'bucket-generated' }
      if (sql.includes("metadata->>'derivativeId' = $2")) return input.existingAsset ? assetRow({ id: 'asset-existing' }) : null
      if (sql.includes('SELECT client_id FROM video_assets')) return { client_id: 'client-1' }
      if (sql.includes('INSERT INTO video_assets')) {
        written.assetParams = params
        return assetRow()
      }
      if (sql.includes('INSERT INTO video_project_bucket_items')) {
        written.itemSql = sql
        written.itemParams = params
        return { id: 'item-1', bucket_id: params[0], asset_id: params[5], r2_key: params[1], title: params[2], role: params[3], directive: JSON.parse(params[4] as string), status: 'ready' }
      }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const item = await addDerivativeToProjectBucket({
      derivative: (input.derivative ?? derivative) as typeof derivative,
      title: 'Sign erased',
      createdBy: input.createdBy === undefined ? 'user-1' : input.createdBy,
    })
    return { item, ...written }
  }

  it('keeps a picture result as a real library asset, so Prepare can select it', async () => {
    const { item, assetParams, itemSql } = await keep({})

    // The bucket item carries the asset id: Prepare refuses items without one.
    expect(item.assetId).toBe('asset-kept')
    // INSERT params: client, creator, title, project, job, key, format, width, height, duration, id, thumbnail, metadata.
    expect(assetParams?.slice(0, 10)).toEqual(['client-1', 'user-1', 'Sign erased', 'p1', null, derivative.r2Key, 'still', 1280, 720, null])
    // A PNG is its own preview picture, so the tools and the Prepare stage both have a still.
    expect(assetParams?.[11]).toBe(derivative.r2Key)
    expect(JSON.parse(assetParams?.[12] as string)).toEqual({ source: 'video_asset_derivatives', derivativeId: 'd1', sourceAssetId: 'a1', kind: 'edited-image' })
    // An item kept before this change has no asset id; keeping it again fills it in.
    expect(itemSql).toContain('asset_id = COALESCE(EXCLUDED.asset_id, video_project_bucket_items.asset_id)')
  })

  it('reuses the asset when the same result is kept twice', async () => {
    const { item, assetParams } = await keep({ existingAsset: true })
    expect(item.assetId).toBe('asset-existing')
    expect(assetParams).toBeUndefined()
  })

  it('files a layer package without making an asset: it is a set, not a picture', async () => {
    const { item, assetParams } = await keep({ derivative: { ...derivative, kind: 'layer-package', r2Key: 'video-asset-derivatives/t/p1/j1/layers.json' } })
    expect(item.assetId).toBeNull()
    expect(assetParams).toBeUndefined()
  })

  it('files an uploaded asset once per bucket', async () => {
    let sql = ''
    mockQueryOne.mockImplementation(async (query: string, params: unknown[]) => {
      if (query.includes('INSERT INTO video_project_buckets')) return { id: 'ensured' }
      if (query.includes('SELECT id FROM video_project_buckets')) return { id: 'bucket-stills' }
      sql = query
      return { id: 'item-2', bucket_id: params[0], asset_id: params[1], r2_key: params[2], title: params[3], role: params[4], directive: {}, status: 'ready' }
    })
    const item = await addAssetToProjectBucket({ projectId: 'p1', bucketKind: 'stills', assetId: 'asset-9', r2Key: 'media/p1/still/a.png', title: 'A', role: 'uploaded-still' })
    expect(item).toMatchObject({ bucketId: 'bucket-stills', assetId: 'asset-9', role: 'uploaded-still' })
    expect(sql).toContain('ON CONFLICT (bucket_id, asset_id) WHERE asset_id IS NOT NULL')
  })

  it('does not copy an asset into Generated when it is already filed in another bucket', async () => {
    mockQueryOne.mockResolvedValue({ id: 'bucket-generated' })
    mockQueryRows.mockResolvedValue([])
    await syncProjectVideoAssetsIntoGeneratedBucket('p1')
    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('JOIN video_project_buckets eb ON eb.id = existing.bucket_id')
    expect(sql).toContain('eb.project_id = $1 AND existing.asset_id = va.id')
  })
})
