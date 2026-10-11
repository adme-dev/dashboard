import { beforeEach, expect, it } from 'vitest'
import { mergeCustomerCmsSetupResponse } from '~/utils/pageStudioCmsSetupResponse'
import type { CustomerCmsSetupStatus, CustomerCmsSetupRequest } from '~~/shared/pageStudio/customerCmsSetup'

const original = '10000000-0000-4000-8000-000000000001'
const other = '20000000-0000-4000-8000-000000000001'
const head = '30000000-0000-4000-8000-000000000001'
const kinds = ['collection', 'workflow', 'collection-staging', 'form-runtime', 'form-drafts'] as const
let snapshot: CustomerCmsSetupStatus
beforeEach(() => {
  snapshot = { resumeRequired: false, prerequisites: kinds.map(kind => ({ kind, status: 'reconciliation', requestId: original, recoveryId: null, canConfigure: false })), adoption: { phase: 'importing', adoptionId: 'adoption-original', progress: { consumed: 3, done: false }, recoveryId: null, recoveryRequired: true, progressDigest: 'a'.repeat(64) } }
})
const recover = (): CustomerCmsSetupRequest => ({ operation: 'schema', request: { action: 'recover', kind: 'collection', requestId: head, expectedRecoveryId: null } })
const response = () => ({ kind: 'collection', status: 'installed', requestId: original, recoveryId: head, canConfigure: true })
it('binds the original operation separately from the new recovery head and leaves other steps untouched', () => {
  const before = structuredClone(snapshot)
  const result = mergeCustomerCmsSetupResponse(snapshot, recover(), response())!
  expect(result.prerequisites[0]).toEqual(response())
  expect(result.prerequisites.slice(1)).toEqual(before.prerequisites.slice(1))
  expect(result.adoption).toEqual(before.adoption)
  expect(snapshot).toEqual(before)
})
it.each([
  { kind: 'workflow' }, { requestId: other }, { requestId: head }, { recoveryId: other },
  { recoveryId: null }, { requestId: undefined }, { extra: true }, { canConfigure: false }
])('rejects an unrelated or malformed recovery reply %j', (change) => {
  expect(() => mergeCustomerCmsSetupResponse(snapshot, recover(), { ...response(), ...change })).toThrow()
  expect(snapshot.prerequisites[0]!.status).toBe('reconciliation')
})
it('rejects an out-of-order recovery after the snapshot already has a newer head', () => {
  snapshot.prerequisites[0]!.recoveryId = other
  expect(() => mergeCustomerCmsSetupResponse(snapshot, recover(), response())).toThrow()
})
it('rejects a start result for another original request', () => {
  snapshot.prerequisites[0]!.status = 'reserved'
  snapshot.prerequisites[0]!.canConfigure = true
  expect(() => mergeCustomerCmsSetupResponse(snapshot, { operation: 'schema', request: { action: 'start', kind: 'collection', requestId: original } }, { ...response(), requestId: other, recoveryId: null })).toThrow()
})
it('declines responses after session resume and malformed duplicate step snapshots', () => {
  expect(mergeCustomerCmsSetupResponse(snapshot, { operation: 'resume' }, { resumed: true })).toBeNull()
  snapshot.prerequisites[1] = snapshot.prerequisites[0]!
  expect(() => mergeCustomerCmsSetupResponse(snapshot, recover(), response())).toThrow()
})
const adoption = () => ({ ...snapshot.adoption!, phase: 'managed', recoveryRequired: false, progressDigest: 'b'.repeat(64) })
it('uses a validated adoption response without changing prerequisite readiness', () => {
  const result = mergeCustomerCmsSetupResponse(snapshot, { operation: 'adoption', request: { action: 'advance', adoptionId: 'adoption-original', expectedProgressDigest: 'a'.repeat(64) } }, adoption())!
  expect(result.adoption!.phase).toBe('managed')
  expect(result.prerequisites).toEqual(snapshot.prerequisites)
})
it.each([{ adoptionId: 'foreign' }, { recoveryId: other }, { extra: true }, { progress: { consumed: '3', done: true } }])('rejects unrelated adoption responses %j', (change) => {
  expect(() => mergeCustomerCmsSetupResponse(snapshot, { operation: 'adoption', request: { action: 'advance', adoptionId: 'adoption-original', expectedProgressDigest: 'a'.repeat(64) } }, { ...adoption(), ...change })).toThrow()
})
it('requires the current progress digest and recovery relationship', () => {
  expect(() => mergeCustomerCmsSetupResponse(snapshot, { operation: 'adoption', request: { action: 'advance', adoptionId: 'adoption-original', expectedProgressDigest: 'c'.repeat(64) } }, adoption())).toThrow()
  expect(() => mergeCustomerCmsSetupResponse(snapshot, { operation: 'adoption', request: { action: 'recover', adoptionId: 'adoption-original', recoveryId: head, expectedRecoveryId: other } }, { ...adoption(), recoveryId: head })).toThrow()
  expect(mergeCustomerCmsSetupResponse(snapshot, { operation: 'adoption', request: { action: 'recover', adoptionId: 'adoption-original', recoveryId: head, expectedRecoveryId: null } }, { ...adoption(), recoveryId: head })!.adoption!.recoveryId).toBe(head)
})
it('permits a new adoption ID only for a validated start from the idle snapshot', () => {
  snapshot.adoption = { ...snapshot.adoption!, phase: 'idle', adoptionId: null, progress: null, recoveryRequired: false }
  const result = mergeCustomerCmsSetupResponse(snapshot, { operation: 'adoption', request: { action: 'start' } }, { ...adoption(), adoptionId: 'adoption-new', phase: 'freezing' })!
  expect(result.adoption!.adoptionId).toBe('adoption-new')
})

it.each(['prior', 'returned'])('requires a null %s recovery head for adoption start', (which) => {
  snapshot.adoption = { ...snapshot.adoption!, phase: 'idle', adoptionId: null, progress: null, recoveryId: which === 'prior' ? head : null, recoveryRequired: false }
  const raw = { ...adoption(), phase: 'freezing', adoptionId: 'adoption-new', recoveryId: which === 'returned' ? head : null }
  expect(() => mergeCustomerCmsSetupResponse(snapshot, { operation: 'adoption', request: { action: 'start' } }, raw)).toThrow()
})
