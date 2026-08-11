import { describe, expect, it, vi } from 'vitest'

import {
  CRM_SEARCH_INDEX_PROTOCOL_VERSION,
  type CrmSearchIndexQueueMessage
} from '../../../shared/crmSearchIndexProtocol'
import {
  expandCrmSearchDirtySources,
  publishCrmSearchOperations,
  type CrmSearchIndexPublisherDependencies,
  type CrmSearchOperationPublicationClaim
} from '../../../server/utils/crm/searchIndex/publisher'
import {
  resolveCrmSearchIndexQueueProducer
} from '../../../server/utils/crm/searchIndex/bindings'

const NOW_MS = 2_000_000_000_000
const operationId = '11111111-1111-4111-8111-111111111111'
const correlationId = '22222222-2222-4222-8222-222222222222'

function publicationClaim(
  overrides: Partial<CrmSearchOperationPublicationClaim> = {}
): CrmSearchOperationPublicationClaim {
  return {
    operationId,
    claimToken: '33333333-3333-4333-8333-333333333333',
    claimGeneration: 7,
    ...overrides
  }
}

function dependencies(
  overrides: Partial<CrmSearchIndexPublisherDependencies> = {}
): CrmSearchIndexPublisherDependencies {
  return {
    now: () => NOW_MS,
    randomUUID: () => correlationId,
    expandDirtySourceBatch: vi.fn(async () => ({
      dirtyClaimed: 1,
      operationsCreated: 1,
      skippedByControl: 0
    })),
    claimOperationsForPublication: vi.fn(async () => [publicationClaim()]),
    confirmOperationPublished: vi.fn(async () => true),
    rescheduleOperationPublication: vi.fn(async () => true),
    resolveQueue: vi.fn(() => ({ send: vi.fn(async () => undefined) })),
    ...overrides
  }
}

