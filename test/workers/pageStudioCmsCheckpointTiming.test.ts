import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'

const stubs = vi.hoisted(() => ({ snapshot: vi.fn(), inTransaction: vi.fn(), authority: vi.fn(), storage: vi.fn(), verify: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/cmsGraphRead', async importOriginal => ({ ...await importOriginal<object>(), readCmsGraphSnapshot: stubs.snapshot, snapshotInTransaction: stubs.inTransaction }))
vi.mock('~~/server/utils/pageStudio/cmsCommitAuthority', () => ({ withCmsCommitAuthority: stubs.authority }))
vi.mock('~~/server/utils/pageStudio/cmsGraphStorage', async importOriginal => ({ ...await importOriginal<object>(), createCmsGraphStorage: stubs.storage }))
vi.mock('~~/shared/pageStudio/generated/builderGraphVerifier.mjs', async importOriginal => ({ ...await importOriginal<object>(), verifyBuilderApplicationCheckpoint: stubs.verify }))

const { coordinateCmsGraphCheckpoint } = await import('../../workers/page-studio-management/src/cms/graphMutations')
const { readBounded } = await import('../../workers/page-studio-management/src/cms/boundedReads')
const { createCmsGraphStorage: realStorage } = await vi.importActual<typeof import('~~/server/utils/pageStudio/cmsGraphStorage')>('~~/server/utils/pageStudio/cmsGraphStorage')

type Pin = { kind: 'component', id: string, version: number, sha256: string }
const scope = { tenantId: 'tenant', clientId: 'client', businessId: 'client', siteId: 'site-one', environment: 'staging' as const }
const digest = (char: string) => char.repeat(64)
const pinsFor = (count: number): Pin[] => Array.from({ length: count }, (_, index) => ({ kind: 'component', id: `component-${String(index).padStart(2, '0')}`, version: 1, sha256: digest('c') }))
const receipt = { acknowledged: true, operationId: 'op', checkpointId: 'next', application: { id: 'app', digest: digest('d') }, versionId: null, currentCheckpointId: 'next', isCurrent: true }
const storageError = 'Managed graph storage bytes unavailable or inconsistent'
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const bytesOf = (pin: Pin) => `{"id":"${pin.id}"}`

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function fixture(pins: Pin[], readArtifact: (pin: Pin) => Promise<string> = async pin => bytesOf(pin)) {
  const snapshot = {
    scope, checkpoint: { id: 'base', digest: digest('a'), object_key: 'base-key' }, schemas: [], content: null,
    actor: { kind: 'agency-user', userId: 'user', loginSessionHash: digest('e') }, principalIdentity: { source: 'studio-session', nonce: 'nonce' },
    context: { state: { scope_key: 'scope-key', active_generation: 1, target: {}, freeze_digest: digest('f') },
      application: { id: 'app', digest: digest('b'), manifest: { components: pins, actions: [] } } }
  }
  stubs.snapshot.mockReset().mockResolvedValue(snapshot)
  stubs.inTransaction.mockReset().mockResolvedValue(snapshot)
  stubs.authority.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce({ receipt, replayed: false })
  stubs.verify.mockReset().mockResolvedValue({})
  const storage = { readArtifact: vi.fn(readArtifact), readCheckpoint: vi.fn(async () => ({ manifest: { pages: [] } })), readObjects: vi.fn(async () => []) }
  stubs.storage.mockReset().mockReturnValue(storage)
  const principal = { source: 'studio-session', capability: 'workspace:checkpoint', claims: {}, env: {} } as unknown as Parameters<typeof coordinateCmsGraphCheckpoint>[1]
  const input = { checkpoint: { checkpointId: 'next', digest: digest('9'), objectKey: 'next-key', createdAt: '2026-10-26T00:00:00.000Z', etag: 'etag', userId: 'user',
    scope: { tenantId: scope.tenantId, clientId: scope.clientId, siteId: scope.siteId } }, expectedCheckpointId: 'base' }
  return { snapshot, storage, principal, input }
}
function timingRecords(log: { mock: { calls: unknown[][] } }) {
  return log.mock.calls.map(([line]) => JSON.parse(String(line))).filter(record => record.event === 'page_studio_cms_checkpoint_timing')
}
const stagesOf = (record: { stages: Array<{ stage: string }> }) => record.stages.map(item => item.stage)
/** Real graph storage over a stub R2 bucket whose bodies count the bytes actually streamed. */
type RealOptions = { corrupt?: number, getDelay?: number, omitSize?: boolean, chunkSize?: number }
const artifactValue = (index: number, padding: number) => ({ kind: 'component', id: `component-${String(index).padStart(2, '0')}`, version: 1, scope, source: 'x'.repeat(padding) })
const realArtifacts = (count: number, padding: number, options: RealOptions = {}) => realArtifactsOf(Array.from({ length: count }, () => padding), options)
/** Artifacts whose canonical bytes add up to exactly `total`. */
function realArtifactsTotaling(total: number, count: number, options: RealOptions = {}) {
  const overhead = collectionCanonical(artifactValue(0, 0)).length, paddings = Array.from({ length: count - 1 }, () => 250_000)
  return realArtifactsOf([...paddings, total - paddings.reduce((sum, padding) => sum + padding + overhead, 0) - overhead], options)
}
async function realArtifactsOf(paddings: number[], options: RealOptions = {}) {
  const pins: Pin[] = [], objects = new Map<string, string>()
  for (const [index, padding] of paddings.entries()) {
    const value = artifactValue(index, padding), id = value.id
    pins.push({ kind: 'component', id, version: 1, sha256: await collectionDigest(value) })
    objects.set(id, index === options.corrupt ? collectionCanonical({ ...value, source: 'y'.repeat(padding) }) : collectionCanonical(value))
  }
  const gate: Array<() => void> = []
  const release = () => {
    for (const next of gate.splice(0)) next()
  }
  const meter = { streamed: 0, openBodies: 0, total: [...objects.values()].reduce((sum, raw) => sum + raw.length, 0), largest: Math.max(...[...objects.values()].map(raw => raw.length)) }
  const get = vi.fn(async (key: string) => {
    await delay(options.getDelay ?? 0)
    const raw = new TextEncoder().encode(objects.get(key.split('/')[4]!)!)
    meter.openBodies++
    let offset = 0
    return { ...(options.omitSize ? {} : { size: raw.byteLength }), body: new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (offset >= raw.byteLength) {
          meter.openBodies--
          controller.close()
          return
        }
        // Chunked bodies advance in lockstep, one chunk per release, so concurrent reads interleave mid-stream.
        if (options.chunkSize) await new Promise<void>(resolve => gate.push(resolve))
        const chunk = raw.subarray(offset, offset + (options.chunkSize ?? raw.byteLength))
        offset += chunk.byteLength
        meter.streamed += chunk.byteLength
        controller.enqueue(chunk)
      },
      cancel() { meter.openBodies-- }
    }, { highWaterMark: 0 }) }
  })
  return { pins, get, meter, release }
}
function useRealStorage(f: ReturnType<typeof fixture>, get: (key: string) => Promise<unknown>) {
  stubs.storage.mockReset().mockImplementation((_env, snapshot) => ({ ...realStorage({ PAGE_STUDIO_CHECKPOINTS: { get } }, snapshot), readCheckpoint: f.storage.readCheckpoint }))
}
afterEach(() => vi.restoreAllMocks())

