import { afterEach, describe, expect, it, vi } from 'vitest'

const stubs = vi.hoisted(() => ({ snapshot: vi.fn(), authority: vi.fn(), storage: vi.fn(), verify: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/cmsGraphRead', async importOriginal => ({ ...await importOriginal<object>(), readCmsGraphSnapshot: stubs.snapshot }))
vi.mock('~~/server/utils/pageStudio/cmsCommitAuthority', () => ({ withCmsCommitAuthority: stubs.authority }))
vi.mock('~~/server/utils/pageStudio/cmsGraphStorage', () => ({ createCmsGraphStorage: stubs.storage }))
vi.mock('~~/shared/pageStudio/generated/builderGraphVerifier.mjs', async importOriginal => ({ ...await importOriginal<object>(), verifyBuilderApplicationCheckpoint: stubs.verify }))

const { coordinateCmsGraphCheckpoint } = await import('../../workers/page-studio-management/src/cms/graphMutations')

const scope = { tenantId: 'tenant', clientId: 'client', businessId: 'client', siteId: 'site-one', environment: 'staging' as const }
const digest = (char: string) => char.repeat(64)
const pins = Array.from({ length: 40 }, (_, index) => ({ kind: 'component' as const, id: `component-${String(index).padStart(2, '0')}`, version: 1, sha256: digest('c') }))
const receipt = { acknowledged: true, operationId: 'op', checkpointId: 'next', application: { id: 'app', digest: digest('d') }, versionId: null, currentCheckpointId: 'next', isCurrent: true }
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function fixture(readArtifact: (pin: typeof pins[number]) => Promise<string>) {
  stubs.snapshot.mockReset().mockResolvedValue({
    scope, checkpoint: { id: 'base', digest: digest('a'), object_key: 'base-key' }, schemas: [], content: null,
    actor: { kind: 'agency-user', userId: 'user', loginSessionHash: digest('e') }, principalIdentity: { source: 'studio-session', nonce: 'nonce' },
    context: { state: { scope_key: 'scope-key', active_generation: 1, target: {}, freeze_digest: digest('f') },
      application: { id: 'app', digest: digest('b'), manifest: { components: pins, actions: [] } } }
  })
  stubs.authority.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce(receipt)
  stubs.verify.mockReset().mockResolvedValue({})
  const storage = { readArtifact: vi.fn(readArtifact), readCheckpoint: vi.fn(async () => ({ manifest: { pages: [] } })), readObjects: vi.fn(async () => []) }
  stubs.storage.mockReset().mockReturnValue(storage)
  const principal = { source: 'studio-session', capability: 'workspace:checkpoint', claims: {}, env: {} } as unknown as Parameters<typeof coordinateCmsGraphCheckpoint>[1]
  const input = { checkpoint: { checkpointId: 'next', digest: digest('9'), objectKey: 'next-key', createdAt: '2026-10-26T00:00:00.000Z', etag: 'etag', userId: 'user',
    scope: { tenantId: scope.tenantId, clientId: scope.clientId, siteId: scope.siteId } }, expectedCheckpointId: 'base' }
  return { storage, principal, input }
}
function timingRecords(log: { mock: { calls: unknown[][] } }) {
  return log.mock.calls.map(([line]) => JSON.parse(String(line))).filter(record => record.event === 'page_studio_cms_checkpoint_timing')
}
afterEach(() => vi.restoreAllMocks())

describe('managed checkpoint timing and artifact reads', () => {
  it('records every stage in order with numeric durations and the pin count', async () => {
    const f = fixture(async pin => `{"id":"${pin.id}"}`)
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    expect(await coordinateCmsGraphCheckpoint(f.input, f.principal)).toBe(receipt)
    const [record, ...rest] = timingRecords(log)
    expect(rest).toEqual([])
    expect(record).toMatchObject({ mode: 'checkpoint', outcome: 'committed', artifactsRead: 40 })
    expect(record.stages.map((item: { stage: string }) => item.stage)).toEqual(['snapshot', 'replay', 'base', 'artifacts', 'candidate', 'verify', 'commit'])
    for (const item of [...record.stages, { ms: record.totalMs }]) expect(item.ms).toEqual(expect.any(Number))
    expect(Object.keys(record).sort()).toEqual(['artifactsRead', 'event', 'mode', 'outcome', 'stages', 'totalMs'])
  })
  it('reads 40 artifacts concurrently and keeps the manifest order', async () => {
    const f = fixture(async (pin) => {
      await delay(100)
      return `{"id":"${pin.id}"}`
    })
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const started = performance.now()
    await coordinateCmsGraphCheckpoint(f.input, f.principal)
    expect(performance.now() - started).toBeLessThan(1000)
    expect(stubs.verify.mock.calls[0]![0].artifactBytes).toEqual(pins.map(pin => `{"id":"${pin.id}"}`))
  })
  it('fails the stage with the original storage error and commits nothing', async () => {
    const error = new Error('Managed graph storage bytes unavailable or inconsistent')
    const f = fixture(async (pin) => {
      await delay(10)
      if (pin.id === 'component-17') throw error
      return `{"id":"${pin.id}"}`
    })
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(coordinateCmsGraphCheckpoint(f.input, f.principal)).rejects.toBe(error)
    expect(stubs.verify).not.toHaveBeenCalled()
    expect(stubs.authority).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledExactlyOnceWith('page-studio-cms-management-failed', { operation: 'checkpoint', stage: 'artifacts', category: 'checkpoint-stage' })
    const [record] = timingRecords(info)
    expect(record).toMatchObject({ outcome: 'failed', artifactsRead: null })
    expect(record.stages.map((item: { stage: string }) => item.stage)).toEqual(['snapshot', 'replay', 'base', 'artifacts'])
  })
})
