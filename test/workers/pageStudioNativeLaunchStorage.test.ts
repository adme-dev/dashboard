import { beforeEach, expect, it, vi } from 'vitest'
import { handleInspection } from '../../workers/page-studio-management/src/inspection'
import { contentScopeKey } from '../../shared/pageStudio/cmsManaged'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'

const authority = vi.hoisted(() => vi.fn())
vi.mock('../../shared/pageStudio/customerInspectionAuthority', async original => ({ ...await original<object>(), requireCustomerInspectionAuthority: authority }))
const siteId = '10000000-0000-4000-8000-000000000001', clientId = '10000000-0000-4000-8000-000000000002'
const actorId = '10000000-0000-4000-8000-000000000003', workspaceId = '10000000-0000-4000-8000-000000000004'
const scope = { tenantId: 'native', clientId, siteId }
const manifest = { id: siteId, schemaVersion: 2, pages: [{ id: 'page_home', title: 'Home', route: '/', visibility: 'public', seo: {}, forms: [] }] }
const digest = await collectionDigest(manifest)
const checkpointId = 'checkpoint_current', key = `tenants/native/clients/${clientId}/sites/${siteId}/checkpoints/${checkpointId}.json`
const object = () => ({ body: new Response(JSON.stringify({ schemaVersion: 1, checkpointId, digest, scope, manifest })).body! })
const native = { get: vi.fn() }, production = { get: vi.fn() }
const config = () => ({ PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', HYPERDRIVE_FRESH: { connectionString: 'local-test' }, PAGE_STUDIO_CHECKPOINTS: production,
  PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true', PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS: native,
  PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN: 'https://studio-customer-preview.xeroflow.io',
  PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER: { createProvisioning() {}, readProvisioning() {} }, PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER: { readManagedCmsTarget() {} } })
const initial = () => ({ id: siteId, tenant_id: 'native', client_id: clientId, name: 'Native site', status: 'active', delivery_mode: 'runtime',
  checkpoint_id: checkpointId as string | null, checkpoint_digest: digest, object_key: key,
  version_id: null, version_checkpoint_id: null, version_digest: null, version_status: null, review_decision: null, review_digest: null as string | null,
  plan_key: 'customer_preview_v1', plan_status: 'active', plan_current: false, active_releases: [], native_completions: [] as unknown[] })
let row: ReturnType<typeof initial>
const query = vi.fn(async () => ({ rows: [structuredClone(row)] }))
const run = vi.fn(async work => work({ query }))
const request = { operation: 'customer-launch', expectedEnvironment: 'production', actorId, accountId: actorId, workspaceId, siteId }
beforeEach(() => {
  vi.clearAllMocks()
  row = initial()
  authority.mockResolvedValue({ tenantId: 'native', clientId, workspaceId, canManagePublication: false })
  native.get.mockImplementation(async () => object())
  production.get.mockResolvedValue(null)
  query.mockImplementation(async () => ({ rows: [structuredClone(row)] }))
})
it('reads a pretransfer native saved checkpoint from native storage independently of preview publishing entitlement', async () => {
  const result = await handleInspection(request, config(), run)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('Inspection denied')
  const value = JSON.parse(new TextDecoder().decode(result.payload)).value
  expect(value.content.status).toBe('ready')
  expect(value.content.publicPages).toBe(1)
  expect(value.plan.status).toBe('required')
  expect(native.get).toHaveBeenCalledExactlyOnceWith(key)
  expect(production.get).not.toHaveBeenCalled()
  expect(authority).toHaveBeenCalledTimes(2)
})

const completion = () => ({ operationId: '20000000-0000-4000-8000-000000000001', intentDigest: 'a'.repeat(64), completionIntentDigest: 'a'.repeat(64),
  destinationScopeKey: contentScopeKey({ ...scope, businessId: clientId, environment: 'production' }) })
