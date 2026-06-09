import { describe, expect, it } from 'vitest'
import { mapVideoGenerationJobRow } from '~~/server/utils/video-generation/jobs'

describe('video generation jobs', () => {
  it('maps video_generation_jobs rows to camelCase jobs', () => {
    const job = mapVideoGenerationJobRow({
      id: 'job-1',
      tenant_id: 'tenant-1',
      project_id: 'project-1',
      timeline_id: 'timeline-1',
      created_by: 'user-1',
      status: 'queued',
      mode: 'image-to-video',
      model_id: 'mock/i2v-safe',
      provider: 'mock',
      prompt: 'subtle reveal',
      source_asset_ids: ['asset-1'],
      duration_seconds: 5,
      aspect_ratio: '16:9',
      resolution: '720p',
      subject_type: 'vehicle',
      compliance_status: 'allowed',
      compliance_reasons: ['Approved vehicle source asset present.'],
      estimated_cost_cents: 250,
      actual_cost_cents: null,
      idempotency_key: 'idem-1',
      provider_request_id: null,
      provider_status: null,
      provider_result_url: null,
      output_asset_id: null,
      output_r2_key: null,
      error_message: null,
      created_at: '2026-06-09T00:00:00.000Z',
      updated_at: '2026-06-09T00:00:00.000Z',
      started_at: null,
      completed_at: null,
    })

    expect(job).toMatchObject({
      id: 'job-1',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      timelineId: 'timeline-1',
      createdBy: 'user-1',
      status: 'queued',
      mode: 'image-to-video',
      modelId: 'mock/i2v-safe',
      provider: 'mock',
      sourceAssetIds: ['asset-1'],
      durationSeconds: 5,
      aspectRatio: '16:9',
      subjectType: 'vehicle',
      complianceStatus: 'allowed',
      complianceReasons: ['Approved vehicle source asset present.'],
      estimatedCostCents: 250,
      idempotencyKey: 'idem-1',
    })
  })
})
