import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
  params?: Record<string, string>
  body?: unknown
}

type TestGlobal = typeof globalThis & {
  defineEventHandler: <T extends (...args: unknown[]) => unknown>(fn: T) => T
  eventHandler: <T extends (...args: unknown[]) => unknown>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  getRouterParam: (event: TestEvent, name: string) => string | undefined
  readBody: (event: TestEvent) => Promise<unknown>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

const testGlobal = globalThis as TestGlobal
testGlobal.defineEventHandler = fn => fn
testGlobal.eventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}
testGlobal.getRouterParam = (event, name) => event.params?.[name]
testGlobal.readBody = async event => 'body' in event ? event.body : {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const clientId = '11111111-1111-4111-8111-111111111111'
const ruleId = '33333333-3333-4333-8333-333333333333'
const mockRequirePermission = vi.fn()
const mockRequireSocialClientAccess = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()
const mockGetDealerLink = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args)
}))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  isSocialClientId: (value: unknown) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value),
  requireSocialClientAccess: (...args: unknown[]) => mockRequireSocialClientAccess(...args)
}))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))
vi.mock('~~/server/utils/feeds/dealerLinks', () => ({
  getDealerLink: (...args: unknown[]) => mockGetDealerLink(...args)
}))

const { default: listHandler } = await import('../../../server/api/agency/social/feed-rules/index.get')
const { default: createHandler } = await import('../../../server/api/agency/social/feed-rules/index.post')
const { default: updateHandler } = await import('../../../server/api/agency/social/feed-rules/[id].patch')
const { default: deleteHandler } = await import('../../../server/api/agency/social/feed-rules/[id].delete')

describe('Auto Feed rule API client isolation and validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({ id: 'user-1', email: 'staff@xeroflow.io' })
    mockRequireSocialClientAccess.mockResolvedValue({ id: 'user-1' })
    mockQueryRows.mockResolvedValue([])
    mockQueryOne.mockResolvedValue(null)
    mockExecute.mockResolvedValue(1)
    mockGetDealerLink.mockResolvedValue({ clientId, providerId: 'social-dashboard' })
  })

  it('lists only rules belonging to the requested authorized client', async () => {
    await listHandler({ query: { clientId } } as never)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), clientId)
    expect(mockQueryRows).toHaveBeenCalledWith(expect.stringContaining('WHERE r.client_id = $1'), [clientId])
  })

  it('requires a client scope before listing rules', async () => {
    await expect(listHandler({ query: {} } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockRequireSocialClientAccess).not.toHaveBeenCalled()
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('creates a rule only for an authorized client with an active feed link', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: ruleId, client_id: clientId, event_types: ['new'] })

    await createHandler({ body: { clientId, eventTypes: ['new'], captionTemplate: '{title}' } } as never)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), clientId)
    expect(mockGetDealerLink).toHaveBeenCalledWith(clientId)
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO feed_post_rules'), [
      clientId,
      ['new'],
      '{title}',
      'user-1',
      'staff@xeroflow.io'
    ])
  })

  it('rejects unsupported event types instead of silently accepting a partial rule', async () => {
    await expect(createHandler({ body: { clientId, eventTypes: ['new', 'price_drop'] } } as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Only new and listing events are currently supported'
    })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('rejects a malformed request body at the API boundary', async () => {
    await expect(createHandler({ body: null } as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Request body must be an object'
    })
    expect(mockRequireSocialClientAccess).not.toHaveBeenCalled()
  })

  it('rejects rule creation when the client has no active feed link', async () => {
    mockGetDealerLink.mockResolvedValueOnce(null)

    await expect(createHandler({ body: { clientId, eventTypes: ['new'] } } as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Client does not have an active dealer feed link'
    })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('loads and authorizes the owning client before updating a rule', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: ruleId, client_id: clientId })
      .mockResolvedValueOnce({ id: ruleId, client_id: clientId, enabled: false })

    await updateHandler({ params: { id: ruleId }, body: { enabled: false } } as never)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), clientId)
    expect(mockQueryOne).toHaveBeenLastCalledWith(expect.stringContaining('WHERE id = $2 AND client_id = $3'), [
      false,
      ruleId,
      clientId
    ])
  })

  it('does not update a rule when access to its owning client is denied', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: ruleId, client_id: clientId })
    mockRequireSocialClientAccess.mockRejectedValueOnce(Object.assign(new Error('No access'), { statusCode: 403 }))

    await expect(updateHandler({ params: { id: ruleId }, body: { enabled: false } } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mockQueryOne).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid rule patches before querying the database', async () => {
    await expect(updateHandler({ params: { id: 'not-a-uuid' }, body: { enabled: true } } as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid rule id'
    })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('loads and authorizes the owning client before deleting a rule', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: ruleId, client_id: clientId })

    await deleteHandler({ params: { id: ruleId } } as never)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), clientId)
    expect(mockExecute).toHaveBeenCalledWith(
      'DELETE FROM feed_post_rules WHERE id = $1 AND client_id = $2',
      [ruleId, clientId]
    )
  })
})
