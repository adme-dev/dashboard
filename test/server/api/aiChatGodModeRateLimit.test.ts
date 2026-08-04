import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  queryOne: vi.fn(),
  queryOneFresh: vi.fn(),
  processUserMessage: vi.fn(),
  appendGodModeAuditEvent: vi.fn()
}))

vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('~~/server/utils/db', () => ({
  queryOne: mocks.queryOne,
  queryOneFresh: mocks.queryOneFresh
}))
vi.mock('~~/server/utils/aiChatEngine', () => ({ processUserMessage: mocks.processUserMessage }))

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', () => '90000000-0000-4000-8000-000000000001')
vi.stubGlobal('readBody', async () => ({ content: 'hello' }))
vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(
  new Error(String(input.statusMessage ?? 'request failed')),
  input
))

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const MEMBER_ID = '22222222-2222-4222-8222-222222222222'
const SESSION_DIGEST = 'a'.repeat(64)

const { resolveGodModeAuthority } = await import('../../../server/utils/godMode/authority')
const {
  getGodModeRouteAuditState,
  seedGodModeRouteAuditState
} = await import('../../../server/utils/godMode/featureGate')
const messageHandler = (await import(
  '../../../server/api/agency/ai/chat/conversations/[id]/messages.post'
)).default as (event: any) => Promise<unknown>
const voiceHandler = (await import(
  '../../../server/api/agency/ai/chat/conversations/[id]/voice.post'
)).default as (event: any) => Promise<unknown>

function request(path: string, userId: string) {
  return {
    method: 'POST',
    context: { user: { id: userId } },
    node: {
      req: {
        originalUrl: path,
        headers: { host: 'app.xeroflow.test' },
        connection: {}
      },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as any
}

async function ownerRequest(path: string) {
  const event = request(path, OWNER_ID)
  mocks.queryOneFresh.mockResolvedValue({ id: OWNER_ID })
  await resolveGodModeAuthority(event, OWNER_ID, {
    queryOneFresh: mocks.queryOneFresh,
    processEnv: {}
  })
  seedGodModeRouteAuditState(event, {
    actorUserId: OWNER_ID,
    correlationId: '33333333-3333-4333-8333-333333333333',
    sessionDigest: SESSION_DIGEST,
    routeOrTool: `POST ${path}`,
    emergencyDisabled: false
  }, {
    appendGodModeAuditEvent: mocks.appendGodModeAuditEvent
  })
  return event
}

describe('AI chat God-mode application rate limits', () => {
  beforeEach(() => {
    mocks.requireAuth.mockReset()
    mocks.queryOne.mockReset()
    mocks.queryOneFresh.mockReset()
    mocks.processUserMessage.mockReset()
    mocks.appendGodModeAuditEvent.mockReset()
    mocks.appendGodModeAuditEvent.mockResolvedValue(undefined)
    mocks.queryOne.mockResolvedValueOnce({ cnt: 12 }).mockResolvedValueOnce(null)
  })

  it.each([
    ['text', '/api/agency/ai/chat/conversations/90000000-0000-4000-8000-000000000001/messages', messageHandler],
    ['voice', '/api/agency/ai/chat/conversations/90000000-0000-4000-8000-000000000001/voice', voiceHandler]
  ] as const)('bypasses only the %s application limiter and records rate_limit', async (_label, path, handler) => {
    mocks.requireAuth.mockResolvedValue({ id: OWNER_ID, role: 'owner' })
    const event = await ownerRequest(path)

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
    expect(getGodModeRouteAuditState(event)?.bypassedControls.has('rate_limit')).toBe(true)
    expect(mocks.appendGodModeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'bypass',
      bypassedControls: ['rate_limit'],
      outcomeCode: 'pre_execution'
    }))
    expect(mocks.queryOne).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['text', '/api/agency/ai/chat/conversations/90000000-0000-4000-8000-000000000001/messages', messageHandler],
    ['voice', '/api/agency/ai/chat/conversations/90000000-0000-4000-8000-000000000001/voice', voiceHandler]
  ] as const)('keeps the %s limiter unchanged for an ordinary member', async (_label, path, handler) => {
    mocks.requireAuth.mockResolvedValue({ id: MEMBER_ID, role: 'member' })
    mocks.queryOneFresh.mockResolvedValue(null)

    await expect(handler(request(path, MEMBER_ID))).rejects.toMatchObject({ statusCode: 429 })
    expect(mocks.queryOne).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['text', '/api/agency/ai/chat/conversations/90000000-0000-4000-8000-000000000001/messages', messageHandler],
    ['voice', '/api/agency/ai/chat/conversations/90000000-0000-4000-8000-000000000001/voice', voiceHandler]
  ] as const)('fails the %s bypass before later route work when immutable audit state is absent', async (_label, path, handler) => {
    mocks.requireAuth.mockResolvedValue({ id: OWNER_ID, role: 'owner' })
    const event = request(path, OWNER_ID)
    mocks.queryOneFresh.mockResolvedValue({ id: OWNER_ID })
    await resolveGodModeAuthority(event, OWNER_ID, {
      queryOneFresh: mocks.queryOneFresh,
      processEnv: {}
    })

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 503 })
    expect(mocks.queryOne).toHaveBeenCalledTimes(1)
  })
})
