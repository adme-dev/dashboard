import { describe, expect, it } from 'vitest'
import { RecoveryReviewOwnerAction, RecoveryReviewOperatorAction, RecoveryReviewControlInput, RecoveryReviewPublicView, matchesRecoveryReviewControl } from '../../shared/pageStudio/transferRecoveryReviewControl'
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const reference = { reviewId: id(3), revision: 1, reviewDigest: 'a'.repeat(64) }
const scope = { siteId: id(1), requestId: id(2), expectedRevision: 5 }
const read = { action: 'read' as const, review: reference }
const input = { ...scope, expectedEnvironment: 'production', authentication: { ownerToken: 'b'.repeat(64) }, request: read }
const summary = { reference, maximumDeadline: '2026-10-24T00:00:00.000Z', remainingWork: 'same-operation-source-through-retention', plan: { pages: 20, storageBytes: 1000, customDomains: 1, monthlyBuilds: 10, monthlyTrafficBytes: 10000, monthlyAiOperations: 0 }, consents: [{ party: 'owner', expired: false }] }
const view = { ...scope, action: 'read' as const, historical: true, review: summary }
describe('recovery review public boundary', () => {
  it('allows only explicit owner read/consent with no principal fields', () => {
    expect(RecoveryReviewOwnerAction.parse(read)).toEqual(read)
    expect(RecoveryReviewOwnerAction.safeParse({ action: 'consent-review', review: reference, consentId: id(4) }).success).toBe(true)
    for (const action of ['renew-plan', 'create-review', 'approve-review']) expect(RecoveryReviewOwnerAction.safeParse({ ...read, action }).success).toBe(false)
    for (const field of ['operator', 'ownerToken', 'ownerLoginSessionHash', 'party', 'proof', 'evidence']) expect(RecoveryReviewOwnerAction.safeParse({ ...read, [field]: 'injected' }).success).toBe(false)
  })
  it('rejects owner transport escalation and ambiguous identities', () => {
    expect(RecoveryReviewControlInput.safeParse(input).success).toBe(true)
    expect(RecoveryReviewControlInput.safeParse({ ...input, authentication: { ...input.authentication, operator: { actorId: id(9), loginSessionHash: 'c'.repeat(64) } } }).success).toBe(false)
    expect(RecoveryReviewControlInput.safeParse({ ...input, request: { action: 'approve-review', review: reference, approvalId: id(4), captureId: id(5) } }).success).toBe(false)
  })
  it('keeps plan renewal public input free of private original IDs', () => {
    const action = { action: 'renew-plan', renewalRequestId: id(4), recoveryId: id(5), expectedHeadVersion: 1, effectiveUntil: '2026-10-24T00:00:00.000Z', reason: 'Complete retained transfer' }
    expect(RecoveryReviewOperatorAction.safeParse(action).success).toBe(true)
    for (const key of ['operationId', 'intentDigest', 'expectedEntitlementId', 'tenantId']) expect(RecoveryReviewOperatorAction.safeParse({ ...action, [key]: id(9) }).success).toBe(false)
  })
  it('accepts historical projected review only and rejects private fields', () => {
    expect(RecoveryReviewPublicView.safeParse(view).success).toBe(true)
    for (const key of ['evidence', 'renewal', 'operator', 'ownerToken', 'approval', 'metadata']) expect(RecoveryReviewPublicView.safeParse({ ...view, [key]: {} }).success).toBe(false)
    expect(RecoveryReviewPublicView.safeParse({ ...view, historical: false }).success).toBe(false)
    expect(RecoveryReviewPublicView.safeParse({ ...view, review: { ...summary, plan: { ...summary.plan, monthlyAiOperations: 1 } } }).success).toBe(false)
  })
  it('correlates scope, action and exact immutable review', () => {
    const parsed = RecoveryReviewControlInput.parse(input), result = RecoveryReviewPublicView.parse(view)
    expect(matchesRecoveryReviewControl(result, parsed)).toBe(true)
    for (const change of [{ siteId: id(9) }, { requestId: id(9) }, { expectedRevision: 6 }, { review: { ...summary, reference: { ...reference, revision: 2 } } }]) expect(matchesRecoveryReviewControl(RecoveryReviewPublicView.parse({ ...view, ...change }), parsed)).toBe(false)
  })
})
