import { setTimeout as realSetTimeout } from 'node:timers'
import { describe, expect, it, vi } from 'vitest'
import * as collections from '~~/shared/pageStudio/collectionApi'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { persistContinuationInspectionSnapshot, readContinuationInspectionSnapshot } from '~~/server/utils/pageStudio/continuationInspectionStorage'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
async function fixture() {
  const request = { formatVersion: 1, purpose: 'recovery-continuation-inspection', operationId: id(1), invocationId: id(2), retained: { test: 'Not native proof' } }
  return { scope: { tenantId: 'test-native-account', clientId: id(3), siteId: id(4) }, operationId: id(1), invocationId: id(2),
    requestDigest: await collectionDigest(request), expiresAt: new Date(Date.now() + 60000).toISOString(), request }
}
function bucket() {
  const objects = new Map<string, string>()
  let puts = 0, loseReply = false, afterGet: (() => void) | undefined
  return { objects,
    get puts() { return puts },
    loseReply() { loseReply = true },
    afterGet(fn: () => void) { afterGet = fn },
    async get(key: string) {
      afterGet?.()
      const text = objects.get(key)
      return text === undefined ? null : { size: new TextEncoder().encode(text).byteLength, body: new Response(text).body! }
    },
    async put(key: string, value: string, options: { onlyIf: { etagDoesNotMatch: string } }) {
      expect(options.onlyIf.etagDoesNotMatch).toBe('*')
      puts++
      if (objects.has(key)) return null
      objects.set(key, value)
      if (loseReply) throw new Error('storage reply lost')
      return { etag: 'test-etag' }
    }
  }
}
describe('private continuation inspection snapshot bytes', () => {
  it('retains one canonical scope-bound request and reuses an exact retry', async () => {
    const value = await fixture(), storage = bucket()
    const reference = await persistContinuationInspectionSnapshot(value, storage)
    expect(await readContinuationInspectionSnapshot(reference, storage)).toEqual(value.request)
    expect(await persistContinuationInspectionSnapshot(value, storage)).toEqual(reference)
    expect(storage.puts).toBe(1)
    expect([...storage.objects.keys()][0]).toMatch(/^private\/page-studio\/transfer-inspections\//)
  })
  it('recovers an unknown write response without repeating the write', async () => {
    const storage = bucket(), value = await fixture()
    storage.loseReply()
    const reference = await persistContinuationInspectionSnapshot(value, storage)
    expect(await readContinuationInspectionSnapshot(reference, storage)).toEqual(value.request)
    expect(storage.puts).toBe(1)
  })
  it('rejects changing a retained request, its expiry or its original scope', async () => {
    const storage = bucket(), value = await fixture()
    const reference = await persistContinuationInspectionSnapshot(value, storage)
    const changed = { ...value, request: { ...value.request, retained: { test: 'different' } } }
    changed.requestDigest = await collectionDigest(changed.request)
    await expect(persistContinuationInspectionSnapshot(changed, storage)).rejects.toThrow()
    await expect(persistContinuationInspectionSnapshot({ ...value, expiresAt: new Date(Date.now() + 120000).toISOString() }, storage)).rejects.toThrow()
    const foreign = { ...reference, scope: { ...reference.scope, siteId: id(9) } }
    const wrong = { get: async () => storage.get([...storage.objects.keys()][0]!) }
    await expect(readContinuationInspectionSnapshot(foreign, wrong)).rejects.toThrow()
    expect(storage.puts).toBe(1)
  })
  it('snapshots caller data before the first storage await', async () => {
    const storage = bucket(), value = await fixture(), original = structuredClone(value.request)
    storage.afterGet(() => {
      value.request.retained.test = 'mutation'
    })
    const reference = await persistContinuationInspectionSnapshot(value, storage)
    expect(await readContinuationInspectionSnapshot(reference, storage)).toEqual(original)
  })
  it('rejects unknown fields, traversal and unbounded/expired permissions before writing', async () => {
    const value = await fixture(), storage = bucket()
    for (const changed of [
      { ...value, url: 'https://example.test' }, { ...value, scope: { ...value.scope, tenantId: '../other' } },
      { ...value, expiresAt: new Date(Date.now() - 1000).toISOString() }, { ...value, expiresAt: new Date(Date.now() + 3600000).toISOString() },
      { ...value, operationId: id(9) }, { ...value, requestDigest: 'f'.repeat(64) }
    ]) await expect(persistContinuationInspectionSnapshot(changed, storage)).rejects.toThrow()
    expect(storage.puts).toBe(0)
  })
  it('bounds streamed bytes rather than trusting object metadata', async () => {
    const value = await fixture(), storage = bucket(), reference = await persistContinuationInspectionSnapshot(value, storage)
    const bytes = [...storage.objects.values()][0]!
    await expect(readContinuationInspectionSnapshot(reference, { get: async () => ({ size: 1, body: new Response(bytes).body! }) })).rejects.toThrow(/byte/)
    await expect(readContinuationInspectionSnapshot(reference, { get: async () => ({ size: 2, body: new Response(new Uint8Array([0xff, 0xff])).body! }) })).rejects.toThrow()
  })
  it('does not write after expiry while waiting on storage', async () => {
    const value = await fixture(), storage = bucket(), clock = vi.spyOn(Date, 'now')
    storage.afterGet(() => {
      clock.mockReturnValue(Date.parse(value.expiresAt) + 1)
    })
    try {
      await expect(persistContinuationInspectionSnapshot(value, storage)).rejects.toThrow(/expired|deadline/)
      expect(storage.puts).toBe(0)
    } finally { clock.mockRestore() }
  })
  it('rejects oversized metadata and noncanonical bytes even when request digests match', async () => {
    const value = await fixture(), storage = bucket(), reference = await persistContinuationInspectionSnapshot(value, storage)
    const objectKey = [...storage.objects.keys()][0]!
    storage.objects.set(objectKey, JSON.stringify(JSON.parse(storage.objects.get(objectKey)!), null, 2))
    await expect(readContinuationInspectionSnapshot(reference, storage)).rejects.toThrow(/conflict/)
    let cancelled = false
    await expect(readContinuationInspectionSnapshot(reference, { get: async () => ({ size: 20_000_000,
      body: new ReadableStream({ cancel() {
        cancelled = true
      } }) }) })).rejects.toThrow(/byte/)
    expect(cancelled).toBe(true)
  })
  it('terminates stalled storage and stream reads within the fixed I/O budget', async () => {
    const value = await fixture(), storage = bucket(), reference = await persistContinuationInspectionSnapshot(value, storage)
    vi.useFakeTimers()
    try {
      for (const stream of [false, true]) {
        let cancelled = false
        const result = readContinuationInspectionSnapshot(reference, { get: async () => stream
          ? { size: 100, body: new ReadableStream({ cancel() {
              cancelled = true
            } }) }
          : new Promise(() => {}) }).catch(error => error)
        const observed = Promise.race([result, new Promise(resolve => setTimeout(() => resolve('still pending'), 9000))])
        await vi.advanceTimersByTimeAsync(9001)
        expect(await observed).toBeInstanceOf(Error)
        if (stream) expect(cancelled).toBe(true)
      }
    } finally { vi.useRealTimers() }
  })
  it('rejects delayed timer delivery and validation that finishes past the absolute deadline', async () => {
    const value = await fixture(), storage = bucket()
    const reference = await persistContinuationInspectionSnapshot(value, storage)
    let now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    const originalDigest = collections.collectionDigest
    const hash = vi.spyOn(collections, 'collectionDigest')
    try {
      let cancelled = false
      await expect(readContinuationInspectionSnapshot(reference, { get: async () => {
        now += 8001
        return { size: 1, body: new ReadableStream({ cancel() {
          cancelled = true
        } }) }
      } })).rejects.toThrow(/deadline/)
      expect(cancelled).toBe(true)
      hash.mockImplementation(async (input) => {
        const digest = await originalDigest(input)
        now += 8001
        return digest
      })
      await expect(readContinuationInspectionSnapshot(reference, storage)).rejects.toThrow(/deadline/)
    } finally {
      hash.mockRestore()
      clock.mockRestore()
    }
  })
  it('disposes a late read body and never blindly retries a timed-out write', async () => {
    const value = await fixture(), storage = bucket()
    const reference = await persistContinuationInspectionSnapshot(value, storage)
    vi.useFakeTimers()
    try {
      let release!: (value: { size: number, body: ReadableStream<Uint8Array> }) => void
      let cancelled = false
      const lateRead = new Promise<{ size: number, body: ReadableStream<Uint8Array> }>((resolve) => {
        release = resolve
      })
      const reading = readContinuationInspectionSnapshot(reference, { get: () => lateRead }).catch(error => error)
      await vi.advanceTimersByTimeAsync(8001)
      expect(await reading).toBeInstanceOf(Error)
      release({ size: 1, body: new ReadableStream({ cancel() {
        cancelled = true
      } }) })
      await vi.advanceTimersByTimeAsync(1)
      expect(cancelled).toBe(true)
      let attempts = 0
      const writing = persistContinuationInspectionSnapshot(value, { get: async () => null, put: async () => {
        attempts++
        return new Promise(() => {})
      } }).catch(error => error)
      // Crypto hashing is real asynchronous work, so let it finish before the timer.
      for (let i = 0; i < 100 && attempts === 0; i++) await new Promise(resolve => realSetTimeout(resolve, 1))
      await vi.advanceTimersByTimeAsync(8001)
      expect(await writing).toBeInstanceOf(Error)
      expect(attempts).toBe(1)
    } finally { vi.useRealTimers() }
  })
  it('resolves simultaneous conditional writers without replacing the winning bytes', async () => {
    const value = await fixture(), storage = bucket()
    const changed = { ...value, request: { ...value.request, retained: { test: 'different candidate' } } }
    changed.requestDigest = await collectionDigest(changed.request)
    const get = storage.get.bind(storage)
    let initialReads = 0, release!: () => void
    const bothRead = new Promise<void>((resolve) => {
      release = resolve
    })
    storage.get = async (key) => {
      const result = await get(key)
      if (initialReads < 2) {
        if (++initialReads === 2) release()
        await bothRead
      }
      return result
    }
    const results = await Promise.allSettled([persistContinuationInspectionSnapshot(value, storage), persistContinuationInspectionSnapshot(changed, storage)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)
    expect(storage.objects.size).toBe(1)
    expect(storage.puts).toBe(2)
  })
})
