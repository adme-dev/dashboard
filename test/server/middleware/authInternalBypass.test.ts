import { beforeEach, describe, expect, it, vi } from 'vitest'

const validateSession = vi.fn()
const acceptGodModeInternalExecution = vi.fn(async () => null)
const kvGet = vi.fn()

vi.mock('../../../server/utils/auth', () => ({
  validateSession,
  acceptGodModeInternalExecution,
  TransientAuthError: class TransientAuthError extends Error {}
}))

vi.mock('../../../server/utils/kv', () => ({
  kvGet,
  kvPut: vi.fn()
}))

vi.mock('../../../server/utils/roleResolver', () => ({
  resolveUserPermissions: vi.fn()
}))

vi.mock('../../../server/utils/permissions', () => ({
  isReadOnlyRole: vi.fn(() => false)
}))

type TestEvent = {
  url: string
  headers: Record<string, string | undefined>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRequestURL: (event: TestEvent) => URL
  getHeader: (event: TestEvent, key: string) => string | undefined
  getCookie: (event: TestEvent, key: string) => string | undefined
  deleteCookie: () => void
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRequestURL = event => new URL(event.url)
testGlobal.getHeader = (event, key) => event.headers[key.toLowerCase()]
testGlobal.getCookie = () => undefined
testGlobal.deleteCookie = vi.fn()

const { default: handler } = await import('../../../server/middleware/auth')

function fakeEvent(pathname: string): TestEvent {
  return {
    url: `https://app.xeroflow.io${pathname}`,
    headers: {}
  }
}

describe('auth middleware internal bearer endpoints', () => {
  beforeEach(() => {
    validateSession.mockReset()
    kvGet.mockReset()
  })

  it.each([
    '/api/internal/platform-agents/spend-controller/ask',
    '/api/internal/platform-agents/publishing-planner/ask',
    '/api/internal/ai-orchestrator/read-tool',
    '/api/internal/ai-agent/daily-digest',
    '/api/internal/email-to-board',
    '/api/internal/sync-spend',
    '/api/internal/chat-archive',
    '/api/internal/leads/email-policy',
    '/api/internal/workflows/social-publishing/publish'
  ])('lets %s reach its inline secret guard', async (pathname) => {
    await expect(handler(fakeEvent(pathname))).resolves.toBeUndefined()
    expect(validateSession).not.toHaveBeenCalled()
  })

  it('does not broaden the signed lead bypass to sibling internal routes', async () => {
    await expect(handler(fakeEvent('/api/internal/leads-private/admin'))).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Authentication required'
    })
  })

  it('lets public lead intent reach its site-key guard', async () => {
    await expect(handler(fakeEvent('/api/public/lead-intent'))).resolves.toBeUndefined()
    expect(validateSession).not.toHaveBeenCalled()
  })

  it('lets dealer measurement evidence reach its HMAC guard', async () => {
    await expect(handler(fakeEvent('/api/public/measurement-evidence/endpoint-key'))).resolves.toBeUndefined()
    expect(validateSession).not.toHaveBeenCalled()
  })

  it('does not broaden the dealer evidence bypass to sibling public routes', async () => {
    await expect(handler(fakeEvent('/api/public/measurement-evidence-private/endpoint-key'))).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Authentication required'
    })
  })

  it('lets a Banner Studio asset capability reach its inline HMAC guard', async () => {
    await expect(handler(fakeEvent('/api/public/banner-assets/v1.asset.signature'))).resolves.toBeUndefined()
    expect(validateSession).not.toHaveBeenCalled()
  })

  it('does not broaden the Banner Studio capability bypass to nested sibling routes', async () => {
    await expect(handler(fakeEvent('/api/public/banner-assets/v1.asset.signature/admin'))).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Authentication required'
    })
  })

  it.each([
    '/api/agency/workflows/readiness',
    '/api/agency/workflows/status',
    '/api/agency/social/publishing/workflows/readiness'
  ])('lets the self-authenticating workflow diagnostic %s reach its inline guard', async (pathname) => {
    await expect(handler(fakeEvent(pathname))).resolves.toBeUndefined()
    expect(validateSession).not.toHaveBeenCalled()
  })

  it('does not broaden the workflow diagnostic bypass to mutation routes', async () => {
    await expect(handler(fakeEvent('/api/agency/workflows/start'))).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Authentication required'
    })
  })

  it('still requires a session for normal API routes', async () => {
    await expect(handler(fakeEvent('/api/agency/social/spend'))).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Authentication required'
    })
  })
})
