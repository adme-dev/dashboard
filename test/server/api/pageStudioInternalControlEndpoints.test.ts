import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getLatestPageStudioCheckpoint: vi.fn(),
  recordPageStudioAuditEvent: vi.fn(),
  recordPageStudioCheckpoint: vi.fn(),
  registerPageStudioVersion: vi.fn(),
  requirePageStudioMachineAuth: vi.fn()
}))

vi.mock('~~/server/utils/pageStudio/machineAuth', () => ({
  requirePageStudioMachineAuth: (...args: unknown[]) => mocks.requirePageStudioMachineAuth(...args)
}))
vi.mock('~~/server/utils/pageStudio/controlStore', () => ({
  getLatestPageStudioCheckpoint: (...args: unknown[]) => mocks.getLatestPageStudioCheckpoint(...args),
  recordPageStudioAuditEvent: (...args: unknown[]) => mocks.recordPageStudioAuditEvent(...args),
  recordPageStudioCheckpoint: (...args: unknown[]) => mocks.recordPageStudioCheckpoint(...args),
  registerPageStudioVersion: (...args: unknown[]) => mocks.registerPageStudioVersion(...args),
  PageStudioControlError: class PageStudioControlError extends Error {}
}))
vi.mock('~~/server/utils/pageStudio/http', () => ({
  pageStudioInternalHttpError: (event: TestEvent, error: unknown) => {
    const candidate = error as {
      statusCode?: number
      data?: { error?: { code: string, message: string } }
    }
    event.responseStatus = candidate.statusCode ?? 500
    return candidate.data ?? {
      error: { code: 'INTERNAL_ERROR', message: 'Page Studio request failed' }
    }
  }
}))

type TestEvent = {
  body?: unknown
  context: Record<string, unknown>
  headers?: Record<string, string>
  query?: Record<string, unknown>
  responseStatus?: number
}

const testGlobal = globalThis as typeof globalThis & {
  eventHandler: <T>(handler: T) => T
  createError: (input: Record<string, unknown>) => Error & Record<string, unknown>
  getHeader: (event: TestEvent, key: string) => string | undefined
  getQuery: (event: TestEvent) => Record<string, unknown>
  readBody: (event: TestEvent) => Promise<unknown>
  setResponseStatus: (event: TestEvent, status: number) => void
}
testGlobal.eventHandler = handler => handler
testGlobal.createError = input => Object.assign(new Error(String(input.statusMessage)), input)
testGlobal.getHeader = (event, key) => event.headers?.[key.toLowerCase()]
testGlobal.getQuery = event => event.query ?? {}
testGlobal.readBody = async event => event.body
testGlobal.setResponseStatus = (event, status) => {
  event.responseStatus = status
}

const scope = {
  tenantId: 'tenant-alpha',
  clientId: '22222222-2222-4222-8222-222222222222',
  siteId: '11111111-1111-4111-8111-111111111111'
}
const userId = '33333333-3333-4333-8333-333333333333'
const checkpointId = 'checkpoint_01HXYZ'
const digest = 'a'.repeat(64)
const checkpoint = {
  checkpointId,
  createdAt: '2026-08-30T01:00:00.000Z',
  digest,
  etag: 'etag-1',
  objectKey: `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${checkpointId}.json`,
  scope,
  userId
}

