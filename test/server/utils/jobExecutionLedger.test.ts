import { describe, expect, it } from 'vitest'
import { isReplayableJobType, safeReplayContext } from '../../../server/utils/jobExecutionLedger'
import type { QueueJob } from '../../../server/utils/queue'

const job = (type: QueueJob['type'], payload: Record<string, unknown>): QueueJob => ({
  jobId: '11111111-1111-4111-8111-111111111111',
  type,
  payload,
  enqueuedAt: '2026-07-26T00:00:00.000Z'
})

describe('platform job lifecycle metadata', () => {
  it('persists only allowlisted persona replay identifiers', () => {
    expect(safeReplayContext(job('persona.audience.sync', {
      exportId: '22222222-2222-4222-8222-222222222222',
      clientId: '33333333-3333-4333-8333-333333333333',
      email: 'must-not-persist@example.com'
    }))).toEqual({
      exportId: '22222222-2222-4222-8222-222222222222',
      clientId: '33333333-3333-4333-8333-333333333333'
    })
  })

  it('rejects replay context for unsupported jobs', () => {
    expect(isReplayableJobType('board.notify')).toBe(false)
    expect(safeReplayContext(job('board.notify', { taskId: 'secret' }))).toEqual({})
  })

  it('requires complete spend account identifiers for replay', () => {
    expect(safeReplayContext(job('spend.sync.meta.account', {
      connectionId: '44444444-4444-4444-8444-444444444444',
      month: 7,
      year: 2026
    }))).toEqual({
      connectionId: '44444444-4444-4444-8444-444444444444',
      month: 7,
      year: 2026
    })
  })

  it('persists only catalog identities for replayable source sync jobs', () => {
    expect(safeReplayContext(job('catalog.sync', {
      clientId: '11111111-1111-4111-8111-111111111111',
      sourceId: '22222222-2222-4222-8222-222222222222',
      actorEmail: 'advertising@adme.net.au'
    }))).toEqual({
      clientId: '11111111-1111-4111-8111-111111111111',
      sourceId: '22222222-2222-4222-8222-222222222222'
    })
    expect(isReplayableJobType('catalog.sync')).toBe(true)
  })

  it('keeps Merchant reconciliation replay scoped to tenant, client, and source', () => {
    expect(safeReplayContext(job('merchant.catalog.reconcile', {
      tenantId: 'tenant-1',
      clientId: '11111111-1111-4111-8111-111111111111',
      sourceId: '22222222-2222-4222-8222-222222222222',
      accessToken: 'must-not-persist'
    }))).toEqual({
      tenantId: 'tenant-1',
      clientId: '11111111-1111-4111-8111-111111111111',
      sourceId: '22222222-2222-4222-8222-222222222222'
    })
    expect(isReplayableJobType('merchant.catalog.reconcile')).toBe(true)
    expect(safeReplayContext(job('merchant.catalog.readback', {
      tenantId: 'tenant-1',
      clientId: '11111111-1111-4111-8111-111111111111',
      sourceId: '22222222-2222-4222-8222-222222222222',
      readbackAttempt: 4,
      accessToken: 'must-not-persist'
    }))).toEqual({
      tenantId: 'tenant-1',
      clientId: '11111111-1111-4111-8111-111111111111',
      sourceId: '22222222-2222-4222-8222-222222222222',
      readbackAttempt: 4
    })
    expect(isReplayableJobType('merchant.catalog.readback')).toBe(true)
  })
})
