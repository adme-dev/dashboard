import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { preparePageStudioRuntimeRelease, resolveRuntimeRenderer, type RuntimeContentBucket } from '~~/server/utils/pageStudio/runtimeReleases'

const scope = { tenantId: 'tenant_a', clientId: '10000000-0000-4000-8000-000000000001', siteId: '20000000-0000-4000-8000-000000000002' }
const siteRoot = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}`
const renderer = { assetsDigest: 'a'.repeat(64), codeDigest: 'b'.repeat(64), generation: 'renderer_one', name: 'astro-runtime' as const }
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`
}

function webp(marker: number) {
  const bytes = new Uint8Array(32)
  bytes.set(new TextEncoder().encode('RIFF'), 0)
  bytes.set(new TextEncoder().encode('WEBP'), 8)
  bytes[20] = marker
  return bytes
}

function memoryBucket() {
  const objects = new Map<string, Uint8Array>()
  const puts: string[] = []
  const bucket: RuntimeContentBucket = {
    get: async (key) => {
      const bytes = objects.get(key)
      return bytes
        ? { arrayBuffer: async () => bytes.slice().buffer, body: new Blob([bytes]).stream(), size: bytes.byteLength }
        : null
    },
    put: async (key, value) => {
      puts.push(key)
      objects.set(key, value)
    }
  }
  return { bucket, objects, puts }
}

function fixture() {
  const image = webp(1)
  const imageDigest = sha(image)
  const manifest = {
    id: scope.siteId,
    pages: [
      { id: 'page_home', route: '/', visibility: 'public', components: [{ props: { image: `/assets/${imageDigest}.webp` } }] },
      { id: 'page_offer', route: '/offer', visibility: 'public', components: [] }
    ],
    redirects: [{ from: '/old-offer', status: 308, toPageId: 'page_offer' }],
    schemaVersion: 2
  }
  const digest = sha(canonical(manifest))
  const store = memoryBucket()
  store.objects.set(`${siteRoot}/preview-assets/${imageDigest}.webp`, image)
  const loadCheckpoint = async () => ({ checkpointId: 'checkpoint_a', digest, manifest, releaseMetadata: {} as never })
  const prepare = (environment: 'staging' | 'production' = 'production') =>
    preparePageStudioRuntimeRelease({ bucket: store.bucket, environment, renderer, scope, versionId: '30000000-0000-4000-8000-000000000003' }, { loadCheckpoint })
  return { digest, image, imageDigest, manifest, prepare, store }
}

describe('runtime release preparation', () => {
  it('retains the canonical snapshot and referenced media under content addresses', async () => {
    const f = fixture()
    const prepared = await f.prepare()
    const snapshotKey = `${siteRoot}/runtime/versions/${f.digest}/site.json`
    expect(prepared.release.snapshot).toMatchObject({ key: snapshotKey, sha256: f.digest })
    expect(new TextDecoder().decode(f.store.objects.get(snapshotKey))).toBe(canonical(f.manifest))
    expect(prepared.release.images).toEqual([{ bytes: 32, contentType: 'image/webp', key: `${siteRoot}/runtime/assets/${f.imageDigest}.webp`, sha256: f.imageDigest }])
    expect(prepared.release.redirects).toEqual({ '/old-offer': { status: 308, target: '/offer' } })
    expect(prepared.digest).toMatch(/^[a-f0-9]{64}$/)
  })

  it('is idempotent and survives deletion of the draft upload after publication', async () => {
    const f = fixture()
    const first = await f.prepare()
    const writes = f.store.puts.length
    f.store.objects.delete(`${siteRoot}/preview-assets/${f.imageDigest}.webp`)
    const second = await f.prepare()
    expect(second).toEqual(first)
    expect(f.store.puts.length).toBe(writes)
  })

  it('never overwrites retained bytes that do not match their address', async () => {
    const f = fixture()
    f.store.objects.set(`${siteRoot}/runtime/assets/${f.imageDigest}.webp`, webp(9))
    await expect(f.prepare()).rejects.toMatchObject({ code: 'RUNTIME_CONTENT_UNAVAILABLE' })
  })

  it('refuses a retained snapshot whose bytes differ from the saved version', async () => {
    const f = fixture()
    f.store.objects.set(`${siteRoot}/runtime/versions/${f.digest}/site.json`, new TextEncoder().encode('{}'))
    await expect(f.prepare()).rejects.toMatchObject({ code: 'RUNTIME_CONTENT_UNAVAILABLE' })
  })

  it('fails closed for missing, altered or non-image media', async () => {
    const missing = fixture()
    missing.store.objects.clear()
    await expect(missing.prepare()).rejects.toMatchObject({ code: 'RUNTIME_CONTENT_UNAVAILABLE' })
    const altered = fixture()
    altered.store.objects.set(`${siteRoot}/preview-assets/${altered.imageDigest}.webp`, webp(2))
    await expect(altered.prepare()).rejects.toMatchObject({ code: 'RUNTIME_CONTENT_UNAVAILABLE' })
    expect([...altered.store.objects.keys()].some(key => key.includes('/runtime/assets/'))).toBe(false)
  })

  it('rejects redirects to missing or private pages', async () => {
    const f = fixture()
    f.manifest.pages[1].visibility = 'draft'
    const digest = sha(canonical(f.manifest))
    await expect(preparePageStudioRuntimeRelease({ bucket: f.store.bucket, environment: 'production', renderer, scope, versionId: '30000000-0000-4000-8000-000000000003' }, {
      loadCheckpoint: async () => ({ checkpointId: 'checkpoint_a', digest, manifest: f.manifest, releaseMetadata: {} as never })
    })).rejects.toMatchObject({ code: 'RUNTIME_CONTENT_UNAVAILABLE' })
  })
})

describe('runtime renderer configuration', () => {
  it('requires a complete deployed renderer identity', () => {
    expect(resolveRuntimeRenderer({ PAGE_STUDIO_RUNTIME_RENDERER: JSON.stringify(renderer) })).toEqual(renderer)
    for (const value of [undefined, '{', JSON.stringify({ ...renderer, codeDigest: 'x' }), JSON.stringify({ ...renderer, generation: '../x' })]) {
      expect(() => resolveRuntimeRenderer({ PAGE_STUDIO_RUNTIME_RENDERER: value })).toThrow(expect.objectContaining({ code: 'RUNTIME_RENDERER_UNAVAILABLE' }))
    }
  })
})
