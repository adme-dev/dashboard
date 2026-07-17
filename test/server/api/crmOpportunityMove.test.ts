import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  body?: Record<string, unknown>
  params?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  createError: (input: { statusCode: number, statusMessage: string, data?: unknown }) => Error & {
    statusCode: number
    statusMessage: string
    data?: unknown
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.readBody = async event => event.body ?? {}
testGlobal.getRouterParam = (event, key) => event.params?.[key]
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireAuth = vi.fn()
const mockRequireWriteAccess = vi.fn()
const mockRequireClientAuth = vi.fn()
const mockMove = vi.fn()
const mockPublishEvent = vi.fn()
const mockRunStageEntryAutomations = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/crm/opportunityStageTransition', () => ({
  opportunityStageTransitionService: {
    move: (...args: unknown[]) => mockMove(...args)
  }
}))

vi.mock('~~/server/utils/measurement/publisher', () => ({
  conversionOutboxPublisher: {
    publishEvent: (...args: unknown[]) => mockPublishEvent(...args)
  }
}))

vi.mock('~~/server/utils/crm/stageAutomation', () => ({
  recordStageChange: vi.fn(),
  runStageEntryAutomations: (...args: unknown[]) => mockRunStageEntryAutomations(...args)
}))

const { default: agencyHandler } = await import(
  '../../../../server/api/crm/opportunities/[id]/move.patch'
)
const { default: portalHandler } = await import(
  '../../../../server/api/client-portal/crm/opportunities/[id]/move.patch'
)

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const OPPORTUNITY_ID = '22222222-2222-4222-8222-222222222222'
const FROM_STAGE_ID = '33333333-3333-4333-8333-333333333333'
const TO_STAGE_ID = '44444444-4444-4444-8444-444444444444'
const ACTOR_ID = '55555555-5555-4555-8555-555555555555'

function movedResult() {
  return {
    status: 'moved' as const,
    item: { id: OPPORTUNITY_ID, stage_id: TO_STAGE_ID, owner_id: null },
    historyId: '66666666-6666-4666-8666-666666666666',
    canonicalEventName: 'lead_qualified' as const,
    linkedLeadId: null,
    outbox: {
      status: 'created' as const,
      event: {
        eventId: '77777777-7777-4777-8777-777777777777',
        outboxStatus: 'pending' as const
      },
      deliveryCount: 1
    }
  }
}

describe('CRM opportunity move endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: ACTOR_ID })
    mockRequireWriteAccess.mockResolvedValue(undefined)
    mockRequireClientAuth.mockResolvedValue({
      id: ACTOR_ID,
      clientId: CLIENT_ID,
      canManageLeadOutcomes: true
    })
    mockMove.mockResolvedValue(movedResult())
    mockPublishEvent.mockResolvedValue({ status: 'published' })
    mockRunStageEntryAutomations.mockResolvedValue(undefined)
    mockQueryOne.mockResolvedValue(null)
  })

  it('delegates agency moves with an expected stage to the shared transaction service', async () => {
    const result = await agencyHandler({
      params: { id: OPPORTUNITY_ID },
      body: {
        client_id: CLIENT_ID,
        stage_id: TO_STAGE_ID,
        expected_stage_id: FROM_STAGE_ID,
        reason: 'Qualified after sales review'
      }
    } as never)

    expect(mockMove).toHaveBeenCalledWith(expect.objectContaining({
      clientId: CLIENT_ID,
      opportunityId: OPPORTUNITY_ID,
      toStageId: TO_STAGE_ID,
      expectedStageId: FROM_STAGE_ID,
      actor: { type: 'team_member', id: ACTOR_ID },
      reason: 'Qualified after sales review'
    }))
    expect(mockRunStageEntryAutomations).toHaveBeenCalledWith(expect.objectContaining({
      clientId: CLIENT_ID,
      opportunityId: OPPORTUNITY_ID,
      toStageId: TO_STAGE_ID
    }))
    expect(mockPublishEvent).toHaveBeenCalledWith(
      expect.anything(),
      movedResult().outbox.event.eventId
    )
    expect(result).toEqual({ item: movedResult().item })
  })

  it('denies portal outcome mutation unless the client user has explicit permission', async () => {
    mockRequireClientAuth.mockResolvedValue({
      id: ACTOR_ID,
      clientId: CLIENT_ID,
      canManageLeadOutcomes: false
    })

    await expect(portalHandler({
      params: { id: OPPORTUNITY_ID },
      body: { stage_id: TO_STAGE_ID, expected_stage_id: FROM_STAGE_ID }
    } as never)).rejects.toMatchObject({ statusCode: 403 })

    expect(mockMove).not.toHaveBeenCalled()
  })

  it('scopes permitted portal moves to the authenticated client', async () => {
    await portalHandler({
      params: { id: OPPORTUNITY_ID },
      body: {
        stage_id: TO_STAGE_ID,
        expected_stage_id: FROM_STAGE_ID,
        reason: 'Client confirmed qualification'
      }
    } as never)

    expect(mockMove).toHaveBeenCalledWith(expect.objectContaining({
      clientId: CLIENT_ID,
      actor: { type: 'client_user', id: ACTOR_ID },
      reason: 'Client confirmed qualification'
    }))
  })

  it('maps stale expected stages to a conflict without leaking other tenant data', async () => {
    mockMove.mockResolvedValue({ status: 'stage_conflict', currentStageId: FROM_STAGE_ID })

    await expect(agencyHandler({
      params: { id: OPPORTUNITY_ID },
      body: {
        client_id: CLIENT_ID,
        stage_id: TO_STAGE_ID,
        expected_stage_id: FROM_STAGE_ID
      }
    } as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Opportunity stage changed; reload and try again'
    })
  })
})
