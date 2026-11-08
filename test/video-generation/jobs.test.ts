import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MARK_VIDEO_GENERATION_FAILED_SQL,
  MARK_VIDEO_GENERATION_SUCCEEDED_SQL,
} from '~~/shared/video/generationLiability'

const queryOne = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => queryOne(...args),
  queryRows: vi.fn(),
}))

import {
  mapVideoGenerationJobRow,
  markVideoGenerationJobFailed,
  markVideoGenerationJobSucceeded,
} from '~~/server/utils/video-generation/jobs'
import {
  videoGenerationTransitionApplied,
  videoGenerationTransitionWasApplied,
} from '~~/server/utils/video-generation/types'

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
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
    liability_state: 'reserved',
    liability_cents: 250,
    request_fingerprint: 'b'.repeat(64),
    submission_attempted_at: '2026-06-09T00:00:01.000Z',
    dispatch_eligible: true,
    idempotency_key: 'idem-1',
    provider_request_id: 'provider-job-1',
    provider_status: null,
    provider_result_url: null,
    output_asset_id: null,
    output_r2_key: null,
    output_sha256: null,
    error_message: null,
    created_at: '2026-06-09T00:00:00.000Z',
    updated_at: '2026-06-09T00:00:00.000Z',
    started_at: null,
    completed_at: null,
    ...overrides,
  }
}

const successAttempt = {
  id: 'job-1',
  providerStatus: 'succeeded',
  providerResultUrl: 'https://cdn.example/out.mp4?X-Amz-Signature=secret',
  outputAssetId: 'asset-1',
  outputR2Key: 'video-generation/job-1/output.mp4',
  outputSha256: 'a'.repeat(64),
  actualCostCents: 99,
}

function expectMarker(job: object, applied: boolean) {
  const descriptor = Object.getOwnPropertyDescriptor(job, videoGenerationTransitionApplied)
  expect(descriptor?.value).toBe(applied)
  expect(descriptor?.enumerable).toBe(false)
  expect(videoGenerationTransitionWasApplied(job)).toBe(applied)
  expect(Object.keys(job).join(' ')).not.toContain('transition')
  const serialized = JSON.stringify(job)
  expect(serialized).not.toContain('xf.videoGenerationTransitionApplied')
  expect(serialized).not.toContain('transitionApplied')
  expect(videoGenerationTransitionWasApplied({ ...job })).toBe(false)
}

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
      liability_state: 'reserved',
      liability_cents: 250,
      request_fingerprint: 'b'.repeat(64),
      submission_attempted_at: null,
      dispatch_eligible: true,
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
      liabilityState: 'reserved',
      liabilityCents: 250,
      requestFingerprint: 'b'.repeat(64),
      submissionAttemptedAt: null,
      dispatchEligible: true,
      idempotencyKey: 'idem-1',
    })
    expect(videoGenerationTransitionWasApplied(job)).toBe(false)
  })
})

