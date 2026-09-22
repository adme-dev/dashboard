import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { acceptManagedFeatureCandidate } from '~~/server/utils/pageStudio/featureCandidateApplication'
import { verifyBuilderApplicationTransition } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { readManagedFeatureContext } from '~~/server/utils/pageStudio/featureApplicationContext'

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), current: vi.fn(), lookup: vi.fn(), coordinate: vi.fn(), storage: vi.fn(), authority: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/cmsCommitAuthority', () => ({ withCmsCommitAuthority: mocks.authority }))
vi.mock('~~/server/utils/pageStudio/cmsGraphCoordinator', () => ({
  readCmsGraphSnapshot: mocks.snapshot, assertCmsGraphSnapshotCurrent: mocks.current, lookupCmsGraphOperation: mocks.lookup,
  coordinateCmsGraphTransition: mocks.coordinate,
  cmsGraphEnvironment: (principal: { env: unknown }) => principal.env,
  cmsGraphConflict: (message = 'conflict') => new Error(message)
}))
vi.mock('~~/server/utils/pageStudio/cmsGraphStorage', () => ({ createCmsGraphStorage: mocks.storage }))
const source = JSON.parse(readFileSync(new URL('../../../shared/pageStudio/generated/builderGraphFixtures.json', import.meta.url), 'utf8'))[0].input
async function fixture() {
  const data = structuredClone(source), base = data.base
  const candidate = JSON.parse(data.candidateBytes)
  const preparations: unknown[] = [], objects = new Map<string, string>()
  const snapshot = { scope: base.scope, context: { state: { active_generation: base.generation, freeze_digest: base.freezeDigest, target: base.target }, application: { id: base.application.manifest.applicationId, digest: base.application.digest, manifest: base.application.manifest } },
    checkpoint: { id: base.checkpoint.id, digest: base.checkpoint.digest, object_key: 'base' }, schemas: [], content: null,
    actor: JSON.parse(data.preparations[0].requestBytes).actor, principalIdentity: { source: 'studio-session', nonce: 'child' } }
  const storage = { readCandidate: vi.fn(async () => data.candidateBytes), readCheckpoint: vi.fn(async () => base.checkpoint), readObjects: vi.fn(async () => []),
    readArtifact: vi.fn(async (pin: { sha256: string }) => {
      for (const bytes of data.artifactBytes) if (await collectionDigest(JSON.parse(bytes)) === pin.sha256) return bytes
      throw new Error('missing artifact')
    }) }
  const router = { readManagedCmsTarget: vi.fn(async () => base.target), prepareManagedCmsOperation: vi.fn(async (request) => {
    preparations.push(request)
    const items = await Promise.all(request.items.map(async (item: { kind: string, body: { id: string }, version: number }) => ({ kind: item.kind, collectionId: item.body.id, recordId: '', version: item.version, origin: 'prepared', operationId: request.operationId, freezeDigest: request.freezeDigest, sha256: await collectionDigest(item.body), bytes: new TextEncoder().encode(collectionCanonical(item.body)).byteLength })))
    const receipt = { createdAt: '2026-09-22T00:00:00.000Z', freezeDigest: request.freezeDigest, items, operationId: request.operationId, requestDigest: await collectionDigest(request), scope: request.scope, state: 'prepared' }
    return { ...receipt, digest: await collectionDigest(receipt) }
  }) }
  const bucket = { get: vi.fn(async (key: string) => {
    const raw = objects.get(key)
    return raw
      ? { etag: 'etag', size: new TextEncoder().encode(raw).byteLength, body: new ReadableStream({ start(c) {
          c.enqueue(new TextEncoder().encode(raw))
          c.close()
        } }) }
      : null
  }), put: vi.fn(async (key: string, raw: string) => {
    if (objects.has(key)) return null
    objects.set(key, raw)
    return { etag: 'etag' }
  }) }
  const principal = { source: 'studio-session', capability: 'model:invoke', claims: { capabilities: ['workspace:checkpoint', 'model:invoke'], ...base.scope, userId: snapshot.actor.userId, role: 'agency', nonce: 'child' }, env: { PAGE_STUDIO_CONTENT_ENVIRONMENT: base.scope.environment, PAGE_STUDIO_CONTENT_ROUTER: router, PAGE_STUDIO_CHECKPOINTS: bucket } }
  mocks.snapshot.mockResolvedValue(snapshot)
  mocks.storage.mockReturnValue(storage)
  mocks.lookup.mockResolvedValue(null)
  mocks.coordinate.mockResolvedValue({ acknowledged: true, isCurrent: true })
  return { data, candidate, snapshot, storage, router, bucket, principal, preparations, objects, input: { id: candidate.proposal.id, digest: candidate.digest } }
}
describe('feature candidate to managed native acceptance', () => {
  beforeEach(() => vi.clearAllMocks())
  it('prepares only changed schemas and saves all selected component/action/schema pins before native acceptance', async () => {
    const f = await fixture()
    expect(await acceptManagedFeatureCandidate(f.input, f.principal as never)).toEqual({ acknowledged: true, isCurrent: true })
    expect(f.router.prepareManagedCmsOperation).toHaveBeenCalledOnce()
    expect(f.preparations[0]).toMatchObject({ action: null, actor: f.snapshot.actor, candidateDigest: f.candidate.digest, items: [{ kind: 'schema', expectedBase: null }] })
    const envelope = JSON.parse([...f.objects.values()][0]!)
    expect(envelope.manifest.builderLibrary.components.map((pin: { id: string }) => pin.id)).toEqual(['fleet_view', 'retained'])
    expect(envelope.manifest.builderApplication.actions[0].id).toBe('submit')
    expect(envelope.manifest.builderApplication.collections[0].id).toBe('fleet')
    expect(envelope.manifest.pages).toEqual(f.data.base.checkpoint.manifest.pages)
    expect(mocks.coordinate).toHaveBeenCalledWith(expect.objectContaining({ candidateId: f.input.id, candidateDigest: f.input.digest, preparations: [expect.objectContaining({ operationId: expect.any(String) })] }), f.principal, {})
  })
  it('recovers an accepted receipt before reading candidate or rewriting private objects', async () => {
    const f = await fixture(), receipt = { checkpointId: 'old', isCurrent: false }
    mocks.lookup.mockResolvedValueOnce(receipt)
    expect(await acceptManagedFeatureCandidate(f.input, f.principal as never)).toEqual(receipt)
    expect(f.storage.readCandidate).not.toHaveBeenCalled()
    expect(f.bucket.put).not.toHaveBeenCalled()
    expect(mocks.coordinate).not.toHaveBeenCalled()
  })
  it('rejects foreign scope, altered candidate digest and stale base before preparation', async () => {
    const f = await fixture()
    for (const change of [{ digest: 'a'.repeat(64) }, { proposal: { ...f.candidate.proposal, scope: { ...f.snapshot.scope, siteId: 'other' } } }, { proposal: { ...f.candidate.proposal, base: { ...f.candidate.proposal.base, checkpointId: 'stale' } } }]) {
      const candidate = { ...f.candidate, ...change }
      f.storage.readCandidate.mockResolvedValueOnce(collectionCanonical(candidate))
      await expect(acceptManagedFeatureCandidate(f.input, f.principal as never)).rejects.toThrow()
    }
    expect(f.router.prepareManagedCmsOperation).not.toHaveBeenCalled()
    expect(f.bucket.put).not.toHaveBeenCalled()
  })
  it('refuses a changed physical storage target before any private mutation', async () => {
    const f = await fixture()
    f.router.readManagedCmsTarget.mockResolvedValueOnce({ ...f.data.base.target, routeId: 'replacement' })
    await expect(acceptManagedFeatureCandidate(f.input, f.principal as never)).rejects.toThrow()
    expect(f.router.prepareManagedCmsOperation).not.toHaveBeenCalled()
    expect(f.bucket.put).not.toHaveBeenCalled()
  })
  it('propagates final rejection without treating private writes as acceptance', async () => {
    const f = await fixture()
    mocks.coordinate.mockRejectedValueOnce(new Error('native authority revoked'))
    await expect(acceptManagedFeatureCandidate(f.input, f.principal as never)).rejects.toThrow('revoked')
    expect(f.objects.size).toBe(1)
  })
  it('denies schema preparation before private writes when current schema permission is absent', async () => {
    const f = await fixture()
    mocks.authority.mockRejectedValueOnce(new Error('Schema permission revoked'))
    await expect(acceptManagedFeatureCandidate(f.input, f.principal as never)).rejects.toThrow('revoked')
    expect(f.router.prepareManagedCmsOperation).not.toHaveBeenCalled()
    expect(f.bucket.put).not.toHaveBeenCalled()
  })
  it('constructs bytes that pass the actual single-source complete graph verifier', async () => {
    const f = await fixture()
    mocks.coordinate.mockImplementationOnce(async (input) => {
      const envelope = JSON.parse([...f.objects.values()][0]!)
      const { summary: _summary, ...request } = input
      const proof = await verifyBuilderApplicationTransition({ ...f.data,
        request: { ...f.data.request, ...request, version: 1, scope: f.snapshot.scope, generation: f.data.base.generation, target: f.data.base.target, freezeDigest: f.data.base.freezeDigest,
          nextCheckpoint: { id: input.nextCheckpoint.checkpointId, digest: input.nextCheckpoint.digest } },
        nextCheckpoint: { id: input.nextCheckpoint.checkpointId, digest: input.nextCheckpoint.digest, manifest: envelope.manifest },
        preparations: [{ requestBytes: collectionCanonical(f.preparations[0]), receiptBytes: collectionCanonical(await f.router.prepareManagedCmsOperation.mock.results[0]!.value) }]
      })
      return proof
    })
    const proof = await acceptManagedFeatureCandidate(f.input, f.principal as never)
    expect(proof).toMatchObject({ actions: [{ id: 'submit' }], schemas: [{ artifact: { id: 'fleet' } }] })
  })
  it('checks accepted native heads without loading private artifact bodies', async () => {
    const f = await fixture()
    expect(await readManagedFeatureContext({ mode: 'check' }, f.principal as never)).toMatchObject({ mode: 'check', checkpoint: { id: f.snapshot.checkpoint.id }, contentRevision: 0 })
    expect(mocks.storage).not.toHaveBeenCalled()
  })
  it('provides exact accepted library bytes to the trusted generation host and rechecks the snapshot', async () => {
    const f = await fixture()
    const value = await readManagedFeatureContext({ mode: 'full' }, f.principal as never)
    expect(value).toMatchObject({ mode: 'full', pins: [{ id: 'retained', kind: 'component' }] })
    expect(value).not.toHaveProperty('actor')
    expect(value).not.toHaveProperty('principalIdentity')
    expect(mocks.current).toHaveBeenCalledWith(f.snapshot, f.principal, {})
    mocks.current.mockRejectedValueOnce(new Error('head changed'))
    await expect(readManagedFeatureContext({ mode: 'full' }, f.principal as never)).rejects.toThrow('head changed')
  })
})

it('denies an AI-only child before any private reads or preparation', async () => {
  const f = await fixture()
  f.principal.claims.capabilities = ['model:invoke']
  await expect(acceptManagedFeatureCandidate(f.input, f.principal as never)).rejects.toMatchObject({ statusCode: 403 })
  expect(f.router.prepareManagedCmsOperation).not.toHaveBeenCalled()
  expect(f.storage.readCandidate).not.toHaveBeenCalled()
})
