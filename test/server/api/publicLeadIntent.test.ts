import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getHeader: (event: TestEvent, name: string) => string | undefined
  getQuery: (event: TestEvent) => Record<string, string>
  getRequestIP: () => undefined
  readBody: (event: TestEvent) => Promise<unknown>
  setResponseHeaders: (event: TestEvent, headers: Record<string, string>) => void
  setResponseStatus: (event: TestEvent, status: number) => void
}

interface TestEvent {
  body: unknown
  context: {
    cloudflare?: {
      env?: Record<string, unknown>
    }
  }
  headers: Record<string, string>
  query: Record<string, string>
  responseHeaders?: Record<string, string>
  responseStatus?: number
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getHeader = (event, name) => event.headers[name.toLowerCase()]
testGlobal.getQuery = event => event.query
testGlobal.getRequestIP = () => undefined
testGlobal.readBody = async event => event.body
testGlobal.setResponseHeaders = (event, headers) => {
  event.responseHeaders = headers
}
testGlobal.setResponseStatus = (event, status) => {
  event.responseStatus = status
}

const mocks = vi.hoisted(() => ({
  queryOne: vi.fn(),
  resolveSiteByWriteKey: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mocks.queryOne(...args),
  queryRows: vi.fn()
}))
vi.mock('~~/server/utils/tracking/client-ip', () => ({
  resolveClientIp: vi.fn(() => null)
}))
vi.mock('~~/server/utils/tracking/rate-limit', () => ({
  rateCheck: vi.fn()
}))
vi.mock('~~/server/utils/tracking/site-config', () => ({
  isOriginAllowed: vi.fn(() => true),
  resolveSiteByWriteKey: (...args: unknown[]) => mocks.resolveSiteByWriteKey(...args)
}))

const originalIdentityKey = process.env.LEAD_IDENTITY_HMAC_KEY
const originalCronSecret = process.env.CRON_SECRET
const handler = (await import('../../../../server/api/public/lead-intent.post')).default

afterAll(() => {
  if (originalIdentityKey === undefined) delete process.env.LEAD_IDENTITY_HMAC_KEY
  else process.env.LEAD_IDENTITY_HMAC_KEY = originalIdentityKey
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalCronSecret
})

describe('public lead intent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.LEAD_IDENTITY_HMAC_KEY
    delete process.env.CRON_SECRET
    mocks.resolveSiteByWriteKey.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      clientId: '22222222-2222-4222-8222-222222222222',
      allowedOrigins: ['https://dealer.example']
    })
    mocks.queryOne.mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333' })
  })

  it('stores an intent with the Cloudflare request-scoped identity key when process env is absent', async () => {
    const event: TestEvent = {
      body: {
        browser_event_id: 'browser-event-1',
        occurred_at: 1785466800000,
        form_id: 'vehicle-enquiry',
        page_url: 'https://dealer.example/vehicles/123',
        identity: { email: 'person@example.com' },
        attribution: {}
      },
      context: {
        cloudflare: {
          env: { LEAD_IDENTITY_HMAC_KEY: 'request-scoped-identity-key' }
        }
      },
      headers: {
        'origin': 'https://dealer.example',
        'cf-ipcountry': 'AU'
      },
      query: { k: 'xf_test' }
    }

    await expect(handler(event as never)).resolves.toEqual({ ok: true, stored: true })
    expect(event.responseStatus).toBe(202)
    expect(mocks.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO lead_submission_intents'),
      expect.arrayContaining([
        '87c0b933077b0cb4eec088ebfb4fbf1e3cd4b759764544bb48b747e9774b398f'
      ])
    )
  })
})
