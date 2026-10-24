import { describe, expect, it } from 'vitest'
import {
  TransferRecoveryEvidenceSchema,
  TransferRecoveryReviewCreateSchema
} from '~~/shared/pageStudio/transferRecoveryReview'
import { TransferRecoveryViewSchema } from '~~/shared/pageStudio/transferRecovery'
const id = '00000000-0000-4000-8000-000000000001'
describe('recovery review boundary', () => {
  it('permits approved status and revocation without any admission action', () => {
    const value = {
      siteId: id,
      requestId: id,
      revision: 5,
      recovery: {
        recoveryId: id,
        epoch: 1,
        version: 2,
        state: 'approved',
        deadline: '2026-10-23T12:00:00.000Z',
        expired: false
      },
      allowedActions: ['revoke']
    }
    expect(TransferRecoveryViewSchema.parse(value)).toEqual(value)
    expect(TransferRecoveryViewSchema.safeParse({ ...value, allowedActions: ['open'] }).success).toBe(false)
    expect(TransferRecoveryViewSchema.safeParse({ ...value, allowedActions: ['resume'] }).success).toBe(false)
  })
  it('requires explicit review and capture identities and exact CAS', () => {
    const value = {
      siteId: id,
      requestId: id,
      expectedRevision: 5,
      operator: { actorId: id, loginSessionHash: 'a'.repeat(64) },
      body: {
        reviewId: id,
        expectedReviewRevision: 0,
        recoveryId: id,
        expectedHeadVersion: 1,
        renewalRequestId: id,
        captureId: id,
        maximumDeadline: '2026-10-23T12:00:00.000Z'
      }
    }
    expect(TransferRecoveryReviewCreateSchema.safeParse(value).success).toBe(true)
    for (const field of Object.keys(value.body)) {
      const body = { ...value.body }
      Reflect.deleteProperty(body, field)
      expect(TransferRecoveryReviewCreateSchema.safeParse({ ...value, body }).success).toBe(false)
    }
    expect(
      TransferRecoveryReviewCreateSchema.safeParse({ ...value, body: { ...value.body, expectedHeadVersion: 2 } })
        .success
    ).toBe(false)
  })
  it('retains every non-transport invariant field in a strict projection schema', () => {
    expect(Object.keys(TransferRecoveryEvidenceSchema.shape).sort()).toEqual([
      'authority',
      'formatVersion',
      'observation',
      'pg',
      'principals',
      'sourceDataDigest'
    ])
    expect(Object.keys(TransferRecoveryEvidenceSchema.shape.observation.shape)).not.toContain('envelopeDigest')
    expect(TransferRecoveryEvidenceSchema.safeParse({}).success).toBe(false)
  })
})