describe('Page Studio internal control endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePageStudioMachineAuth.mockReturnValue({ service: 'page-studio' })
    mocks.recordPageStudioCheckpoint.mockResolvedValue({ acknowledged: true })
    mocks.getLatestPageStudioCheckpoint.mockResolvedValue({
      checkpointId, digest, objectKey: checkpoint.objectKey
    })
    mocks.registerPageStudioVersion.mockResolvedValue({
      authorRole: 'client', checkpointId, createdAt: '2026-08-30T02:00:00.000Z',
      digest, id: '44444444-4444-4444-8444-444444444444', siteId: scope.siteId, status: 'draft'
    })
    mocks.recordPageStudioAuditEvent.mockResolvedValue({ acknowledged: true })
  })

  it('authenticates before accepting a checkpoint and binds the idempotency header to its id', async () => {
    const { default: handler } = await import('~~/server/routes/internal/page-studio/checkpoints/index.post')
    const event: TestEvent = {
      body: checkpoint,
      context: {},
      headers: { 'idempotency-key': checkpointId }
    }

    await expect(handler(event as never)).resolves.toEqual({ acknowledged: true })
    expect(mocks.requirePageStudioMachineAuth).toHaveBeenCalledWith(event)
    expect(mocks.recordPageStudioCheckpoint).toHaveBeenCalledWith(checkpoint)

    const invalidEvent = { ...event, headers: { 'idempotency-key': 'other-id' } }
    await expect(handler(invalidEvent as never)).resolves.toEqual({
      error: { code: 'INVALID_INPUT', message: 'Invalid checkpoint request' }
    })
    expect(invalidEvent.responseStatus).toBe(400)
  })

  it('does not parse or persist a body when machine authentication fails', async () => {
    const denied = Object.assign(new Error('denied'), { statusCode: 403 })
    mocks.requirePageStudioMachineAuth.mockImplementationOnce(() => {
      throw denied
    })
    const body = Object.defineProperty({}, 'checkpointId', {
      get: () => {
        throw new Error('body inspected')
      }
    })
    const { default: handler } = await import('~~/server/routes/internal/page-studio/checkpoints/index.post')

    await expect(handler({ body, context: {}, headers: {} } as never)).resolves.toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Page Studio request failed' }
    })
    expect(mocks.recordPageStudioCheckpoint).not.toHaveBeenCalled()
  })

  it('resolves the latest pointer only from a fully validated explicit scope', async () => {
    const { default: handler } = await import('~~/server/routes/internal/page-studio/checkpoints/latest.get')
    const event: TestEvent = { context: {}, query: scope }

    await expect(handler(event as never)).resolves.toEqual({
      checkpointId, digest, objectKey: checkpoint.objectKey
    })
    expect(mocks.getLatestPageStudioCheckpoint).toHaveBeenCalledWith(scope)

    const invalidEvent: TestEvent = { context: {}, query: { ...scope, clientId: 'not-a-uuid' } }
    await expect(handler(invalidEvent as never)).resolves.toEqual({
      error: { code: 'INVALID_INPUT', message: 'Invalid checkpoint scope' }
    })
    expect(invalidEvent.responseStatus).toBe(400)
  })

  it('returns 404 when an authenticated scoped site has no current checkpoint', async () => {
    mocks.getLatestPageStudioCheckpoint.mockResolvedValueOnce(null)
    const { default: handler } = await import('~~/server/routes/internal/page-studio/checkpoints/latest.get')

    const event: TestEvent = { context: {}, query: scope }
    await expect(handler(event as never)).resolves.toEqual({
      error: { code: 'CHECKPOINT_NOT_FOUND', message: 'Current checkpoint not found' }
    })
    expect(event.responseStatus).toBe(404)
  })

  it('registers a version with the validated idempotency header and returns 201', async () => {
    const { default: handler } = await import('~~/server/routes/internal/page-studio/versions/index.post')
    const body = {
      authorRole: 'client', checkpointId, digest, scope,
      summary: 'Updated campaign headline', userId
    }
    const event: TestEvent = {
      body,
      context: {},
      headers: { 'idempotency-key': 'version-request-01HXYZ' }
    }

    await expect(handler(event as never)).resolves.toMatchObject({ status: 'draft', siteId: scope.siteId })
    expect(mocks.registerPageStudioVersion).toHaveBeenCalledWith({
      ...body, idempotencyKey: 'version-request-01HXYZ'
    })
    expect(event.responseStatus).toBe(201)
  })

  it('accepts only allowlisted audit fields and derives idempotency from the header', async () => {
    const { default: handler } = await import('~~/server/routes/internal/page-studio/audit-events/index.post')
    const body = {
      action: 'workspace.previewed',
      actorId: userId,
      actorRole: 'client',
      occurredAt: '2026-08-30T03:00:00.000Z',
      resourceId: 'workspace_01',
      resourceType: 'workspace',
      scope
    }
    const idempotencyKey = 'workspace.previewed:workspace_01:2026-08-30T03:00:00.000Z'

    await expect(handler({
      body, context: {}, headers: { 'idempotency-key': idempotencyKey }
    } as never)).resolves.toEqual({ acknowledged: true })
    expect(mocks.recordPageStudioAuditEvent).toHaveBeenCalledWith({ ...body, idempotencyKey })

    const invalidEvent: TestEvent = {
      body: { ...body, metadata: { token: 'must-not-pass' } },
      context: {},
      headers: { 'idempotency-key': idempotencyKey }
    }
    await expect(handler(invalidEvent as never)).resolves.toEqual({
      error: { code: 'INVALID_INPUT', message: 'Invalid audit event' }
    })
    expect(invalidEvent.responseStatus).toBe(400)

    const mismatchedResourceEvent: TestEvent = {
      body: { ...body, action: 'session.revoked', resourceType: 'checkpoint' },
      context: {},
      headers: { 'idempotency-key': idempotencyKey }
    }
    await expect(handler(mismatchedResourceEvent as never)).resolves.toEqual({
      error: { code: 'INVALID_INPUT', message: 'Invalid audit event' }
    })
    expect(mocks.recordPageStudioAuditEvent).toHaveBeenCalledTimes(1)
  })
})
