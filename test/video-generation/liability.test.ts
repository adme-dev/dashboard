import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  CLAIM_VIDEO_GENERATION_SUBMISSION_SQL,
  GLOBAL_VIDEO_GENERATION_LIABILITY_SUM_SQL,
  MARK_VIDEO_GENERATION_FAILED_SQL,
  MARK_VIDEO_GENERATION_RUNNING_SQL,
  MARK_VIDEO_GENERATION_SUCCEEDED_SQL,
  MARK_VIDEO_GENERATION_UNKNOWN_SQL,
  PROJECT_VIDEO_GENERATION_LIABILITY_SUM_SQL,
  TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL,
  explicitActualCostCents,
  fingerprintSourceFromJobRow,
  initialVideoGenerationLiability,
  liabilityAfterKnownFailure,
  normalizeVideoGenerationRequestFingerprint,
  videoGenerationLiabilityCountsInTenantMonth,
  videoGenerationRequestFingerprint
} from '~~/shared/video/generationLiability'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const request = {
  actorId: 'user-1',
  projectId: 'project-1',
  timelineId: 'timeline-1',
  mode: 'image-to-video',
  modelId: 'aigateway/seedance-i2v',
  provider: 'aigateway',
  prompt: 'subtle reveal',
  sourceAssetIds: ['asset-b', 'asset-a'],
  durationSeconds: 5,
  aspectRatio: '16:9',
  resolution: '720p',
  subjectType: 'vehicle',
  dispatchEligible: true
}

