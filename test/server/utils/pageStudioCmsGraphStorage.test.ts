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
