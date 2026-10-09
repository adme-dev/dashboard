import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), generate: vi.fn(), send: vi.fn(), ready: vi.fn() }))
vi.mock('h3', async original => ({ ...(await original<typeof import('h3')>()), readBody: async () => ({ email: 'MEMBER@example.com' }) }))
vi.mock('../../../server/utils/auth', () => ({ getUserByEmail: mocks.lookup, generateMagicLink: mocks.generate }))
vi.mock('../../../server/utils/email', () => ({ sendMagicLinkEmail: mocks.send, isMagicLinkEmailConfigured: mocks.ready }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
const handler = (await import('../../../server/api/auth/magic-link/request.post')).default
const event = { context: { cloudflare: { env: { APP_URL: 'https://app.xeroflow.io' } } } } as unknown as H3Event
const active = { id: 'synthetic_member', email: 'member@example.com', name: 'Member', is_active: true }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.ready.mockReturnValue(true)
  mocks.generate.mockResolvedValue('synthetic-token')
  mocks.send.mockResolvedValue(undefined)
})

describe('public agency sign-in admission and response privacy', () => {
  it('checks the dedicated service before account lookup', async () => {
    mocks.ready.mockReturnValue(false)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 503 })
    expect(mocks.lookup).not.toHaveBeenCalled()
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it('preserves identical responses for eligible, unknown, inactive and failed delivery', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.lookup.mockResolvedValue(active)
    const accepted = await handler(event)
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(mocks.send.mock.calls[0]?.[0]?.event).toBe(event)
    mocks.lookup.mockResolvedValue(null)
    const unknown = await handler(event)
    mocks.lookup.mockResolvedValue({ ...active, is_active: false })
    const inactive = await handler(event)
    expect(mocks.send).toHaveBeenCalledOnce()
    mocks.lookup.mockResolvedValue(active)
    mocks.send.mockRejectedValue(new Error('PRIVATE_PROVIDER_DETAIL member@example.com synthetic-token'))
    const failed = await handler(event)
    expect(unknown).toEqual(accepted)
    expect(inactive).toEqual(accepted)
    expect(failed).toEqual(accepted)
    expect(JSON.stringify(log.mock.calls)).not.toContain('member@example.com')
    expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-token')
    expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_PROVIDER_DETAIL')
    log.mockRestore()
  })
})
