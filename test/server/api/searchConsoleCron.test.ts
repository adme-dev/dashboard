import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clientIds: ['client-entitled'] as string[],
  listClientIds: vi.fn(),
  syncClient: vi.fn(),
  inspect: vi.fn(),
  runAfterResponse: vi.fn()
}))

vi.mock('~~/server/utils/searchAuthority/feature', () => ({
  listSearchAuthorityClientIds: mocks.listClientIds
}))
vi.mock('~~/server/utils/searchAuthority/sync', () => ({
  syncSearchConsoleClient: mocks.syncClient
}))
vi.mock('~~/server/utils/searchAuthority/inspection', () => ({
  inspectPriorityUrls: mocks.inspect
}))
vi.mock('~~/server/utils/asyncBackground', () => ({
  runAfterResponse: mocks.runAfterResponse
}))

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getHeader', (event: { headers?: Record<string, string> }, name: string) => (
  event.headers?.[name]
))

describe('Search Console daily cron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'cron-secret'
    mocks.listClientIds.mockResolvedValue(mocks.clientIds)
    mocks.syncClient.mockResolvedValue([])
    mocks.inspect.mockResolvedValue({ inspected: 1, failed: 0, errors: [] })
    mocks.runAfterResponse.mockImplementation((_event, promise) => promise)
  })

  it('fails closed without the cron secret', async () => {
    const handler = (await import(
      '~~/server/api/cron/search-console-sync.post'
    )).default
    await expect(handler({ headers: {}, context: {} } as never)).rejects.toMatchObject({
      statusCode: 401
    })
    expect(mocks.listClientIds).not.toHaveBeenCalled()
  })

  it('queues refresh and indexed-version inspection only for entitled active clients', async () => {
    const handler = (await import(
      '~~/server/api/cron/search-console-sync.post'
    )).default
    const event = {
      headers: { 'x-cron-secret': 'cron-secret' },
      context: {}
    } as never
    const result = await handler(event)

    expect(result).toEqual({ ok: true, queuedClients: 1 })
    expect(mocks.runAfterResponse).toHaveBeenCalledOnce()
    await mocks.runAfterResponse.mock.calls[0]![1]
    expect(mocks.syncClient).toHaveBeenCalledWith({
      clientId: 'client-entitled',
      triggerType: 'scheduled'
    })
    expect(mocks.inspect).toHaveBeenCalledWith('client-entitled', 50)
  })
})
