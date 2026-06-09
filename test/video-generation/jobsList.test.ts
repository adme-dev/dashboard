import { describe, expect, it } from 'vitest'
import { mapVideoGenerationJobRow } from '~~/server/utils/video-generation/jobs'

describe('jobs list mapping', () => {
  it('maps rows for the project list (status + output asset surfaced)', () => {
    const job = mapVideoGenerationJobRow({
      id: 'j1', tenant_id: 'agency', project_id: 'p1', created_by: 'u1', status: 'succeeded',
      mode: 'image-to-video', model_id: 'muapi/i2v-kling', provider: 'muapi', prompt: 'x',
      source_asset_ids: '[]', duration_seconds: 5, aspect_ratio: '9:16', resolution: '720p',
      subject_type: 'vehicle', compliance_status: 'vehicle_i2v', compliance_reasons: '[]',
      estimated_cost_cents: 225, idempotency_key: 'k', output_asset_id: 'a1', output_r2_key: 'r2/k',
      created_at: 't', updated_at: 't',
    })
    expect(job).toMatchObject({ id: 'j1', status: 'succeeded', outputAssetId: 'a1', modelId: 'muapi/i2v-kling' })
    expect(job.sourceAssetIds).toEqual([])
  })
})
