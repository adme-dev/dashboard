import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  approveGooglePmaxLaunch,
  createGooglePmaxLaunch,
  GooglePmaxLaunchConflictError,
  transitionGooglePmaxLaunch
} from '~~/server/utils/googlePmaxLaunchStore'
import { hashCanonicalLaunchJson } from '~~/server/utils/googlePmaxLaunchHash'

const mockTransaction = vi.fn()
const mockQuery = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

const ids = {
  launch: '5c4ca47b-df3a-43cd-b82f-a23a3f03a781',
  tenant: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
  brief: '23799282-283b-4508-b065-3fd36e8c05fd',
  client: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
  connection: '4f1206a1-fec7-491f-beed-662d9e9fc904',
  actor: '10ea5019-e05f-476f-971e-a73a3bc6930c'
}

const normalizedConfig = { schemaVersion: 1, briefId: ids.brief }
const configHash = hashCanonicalLaunchJson(normalizedConfig)
const idempotencyKey = 'b'.repeat(64)

function launchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.launch,
    tenant_id: ids.tenant,
    brief_id: ids.brief,
    client_id: ids.client,
    connection_id: ids.connection,
    platform: 'google_ads',
    campaign_type: 'G_PMaxInventory',
    config_version: 1,
    config_hash: configHash,
    idempotency_key: idempotencyKey,
    normalized_config: normalizedConfig,
    state: 'DRAFT',
    preflight_result: {},
    provider_resources: {},
    verification_result: {},
    retry_from_state: null,
    media_spend_id: null,
    last_error_code: null,
    last_error_message: null,
    created_by: ids.actor,
    created_at: '2026-07-22T08:00:00.000Z',
    updated_at: '2026-07-22T08:00:00.000Z',
    ...overrides
  }
}

const createInput = {
  tenantId: ids.tenant,
  briefId: ids.brief,
  clientId: ids.client,
  connectionId: ids.connection,
  configVersion: 1,
  configHash,
  idempotencyKey,
  normalizedConfig,
  actorId: ids.actor
}

