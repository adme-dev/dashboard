import { z } from 'zod'
import { collectionDigest } from './collectionApi'
import { ContinuationCursorSchema, ContinuationProgressSchema } from './transferRecoveryContinuation'

const Id = z.uuid(), Digest = z.string().regex(/^[a-f0-9]{64}$/)
const Version = z.number().int().min(1).max(2147483646)
// Exact persisted millisecond UTC identity; no coercion or precision truncation.
export const ContinuationReviewInstantSchema = z.iso.datetime({ precision: 3, offset: false })
const Time = ContinuationReviewInstantSchema
export const ContinuationReviewEvidenceSchema = z.object({
  authority: z.object({
    operationId: Id, intentDigest: Digest, recoveryId: Id, requestId: Id, requestRevision: Version,
    originalRecoveryHeadDigest: Digest
  }).strict(),
  principals: z.object({
    accountId: Id, identityId: Id, workspaceId: Id, tenantId: z.string().min(1).max(200),
    clientId: Id, siteId: Id, operatorId: Id
  }).strict(),
  plan: z.object({
    renewalRequestId: Id, auditId: Id, auditDigest: Digest, entitlementId: Id, entitlementDigest: Digest
  }).strict()
}).strict()
export const ContinuationReviewSchema = z.object({
  formatVersion: z.literal(2), kind: z.literal('managed-transfer-continuation-review-v2'),
  reviewId: Id, revision: Version, continuationId: Id, issuedAt: Time, maximumDeadline: Time,
  predecessor: z.object({ grantDigest: Digest.nullable(), originalRecoveryHeadDigest: Digest, journal: ContinuationCursorSchema.nullable() }).strict(),
  evidence: ContinuationReviewEvidenceSchema, authorityDigest: Digest,
  progress: ContinuationProgressSchema, progressDigest: Digest, descriptorDigest: Digest,
  remainingWork: z.literal('same-operation-source-through-retention')
}).strict().refine(r => Date.parse(r.maximumDeadline) > Date.parse(r.issuedAt)
  && Date.parse(r.maximumDeadline) - Date.parse(r.issuedAt) <= 3_600_000
  && (r.predecessor.grantDigest === null) === (r.predecessor.journal === null)
  && r.evidence.authority.operationId === r.progress.operationId
  && r.evidence.authority.intentDigest === r.progress.intentDigest
  && r.evidence.authority.originalRecoveryHeadDigest === r.progress.originalRecoveryHeadDigest
  && r.predecessor.originalRecoveryHeadDigest === r.progress.originalRecoveryHeadDigest)

/** Pure commitments only. Current principals, selection, plan and physical proof
 * are independently re-read by the authority/controller before any journal write. */
export async function verifyContinuationReview(input: unknown, digest: string) {
  const review = ContinuationReviewSchema.parse(structuredClone(input))
  if (!Digest.safeParse(digest).success || await collectionDigest(review) !== digest
    || await collectionDigest(review.evidence) !== review.authorityDigest
    || await collectionDigest(review.progress) !== review.progressDigest) {
    throw new Error('Continuation review commitments changed')
  }
  return review
}

export const ContinuationConsentSchema = z.object({
  formatVersion: z.literal(2), kind: z.literal('managed-transfer-continuation-consent-v2'),
  consentId: Id, reviewId: Id, revision: Version, reviewDigest: Digest,
  party: z.enum(['owner', 'operator']), actorId: Id, loginHash: Digest, issuedAt: Time, expiresAt: Time
}).strict().refine(c => Date.parse(c.expiresAt) > Date.parse(c.issuedAt)
  && Date.parse(c.expiresAt) - Date.parse(c.issuedAt) <= 3_600_000)
const ConsentRow = z.object({
  consent_id: Id, review_id: Id, revision: Version, review_digest: Digest,
  party: z.enum(['owner', 'operator']), actor_id: Id, login_hash: Digest, issued_at: Time, expires_at: Time
}).strict()
/** Select exact text timestamps from PG and reject non-ms rows before projecting.
 * Do not pass JS Date objects: the driver has already lost sub-ms information. */
export function projectContinuationConsent(input: unknown) {
  const row = ConsentRow.parse(input)
  return ContinuationConsentSchema.parse({
    formatVersion: 2, kind: 'managed-transfer-continuation-consent-v2',
    consentId: row.consent_id, reviewId: row.review_id, revision: row.revision, reviewDigest: row.review_digest,
    party: row.party, actorId: row.actor_id, loginHash: row.login_hash, issuedAt: row.issued_at, expiresAt: row.expires_at
  })
}
export async function continuationConsentDigest(row: unknown) {
  return collectionDigest(projectContinuationConsent(row))
}
