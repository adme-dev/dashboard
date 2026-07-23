import { beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as any).defineEventHandler = (fn: unknown) => fn
;(globalThis as any).createError = (opts: Record<string, unknown>) => Object.assign(new Error(String(opts.statusMessage)), opts)
;(globalThis as any).getRouterParam = (event: any, key: string) => event.context.params[key]

const { queryOne, requireClientTrackingAccess } = vi.hoisted(() => ({
  queryOne: vi.fn(),
  requireClientTrackingAccess: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({ queryOne }))
vi.mock('~~/server/utils/tracking/analytics-access', () => ({ requireClientTrackingAccess }))

const handler = (await import('../../../../../server/api/leads/endpoints/podium/[clientId].get')).default

describe('Podium endpoint status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns connection metadata without disclosing the secret', async () => {
    queryOne.mockResolvedValueOnce({
      id: 'endpoint-1',
      url_token: 'token-1',
      rotated_at: '2026-07-24T01:00:00.000Z',
      secret_key_grace_until: null
    })

    const result = await handler({
      context: { params: { clientId: '11111111-1111-4111-8111-111111111111' } }
    } as any)

    expect(requireClientTrackingAccess).toHaveBeenCalledWith(
      expect.anything(),
      '11111111-1111-4111-8111-111111111111'
    )
    expect(result).toEqual({
      configured: true,
      endpoint: {
        id: 'endpoint-1',
        urlToken: 'token-1',
        path: '/api/leads/webhook/podium/token-1',
        rotatedAt: '2026-07-24T01:00:00.000Z',
        secretGraceUntil: null
      }
    })
    expect(JSON.stringify(result)).not.toMatch(/secret_key|webhookSecret/)
  })

  it('returns an explicit unconfigured state', async () => {
    queryOne.mockResolvedValueOnce(null)

    await expect(handler({
      context: { params: { clientId: '11111111-1111-4111-8111-111111111111' } }
    } as any)).resolves.toEqual({ configured: false, endpoint: null })
  })
})
