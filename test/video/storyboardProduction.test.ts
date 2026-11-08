import { describe, expect, it, vi } from 'vitest'
import {
  deriveShotProductionStage,
  isShotProductionPinCurrent,
  normalizeShotProductionOperationBody,
  ShotProductionNormalizedRequestSchema,
  shotProductionDurationSeconds,
  verifiedShotProductionArtifactHash,
  type ReserveShotProductionRequest,
  type ShotProductionNormalizedRequest,
  type ShotProductionRevisionPin
} from '../../shared/video/storyboardProduction'
import {
  isStoryboardProductionEnabled,
  readStoryboardProductionFlags
} from '../../server/utils/video-storyboard/productionPolicy'
import {
  getProjectProductionAllowanceIn,
  setProjectProductionAllowanceIn
} from '../../server/utils/video-storyboard/productionBudget'
import {
  approveShotArtifactIn,
  cancelShotAttemptIn,
  getShotProductionAttemptIn,
  mapShotProductionAttemptRow,
  reserveShotAttemptIn,
  shotProductionOperationRequestHash,
  shotProductionRequestFingerprint
} from '../../server/utils/video-storyboard/production'
import { storyboardHash } from '../../server/utils/video-storyboard/hash'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const hash = (char: string) => char.repeat(64)

function operation(
  overrides: Partial<ReserveShotProductionRequest & { actorId: string }> = {}
): ReserveShotProductionRequest & { actorId: string } {
  return {
    projectId: id(1),
    actorId: id(2),
    shotId: id(3),
    expectedRevision: id(4),
    operationId: id(5),
    modelId: 'aigateway/seedance-i2v',
    sourceAssetIds: [id(6)],
    prompt: 'Slow product reveal',
    ...overrides
  }
}

function normalizedRequest(overrides: Partial<ShotProductionNormalizedRequest> = {}): ShotProductionNormalizedRequest {
  return ShotProductionNormalizedRequestSchema.parse({
    schemaVersion: 1,
    tenantId: id(10),
    projectId: id(1),
    actorId: id(2),
    operationId: id(5),
    storyboardRevisionId: id(4),
    referenceSetId: id(7),
    shotId: id(3),
    planHash: hash('a'),
    copyHash: hash('b'),
    sourceHash: hash('c'),
    referenceContentHash: hash('d'),
    shotHash: hash('e'),
    recipeId: 'dealer-offer-9x16',
    recipeVersion: 1,
    modelId: 'aigateway/seedance-i2v',
    provider: 'aigateway',
    providerModelRevision: null,
    actualSeed: null,
    mode: 'image-to-video',
    prompt: 'Slow product reveal',
    sourcePins: [{ assetId: id(6), role: 'product', contentHash: hash('f') }],
    durationSeconds: 5,
    aspectRatio: '9:16',
    resolution: '720p',
    subjectType: 'vehicle',
    complianceStatus: 'vehicle_i2v',
    complianceReasons: ['Approved source asset present.'],
    currency: 'USD',
    estimatedCents: 150,
    ...overrides
  })
}

function pin(overrides: Partial<ShotProductionRevisionPin> = {}): ShotProductionRevisionPin {
  return {
    storyboardRevisionId: id(4),
    referenceSetId: id(7),
    planHash: hash('a'),
    copyHash: hash('b'),
    sourceHash: hash('c'),
    referenceContentHash: hash('d'),
    shotHash: hash('e'),
    ...overrides
  }
}

