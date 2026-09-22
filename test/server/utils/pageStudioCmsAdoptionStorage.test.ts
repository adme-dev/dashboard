import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createCmsAdoptionStorage } from '~~/server/utils/pageStudio/cmsAdoptionStorage'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { CmsAdoptionIntentSchema, contentScopeKey } from '~~/shared/pageStudio/cmsManaged'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const scope = {
  tenantId: 'tenant',
  clientId: '10000000-0000-4000-8000-000000000001',
  businessId: '10000000-0000-4000-8000-000000000001',
  siteId: '20000000-0000-4000-8000-000000000001',
  environment: 'staging' as const
}
const target = {
  accountId: 'a'.repeat(32),
  databaseId: '30000000-0000-4000-8000-000000000001',
  name: `ps-content-${'a'.repeat(32)}`,
  routeId: 'route_a',
  runtimeDigest: 'b'.repeat(64),
  collectionReceiptDigest: 'c'.repeat(64),
  workflowReceiptDigest: 'd'.repeat(64),
  stagingReceiptDigest: 'e'.repeat(64)
}
const intent = CmsAdoptionIntentSchema.parse({
  formatVersion: 1,
  scope,
  target,
  actor: {
    kind: 'agency-user',
    userId: '50000000-0000-4000-8000-000000000001',
    loginSessionHash: 'a'.repeat(64)
  },
  adoptionId: 'adoption_a',
  generation: '40000000-0000-4000-8000-000000000001',
  expectedCheckpoint: { id: 'checkpoint_a', digest: 'a'.repeat(64) }
})
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
  const env = {
    PAGE_STUDIO_CONTENT_ROUTER: { readManagedCmsTarget: async () => target },
    PAGE_STUDIO_CHECKPOINTS: { get }
  }
  return { get, storage: createCmsAdoptionStorage(env, intent, null) }
}
describe('actual adoption R2 component loader', () => {
  it('derives exact scoped immutable key and deduplicates verified reads', async () => {
    const body = { kind: 'component', id: 'card', version: 1, scope },
      raw = collectionCanonical(body),
      pin = { kind: 'component' as const, id: 'card', version: 1, sha256: hash(raw) }
    const { get, storage } = fixture(raw)
    expect(await storage.graph.readComponent(scope, pin)).toEqual(body)
    expect(await storage.graph.readComponent(scope, pin)).toEqual(body)
    expect(get).toHaveBeenCalledOnce()
    expect(get).toHaveBeenCalledWith(
      `builder-artifacts/v1/${hash(contentScopeKey(scope))}/component/card/1/${pin.sha256}.json`
    )
  })
  it('rejects malformed raw bytes, truncated metadata and noncanonical artifacts', async () => {
    const raw = JSON.stringify({ z: 1, a: 2 }),
      pin = { kind: 'component' as const, id: 'card', version: 1, sha256: hash(raw) }
    await expect(fixture(raw).storage.graph.readComponent(scope, pin)).rejects.toThrow('canonical')
    await expect(fixture(raw, 100).storage.graph.readComponent(scope, pin)).rejects.toThrow(
      'truncated'
    )
    await expect(fixture('x').storage.graph.readComponent(scope, pin)).rejects.toThrow('digest')
    await expect(fixture('x', 262145).storage.graph.readComponent(scope, pin)).rejects.toThrow(
      'unavailable'
    )
  })
  it('caps cumulative actual artifact bytes and rejects foreign scope before fetching', async () => {
    const body = { kind: 'component', id: 'card', version: 1, scope, payload: 'x'.repeat(250000) },
      raw = collectionCanonical(body),
      { storage, get } = fixture(raw)
    const pin = { kind: 'component' as const, id: 'card', version: 1, sha256: hash(raw) }
    await expect(storage.graph.readComponent({ ...scope, siteId: 'other' }, pin)).rejects.toThrow(
      'scope'
    )
    expect(get).not.toHaveBeenCalled()
    for (let i = 0; i < 7; i++) {
      const value = collectionCanonical({ ...body, id: `card_${i}` })
      get.mockImplementationOnce(async () => ({
        size: new TextEncoder().encode(value).byteLength,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(value))
            controller.close()
          }
        })
      }))
      await storage.graph.readComponent(scope, { ...pin, id: `card_${i}`, sha256: hash(value) })
    }
    await expect(storage.graph.readComponent(scope, pin)).rejects.toThrow('budget')
  })
  it('bounds parsed structure before canonical recursion', async () => {
    let nested: unknown = 'end'
    for (let i = 0; i < 34; i++) nested = { child: nested }
    const raw = JSON.stringify({ kind: 'component', id: 'card', version: 1, scope, nested })
    await expect(
      fixture(raw).storage.graph.readComponent(scope, {
        kind: 'component',
        id: 'card',
        version: 1,
        sha256: hash(raw)
      })
    ).rejects.toThrow('structural')
  })
})
