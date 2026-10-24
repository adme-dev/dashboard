import { beforeEach, expect, it, vi } from 'vitest'
import golden from '../fixtures/transfer-recovery-admission.json'
import { TransferRecoveryReviewSchema } from '../../shared/pageStudio/transferRecoveryReview'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'
import { RECOVERY_REVIEW_CONTROL_URL as URL, RECOVERY_REVIEW_CONTROL_UNAVAILABLE as UNAVAILABLE } from '../../shared/pageStudio/transferRecoveryReviewControl'
import { handleTransferRecoveryReviewControlFetch } from '../../workers/page-studio-management/src/transferRecoveryReviewControlFetch'
import { callTransferRecoveryReviewControl } from '../../server/utils/pageStudio/transferRecoveryReviewControlClient'
const mocks = vi.hoisted(() => ({ read: vi.fn(), create: vi.fn(), consent: vi.fn(), approve: vi.fn(), status: vi.fn(), renew: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerTransferRecoveryReview', () => ({ readCustomerTransferRecoveryReview: mocks.read, createCustomerTransferRecoveryReview: mocks.create, consentCustomerTransferRecoveryReview: mocks.consent, approveCustomerTransferRecoveryReview: mocks.approve }))
vi.mock('~~/server/utils/pageStudio/customerTransferRecovery', () => ({ readCustomerTransferRecovery: mocks.status }))
vi.mock('~~/server/utils/pageStudio/customerTransferPlanRenewal', () => ({ renewCustomerTransferPlan: mocks.renew }))
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const config = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true' }
const scope = { siteId: id(1), requestId: id(2), expectedRevision: 5 }
const operator = { actorId: id(3), loginSessionHash: 'a'.repeat(64) }
const original = { operation_id: id(4), intent_digest: 'b'.repeat(64), entitlement_id: id(5) }
const db = { query: vi.fn() }, run = vi.fn(async work => work(db))
let reference: { reviewId: string, revision: number, reviewDigest: string }, review: ReturnType<typeof TransferRecoveryReviewSchema.parse>
const deadline = '2026-10-24T00:00:00.000Z'
const input = (request: object, owner = false) => ({ ...scope, expectedEnvironment: 'production', authentication: owner ? { ownerToken: 'c'.repeat(64) } : { operator }, request })
const transport = (env = config) => { const fetch = vi.fn(req => handleTransferRecoveryReviewControlFetch(req, env, run)); return { fetch, env: { ...env, PAGE_STUDIO_MANAGEMENT: { fetch } } } }
const request = (value: unknown) => new Request(URL, { method: 'POST', body: JSON.stringify(value) })
beforeEach(async () => {
  vi.clearAllMocks()
  db.query.mockResolvedValue({ rows: [original] })
  const { envelopeDigest: _digest, ...observation } = golden.approvedObservation
  const evidence = { formatVersion: 1, authority: { requestId: scope.requestId, requestRevision: 5, operationId: original.operation_id, intentDigest: original.intent_digest,
    recoveryId: id(6), epoch: 1, pgVersion: 1, d1Version: 1, deadline },
  principals: { siteId: scope.siteId, accountId: id(7), identityId: id(8), workspaceId: id(9), operatorId: operator.actorId }, sourceDataDigest: 'b'.repeat(64),
  pg: { resourceBindingDigest: 'b'.repeat(64), catalogueRequestDigest: 'b'.repeat(64), catalogueReceiptDigest: 'b'.repeat(64), later: { sourceExecution: 0, sourceDrafts: 0, destinationExecution: 0, destinationVerification: 0, copyRequest: 0, copyVerification: 0, formsHistoryRequest: 0, formsHistoryVerification: 0, completion: 0 } }, observation }
  const plan = { id: id(10), tenant_id: 'private-tenant', client_id: id(11), status: 'active', plan_key: 'bounded-native', active_site_limit: 1,
    pages_per_site_limit: 20, storage_bytes_limit: 10000, custom_domain_limit: 1, monthly_ai_operation_limit: 0, monthly_build_limit: 20, monthly_traffic_bytes_limit: 100000,
    portal_creation_enabled: false, effective_from: '2026-10-23T00:00:00.000Z', effective_until: deadline, plan_metadata: { private: 'not public' }, created_by: operator.actorId,
    created_at: '2026-10-23T00:00:00.000Z', updated_at: '2026-10-23T00:00:00.000Z' }
  review = TransferRecoveryReviewSchema.parse({ formatVersion: 1, reviewId: id(12), revision: 1, evidence, evidenceDigest: await collectionDigest(evidence), originalCapture: { captureId: id(13), digest: 'b'.repeat(64) },
    renewal: { auditId: id(14), requestId: id(15), entitlementId: plan.id, auditDigest: 'b'.repeat(64), entitlementDigest: await collectionDigest(plan), entitlementSnapshot: plan }, maximumDeadline: deadline, remainingWork: 'same-operation-source-through-retention' })
  reference = { reviewId: review.reviewId, revision: 1, reviewDigest: await collectionDigest(review) }
  mocks.read.mockResolvedValue({ historical: true, review, reference, consents: [{ party: 'owner', expired: false }] })
  mocks.create.mockResolvedValue({ historical: false, review, reference })
  mocks.renew.mockResolvedValue({ entitlement: { id: id(10), workspaceId: id(9), siteId: scope.siteId, planKey: 'bounded-native', status: 'active' }, replayed: false })
  mocks.consent.mockImplementation(async (value, auth) => ({ historical: false, consentId: value.consentId, party: 'operator' in auth ? 'operator' : 'owner' }))
  mocks.approve.mockImplementation(async value => ({ historical: false, approval: { request: value, approvalId: value.approvalId, reviewId: value.review.reviewId, reviewDigest: value.review.reviewDigest, deadline }, digest: 'd'.repeat(64) }))
})
it.each([false, true])('reads a strict privacy projection through a single private RPC (owner=%s)', async owner => {
  const { env, fetch } = transport()
  const value = await callTransferRecoveryReviewControl(input({ action: 'read', review: reference }, owner), env)
  expect(value).toMatchObject({ ...scope, historical: true, action: 'read', review: { reference, plan: { pages: 20, monthlyAiOperations: 0 }, consents: [{ party: 'owner', expired: false }] } })
  const text = JSON.stringify(value)
  for (const secret of ['private-tenant', 'not public', operator.loginSessionHash, id(9), 'entitlementSnapshot', 'evidence', 'ownerToken', 'resourceIdentity']) expect(text).not.toContain(secret)
  expect(fetch).toHaveBeenCalledOnce()
})
it('derives renewal private identity from an authenticated exact retained route', async () => {
  const action = { action: 'renew-plan', renewalRequestId: id(15), recoveryId: id(6), expectedHeadVersion: 1, effectiveUntil: deadline, reason: 'Complete retained transfer' }
  const value = await callTransferRecoveryReviewControl(input(action), transport().env)
  expect(mocks.status).toHaveBeenCalledBefore(db.query)
  expect(db.query.mock.calls[0]?.[1]).toEqual([scope.siteId, scope.requestId, 5, operator.actorId])
  expect(mocks.renew).toHaveBeenCalledExactlyOnceWith({ operator, body: { requestId: id(15), transferRequestId: scope.requestId, operationId: original.operation_id, intentDigest: original.intent_digest, expectedEntitlementId: original.entitlement_id,
    recoveryId: id(6), epoch: 1, expectedHeadVersion: 1, effectiveUntil: deadline, reason: action.reason } }, { runTransaction: run })
  expect(value).toEqual({ ...scope, action: 'renew-plan', renewalRequestId: id(15), recoveryId: id(6), effectiveUntil: deadline, historical: false, planKey: 'bounded-native' })
})
it('creates then reads exact immutable review including retained consent state', async () => {
  const body = { reviewId: reference.reviewId, expectedReviewRevision: 0, recoveryId: id(6), expectedHeadVersion: 1, renewalRequestId: id(15), captureId: id(13), maximumDeadline: deadline }
  const value = await callTransferRecoveryReviewControl(input({ action: 'create-review', body }), transport().env)
  expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ ...scope, operator, body }, { env: config, runTransaction: run })
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith({ ...scope, review: reference }, { operator }, { env: config, runTransaction: run })
  expect(value).toMatchObject({ action: 'create-review', historical: false, review: { consents: [{ party: 'owner', expired: false }] } })
})
it.each([false, true])('binds explicit consent to authenticated party (owner=%s)', async owner => {
  const value = await callTransferRecoveryReviewControl(input({ action: 'consent-review', review: reference, consentId: id(16) }, owner), transport().env)
  expect(value).toMatchObject({ consentId: id(16), party: owner ? 'owner' : 'operator', review: reference })
})
it('projects final approval without the stored private request', async () => {
  const value = await callTransferRecoveryReviewControl(input({ action: 'approve-review', review: reference, approvalId: id(17), captureId: id(18) }), transport().env)
  expect(value).toEqual({ ...scope, action: 'approve-review', review: reference, approvalId: id(17), deadline, historical: false })
  expect(JSON.stringify(value)).not.toContain(operator.loginSessionHash)
})
it.each(['operator', 'ownerToken', 'evidence', 'intentDigest', 'operationId'])('rejects public action injection %s before helper', async key => {
  expect((await handleTransferRecoveryReviewControlFetch(request(input({ action: 'read', review: reference, [key]: 'foreign' })), config, run)).status).toBe(400)
  expect(mocks.read).not.toHaveBeenCalled()
})
it('rejects foreign review contents, duplicate parties and mutated plan digest', async () => {
  for (const transform of [value => ({ ...value, reference: { ...reference, reviewId: id(99) } }), value => ({ ...value, consents: [{ party: 'owner', expired: false }, { party: 'owner', expired: false }] }), value => ({ ...value, review: { ...review, renewal: { ...review.renewal, entitlementSnapshot: { ...review.renewal.entitlementSnapshot, pages_per_site_limit: 999 } } } })]) {
    mocks.read.mockResolvedValueOnce(transform({ historical: true, review, reference, consents: [] }))
    await expect(callTransferRecoveryReviewControl(input({ action: 'read', review: reference }), transport().env)).rejects.toMatchObject({ statusCode: 503 })
  }
})
it('rejects unsupported environment, wrong route/method, oversized or malformed bodies', async () => {
  const value = input({ action: 'read', review: reference })
  for (const env of [{}, { ...config, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }]) expect((await handleTransferRecoveryReviewControlFetch(request(value), env, run)).status).toBe(503)
  for (const req of [new Request(URL), new Request(`${URL}?retry=true`, { method: 'POST' })]) expect((await handleTransferRecoveryReviewControlFetch(req, config, run)).status).toBe(404)
  for (const body of [' '.repeat(16385), '{', new Uint8Array([255])]) expect((await handleTransferRecoveryReviewControlFetch(new Request(URL, { method: 'POST', body }), config, run)).status).toBe(400)
  expect(mocks.read).not.toHaveBeenCalled()
})
it('denies changed configuration and never retries lost mutation acknowledgement', async () => {
  const changed = { ...config }
  mocks.consent.mockImplementationOnce(async () => { changed.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED = 'false'; return { historical: false, consentId: id(16), party: 'operator' } })
  const value = input({ action: 'consent-review', review: reference, consentId: id(16) })
  await expect(callTransferRecoveryReviewControl(value, transport(changed).env)).rejects.toMatchObject({ statusCode: 503 })
  const fetch = vi.fn().mockRejectedValue(Error('secret transport detail'))
  await expect(callTransferRecoveryReviewControl(value, { ...config, PAGE_STUDIO_MANAGEMENT: { fetch } })).rejects.toMatchObject({ statusCode: 503, statusMessage: UNAVAILABLE })
  expect(fetch).toHaveBeenCalledOnce()
})
it('redacts permission errors without returning stored content or token', async () => {
  mocks.read.mockRejectedValueOnce({ statusCode: 403, message: 'private native cookie' })
  await expect(callTransferRecoveryReviewControl(input({ action: 'read', review: reference }, true), transport().env)).rejects.toMatchObject({ statusCode: 403, statusMessage: UNAVAILABLE })
})
it('does not derive or renew a plan when original-route authorization fails', async () => {
  mocks.status.mockRejectedValueOnce({ statusCode: 403 })
  const action = { action: 'renew-plan', renewalRequestId: id(15), recoveryId: id(6), expectedHeadVersion: 1, effectiveUntil: deadline, reason: 'Complete retained transfer' }
  await expect(callTransferRecoveryReviewControl(input(action), transport().env)).rejects.toMatchObject({ statusCode: 403 })
  expect(db.query).not.toHaveBeenCalled(); expect(mocks.renew).not.toHaveBeenCalled()
})
it('rejects mismatched consent and approval acknowledgements', async () => {
  mocks.consent.mockResolvedValueOnce({ historical: true, consentId: id(16), party: 'operator' })
  await expect(callTransferRecoveryReviewControl(input({ action: 'consent-review', review: reference, consentId: id(16) }, true), transport().env)).rejects.toMatchObject({ statusCode: 503 })
  mocks.approve.mockImplementationOnce(async value => ({ historical: true, approval: { request: { ...value, captureId: id(99) }, approvalId: value.approvalId, reviewId: reference.reviewId, reviewDigest: reference.reviewDigest, deadline } }))
  await expect(callTransferRecoveryReviewControl(input({ action: 'approve-review', review: reference, approvalId: id(17), captureId: id(18) }), transport().env)).rejects.toMatchObject({ statusCode: 503 })
})
it('rejects response header/body digest substitutions and redirect responses', async () => {
  const value = input({ action: 'consent-review', review: reference, consentId: id(16) })
  const digest = await collectionDigest(value)
  const view = { ...scope, action: 'consent-review', historical: true, review: reference, consentId: id(16), party: 'operator' }
  for (const response of [Response.json({ ok: true, requestDigest: digest, value: view }, { headers: { 'x-request-digest': 'f'.repeat(64) } }),
    Response.json({ ok: true, requestDigest: 'f'.repeat(64), value: view }, { headers: { 'x-request-digest': digest } }),
    new Response(null, { status: 302, headers: { location: 'https://foreign.test', 'x-request-digest': digest } })]) {
    const fetch = vi.fn().mockResolvedValue(response)
    await expect(callTransferRecoveryReviewControl(value, { ...config, PAGE_STUDIO_MANAGEMENT: { fetch } })).rejects.toMatchObject({ statusCode: 503 })
    expect(fetch).toHaveBeenCalledOnce()
  }
})