describe('storyboard production feature policy', () => {
  it.each([
    [undefined, false], [null, false], ['', false], ['false', false],
    ['TRUE', false], [true, false], ['true', true]
  ])('requires the exact opt-in string for %s', (value, expected) => {
    expect(isStoryboardProductionEnabled(value)).toBe(expected)
  })

  it('uses local flags only when Cloudflare bindings are unavailable', () => {
    expect(readStoryboardProductionFlags(undefined, {
      VIDEO_STORYBOARD_PRODUCTION_ENABLED: 'true',
      VIDEO_STORYBOARD_ENABLED: 'true',
      VIDEO_GENERATION_ENABLED: 'true'
    })).toEqual({ production: true, storyboard: true, generation: true })
  })

  it('never lets a local true override a deployed binding', () => {
    const local = {
      VIDEO_STORYBOARD_PRODUCTION_ENABLED: 'true',
      VIDEO_STORYBOARD_ENABLED: 'true',
      VIDEO_GENERATION_ENABLED: 'true'
    }
    expect(readStoryboardProductionFlags({
      VIDEO_STORYBOARD_PRODUCTION_ENABLED: 'false',
      VIDEO_STORYBOARD_ENABLED: 'true',
      VIDEO_GENERATION_ENABLED: 'false'
    }, local)).toEqual({ production: false, storyboard: true, generation: false })
    expect(readStoryboardProductionFlags({}, local).production).toBe(false)
  })
})

describe('storyboard production request identity', () => {
  it('normalizes the exact operation body before pricing', () => {
    expect(normalizeShotProductionOperationBody(operation({ prompt: undefined }))).toMatchObject({
      prompt: null,
      shotId: id(3),
      actorId: id(2)
    })
    expect(shotProductionOperationRequestHash(operation())).toBe(shotProductionOperationRequestHash(operation()))
  })

  it.each([
    ['model', { modelId: 'aigateway/wan-i2v' }],
    ['source', { sourceAssetIds: [id(99)] }],
    ['prompt', { prompt: 'Different direction' }],
    ['actor', { actorId: id(99) }],
    ['shot', { shotId: id(99) }],
    ['expected revision', { expectedRevision: id(99) }]
  ])('changes the replay hash when the %s changes', (_name, override) => {
    expect(shotProductionOperationRequestHash(operation(override)))
      .not.toBe(shotProductionOperationRequestHash(operation()))
  })

  it('ties the full fingerprint to the quote and immutable request evidence', () => {
    const request = normalizedRequest()
    expect(shotProductionRequestFingerprint(request)).toBe(shotProductionRequestFingerprint({ ...request }))
    expect(shotProductionRequestFingerprint(normalizedRequest({ estimatedCents: 175 })))
      .not.toBe(shotProductionRequestFingerprint(request))
    expect(shotProductionRequestFingerprint(normalizedRequest({ referenceContentHash: hash('9') })))
      .not.toBe(shotProductionRequestFingerprint(request))
  })

  it('requires exact whole-second editorial timing supported by the model', () => {
    expect(shotProductionDurationSeconds({ durationFrames: 150 }, 30, [5, 10])).toBe(5)
    expect(shotProductionDurationSeconds({ durationFrames: 151 }, 30, [5, 10])).toBeNull()
    expect(shotProductionDurationSeconds({ durationFrames: 120 }, 30, [5, 10])).toBeNull()
  })
})

describe('storyboard production stale fences and review state', () => {
  it('accepts only the exact revision/copy/reference/shot pin', () => {
    const current = pin()
    expect(isShotProductionPinCurrent(current, { ...current })).toBe(true)
    for (const override of [
      { storyboardRevisionId: id(99) },
      { referenceSetId: id(99) },
      { copyHash: hash('1') },
      { sourceHash: hash('2') },
      { referenceContentHash: hash('3') },
      { shotHash: hash('4') }
    ]) {
      expect(isShotProductionPinCurrent(pin(override), current)).toBe(false)
    }
  })

  it('keeps execution and human review states separate', () => {
    expect(deriveShotProductionStage('ready', 'unreviewed')).toBe('needs_review')
    expect(deriveShotProductionStage('ready', 'approved')).toBe('approved')
    expect(deriveShotProductionStage('unknown', 'unreviewed')).toBe('unknown')
    expect(deriveShotProductionStage('cancelled', 'stale')).toBe('cancelled')
  })
})

