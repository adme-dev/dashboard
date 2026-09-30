import { describe, expect, it, vi } from 'vitest'
import { createCmsGraphStorage } from '~~/server/utils/pageStudio/cmsGraphStorage'
import type { CmsGraphSnapshot } from '~~/server/utils/pageStudio/cmsGraphCoordinator'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'

const scope = { tenantId: 'tenant', clientId: '10000000-0000-4000-8000-000000000001', businessId: '10000000-0000-4000-8000-000000000001', siteId: '20000000-0000-4000-8000-000000000001', environment: 'staging' as const }
const snapshot = { scope, context: { state: { target: {} } } } as CmsGraphSnapshot
function object(raw: string) {
  const bytes = new TextEncoder().encode(raw)
  return { size: bytes.length, body: new ReadableStream({ start(controller) {
    controller.enqueue(bytes)
    controller.close()
  } }) }
}
describe('bound graph storage bytes', () => {
  it('derives scoped artifact keys and verifies actual bytes', async () => {
    const value = { kind: 'action', id: 'action_a', version: 1, scope }, raw = collectionCanonical(value)
    const pin = { kind: 'action' as const, id: 'action_a', version: 1, sha256: await collectionDigest(value) }
    const get = vi.fn(async () => object(raw))
    const storage = createCmsGraphStorage({ PAGE_STUDIO_CHECKPOINTS: { get } }, snapshot)
    expect(await storage.readArtifact(pin)).toBe(raw)
    expect(get.mock.calls[0]?.[0]).toMatch(/^builder-artifacts\/v1\/[a-f0-9]{64}\/action\/action_a\/1\/[a-f0-9]{64}\.json$/)
  })
  it('accepts valid canonical artifact and candidate bytes beyond64KiB', async () => {
    const value = { kind: 'action', id: 'action_a', version: 1, scope, source: 'x'.repeat(70_000) }, raw = collectionCanonical(value)
    const storage = createCmsGraphStorage({ PAGE_STUDIO_CHECKPOINTS: { get: async () => object(raw) } }, snapshot)
    expect(await storage.readArtifact({ kind: 'action', id: 'action_a', version: 1, sha256: await collectionDigest(value) })).toBe(raw)
    expect(await storage.readCandidate('candidate_a')).toBe(raw)
  })
  it('rejects corrupted bytes even if their metadata looks bounded', async () => {
    const storage = createCmsGraphStorage({ PAGE_STUDIO_CHECKPOINTS: { get: async () => object('{}') } }, snapshot)
    await expect(storage.readArtifact({ kind: 'action', id: 'action_a', version: 1, sha256: 'a'.repeat(64) })).rejects.toThrow()
  })
  it('rejects path traversal pins before issuing a storage read', async () => {
    const get = vi.fn()
    const storage = createCmsGraphStorage({ PAGE_STUDIO_CHECKPOINTS: { get } }, snapshot)
    await expect(storage.readArtifact({ kind: 'action', id: '../other', version: 1, sha256: 'a'.repeat(64) })).rejects.toThrow()
    expect(get).not.toHaveBeenCalled()
  })
})