describe('managed checkpoint timing and artifact reads', () => {
  it('records every stage in order with numeric durations and the pin count', async () => {
    const f = fixture(pinsFor(40))
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    expect(await coordinateCmsGraphCheckpoint(f.input, f.principal)).toBe(receipt)
    const [record, ...rest] = timingRecords(log)
    expect(rest).toEqual([])
    expect(record).toMatchObject({ mode: 'checkpoint', outcome: 'committed', artifactsRead: 40 })
    expect(stagesOf(record)).toEqual(['snapshot', 'replay', 'base', 'artifacts', 'candidate', 'verify', 'commit'])
    for (const item of [...record.stages, { ms: record.totalMs }]) expect(item.ms).toEqual(expect.any(Number))
    expect(Object.keys(record).sort()).toEqual(['artifactsRead', 'event', 'mode', 'outcome', 'stages', 'totalMs'])
  })
  it('reads 40 artifacts concurrently and keeps the manifest order', async () => {
    const pins = pinsFor(40)
    const f = fixture(pins, async (pin) => {
      await delay(100)
      return bytesOf(pin)
    })
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const started = performance.now()
    await coordinateCmsGraphCheckpoint(f.input, f.principal)
    expect(performance.now() - started).toBeLessThan(1000)
    expect(stubs.verify.mock.calls[0]![0].artifactBytes).toEqual(pins.map(bytesOf))
  })
  it('keeps at most eight reads in flight and the manifest order when they finish out of order', async () => {
    const pins = pinsFor(40), waiting: Array<{ pin: Pin, done: ReturnType<typeof deferred<string>> }> = []
    let active = 0, peak = 0
    const f = fixture(pins, async (pin) => {
      peak = Math.max(peak, ++active)
      const done = deferred<string>()
      waiting.push({ pin, done })
      try {
        return await done.promise
      } finally { active-- }
    })
    vi.spyOn(console, 'info').mockImplementation(() => {})
    let settled = false
    const run = coordinateCmsGraphCheckpoint(f.input, f.principal).finally(() => {
      settled = true
    })
    while (!settled) {
      await delay(0)
      for (const item of waiting.splice(0).reverse()) item.done.resolve(bytesOf(item.pin))
    }
    await run
    expect(peak).toBe(8)
    expect(f.storage.readArtifact).toHaveBeenCalledTimes(40)
    expect(stubs.verify.mock.calls[0]![0].artifactBytes).toEqual(pins.map(bytesOf))
  })
  it('stops scheduling after the first failure and settles in-flight reads before failing', async () => {
    const error = new Error(storageError), waiting: Array<ReturnType<typeof deferred<string>>> = []
    let active = 0
    const f = fixture(pinsFor(40), async (pin) => {
      if (pin.id === 'component-00') throw error
      active++
      const done = deferred<string>()
      waiting.push(done)
      try {
        return await done.promise
      } finally { active-- }
    })
    let activeWhenLogged = -1
    const info = vi.spyOn(console, 'info').mockImplementation(() => {
      activeWhenLogged = active
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let settled = false
    const run = coordinateCmsGraphCheckpoint(f.input, f.principal).finally(() => {
      settled = true
    })
    run.catch(() => {})
    for (let tick = 0; tick < 5 && !settled; tick++) await delay(0)
    expect(settled).toBe(false)
    for (const done of waiting.splice(0)) done.resolve('{}')
    await expect(run).rejects.toBe(error)
    expect(f.storage.readArtifact.mock.calls.length).toBeLessThanOrEqual(8)
    expect(activeWhenLogged).toBe(0)
    expect(timingRecords(info)[0]).toMatchObject({ outcome: 'failed', artifactsRead: null })
  })
  it('fails the stage with the original storage error and commits nothing', async () => {
    const error = new Error(storageError)
    const f = fixture(pinsFor(40), async (pin) => {
      await delay(10)
      if (pin.id === 'component-17') throw error
      return bytesOf(pin)
    })
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(coordinateCmsGraphCheckpoint(f.input, f.principal)).rejects.toBe(error)
    expect(stubs.verify).not.toHaveBeenCalled()
    expect(stubs.authority).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledExactlyOnceWith('page-studio-cms-management-failed', { operation: 'checkpoint', stage: 'artifacts', category: 'checkpoint-stage' })
    const [record] = timingRecords(info)
    expect(record).toMatchObject({ outcome: 'failed', artifactsRead: null })
    expect(stagesOf(record)).toEqual(['snapshot', 'replay', 'base', 'artifacts'])
  })
  for (const omitSize of [false, true]) {
    const sizes = omitSize ? 'undeclared' : 'declared'
    it(`accepts ${sizes} artifacts totalling exactly 2,000,000 bytes in manifest order`, async () => {
      const real = await realArtifactsTotaling(2_000_000, 8, { omitSize })
      expect(real.meter.total).toBe(2_000_000)
      const f = fixture(real.pins)
      useRealStorage(f, real.get)
      vi.spyOn(console, 'info').mockImplementation(() => {})
      expect(await coordinateCmsGraphCheckpoint(f.input, f.principal)).toBe(receipt)
      const bytes = stubs.verify.mock.calls[0]![0].artifactBytes as string[]
      expect(bytes.map(raw => JSON.parse(raw).id)).toEqual(real.pins.map(pin => pin.id))
    })
    it(`rejects ${sizes} artifacts totalling 2,000,001 bytes`, async () => {
      const real = await realArtifactsTotaling(2_000_001, 8, { omitSize })
      expect(real.meter.total).toBe(2_000_001)
      const f = fixture(real.pins)
      useRealStorage(f, real.get)
      vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      await expect(coordinateCmsGraphCheckpoint(f.input, f.principal)).rejects.toThrow(storageError)
      expect(stubs.verify).not.toHaveBeenCalled()
    })
    it(`streams at most the budget plus one in-hand chunk per concurrent read for ${sizes} sizes`, async () => {
      // 1.9 MB of small artifacts settle first, so eight 250 KB reads are mid-stream when the budget trips.
      const chunkSize = 16_384
      const real = await realArtifactsOf([...Array.from({ length: 19 }, () => 100_000), ...Array.from({ length: 21 }, () => 250_000)], { omitSize, chunkSize })
      expect(real.meter.total).toBeGreaterThan(2_000_000 + 8 * real.meter.largest)
      const f = fixture(real.pins)
      useRealStorage(f, real.get)
      vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      let settled = false
      const run = coordinateCmsGraphCheckpoint(f.input, f.principal).finally(() => {
        settled = true
      })
      run.catch(() => {})
      while (!settled) {
        await delay(0)
        real.release()
      }
      await expect(run).rejects.toThrow(storageError)
      expect(real.meter.streamed).toBeGreaterThan(2_000_000)
      expect(real.meter.streamed).toBeLessThanOrEqual(2_000_000 + 8 * chunkSize)
      expect(real.meter.openBodies).toBe(0)
    })
  }
  it('fails on a corrupt sibling through real storage without leaving reads behind', async () => {
    const real = await realArtifacts(40, 1_000, { corrupt: 3, getDelay: 5 })
    const f = fixture(real.pins)
    useRealStorage(f, real.get)
    let openWhenLogged = -1
    vi.spyOn(console, 'info').mockImplementation(() => {
      openWhenLogged = real.meter.openBodies
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(coordinateCmsGraphCheckpoint(f.input, f.principal)).rejects.toThrow(storageError)
    expect(real.get.mock.calls.length).toBeLessThan(40)
    expect(openWhenLogged).toBe(0)
    expect(stubs.verify).not.toHaveBeenCalled()
  })
  it('cancels a body as soon as it streams past its declared size', async () => {
    let pulls = 0
    const cancel = vi.fn()
    const get = vi.fn(async () => ({ size: 1_000, body: new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++
        controller.enqueue(new Uint8Array(1_000).fill(32))
      },
      cancel
    }, { highWaterMark: 0 }) }))
    const storage = realStorage({ PAGE_STUDIO_CHECKPOINTS: { get } }, { scope, context: { state: { target: {} } } } as Parameters<typeof realStorage>[1])
    await expect(storage.readArtifact(pinsFor(1)[0])).rejects.toThrow(storageError)
    expect(pulls).toBe(2)
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('does not wait on a body cancel that never settles', async () => {
    const real = await realArtifacts(10, 1_000)
    const get = vi.fn(async (key: string) => {
      const id = key.split('/')[4]
      if (id === 'component-00') return { size: 1_000, body: new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new Uint8Array(1_500).fill(32))
        },
        cancel: () => new Promise(() => {})
      }, { highWaterMark: 0 }) }
      if (id === 'component-01') {
        const body = { getReader: vi.fn(), cancel: () => new Promise(() => {}) }
        return { size: 300_000, body }
      }
      return await real.get(key)
    })
    const f = fixture(real.pins)
    useRealStorage(f, get)
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const run = coordinateCmsGraphCheckpoint(f.input, f.principal)
    run.catch(() => {})
    expect(await Promise.race([run.then(() => 'settled', () => 'settled'), delay(2_000).then(() => 'hung')])).toBe('settled')
    await expect(run).rejects.toThrow(storageError)
  })
  it('returns the original error when a body reader cannot open', async () => {
    const real = await realArtifacts(10, 1_000)
    const readerError = new Error('reader unavailable')
    const get = vi.fn(async (key: string) => key.split('/')[4] === 'component-00'
      ? { size: 1_000, body: { getReader() { throw readerError }, cancel: () => new Promise(() => {}) } }
      : await real.get(key))
    const f = fixture(real.pins)
    useRealStorage(f, get)
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const run = coordinateCmsGraphCheckpoint(f.input, f.principal)
    run.catch(() => {})
    expect(await Promise.race([run.then(() => 'settled', () => 'settled'), delay(2_000).then(() => 'hung')])).toBe('settled')
    await expect(run).rejects.toBe(readerError)
    expect(real.meter.openBodies).toBe(0)
  })
  it('runs bounded reads with at least one worker for a non-positive limit', async () => {
    const read = vi.fn(async (value: number) => value * 2)
    expect(await readBounded([1, 2, 3], 0, read)).toEqual([2, 4, 6])
    expect(await readBounded([1, 2], -3, read)).toEqual([2, 4])
  })
  it('logs a replay found by the replay stage as replayed', async () => {
    const f = fixture(pinsFor(2))
    stubs.authority.mockReset().mockResolvedValueOnce(receipt)
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    expect(await coordinateCmsGraphCheckpoint(f.input, f.principal)).toBe(receipt)
    const [record] = timingRecords(info)
    expect(record).toMatchObject({ outcome: 'replayed', artifactsRead: null })
    expect(stagesOf(record)).toEqual(['snapshot', 'replay'])
  })
  it('logs a receipt replayed inside the commit transaction as replayed', async () => {
    const f = fixture(pinsFor(2))
    const intent = () => ({ operationId: stubs.verify.mock.calls[0]![0].request.operationId, candidateId: 'next', candidateDigest: digest('9'),
      expectedApplication: { id: 'app', digest: digest('b') }, expectedCheckpoint: { id: 'base', digest: digest('a') }, expectedContent: null, contentRevision: 0,
      nextCheckpoint: f.input.checkpoint, preparations: [], summary: 'Saved website pages' })
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockImplementationOnce(async () => ({ rows: [{ request: { mode: 'checkpoint', intent: intent(), actor: f.snapshot.actor, principalIdentity: f.snapshot.principalIdentity }, result: receipt }] }))
    stubs.authority.mockReset().mockImplementation(async (_options, work) => await work({ query }))
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    expect(await coordinateCmsGraphCheckpoint(f.input, f.principal)).toEqual({ ...receipt, currentCheckpointId: 'base', isCurrent: false })
    expect(query).toHaveBeenCalledTimes(2)
    const [record] = timingRecords(info)
    expect(record).toMatchObject({ outcome: 'replayed', artifactsRead: 2 })
    expect(stagesOf(record)).toEqual(['snapshot', 'replay', 'base', 'artifacts', 'candidate', 'verify', 'commit'])
  })
})
