import { beforeEach, describe, expect, it, vi } from 'vitest'
import { designLibrarySession } from '../../server/utils/email-marketing/designLibraryHttp'
const mocks = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn(), publisher: vi.fn(), headers: {} as Record<string, string> }))
vi.mock('h3', async original => ({ ...(await original<typeof import('h3')>()), getCookie: () => 'token', getHeader: (_e: unknown, key: string) => mocks.headers[key], setHeader: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ validateSession: mocks.session }))
vi.mock('~~/server/utils/email-marketing/designAccess', () => ({ assertFreshDesignAccess: mocks.access, assertFreshDesignPublisher: mocks.publisher }))
const actor = '10000000-0000-4000-8000-000000000001'
const env = () => ({ EMAIL_DESIGN_ENVIRONMENT: 'production', EMAIL_DESIGN_SESSION_AUTHORITY: 'pages-auth-me-v1', FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', FIGFLOW_EDM_TEMPLATE_PUBLISH_ENABLED: 'true', FIGFLOW_EDM_DESIGNER_ENABLED: 'false', FIGFLOW_EDM_LIBRARY_ENABLED: 'false' })
const event = (vars: Record<string, unknown> = env()) => ({ context: { cloudflare: { env: vars } } }) as Parameters<typeof designLibrarySession>[0]
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ id: actor }); mocks.headers = { origin: 'https://app.xeroflow.io', 'content-type': 'application/json' } })
describe('Worker-only narrow template publication admission', () => {
  it('admits only the separate publication action without opening the library', async () => {
    const result = await designLibrarySession(event(), true, 'publish-template')
    expect(result.templateOnly).toBe(true)
    await result.authority.publisher(null)
    expect(mocks.publisher).toHaveBeenCalledWith('token', actor, null)
    for (const command of [undefined, 'copy-template-draft', 'revise-template', 'publish-module', 'restore-revision'])
      await expect(designLibrarySession(event(), true, command)).rejects.toMatchObject({ statusCode: 404 })
    await expect(designLibrarySession(event(), false, 'publish-template')).rejects.toMatchObject({ statusCode: 404 })
  })
  it.each(['FIGFLOW_EDM_DRAFT_SAVES_ENABLED', 'FIGFLOW_EDM_TEMPLATE_PUBLISH_ENABLED', 'EMAIL_DESIGN_SESSION_AUTHORITY', 'EMAIL_DESIGN_ENVIRONMENT'])('fails closed for missing or invalid %s', async key => {
    for (const value of [undefined, false, 'false', 'unexpected']) {
      await expect(designLibrarySession(event({ ...env(), [key]: value }), true, 'publish-template')).rejects.toMatchObject({ statusCode: 404 })
    }
    expect(mocks.session).not.toHaveBeenCalled()
  })
  it('keeps origin, expired session, and fresh publisher refusal enforced', async () => {
    mocks.headers.origin = 'https://attacker.test'
    await expect(designLibrarySession(event(), true, 'publish-template')).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.session).not.toHaveBeenCalled()
    mocks.headers.origin = 'https://app.xeroflow.io'
    mocks.session.mockResolvedValue(null)
    await expect(designLibrarySession(event(), true, 'publish-template')).rejects.toMatchObject({ statusCode: 401 })
    mocks.session.mockResolvedValue({ id: actor })
    const result = await designLibrarySession(event(), true, 'publish-template')
    mocks.publisher.mockRejectedValue(Object.assign(new Error('revoked'), { statusCode: 403 }))
    await expect(result.authority.publisher('client')).rejects.toMatchObject({ statusCode: 403 })
  })
})
