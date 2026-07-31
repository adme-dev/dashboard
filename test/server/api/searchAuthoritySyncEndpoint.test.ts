import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
  requireAccess: vi.fn(),
  runBackground: vi.fn(),
  syncClient: vi.fn()
}))

vi.mock('~~/server/utils/searchAuthority/access', () => ({
  requireAgencySearchAuthorityAccess: mocks.requireAccess
}))
vi.mock('~~/server/utils/asyncBackground', () => ({
  runSpendSyncInBackground: mocks.runBackground
}))
vi.mock('~~/server/utils/searchAuthority/sync', () => ({
  syncSearchConsoleClient: mocks.syncClient
}))

vi.stubGlobal('eventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', async () => mocks.body)

describe('Search Authority manual sync endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.runBackground.mockImplementation((_event, options) => ({
      status: 'started',
      startedAt: '2026-07-31T00:00:00.000Z',
      clientId: options.extra.clientId
    }))
  })

  it('checks client access and starts a bounded manual range in the background', async () => {
    mocks.body = {
      clientId: '11111111-1111-4111-8111-111111111111',
      startDate: '2026-07-02',
      endDate: '2026-07-31'
    }
    const handler = (await import(
      '~~/server/api/agency/search-authority/sync.post'
    )).default
    const event = { context: {} } as never
    const response = await handler(event)

    expect(mocks.requireAccess).toHaveBeenCalledWith(event, mocks.body.clientId)
    expect(mocks.runBackground).toHaveBeenCalledWith(event, expect.objectContaining({
      label: expect.stringContaining('2026-07-02..2026-07-31'),
      extra: { clientId: mocks.body.clientId }
    }))
    const sync = mocks.runBackground.mock.calls[0]?.[1].sync
    await sync()
    expect(mocks.syncClient).toHaveBeenCalledWith({
      clientId: mocks.body.clientId,
      startDate: '2026-07-02',
      endDate: '2026-07-31',
      triggerType: 'manual'
    })
    expect(response).toMatchObject({ status: 'started', clientId: mocks.body.clientId })
  })

  it('rejects manual windows over 30 days before background work starts', async () => {
    mocks.body = {
      clientId: '11111111-1111-4111-8111-111111111111',
      startDate: '2026-01-01',
      endDate: '2026-01-31'
    }
    const handler = (await import(
      '~~/server/api/agency/search-authority/sync.post'
    )).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 400
    })
    expect(mocks.runBackground).not.toHaveBeenCalled()
  })
})
