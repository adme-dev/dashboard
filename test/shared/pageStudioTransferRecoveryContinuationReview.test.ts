import { describe, expect, it } from 'vitest'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { ContinuationReviewSchema, ContinuationConsentSchema, verifyContinuationReview, projectContinuationConsent, continuationConsentDigest } from '~~/shared/pageStudio/transferRecoveryContinuationReview'
import { TransferRecoveryReviewSchema } from '~~/shared/pageStudio/transferRecoveryReview'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const d = 'a'.repeat(64), issuedAt = '2026-10-24T10:00:00.000Z', expiresAt = '2026-10-24T10:30:00.000Z'
async function reviewFixture() {
  const evidence = {
    authority: { operationId: id(1), intentDigest: d, recoveryId: id(2), requestId: id(3), requestRevision: 5, originalRecoveryHeadDigest: d },
    principals: { accountId: id(4), identityId: id(5), workspaceId: id(6), tenantId: 'studio-customer-fixture', clientId: id(7), siteId: id(8), operatorId: id(9) },
    plan: { renewalRequestId: id(10), auditId: id(11), auditDigest: d, entitlementId: id(12), entitlementDigest: d }
  }
  const progress = { formatVersion: 1, kind: 'managed-transfer-retained-progress-v1', operationId: id(1), intentDigest: d,
    sourceScopeDigest: d, sourceGeneration: id(13), destinationBindingDigest: d, destinationGeneration: id(14),
    originalRecoveryHeadDigest: d, earlyInventoryDigest: d, sourceExecutionDigest: d, sourceFreezeDigest: d,
    phases: [{ phase: 'source-freeze', request: { kind: 'retained-request', digest: d }, result: { kind: 'verified-result', digest: d } }],
    effects: [], selection: { state: 'source', sourceSnapshotDigest: d } }
  return { formatVersion: 2, kind: 'managed-transfer-continuation-review-v2', reviewId: id(15), revision: 2, continuationId: id(16),
    issuedAt, maximumDeadline: expiresAt, predecessor: { grantDigest: null, originalRecoveryHeadDigest: d, journal: null },
    evidence, authorityDigest: await collectionDigest(evidence), progress, progressDigest: await collectionDigest(progress), descriptorDigest: d,
    remainingWork: 'same-operation-source-through-retention' }
}
const row = () => ({ consent_id: id(20), review_id: id(15), revision: 2, review_digest: d, party: 'owner', actor_id: id(5), login_hash: d, issued_at: issuedAt, expires_at: expiresAt })
describe('strict v2 continuation review and consent projection', () => {
  it('preserves relational paths and verifies canonical full progress and authority commitments', async () => {
    const value = await reviewFixture()
    expect(await verifyContinuationReview(value, await collectionDigest(value))).toEqual(value)
    expect(TransferRecoveryReviewSchema.safeParse(value).success).toBe(false)
    expect(ContinuationReviewSchema.safeParse({ ...value, formatVersion: 1 }).success).toBe(false)
  })
  it('rejects changed evidence/progress, foreign lineage, unknown fields and invalid deadlines', async () => {
    const value = await reviewFixture(), digest = await collectionDigest(value)
    for (const mutate of [
      (v: typeof value) => { v.progress.selection.sourceSnapshotDigest = 'b'.repeat(64) },
      (v: typeof value) => { v.evidence.principals.identityId = id(99) },
      (v: typeof value) => { v.progress.operationId = id(99) },
      (v: typeof value) => { v.predecessor.originalRecoveryHeadDigest = 'b'.repeat(64) },
      (v: typeof value) => { v.maximumDeadline = '2026-10-24T12:00:00.000Z' },
      (v: typeof value) => { Object.assign(v, { extra: true }) }
    ]) {
      const altered = structuredClone(value)
      mutate(altered)
      await expect(verifyContinuationReview(altered, digest)).rejects.toThrow()
    }
  })
  it('checks nested commitments even after a caller recomputes the outer review hash', async () => {
    for (const key of ['authorityDigest', 'progressDigest'] as const) {
      const value = await reviewFixture()
      value[key] = 'f'.repeat(64)
      await expect(verifyContinuationReview(value, await collectionDigest(value))).rejects.toThrow()
    }
    const changed = await reviewFixture()
    changed.progress.operationId = id(99)
    changed.progressDigest = await collectionDigest(changed.progress)
    await expect(verifyContinuationReview(changed, await collectionDigest(changed))).rejects.toThrow()
  })
  it('canonically projects exact millisecond DB consent fields without accepting rounded Date objects', async () => {
    const value = projectContinuationConsent(row())
    expect(value).toEqual({ formatVersion: 2, kind: 'managed-transfer-continuation-consent-v2', consentId: id(20), reviewId: id(15), revision: 2,
      reviewDigest: d, party: 'owner', actorId: id(5), loginHash: d, issuedAt, expiresAt })
    expect(await continuationConsentDigest(row())).toBe(await collectionDigest(value))
    for (const altered of [{ ...row(), issued_at: new Date(issuedAt) }, { ...row(), issued_at: '2026-10-24T10:00:00.000001Z' },
      { ...row(), issued_at: '2026-10-24T11:00:00.000+01:00' }, { ...row(), expires_at: issuedAt }, { ...row(), extra: true }]) {
      expect(() => projectContinuationConsent(altered)).toThrow()
    }
    expect(ContinuationConsentSchema.safeParse({ ...value as object, formatVersion: 1 }).success).toBe(false)
  })
})
