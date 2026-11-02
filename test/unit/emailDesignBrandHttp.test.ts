import { beforeEach, describe, expect, it, vi } from 'vitest'
import { designBrandSession } from '../../server/utils/email-marketing/designBrandHttp'

const mocks = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn(), manager: vi.fn(), headers: {} as Record<string, string> }))
vi.mock('h3', async original => ({ ...(await original<typeof import('h3')>()), getCookie: () => 'token', getHeader: (_event: unknown, key: string) => mocks.headers[key], setHeader: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ validateSession: mocks.session }))
vi.mock('~~/server/utils/email-marketing/designAccess', () => ({ assertFreshDesignAccess: mocks.access, assertFreshDesignPublisher: mocks.manager }))
const actorId = crypto.randomUUID()
const event = () => ({ context: { cloudflare: { env: { FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', FIGFLOW_EDM_DESIGNER_ENABLED: 'true', FIGFLOW_EDM_BRAND_ENABLED: 'true' } } } }) as Parameters<typeof designBrandSession>[0]
describe('independent brand/lock HTTP admission', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.headers = { 'origin': 'https://app.xeroflow.io', 'content-type': 'application/json' }
    mocks.session.mockResolvedValue({ id: actorId })
    mocks.access.mockResolvedValue('designer')
  })
  it('requires all three explicit gates independently, with no library flag dependency', async () => {
    for (const flag of ['FIGFLOW_EDM_DRAFT_SAVES_ENABLED', 'FIGFLOW_EDM_DESIGNER_ENABLED', 'FIGFLOW_EDM_BRAND_ENABLED']) {
      const e = event()
      const env = e.context.cloudflare!.env as Record<string, string>
      env[flag] = 'false'
      await expect(designBrandSession(e, true)).rejects.toMatchObject({ statusCode: 404 })
    }
    expect(mocks.session).not.toHaveBeenCalled()
    await expect(designBrandSession(event(), true)).resolves.toHaveProperty('authority')
  })
  it('binds authenticated actor and independently rechecks policy manager and designer authority', async () => {
    const { authority } = await designBrandSession(event(), true)
    expect(authority.actorId).toBe(actorId)
    await authority.publisher(null)
    expect(mocks.manager).toHaveBeenCalledWith('token', actorId, null)
    mocks.access.mockResolvedValue('staff')
    await expect(authority.designer(null)).rejects.toMatchObject({ statusCode: 403 })
    mocks.session.mockResolvedValue(null)
    await expect(designBrandSession(event(), true)).rejects.toMatchObject({ statusCode: 401 })
  })
  it('rejects cross-origin mutations before reaching session or service', async () => {
    mocks.headers.origin = 'https://attacker.test'
    await expect(designBrandSession(event(), true)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.session).not.toHaveBeenCalled()
  })
})