const inspect = (env: Record<string, unknown> = config()) => handleInspection(request, env, run)
async function value(env: Record<string, unknown> = config()) {
  const result = await inspect(env)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('Inspection denied')
  return JSON.parse(new TextDecoder().decode(result.payload)).value
}
it('a publishing grant before transfer does not select destination storage', async () => {
  row.plan_key = 'publishing-test'
  row.plan_current = true
  expect((await value()).content.status).toBe('ready')
  expect(native.get).toHaveBeenCalledOnce()
  expect(production.get).not.toHaveBeenCalled()
})
it('completed transfer selects only production even after native configuration is removed or publication expires', async () => {
  row.native_completions = [completion()]
  row.plan_current = false
  production.get.mockImplementation(async () => object())
  const env = config() as Record<string, unknown>
  for (const key of Object.keys(env)) if (key.startsWith('PAGE_STUDIO_CUSTOMER_PREVIEW_')) Reflect.deleteProperty(env, key)
  expect(await value(env)).toMatchObject({ content: { status: 'ready' }, plan: { status: 'required' } })
  expect(production.get).toHaveBeenCalledExactlyOnceWith(key)
  expect(native.get).not.toHaveBeenCalled()
})
it.each(['flag', 'bucket', 'router', 'provisioner', 'editor'])('missing native %s denies without production fallback', async (field) => {
  const env: Record<string, unknown> = config()
  const name = { flag: 'RUNTIME_ENABLED', bucket: 'CHECKPOINTS', router: 'CONTENT_ROUTER', provisioner: 'PROVISIONER', editor: 'EDITOR_ORIGIN' }[field]!
  Reflect.deleteProperty(env, `PAGE_STUDIO_CUSTOMER_PREVIEW_${name}`)
  production.get.mockImplementation(async () => object())
  expect(await inspect(env)).toEqual({ ok: false, statusCode: 503 })
  expect(native.get).not.toHaveBeenCalled()
  expect(production.get).not.toHaveBeenCalled()
})
it.each(['wrong-digest', 'foreign-scope', 'duplicate', 'malformed'])('rejects %s completion before any checkpoint read', async (failure) => {
  const retained = completion()
  row.native_completions = failure === 'duplicate'
    ? [retained, retained]
    : failure === 'malformed'
      ? [{}]
      : [{ ...retained,
          ...(failure === 'wrong-digest' ? { completionIntentDigest: 'b'.repeat(64) } : { destinationScopeKey: contentScopeKey({ ...scope, siteId: actorId, businessId: clientId, environment: 'production' }) }) }]
  expect(await inspect()).toEqual({ ok: false, statusCode: 409 })
  expect(native.get).not.toHaveBeenCalled()
  expect(production.get).not.toHaveBeenCalled()
})
it.each(['completion', 'checkpoint', 'version'])('denies %s changes during native storage read', async (changed) => {
  native.get.mockImplementation(async () => {
    if (changed === 'completion') row.native_completions = [completion()]
    if (changed === 'checkpoint') row.checkpoint_id = 'new_checkpoint'
    if (changed === 'version') row.review_digest = 'new_digest'
    return object()
  })
  expect(await inspect()).toEqual({ ok: false, statusCode: 409 })
  expect(native.get).toHaveBeenCalledOnce()
  expect(production.get).not.toHaveBeenCalled()
})
it.each(['completion', 'checkpoint'])('checks %s after the final native authority await', async (changed) => {
  authority.mockResolvedValueOnce({ tenantId: 'native', clientId, workspaceId, canManagePublication: false })
    .mockImplementationOnce(async () => {
      if (changed === 'completion') row.native_completions = [completion()]
      else row.checkpoint_id = 'new_checkpoint'
      return { tenantId: 'native', clientId, workspaceId, canManagePublication: false }
    })
  expect(await inspect()).toEqual({ ok: false, statusCode: 409 })
  expect(query.mock.invocationCallOrder.at(-1)).toBeGreaterThan(authority.mock.invocationCallOrder.at(-1)!)
})
it.each(['revoked', 'workspace', 'tenant', 'client'])('final native %s change withholds all content', async (change) => {
  authority.mockResolvedValueOnce({ tenantId: 'native', clientId, workspaceId, canManagePublication: false })
  if (change === 'revoked') authority.mockRejectedValueOnce({ statusCode: 403 })
  else authority.mockResolvedValueOnce({ tenantId: change === 'tenant' ? 'foreign' : 'native', clientId: change === 'client' ? actorId : clientId,
    workspaceId: change === 'workspace' ? actorId : workspaceId, canManagePublication: false })
  expect(await inspect()).toEqual({ ok: false, statusCode: 403 })
})
it('uses final capability and leaves the complete SQL snapshot as the final async observation', async () => {
  authority.mockResolvedValueOnce({ tenantId: 'native', clientId, workspaceId, canManagePublication: true })
    .mockResolvedValueOnce({ tenantId: 'native', clientId, workspaceId, canManagePublication: false })
  expect((await value()).canManagePublication).toBe(false)
  expect(query).toHaveBeenCalledTimes(2)
  expect(query.mock.invocationCallOrder.at(-1)).toBeGreaterThan(authority.mock.invocationCallOrder.at(-1)!)
  const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]]
  expect(params).toEqual(['native', siteId, clientId])
  expect(query.mock.calls[1]).toEqual(query.mock.calls[0])
  expect(sql).toContain('intent.operation_id=terminal.operation_id')
  expect(sql).toContain('intent.site_id=site.id AND intent.tenant_id=site.tenant_id AND intent.client_id=site.client_id')
  expect(sql).toContain('ORDER BY terminal.operation_id')
  expect(sql).not.toContain('intent.intent_digest=terminal.intent_digest')
})
it.each(['missing', 'digest', 'scope', 'manifest'])('keeps %s checkpoint unavailable without trying another bucket', async (failure) => {
  production.get.mockImplementation(async () => object())
  native.get.mockImplementation(async () => failure === 'missing'
    ? null
    : { body: new Response(JSON.stringify({ schemaVersion: 1, checkpointId,
        digest: failure === 'digest' ? 'b'.repeat(64) : digest, scope: failure === 'scope' ? { ...scope, siteId: actorId } : scope,
        manifest: failure === 'manifest' ? { id: siteId } : manifest })).body! })
  expect(await value()).toMatchObject({ content: { status: 'unavailable' }, approvedVersionId: null })
  expect(production.get).not.toHaveBeenCalled()
})
it.each(['bucket', 'get', 'flag'])('rejects native %s configuration drift during final authority', async (changed) => {
  const env: Record<string, unknown> = config()
  authority.mockResolvedValueOnce({ tenantId: 'native', clientId, workspaceId, canManagePublication: false }).mockImplementationOnce(async () => {
    if (changed === 'bucket') env.PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS = { get: native.get }
    if (changed === 'get') native.get = vi.fn()
    if (changed === 'flag') env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED = 'false'
    return { tenantId: 'native', clientId, workspaceId, canManagePublication: false }
  })
  expect(await inspect(env)).toEqual({ ok: false, statusCode: 503 })
})