describe('Google PMax launch store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransaction.mockImplementation(async (callback: (db: { query: typeof mockQuery }) => unknown) => (
      callback({ query: mockQuery })
    ))
  })

  it('creates a versioned DRAFT and its initial event atomically', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [launchRow()] })
      .mockResolvedValueOnce({ rows: [] })

    const result = await createGooglePmaxLaunch(createInput)

    expect(result).toEqual({
      launch: expect.objectContaining({ id: ids.launch, state: 'DRAFT', configVersion: 1, configHash }),
      isReplay: false
    })
    expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('pg_advisory_xact_lock'), [ids.brief])
    expect(mockQuery).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO campaign_launches'), expect.any(Array))
    expect(mockQuery).toHaveBeenNthCalledWith(3, expect.stringContaining('INSERT INTO campaign_launch_events'), expect.arrayContaining([
      ids.launch,
      1,
      configHash,
      'LAUNCH_PLAN_CREATED',
      ids.actor
    ]))
  })

  it('returns an exact idempotent replay without appending a second event', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [launchRow()] })

    await expect(createGooglePmaxLaunch(createInput)).resolves.toEqual({
      launch: expect.objectContaining({ id: ids.launch }),
      isReplay: true
    })
    expect(mockQuery).toHaveBeenCalledTimes(3)
    expect(mockQuery.mock.calls[2]?.[0]).toContain('FOR UPDATE')
  })

  it('fails closed when an idempotency key belongs to different plan evidence', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [launchRow({ config_hash: 'c'.repeat(64) })] })

    await expect(createGooglePmaxLaunch(createInput)).rejects.toMatchObject({
      name: 'GooglePmaxLaunchConflictError',
      code: 'LAUNCH_IDEMPOTENCY_CONFLICT'
    })
  })

  it('rejects a caller-supplied hash that does not identify the normalized config', async () => {
    await expect(createGooglePmaxLaunch({
      ...createInput,
      configHash: 'c'.repeat(64)
    })).rejects.toMatchObject({ code: 'LAUNCH_CONFIG_HASH_MISMATCH' })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('rejects a runtime-invalid non-object normalized config before opening a transaction', async () => {
    await expect(createGooglePmaxLaunch({
      ...createInput,
      normalizedConfig: [] as unknown as Record<string, unknown>,
      configHash: hashCanonicalLaunchJson([])
    })).rejects.toMatchObject({ code: 'LAUNCH_CONFIG_HASH_MISMATCH' })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('normalizes a duplicate brief configuration version into a launch conflict', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }))

    await expect(createGooglePmaxLaunch(createInput)).rejects.toMatchObject({
      code: 'LAUNCH_IDEMPOTENCY_CONFLICT'
    })
  })

  it('rejects replay when stored normalized evidence differs even if identity strings match', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [launchRow({ normalized_config: { ...normalizedConfig, budget: 9_999 } })] })

    await expect(createGooglePmaxLaunch(createInput)).rejects.toMatchObject({
      code: 'LAUNCH_IDEMPOTENCY_CONFLICT'
    })
  })

  it('rejects replay by a different actor because creation attribution is immutable evidence', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [launchRow()] })

    await expect(createGooglePmaxLaunch({
      ...createInput,
      actorId: 'a338b7d4-f54f-4892-a1d2-7406ab7bc981'
    })).rejects.toMatchObject({ code: 'LAUNCH_IDEMPOTENCY_CONFLICT' })
  })

  it('locks and compare-and-sets an approved launch claim with its event', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT brief_id')) return { rows: [{ brief_id: ids.brief }] }
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] }
      if (sql.includes('SELECT') && sql.includes('FOR UPDATE')) {
        return { rows: [launchRow({ state: 'APPROVED' })] }
      }
      if (sql.includes('config_version >')) return { rows: [] }
      if (sql.includes('UPDATE campaign_launches')) {
        return { rows: [launchRow({ state: 'EXECUTING' })] }
      }
      if (sql.includes('INSERT INTO campaign_launch_events')) return { rows: [] }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    const launch = await transitionGooglePmaxLaunch({
      launchId: ids.launch,
      tenantId: ids.tenant,
      expectedState: 'APPROVED',
      toState: 'EXECUTING',
      expectedConfigVersion: 1,
      expectedConfigHash: configHash,
      actorId: ids.actor,
      eventType: 'CREATE_CLAIMED'
    })

    expect(launch.state).toBe('EXECUTING')
    expect(mockQuery.mock.calls[0]?.[0]).toContain('SELECT brief_id')
    expect(mockQuery.mock.calls[1]?.[0]).toContain('pg_advisory_xact_lock')
    expect(mockQuery.mock.calls[2]?.[0]).toContain('FOR UPDATE')
    const updateSql = mockQuery.mock.calls.find(call => String(call[0]).includes('UPDATE campaign_launches'))?.[0]
    expect(updateSql).toMatch(/state = \$3[\s\S]*state = \$4[\s\S]*config_version = \$5[\s\S]*config_hash = \$6/)
  })

  it('persists a bounded preflight result only with the matching readiness transition', async () => {
    const preflightResult = { ready: true, blockerCount: 0, evidenceHash: 'd'.repeat(64) }
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT brief_id')) return { rows: [{ brief_id: ids.brief }] }
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] }
      if (sql.includes('SELECT') && sql.includes('FOR UPDATE')) return { rows: [launchRow()] }
      if (sql.includes('config_version >')) return { rows: [] }
      if (sql.includes('UPDATE campaign_launches')) {
        return { rows: [launchRow({ state: 'READY_FOR_APPROVAL', preflight_result: preflightResult })] }
      }
      if (sql.includes('INSERT INTO campaign_launch_events')) return { rows: [] }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    const launch = await transitionGooglePmaxLaunch({
      launchId: ids.launch,
      tenantId: ids.tenant,
      expectedState: 'DRAFT',
      toState: 'READY_FOR_APPROVAL',
      expectedConfigVersion: 1,
      expectedConfigHash: configHash,
      actorId: ids.actor,
      eventType: 'PREFLIGHT_PASSED',
      results: { preflight: preflightResult }
    })

    expect(launch.preflightResult).toEqual(preflightResult)
    const update = mockQuery.mock.calls.find(call => String(call[0]).includes('UPDATE campaign_launches'))
    expect(update?.[0]).toContain('preflight_result = COALESCE($8::jsonb, preflight_result)')
    expect(JSON.parse(String(update?.[1]?.[7]))).toEqual(preflightResult)
  })

  it('rejects result fields on unrelated state transitions before opening a transaction', async () => {
    await expect(transitionGooglePmaxLaunch({
      launchId: ids.launch,
      tenantId: ids.tenant,
      expectedState: 'APPROVED',
      toState: 'EXECUTING',
      expectedConfigVersion: 1,
      expectedConfigHash: configHash,
      actorId: ids.actor,
      eventType: 'CREATE_CLAIMED',
      results: { preflight: { ready: true } }
    })).rejects.toMatchObject({ code: 'LAUNCH_RESULT_UPDATE_REJECTED' })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('rejects a stale or concurrent state before writing an event', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ brief_id: ids.brief }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [launchRow({ state: 'EXECUTING' })] })
      .mockResolvedValueOnce({ rows: [] })

    await expect(transitionGooglePmaxLaunch({
      launchId: ids.launch,
      tenantId: ids.tenant,
      expectedState: 'APPROVED',
      toState: 'EXECUTING',
      expectedConfigVersion: 1,
      expectedConfigHash: configHash,
      actorId: ids.actor,
      eventType: 'CREATE_CLAIMED'
    })).rejects.toBeInstanceOf(GooglePmaxLaunchConflictError)
    expect(mockQuery).toHaveBeenCalledTimes(4)
  })

  it('cannot use the generic transition path to mint an approved state', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ brief_id: ids.brief }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [launchRow({ state: 'READY_FOR_APPROVAL' })] })
      .mockResolvedValueOnce({ rows: [] })

    await expect(transitionGooglePmaxLaunch({
      launchId: ids.launch,
      tenantId: ids.tenant,
      expectedState: 'READY_FOR_APPROVAL',
      toState: 'APPROVED',
      expectedConfigVersion: 1,
      expectedConfigHash: configHash,
      actorId: ids.actor,
      eventType: 'BYPASS_ATTEMPT'
    })).rejects.toMatchObject({ code: 'LAUNCH_APPROVAL_CONFLICT' })
    expect(mockQuery).toHaveBeenCalledTimes(4)
  })

  it('fails if the compare-and-set loses a race after the row was read', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ brief_id: ids.brief }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [launchRow({ state: 'APPROVED' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    await expect(transitionGooglePmaxLaunch({
      launchId: ids.launch,
      tenantId: ids.tenant,
      expectedState: 'APPROVED',
      toState: 'EXECUTING',
      expectedConfigVersion: 1,
      expectedConfigHash: configHash,
      actorId: ids.actor,
      eventType: 'CREATE_CLAIMED'
    })).rejects.toMatchObject({ code: 'LAUNCH_CONCURRENT_TRANSITION' })
    expect(mockQuery).toHaveBeenCalledTimes(5)
  })

  it('rejects transitions for an obsolete launch configuration version', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ brief_id: ids.brief }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [launchRow({ state: 'APPROVED' })] })
      .mockResolvedValueOnce({ rows: [{ present: 1 }] })

    await expect(transitionGooglePmaxLaunch({
      launchId: ids.launch,
      tenantId: ids.tenant,
      expectedState: 'APPROVED',
      toState: 'EXECUTING',
      expectedConfigVersion: 1,
      expectedConfigHash: configHash,
      actorId: ids.actor,
      eventType: 'CREATE_CLAIMED'
    })).rejects.toMatchObject({ code: 'LAUNCH_CONFIG_HASH_MISMATCH' })
    expect(mockQuery).toHaveBeenCalledTimes(4)
  })

  it('records creation approval and state/event transition in one transaction', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ brief_id: ids.brief }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [launchRow({ state: 'READY_FOR_APPROVAL' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'b9dfaee5-ad2d-4081-8046-d6517efcfe56' }] })
      .mockResolvedValueOnce({ rows: [launchRow({ state: 'APPROVED' })] })
      .mockResolvedValueOnce({ rows: [] })

    const launch = await approveGooglePmaxLaunch({
      launchId: ids.launch,
      tenantId: ids.tenant,
      approvalKind: 'create',
      expectedConfigVersion: 1,
      expectedConfigHash: configHash,
      actorId: ids.actor,
      reason: 'Approved after reviewing the exact fixed-flight launch configuration.'
    })

    expect(launch.state).toBe('APPROVED')
    expect(mockQuery.mock.calls[4]?.[0]).toContain('INSERT INTO campaign_launch_approvals')
    expect(mockQuery.mock.calls[5]?.[0]).toContain('UPDATE campaign_launches')
    expect(mockQuery.mock.calls[6]?.[0]).toContain('INSERT INTO campaign_launch_events')
  })

  it.each([
    { authorization: 'unsafe' },
    { apiKey: 'unsafe' },
    { cookie: 'unsafe' },
    { data: { toJSON: () => ({ accessToken: 'unsafe' }) } }
  ])('rejects sensitive or custom-serialized event payload %j before opening a transaction', async (payload) => {
    await expect(transitionGooglePmaxLaunch({
      launchId: ids.launch,
      tenantId: ids.tenant,
      expectedState: 'DRAFT',
      toState: 'READY_FOR_APPROVAL',
      expectedConfigVersion: 1,
      expectedConfigHash: configHash,
      actorId: ids.actor,
      eventType: 'PREFLIGHT_PASSED',
      payload
    })).rejects.toMatchObject({ code: 'LAUNCH_EVENT_PAYLOAD_REJECTED' })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it.each([
    { providerResult: undefined },
    { spend: Number.NaN },
    { spend: Number.POSITIVE_INFINITY },
    { steps: Array(1) }
  ])('rejects lossy event JSON %j rather than changing audit evidence', async (payload) => {
    await expect(transitionGooglePmaxLaunch({
      launchId: ids.launch,
      tenantId: ids.tenant,
      expectedState: 'DRAFT',
      toState: 'READY_FOR_APPROVAL',
      expectedConfigVersion: 1,
      expectedConfigHash: configHash,
      actorId: ids.actor,
      eventType: 'PREFLIGHT_PASSED',
      payload
    })).rejects.toMatchObject({ code: 'LAUNCH_EVENT_PAYLOAD_REJECTED' })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('rejects a runtime null event payload rather than recording empty evidence', async () => {
    await expect(transitionGooglePmaxLaunch({
      launchId: ids.launch,
      tenantId: ids.tenant,
      expectedState: 'DRAFT',
      toState: 'READY_FOR_APPROVAL',
      expectedConfigVersion: 1,
      expectedConfigHash: configHash,
      actorId: ids.actor,
      eventType: 'PREFLIGHT_PASSED',
      payload: null as unknown as Record<string, unknown>
    })).rejects.toMatchObject({ code: 'LAUNCH_EVENT_PAYLOAD_REJECTED' })
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})
