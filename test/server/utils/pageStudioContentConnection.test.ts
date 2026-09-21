import { beforeEach, describe, expect, it, vi } from 'vitest'
import { connectPageStudioContent, getPageStudioContentConnection } from '~~/server/utils/pageStudio/contentConnection'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), query: vi.fn(), prepare: vi.fn(), login: vi.fn(), nativeLogin: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/contentNativeLogin', () => ({ preparePageStudioContentLogin: mocks.nativeLogin }))
vi.mock('~~/server/utils/pageStudio/businessContent', () => ({ authorizePageStudioBusinessContent: mocks.authorize }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.query, transactionWithoutRetry: (callback: (db: unknown) => unknown) => callback({}) }))
vi.mock('~~/server/utils/pageStudio/contentAttachmentIntent', () => ({ preparePageStudioContentAttachment: mocks.prepare }))
vi.mock('~~/server/utils/pageStudio/loginSessions', () => ({ resolvePageStudioLoginSession: mocks.login }))
const scope = { tenantId: 'tenant', clientId: '20000000-0000-4000-8000-000000000001', businessId: '20000000-0000-4000-8000-000000000001', siteId: '50000000-0000-4000-8000-000000000001', environment: 'staging' }
function context() {
  const binding = { createProvisioning: vi.fn(), readProvisioning: vi.fn(), resolveContentRoute: vi.fn(async () => null),
    readContentAttachment: vi.fn(async () => null), createContentAttachment: vi.fn() }
  return { binding, input: { actor: { role: 'agency' as const, actorId: '30000000-0000-4000-8000-000000000001', tenantId: 'tenant', canEdit: true },
    siteId: scope.siteId, env: { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging', PAGE_STUDIO_PROVISIONER: binding }, event: {} as never } }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.nativeLogin.mockResolvedValue({})
  mocks.authorize.mockResolvedValue({ scope })
  mocks.query.mockResolvedValue({ current_checkpoint_id: 'checkpoint_1', metadata: null })
})
describe('CMS connection status', () => {
  it('reads readiness without creating an intent or resources', async () => {
    const c = context()
    expect(await getPageStudioContentConnection(c.input)).toMatchObject({ status: 'unconnected', body: { expectedCheckpointId: 'checkpoint_1' } })
    expect(c.binding.createContentAttachment).not.toHaveBeenCalled()
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it('recognizes a normal existing content route', async () => {
    const c = context()
    c.binding.resolveContentRoute.mockResolvedValue({ scope } as never)
    expect(await getPageStudioContentConnection(c.input)).toEqual({ status: 'connected' })
    expect(c.binding.readContentAttachment).not.toHaveBeenCalled()
  })
  it('denies scope substitution by the coordinator', async () => {
    const c = context()
    c.binding.resolveContentRoute.mockResolvedValue({ scope: { ...scope, siteId: 'foreign' } } as never)
    await expect(getPageStudioContentConnection(c.input)).rejects.toThrow()
  })
  it('withholds connection status when the native login is revoked during the remote read', async () => {
    const c = context()
    c.binding.resolveContentRoute.mockImplementationOnce(async () => {
      mocks.nativeLogin.mockRejectedValue(new Error('Login revoked'))
      return { scope } as never
    })
    await expect(getPageStudioContentConnection(c.input)).rejects.toThrow('Login revoked')
    expect(mocks.nativeLogin).toHaveBeenCalledTimes(2)
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(c.binding.createContentAttachment).not.toHaveBeenCalled()
  })
})

const intent = { actor: { kind: 'agency-user', loginSessionHash: 'a'.repeat(64), userId: '30000000-0000-4000-8000-000000000001' },
  anchor: { checkpointId: 'checkpoint_1', digest: 'b'.repeat(64) }, mode: 'attach-existing-content', operationId: 'attachment_one',
  policyVersion: 'content-attachment-v1', runtimeDigest: 'c'.repeat(64), schemaDigest: 'd'.repeat(64), scope, version: 1 }
it('requires agency reconciliation when the originating login changes', async () => {
  const c = context()
  mocks.query.mockResolvedValue({ current_checkpoint_id: 'checkpoint_1', metadata: { intent } })
  mocks.login.mockResolvedValue({ userId: intent.actor.userId, tokenHash: 'e'.repeat(64) })
  expect(await getPageStudioContentConnection(c.input)).toEqual({ status: 'reconciliation' })
  expect(mocks.prepare).not.toHaveBeenCalled()
})
it('returns the same retained retry request only to its original login', async () => {
  const c = context(), body = { requestId: '10000000-0000-4000-8000-000000000001', expectedCheckpointId: 'checkpoint_1' }
  mocks.query.mockResolvedValue({ current_checkpoint_id: 'checkpoint_new', metadata: { intent, body } })
  mocks.login.mockResolvedValue({ userId: intent.actor.userId, tokenHash: intent.actor.loginSessionHash })
  expect(await getPageStudioContentConnection(c.input)).toEqual({ status: 'retry', body })
})
it('does not offer connection without a durable checkpoint', async () => {
  const c = context()
  mocks.query.mockResolvedValue({ current_checkpoint_id: null, metadata: null })
  expect(await getPageStudioContentConnection(c.input)).toEqual({ status: 'reconciliation' })
})
it('stops before coordinator access when native permission is denied', async () => {
  const c = context()
  mocks.authorize.mockRejectedValue(new Error('Denied'))
  await expect(getPageStudioContentConnection(c.input)).rejects.toThrow('Denied')
  expect(c.binding.resolveContentRoute).not.toHaveBeenCalled()
})
it('creates setup only from a native intent and server-owned artifacts', async () => {
  const c = context(), bucket = { get: vi.fn() }, body = { requestId: 'request' }
  mocks.prepare.mockResolvedValue({ intent })
  c.binding.createContentAttachment.mockResolvedValue({ operationId: intent.operationId, status: 'connected' })
  expect(await connectPageStudioContent({ ...c.input, body, env: { ...c.input.env, PAGE_STUDIO_CHECKPOINTS: bucket,
    PAGE_STUDIO_CONTENT_ATTACHMENT_SCHEMA_DIGEST: intent.schemaDigest, PAGE_STUDIO_CONTENT_ATTACHMENT_RUNTIME_DIGEST: intent.runtimeDigest } })).toEqual({ status: 'connected' })
  expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({ body, bucket, environment: 'staging', artifacts: {
    policyVersion: 'content-attachment-v1', schemaDigest: intent.schemaDigest, runtimeDigest: intent.runtimeDigest } }))
  expect(c.binding.createContentAttachment).toHaveBeenCalledWith(intent)
})
it('rejects coordinator completion for another operation', async () => {
  const c = context()
  mocks.prepare.mockResolvedValue({ intent })
  c.binding.createContentAttachment.mockResolvedValue({ operationId: 'foreign', status: 'connected' })
  await expect(connectPageStudioContent({ ...c.input, body: {}, env: { ...c.input.env, PAGE_STUDIO_CHECKPOINTS: { get: vi.fn() } } })).rejects.toThrow()
})
