import { describe, expect, it, vi } from 'vitest'
import { reserveAndCreateVideoGenerationJob } from '~~/server/utils/video-generation/budget'
import type { CreateVideoGenerationJobInput } from '~~/server/utils/video-generation/jobs'
import type { VideoGenerationTenantPolicy } from '~~/server/utils/video-generation/types'

function baseInput(overrides: Partial<CreateVideoGenerationJobInput> = {}): CreateVideoGenerationJobInput {
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

const enabledPolicy: VideoGenerationTenantPolicy = { enabled: true, monthlyCapCents: 100 }

/**
 * Build a fake interactive-transaction runner. `db.query(sql)` dispatches on SQL
 * keywords so tests can stage the in-transaction reads without matching exact SQL.
 */
function makeFakeTransaction(opts: {
  spendCents: number
  existingRow?: Record<string, unknown> | null
}) {
  const calls: string[] = []
  const insertCalls: any[][] = []
  const transaction = vi.fn(async (cb: (db: any) => Promise<any>) => {
    const db = {
      query: vi.fn(async (sql: string, params?: any[]) => {
        const text = String(sql)
        if (text.includes('pg_advisory_xact_lock')) {
          calls.push('lock')
          return { rows: [{ locked: true }] }
        }
        if (text.includes('idempotency_key') && text.trim().toUpperCase().startsWith('SELECT')) {
          calls.push('existing')
          return { rows: opts.existingRow ? [opts.existingRow] : [] }
        }
        if (text.includes('SUM')) {
          calls.push('spend')
          return { rows: [{ total: opts.spendCents }] }
        }
        if (text.includes('INSERT INTO video_generation_jobs')) {
          calls.push('insert')
          insertCalls.push(params ?? [])
          // Implementation passes 18 params (id is gen_random_uuid() in SQL, not a param).
          return {
            rows: [
              {
                id: 'job-new',
                tenant_id: params?.[0],
                project_id: params?.[1],
                timeline_id: params?.[2],
                created_by: params?.[3],
                status: params?.[4],
                mode: params?.[5],
                model_id: params?.[6],
                provider: params?.[7],
                prompt: params?.[8],
                source_asset_ids: params?.[9],
                duration_seconds: params?.[10],
                aspect_ratio: params?.[11],
                resolution: params?.[12],
                subject_type: params?.[13],
                compliance_status: params?.[14],
                compliance_reasons: params?.[15],
                estimated_cost_cents: params?.[16],
                actual_cost_cents: null,
                idempotency_key: params?.[17],
                created_at: '2026-06-10T00:00:00.000Z',
                updated_at: '2026-06-10T00:00:00.000Z',
              },
            ],
          }
        }
        calls.push(`other:${text.slice(0, 20)}`)
        return { rows: [] }
      }),
    }
    return cb(db)
  })
  return { transaction, calls, insertCalls }
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
    expect(fake.insertCalls).toHaveLength(1)
    // Lock must be taken before the spend read (serializes concurrent reservations).
    expect(fake.calls.indexOf('lock')).toBeLessThan(fake.calls.indexOf('spend'))
    expect(fake.calls.indexOf('spend')).toBeLessThan(fake.calls.indexOf('insert'))
  })

  it('rejects and does NOT insert when the reservation would exceed the cap', async () => {
    const fake = makeFakeTransaction({ spendCents: 75 }) // 75 + 50 > 100
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
      spendCents: 999, // even though "over cap", an existing reservation must not be rejected
      existingRow: {
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
      },
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
})
