import { beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as any).defineEventHandler = (fn: unknown) => fn
;(globalThis as any).createError = (opts: Record<string, unknown>) => Object.assign(new Error(String(opts.statusMessage)), opts)
;(globalThis as any).readBody = async (event: any) => event.body

const { queryOne, requireRole, requireWriteAccess } = vi.hoisted(() => ({
  queryOne: vi.fn(),
  requireRole: vi.fn(async () => ({ id: 'actor-1' })),
  requireWriteAccess: vi.fn()
}))
vi.mock('~~/server/utils/db', () => ({ queryOne }))
vi.mock('~~/server/utils/auth', () => ({ requireRole, requireWriteAccess }))
vi.mock('~~/server/utils/permissions', () => ({
  PERMISSIONS: { MEDIA_BUYING: ['admin'] }
}))

const handler = (await import('../../../../server/api/leads/endpoints/podium.post')).default

describe('Podium endpoint provisioning', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates an isolated credential and only returns its secret once', async () => {
    queryOne.mockResolvedValueOnce({
      id: 'endpoint-1',
      url_token: 'token-1',
      secret_key: 'secret-1'
    })

    const result = await handler({
      body: {
        client_id: '11111111-1111-4111-8111-111111111111',
        reason: 'South Morang Podium webchat lead ingestion'
      }
    } as any)

    expect(queryOne).toHaveBeenCalledWith(
      expect.stringMatching(/'podium'/),
      expect.arrayContaining(['11111111-1111-4111-8111-111111111111'])
    )
    expect(result).toEqual({
      created: true,
      endpoint: {
        id: 'endpoint-1',
        urlToken: 'token-1',
        path: '/api/leads/webhook/podium/token-1'
      },
      webhookSecret: 'secret-1'
    })
  })

  it('returns an existing endpoint without disclosing its secret', async () => {
    queryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'endpoint-1', url_token: 'token-1' })

    await expect(handler({
      body: {
        client_id: '11111111-1111-4111-8111-111111111111',
        reason: 'Resolve existing endpoint'
      }
    } as any)).resolves.toEqual({
      created: false,
      endpoint: {
        id: 'endpoint-1',
        urlToken: 'token-1',
        path: '/api/leads/webhook/podium/token-1'
      },
      webhookSecret: null
    })
  })
})
