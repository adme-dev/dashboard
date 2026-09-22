import { describe, expect, it, vi } from 'vitest'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { persistCandidateCheckpoint } from '~~/server/utils/pageStudio/candidateCheckpoint'

async function fixture() {
  const objects = new Map<string, string>()
  const bucket = {
    get: vi.fn(async (key: string) => {
      const raw = objects.get(key)
      return raw === undefined
        ? null
        : { etag: 'stored', size: new TextEncoder().encode(raw).byteLength,
            body: new ReadableStream<Uint8Array>({ start(c) {
              c.enqueue(new TextEncoder().encode(raw))
              c.close()
            } }) }
    }),
    put: vi.fn(async (key: string, raw: string, _options: unknown) => {
      if (objects.has(key)) return null
      objects.set(key, raw)
      return { etag: 'stored' }
    })
  }
  const manifest = { id: 'site', pages: [] }
  const input = { checkpointId: 'checkpoint_feature_one', scope: { tenantId: 'tenant', clientId: 'client', siteId: 'site' },
    userId: 'user', manifest, digest: await collectionDigest(manifest) }
  return { objects, bucket, input }
}
describe('immutable feature checkpoint persistence', () => {
  it('recovers original timestamp and metadata on retry without overwriting', async () => {
    const f = await fixture()
    const first = await persistCandidateCheckpoint(f.input, f.bucket)
    expect(await persistCandidateCheckpoint(f.input, f.bucket)).toEqual(first)
    expect(f.bucket.put).toHaveBeenCalledOnce()
    expect(first.objectKey).toBe('tenants/tenant/clients/client/sites/site/checkpoints/checkpoint_feature_one.json')
  })
  it('recovers an unknown put acknowledgement from exact durable bytes', async () => {
    const f = await fixture()
    f.bucket.put.mockImplementationOnce(async (key, raw) => {
      f.objects.set(key, raw)
      throw new Error('lost response')
    })
    expect(await persistCandidateCheckpoint(f.input, f.bucket)).toMatchObject({ checkpointId: f.input.checkpointId, etag: 'stored' })
    expect(f.bucket.put).toHaveBeenCalledOnce()
  })
  it('rejects reused identity with changed author or bytes', async () => {
    const f = await fixture()
    await persistCandidateCheckpoint(f.input, f.bucket)
    await expect(persistCandidateCheckpoint({ ...f.input, userId: 'other' }, f.bucket)).rejects.toThrow('identity')
    const manifest = { id: 'site', pages: [{ name: 'changed' }] }
    await expect(persistCandidateCheckpoint({ ...f.input, manifest, digest: await collectionDigest(manifest) }, f.bucket)).rejects.toThrow('identity')
  })
  it('rejects wrong manifest digest before private write', async () => {
    const f = await fixture()
    await expect(persistCandidateCheckpoint({ ...f.input, digest: 'a'.repeat(64) }, f.bucket)).rejects.toThrow('digest')
    expect(f.bucket.put).not.toHaveBeenCalled()
  })
  it('handles two conditional writers with a single immutable timestamp', async () => {
    const f = await fixture()
    const [a, b] = await Promise.all([persistCandidateCheckpoint(f.input, f.bucket), persistCandidateCheckpoint(f.input, f.bucket)])
    expect(a).toEqual(b)
    expect(f.objects.size).toBe(1)
  })
  it('rejects dishonest storage size and cancels the stream', async () => {
    const f = await fixture(), cancel = vi.fn()
    f.bucket.get.mockResolvedValueOnce({ etag: 'stored', size: 1, body: new ReadableStream({ start(c) {
      c.enqueue(new Uint8Array(10))
    }, cancel }) })
    await expect(persistCandidateCheckpoint(f.input, f.bucket)).rejects.toThrow('byte')
    expect(cancel).toHaveBeenCalledOnce()
    expect(f.bucket.put).not.toHaveBeenCalled()
  })
})
