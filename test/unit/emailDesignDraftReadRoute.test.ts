import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DesignReadError } from '../../server/utils/email-marketing/designReads'
import handler from '../../server/api/email/design/drafts/[id].get'

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  access: vi.fn(),
  read: vi.fn(),
  header: vi.fn(),
  query: vi.fn()
}))
vi.mock('h3', async original => ({
  ...(await original<typeof import('h3')>()),
  defineEventHandler: (f: unknown) => f,
  getCookie: () => 'token',
  getHeader: () => undefined,
  getRouterParam: () => '20000000-0000-4000-8000-000000000001',
  setHeader: mocks.header
}))
vi.mock('~~/server/utils/auth', () => ({ validateSession: mocks.session }))
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: mocks.query }))
vi.mock('~~/server/utils/email-marketing/designAccess', () => ({
  assertFreshDesignAccess: mocks.access
}))
vi.mock('~~/server/utils/email-marketing/designReads', async original => ({
  ...(await original<
    typeof import('../../server/utils/email-marketing/designReads')
  >()),
  getTemplateDesignDraft: mocks.read
}))
const event = () =>
  ({
    context: {
      cloudflare: { env: { FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true' } }
    }
  }) as Parameters<typeof handler>[0]
describe('gated design draft read route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.mockResolvedValue({
      id: '10000000-0000-4000-8000-000000000001'
    })
    mocks.access.mockResolvedValue('staff')
    mocks.read.mockImplementation(async (_id, authorize) => {
      await authorize('30000000-0000-4000-8000-000000000001')
      return { state: 'structured', projection: 'stale' }
    })
  })
  it('stays disabled by default and never caches private responses', async () => {
    await expect(
      handler({ context: {} } as Parameters<typeof handler>[0])
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.header).toHaveBeenCalledWith(
      expect.anything(),
      'cache-control',
      'no-store'
    )
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('authorises the stored scope and preserves the read service projection state', async () => {
    expect(await handler(event())).toEqual({
      draft: { state: 'structured', projection: 'stale' }
    })
    expect(mocks.access).toHaveBeenCalledWith(
      'token',
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'read'
    )
  })
  it('rejects expired sessions before loading content', async () => {
    mocks.session.mockResolvedValue(null)
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('does not return private content after read permission is revoked', async () => {
    mocks.access.mockRejectedValue(
      Object.assign(new Error('denied'), { statusCode: 403 })
    )
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 404, statusMessage: 'NOT_FOUND' })
  })
  it('redacts unexpected database failures', async () => {
    mocks.read.mockRejectedValue(new Error('private SQL payload'))
    await expect(handler(event())).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'design_read_unavailable'
    })
  })
  it.each([
    ['INVALID_DOCUMENT_ID', 400],
    ['NOT_FOUND', 404],
    ['HEAD_NOT_FOUND', 409],
    ['INVALID_STORED_DESIGN', 503]
  ] as const)(
    'maps %s without returning source or SQL details',
    async (code, statusCode) => {
      mocks.read.mockRejectedValue(new DesignReadError(code))
      await expect(handler(event())).rejects.toMatchObject({
        statusCode,
        statusMessage: code
      })
    }
  )
})