describe('storyboard production artifact evidence', () => {
  const evidence = {
    jobId: id(20),
    jobStatus: 'succeeded',
    jobOutputAssetId: id(21),
    jobOutputR2Key: 'video/final.mp4',
    assetId: id(21),
    assetSourceJobId: id(20),
    assetR2Key: 'video/final.mp4',
    artifactSha256: hash('a')
  }

  it('accepts only a succeeded job with one matching durable asset and trusted hash', () => {
    expect(verifiedShotProductionArtifactHash(evidence)).toBe(hash('a'))
  })

  it.each([
    ['running job', { jobStatus: 'running' }],
    ['missing hash', { artifactSha256: null }],
    ['wrong asset', { assetId: id(99) }],
    ['unlinked asset', { assetSourceJobId: id(99) }],
    ['missing durable key', { jobOutputR2Key: null }],
    ['different durable key', { assetR2Key: 'video/other.mp4' }]
  ])('rejects %s', (_name, override) => {
    expect(verifiedShotProductionArtifactHash({ ...evidence, ...override })).toBeNull()
  })
})

describe('storyboard production persistence mapping', () => {
  it('keeps unknown provider metadata and reported cost null', () => {
    const request = normalizedRequest()
    const row = {
      id: id(30),
      project_id: request.projectId,
      job_id: id(20),
      job_provider_request_id: null,
      shot_id: request.shotId,
      storyboard_revision_id: request.storyboardRevisionId,
      reference_set_id: request.referenceSetId,
      plan_hash: request.planHash,
      copy_hash: request.copyHash,
      source_hash: request.sourceHash,
      reference_content_hash: request.referenceContentHash,
      shot_hash: request.shotHash,
      operation_id: request.operationId,
      request_hash: hash('1'),
      request_fingerprint: hash('2'),
      request_snapshot: request,
      model_id: request.modelId,
      provider: request.provider,
      provider_model_revision: null,
      actual_seed: null,
      recipe_id: request.recipeId,
      recipe_version: request.recipeVersion,
      estimated_cents: request.estimatedCents,
      job_actual_cost_cents: null,
      job_liability_state: 'uncertain',
      job_liability_cents: request.estimatedCents,
      execution_state: 'unknown',
      review_state: 'unreviewed',
      artifact_sha256: null,
      job_status: 'running',
      job_submission_attempted_at: '2026-11-08T00:00:00.000Z',
      created_by: request.actorId,
      created_at: '2026-11-08T00:00:00.000Z',
      updated_at: '2026-11-08T00:00:00.000Z',
      ready_at: null,
      cancelled_at: null,
      reviewed_at: null
    }
    const attempt = mapShotProductionAttemptRow(row)
    expect(attempt).toMatchObject({
      providerModelRevision: null,
      actualSeed: null,
      reportedCents: null,
      liabilityState: 'uncertain',
      liabilityCents: 150,
      stage: 'unknown'
    })
  })

  it('fails closed to a zero project allowance when no ceiling is configured', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await expect(getProjectProductionAllowanceIn(db as never, id(1))).resolves.toMatchObject({
      allowanceCents: 0,
      configured: false,
      currency: 'USD'
    })
  })
})

