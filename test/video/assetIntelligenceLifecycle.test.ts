import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
}))

const {
  createQueuedExtractionJob,
  markAssetIntelligenceJobRunning,
  markAssetIntelligenceJobSucceeded,
  markAssetIntelligenceJobFailed,
} = await import('~~/server/utils/video-asset-intelligence/db')

describe('asset intelligence lifecycle', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
  })

  it('creates queued extraction jobs with a worker-supported default model/provider', async () => {
    mockQueryOne.mockResolvedValue({
      id: 'job-1',
      project_id: 'project-1',
      source_asset_id: 'asset-1',
      bucket_item_id: 'item-1',
      action: 'mask-only',
      model_id: 'replicate/sam-2',
      provider: 'replicate',
      status: 'queued',
      prompt: 'store mask',
      brush_mask_key: 'mask.png',
      output_derivative_ids: [],
      error_message: null,
      created_by: 'user-1',
      created_at: 'now',
      updated_at: 'now',
      started_at: null,
      completed_at: null,
    })

    const job = await createQueuedExtractionJob({
      projectId: 'project-1',
      sourceAssetId: 'asset-1',
      bucketItemId: 'item-1',
      action: 'mask-only',
      prompt: 'store mask',
      brushMaskKey: 'mask.png',
      modelId: null,
      createdBy: 'user-1',
    })

    expect(mockQueryOne.mock.calls[0][0]).toContain(`'queued'`)
    expect(job).toMatchObject({ id: 'job-1', status: 'queued', modelId: 'replicate/sam-2' })
  })

  it('marks jobs running, succeeded and failed idempotently', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'job-1', project_id: 'project-1', source_asset_id: 'asset-1', bucket_item_id: null, action: 'mask-only', model_id: 'replicate/sam-2', provider: 'replicate', status: 'running', prompt: null, brush_mask_key: 'mask.png', output_derivative_ids: [], error_message: null, created_by: 'user-1', created_at: 'now', updated_at: 'now', started_at: 'now', completed_at: null })
      .mockResolvedValueOnce({ id: 'job-1', project_id: 'project-1', source_asset_id: 'asset-1', bucket_item_id: null, action: 'mask-only', model_id: 'replicate/sam-2', provider: 'replicate', status: 'succeeded', prompt: null, brush_mask_key: 'mask.png', output_derivative_ids: ['derivative-1'], error_message: null, created_by: 'user-1', created_at: 'now', updated_at: 'now', started_at: 'now', completed_at: 'now' })
      .mockResolvedValueOnce({ id: 'job-2', project_id: 'project-1', source_asset_id: 'asset-1', bucket_item_id: null, action: 'mask-only', model_id: 'replicate/sam-2', provider: 'replicate', status: 'failed', prompt: null, brush_mask_key: 'mask.png', output_derivative_ids: [], error_message: 'bad mask', created_by: 'user-1', created_at: 'now', updated_at: 'now', started_at: 'now', completed_at: 'now' })

    await expect(markAssetIntelligenceJobRunning('job-1')).resolves.toMatchObject({ status: 'running' })
    await expect(markAssetIntelligenceJobSucceeded({ id: 'job-1', outputDerivativeIds: ['derivative-1'] })).resolves.toMatchObject({ status: 'succeeded' })
    await expect(markAssetIntelligenceJobFailed('job-2', 'bad mask')).resolves.toMatchObject({ status: 'failed', errorMessage: 'bad mask' })
  })

  it('does not mark final or blocked jobs running when no queued row is updated', async () => {
    mockQueryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'job-1', project_id: 'project-1', source_asset_id: 'asset-1', bucket_item_id: null, action: 'mask-only', model_id: 'replicate/sam-2', provider: 'replicate', status: 'succeeded', prompt: null, brush_mask_key: 'mask.png', output_derivative_ids: ['derivative-1'], error_message: null, created_by: 'user-1', created_at: 'now', updated_at: 'now', started_at: 'now', completed_at: 'now' })

    await expect(markAssetIntelligenceJobRunning('job-1')).resolves.toMatchObject({
      status: 'succeeded',
      outputDerivativeIds: ['derivative-1'],
    })

    expect(mockQueryOne.mock.calls[0][0]).toContain(`status = 'queued'`)
    expect(mockQueryOne.mock.calls[1][0]).toContain('SELECT * FROM video_asset_intelligence_jobs')
  })

  it('returns blocked jobs unchanged when success or failure finalizers update no rows', async () => {
    mockQueryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'job-blocked', project_id: 'project-1', source_asset_id: 'asset-1', bucket_item_id: null, action: 'erase-fill', model_id: 'workers-ai/flux-edit', provider: 'workers-ai', status: 'blocked', prompt: null, brush_mask_key: null, output_derivative_ids: [], error_message: 'queue unavailable', created_by: 'user-1', created_at: 'now', updated_at: 'now', started_at: null, completed_at: 'now' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'job-blocked', project_id: 'project-1', source_asset_id: 'asset-1', bucket_item_id: null, action: 'erase-fill', model_id: 'workers-ai/flux-edit', provider: 'workers-ai', status: 'blocked', prompt: null, brush_mask_key: null, output_derivative_ids: [], error_message: 'queue unavailable', created_by: 'user-1', created_at: 'now', updated_at: 'now', started_at: null, completed_at: 'now' })

    await expect(markAssetIntelligenceJobSucceeded({ id: 'job-blocked', outputDerivativeIds: ['derivative-1'] })).resolves.toMatchObject({
      status: 'blocked',
      outputDerivativeIds: [],
      errorMessage: 'queue unavailable',
    })
    await expect(markAssetIntelligenceJobFailed('job-blocked', 'new error')).resolves.toMatchObject({
      status: 'blocked',
      errorMessage: 'queue unavailable',
    })

    expect(mockQueryOne.mock.calls[0][0]).toContain(`status IN ('queued','running')`)
    expect(mockQueryOne.mock.calls[2][0]).toContain(`status IN ('queued','running')`)
  })
})
