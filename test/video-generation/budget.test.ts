import { describe, expect, it, vi } from 'vitest'
import { reserveAndCreateVideoGenerationJob, reserveAndCreateVideoGenerationJobIn } from '~~/server/utils/video-generation/budget'
import type { CreateVideoGenerationJobInput } from '~~/server/utils/video-generation/jobs'
import type { VideoGenerationTenantPolicy } from '~~/server/utils/video-generation/types'
import { videoGenerationRequestFingerprint } from '~~/shared/video/generationLiability'

function baseInput(overrides: Partial<CreateVideoGenerationJobInput> & { projectAllowanceCents?: number | null } = {}): CreateVideoGenerationJobInput & { projectAllowanceCents?: number | null } {
  return {
    tenantId: 'tenant-1',
    projectId: 'project-1',
    timelineId: 'timeline-1',
    createdBy: 'user-1',
    status: 'queued',
    mode: 'image-to-video',
    modelId: 'aigateway/seedance-i2v',
    provider: 'aigateway',
    prompt: 'subtle reveal',
    sourceAssetIds: ['asset-1'],
    durationSeconds: 5,
    aspectRatio: '16:9',
    resolution: '720p',
    subjectType: 'vehicle',
    complianceStatus: 'vehicle_i2v',
    complianceReasons: ['Approved vehicle source asset present.'],
    estimatedCostCents: 50,
    idempotencyKey: 'idem-1',
    ...overrides,
  }
}

function existingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-existing',
    tenant_id: 'tenant-1',
    project_id: 'project-1',
    timeline_id: 'timeline-1',
    created_by: 'user-1',
    status: 'queued',
    mode: 'image-to-video',
    model_id: 'aigateway/seedance-i2v',
    provider: 'aigateway',
    prompt: 'subtle reveal',
    source_asset_ids: ['asset-1'],
    duration_seconds: 5,
    aspect_ratio: '16:9',
    resolution: '720p',
    subject_type: 'vehicle',
    compliance_status: 'vehicle_i2v',
    compliance_reasons: [],
    estimated_cost_cents: 50,
    actual_cost_cents: null,
    idempotency_key: 'idem-1',
    created_at: '2026-06-10T00:00:00.000Z',
    updated_at: '2026-06-10T00:00:00.000Z',
    ...overrides,
  }
}

const enabledPolicy: VideoGenerationTenantPolicy = { enabled: true, monthlyCapCents: 100 }

function makeFakeTransaction(opts: {
  spendCents: number
  projectSpendCents?: number
  existingRow?: Record<string, unknown> | null
}) {
  const calls: string[] = []
  const insertCalls: any[][] = []
  const spendSql: string[] = []
  const transaction = vi.fn(async (cb: (db: any) => Promise<any>) => {
    const db = {
      query: vi.fn(async (sql: string, params?: any[]) => {
        const text = String(sql)
        if (text.includes('pg_advisory_xact_lock')) {
          calls.push(text.includes('project-operation:') ? 'operation-lock' : 'lock')
          return { rows: [{ locked: true }] }
        }
        if (text.includes('idempotency_key') && text.trim().toUpperCase().startsWith('SELECT')) {
          calls.push('existing')
          return { rows: opts.existingRow ? [opts.existingRow] : [] }
        }
        if (text.includes('SUM') && text.includes('project_id')) {
          calls.push('project-spend')
          spendSql.push(text)
          return { rows: [{ total: opts.projectSpendCents ?? 0 }] }
        }
        if (text.includes('SUM')) {
          calls.push('spend')
          spendSql.push(text)
          return { rows: [{ total: opts.spendCents }] }
        }
        if (text.includes('INSERT INTO video_generation_jobs')) {
          calls.push('insert')
          insertCalls.push(params ?? [])
          return {
            rows: [
              {
                id: 'job-new',
                tenant_id: params?.[1],
                project_id: params?.[2],
                timeline_id: params?.[3],
                created_by: params?.[4],
                status: params?.[5],
                mode: params?.[6],
                model_id: params?.[7],
                provider: params?.[8],
                prompt: params?.[9],
                source_asset_ids: params?.[10],
                duration_seconds: params?.[11],
                aspect_ratio: params?.[12],
                resolution: params?.[13],
                subject_type: params?.[14],
                compliance_status: params?.[15],
                compliance_reasons: params?.[16],
                estimated_cost_cents: params?.[17],
                actual_cost_cents: null,
                idempotency_key: params?.[18],
                request_fingerprint: params?.[19],
                liability_state: params?.[20],
                liability_cents: params?.[21],
                dispatch_eligible: params?.[22],
                created_at: '2026-06-10T00:00:00.000Z',
                updated_at: '2026-06-10T00:00:00.000Z',
              },
            ],
          }
        }
        calls.push(`other:${text.slice(0, 40)}`)
        return { rows: [] }
      }),
    }
    return cb(db)
  })
  return { transaction, calls, insertCalls, spendSql }
}

