import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestCheckpointStaging } from '~~/server/utils/pageStudio/checkpointStagingClient'
import { pageStudioStagingAddress } from '~~/shared/pageStudio/staging'

const scope = { tenantId: 'tenant_a', clientId: '22222222-2222-4222-8222-222222222222', siteId: '11111111-1111-4111-8111-111111111111' }
const request = { scope, auditId: '33333333-3333-4333-8333-333333333333', checkpointId: 'checkpoint_saved', digest: 'a'.repeat(64), expectedEnvironment: 'staging' }
const value = { siteId: scope.siteId, ...pageStudioStagingAddress(scope.siteId), status: 'not_published', canManage: true, active: null, currentDigest: request.digest, failure: null }
const call = vi.fn()
const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', PAGE_STUDIO_MANAGEMENT: { checkpointStaging: call } }
beforeEach(() => {
  call.mockReset()
  call.mockResolvedValue({ ok: true, request, value })
})
describe('native private checkpoint staging client', () => {
  it('passes only the exact retained checkpoint identity to the service', async () => {
    await expect(requestCheckpointStaging(request, env)).resolves.toEqual(value)
    expect(call).toHaveBeenCalledExactlyOnceWith(request)
  })
  it.each([undefined, {}, { ...env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production' }, { ...env, PAGE_STUDIO_MANAGEMENT: {} }])('fails closed before RPC for missing or mismatched environment', async (environment) => {
    await expect(requestCheckpointStaging(request, environment)).rejects.toMatchObject({ code: 'STAGING_SERVICE_UNAVAILABLE' })
    expect(call).not.toHaveBeenCalled()
  })
  it('rejects caller supplied authority before RPC', async () => {
    await expect(requestCheckpointStaging({ ...request, actorId: scope.siteId }, env)).rejects.toMatchObject({ code: 'STAGING_INVALID' })
    expect(call).not.toHaveBeenCalled()
  })
  it.each(['auditId', 'checkpointId', 'digest', 'expectedEnvironment'] as const)('rejects a response for another %s', async (key) => {
    const other = { ...request, [key]: key === 'auditId' ? scope.siteId : key === 'checkpointId' ? 'checkpoint_other' : key === 'digest' ? 'b'.repeat(64) : 'production' }
    call.mockResolvedValue({ ok: true, request: other, value })
    await expect(requestCheckpointStaging(request, env)).rejects.toMatchObject({ code: 'STAGING_SERVICE_UNAVAILABLE' })
  })
  it.each(['tenantId', 'clientId', 'siteId'] as const)('rejects a response for another %s scope', async (key) => {
    call.mockResolvedValue({ ok: true, request: { ...request, scope: { ...scope, [key]: key === 'tenantId' ? 'foreign' : request.auditId } }, value })
    await expect(requestCheckpointStaging(request, env)).rejects.toMatchObject({ code: 'STAGING_SERVICE_UNAVAILABLE' })
  })
  it.each([null, { ok: true, request, value: { ...value, siteId: request.auditId, ...pageStudioStagingAddress(request.auditId) } }, { ok: true, request, value: { ...value, url: 'https://foreign.example' } }, { ok: true, request, value, secret: 'private' }, { ok: false, error: { code: 'STAGING_ACCESS_DENIED', statusCode: 200 } }])('rejects malformed or mismatched responses', async (response) => {
    call.mockResolvedValue(response)
    await expect(requestCheckpointStaging(request, env)).rejects.toMatchObject({ code: 'STAGING_SERVICE_UNAVAILABLE' })
  })
  it('retains bounded denial and build quota errors without retry', async () => {
    call.mockResolvedValue({ ok: false, error: { code: 'STAGING_BUILD_LIMIT', statusCode: 429 } })
    await expect(requestCheckpointStaging(request, env)).rejects.toMatchObject({ code: 'STAGING_BUILD_LIMIT', statusCode: 429 })
    expect(call).toHaveBeenCalledOnce()
  })
  it('redacts unexpected transport errors without retry', async () => {
    call.mockRejectedValue(new Error('private credential'))
    await expect(requestCheckpointStaging(request, env)).rejects.toMatchObject({ code: 'STAGING_SERVICE_UNAVAILABLE', message: 'Checkpoint staging is temporarily unavailable' })
    expect(call).toHaveBeenCalledOnce()
  })
})
