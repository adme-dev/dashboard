import { createApp, createRouter, toWebHandler, createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handlePageStudioImages } from '~~/server/utils/pageStudio/imageGenerationHttp'
import { ImageCreditError } from '~~/server/utils/pageStudio/imageCredits'

const mocks = vi.hoisted(() => ({ agency: vi.fn(), portal: vi.fn(), login: vi.fn(), execute: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.agency }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: mocks.portal }))
vi.mock('~~/server/utils/pageStudio/contentNativeLogin', () => ({ preparePageStudioContentLogin: mocks.login }))
vi.mock('~~/server/utils/pageStudio/imageGenerationService', async original => ({ ...await original<typeof import('~~/server/utils/pageStudio/imageGenerationService')>(), executeNativeImageOperation: mocks.execute }))
const siteId = '30000000-0000-4000-8000-000000000003'
const input = { intentId: '10000000-0000-4000-8000-000000000010', prompt: 'Soft abstract light', modelId: '@cf/black-forest-labs/flux-1-schnell', aspect: 'native' }
function request(audience: 'agency' | 'portal', operation: 'catalog' | 'account' | 'quote', body?: string, origin = 'https://studio.test', contentType = 'application/json', query = '') {
  const method = operation === 'quote' ? 'POST' : 'GET'
  const router = createRouter().add('/sites/:siteId/images', event => handlePageStudioImages(event, audience, operation), [method.toLowerCase() as 'get' | 'post'])
  return toWebHandler(createApp().use(router))(new Request(`https://studio.test/sites/${siteId}/images${query}`, {
    method, body, headers: { origin, 'host': 'studio.test', 'content-type': contentType, 'x-forwarded-proto': 'https' }
  }))
}
describe('native image HTTP boundaries', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.agency.mockResolvedValue({ tenantId: 'tenant_test', user: { id: 'staff_test' } })
    mocks.portal.mockResolvedValue({ id: 'portal_test', clientId: '10000000-0000-4000-8000-000000000001' })
    mocks.login.mockImplementation((_event, actor) => ({ role: actor.role, userId: actor.actorId, tokenHash: 'a'.repeat(64) }))
    mocks.execute.mockResolvedValue({ accepted: true })
  })
  it.each(['agency', 'portal'] as const)('binds %s quote to native actor/login/site, with no-store', async (audience) => {
    const response = await request(audience, 'quote', JSON.stringify(input))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ siteId, actor: expect.objectContaining({ actorId: audience === 'agency' ? 'staff_test' : 'portal_test' }), login: expect.objectContaining({ userId: audience === 'agency' ? 'staff_test' : 'portal_test' }) }), 'quote', input)
  })
  it('rejects cross-origin generation before native login or service mutation', async () => {
    expect((await request('portal', 'quote', JSON.stringify(input), 'https://attacker.test')).status).toBe(403)
    expect(mocks.login).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('rejects forged prices, scope, non-JSON and oversized streamed input', async () => {
    for (const extra of [{ credits: 0 }, { scope: { siteId: 'other' } }, { actorId: 'other' }, { providerUrl: 'https://attacker.test' }]) {
      expect((await request('portal', 'quote', JSON.stringify({ ...input, ...extra }))).status).toBe(400)
    }
    expect((await request('portal', 'quote', '{}', undefined, 'text/plain')).status).toBe(415)
    expect((await request('portal', 'quote', ' '.repeat(16_385))).status).toBe(413)
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('does not trust history filters or unbounded pagination', async () => {
    expect((await request('portal', 'account', undefined, undefined, undefined, '?clientId=other')).status).toBe(400)
    expect((await request('portal', 'account', undefined, undefined, undefined, '?limit=1000')).status).toBe(400)
    expect(mocks.execute).not.toHaveBeenCalled()
    expect((await request('portal', 'account', undefined, undefined, undefined, '?limit=10')).status).toBe(200)
  })
  it('requires current native login for reads', async () => {
    mocks.login.mockRejectedValueOnce(createError({ statusCode: 401 }))
    expect((await request('portal', 'catalog')).status).toBe(401)
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('returns stable credit errors without retrying a mutation', async () => {
    mocks.execute.mockRejectedValue(new ImageCreditError('IMAGE_QUOTE_EXPIRED', 410, 'Review a new quote'))
    const response = await request('portal', 'quote', JSON.stringify(input))
    expect(response.status).toBe(410)
    expect((await response.json()).data.error.code).toBe('IMAGE_QUOTE_EXPIRED')
    expect(mocks.execute).toHaveBeenCalledTimes(1)
  })
})