describe('reserveAndCreateVideoGenerationJob', () => {
  it('reserves and inserts when under cap', async () => {
    const fake = makeFakeTransaction({ spendCents: 20 })
    const result = await reserveAndCreateVideoGenerationJob(baseInput(), enabledPolicy, {
      transaction: fake.transaction as any,
    })

    expect(result.ok).toBe(true)
    expect(result.reused).toBe(false)
    expect(result.job?.id).toBe('job-new')
    expect(result.job?.estimatedCostCents).toBe(50)
    expect(result.job?.liabilityState).toBe('reserved')
    expect(result.job?.liabilityCents).toBe(50)
    expect(result.job?.dispatchEligible).toBe(true)
    expect(result.job?.requestFingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(fake.insertCalls).toHaveLength(1)
    expect(fake.calls.filter(call => call === 'lock')).toHaveLength(2)
    expect(fake.calls.indexOf('lock')).toBeLessThan(fake.calls.indexOf('spend'))
    expect(fake.calls.indexOf('spend')).toBeLessThan(fake.calls.indexOf('insert'))
    expect(fake.spendSql[0]).toContain("liability_state IN ('reserved', 'uncertain')")
    expect(fake.spendSql[0]).not.toContain("status IN ('queued','running','succeeded')")
  })

  it('rejects and does NOT insert when the reservation would exceed the cap', async () => {
    const fake = makeFakeTransaction({ spendCents: 75 })
    const result = await reserveAndCreateVideoGenerationJob(baseInput(), enabledPolicy, {
      transaction: fake.transaction as any,
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('tenant_cap_exceeded')
    expect(result.remainingCents).toBe(25)
    expect(fake.insertCalls).toHaveLength(0)
    expect(fake.calls).not.toContain('insert')
  })

  it('rejects a disabled tenant policy without inserting', async () => {
    const fake = makeFakeTransaction({ spendCents: 0 })
    const result = await reserveAndCreateVideoGenerationJob(
      baseInput(),
      { enabled: false, monthlyCapCents: 100 },
      { transaction: fake.transaction as any }
    )

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('tenant_generation_disabled')
    expect(fake.insertCalls).toHaveLength(0)
  })

  it('returns the existing job as reused without re-reserving (idempotent under the lock)', async () => {
    const fake = makeFakeTransaction({
      spendCents: 999,
      existingRow: existingRow(),
    })
    const result = await reserveAndCreateVideoGenerationJob(baseInput(), enabledPolicy, {
      transaction: fake.transaction as any,
    })

    expect(result.ok).toBe(true)
    expect(result.reused).toBe(true)
    expect(result.job?.id).toBe('job-existing')
    expect(fake.insertCalls).toHaveLength(0)
    expect(fake.calls).not.toContain('spend')
  })

  it('rejects reused idempotency keys for a different project without reserving', async () => {
    const fake = makeFakeTransaction({
      spendCents: 999,
      existingRow: existingRow({ project_id: 'other-project' }),
    })

    const result = await reserveAndCreateVideoGenerationJob(baseInput(), enabledPolicy, {
      transaction: fake.transaction as any,
    })

    expect(result).toEqual({ ok: false, reason: 'idempotency_key_conflict' })
    expect(fake.insertCalls).toHaveLength(0)
    expect(fake.calls).not.toContain('spend')
  })

  it('conflicts a changed body before spend, including rows with no stored fingerprint', async () => {
    const fake = makeFakeTransaction({
      spendCents: 0,
      existingRow: existingRow({ prompt: 'different reveal' }),
    })

    const result = await reserveAndCreateVideoGenerationJob(baseInput(), enabledPolicy, {
      transaction: fake.transaction as any,
    })

    expect(result).toEqual({ ok: false, reason: 'idempotency_key_conflict' })
    expect(fake.calls).not.toContain('spend')
    expect(fake.insertCalls).toHaveLength(0)
  })

  it('trusts a stored fingerprint over a column fallback', async () => {
    const fake = makeFakeTransaction({
      spendCents: 0,
      existingRow: existingRow({ request_fingerprint: 'a'.repeat(64) }),
    })

    const result = await reserveAndCreateVideoGenerationJob(baseInput(), enabledPolicy, {
      transaction: fake.transaction as any,
    })

    expect(result).toEqual({ ok: false, reason: 'idempotency_key_conflict' })
    expect(fake.calls).not.toContain('spend')
  })

  it('replays the original reservation when only the quoted price changed', async () => {
    const fake = makeFakeTransaction({
      spendCents: 999,
      existingRow: existingRow({ estimated_cost_cents: 50, liability_cents: 50, liability_state: 'reserved' }),
    })

    const result = await reserveAndCreateVideoGenerationJob(baseInput({ estimatedCostCents: 900 }), enabledPolicy, {
      transaction: fake.transaction as any,
    })

    expect(result.ok).toBe(true)
    expect(result.reused).toBe(true)
    expect(result.job?.estimatedCostCents).toBe(50)
    expect(fake.calls).not.toContain('spend')
  })

  it('checks an optional project allowance against the canonical project sum', async () => {
    const over = makeFakeTransaction({ spendCents: 0, projectSpendCents: 80 })
    const rejected = await reserveAndCreateVideoGenerationJob(
      baseInput({ projectAllowanceCents: 100 }),
      enabledPolicy,
      { transaction: over.transaction as any },
    )
    expect(rejected).toEqual({ ok: false, reason: 'project_allowance_exceeded', remainingCents: 20 })
    expect(over.insertCalls).toHaveLength(0)
    expect(over.calls.indexOf('spend')).toBeLessThan(over.calls.indexOf('project-spend'))

    const under = makeFakeTransaction({ spendCents: 0, projectSpendCents: 40 })
    const accepted = await reserveAndCreateVideoGenerationJob(
      baseInput({ projectAllowanceCents: 100, dispatchEligible: false }),
      enabledPolicy,
      { transaction: under.transaction as any },
    )
    expect(accepted.ok).toBe(true)
    expect(accepted.job?.dispatchEligible).toBe(false)
    expect(under.insertCalls[0]?.[22]).toBe(false)
    expect(under.spendSql.some(sql => sql.includes('project_id'))).toBe(true)
  })

  it('rejects a non-finite project allowance before insert', async () => {
    const fake = makeFakeTransaction({ spendCents: 0, projectSpendCents: 0 })
    const result = await reserveAndCreateVideoGenerationJob(
      baseInput({ projectAllowanceCents: Number.NaN }),
      enabledPolicy,
      { transaction: fake.transaction as any },
    )
    expect(result).toEqual({ ok: false, reason: 'project_allowance_exceeded', remainingCents: 0 })
    expect(fake.insertCalls).toHaveLength(0)
    expect(fake.calls).not.toContain('project-spend')
  })

  it('takes the same reentrant tenant lock when called inside an open transaction', async () => {
    let locks = 0
    const inner = {
      query: vi.fn(async (sql: string, params?: any[]) => {
        const text = String(sql)
        if (text.includes('pg_advisory_xact_lock')) {
          locks += 1
          return { rows: [{}] }
        }
        if (text.includes('idempotency_key') && text.trim().toUpperCase().startsWith('SELECT')) return { rows: [] }
        if (text.includes('SUM')) return { rows: [{ total: 0 }] }
        if (text.includes('INSERT INTO video_generation_jobs')) {
          return {
            rows: [{
              id: 'job-in',
              tenant_id: params?.[1],
              project_id: params?.[2],
              timeline_id: params?.[3],
              created_by: params?.[4],
              status: params?.[5],
              mode: params?.[6],
              model_id: params?.[7],
              provider: params?.[8],
              prompt: params?.[9],
              source_asset_ids: params?.[10],
              duration_seconds: params?.[11],
              aspect_ratio: params?.[12],
              resolution: params?.[13],
              subject_type: params?.[14],
              compliance_status: params?.[15],
              compliance_reasons: params?.[16],
              estimated_cost_cents: params?.[17],
              idempotency_key: params?.[18],
              request_fingerprint: params?.[19],
              liability_state: params?.[20],
              liability_cents: params?.[21],
              dispatch_eligible: params?.[22],
              created_at: '2026-06-10T00:00:00.000Z',
              updated_at: '2026-06-10T00:00:00.000Z',
            }],
          }
        }
        return { rows: [] }
      }),
    }
    const result = await reserveAndCreateVideoGenerationJobIn(inner, baseInput(), enabledPolicy)
    expect(result.ok).toBe(true)
    expect(locks).toBe(2)
    expect(inner.query.mock.calls.filter(([sql]) => sql.includes("'videogen:budget:'"))).toHaveLength(1)
    expect(inner.query.mock.calls.filter(([sql]) => sql.includes("'videogen:project-operation:'"))).toHaveLength(1)
    expect(await videoGenerationRequestFingerprint({
      actorId: 'user-1',
      projectId: 'project-1',
      timelineId: 'timeline-1',
      mode: 'image-to-video',
      modelId: 'aigateway/seedance-i2v',
      provider: 'aigateway',
      prompt: 'subtle reveal',
      sourceAssetIds: ['asset-1'],
      durationSeconds: 5,
      aspectRatio: '16:9',
      resolution: '720p',
      subjectType: 'vehicle',
      dispatchEligible: true,
    })).toBe(result.job?.requestFingerprint)
  })
})
