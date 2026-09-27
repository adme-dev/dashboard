import { describe, expect, it, vi } from 'vitest'
import { retainRuntimeFeatureRecovery } from '../../../server/utils/pageStudio/runtimeFeatureRecovery'
import { nativeAstroRuntimeContentPrefix, verifyNativeAstroRuntimeRelease } from '../../../shared/pageStudio/generated/builderGraphVerifier.mjs'
import golden from '../../fixtures/pageStudioReleaseRecovery.json'

async function fixture() {
  const bundle = structuredClone(golden.bundle)
  const { tenantId, clientId, siteId } = bundle.contentScope
  const scope = { tenantId, clientId, siteId }
  const { release } = await verifyNativeAstroRuntimeRelease({
    delivery: 'runtime', environment: 'production', schemaVersion: 1, scope,
    versionId: 'version_a', versionDigest: bundle.checkpoint.sha256,
    snapshot: { bytes: new TextEncoder().encode(bundle.checkpoint.bytes).byteLength, contentType: 'application/json; charset=utf-8', key: `${nativeAstroRuntimeContentPrefix(scope)}/versions/${bundle.checkpoint.sha256}/site.json`, sha256: bundle.checkpoint.sha256 },
    images: [], redirects: {}, renderer: { name: 'astro-runtime', generation: 'renderer_a', assetsDigest: 'a'.repeat(64), codeDigest: 'b'.repeat(64) }
  })
  const objects = new Map<string, Uint8Array>()
  const bucket = {
    get: vi.fn(async (key: string) => {
      const bytes = objects.get(key)
      return bytes ? { size: bytes.length, body: new Response(bytes).body! } : null
    }),
    put: vi.fn(async (key: string, bytes: Uint8Array) => { objects.set(key, bytes) })
  }
  return { release, bundle, objects, bucket }
}

describe('native runtime feature recovery retention', () => {
  it('retains canonical bytes and verifies readback without compiling a build', async () => {
    const { release, bundle, bucket } = await fixture()
    const first = await retainRuntimeFeatureRecovery(release, bundle, bucket)
    expect(first.recovery.sha256).toBe(golden.digest)
    expect(bucket.put).toHaveBeenCalledTimes(1)
    expect(await retainRuntimeFeatureRecovery(release, bundle, bucket)).toEqual(first)
    expect(bucket.put).toHaveBeenCalledTimes(1)
  })
  it('rejects changed retained content without overwriting it', async () => {
    const { release, bundle, bucket, objects } = await fixture()
    const reference = await retainRuntimeFeatureRecovery(release, bundle, bucket)
    objects.set(reference.recovery.key, new TextEncoder().encode('{}'))
    await expect(retainRuntimeFeatureRecovery(release, bundle, bucket)).rejects.toThrow()
    expect(bucket.put).toHaveBeenCalledTimes(1)
  })
  it('rejects a write that acknowledges but loses the object', async () => {
    const { release, bundle, bucket } = await fixture()
    bucket.put.mockImplementation(async () => {})
    await expect(retainRuntimeFeatureRecovery(release, bundle, bucket)).rejects.toThrow()
  })
  it('rejects foreign scope before any storage access', async () => {
    const { release, bundle, bucket } = await fixture()
    release.scope.tenantId = 'other'
    await expect(retainRuntimeFeatureRecovery(release, bundle, bucket)).rejects.toThrow()
    expect(bucket.get).not.toHaveBeenCalled()
    expect(bucket.put).not.toHaveBeenCalled()
  })
  it('bounds actual streamed bytes when metadata lies and cancels the stream', async () => {
    const { release, bundle, bucket } = await fixture()
    const reference = await retainRuntimeFeatureRecovery(release, bundle, bucket)
    const cancel = vi.fn()
    bucket.get.mockImplementation(async () => ({
      size: reference.recovery.bytes,
      body: new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(reference.recovery.bytes + 1)) }, cancel })
    }))
    await expect(retainRuntimeFeatureRecovery(release, bundle, bucket)).rejects.toThrow()
    expect(cancel).toHaveBeenCalledOnce()
    expect(bucket.put).toHaveBeenCalledTimes(1)
  })
  it('rejects oversize bytes even when cancellation never settles', async () => {
    const { release, bundle, bucket } = await fixture()
    const reference = await retainRuntimeFeatureRecovery(release, bundle, bucket)
    bucket.get.mockImplementation(async () => ({ size: reference.recovery.bytes, body: new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(reference.recovery.bytes + 1)) },
      cancel() { return new Promise(() => {}) }
    }) }))
    await expect(retainRuntimeFeatureRecovery(release, bundle, bucket)).rejects.toThrow('byte limit')
  })
  it.each(['get', 'put', 'read'])('times out stalled %s without waiting for stream cleanup', async (kind) => {
    const { release, bundle, bucket } = await fixture()
    const reference = await retainRuntimeFeatureRecovery(release, bundle, bucket)
    let started!: () => void
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    if (kind === 'get') bucket.get.mockImplementation(() => {
      started()
      return new Promise(() => {})
    })
    if (kind === 'put') {
      bucket.get.mockResolvedValue(null)
      bucket.put.mockImplementation(() => {
        started()
        return new Promise(() => {})
      })
    }
    if (kind === 'read') bucket.get.mockImplementation(async () => ({ size: reference.recovery.bytes, body: new ReadableStream({
      pull() {
        started()
        return new Promise(() => {})
      }, cancel() { return new Promise(() => {}) }
    }) }))
    vi.useFakeTimers()
    try {
      const pending = expect(retainRuntimeFeatureRecovery(release, bundle, bucket)).rejects.toThrow('timed out')
      await entered
      await vi.advanceTimersByTimeAsync(10_000)
      await pending
    } finally { vi.useRealTimers() }
  })
  it('honors cancellation before storage access', async () => {
    const { release, bundle, bucket } = await fixture()
    const controller = new AbortController()
    controller.abort()
    await expect(retainRuntimeFeatureRecovery(release, bundle, bucket, controller.signal)).rejects.toThrow('cancelled')
    expect(bucket.get).not.toHaveBeenCalled()
    expect(bucket.put).not.toHaveBeenCalled()
  })
})
