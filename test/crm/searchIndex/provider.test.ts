import { describe, expect, it, vi } from 'vitest'

import {
  confirmStoredCrmSearchVector,
  createCrmSearchProvider,
  resolveCrmSearchProviderRuntime,
  verifyCrmSearchProviderReadiness
} from '~~/server/utils/crm/searchIndex/provider'

const namespace = 'oNmEHqD21LtKoRd1vUFkSadsyBM8y9jelSpv6UfJjy4'
const vectorId = 'ohuXvpFaoi6E5QOIoE3zaeRuh-jOjPq5-JYyn0S6ajE'
const confirmationTag = `hmac-sha256:${'a'.repeat(64)}`

function runtimeWithEmbedding(embedding: unknown = Array(768).fill(0.125)) {
  return {
    ai: {
      run: vi.fn().mockResolvedValue({ data: [embedding] })
    },
    vectorize: {
      upsert: vi.fn().mockResolvedValue({ mutationId: 'mutation-upsert-1' }),
      deleteByIds: vi.fn().mockResolvedValue({ mutationId: 'mutation-delete-1' }),
      getByIds: vi.fn().mockResolvedValue([])
    }
  }
}

describe('CRM search provider contract', () => {
  it('resolves only AI plus the dedicated CRM_SEARCH_VECTORIZE binding', async () => {
    const aiBinding = { run: vi.fn() }
    const dedicated = {
      upsert: vi.fn(),
      deleteByIds: vi.fn(),
      getByIds: vi.fn()
    }
    const shared = {
      upsert: vi.fn(),
      deleteByIds: vi.fn(),
      getByIds: vi.fn()
    }
    const resolved = resolveCrmSearchProviderRuntime({
      context: {
        cloudflare: {
          env: { AI: aiBinding, CRM_SEARCH_VECTORIZE: dedicated, VECTORIZE: shared }
        }
      }
    } as never)

    expect(resolved).not.toBeNull()
    await resolved!.vectorize.upsert([])
    expect(dedicated.upsert).toHaveBeenCalledOnce()
    expect(shared.upsert).not.toHaveBeenCalled()
    expect(resolveCrmSearchProviderRuntime({
      context: { cloudflare: { env: { AI: aiBinding, VECTORIZE: shared } } }
    } as never)).toBeNull()
  })

  it('requires the exact metadata indexes and a complete filtered non-CRM sentinel lifecycle', async () => {
    const sentinelId = 'crm-search-readiness-sentinel-v1'
    const calls: string[] = []
    const storedSentinel = {
      id: sentinelId,
      namespace,
      metadata: {
        entityType: '__crm_search_sentinel__',
        schemaVersion: '__crm_search_readiness_v1__'
      }
    }
    const runtime = {
      vectorize: {
        listMetadataIndexes: vi.fn(async () => {
          calls.push('list_metadata_indexes')
          return [
            { propertyName: 'entityType', type: 'string' },
            { propertyName: 'schemaVersion', type: 'string' }
          ]
        }),
        upsert: vi.fn(async () => {
          calls.push('upsert_sentinel')
          return { mutationId: 'sentinel-upsert-1' }
        }),
        getByIds: vi.fn()
          .mockImplementationOnce(async () => {
            calls.push('confirm_sentinel')
            return [storedSentinel]
          })
          .mockImplementationOnce(async () => {
            calls.push('confirm_absence')
            return []
          }),
        query: vi.fn(async (_vector, options) => {
          calls.push('filtered_query')
          expect(options).toMatchObject({
            namespace,
            returnMetadata: 'all',
            returnValues: false,
            filter: {
              entityType: { $eq: '__crm_search_sentinel__' },
              schemaVersion: { $eq: '__crm_search_readiness_v1__' }
            }
          })
          return { matches: [storedSentinel] }
        }),
        deleteByIds: vi.fn(async () => {
          calls.push('delete_sentinel')
          return { mutationId: 'sentinel-delete-1' }
        })
      }
    }

    await expect(verifyCrmSearchProviderReadiness({
      namespace,
      sentinelId,
      sentinelValues: Array(768).fill(0)
    }, runtime as never)).resolves.toEqual({
      metadataIndexesReady: true,
      sentinelRoundTripConfirmed: true,
      sentinelAbsenceConfirmed: true
    })

    expect(calls).toEqual([
      'list_metadata_indexes',
      'upsert_sentinel',
      'confirm_sentinel',
      'filtered_query',
      'delete_sentinel',
      'confirm_absence'
    ])
  })

  it('bounded-polls sentinel visibility, filtered query visibility, and delete absence', async () => {
    const sentinelId = 'crm-search-readiness-sentinel-v1'
    const storedSentinel = {
      id: sentinelId,
      namespace,
      metadata: {
        entityType: '__crm_search_sentinel__',
        schemaVersion: '__crm_search_readiness_v1__'
      }
    }
    const sleep = vi.fn().mockResolvedValue(undefined)
    const runtime = {
      vectorize: {
        listMetadataIndexes: vi.fn().mockResolvedValue([
          { propertyName: 'entityType', type: 'string' },
          { propertyName: 'schemaVersion', type: 'string' }
        ]),
        upsert: vi.fn().mockResolvedValue({ mutationId: 'sentinel-upsert-1' }),
        getByIds: vi.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([storedSentinel])
          .mockResolvedValueOnce([storedSentinel])
          .mockResolvedValueOnce([]),
        query: vi.fn()
          .mockResolvedValueOnce({ matches: [] })
          .mockResolvedValueOnce({ matches: [storedSentinel] }),
        deleteByIds: vi.fn().mockResolvedValue({ mutationId: 'sentinel-delete-1' })
      }
    }

    await expect(verifyCrmSearchProviderReadiness({
      namespace,
      sentinelId,
      sentinelValues: Array(768).fill(0)
    }, runtime as never, {
      maximumPollAttempts: 3,
      pollDelayMs: 1,
      sleep
    })).resolves.toEqual({
      metadataIndexesReady: true,
      sentinelRoundTripConfirmed: true,
      sentinelAbsenceConfirmed: true
    })

    expect(runtime.vectorize.getByIds).toHaveBeenCalledTimes(4)
    expect(runtime.vectorize.query).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledWith(1)
  })

  it('uses one sentinel mutation per phase while polling the default ten-second visibility window', async () => {
    const sentinelId = 'crm-search-readiness-sentinel-v1'
    const storedSentinel = {
      id: sentinelId,
      namespace,
      metadata: {
        entityType: '__crm_search_sentinel__',
        schemaVersion: '__crm_search_readiness_v1__'
      }
    }
    let exactReads = 0
    let filteredReads = 0
    let deletionStarted = false
    let absenceReads = 0
    const sleep = vi.fn().mockResolvedValue(undefined)
    const runtime = {
      vectorize: {
        listMetadataIndexes: vi.fn().mockResolvedValue([
          { propertyName: 'entityType', type: 'string' },
          { propertyName: 'schemaVersion', type: 'string' }
        ]),
        upsert: vi.fn().mockResolvedValue({ mutationId: 'sentinel-upsert-1' }),
        getByIds: vi.fn(async () => {
          if (!deletionStarted) {
            exactReads += 1
            return exactReads === 40 ? [storedSentinel] : []
          }
          absenceReads += 1
          return absenceReads === 40 ? [] : [storedSentinel]
        }),
        query: vi.fn(async () => {
          filteredReads += 1
          return { matches: filteredReads === 40 ? [storedSentinel] : [] }
        }),
        deleteByIds: vi.fn(async () => {
          deletionStarted = true
          return { mutationId: 'sentinel-delete-1' }
        })
      }
    }

    await expect(verifyCrmSearchProviderReadiness({
      namespace,
      sentinelId,
      sentinelValues: Array(768).fill(0)
    }, runtime as never, { sleep })).resolves.toMatchObject({
      sentinelRoundTripConfirmed: true,
      sentinelAbsenceConfirmed: true
    })

    expect(runtime.vectorize.upsert).toHaveBeenCalledOnce()
    expect(runtime.vectorize.deleteByIds).toHaveBeenCalledOnce()
    expect(exactReads).toBe(40)
    expect(filteredReads).toBe(40)
    expect(absenceReads).toBe(40)
    expect(sleep).toHaveBeenCalledTimes(117)
    expect(sleep).toHaveBeenCalledWith(250)
  })

  it('fails before sentinel or CRM work when either exact string metadata index is absent', async () => {
    const upsert = vi.fn()
    const runtime = {
      vectorize: {
        listMetadataIndexes: vi.fn().mockResolvedValue([
          { propertyName: 'entityType', type: 'string' },
          { propertyName: 'sourceRevision', type: 'number' }
        ]),
        upsert,
        getByIds: vi.fn(),
        query: vi.fn(),
        deleteByIds: vi.fn()
      }
    }

    await expect(verifyCrmSearchProviderReadiness({
      namespace,
      sentinelId: 'crm-search-readiness-sentinel-v1',
      sentinelValues: Array(768).fill(0)
    }, runtime as never)).rejects.toThrow('crm_search_metadata_indexes_not_ready')
    expect(upsert).not.toHaveBeenCalled()
  })

  it('pins the BGE model, cls pooling, one bounded document, and 768 finite dimensions', async () => {
    const runtime = runtimeWithEmbedding()
    const provider = createCrmSearchProvider(runtime as never)

    const embedding = await provider.embedDocument('Name: Atlas Motors')

    expect(runtime.ai.run).toHaveBeenCalledWith(
      '@cf/baai/bge-base-en-v1.5',
      { text: ['Name: Atlas Motors'], pooling: 'cls' }
    )
    expect(embedding).toHaveLength(768)
    expect(embedding.every(Number.isFinite)).toBe(true)
  })

  it.each([
    { data: undefined, label: 'missing data' },
    { data: [], label: 'missing embedding' },
    { data: [Array(767).fill(0)], label: 'wrong dimensions' },
    { data: [[...Array(767).fill(0), Number.NaN]], label: 'non-finite value' },
    { data: [Array(768).fill(0), Array(768).fill(0)], label: 'extra embedding' }
  ])('rejects a malformed Workers AI result: $label', async ({ data }) => {
    const runtime = runtimeWithEmbedding()
    runtime.ai.run.mockResolvedValueOnce({ data })
    const provider = createCrmSearchProvider(runtime as never)

    await expect(provider.embedDocument('Name: Atlas Motors')).rejects.toThrow(
      'crm_search_invalid_embedding'
    )
    expect(runtime.vectorize.upsert).not.toHaveBeenCalled()
  })

  it('upserts only the canonical namespace, ID, values, and routing/confirmation metadata', async () => {
    const runtime = runtimeWithEmbedding()
    const provider = createCrmSearchProvider(runtime as never)
    const values = Array(768).fill(0.125)

    await expect(provider.upsertVector({
      id: vectorId,
      namespace,
      values,
      metadata: {
        entityType: 'company',
        schemaVersion: 'crm-search-v1',
        sourceRevision: 7,
        confirmationTag,
        confirmationKeyVersion: 'k1'
      }
    })).resolves.toEqual({ mutationId: 'mutation-upsert-1' })

    const sent = runtime.vectorize.upsert.mock.calls[0]?.[0]?.[0]
    expect(sent).toEqual({
      id: vectorId,
      namespace,
      values,
      metadata: {
        entityType: 'company',
        schemaVersion: 'crm-search-v1',
        sourceRevision: 7,
        confirmationTag,
        confirmationKeyVersion: 'k1'
      }
    })
    expect(JSON.stringify(sent)).not.toMatch(/contentHash|sourceText|Atlas Motors/i)
  })

  it('never swallows a provider failure or represents acceptance as confirmation', async () => {
    const runtime = runtimeWithEmbedding()
    runtime.vectorize.upsert.mockRejectedValueOnce(new Error('private provider detail'))
    const provider = createCrmSearchProvider(runtime as never)

    await expect(provider.upsertVector({
      id: vectorId,
      namespace,
      values: Array(768).fill(0.125),
      metadata: {
        entityType: 'company',
        schemaVersion: 'crm-search-v1',
        sourceRevision: 7,
        confirmationTag,
        confirmationKeyVersion: 'k1'
      }
    })).rejects.toMatchObject({ code: 'crm_search_vectorize_upsert_failed' })
  })

  it('confirms only an exact ID/namespace/schema/revision/key/tag match and discards values', () => {
    const expected = {
      id: vectorId,
      namespace,
      entityType: 'company' as const,
      schemaVersion: 'crm-search-v1',
      sourceRevision: 7,
      confirmationTag,
      confirmationKeyVersion: 'k1'
    }
    const stored = {
      id: vectorId,
      namespace,
      values: new Float32Array(768).fill(0.125),
      metadata: {
        entityType: 'company',
        schemaVersion: 'crm-search-v1',
        sourceRevision: 7,
        confirmationTag,
        confirmationKeyVersion: 'k1'
      }
    }

    expect(confirmStoredCrmSearchVector(stored, expected)).toBe(true)
    expect(confirmStoredCrmSearchVector({
      ...stored,
      namespace: `${namespace}x`
    }, expected)).toBe(false)
    expect(confirmStoredCrmSearchVector({
      ...stored,
      metadata: { ...stored.metadata, confirmationKeyVersion: 'k0' }
    }, expected)).toBe(false)
    expect(confirmStoredCrmSearchVector({
      ...stored,
      metadata: { ...stored.metadata, confirmationTag: `hmac-sha256:${'b'.repeat(64)}` }
    }, expected)).toBe(false)
  })
})