describe('video generation liability', () => {
  it('preserves prompt bytes and ordered sources without treating price as identity', async () => {
    const first = await videoGenerationRequestFingerprint(request)
    const reordered = await videoGenerationRequestFingerprint({
      ...request,
      prompt: '  subtle   reveal ',
      sourceAssetIds: ['asset-a', 'asset-b', 'asset-a']
    })
    const changed = await videoGenerationRequestFingerprint({ ...request, prompt: 'different reveal' })
    const otherActor = await videoGenerationRequestFingerprint({ ...request, actorId: 'user-2' })
    const held = await videoGenerationRequestFingerprint({ ...request, dispatchEligible: false })

    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(reordered).not.toBe(first)
    expect(changed).not.toBe(first)
    expect(otherActor).not.toBe(first)
    expect(held).not.toBe(first)
    expect(Object.keys(normalizeVideoGenerationRequestFingerprint(request))).not.toContain('estimatedCostCents')
    expect(normalizeVideoGenerationRequestFingerprint(request).sourceAssetIds).toEqual(['asset-b', 'asset-a'])
  })

  it('does not log the prompt while fingerprinting', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await videoGenerationRequestFingerprint({ ...request, prompt: 'secret prompt text' })
      const written = [spy, info, log].flatMap(item => item.mock.calls.map(call => JSON.stringify(call)))
      expect(written.join('\n')).not.toContain('secret prompt text')
    } finally {
      spy.mockRestore()
      info.mockRestore()
      log.mockRestore()
    }
  })

  it('rebuilds a pre-existing row fingerprint from stored columns', async () => {
    const fingerprint = await videoGenerationRequestFingerprint(request)
    const fromRow = await videoGenerationRequestFingerprint(fingerprintSourceFromJobRow({
      created_by: request.actorId,
      project_id: request.projectId,
      timeline_id: request.timelineId,
      mode: request.mode,
      model_id: request.modelId,
      provider: request.provider,
      prompt: request.prompt,
      source_asset_ids: JSON.stringify(['asset-b', 'asset-a']),
      duration_seconds: request.durationSeconds,
      aspect_ratio: request.aspectRatio,
      resolution: request.resolution,
      subject_type: request.subjectType,
      dispatch_eligible: true
    }))
    expect(fromRow).toBe(fingerprint)
  })

  it('keeps unresolved liability across a month boundary and months reported history', () => {
    const created = new Date('2026-01-31T23:00:00.000Z')
    const february = new Date('2026-02-01T00:00:00.000Z')
    expect(videoGenerationLiabilityCountsInTenantMonth({
      liabilityState: 'reserved', createdAt: created, completedAt: null, now: february
    })).toBe(true)
    expect(videoGenerationLiabilityCountsInTenantMonth({
      liabilityState: 'uncertain', createdAt: created, completedAt: null, now: february
    })).toBe(true)
    expect(videoGenerationLiabilityCountsInTenantMonth({
      liabilityState: 'reported', createdAt: created, completedAt: created, now: february
    })).toBe(false)
    expect(videoGenerationLiabilityCountsInTenantMonth({
      liabilityState: 'reported', createdAt: created, completedAt: february, now: february
    })).toBe(true)
    expect(videoGenerationLiabilityCountsInTenantMonth({
      liabilityState: 'reported', createdAt: february, completedAt: null, now: february
    })).toBe(true)
    expect(videoGenerationLiabilityCountsInTenantMonth({
      liabilityState: 'released', createdAt: february, completedAt: february, now: february
    })).toBe(false)

    for (const sql of [
      TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL,
      GLOBAL_VIDEO_GENERATION_LIABILITY_SUM_SQL
    ]) {
      expect(sql).toContain('liability_state IN (\'reserved\', \'uncertain\')')
      expect(sql).toContain('liability_state = \'reported\'')
      expect(sql).toContain('AT TIME ZONE \'UTC\'')
      expect(sql).not.toContain('created_at >= date_trunc')
      expect(sql).not.toContain('status IN (\'queued\',\'running\',\'succeeded\')')
    }
    expect(PROJECT_VIDEO_GENERATION_LIABILITY_SUM_SQL).toContain('project_id = $1')
    expect(PROJECT_VIDEO_GENERATION_LIABILITY_SUM_SQL).not.toContain('date_trunc')
    expect(PROJECT_VIDEO_GENERATION_LIABILITY_SUM_SQL).toContain('liability_state <> \'released\'')
    expect(TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL).not.toContain('project_id')
  })

  it('retains charged failures and releases only an unclaimed pre-submit failure', () => {
    expect(initialVideoGenerationLiability({ status: 'failed', estimatedCostCents: 50, actualCostCents: null }))
      .toEqual({ liabilityState: 'uncertain', liabilityCents: 50 })
    expect(initialVideoGenerationLiability({ status: 'failed', estimatedCostCents: 50, actualCostCents: 20 }))
      .toEqual({ liabilityState: 'reported', liabilityCents: 20 })
    expect(initialVideoGenerationLiability({ status: 'blocked', estimatedCostCents: 50, actualCostCents: null }))
      .toEqual({ liabilityState: 'released', liabilityCents: 0 })
    expect(initialVideoGenerationLiability({ status: 'blocked', estimatedCostCents: 50, actualCostCents: 7 }))
      .toEqual({ liabilityState: 'reported', liabilityCents: 7 })
    expect(initialVideoGenerationLiability({ status: 'succeeded', estimatedCostCents: 50, actualCostCents: null }))
      .toEqual({ liabilityState: 'uncertain', liabilityCents: 50 })
    expect(initialVideoGenerationLiability({ status: 'queued', estimatedCostCents: 50, actualCostCents: null }))
      .toEqual({ liabilityState: 'reserved', liabilityCents: 50 })

    expect(explicitActualCostCents(0)).toBe(0)
    expect(explicitActualCostCents(null)).toBeNull()
    expect(liabilityAfterKnownFailure({
      status: 'queued', submissionAttempted: false, providerRequestId: null,
      estimatedCostCents: 50, currentLiabilityCents: 50, actualCostCents: null
    })).toMatchObject({ liabilityState: 'released', liabilityCents: 0 })
    expect(liabilityAfterKnownFailure({
      status: 'queued', submissionAttempted: true, providerRequestId: null,
      estimatedCostCents: 50, currentLiabilityCents: 50, actualCostCents: null
    })).toMatchObject({ liabilityState: 'uncertain', liabilityCents: 50 })
    expect(liabilityAfterKnownFailure({
      status: 'running', submissionAttempted: true, providerRequestId: 'req',
      estimatedCostCents: 50, currentLiabilityCents: 50, actualCostCents: null
    })).toMatchObject({ liabilityState: 'uncertain', liabilityCents: 50 })
    expect(liabilityAfterKnownFailure({
      status: 'running', submissionAttempted: true, providerRequestId: 'req',
      estimatedCostCents: 50, currentLiabilityCents: 50, actualCostCents: 0
    })).toMatchObject({ liabilityState: 'reported', liabilityCents: 0, explicitActual: 0 })
    expect(liabilityAfterKnownFailure({
      status: 'running', submissionAttempted: true, providerRequestId: 'req',
      estimatedCostCents: 50, currentLiabilityCents: 50, actualCostCents: 80
    })).toMatchObject({ liabilityState: 'reported', liabilityCents: 80 })
  })

  it('fences claims and terminal writes in one statement shared by Pages and the worker', () => {
    expect(CLAIM_VIDEO_GENERATION_SUBMISSION_SQL).toContain('status = \'queued\'')
    expect(CLAIM_VIDEO_GENERATION_SUBMISSION_SQL).toContain('submission_attempted_at IS NULL')
    expect(CLAIM_VIDEO_GENERATION_SUBMISSION_SQL).toContain('dispatch_eligible = true')
    expect(CLAIM_VIDEO_GENERATION_SUBMISSION_SQL).toContain('liability_state = \'uncertain\'')
    expect(MARK_VIDEO_GENERATION_RUNNING_SQL).toContain('submission_attempted_at IS NOT NULL')
    expect(MARK_VIDEO_GENERATION_RUNNING_SQL).not.toContain('\'succeeded\'')
    expect(MARK_VIDEO_GENERATION_SUCCEEDED_SQL).toContain('status IN (\'queued\', \'running\', \'unknown\')')
    expect(MARK_VIDEO_GENERATION_SUCCEEDED_SQL).not.toContain('\'failed\'')
    expect(MARK_VIDEO_GENERATION_UNKNOWN_SQL).toContain('status IN (\'queued\', \'running\', \'unknown\')')
    expect(MARK_VIDEO_GENERATION_UNKNOWN_SQL).toContain('liability_state = \'uncertain\'')
    expect(MARK_VIDEO_GENERATION_UNKNOWN_SQL).toContain('provider_request_id = COALESCE($3, provider_request_id)')
    expect(MARK_VIDEO_GENERATION_FAILED_SQL).toContain('status NOT IN (\'succeeded\', \'failed\')')
    expect(MARK_VIDEO_GENERATION_FAILED_SQL).toContain('THEN \'reported\'')
    expect(MARK_VIDEO_GENERATION_FAILED_SQL).toContain('THEN \'released\'')
    expect(MARK_VIDEO_GENERATION_FAILED_SQL).toContain('ELSE \'uncertain\'')
    expect(MARK_VIDEO_GENERATION_FAILED_SQL).toContain('submission_attempted_at IS NULL')

    const jobs = source('server/utils/video-generation/jobs.ts')
    const workerDb = source('workers/video-generation/src/db.ts')
    const cron = source('server/api/cron/video-generation-reconcile.post.ts')
    for (const sqlName of [
      'CLAIM_VIDEO_GENERATION_SUBMISSION_SQL',
      'MARK_VIDEO_GENERATION_FAILED_SQL',
      'MARK_VIDEO_GENERATION_SUCCEEDED_SQL',
      'MARK_VIDEO_GENERATION_UNKNOWN_SQL'
    ]) {
      expect(jobs).toContain(sqlName)
      expect(workerDb).toContain(sqlName)
    }
    expect(cron).toContain('UNCLAIMED_VIDEO_GENERATION_DISPATCH_SQL')
    expect(cron).toContain('RETAINED_VIDEO_GENERATION_RUNNING_SQL')
    expect(cron).not.toContain('timed out — no completion')
  })

  it('backfills historical failed rows as uncertain estimates and releases only unbilled blocks', () => {
    const migration = source('server/database/migrations/506_video_generation_liability.sql')
    expect(migration).toContain('WHEN status = \'failed\' THEN \'uncertain\'')
    expect(migration).toContain('WHEN status = \'blocked\' THEN \'released\'')
    expect(migration).toContain('WHEN status = \'blocked\' THEN false')
    expect(migration).toContain('WHEN actual_cost_cents IS NOT NULL THEN actual_cost_cents')
    expect(migration).toContain('WHEN actual_cost_cents IS NOT NULL THEN \'reported\'')
    expect(migration).toContain('WHEN status = \'succeeded\' THEN \'uncertain\'')
    expect(migration).toContain('WHEN status IN (\'queued\', \'running\') THEN \'uncertain\'')
    expect(migration).not.toMatch(/status = 'failed' THEN 'released'/)
    expect(migration).not.toMatch(/status = 'failed' THEN 0/)
    expect(migration).toContain('\'unknown\'')
    expect(migration).toContain('submission_attempted_at')
    expect(migration).toContain('dispatch_eligible')
    expect(migration).toContain('request_fingerprint')
  })
})
