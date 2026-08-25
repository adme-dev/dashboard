import { afterEach, describe, expect, it, vi } from 'vitest'

const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
const mockClientAuth = vi.fn()
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: (...a: unknown[]) => mockClientAuth(...a) }))
const { default: handler } = await import('../../../server/api/portal/qr-enabled.get')

afterEach(() => { delete process.env.QR_PORTAL_ENABLED })

describe('GET /api/portal/qr-enabled', () => {
  it('requires a client session and defaults to disabled', async () => {
    mockClientAuth.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))
    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 401 })
    mockClientAuth.mockResolvedValue({ id: 'c1' })
    expect(await handler({} as any)).toEqual({ enabled: false })
  })

  it('reports enabled only when QR_PORTAL_ENABLED=true', async () => {
    mockClientAuth.mockResolvedValue({ id: 'c1' })
    process.env.QR_PORTAL_ENABLED = 'true'
    expect(await handler({} as any)).toEqual({ enabled: true })
  })
})