describe('target-pinned CMS graph reads', () => {
  const target = { accountId: 'a'.repeat(32), databaseId: '10000000-0000-4000-8000-000000000002', name: `ps-content-${'a'.repeat(32)}`, routeId: 'route', runtimeDigest: 'b'.repeat(64), collectionReceiptDigest: 'c'.repeat(64), workflowReceiptDigest: 'd'.repeat(64), stagingReceiptDigest: 'e'.repeat(64) }
  const admitted = { scope, context: { state: { target } } } as CmsGraphSnapshot
  async function fixture() {
    const body = { collections: [], schemaVersion: 1, scope }
    const pin = { kind: 'content' as const, collectionId: '', recordId: '', version: 1, bytes: new TextEncoder().encode(collectionCanonical(body)).byteLength, sha256: await collectionDigest(body), origin: 'legacy' as const, operationId: 'adopt', freezeDigest: 'f'.repeat(64) }
    const stored = { pin, body, schema: null, actorId: 'user', createdAt: '2026-09-29T00:00:00Z', head: true }
    const readManagedCmsObjectsAtTarget = vi.fn(async () => [stored])
    const readManagedCmsTarget = vi.fn(async () => target)
    const storage = createCmsGraphStorage({ PAGE_STUDIO_CONTENT_ROUTER: { readManagedCmsObjectsAtTarget, readManagedCmsTarget } }, admitted)
    return { pin, stored, storage, readManagedCmsObjectsAtTarget, readManagedCmsTarget }
  }
  it('sends the admitted target with the pins in one private RPC', async () => {
    const s = await fixture()
    expect(await s.storage.readObjects([s.pin])).toEqual([s.stored])
    expect(s.readManagedCmsObjectsAtTarget).toHaveBeenCalledExactlyOnceWith({ scope, target, pins: [s.pin] })
    expect(s.readManagedCmsTarget).not.toHaveBeenCalled()
  })
  it('withholds corrupted bytes from the pinned transport', async () => {
    const s = await fixture()
    s.readManagedCmsObjectsAtTarget.mockResolvedValueOnce([{ ...s.stored, body: { ...s.stored.body, schemaVersion: 2 } }])
    await expect(s.storage.readObjects([s.pin])).rejects.toThrow()
  })
  it('fails closed when the pinned method is missing or rejects authority', async () => {
    const s = await fixture()
    const oldRead = vi.fn()
    const storage = createCmsGraphStorage({ PAGE_STUDIO_CONTENT_ROUTER: { readManagedCmsObjects: oldRead, readManagedCmsTarget: s.readManagedCmsTarget } }, admitted)
    await expect(storage.readObjects([s.pin])).rejects.toThrow()
    expect(oldRead).not.toHaveBeenCalled()
    s.readManagedCmsObjectsAtTarget.mockRejectedValueOnce(new Error('route revoked'))
    await expect(s.storage.readObjects([s.pin])).rejects.toThrow('route revoked')
  })
  it('uses private placed fetch for staging objects without weakening pin verification', async () => {
    const s = await fixture()
    const fetch = vi.fn(async (_request: Request) => Response.json([s.stored]))
    const storage = createCmsGraphStorage({ PAGE_STUDIO_CMS_OBJECT_TRANSPORT: 'placed-fetch', PAGE_STUDIO_CONTENT_ROUTER: { fetch, readManagedCmsObjectsAtTarget: s.readManagedCmsObjectsAtTarget } }, admitted)
    expect(await storage.readObjects([s.pin])).toEqual([s.stored])
    const request = fetch.mock.calls[0]![0]
    expect(request.url).toBe('https://cms-objects.internal/read')
    expect(request.method).toBe('POST')
    expect(request.redirect).toBe('manual')
    expect(await request.json()).toEqual({ scope, target, pins: [s.pin] })
    expect(s.readManagedCmsObjectsAtTarget).not.toHaveBeenCalled()
    fetch.mockResolvedValueOnce(Response.json([{ ...s.stored, body: {} }]))
    await expect(storage.readObjects([s.pin])).rejects.toThrow()
  })
  it('does not downgrade configured placed reads after unavailable or unbounded transport', async () => {
    const s = await fixture()
    const fetch = vi.fn()
    const storage = createCmsGraphStorage({ PAGE_STUDIO_CMS_OBJECT_TRANSPORT: 'placed-fetch', PAGE_STUDIO_CONTENT_ROUTER: { fetch, readManagedCmsObjectsAtTarget: s.readManagedCmsObjectsAtTarget } }, admitted)
    for (const response of [new Response('null', { status: 503 }), new Response('null', { status: 302 }), new Response('x'.repeat(2_000_001)), new Response('{')]) {
      fetch.mockResolvedValueOnce(response)
      await expect(storage.readObjects([s.pin])).rejects.toThrow()
    }
    const missing = createCmsGraphStorage({ PAGE_STUDIO_CMS_OBJECT_TRANSPORT: 'placed-fetch', PAGE_STUDIO_CONTENT_ROUTER: { readManagedCmsObjectsAtTarget: s.readManagedCmsObjectsAtTarget } }, admitted)
    await expect(missing.readObjects([s.pin])).rejects.toThrow()
    expect(s.readManagedCmsObjectsAtTarget).not.toHaveBeenCalled()
  })
  it('still verifies authority for an empty read', async () => {
    const s = await fixture()
    expect(await s.storage.readObjects([])).toEqual([])
    expect(s.readManagedCmsTarget).toHaveBeenCalledOnce()
    expect(s.readManagedCmsObjectsAtTarget).not.toHaveBeenCalled()
  })
})
