import { beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as any).defineEventHandler = (fn: unknown) => fn
;(globalThis as any).readBody = async (event: any) => event.body
;(globalThis as any).createError = (opts: Record<string, unknown>) => Object.assign(new Error(String(opts.statusMessage)), opts)

const { queryOne, requireRole, requireWriteAccess } = vi.hoisted(() => ({
  queryOne: vi.fn(),
  requireRole: vi.fn(async () => ({ id: 'actor-1' })),
  requireWriteAccess: vi.fn(async () => undefined)
}))

vi.mock('~~/server/utils/db', () => ({ queryOne }))
vi.mock('~~/server/utils/auth', () => ({ requireRole, requireWriteAccess }))
vi.mock('~~/server/utils/permissions', () => ({ PERMISSIONS: { MEDIA_BUYING: ['owner'] } }))

const handler = (await import('~~/server/api/leads/endpoints/website.post')).default
const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

describe('website lead endpoint provisioning', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates an isolated webhook endpoint and reveals its new secret once', async () => {
    queryOne.mockResolvedValueOnce({
      id: '22222222-2222-4222-8222-222222222222',
      url_token: 'url-token',
      secret_key: 'new-secret'
    })

    const result = await handler({
      body: { client_id: CLIENT_ID, reason: 'Controlled Big Garage pilot' }
    } as any)

    expect(requireRole).toHaveBeenCalledWith(expect.anything(), ['owner'])
    expect(requireWriteAccess).toHaveBeenCalled()
    expect(queryOne.mock.calls[0]?.[0]).toMatch(/INSERT INTO lead_webhook_endpoints[\s\S]*'webhook'[\s\S]*ON CONFLICT \(client_id, source\) WHERE source = 'webhook'/)
    expect(result).toEqual({
      created: true,
      endpoint: {
        id: '22222222-2222-4222-8222-222222222222',
        urlToken: 'url-token',
        path: '/api/leads/webhook/generic/url-token'
      },
      secretKey: 'new-secret'
    })
  })

  it('returns existing endpoint identity without disclosing its stored secret', async () => {
    queryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: '22222222-2222-4222-8222-222222222222',
        url_token: 'existing-token'
      })

    const result = await handler({
      body: { client_id: CLIENT_ID, reason: 'Idempotent retry' }
    } as any)

    expect(result).toMatchObject({
      created: false,
      endpoint: { path: '/api/leads/webhook/generic/existing-token' },
      secretKey: null
    })
    expect(JSON.stringify(result)).not.toContain('secret_key')
  })
})
