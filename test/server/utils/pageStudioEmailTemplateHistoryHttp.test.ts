import { describe, expect, it, vi } from 'vitest'
import { createApp, createRouter, eventHandler, toWebHandler } from 'h3'
import { handleEmailTemplate } from '../../../server/utils/pageStudio/emailTemplatesHttp'
import { starterEmailTemplate } from '../../../shared/pageStudio/emailTemplates'

const mocks = vi.hoisted(() => ({ actor: vi.fn(), login: vi.fn(), context: vi.fn() }))
vi.mock('../../../server/utils/pageStudio/httpActor', () => ({ resolvePageStudioHttpActor: mocks.actor }))
vi.mock('../../../server/utils/pageStudio/contentNativeLogin', () => ({ preparePageStudioContentLogin: mocks.login }))
vi.mock('../../../server/utils/pageStudio/portalFormContext', () => ({ portalFormContext: mocks.context }))
const scope = { tenantId: 'tenant_one', clientId: 'client_one', businessId: 'client_one', siteId: 'site_one', environment: 'staging' as const }
function setup() {
  const updatedAt = '2026-10-02T00:00:00.000Z'
  const service = { listEmailTemplateDraftHistory: vi.fn().mockResolvedValue({ scope, audience: 'team', revisions: [{ revision: 2, updatedAt }], nextBeforeRevision: null }), readEmailTemplateDraft: vi.fn().mockResolvedValue({ scope, audience: 'team', actorId: 'private_actor', checkpointId: 'old_checkpoint', revision: 2, updatedAt, template: starterEmailTemplate('team') }) }
  const context = { service, authorize: vi.fn().mockResolvedValue({ scope, actorId: 'invited_client', authorityKey: 'portal-login', canEdit: false }), readDocument: vi.fn().mockResolvedValue({ id: scope.siteId, site: { id: scope.siteId, clientId: scope.clientId }, studio: { pages: [], formLibrary: { definitions: [{ id: 'contact' }] } } }) }
  mocks.actor.mockResolvedValue({ role: 'client', actorId: 'invited_client' })
  mocks.login.mockResolvedValue({})
  mocks.context.mockReturnValue(context)
  const app = createApp(), router = createRouter()
  for (const prefix of ['/sites/:siteId/templates/:audience', '/sites/:siteId/forms/:definitionId/templates/:audience']) {
    router.use(prefix + '/history', eventHandler(event => handleEmailTemplate(event, 'HISTORY')))
    router.use(prefix + '/history/:revision', eventHandler(event => handleEmailTemplate(event, 'HISTORY_VERSION')))
  }
  app.use(router)
  return { handle: toWebHandler(app), service, context, updatedAt }
}
describe('portal template history HTTP adapter', () => {
  it('uses invited-client current authority and strips private detail on website and shared-form routes', async () => {
    const s = setup()
    const list = await s.handle(new Request('https://portal.test/sites/site_one/templates/team/history'))
    expect(list.status).toBe(200)
    expect(await list.json()).toMatchObject({ canEdit: false })
    expect(mocks.actor).toHaveBeenCalledWith(expect.anything(), 'portal', false)
    const detail = await s.handle(new Request('https://portal.test/sites/site_one/forms/contact/templates/team/history/2'))
    expect(await detail.json()).toEqual({ revision: 2, updatedAt: s.updatedAt, template: null })
    expect(detail.headers.get('cache-control')).toBe('private, no-store')
  })
  it('rejects injected parameters and returns no-store for unavailable history and missing revisions', async () => {
    const s = setup()
    for (const suffix of ['/history?beforeRevision=-1', '/history?beforeRevision=1&beforeRevision=2', '/history?tenantId=foreign', '/history/2?revision=3', '/history/0', '/history/1e3']) {
      const response = await s.handle(new Request('https://portal.test/sites/site_one/templates/team' + suffix))
      expect(response.status).toBe(400)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    }
    expect(s.service.listEmailTemplateDraftHistory).not.toHaveBeenCalled()
    s.service.listEmailTemplateDraftHistory.mockRejectedValue(new Error('RPC method not implemented'))
    const missing = await s.handle(new Request('https://portal.test/sites/site_one/templates/team/history'))
    expect(missing.status).toBe(503)
    expect(await missing.text()).toContain('Email template history is unavailable')
    s.service.readEmailTemplateDraft.mockResolvedValue(null)
    expect((await s.handle(new Request('https://portal.test/sites/site_one/templates/team/history/2'))).status).toBe(404)
  })
})
