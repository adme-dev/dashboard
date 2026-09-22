/* eslint-disable @typescript-eslint/no-explicit-any -- Corruption fixtures deliberately mutate wire shapes outside their validated types. */
import { beforeEach, expect, it, vi } from 'vitest'
import golden from '../../fixtures/pageStudioCmsGraph.json'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { readAcceptedComponentCmsData } from '~~/server/utils/pageStudio/componentCmsData'

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), current: vi.fn(), artifact: vi.fn(), objects: vi.fn(), records: vi.fn(), authority: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/cmsGraphCoordinator', () => ({ readCmsGraphSnapshot: mocks.snapshot, assertCmsGraphSnapshotCurrent: mocks.current, cmsGraphConflict: () => new Error('Snapshot changed') }))
vi.mock('~~/server/utils/pageStudio/cmsGraphStorage', () => ({ createCmsGraphStorage: () => ({ readArtifact: mocks.artifact, readObjects: mocks.objects }) }))
vi.mock('~~/server/utils/pageStudio/cmsCommitAuthority', () => ({ withCmsCommitAuthority: mocks.authority }))
vi.mock('~~/server/utils/pageStudio/cmsVisibility', async original => ({ ...await original<object>(), readCmsConsumerSnapshot: mocks.records }))
const principal = { source: 'studio-session', env: {}, claims: {}, capability: 'workspace:checkpoint' } as never
let input: { pin: unknown }, snapshot: any, recordSnapshot: any, bodies: any[]
beforeEach(async () => {
  vi.resetAllMocks()
  const raw = golden.artifactBytes.find(raw => JSON.parse(raw).id === 'fleet_view')!
  const artifact = JSON.parse(raw), definition = JSON.parse(golden.artifactBytes.find(raw => JSON.parse(raw).kind === 'collection')!).definition
  input = { pin: { kind: 'component', id: artifact.id, version: artifact.version, sha256: await collectionDigest(artifact) } }
  const pin = { ...JSON.parse(golden.preparations[0]!.receiptBytes).items[0], sha256: await collectionDigest(definition), bytes: new TextEncoder().encode(collectionCanonical(definition)).length }
  const schema = { id: 'schema', pin, schemaObjectId: null, archived: null, actorId: 'user', createdAt: '2026-09-22T00:00:00.000Z' }
  const record = { scope: definition.scope, collectionId: definition.id, id: 'record_a', revision: 1, schemaVersion: 1, archived: false, values: { title: 'Visible' } }
  const recordPin = { ...pin, kind: 'record', recordId: record.id, sha256: await collectionDigest(record), bytes: new TextEncoder().encode(collectionCanonical(record)).length }
  const meta = { ...schema, id: 'record', pin: recordPin, schemaObjectId: schema.id, archived: false }
  snapshot = { scope: definition.scope, context: { state: { target: {} }, application: { id: 'app', digest: 'a'.repeat(64), manifest: { components: [input.pin] } } }, checkpoint: { id: 'checkpoint_a', digest: 'b'.repeat(64) }, schemas: [schema] }
  recordSnapshot = { context: snapshot.context, schemas: [schema], objects: [{ object: meta, schema }] }
  bodies = [{ pin, body: definition, actorId: schema.actorId, createdAt: schema.createdAt, schema: null, head: false }, { pin: recordPin, body: record, actorId: meta.actorId, createdAt: meta.createdAt, schema: pin, head: false }]
  mocks.snapshot.mockResolvedValue(snapshot)
  mocks.current.mockResolvedValue(undefined)
  mocks.artifact.mockResolvedValue(raw)
  mocks.records.mockImplementation(async () => structuredClone(recordSnapshot))
  mocks.authority.mockImplementation(async (_input, work) => work({}))
  mocks.objects.mockImplementation(async pins => pins.map((pin: any) => bodies.find(body => collectionCanonical(body.pin) === collectionCanonical(pin))))
})
it('projects accepted current record heads with exact definitions and no private metadata', async () => {
  const result = await readAcceptedComponentCmsData(input, principal)
  expect(Object.values(result.data)).toEqual([[{ id: 'record_a', values: { title: 'Visible' } }]])
  expect(result.definitions).toHaveLength(1)
  expect(result.componentPin).toEqual(input.pin)
  expect(JSON.stringify(result)).not.toMatch(/actorId|object_key|source/)
  expect(mocks.records).toHaveBeenCalledTimes(2)
})
it.each(['extra', 'foreign'])('denies %s request before remote reads', async (mode) => {
  const raw = mode === 'extra' ? { ...input, scope: snapshot.scope } : { pin: { ...(input.pin as object), sha256: 'f'.repeat(64) } }
  await expect(readAcceptedComponentCmsData(raw, principal)).rejects.toThrow()
  expect(mocks.artifact).not.toHaveBeenCalled()
})
it.each(['actor', 'time', 'schema', 'archived'])('rejects corrupted %s record metadata', async (mode) => {
  if (mode === 'actor') bodies[1].actorId = 'another'
  if (mode === 'time') bodies[1].createdAt = '2025-01-01T00:00:00.000Z'
  if (mode === 'schema') bodies[1].schema = null
  if (mode === 'archived') bodies[1].body.archived = true
  await expect(readAcceptedComponentCmsData(input, principal)).rejects.toThrow()
})
it('rejects record head changes during private I/O', async () => {
  mocks.records.mockImplementationOnce(async () => structuredClone(recordSnapshot)).mockImplementation(async () => ({ ...recordSnapshot, objects: [] }))
  await expect(readAcceptedComponentCmsData(input, principal)).rejects.toThrow()
})
it('rejects revoked authority after private I/O', async () => {
  mocks.current.mockRejectedValue(new Error('Revoked'))
  await expect(readAcceptedComponentCmsData(input, principal)).rejects.toThrow('Revoked')
})
it('returns empty data after checking collection bindings when no records exist', async () => {
  recordSnapshot.objects = []
  const result = await readAcceptedComponentCmsData(input, principal)
  expect(Object.values(result.data)).toEqual([[]])
})
it('omits fields that were private in the stored schema even when public now', async () => {
  const old = structuredClone(bodies[0])
  old.body.version = 2
  old.body.fields[0].visibility = 'private'
  old.pin = { ...old.pin, version: 2, sha256: await collectionDigest(old.body), bytes: new TextEncoder().encode(collectionCanonical(old.body)).length }
  const oldMeta = { ...snapshot.schemas[0], id: 'old_schema', pin: old.pin }
  recordSnapshot.objects[0].schema = oldMeta
  recordSnapshot.objects[0].object.schemaObjectId = oldMeta.id
  bodies[1].schema = old.pin
  bodies[1].body.schemaVersion = 2
  bodies[1].pin = { ...bodies[1].pin, sha256: await collectionDigest(bodies[1].body), bytes: new TextEncoder().encode(collectionCanonical(bodies[1].body)).length }
  recordSnapshot.objects[0].object.pin = bodies[1].pin
  bodies.push(old)
  expect(Object.values((await readAcceptedComponentCmsData(input, principal)).data)).toEqual([[{ id: 'record_a', values: {} }]])
})
it('rejects private byte budgets before returning projected data', async () => {
  const original = mocks.objects.getMockImplementation()!
  mocks.objects.mockImplementation(async (pins) => {
    const result = await original(pins)
    if (pins.some((pin: any) => pin.kind === 'record')) result[0].body.values.title = 'x'.repeat(1_000_001)
    return result
  })
  await expect(readAcceptedComponentCmsData(input, principal)).rejects.toThrow()
})
it('applies the total row budget to actual projected rows, not empty requested windows', async () => {
  const artifact = JSON.parse(await mocks.artifact())
  artifact.dataBindings[0].limit = 100
  artifact.dataBindings.push({ ...artifact.dataBindings[0], id: 'another_binding' })
  const pin = { ...(input.pin as object), sha256: await collectionDigest(artifact) }
  input.pin = pin
  snapshot.context.application.manifest.components = [pin]
  mocks.artifact.mockResolvedValue(collectionCanonical(artifact))
  recordSnapshot.objects = []
  const result = await readAcceptedComponentCmsData(input, principal)
  expect(Object.values(result.data)).toEqual([[], []])
})
it('rejects schema or graph changes under the final native lock', async () => {
  mocks.records.mockImplementationOnce(async () => structuredClone(recordSnapshot)).mockImplementation(async () => ({ ...recordSnapshot, schemas: [] }))
  await expect(readAcceptedComponentCmsData(input, principal)).rejects.toThrow()
})
