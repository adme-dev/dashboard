import { describe, expect, it } from 'vitest'
import {
  TransferRecoveryAdmissionControlInputSchema,
  TransferRecoveryAdmissionControlActionSchema,
  TransferRecoveryAdmissionControlViewSchema
} from '~~/shared/pageStudio/transferRecoveryAdmissionControl'
const id = '00000000-0000-4000-8000-000000000001'
const ref = { reviewId: id, revision: 1, reviewDigest: 'a'.repeat(64) }
const route = { siteId: id, requestId: id, expectedRevision: 1 }
const begin = {
  action: 'begin',
  admissionId: id,
  review: ref,
  expectedHeadVersion: 2,
  prepareEventId: '00000000-0000-4000-8000-000000000002',
  enableEventId: '00000000-0000-4000-8000-000000000003'
}
describe('explicit private admission control contract', () => {
  it('accepts only the five explicit actions', () => {
    for (const request of [
      begin,
      { action: 'read' },
      ...['prepare', 'apply'].map((action) => ({ action, admissionId: id, expectedHeadVersion: 3 })),
      { action: 'enable', admissionId: id, expectedHeadVersion: 4 }
    ])
      expect(
        TransferRecoveryAdmissionControlInputSchema.parse({
          ...route,
          operator: { actorId: id, loginSessionHash: 'a'.repeat(64) },
          request
        }).request
      ).toEqual(request)
  })
  it.each(['head', 'pending', 'applied', 'observation', 'operator', 'sessionHash'])(
    'rejects caller supplied %s',
    (field) => {
      expect(TransferRecoveryAdmissionControlActionSchema.safeParse({ ...begin, [field]: {} }).success).toBe(
        false
      )
    }
  )
  it('rejects implicit progression and wrong expected stage', () => {
    for (const value of [
      { ...begin, action: 'execute' },
      { action: 'enable', admissionId: id, expectedHeadVersion: 3 },
      { action: 'prepare', admissionId: id, expectedHeadVersion: 4 },
      { ...begin, enableEventId: begin.prepareEventId }
    ])
      expect(TransferRecoveryAdmissionControlActionSchema.safeParse(value).success).toBe(false)
  })
  it('never infers D1 enabled from PG applied or permits credentials in the view', () => {
    const value = {
      ...route,
      action: 'read',
      admissionId: id,
      review: ref,
      deadline: '2026-10-23T12:00:00.000Z',
      pgState: 'applied',
      d1State: 'unverified'
    }
    expect(TransferRecoveryAdmissionControlViewSchema.parse(value)).toEqual(value)
    for (const changed of [
      { ...value, d1State: 'enabled' },
      { ...value, operator: {} },
      { ...value, pending: {} },
      { ...value, admissionId: null }
    ])
      expect(TransferRecoveryAdmissionControlViewSchema.safeParse(changed).success).toBe(false)
  })
})
