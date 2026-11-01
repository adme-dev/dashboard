import { describe, expect, it, vi, beforeEach } from 'vitest'
import { verifyJwt } from '../../workers/email-design/sessionToken'

const env = { EMAIL_DESIGN_ENVIRONMENT: 'production', EMAIL_DESIGN_SESSION_AUTHORITY: 'pages-auth-me-v1' }
vi.mock('nitropack/runtime/internal/context', () => ({ useEvent: () => ({ context: { cloudflare: { env } } }) }))
const actor = '10000000-0000-4000-8000-000000000001'
const token = Buffer.from(JSON.stringify({ userId: actor, iat: Date.now(), exp: Date.now() + 60000 })).toString('base64') + '.signature'
beforeEach(() => {
  vi.unstubAllGlobals()
  env.EMAIL_DESIGN_ENVIRONMENT = 'production'
})
describe('existing Pages session authority', () => {
  it('uses the fixed environment host with only the exact token and no cached verdict', async () => {
    const fetch = vi.fn(async () => Response.json({ success: true, user: { id: actor, is_active: true } }))
    vi.stubGlobal('fetch', fetch)
    expect((await verifyJwt(token))?.userId).toBe(actor)
    await verifyJwt(token)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0]).toEqual(['https://app.xeroflow.io/api/auth/me', expect.objectContaining({ redirect: 'manual', cache: 'no-store', headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json', 'Cache-Control': 'no-cache' } })])
  })
  it.each([401, 403])('rejects denied sessions (%s)', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status })))
    expect(await verifyJwt(token)).toBeNull()
  })
  it.each([302, 500, 503])('fails closed on authority failure (%s)', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status })))
    await expect(verifyJwt(token)).rejects.toThrow('Session authority unavailable')
  })
  it('rejects a different actor and oversized authority replies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: true, user: { id: 'other', is_active: true } })))
    expect(await verifyJwt(token)).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ padding: 'x'.repeat(33000) })))
    await expect(verifyJwt(token)).rejects.toThrow()
  })
  it('never dispatches tokens for unknown environments', async () => {
    env.EMAIL_DESIGN_ENVIRONMENT = 'other'
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(verifyJwt(token)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
})