it('rejects a destination binding change during the final SQL observation', async () => {
  row.native_completions = [completion()]
  production.get.mockImplementation(async () => object())
  const env: Record<string, unknown> = config()
  query.mockImplementationOnce(async () => ({ rows: [structuredClone(row)] })).mockImplementationOnce(async () => {
    env.PAGE_STUDIO_CHECKPOINTS = { get: production.get }
    return { rows: [structuredClone(row)] }
  })
  expect(await inspect(env)).toEqual({ ok: false, statusCode: 503 })
  expect(production.get).toHaveBeenCalledOnce()
})
it('rejects deployment configuration drift during final authority', async () => {
  const env: Record<string, unknown> = config()
  authority.mockResolvedValueOnce({ tenantId: 'native', clientId, workspaceId, canManagePublication: false }).mockImplementationOnce(async () => {
    env.PAGE_STUDIO_RELEASE_ENVIRONMENT = 'staging'
    return { tenantId: 'native', clientId, workspaceId, canManagePublication: false }
  })
  expect(await inspect(env)).toEqual({ ok: false, statusCode: 503 })
})

it('keeps an unsaved native site required without reading either bucket', async () => {
  row.checkpoint_id = null
  expect(await value()).toMatchObject({ content: { status: 'required', publicPages: null }, approvedVersionId: null })
  expect(native.get).not.toHaveBeenCalled()
  expect(production.get).not.toHaveBeenCalled()
  expect(authority).toHaveBeenCalledTimes(2)
})