describe('storyboard production mutation safety', () => {
  const actor = { id: id(2), role: 'admin' }

  function attemptRow(overrides: Record<string, unknown> = {}) {
    const request = normalizedRequest()
    return {
      id: id(30),
      project_id: request.projectId,
      job_id: id(20),
      job_provider_request_id: null,
      shot_id: request.shotId,
      storyboard_revision_id: request.storyboardRevisionId,
      reference_set_id: request.referenceSetId,
      plan_hash: request.planHash,
      copy_hash: request.copyHash,
      source_hash: request.sourceHash,
      reference_content_hash: request.referenceContentHash,
      shot_hash: request.shotHash,
      operation_id: request.operationId,
      request_hash: hash('1'),
      request_fingerprint: hash('2'),
      request_snapshot: request,
      model_id: request.modelId,
      provider: request.provider,
      provider_model_revision: null,
      actual_seed: null,
      recipe_id: request.recipeId,
      recipe_version: request.recipeVersion,
      estimated_cents: request.estimatedCents,
      job_actual_cost_cents: null,
      job_liability_state: 'reserved',
      job_liability_cents: request.estimatedCents,
      execution_state: 'queued',
      review_state: 'unreviewed',
      artifact_sha256: null,
      job_status: 'queued',
      job_submission_attempted_at: null,
      job_output_asset_id: null,
      job_output_r2_key: null,
      job_output_sha256: null,
      asset_id: null,
      asset_source_job_id: null,
      asset_r2_key: null,
      created_by: request.actorId,
      created_at: '2026-11-08T00:00:00.000Z',
      updated_at: '2026-11-08T00:00:00.000Z',
      ready_at: null,
      cancelled_at: null,
      reviewed_at: null,
      ...overrides
    }
  }

  function successfulOutput(overrides: Record<string, unknown> = {}) {
    return attemptRow({
      job_status: 'succeeded',
      job_output_asset_id: id(21),
      job_output_r2_key: 'video/final.mp4',
      job_output_sha256: hash('a'),
      asset_id: id(21),
      asset_source_job_id: id(20),
      asset_r2_key: 'video/final.mp4',
      ...overrides
    })
  }

  function baseProductionQuery(sql: string, attempt?: ReturnType<typeof attemptRow>, clientId = id(10)) {
    if (sql.includes('FROM team_members WHERE')) return { rows: [{ user_role: 'admin', custom_role_id: null }] }
    if (sql.includes('FROM custom_roles WHERE')) return { rows: [{ id: id(40), is_read_only: false }] }
    if (sql.includes('FROM role_permission_groups')) return { rows: [] }
    if (sql.includes('FROM team_members tm')) {
      return { rows: [{ role: 'admin', custom_read_only: false }] }
    }
    if (sql.includes('FROM media_projects')) {
      return { rows: [{ id: id(1), client_id: clientId, created_by: actor.id, media_type: 'av' }] }
    }
    if (sql.includes('FROM agency_clients')) return { rows: [{ is_active: true }] }
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] }
    if (attempt && sql.includes('FROM video_storyboard_shot_attempts a')) return { rows: [attempt] }
    return undefined
  }

  it.each(['reserve', 'cancel', 'set allowance'] as const)('rejects a project rehome before %s', async (operationName) => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM team_members tm')) return { rows: [{ role: 'admin', custom_read_only: false }] }
      if (sql.includes('FROM media_projects')) {
        return { rows: [{ id: id(1), client_id: sql.includes('FOR UPDATE') ? id(11) : id(10), created_by: actor.id, media_type: 'av' }] }
      }
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] }
      throw new Error(`Unexpected query after rehome: ${sql}`)
    })
    const db = { query }
    const request = operation()
    const mutation = operationName === 'reserve'
      ? reserveShotAttemptIn(db as never, { ...request, actor })
      : operationName === 'cancel'
        ? cancelShotAttemptIn(db as never, { projectId: id(1), attemptId: id(30), actor })
        : setProjectProductionAllowanceIn(db as never, { projectId: id(1), allowanceCents: 500, actor })

    await expect(mutation).rejects.toMatchObject({ statusCode: 409 })
    const advisory = query.mock.calls.find(([sql]) => sql.includes('pg_advisory_xact_lock'))
    expect(advisory?.[1]).toEqual([id(10)])
    expect(query).toHaveBeenCalledTimes(4)
  })

  it.each(['cancel', 'set allowance'] as const)('rejects role revocation at the transaction fence before %s', async (operationName) => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM team_members WHERE')) return { rows: [{ user_role: 'viewer', custom_role_id: null }] }
      const base = baseProductionQuery(sql)
      if (base) return base
      throw new Error(`Unexpected write after revocation: ${sql}`)
    })
    const mutation = operationName === 'cancel'
      ? cancelShotAttemptIn({ query } as never, { projectId: id(1), attemptId: id(30), actor })
      : setProjectProductionAllowanceIn({ query } as never, { projectId: id(1), allowanceCents: 500, actor })
    await expect(mutation).rejects.toMatchObject({ statusCode: 403 })
    expect(query.mock.calls.some(([sql]) => /^(UPDATE|INSERT)/.test(sql.trim()))).toBe(false)
  })

  it.each(['queued', 'running', 'unknown'] as const)('moves a %s attempt to ready from canonical success during status', async (executionState) => {
    const row = successfulOutput({ execution_state: executionState })
    const query = vi.fn(async (sql: string) => {
      const base = baseProductionQuery(sql, row)
      if (base) return base
      if (sql.includes('SET execution_state = \'ready\'')) {
        return { rows: [{ ready_at: '2026-11-08T01:00:00.000Z', updated_at: '2026-11-08T01:00:00.000Z' }] }
      }
      throw new Error(`Unexpected status query: ${sql}`)
    })

    const result = await getShotProductionAttemptIn({ query } as never, { projectId: id(1), attemptId: id(30), actor })

    expect(result).toMatchObject({ executionState: 'ready', stage: 'needs_review', artifactSha256: hash('a') })
    const statements = query.mock.calls.map(([sql]) => sql)
    expect(statements.find(sql => sql.includes('FROM media_projects'))).toContain('FOR UPDATE')
    expect(statements.find(sql => sql.includes('FROM video_storyboard_shot_attempts a'))).toContain('FOR UPDATE OF a, j')
    expect(statements.find(sql => sql.includes('SET execution_state = \'ready\''))).toContain('execution_state IN (\'queued\', \'running\', \'unknown\')')
  })

  it.each(['running', 'unknown', 'failed', 'blocked'] as const)('reflects canonical %s without releasing liability during status', async (jobStatus) => {
    const row = attemptRow({ job_status: jobStatus, job_liability_state: 'uncertain', job_liability_cents: 150 })
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      const base = baseProductionQuery(sql, row)
      if (base) return base
      if (sql.includes('SET execution_state = $2')) {
        expect(params).toEqual([id(30), jobStatus === 'blocked' ? 'failed' : jobStatus])
        return { rows: [{ updated_at: '2026-11-08T01:00:00.000Z' }] }
      }
      throw new Error(`Unexpected status query: ${sql}`)
    })
    const result = await getShotProductionAttemptIn({ query } as never, { projectId: id(1), attemptId: id(30), actor })
    expect(result).toMatchObject({ executionState: jobStatus === 'blocked' ? 'failed' : jobStatus, liabilityState: 'uncertain', liabilityCents: 150 })
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE video_generation_jobs'))).toBe(false)
  })

  it('never revives a cancelled attempt during status synchronization', async () => {
    const row = successfulOutput({ execution_state: 'cancelled', cancelled_at: '2026-11-08T00:30:00.000Z' })
    const query = vi.fn(async (sql: string) => baseProductionQuery(sql, row) ?? { rows: [] })

    const result = await getShotProductionAttemptIn({ query } as never, { projectId: id(1), attemptId: id(30), actor })

    expect(result.executionState).toBe('cancelled')
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false)
  })

  it('does not approve an attempt artifact hash without canonical output_sha256', async () => {
    const row = successfulOutput({ execution_state: 'ready', job_output_sha256: null, artifact_sha256: hash('b') })
    const query = vi.fn(async (sql: string) => baseProductionQuery(sql, row) ?? { rows: [] })

    await expect(approveShotArtifactIn({ query } as never, {
      projectId: id(1),
      attemptId: id(30),
      expectedRevision: id(4),
      expectedShotRevision: { revisionId: id(4), shotHash: hash('e') },
      artifactHash: hash('b'),
      actor
    })).rejects.toMatchObject({ statusCode: 409, statusMessage: 'artifact evidence unavailable' })
    expect(query.mock.calls.some(([sql]) => sql.includes('video_storyboard_shot_approvals'))).toBe(false)
  })

  it('rejects cancellation when the canonical job already succeeded', async () => {
    const row = successfulOutput()
    const query = vi.fn(async (sql: string) => baseProductionQuery(sql, row) ?? { rows: [] })

    await expect(cancelShotAttemptIn({ query } as never, { projectId: id(1), attemptId: id(30), actor }))
      .rejects.toMatchObject({ statusCode: 409, statusMessage: 'Succeeded production cannot be cancelled' })
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false)
  })

  it('retains uncertain claimed liability when cancelling dispatch', async () => {
    const row = attemptRow({
      job_liability_state: 'uncertain',
      job_submission_attempted_at: '2026-11-08T00:15:00.000Z',
      job_provider_request_id: 'provider-request-1'
    })
    let attemptReads = 0
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM video_storyboard_shot_attempts a')) {
        attemptReads += 1
        return { rows: [attemptReads === 1 ? row : { ...row, execution_state: 'cancelled', cancelled_at: '2026-11-08T00:45:00.000Z' }] }
      }
      const base = baseProductionQuery(sql)
      if (base) return base
      if (sql.includes('error_message = \'Cancelled before submission\'')) return { rows: [] }
      if (sql.startsWith('UPDATE')) return { rows: [{}] }
      throw new Error(`Unexpected cancellation query: ${sql}`)
    })

    const result = await cancelShotAttemptIn({ query } as never, { projectId: id(1), attemptId: id(30), actor })

    expect(result).toMatchObject({ executionState: 'cancelled', liabilityState: 'uncertain', liabilityCents: 150 })
    const release = query.mock.calls.find(([sql]) => sql.includes('error_message = \'Cancelled before submission\''))?.[0]
    expect(release).toContain('liability_state = \'reserved\'')
    expect(release).toContain('provider_request_id IS NULL')
    const claimedUpdate = query.mock.calls.find(([sql]) => sql.includes('WHEN liability_state = \'reserved\' THEN \'uncertain\''))?.[0]
    expect(claimedUpdate).not.toContain('liability_state = \'released\'')
    expect(claimedUpdate).not.toContain('liability_cents = 0')
  })

  it('rechecks source revocation after canonical actor and dependency fences', async () => {
    const sourceRow = {
      id: id(6),
      client_id: id(10),
      created_by: actor.id,
      status: 'approved',
      updated_at: '2026-11-08T00:00:00.000Z',
      source_system: null,
      source_asset_ref: null,
      subject_type: 'vehicle',
      source_metadata: null,
      metadata: null,
      r2_key: 'source/image.png'
    }
    const object = { etag: 'source-etag', size: 123, contentType: 'image/png' }
    const referenceContentHash = storyboardHash({
      record: {
        id: id(6), kind: 'source_asset', clientId: id(10), updatedAt: sourceRow.updated_at,
        canvas: null, brand: null,
        source: { system: null, ref: null, subjectType: 'vehicle', metadata: null }
      },
      key: sourceRow.r2_key,
      object
    })
    const reference = {
      role: 'product', sourceKind: 'source_asset', assetId: id(6), identityKind: 'record_and_object',
      decision: 'approved', contentHash: referenceContentHash,
      approval: { actorId: actor.id, approvedAt: '2026-11-08T00:00:00.000Z', contentHash: referenceContentHash, evidence: null }
    }
    const shot = {
      id: id(3), durationFrames: 150, referenceRoles: ['product'], visualDirection: 'Slow product reveal',
      visual: { status: 'bound', sourceKind: 'source_asset', assetId: id(6), contentHash: referenceContentHash }
    }
    const copyHash = storyboardHash({ scriptSegments: [], cues: [] })
    const plan = {
      referenceSetRevisionId: id(7), shots: [shot], fps: 30, targetFormat: 'reels_9x16',
      copy: {
        scriptSegments: [], cues: [], contentHash: copyHash,
        approval: { actorId: actor.id, approvedAt: '2026-11-08T00:00:00.000Z', contentHash: copyHash }
      }
    }
    const currentPin = {
      storyboardRevisionId: id(4), referenceSetId: id(7), planHash: hash('a'), copyHash,
      sourceHash: hash('c'), referenceContentHash: hash('d'), shotHash: storyboardHash(shot)
    }
    const row = successfulOutput({
      execution_state: 'queued',
      storyboard_revision_id: currentPin.storyboardRevisionId,
      reference_set_id: currentPin.referenceSetId,
      plan_hash: currentPin.planHash,
      copy_hash: currentPin.copyHash,
      source_hash: currentPin.sourceHash,
      reference_content_hash: currentPin.referenceContentHash,
      shot_hash: currentPin.shotHash,
      request_snapshot: normalizedRequest({
        ...currentPin,
        sourcePins: [{ assetId: id(6), role: 'product', contentHash: referenceContentHash }]
      })
    })
    let plainSourceReads = 0
    const query = vi.fn(async (sql: string) => {
      const base = baseProductionQuery(sql, row)
      if (base) return base
      if (sql.includes('SET execution_state = \'ready\'')) {
        return { rows: [{ ready_at: '2026-11-08T01:00:00.000Z', updated_at: '2026-11-08T01:00:00.000Z' }] }
      }
      if (sql.includes('SELECT id FROM video_assets')) return { rows: [{ id: row.job_output_asset_id }] }
      if (sql.includes('FROM team_members WHERE')) return { rows: [{ user_role: 'admin', custom_role_id: null }] }
      if (sql.includes('FROM custom_roles WHERE')) return { rows: [{ id: id(40), is_read_only: false }] }
      if (sql.includes('FROM role_permission_groups')) return { rows: [] }
      if (sql.includes('FROM video_storyboards WHERE')) {
        return { rows: [{ id: id(50), project_id: id(1), current_revision_id: id(4), current_reference_set_id: id(7) }] }
      }
      if (sql.includes('FROM video_storyboard_revisions WHERE')) {
        return { rows: [{ id: id(4), project_id: id(1), reference_set_id: id(7), plan, plan_hash: hash('a'), copy_hash: copyHash, source_hash: hash('c') }] }
      }
      if (sql.includes('FROM video_storyboard_reference_sets WHERE')) {
        return { rows: [{ id: id(7), project_id: id(1), reference_data: { references: [reference], brandKit: null }, content_hash: hash('d') }] }
      }
      if (sql.includes('FROM video_gen_source_assets')) {
        if (sql.includes('FOR SHARE')) return { rows: [sourceRow] }
        plainSourceReads += 1
        return { rows: [plainSourceReads === 1 ? sourceRow : { ...sourceRow, status: 'revoked' }] }
      }
      throw new Error(`Unexpected fenced approval query: ${sql}`)
    })
    const head = vi.fn(async () => ({ size: 123, etag: 'source-etag', httpMetadata: { contentType: 'image/png' } }))

    await expect(approveShotArtifactIn({ query } as never, {
      projectId: id(1), attemptId: id(30), expectedRevision: id(4),
      expectedShotRevision: { revisionId: id(4), shotHash: currentPin.shotHash }, actor
    }, { bucket: { head } as never })).rejects.toMatchObject({
      statusCode: 409,
      data: { codes: ['reference_unavailable'] }
    })

    const statements = query.mock.calls.map(([sql]) => sql)
    const firstRemote = statements.findIndex(sql => sql.includes('FROM video_gen_source_assets') && !sql.includes('FOR SHARE'))
    const actorFence = statements.findIndex(sql => sql.includes('FROM team_members WHERE'))
    const sourceFence = statements.findIndex(sql => sql.includes('FROM video_gen_source_assets') && sql.includes('FOR SHARE'))
    const fencedRemote = statements.findIndex((sql, index) => index > sourceFence && sql.includes('FROM video_gen_source_assets') && !sql.includes('FOR SHARE'))
    expect(actorFence).toBeGreaterThan(firstRemote)
    expect(sourceFence).toBeGreaterThan(actorFence)
    expect(fencedRemote).toBeGreaterThan(sourceFence)
    expect(head).toHaveBeenCalledTimes(1)
    expect(query.mock.calls.some(([sql]) => sql.includes('video_storyboard_shot_approvals'))).toBe(false)
  })
})
