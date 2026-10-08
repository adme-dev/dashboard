import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, createRouter, eventHandler, toWebHandler } from 'h3'
import { starterEmailTemplate } from '../../../shared/pageStudio/emailTemplates'
import { handleEmailTemplateAi } from '../../../server/utils/pageStudio/emailTemplateAiHttp'

const mocks = vi.hoisted(() => ({ actor: vi.fn(), login: vi.fn(), context: vi.fn(), generate: vi.fn(), models: vi.fn(), resolver: vi.fn(), usage: vi.fn(), allowance: vi.fn() }))
vi.mock('../../../server/utils/pageStudio/httpActor', () => ({ resolvePageStudioHttpActor: mocks.actor }))
vi.mock('../../../server/utils/pageStudio/contentNativeLogin', () => ({ preparePageStudioContentLogin: mocks.login }))
vi.mock('../../../server/utils/pageStudio/portalFormContext', () => ({ portalFormContext: mocks.context }))
vi.mock('../../../server/utils/pageStudio/emailTemplateGeneration', () => ({ generateEmailTemplateProposal: mocks.generate }))
vi.mock('../../../server/utils/pageStudio/emailTemplateModel', () => ({ createEmailTemplateModelResolver: mocks.resolver, listEmailTemplateModels: mocks.models }))
vi.mock('../../../server/utils/pageStudio/emailTemplateUsage', () => ({ createPortalEmailTemplateUsage: mocks.usage, readPortalEmailTemplateAllowance: mocks.allowance }))
const siteId = '30000000-0000-4000-8000-000000000001'
const scope = { tenantId: 'tenant', clientId: 'client', businessId: 'client', siteId, environment: 'staging' }
const body = () => ({ operationId: crypto.randomUUID(), modelId: 'groq/model', prompt: 'Improve heading', pageId: 'contact', formId: 'enquiry', checkpointId: 'checkpoint', expectedRevision: 0, customised: false, template: starterEmailTemplate('team') })
function setup(models: unknown = '["groq/model"]') {
  const context = { authorize: vi.fn().mockResolvedValue({ scope, actorId: 'editor', authorityKey: 'current', canEdit: true }), readDocument: vi.fn().mockResolvedValue({ id: siteId, site: { id: siteId, clientId: 'client' }, studio: { formLibrary: { definitions: [{ id: 'enquiry' }] } } }) }
  mocks.context.mockReturnValue(context)
  const app = createApp(), router = createRouter()
  for (const prefix of ['/sites/:siteId/templates/:audience', '/sites/:siteId/forms/:definitionId/templates/:audience']) {
    router.use(prefix + '/ai', eventHandler((event) => {
      event.context.cloudflare = { env: { PAGE_STUDIO_EMAIL_AI_MODELS: models } }
      return handleEmailTemplateAi(event)
    }))
  }
  app.use(router)
  const handle = toWebHandler(app)
  const url = `https://studio.test/sites/${siteId}/templates/team/ai`
  const post = (value: unknown = body(), origin = 'https://studio.test', target = url) => handle(new Request(target, { method: 'POST', headers: { origin, 'host': 'studio.test', 'x-forwarded-proto': 'https', 'content-type': 'application/json' }, body: JSON.stringify(value) }))
  return { handle, url, post, context }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.actor.mockResolvedValue({ role: 'client', actorId: 'editor', clientId: 'client' })
  mocks.login.mockResolvedValue({ tokenHash: 'private-login' })
  mocks.generate.mockResolvedValue({ summary: 'Review proposal' })
  mocks.models.mockResolvedValue([{ id: 'groq/model', label: 'Model' }])
  mocks.allowance.mockResolvedValue({ period: '2026-10-01', used: '2', limit: 10, remaining: 8 })
  mocks.usage.mockReturnValue({ reserve: vi.fn(), settle: vi.fn() })
  mocks.resolver.mockReturnValue(vi.fn())
})
describe('email AI HTTP boundary', () => {
  it('returns configured models and current allowance without exposing scope or login', async () => {
    const s = setup()
    const result = await s.handle(new Request(s.url))
    expect(result.status).toBe(200)
    expect(result.headers.get('cache-control')).toBe('private, no-store')
    expect(await result.json()).toEqual({ available: true, reason: null, models: [{ id: 'groq/model', label: 'Model' }], allowance: { period: '2026-10-01', used: '2', limit: 10, remaining: 8 } })
    expect(mocks.generate).not.toHaveBeenCalled()
  })
  it('derives shared-form target from the route and uses write authority', async () => {
    const s = setup(), request = body()
    const result = await s.post(request, 'https://studio.test', `https://studio.test/sites/${siteId}/forms/enquiry/templates/team/ai`)
    expect(result.status).toBe(200)
    expect(mocks.actor).toHaveBeenCalledWith(expect.anything(), 'portal', true)
    expect(mocks.generate).toHaveBeenCalledWith(s.context, { apiAudience: 'portal', audience: 'team', definitionId: 'enquiry' }, request, expect.objectContaining({ reserve: expect.any(Function), resolveModel: expect.any(Function) }))
  })
  it.each([undefined, '', 'not-json', '[]', '["groq/model","groq/model"]'])('keeps invalid or absent enablement closed (%s)', async (enabled) => {
    const s = setup(enabled === undefined ? null : enabled)
    expect((await s.handle(new Request(s.url))).status).toBe(200)
    expect((await s.post()).status).toBe(503)
    expect(mocks.generate).not.toHaveBeenCalled()
  })
  it('rejects cross-origin, wrong methods, scope injection and query parameters before generation', async () => {
    const s = setup()
    expect((await s.post(body(), 'https://evil.test')).status).toBe(403)
    expect((await s.handle(new Request(s.url, { method: 'DELETE' }))).status).toBe(405)
    expect((await s.post({ ...body(), siteId: 'foreign' })).status).toBe(400)
    expect((await s.post(body(), 'https://studio.test', s.url + '?models=other')).status).toBe(400)
    expect(mocks.generate).not.toHaveBeenCalled()
  })
  it('bounds streamed JSON and refuses non-JSON content', async () => {
    const s = setup()
    expect((await s.post({ ...body(), prompt: 'x'.repeat(300_000) })).status).toBe(413)
    expect((await s.handle(new Request(s.url, { method: 'POST', headers: { 'origin': 'https://studio.test', 'host': 'studio.test', 'x-forwarded-proto': 'https', 'content-type': 'text/plain' }, body: '{}' }))).status).toBe(415)
    expect(mocks.generate).not.toHaveBeenCalled()
  })
  it('rechecks authority after allowance lookup and never releases options after revocation', async () => {
    const s = setup()
    mocks.allowance.mockImplementation(async () => {
      s.context.authorize.mockResolvedValue({ scope, actorId: 'editor', authorityKey: 'revoked', canEdit: true })
      return { period: '2026-10-01', used: '2', limit: 10, remaining: 8 }
    })
    expect((await s.handle(new Request(s.url))).status).toBe(403)
  })
  it('rejects a missing shared definition, foreign document and read-only actor', async () => {
    const s = setup()
    expect((await s.handle(new Request(`https://studio.test/sites/${siteId}/forms/missing/templates/team/ai`))).status).toBe(404)
    s.context.readDocument.mockResolvedValue({ id: 'foreign', site: { id: 'foreign', clientId: 'client' } })
    expect((await s.handle(new Request(s.url))).status).toBe(403)
    s.context.authorize.mockResolvedValue({ scope, actorId: 'editor', authorityKey: 'current', canEdit: false })
    expect((await s.handle(new Request(s.url))).status).toBe(403)
    expect(mocks.allowance).not.toHaveBeenCalled()
  })
  it('returns an exhausted allowance without implying a new generation is available', async () => {
    const s = setup()
    mocks.allowance.mockResolvedValue({ period: '2026-10-01', used: '10', limit: 10, remaining: 0 })
    const response = await s.handle(new Request(s.url))
    expect(await response.json()).toMatchObject({ available: true, allowance: { remaining: 0 } })
    expect(mocks.generate).not.toHaveBeenCalled()
  })
  it('requires current authority for options and sanitizes unknown failures', async () => {
    const s = setup()
    s.context.authorize.mockRejectedValue(Object.assign(new Error('private database response'), { statusCode: 403 }))
    const denied = await s.handle(new Request(s.url))
    expect(denied.status).toBe(403)
    expect(await denied.text()).not.toContain('private database')
    expect(mocks.allowance).not.toHaveBeenCalled()
  })
})