describe('video generation compare-and-swap results', () => {
  beforeEach(() => {
    queryOne.mockReset()
  })

  it('marks a returned success row as the applied transition without exposing the marker', async () => {
    queryOne.mockResolvedValueOnce(jobRow({
      status: 'succeeded',
      provider_status: 'succeeded',
      provider_result_url: 'https://provider.example/output.mp4',
      output_asset_id: 'asset-1',
      output_r2_key: 'video-generation/job-1/output.mp4',
      output_sha256: 'a'.repeat(64),
      actual_cost_cents: 99,
      liability_state: 'reported',
      liability_cents: 99,
    }))

    const job = await markVideoGenerationJobSucceeded(successAttempt)

    expectMarker(job, true)
    expect(job).toMatchObject({
      status: 'succeeded',
      outputAssetId: 'asset-1',
      outputR2Key: 'video-generation/job-1/output.mp4',
      outputSha256: 'a'.repeat(64),
      actualCostCents: 99,
    })
    expect(queryOne).toHaveBeenCalledTimes(1)
    expect(queryOne).toHaveBeenCalledWith(MARK_VIDEO_GENERATION_SUCCEEDED_SQL, [
      'job-1',
      'succeeded',
      successAttempt.providerResultUrl,
      'asset-1',
      'video-generation/job-1/output.mp4',
      99,
      'a'.repeat(64),
    ])
  })

  it('treats a returned row as applied even when output identity is absent', async () => {
    queryOne.mockResolvedValueOnce(jobRow({
      status: 'succeeded',
      provider_status: 'succeeded',
      actual_cost_cents: null,
      output_asset_id: null,
      output_r2_key: null,
      output_sha256: null,
    }))

    const job = await markVideoGenerationJobSucceeded({
      ...successAttempt,
      outputAssetId: null,
      outputR2Key: null,
      outputSha256: null,
      actualCostCents: null,
    })

    expectMarker(job, true)
    expect(job.outputAssetId).toBeNull()
    expect(job.actualCostCents).toBeNull()
    expect(queryOne).toHaveBeenCalledTimes(1)
  })

  it('marks a same-output retry as not applied and keeps the canonical cost', async () => {
    queryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(jobRow({
        status: 'succeeded',
        provider_status: 'succeeded',
        provider_result_url: 'https://provider.example/canonical.mp4',
        output_asset_id: 'asset-1',
        output_r2_key: 'video-generation/job-1/output.mp4',
        output_sha256: 'a'.repeat(64),
        actual_cost_cents: 42,
        liability_state: 'reported',
        liability_cents: 42,
      }))

    const job = await markVideoGenerationJobSucceeded(successAttempt)

    expectMarker(job, false)
    expect(job).toMatchObject({
      status: 'succeeded',
      outputAssetId: 'asset-1',
      outputR2Key: 'video-generation/job-1/output.mp4',
      outputSha256: 'a'.repeat(64),
      actualCostCents: 42,
      providerResultUrl: 'https://provider.example/canonical.mp4',
    })
    expect(JSON.stringify(job)).not.toContain('X-Amz-Signature')
    expect(queryOne).toHaveBeenCalledTimes(2)
    expect(queryOne).toHaveBeenNthCalledWith(2, 'SELECT * FROM video_generation_jobs WHERE id = $1', ['job-1'])
  })

  it('returns the different winning output when the success update misses', async () => {
    queryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(jobRow({
        status: 'succeeded',
        provider_status: 'succeeded',
        output_asset_id: 'canonical-asset',
        output_r2_key: 'canonical/winner.mp4',
        output_sha256: 'b'.repeat(64),
        actual_cost_cents: 7,
        liability_state: 'reported',
        liability_cents: 7,
      }))

    const job = await markVideoGenerationJobSucceeded(successAttempt)

    expectMarker(job, false)
    expect(job).toMatchObject({
      status: 'succeeded',
      outputAssetId: 'canonical-asset',
      outputR2Key: 'canonical/winner.mp4',
      outputSha256: 'b'.repeat(64),
      actualCostCents: 7,
    })
  })

  it('returns the canonical failed or unknown row when success does not apply', async () => {
    queryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(jobRow({
        status: 'failed',
        actual_cost_cents: 80,
        liability_state: 'uncertain',
        liability_cents: 250,
        output_asset_id: null,
        error_message: 'provider_failed',
      }))

    const failed = await markVideoGenerationJobSucceeded(successAttempt)
    expectMarker(failed, false)
    expect(failed).toMatchObject({ status: 'failed', actualCostCents: 80, outputAssetId: null })

    queryOne.mockReset()
    queryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(jobRow({
        status: 'unknown',
        liability_state: 'uncertain',
        actual_cost_cents: null,
      }))

    const unknown = await markVideoGenerationJobSucceeded(successAttempt)
    expectMarker(unknown, false)
    expect(unknown.status).toBe('unknown')
    expect(unknown.actualCostCents).toBeNull()
  })

  it('marks a returned failure row as applied', async () => {
    queryOne.mockResolvedValueOnce(jobRow({
      status: 'failed',
      error_message: 'provider_failed',
      actual_cost_cents: 40,
      liability_state: 'reported',
      liability_cents: 40,
    }))

    const job = await markVideoGenerationJobFailed('job-1', 'provider_failed', 40)

    expectMarker(job, true)
    expect(job).toMatchObject({ status: 'failed', errorMessage: 'provider_failed', actualCostCents: 40 })
    expect(queryOne).toHaveBeenCalledWith(MARK_VIDEO_GENERATION_FAILED_SQL, ['job-1', 'provider_failed', true, 40])
  })

  it('returns the canonical success when a failure update misses', async () => {
    queryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(jobRow({
        status: 'succeeded',
        output_asset_id: 'canonical-asset',
        output_r2_key: 'canonical/winner.mp4',
        actual_cost_cents: 7,
        liability_state: 'reported',
        liability_cents: 7,
      }))

    const job = await markVideoGenerationJobFailed('job-1', 'nsfw https://cdn.example/out.mp4?X-Amz-Signature=secret', 80)

    expectMarker(job, false)
    expect(job).toMatchObject({
      status: 'succeeded',
      outputAssetId: 'canonical-asset',
      actualCostCents: 7,
      errorMessage: null,
    })
    expect(JSON.stringify(job)).not.toContain('nsfw')
    expect(JSON.stringify(job)).not.toContain('X-Amz-Signature')
  })

  it('rejects when neither the update nor the current read finds the job', async () => {
    queryOne.mockResolvedValue(null)

    await expect(markVideoGenerationJobSucceeded(successAttempt)).rejects.toThrow('video generation job job-1 not found')
    expect(queryOne).toHaveBeenCalledTimes(2)
  })
})
