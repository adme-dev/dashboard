import { describe, expect, it } from 'vitest'
import { CmsGraphTransitionSchema, CmsManagementRequestSchema, cmsManagementResultSchema } from '~~/shared/pageStudio/cmsManagementContract'

const uuid = '10000000-0000-4000-8000-000000000001', digest = 'a'.repeat(64)
const checkpoint = { checkpointId: 'checkpoint_1', digest, objectKey: 'checkpoint.json', createdAt: '2026-10-21T00:00:00.000Z',
  etag: 'etag', userId: 'owner', scope: { tenantId: 'tenant', clientId: uuid, siteId: uuid } }
const transition = () => ({ operationId: 'operation_1', candidateId: 'candidate_1', candidateDigest: digest,
  expectedApplication: { id: uuid, digest }, expectedCheckpoint: { id: 'checkpoint_0', digest }, expectedContent: null,
  contentRevision: 0, nextCheckpoint: structuredClone(checkpoint), preparations: [], summary: 'Save content' })
const request = (body = transition()) => ({ operation: 'transition', expectedEnvironment: 'production', contentEnvironment: 'staging', body,
  principal: { source: 'native-login', request: { actor: { role: 'agency', actorId: 'owner', tenantId: 'tenant', canEdit: true }, siteId: uuid,
    login: { role: 'agency', userId: 'owner', tokenHash: digest, issuedAt: '2026-10-21T00:00:00.000Z', expiresAt: '2026-10-22T00:00:00.000Z' } } } })
function changed(value: unknown, path: string, replacement: unknown) {
  const result = structuredClone(value) as Record<string, unknown>
  const keys = path.split('.'), last = keys.pop()!
  let target = result
  for (const key of keys) target = target[key] as Record<string, unknown>
  target[last] = replacement
  return result
}

describe('CMS management wire validation parity', () => {
  it.each(['A', 'a'.repeat(128), 'Abc_123-xy'])('preserves accepted scoped ID %s and full parsed output', (id) => {
    const value = request({ ...transition(), operationId: id, candidateId: id, expectedCheckpoint: { id, digest } })
    expect(CmsManagementRequestSchema.parse(value)).toStrictEqual(value)
  })
  it.each(['', 'a'.repeat(129), '_leading', 'space invalid', 'a.b', 'é'])('rejects scoped ID %s everywhere it is shared', (id) => {
    for (const path of ['body.operationId', 'body.candidateId', 'body.expectedCheckpoint.id', 'body.nextCheckpoint.checkpointId', 'principal.request.actor.actorId', 'principal.request.login.userId'])
      expect(CmsManagementRequestSchema.safeParse(changed(request(), path, id)).success).toBe(false)
  })
  it.each(['A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), '', null])('rejects invalid digest %s', (invalid) => {
    for (const path of ['body.candidateDigest', 'body.expectedApplication.digest', 'body.expectedCheckpoint.digest', 'body.nextCheckpoint.digest', 'principal.request.login.tokenHash'])
      expect(CmsManagementRequestSchema.safeParse(changed(request(), path, invalid)).success).toBe(false)
  })
  it.each([0, 1, Number.MAX_SAFE_INTEGER])('retains nonnegative safe content revision %s', (contentRevision) => {
    const value = request({ ...transition(), contentRevision })
    expect(CmsManagementRequestSchema.parse(value)).toStrictEqual(value)
  })
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, '1', null])('rejects content revision %s', (revision) => {
    expect(CmsManagementRequestSchema.safeParse(changed(request(), 'body.contentRevision', revision)).success).toBe(false)
  })
  it.each(['body', 'body.expectedApplication', 'body.expectedCheckpoint', 'body.nextCheckpoint', 'body.nextCheckpoint.scope', 'principal.request.actor', 'principal.request.login'])('keeps %s strict', (path) => {
    const value = request()
    const extra = changed(value, path + '.unexpected', true)
    expect(CmsManagementRequestSchema.safeParse(extra).success).toBe(false)
  })
  it('retains only field validation, without importing native-commit parent refinements', () => {
    const pin = { kind: 'schema', collectionId: 'fleet', recordId: '', version: 1, bytes: 1, freezeDigest: digest,
      operationId: 'prepared_1', origin: 'prepared', sha256: digest }
    const value = { ...transition(), expectedContent: pin }
    expect(CmsGraphTransitionSchema.parse(value)).toStrictEqual(value)
    expect(CmsGraphTransitionSchema.safeParse({ ...value, expectedContent: { ...pin, unexpected: true } }).success).toBe(false)
  })
  it('retains nullable application/status and exact non-null receipt fields', () => {
    const status = { phase: 'idle', adoptionId: null, progress: null, recoveryId: null, recoveryRequired: false, recoveryReason: null,
      receiptDigest: null, application: null, progressDigest: digest }
    for (const application of [null, { id: uuid, digest }]) {
      const value = { ok: true, requestDigest: digest, value: { ...status, application } }
      expect(cmsManagementResultSchema('adoption').parse(value)).toStrictEqual(value)
    }
    const receipt = { acknowledged: true, operationId: 'op_1', checkpointId: 'cp_1', application: { id: uuid, digest },
      versionId: null, currentCheckpointId: null, isCurrent: true }
    for (const operation of ['transition', 'checkpoint'] as const) {
      const value = { ok: true, requestDigest: digest, value: receipt }
      expect(cmsManagementResultSchema(operation).parse(value)).toStrictEqual(value)
      for (const application of [null, { id: 'not-uuid', digest }, { id: uuid, digest, unexpected: true }])
        expect(cmsManagementResultSchema(operation).safeParse({ ...value, value: { ...receipt, application } }).success).toBe(false)
    }
    const restored = { ok: true, requestDigest: digest, value: { checkpointId: 'cp_1', currentCheckpointId: null, isCurrent: true } }
    expect(cmsManagementResultSchema('restore').parse(restored)).toStrictEqual(restored)
  })
  it.each([400, 401, 403, 404, 409, 413, 422, 429, 503])('retains typed error status %s and exact parsed output', (statusCode) => {
    const value = { ok: false, requestDigest: digest, error: { code: 'CMS_FIXTURE_ERROR', statusCode, message: 'Safe error.' } }
    expect(cmsManagementResultSchema('adoption').parse(value)).toStrictEqual(value)
  })
})
