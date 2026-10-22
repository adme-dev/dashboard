import { expect, it } from 'vitest'
import { TransferRecoveryRequestSchema, TransferRecoveryStatusRequestSchema, TransferRecoveryViewSchema } from '../../shared/pageStudio/transferRecovery'

const recoveryId = 'e6dfd8ca-706a-4689-973a-019d8cd770b9'
const siteId = 'f1812090-7b1e-4614-b566-e94768114a29'
const requestId = '4710d89d-1db6-40e7-86f5-824721caaad8'
const deadline = '2026-10-24T00:00:00.000Z'
const open = { action: 'open', expectedRevision: 5, recoveryId, expectedHeadVersion: null, deadline }
const revoke = { action: 'revoke', expectedRevision: 5, recoveryId, expectedHeadVersion: 1 }
const head = { recoveryId, epoch: 1, version: 1, state: 'reconciling', deadline, expired: false }
const view = { siteId, requestId, revision: 5, recovery: head, allowedActions: ['revoke'] }

it('supports explicit first review, exact-version revocation and numeric status revision', () => {
  expect(TransferRecoveryRequestSchema.parse(open)).toEqual(open)
  expect(TransferRecoveryRequestSchema.parse(revoke)).toEqual(revoke)
  expect(TransferRecoveryStatusRequestSchema.parse({ expectedRevision: 5 })).toEqual({ expectedRevision: 5 })
})

it.each(['operator', 'loginSessionHash', 'ownerIdentityId', 'operationId', 'intentDigest', 'entitlementId', 'admissionId'])(
  'rejects browser-selected private authority %s', key => {
  for (const body of [open, revoke]) expect(TransferRecoveryRequestSchema.safeParse({ ...body, [key]: recoveryId }).success).toBe(false)
})

it.each([
  { ...open, expectedHeadVersion: 1 }, { ...open, expectedHeadVersion: undefined },
  { ...revoke, expectedHeadVersion: null }, { ...revoke, expectedHeadVersion: 0 },
  { ...revoke, expectedHeadVersion: 2147483647 }, { ...revoke, deadline },
  { ...open, deadline: 'tomorrow' }, { ...open, deadline: '2026-10-24T00:00:00' },
  { ...open, recoveryId: 'latest' }, { ...open, expectedRevision: '5' },
  { ...open, expectedRevision: 0 }, { ...open, expectedRevision: 1.1 },
  ...['approve', 'resume', 'enable', 'renew-plan'].map(action => ({ ...open, action }))
])('does not turn invalid or broader actions into recovery permission: %j', body => {
  expect(TransferRecoveryRequestSchema.safeParse(body).success).toBe(false)
})

it('only exposes open before a head and revoke for a reconciling head, including expired heads', () => {
  expect(TransferRecoveryViewSchema.parse(view)).toEqual(view)
  expect(TransferRecoveryViewSchema.safeParse({ ...view, recovery: { ...head, expired: true } }).success).toBe(true)
  expect(TransferRecoveryViewSchema.safeParse({ ...view, recovery: null, allowedActions: ['open'] }).success).toBe(true)
  expect(TransferRecoveryViewSchema.safeParse({ ...view, recovery: { ...head, state: 'revoked' }, allowedActions: [] }).success).toBe(true)
  expect(TransferRecoveryViewSchema.safeParse({ ...view, allowedActions: [] }).success).toBe(true)
})

it.each([
  { ...view, allowedActions: ['open'] }, { ...view, allowedActions: ['resume'] },
  { ...view, allowedActions: ['revoke', 'revoke'] }, { ...view, recovery: null },
  { ...view, recovery: { ...head, state: 'enabled' } },
  { ...view, recovery: { ...head, state: 'revoked' } },
  { ...view, recovery: { ...head, intentDigest: 'a'.repeat(64) } },
  { ...view, operatorSession: 'private' },
  { ...view, recovery: { ...head, epoch: 0 } },
  { ...view, recovery: { ...head, version: 2147483647 } }
])('rejects unsafe or inconsistent public projections: %j', value => {
  expect(TransferRecoveryViewSchema.safeParse(value).success).toBe(false)
})

it('does not accept private selectors or a latest fallback on a status read', () => {
  expect(TransferRecoveryStatusRequestSchema.safeParse({ expectedRevision: 5, recoveryId }).success).toBe(false)
  expect(TransferRecoveryStatusRequestSchema.safeParse({}).success).toBe(false)
})