describe('CRM search index operation publisher', () => {
  it('expands a bounded dirty batch and publishes only a canonical identifier envelope', async () => {
    const send = vi.fn(async () => undefined)
    const confirmOperationPublished = vi.fn(async () => true)
    const deps = dependencies({
      resolveQueue: () => ({ send }),
      confirmOperationPublished
    })

    await expect(publishCrmSearchOperations({ context: {} } as never, {
      limit: 25
    }, deps)).resolves.toEqual({
      dirtyClaimed: 1,
      operationsCreated: 1,
      operationsPublished: 1,
      operationsRescheduled: 0,
      skippedByControl: 0
    })

    const expectedMessage: CrmSearchIndexQueueMessage = {
      protocolVersion: CRM_SEARCH_INDEX_PROTOCOL_VERSION,
      operationId,
      correlationId,
      enqueuedAt: new Date(NOW_MS).toISOString()
    }
    expect(send).toHaveBeenCalledWith(expectedMessage, { contentType: 'json' })
    expect(confirmOperationPublished).toHaveBeenCalledWith({
      operationId,
      claimToken: '33333333-3333-4333-8333-333333333333',
      claimGeneration: 7,
      publishedAt: new Date(NOW_MS)
    })
    expect(JSON.stringify(send.mock.calls)).not.toMatch(
      /source|payload|client|organisation|provider|document|error/i
    )
  })

  it.each(['halted', 'off'] as const)(
    'keeps dirty work durable when fresh control is %s',
    async () => {
      const expandDirtySourceBatch = vi.fn(async () => ({
        dirtyClaimed: 1,
        operationsCreated: 0,
        skippedByControl: 1
      }))
      const claimOperationsForPublication = vi.fn(async () => [])
      const result = await publishCrmSearchOperations({ context: {} } as never, {
        limit: 25
      }, dependencies({ expandDirtySourceBatch, claimOperationsForPublication }))

      expect(result).toEqual({
        dirtyClaimed: 1,
        operationsCreated: 0,
        operationsPublished: 0,
        operationsRescheduled: 0,
        skippedByControl: 1
      })
      expect(expandDirtySourceBatch).toHaveBeenCalledWith({
        limit: 25,
        now: new Date(NOW_MS),
        event: expect.anything()
      })
    }
  )

  it('exposes delete-only expansion as a repository-owned, transactionally bounded contract', async () => {
    const expandDirtySourceBatch = vi.fn(async () => ({
      dirtyClaimed: 2,
      operationsCreated: 1,
      skippedByControl: 1
    }))

    await expect(expandCrmSearchDirtySources({ context: {} } as never, {
      limit: 2
    }, dependencies({ expandDirtySourceBatch }))).resolves.toEqual({
      dirtyClaimed: 2,
      operationsCreated: 1,
      skippedByControl: 1
    })

    expect(expandDirtySourceBatch).toHaveBeenCalledWith({
      limit: 2,
      now: new Date(NOW_MS),
      event: expect.anything()
    })
  })

  it('reschedules a transport claim with CAS when the dedicated queue is absent', async () => {
    const rescheduleOperationPublication = vi.fn(async () => true)
    const confirmOperationPublished = vi.fn(async () => true)

    await expect(publishCrmSearchOperations({
      context: { cloudflare: { env: { JOBS_QUEUE: { send: vi.fn() } } } }
    } as never, { limit: 25 }, dependencies({
      resolveQueue: resolveCrmSearchIndexQueueProducer,
      rescheduleOperationPublication,
      confirmOperationPublished
    }))).resolves.toMatchObject({
      operationsPublished: 0,
      operationsRescheduled: 1
    })

    expect(rescheduleOperationPublication).toHaveBeenCalledWith({
      operationId,
      claimToken: '33333333-3333-4333-8333-333333333333',
      claimGeneration: 7,
      errorClass: 'queue_unavailable',
      nextAttemptAt: new Date(NOW_MS + 30_000)
    })
    expect(confirmOperationPublished).not.toHaveBeenCalled()
  })

  it('reschedules via CAS after queue send failure and never invokes provider work inline', async () => {
    const send = vi.fn(async () => {
      throw new Error('queue unavailable with raw provider detail')
    })
    const rescheduleOperationPublication = vi.fn(async () => true)
    const deps = dependencies({
      resolveQueue: () => ({ send }),
      rescheduleOperationPublication
    })

    await expect(publishCrmSearchOperations({ context: {} } as never, {
      limit: 25
    }, deps)).resolves.toMatchObject({
      operationsPublished: 0,
      operationsRescheduled: 1
    })

    expect(rescheduleOperationPublication).toHaveBeenCalledWith(expect.objectContaining({
      operationId,
      errorClass: 'queue_send_failed'
    }))
    expect(Object.keys(deps)).not.toContain('runProviderInline')
  })

  it('cannot multiply a coalesced operation across repeated repair runs', async () => {
    let claimed = false
    const send = vi.fn(async () => undefined)
    const claimOperationsForPublication = vi.fn(async () => {
      if (claimed) return []
      claimed = true
      return [publicationClaim()]
    })
    const expandDirtySourceBatch = vi.fn(async () => ({
      dirtyClaimed: claimed ? 0 : 1,
      operationsCreated: claimed ? 0 : 1,
      skippedByControl: 0
    }))
    const deps = dependencies({
      expandDirtySourceBatch,
      claimOperationsForPublication,
      resolveQueue: () => ({ send })
    })

    await publishCrmSearchOperations({ context: {} } as never, { limit: 25 }, deps)
    await publishCrmSearchOperations({ context: {} } as never, { limit: 25 }, deps)

    expect(send).toHaveBeenCalledTimes(1)
  })

  it.each([0, -1, 1.5, 101, Number.NaN])(
    'rejects an unsafe batch limit before touching durable work: %s',
    async (limit) => {
      const deps = dependencies()
      await expect(publishCrmSearchOperations({ context: {} } as never, {
        limit
      }, deps)).rejects.toThrow('CRM search publisher limit')
      expect(deps.expandDirtySourceBatch).not.toHaveBeenCalled()
    }
  )

  it('rejects repository counts that exceed the requested bound', async () => {
    const deps = dependencies({
      expandDirtySourceBatch: async () => ({
        dirtyClaimed: 26,
        operationsCreated: 0,
        skippedByControl: 0
      })
    })
    await expect(expandCrmSearchDirtySources({ context: {} } as never, {
      limit: 25
    }, deps)).rejects.toThrow('CRM search expansion result')
  })

  it('bounds schema-specific operation fanout to eight intents per dirty source', async () => {
    const accepted = dependencies({
      expandDirtySourceBatch: async () => ({
        dirtyClaimed: 2,
        operationsCreated: 16,
        skippedByControl: 0
      })
    })
    await expect(expandCrmSearchDirtySources({ context: {} } as never, {
      limit: 2
    }, accepted)).resolves.toMatchObject({ operationsCreated: 16 })

    const rejected = dependencies({
      expandDirtySourceBatch: async () => ({
        dirtyClaimed: 2,
        operationsCreated: 17,
        skippedByControl: 0
      })
    })
    await expect(expandCrmSearchDirtySources({ context: {} } as never, {
      limit: 2
    }, rejected)).rejects.toThrow('CRM search expansion result')
  })
})
