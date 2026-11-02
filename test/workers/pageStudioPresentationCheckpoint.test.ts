import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { contentScopeKey } from '~~/shared/pageStudio/cmsManaged'
import { loadPageStudioCheckpoint } from '~~/shared/pageStudio/checkpointReader'

const boundary = vi.hoisted(() => ({ snapshot: vi.fn(), current: vi.fn(), authority: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/cmsGraphRead', async importOriginal => ({ ...await importOriginal<object>(), readCmsGraphSnapshot: boundary.snapshot, snapshotInTransaction: boundary.current }))
vi.mock('~~/server/utils/pageStudio/cmsCommitAuthority', () => ({ withCmsCommitAuthority: boundary.authority }))
const { coordinateCmsGraphCheckpoint, coordinateCmsGraphRestore } = await import('../../workers/page-studio-management/src/cms/graphMutations')
const fixtures = JSON.parse(await readFile(new URL('../../shared/pageStudio/generated/builderGraphFixtures.json', import.meta.url), 'utf8'))
const original = fixtures.find((item: { name: string }) => item.name === 'ordinary page edit keeps current graph').input

// Real coordinator, storage byte reads, generated verifier and restore writer;
// native authority and SQL are explicit test ports, never a hosted save proof.
async function fixture(change?: (manifest: typeof original.nextCheckpoint.manifest) => void) {
  const input = structuredClone(original)
  const { base } = input
  const scope = { tenantId: base.scope.tenantId, clientId: base.scope.clientId, siteId: base.scope.siteId }
  const key = (id: string) => `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${id}.json`
  const objects = new Map<string, string>()
  const bucket = {
    get: vi.fn(async (name: string) => {
      const raw = objects.get(name)
      if (raw === undefined) return null
      const bytes = new TextEncoder().encode(raw)
      return { size: bytes.byteLength, etag: 'test-etag', body: new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(bytes)
        controller.close()
      } }) }
    }),
    put: vi.fn(async (name: string, value: string) => {
      if (objects.has(name)) return null
      objects.set(name, value)
      return { etag: 'test-etag' }
    })
  }
  const store = async (checkpoint: typeof base.checkpoint) => {
    checkpoint.digest = await collectionDigest(checkpoint.manifest)
    objects.set(key(checkpoint.id), collectionCanonical({ schemaVersion: 1, checkpointId: checkpoint.id, digest: checkpoint.digest, scope, userId: 'user', createdAt: '2026-11-02T00:00:00.000Z', manifest: checkpoint.manifest }))
    return { checkpointId: checkpoint.id, digest: checkpoint.digest, scope, userId: 'user', createdAt: '2026-11-02T00:00:00.000Z', objectKey: key(checkpoint.id), etag: 'test-etag' }
  }
  await store(base.checkpoint)
  input.nextCheckpoint.manifest.pages[0].presentation = { 'color.background': '#ffffff', 'color.text': '#05141f' }
  input.nextCheckpoint.manifest.shell.footer.contentPolicy = 'explicit'
  input.nextCheckpoint.manifest.pages[0].components = [{ id: 'legacy_columns', type: 'columns', props: { legacyCustom: true }, children: [] }]
  change?.(input.nextCheckpoint.manifest)
  const checkpoint = await store(input.nextCheckpoint)
  const scopeHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(contentScopeKey(base.scope)))
  const hash = Buffer.from(scopeHash).toString('hex')
  for (const raw of input.artifactBytes) {
    const artifact = JSON.parse(raw)
    const pin = base.application.manifest.components.find((item: { id: string }) => item.id === artifact.id)
    objects.set(`builder-artifacts/v1/${hash}/${pin.kind}/${pin.id}/${pin.version}/${pin.sha256}.json`, raw)
  }
  const snapshot = {
    scope: base.scope, checkpoint: { id: base.checkpoint.id, digest: base.checkpoint.digest, object_key: key(base.checkpoint.id) }, schemas: [], content: null,
    actor: { kind: 'agency-user', userId: 'user', loginSessionHash: 'e'.repeat(64) }, principalIdentity: { source: 'studio-session', nonce: 'test_nonce' },
    context: { state: { scope_key: 'scope_key', active_generation: base.generation, target: base.target, freeze_digest: base.freezeDigest },
      application: { id: base.application.manifest.applicationId, digest: base.application.digest, manifest: base.application.manifest } }
  }
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith('SELECT entitlement.pages_per_site_limit')) return { rows: [{ pages_per_site_limit: 20 }] }
    if (sql.startsWith('SELECT id,digest,object_key FROM page_studio_checkpoints')) return { rows: [{ id: checkpoint.checkpointId, digest: checkpoint.digest, object_key: checkpoint.objectKey }] }
    return { rows: [] }
  })
  boundary.snapshot.mockReset().mockResolvedValue(snapshot)
  boundary.current.mockReset().mockResolvedValue(snapshot)
  boundary.authority.mockReset().mockImplementation(async (_scope, work) => work({ query }))
  const principal = { source: 'studio-session', capability: 'workspace:checkpoint', claims: {}, env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', PAGE_STUDIO_CHECKPOINTS: bucket } } as unknown as Parameters<typeof coordinateCmsGraphCheckpoint>[1]
  const read = (id: string, digest: string) => loadPageStudioCheckpoint({ scope, bucket, checkpointId: id, objectKey: key(id), digests: [digest] })
  return { input, checkpoint, snapshot, principal, query, bucket, objects, key, read }
}

