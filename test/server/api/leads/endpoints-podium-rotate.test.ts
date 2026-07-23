import { beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as any).defineEventHandler = (fn: unknown) => fn
;(globalThis as any).createError = (opts: Record<string, unknown>) => Object.assign(new Error(String(opts.statusMessage)), opts)
;(globalThis as any).getRouterParam = (event: any, key: string) => event.context.params[key]

const { queryOne, requireClientTrackingAccess, requireWriteAccess } = vi.hoisted(() => ({
  queryOne: vi.fn(),
  requireClientTrackingAccess: vi.fn(),
  requireWriteAccess: vi.fn(async () => ({ id: 'actor-1' }))
}))

vi.mock('node:crypto', () => ({ randomBytes: vi.fn(() => Buffer.from('a'.repeat(32))) }))
vi.mock('~~/server/utils/db', () => ({ queryOne }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess }))
vi.mock('~~/server/utils/tracking/analytics-access', () => ({ requireClientTrackingAccess }))

const handler = (await import('../../../../../../server/api/leads/endpoints/podium/[clientId]/rotate.post')).default

describe('Podium endpoint rotation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rotates only the client Podium credential and returns the new secret once', async () => {
    queryOne.mockResolvedValueOnce({ id: 'endpoint-1', url_token: 'token-1' })

    const result = await handler({
      context: { params: { clientId: '11111111-1111-4111-8111-111111111111' } }
    } as any)

    expect(requireWriteAccess).toHaveBeenCalled()
    expect(requireClientTrackingAccess).toHaveBeenCalledWith(
      expect.anything(),
      '11111111-1111-4111-8111-111111111111'
    )
    expect(queryOne).toHaveBeenCalledWith(
      expect.stringMatching(/client_id = \$1[\s\S]*source = 'podium'/),
      ['11111111-1111-4111-8111-111111111111', expect.any(String)]
    )
    expect(result).toEqual({
      ok: true,
      endpoint: {
        id: 'endpoint-1',
        path: '/api/leads/webhook/podium/token-1'
      },
      webhookSecret: expect.any(String),
      graceMinutes: 30
    })
  })

  it('does not mint a secret when no Podium endpoint exists for the client', async () => {
    queryOne.mockResolvedValueOnce(null)

    await expect(handler({
      context: { params: { clientId: '11111111-1111-4111-8111-111111111111' } }
    } as any)).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Podium endpoint not found' })
  })
})
