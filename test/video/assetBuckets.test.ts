import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIDEO_BUCKETS,
  buildDefaultBucketRows,
  buildReviewableAssemblyPlan,
  mapBucketItemRow,
  mapBucketRow,
  mapDerivativeRow,
  mapIntelligenceJobRow,
} from '~~/server/utils/video-asset-intelligence/buckets'

describe('video asset buckets', () => {
  it('defines the enterprise default bucket set', () => {
    expect(DEFAULT_VIDEO_BUCKETS.map(bucket => bucket.kind)).toEqual([
      'footage',
      'stills',
      'products',
      'logos',
      'people',
      'backgrounds',
      'audio',
      'graphics',
      'generated',
      'exports',
    ])
  })

  it('builds default bucket rows for a project', () => {
    const rows = buildDefaultBucketRows('project-1')
    expect(rows[0]).toMatchObject({ projectId: 'project-1', kind: 'footage', name: 'Footage', sortOrder: 10 })
    expect(rows.at(-1)).toMatchObject({ projectId: 'project-1', kind: 'exports' })
  })

  it('maps bucket, item, derivative and job DB rows to API shape', () => {
    expect(mapBucketRow({ id: 'b1', project_id: 'p1', kind: 'logos', name: 'Logos', sort_order: 40, created_at: 'now', updated_at: 'now' }))
      .toMatchObject({ id: 'b1', projectId: 'p1', kind: 'logos', sortOrder: 40 })
    expect(mapBucketItemRow({
      id: 'i1', bucket_id: 'b1', asset_id: 'a1', r2_key: 'k', title: 'Logo',
      role: 'brand-mark', directive: { action: 'mask-lift' }, status: 'ready', created_at: 'now', updated_at: 'now'
    })).toMatchObject({ id: 'i1', bucketId: 'b1', assetId: 'a1', directive: { action: 'mask-lift' } })
    expect(mapDerivativeRow({
      id: 'd1', source_asset_id: 'a1', project_id: 'p1', kind: 'foreground-png', r2_key: 'fg.png',
      width: 100, height: 200, metadata: { matte: true }, created_at: 'now'
    })).toMatchObject({ id: 'd1', sourceAssetId: 'a1', kind: 'foreground-png', width: 100 })
    expect(mapIntelligenceJobRow({
      id: 'j1', project_id: 'p1', source_asset_id: 'a1', bucket_item_id: 'i1', action: 'mask-lift',
      model_id: 'replicate/sam-2', provider: 'replicate', status: 'blocked', prompt: 'lift text',
      brush_mask_key: 'mask.png', output_derivative_ids: ['d1'], error_message: 'configure provider',
      created_by: 'u1', created_at: 'now', updated_at: 'now', started_at: null, completed_at: null
    })).toMatchObject({ id: 'j1', action: 'mask-lift', outputDerivativeIds: ['d1'] })
  })

  it('builds a reviewable assembly plan without mutating the timeline', () => {
    const plan = buildReviewableAssemblyPlan({
      projectId: 'p1',
      brief: 'Make a TikTok product launch',
      targetFormat: 'tiktok_9x16',
      bucketItems: [
        { id: 'i1', bucketId: 'b1', assetId: 'a1', r2Key: 'logo.png', title: 'Logo', role: 'brand', directive: {}, status: 'ready', createdAt: 'now', updatedAt: 'now' },
        { id: 'i2', bucketId: 'b2', assetId: 'a2', r2Key: 'car.mp4', title: 'Car footage', role: 'hero-footage', directive: { prompt: 'dust trail' }, status: 'ready', createdAt: 'now', updatedAt: 'now' },
      ]
    })
    expect(plan).toMatchObject({
      projectId: 'p1',
      status: 'draft',
      targetFormat: 'tiktok_9x16',
      brief: 'Make a TikTok product launch'
    })
    expect(plan.steps.map(step => step.type)).toEqual(['place-asset', 'place-asset'])
    expect(plan.steps[1]).toMatchObject({ assetId: 'a2', directive: { prompt: 'dust trail' } })
  })
})
