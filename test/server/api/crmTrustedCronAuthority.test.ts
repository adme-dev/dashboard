import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTIVE_CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const INACTIVE_CLIENT_ID = '22222222-2222-4222-8222-222222222222'
const ACTIVE_TARGET_ID = '33333333-3333-4333-8333-333333333333'

const mocks = vi.hoisted(() => ({
  listCustomerTargets: vi.fn(),
  recomputeHealth: vi.fn(),
  queryRows: vi.fn(),
  recomputeScore: vi.fn(),
  resolveContext: vi.fn(),
  authorize: vi.fn()
}))

vi.mock('h3', () => ({
  defineEventHandler: <T>(handler: T) => handler,
  getHeader: () => undefined,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))
vi.mock('~~/server/utils/crm/healthSignals', () => ({
  listCustomerTargets: (...args: unknown[]) => mocks.listCustomerTargets(...args),
  recomputeHealth: (...args: unknown[]) => mocks.recomputeHealth(...args)
}))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mocks.queryRows(...args)
}))
vi.mock('~~/server/utils/crm/scoreSignals', () => ({
  recomputeScore: (...args: unknown[]) => mocks.recomputeScore(...args)
}))
vi.mock('~~/server/utils/crm/searchContext', () => ({
  resolveTrustedCrmSystemContext: (...args: unknown[]) => mocks.resolveContext(...args)
}))
vi.mock('~~/server/utils/crm/recordAccess', () => ({
  requireCrmRecordAccess: (...args: unknown[]) => mocks.authorize(...args)
}))

const healthCron = (await import('~~/server/api/cron/crm-health-recompute.post')).default
const scoreCron = (await import('~~/server/api/cron/crm-score-decay.post')).default

function candidate(clientId: string, targetId: string) {
  return { client_id: clientId, target_type: 'person' as const, target_id: targetId }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.resolveContext.mockImplementation(async ({ clientId, purpose }: { clientId: string, purpose: string }) => {
    if (clientId === INACTIVE_CLIENT_ID) {
      throw Object.assign(new Error('Client not found'), { statusCode: 404, statusMessage: 'Client not found' })
    }
    return {
      clientId,
      actorType: 'system',
      actorId: `trusted-system:${purpose}`,
      visibility: { ownerScoped: false },
      trustedSystem: { purpose }
    }
  })
  mocks.authorize.mockImplementation(async (context, ref) => ({ ...ref, clientId: context.clientId, row: { id: ref.id } }))
  mocks.recomputeHealth.mockResolvedValue({ total: 100 })
  mocks.recomputeScore.mockResolvedValue({ total: 100 })
})

describe('trusted CRM cron candidate authority', () => {
  it('does not let inactive clients consume the health batch or inflate customer/capped summaries', async () => {
    const inactive = Array.from({ length: 2000 }, (_, index) =>
      candidate(INACTIVE_CLIENT_ID, `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`))
    mocks.listCustomerTargets.mockResolvedValue([
      ...inactive,
      candidate(ACTIVE_CLIENT_ID, ACTIVE_TARGET_ID)
    ])

    await expect(healthCron({} as never)).resolves.toEqual({
      ok: true, customers: 1, recomputed: 1, capped: false
    })
    expect(mocks.recomputeHealth).toHaveBeenCalledOnce()
    expect(mocks.recomputeHealth).toHaveBeenCalledWith(expect.objectContaining({
      clientId: ACTIVE_CLIENT_ID,
      targetId: ACTIVE_TARGET_ID,
      context: expect.objectContaining({ clientId: ACTIVE_CLIENT_ID })
    }))
    expect(mocks.resolveContext.mock.calls.filter(([input]) => input.clientId === INACTIVE_CLIENT_ID)).toHaveLength(1)
  })

  it('does not let inactive clients consume the score batch or inflate stale/capped summaries', async () => {
    const inactive = Array.from({ length: 1000 }, (_, index) =>
      candidate(INACTIVE_CLIENT_ID, `00000000-0000-4000-8001-${String(index).padStart(12, '0')}`))
    mocks.queryRows.mockResolvedValue([
      ...inactive,
      candidate(ACTIVE_CLIENT_ID, ACTIVE_TARGET_ID)
    ])

    await expect(scoreCron({} as never)).resolves.toEqual({
      ok: true, stale: 1, recomputed: 1, capped: false
    })
    expect(mocks.recomputeScore).toHaveBeenCalledOnce()
    expect(mocks.recomputeScore).toHaveBeenCalledWith(expect.objectContaining({
      clientId: ACTIVE_CLIENT_ID,
      targetId: ACTIVE_TARGET_ID,
      context: expect.objectContaining({ clientId: ACTIVE_CLIENT_ID })
    }))
    expect(mocks.resolveContext.mock.calls.filter(([input]) => input.clientId === INACTIVE_CLIENT_ID)).toHaveLength(1)
  })
})
