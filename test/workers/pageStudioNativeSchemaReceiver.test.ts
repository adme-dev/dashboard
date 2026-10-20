import { beforeEach, expect, it, vi } from 'vitest'
import { NativeSchemaContracts, NATIVE_SCHEMA_AUTHORITY_URL } from '../../shared/pageStudio/nativeSchemaAuthority'
import { handleNativeSchemaAuthorityFetch } from '../../workers/page-studio-management/src/nativeSchemaAuthority'

const authorize = vi.hoisted(() => vi.fn())
vi.mock('../../server/utils/pageStudio/customerSchemaUpgrade', () => ({ authorizeCustomerSchemaUpgrade: authorize }))
const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true' }
const run = vi.fn()
const intent = { version: 1, policyVersion: 'collection-upgrade-v1', accountId: 'a'.repeat(32), databaseId: '10000000-0000-4000-8000-000000000001', name: `ps-content-${'a'.repeat(32)}`, operationId: 'operation',
  actor: { kind: 'customer-user', userId: '10000000-0000-4000-8000-000000000002', loginSessionHash: 'a'.repeat(64) },
  scope: { tenantId: 'tenant', clientId: 'client', businessId: 'client', siteId: 'site', environment: 'staging' },
  sourceDigest: NativeSchemaContracts.collection.schema.shape.sourceDigest.value, targetDigest: NativeSchemaContracts.collection.schema.shape.targetDigest.value }
const input = { expectedControlPlaneEnvironment: 'production', kind: 'collection', intent }
const request = (body: unknown = input, url = NATIVE_SCHEMA_AUTHORITY_URL) => new Request(url, { method: 'POST', body: JSON.stringify(body) })
beforeEach(() => {
  vi.clearAllMocks()
  authorize.mockImplementation(async (_contract, value) => value)
})
it('invokes the unchanged full authority helper with the fresh transaction runner on every call', async () => {
  for (let i = 0; i < 2; i++) expect(await (await handleNativeSchemaAuthorityFetch(request(), env, run)).json()).toEqual({ ok: true, value: intent })
  expect(authorize).toHaveBeenCalledTimes(2)
  expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ kind: 'collection' }), intent, 'staging', { runTransaction: run })
})
it.each(['https://other.internal/native-schema-authority', NATIVE_SCHEMA_AUTHORITY_URL + '?x=1', NATIVE_SCHEMA_AUTHORITY_URL + '/other'])('rejects other URLs: %s', async (url) => {
  expect((await handleNativeSchemaAuthorityFetch(request(input, url), env, run)).status).toBe(404)
  expect(authorize).not.toHaveBeenCalled()
})
it('rejects all other methods and disabled or wrong control planes', async () => {
  expect((await handleNativeSchemaAuthorityFetch(new Request(NATIVE_SCHEMA_AUTHORITY_URL), env, run)).status).toBe(404)
  for (const config of [{ ...env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }, { ...env, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false' }]) {
    expect(await (await handleNativeSchemaAuthorityFetch(request(), config, run)).json()).toMatchObject({ ok: false })
  }
  expect(authorize).not.toHaveBeenCalled()
})
it.each([{}, { ...input, extra: true }, { ...input, intent: { ...intent, extra: true } }, { ...input, intent: { ...intent, actor: { ...intent.actor, kind: 'agency-user' } } }, { ...input, intent: { ...intent, scope: { ...intent.scope, environment: 'production' } } }])('rejects malformed and nonnative input', async (body) => {
  expect(await (await handleNativeSchemaAuthorityFetch(request(body), env, run)).json()).toMatchObject({ ok: false, error: { statusCode: 400 } })
  expect(authorize).not.toHaveBeenCalled()
})
it.each([403, 409, 500])('sanitizes fresh authority denial %s without retries', async (statusCode) => {
  authorize.mockRejectedValue({ statusCode, message: 'private-secret' })
  const response = await handleNativeSchemaAuthorityFetch(request(), env, run)
  const body = await response.text()
  expect(body).not.toContain('private-secret')
  expect(JSON.parse(body).ok).toBe(false)
  expect(authorize).toHaveBeenCalledOnce()
})
