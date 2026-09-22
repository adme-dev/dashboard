import { describe, expect, it, vi } from 'vitest'
import { createActionStorage } from '~~/server/utils/pageStudio/actionStorage'
import {
  collectionCanonical,
  collectionDigest
} from '~~/shared/pageStudio/collectionApi'
import { contentScopeKey } from '~~/shared/pageStudio/cmsManaged'

const scope = {
  tenantId: 'tenant',
  clientId: 'client',
  businessId: 'client',
  siteId: 'site',
  environment: 'staging'
}
const target = {
  accountId: 'a'.repeat(32),
  databaseId: '10000000-0000-4000-8000-000000000001',
  name: `ps-content-${'b'.repeat(32)}`,
  routeId: 'route',
  runtimeDigest: 'a'.repeat(64),
  collectionReceiptDigest: 'b'.repeat(64),
  workflowReceiptDigest: 'c'.repeat(64),
  stagingReceiptDigest: 'd'.repeat(64)
}
function fixture(raw: string, size = new TextEncoder().encode(raw).byteLength) {
  const get = vi.fn(async () => ({
    size,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(raw))
        controller.close()
      }
    })
  }))
  const readManagedCmsTarget = vi.fn(async () => target)
  const router = { readManagedCmsTarget, readManagedCmsObjects: vi.fn() }
  return {
    get,
    router,
    storage: createActionStorage(
      { PAGE_STUDIO_CHECKPOINTS: { get }, PAGE_STUDIO_CONTENT_ROUTER: router },
      scope,
      target
    )
  }
}
describe('actual action immutable storage adapters', () => {
  it('derives scoped artifact keys and verifies exact canonical bytes', async () => {
    const value = { kind: 'action', id: 'test_action', scope, version: 1 },
      raw = collectionCanonical(value),
      sha256 = await collectionDigest(value)
    const { storage, get } = fixture(raw)
    expect(
      await storage.readArtifact({
        kind: 'action',
        id: 'test_action',
        version: 1,
        sha256
      })
    ).toBe(raw)
    expect(get).toHaveBeenCalledWith(
      `builder-artifacts/v1/${await collectionDigest(JSON.parse(contentScopeKey(scope)))}/action/test_action/1/${sha256}.json`
    )
  })
  it.each(['truncated', 'noncanonical', 'oversized'])(
    'rejects %s bytes',
    async (kind) => {
      const value = { kind: 'action', id: 'test_action', scope, version: 1 },
        sha256 = await collectionDigest(value)
      const raw
        = kind === 'noncanonical'
          ? JSON.stringify(value)
          : collectionCanonical(value)
      await expect(
        fixture(
          raw,
          kind === 'truncated' ? 1 : kind === 'oversized' ? 300000 : undefined
        ).storage.readArtifact({
          kind: 'action',
          id: 'test_action',
          version: 1,
          sha256
        })
      ).rejects.toThrow()
    }
  )
  it('cancels streams with invalid R2 metadata before reading', async () => {
    const cancel = vi.fn()
    const storage = createActionStorage(
      {
        PAGE_STUDIO_CHECKPOINTS: {
          get: async () => ({
            size: Number.NaN,
            body: new ReadableStream({ cancel })
          })
        }
      },
      scope,
      target
    )
    await expect(
      storage.readArtifact({
        kind: 'action',
        id: 'test_action',
        version: 1,
        sha256: 'a'.repeat(64)
      })
    ).rejects.toThrow('unavailable')
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('rejects foreign result scope before R2 access', async () => {
    const { storage, get } = fixture('{}')
    await expect(
      storage.readResult(
        `builder-action-results/v1/${'a'.repeat(64)}/10000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002.json`
      )
    ).rejects.toThrow('scope')
    expect(get).not.toHaveBeenCalled()
  })
  it('fences physical target before and after object reads', async () => {
    const body = { example: 'value' },
      pin = {
        kind: 'content',
        collectionId: '',
        recordId: '',
        version: 1,
        origin: 'legacy',
        operationId: 'adoption',
        freezeDigest: 'e'.repeat(64),
        sha256: await collectionDigest(body),
        bytes: new TextEncoder().encode(collectionCanonical(body)).byteLength
      } as const
    const { storage, router } = fixture('{}')
    router.readManagedCmsObjects.mockImplementation(async () => {
      router.readManagedCmsTarget.mockResolvedValue({
        ...target,
        routeId: 'replacement'
      })
      return [
        {
          pin,
          body,
          schema: null,
          head: false,
          actorId: 'actor',
          createdAt: new Date().toISOString()
        }
      ]
    })
    await expect(storage.readObject(pin)).rejects.toThrow('target')
    expect(router.readManagedCmsObjects).toHaveBeenCalledOnce()
  })
})
