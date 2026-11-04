import { beforeEach, describe, expect, it, vi } from 'vitest'
import { designLibraryHttpError, designLibrarySession } from '../../server/utils/email-marketing/designLibraryHttp'

const mocks = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn(), publisher: vi.fn(), headers: {} as Record<string, string> }))
vi.mock('h3', async original => ({ ...(await original<typeof import('h3')>()), getCookie: () => 'token', getHeader: (_event: unknown, key: string) => mocks.headers[key], setHeader: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ validateSession: mocks.session }))
vi.mock('~~/server/utils/email-marketing/designAccess', () => ({ assertFreshDesignAccess: mocks.access, assertFreshDesignPublisher: mocks.publisher }))
const actor = '10000000-0000-4000-8000-000000000001'
const event = () => ({ context: { cloudflare: { env: { FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', FIGFLOW_EDM_DESIGNER_ENABLED: 'true', FIGFLOW_EDM_LIBRARY_ENABLED: 'true' } } } }) as Parameters<typeof designLibrarySession>[0]
describe('independent library HTTP authority admission', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.headers = { 'origin': 'https://app.xeroflow.io', 'content-type': 'application/json' }
    mocks.session.mockResolvedValue({ id: actor })
    mocks.access.mockResolvedValue('designer')
  })
  it('fails closed until all independent private feature gates are explicitly enabled', async () => {
    for (const flag of ['FIGFLOW_EDM_DRAFT_SAVES_ENABLED', 'FIGFLOW_EDM_DESIGNER_ENABLED', 'FIGFLOW_EDM_LIBRARY_ENABLED']) {
      const e = event()
      const env = e.context.cloudflare!.env as Record<string, string>
      env[flag] = 'false'
      await expect(designLibrarySession(e, true)).rejects.toMatchObject({ statusCode: 404 })
    }
    expect(mocks.session).not.toHaveBeenCalled()
  })
  it('binds actor to validated session and separates current read/designer/publisher rights', async () => {
    const { authority } = await designLibrarySession(event(), true)
    expect(authority.actorId).toBe(actor)
    await authority.publisher(null)
    expect(mocks.publisher).toHaveBeenCalledWith('token', actor, null)
    mocks.access.mockResolvedValue('staff')
    await expect(authority.designer(null)).rejects.toMatchObject({ code: 'DESIGNER_REQUIRED' })
    await expect(authority.read(null)).resolves.toBeUndefined()
    mocks.session.mockResolvedValue(null)
    await expect(designLibrarySession(event(), true)).rejects.toMatchObject({ statusCode: 401 })
  })
  it('enforces mutation origin before session/service work and gives content-free unknown-outcome errors', async () => {
    mocks.headers.origin = 'https://attacker.test'
    await expect(designLibrarySession(event(), true)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.session).not.toHaveBeenCalled()
    expect(() => designLibraryHttpError(new Error('SQL/secret/untrusted content'))).toThrow('design_library_outcome_unknown')
  })
})