afterEach(() => vi.restoreAllMocks())

describe('presentation through native checkpoint and restore coordinator', () => {
  it('verifies saved private bytes and emits a checkpoint commit under the existing graph', async () => {
    const f = await fixture()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const result = await coordinateCmsGraphCheckpoint({ checkpoint: f.checkpoint, expectedCheckpointId: f.snapshot.checkpoint.id }, f.principal)
    expect(result).toMatchObject({ acknowledged: true, checkpointId: f.checkpoint.checkpointId, isCurrent: true })
    expect(boundary.authority).toHaveBeenCalledTimes(2)
    const reloaded = await f.read(result.checkpointId, f.checkpoint.digest)
    expect(reloaded.manifest).toEqual(f.input.nextCheckpoint.manifest)
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO page_studio_checkpoints'))).toBe(true)
    expect(f.bucket.put).not.toHaveBeenCalled()
  })

  it.each(['presentation', 'footer'])('rejects invalid %s before any SQL write', async (field) => {
    const f = await fixture((manifest) => {
      if (field === 'presentation') manifest.pages[0].presentation = { 'color.text': 'url(https://invalid.example)' }
      else manifest.shell.footer.contentPolicy = 'unknown'
    })
    vi.spyOn(console, 'info').mockImplementation(() => {})
    await expect(coordinateCmsGraphCheckpoint({ checkpoint: f.checkpoint, expectedCheckpointId: f.snapshot.checkpoint.id }, f.principal)).rejects.toMatchObject({ code: 'GRAPH_CHECKPOINT', statusCode: 422 })
    expect(boundary.authority).toHaveBeenCalledOnce()
    expect(f.query.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE|DELETE)/.test(sql))).toBe(false)
    expect(f.bucket.put).not.toHaveBeenCalled()
  })

  it('restores presentation, explicit footer and legacy props through actual immutable checkpoint bytes', async () => {
    const f = await fixture()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const result = await coordinateCmsGraphRestore({ action: 'restore', checkpointId: f.checkpoint.checkpointId, expectedCheckpointId: f.snapshot.checkpoint.id, requestId: '11111111-1111-4111-8111-111111111111' }, f.principal)
    expect(result).toMatchObject({ isCurrent: true })
    expect(result.checkpointId).toMatch(/^restore_/)
    expect(f.bucket.put).toHaveBeenCalledOnce()
    const envelope = JSON.parse(f.objects.get(f.key(result.checkpointId))!)
    const reloaded = await f.read(result.checkpointId, envelope.digest)
    expect(reloaded.manifest).toEqual(f.input.nextCheckpoint.manifest)
    expect(boundary.authority).toHaveBeenCalledTimes(3)
    expect(f.query.mock.calls.some(([sql]) => sql.includes('\'draft.history.saved\''))).toBe(true)
  })
})
