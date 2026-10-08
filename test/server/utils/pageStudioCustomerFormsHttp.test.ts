import { emailRendererEnv } from '../../fixtures/emailRenderer'
import { describe, expect, it, vi } from 'vitest'
import { createApp, createRouter, eventHandler, toWebHandler } from 'h3'
import { customerFormsHandler } from '../../../server/utils/pageStudio/customerFormsHttp'
import { starterEmailTemplate } from '../../../shared/pageStudio/emailTemplates'
import { createCustomerFormContext, readCustomerFormsWorkspace, readCustomerDefaultWebsite } from '../../../server/utils/pageStudio/customerForms'

const scope = { tenantId: '10000000-0000-4000-8000-000000000001', clientId: '10000000-0000-4000-8000-000000000002', businessId: '10000000-0000-4000-8000-000000000002', siteId: '10000000-0000-4000-8000-000000000003', environment: 'staging' as const }
const authority = { scope, workspaceId: 'workspace_one', actor: { kind: 'customer-user' as const, userId: 'native_one', accountId: 'account_one' }, canEdit: true }
const input = { sessionToken: 'a'.repeat(64), siteId: scope.siteId, environment: 'staging' as const }
const document = { id: scope.siteId, site: { id: scope.siteId, clientId: scope.clientId, name: 'Native business', route: '/' }, studio: undefined, document: null, revision: 0, pageLimit: 4, updatedAt: null }
const config = { PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED: 'true', PAGE_STUDIO_CUSTOMER_ORIGIN: 'https://studio.test', PAGE_STUDIO_CUSTOMER_TERMS_VERSION: 'v1', PAGE_STUDIO_CUSTOMER_EMAIL_FROM: 'studio@example.test', PAGE_STUDIO_CUSTOMER_FORMS_ENABLED: 'true', PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging' }
function http(env: Record<string, unknown> = config, dependencies = {}) {
  const app = createApp()
  const router = createRouter()
  router.use('/sites/:siteId/workspace', eventHandler((event) => {
    event.context.cloudflare = { env }
    return customerFormsHandler(event, 'workspace', 'GET', dependencies)
  }))
  router.use('/sites/:siteId/fields/:audience', eventHandler((event) => {
    event.context.cloudflare = { env }
    return customerFormsHandler(event, 'template-fields', 'GET', dependencies)
  }))
  router.use('/sites/:siteId/recipients', eventHandler((event) => {
    event.context.cloudflare = { env }
    return customerFormsHandler(event, 'recipients', 'PUT', dependencies)
  }))
  router.use('/sites/:siteId/preview/:audience', eventHandler((event) => {
    event.context.cloudflare = { env }
    return customerFormsHandler(event, 'template', 'PREVIEW', dependencies)
  }))
  router.use('/availability', eventHandler((event) => {
    event.context.cloudflare = { env }
    return customerFormsHandler(event, 'availability', 'GET', dependencies)
  }))
  router.use('/sites/:siteId/settings', eventHandler((event) => {
    event.context.cloudflare = { env }
    return customerFormsHandler(event, 'settings', 'PUT', dependencies)
  }))
  router.use('/website', eventHandler((event) => {
    event.context.cloudflare = { env }
    return customerFormsHandler(event, 'website', 'GET', dependencies)
  }))
  for (const prefix of ['/sites/:siteId/templates/:audience', '/sites/:siteId/forms/:definitionId/templates/:audience']) {
    router.use(prefix + '/history', eventHandler((event) => {
      event.context.cloudflare = { env }
      return customerFormsHandler(event, 'template-history', 'GET', dependencies)
    }))
    router.use(prefix + '/history/:revision', eventHandler((event) => {
      event.context.cloudflare = { env }
      return customerFormsHandler(event, 'template-history-version', 'GET', dependencies)
    }))
  }
  app.use(router)
  return toWebHandler(app)
}
const deps = () => ({ authority: vi.fn().mockResolvedValue(authority), document: vi.fn().mockResolvedValue(document), assets: vi.fn().mockResolvedValue([]) })
describe('native form adapters', () => {
  it('accepts only native cookie and returns admitted own workspace', async () => {
    const d = deps()
    const handle = http(config, d)
    expect((await handle(new Request(`https://studio.test/sites/${scope.siteId}/workspace`, { headers: { cookie: 'client_session_token=' + 'b'.repeat(64) } }))).status).toBe(401)
    const response = await handle(new Request(`https://studio.test/sites/${scope.siteId}/workspace`, { headers: { cookie: '__Host-studio_customer_session=' + input.sessionToken } }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ canEdit: true, document: { id: scope.siteId } })
    expect(d.authority.mock.calls.every(([value]) => value.sessionToken === input.sessionToken)).toBe(true)
  })
  it.each([{ PAGE_STUDIO_CUSTOMER_FORMS_ENABLED: 'false' }, { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'production' }])('fails closed with gate %j and retains no-store on errors', async (override) => {
    const response = await http({ ...config, ...override })(new Request(`https://studio.test/sites/${scope.siteId}/workspace`))
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it('enforces exact origin for writes and read-only POST previews', async () => {
    for (const path of ['recipients', 'preview/team']) {
      const response = await http()(new Request(`https://studio.test/sites/${scope.siteId}/${path}`, { method: path === 'recipients' ? 'PUT' : 'POST', headers: { 'origin': 'https://evil.test', 'cookie': '__Host-studio_customer_session=' + input.sessionToken, 'content-type': 'application/json' }, body: '{}' }))
      expect(response.status).toBe(403)
    }
  })
  it('rejects recipient bodies over the existing cap without Worker dispatch', async () => {
    const d = deps()
    const response = await http(config, d)(new Request(`https://studio.test/sites/${scope.siteId}/recipients`, { method: 'PUT', headers: { 'origin': config.PAGE_STUDIO_CUSTOMER_ORIGIN, 'cookie': '__Host-studio_customer_session=' + input.sessionToken, 'content-type': 'application/json' }, body: JSON.stringify({ padding: 'a'.repeat(300000) }) }))
    expect(response.status).toBe(413)
    expect(d.authority).not.toHaveBeenCalled()
  })
  it('does not reveal default site when availability is closed or portal-only', async () => {
    const closed = await http({ ...config, PAGE_STUDIO_CUSTOMER_FORMS_ENABLED: 'false' })(new Request('https://studio.test/availability'))
    expect(await closed.json()).toEqual({ available: false, siteId: null })
    const portal = await http()(new Request('https://studio.test/availability', { headers: { cookie: 'client_session_token=' + 'b'.repeat(64) } }))
    expect(portal.status).toBe(401)
  })
  it('does not consult setup ownership for a site-specific current member', async () => {
    const d = deps()
    const context = createCustomerFormContext(input, {}, d)
    expect(await readCustomerFormsWorkspace(context, d)).toMatchObject({ document: { id: scope.siteId } })
    expect(d.authority).toHaveBeenCalledTimes(2)
  })
  it('rejects revocation or account substitution during parallel workspace reads', async () => {
    const d = deps()
    d.assets.mockImplementation(async () => {
      d.authority.mockResolvedValue({ ...authority, actor: { ...authority.actor, accountId: 'different' } })
      return []
    })
    await expect(readCustomerFormsWorkspace(createCustomerFormContext(input, {}, d), d)).rejects.toThrow()
  })
  it('rediscovery rejects changed default selection after workspace work', async () => {
    const d = deps()
    const discover = vi.fn().mockResolvedValueOnce({ ...authority }).mockResolvedValueOnce({ ...authority, workspaceId: 'other' })
    await expect(readCustomerDefaultWebsite(input.sessionToken, {}, { ...d, discover })).rejects.toThrow()
    expect(discover).toHaveBeenCalledTimes(2)
  })
})

it('rejects an authority selection that differs from discovery even if rediscovery reverts', async () => {
  const d = deps()
  d.authority.mockResolvedValue({ ...authority, workspaceId: 'different-workspace' })
  const discover = vi.fn().mockResolvedValue(authority)
  await expect(readCustomerDefaultWebsite(input.sessionToken, {}, { ...d, discover })).rejects.toThrow()
})

it.each([['settings', 'PUT', 48000], ['preview/team', 'POST', 300000]])('retains the %s observed byte cap', async (path, method, limit) => {
  const response = await http()(new Request(`https://studio.test/sites/${scope.siteId}/${path}`, { method: String(method), headers: { 'origin': config.PAGE_STUDIO_CUSTOMER_ORIGIN, 'cookie': '__Host-studio_customer_session=' + input.sessionToken, 'content-type': 'application/json' }, body: JSON.stringify({ padding: 'a'.repeat(Number(limit)) }) }))
  expect(response.status).toBe(413)
})
it('availability rechecks selection without reading document/assets and withholds changed discovery', async () => {
  const d = deps()
  const discover = vi.fn().mockResolvedValue(authority)
  const response = await http(config, { ...d, discover })(new Request('https://studio.test/availability', { headers: { cookie: '__Host-studio_customer_session=' + input.sessionToken } }))
  expect(await response.json()).toEqual({ available: true, siteId: scope.siteId })
  expect(d.document).not.toHaveBeenCalled()
  expect(d.assets).not.toHaveBeenCalled()
  discover.mockReset().mockResolvedValueOnce(authority).mockResolvedValueOnce({ ...authority, workspaceId: 'changed' })
  const changed = await http(config, { ...d, discover })(new Request('https://studio.test/availability', { headers: { cookie: '__Host-studio_customer_session=' + input.sessionToken } }))
  expect(await changed.json()).toEqual({ available: false, siteId: null })
})
it('default discovery accepts no site selection or body', async () => {
  for (const [path, extra] of [['/website?siteId=other', {}], ['/website', { 'content-length': '1' }], ['/availability?siteId=other', {}]] as const) {
    const response = await http()(new Request('https://studio.test' + path, { headers: { cookie: '__Host-studio_customer_session=' + input.sessionToken, ...extra } }))
    expect(response.status).toBe(400)
  }
})
it('redacts unexpected backend failures and never exposes native tokens', async () => {
  const d = deps()
  d.authority.mockRejectedValue(new Error('private token=' + input.sessionToken))
  const response = await http(config, d)(new Request(`https://studio.test/sites/${scope.siteId}/workspace`, { headers: { cookie: '__Host-studio_customer_session=' + input.sessionToken } }))
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain(input.sessionToken)
})

it('rejects foreign asset rows and returns safe finite summaries without storage keys', async () => {
  const d = deps()
  const asset = { tenantId: scope.tenantId, clientId: scope.clientId, siteId: scope.siteId, id: 'asset_one', scanStatus: 'clean', publicationStatus: 'draft', mediaType: 'image/png', objectKey: 'private-key', renditions: [{ kind: 'original', fileName: 'image.png', size: Number.NaN }] }
  const foreign = { ...d, assets: async () => [{ ...asset, clientId: 'foreign' }] }
  await expect(readCustomerFormsWorkspace(createCustomerFormContext(input, {}, d), foreign)).rejects.toThrow()
  const workspace = await readCustomerFormsWorkspace(createCustomerFormContext(input, {}, d), { ...d, assets: async () => [asset] })
  expect(workspace.assets[0]).toMatchObject({ id: 'asset_one', previewAvailable: true, size: null })
  expect(JSON.stringify(workspace.assets)).not.toContain('private-key')
})

it('native history validates exact queries, projects selected forms and fails closed on older runtimes', async () => {
  const d = deps()
  d.document.mockResolvedValue({ ...document, studio: { checkpointId: 'checkpoint_one', pages: [], formLibrary: { definitions: [{ id: 'contact' }] } } })
  const updatedAt = '2026-10-02T00:00:00.000Z'
  const service = { listEmailTemplateDraftHistory: vi.fn().mockResolvedValue({ scope, audience: 'team', revisions: [{ revision: 2, updatedAt }], nextBeforeRevision: null }), readEmailTemplateDraft: vi.fn().mockResolvedValue({ scope, audience: 'team', actorId: 'private_actor', checkpointId: 'old_checkpoint', revision: 2, updatedAt, template: starterEmailTemplate('team') }) }
  const env = { ...config, PAGE_STUDIO_CONTENT_ROUTER: service }
  const headers = { cookie: '__Host-studio_customer_session=' + input.sessionToken }
  const base = `https://studio.test/sites/${scope.siteId}`
  const handle = http(env, d)
  const list = await handle(new Request(base + '/templates/team/history?beforeRevision=3', { headers }))
  expect(list.status).toBe(200)
  expect(list.headers.get('cache-control')).toBe('private, no-store')
  expect(await list.json()).toEqual({ audience: 'team', canEdit: true, revisions: [{ revision: 2, updatedAt }], nextBeforeRevision: null })
  const detail = await handle(new Request(base + '/forms/contact/templates/team/history/2', { headers }))
  expect(await detail.json()).toEqual({ revision: 2, updatedAt, template: null })
  for (const suffix of ['/templates/team/history?beforeRevision=0', '/templates/team/history?beforeRevision=1&beforeRevision=2', '/templates/team/history?limit=100', '/templates/team/history/01', '/templates/team/history/2?scope=foreign']) {
    const invalid = await handle(new Request(base + suffix, { headers }))
    expect(invalid.status).toBe(400)
    expect(invalid.headers.get('cache-control')).toBe('private, no-store')
  }
  const portal = await handle(new Request(base + '/templates/team/history', { headers: { cookie: 'client_session_token=' + input.sessionToken } }))
  expect(portal.status).toBe(401)
  const old = await http({ ...env, PAGE_STUDIO_CONTENT_ROUTER: { readEmailTemplateDraft: service.readEmailTemplateDraft } }, d)(new Request(base + '/templates/team/history', { headers }))
  expect(old.status).toBe(503)
  expect(await old.text()).toContain('Email template history is unavailable')
})

it('rechecks native authority after the private renderer responds over HTTP', async () => {
  const d = deps()
  d.document.mockResolvedValue({ ...document, studio: { checkpointId: 'checkpoint_one', pages: [{ id: 'home', route: '/', forms: [{ id: 'contact', name: 'Contact', fields: [{ id: 'name', name: 'Name', type: 'text', required: true }] }] }] } } as never)
  const render = vi.fn(async (request: unknown) => {
    const result = await emailRendererEnv.EMAIL_RENDERER.render(request)
    d.authority.mockResolvedValue({ ...authority, actor: { ...authority.actor, accountId: 'revoked_account' } })
    return result
  })
  const handle = http({ ...config, ...emailRendererEnv, EMAIL_RENDERER: { render } }, d)
  const response = await handle(new Request(`https://studio.test/sites/${scope.siteId}/preview/team`, { method: 'POST', headers: { 'origin': 'https://studio.test', 'cookie': '__Host-studio_customer_session=' + input.sessionToken, 'content-type': 'application/json' }, body: JSON.stringify({ pageId: 'home', formId: 'contact', template: starterEmailTemplate('team') }) }))
  expect(render).toHaveBeenCalledOnce()
  expect(response.status).toBe(403)
  expect(await response.text()).not.toContain('<!DOCTYPE html>')
})

it('native field options cannot use portal cookies or disclose fields without a native session and ready capability', async () => {
  const d = deps()
  const handle = http(config, d)
  const url = `https://studio.test/sites/${scope.siteId}/fields/team?pageId=home&formId=contact`
  expect((await handle(new Request(url, { headers: { cookie: 'client_session_token=' + 'b'.repeat(64) } }))).status).toBe(401)
  expect((await http({ ...config, PAGE_STUDIO_CUSTOMER_FORMS_ENABLED: 'false' }, d)(new Request(url))).status).toBe(404)
  expect(d.document).not.toHaveBeenCalled()
})
