import { describe, expect, it, vi } from 'vitest'

const isReadOnlyRole = vi.fn(() => true)
const canBypassApplicationControl = vi.fn()

vi.mock('../../../server/utils/permissions', () => ({ isReadOnlyRole }))
vi.mock('../../../server/utils/godMode/featureGate', () => ({ canBypassApplicationControl }))

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getRequestURL: (event: any) => URL
}
testGlobal.defineEventHandler = handler => handler
testGlobal.getRequestURL = event => new URL(`https://app.xeroflow.io${event.path}`)

const { default: rbac } = await import('../../../server/middleware/rbac')

describe('RBAC God mode mutation boundary', () => {
  it('allows a read-only actor only after the trusted exact-route coordinator admits the bypass', async () => {
    canBypassApplicationControl.mockResolvedValue(true)
    const event = {
      method: 'POST',
      path: '/api/agency/briefs/templates/template-1/mapping',
      context: { user: { id: '11111111-1111-4111-8111-111111111111', role: 'viewer' } }
    } as any

    await expect(rbac(event)).resolves.toBeUndefined()
    expect(canBypassApplicationControl).toHaveBeenCalledWith(event, 'permission')
  })

  it('preserves the existing 403 when no coordinator admits the bypass', async () => {
    canBypassApplicationControl.mockResolvedValue(false)
    const event = {
      method: 'POST',
      path: '/api/agency/briefs/templates/template-1/mapping',
      context: { user: { id: '11111111-1111-4111-8111-111111111111', role: 'viewer' } }
    } as any

    await expect(rbac(event)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Forbidden - Read-only access.'
    })
  })
})
