import { describe, expect, it } from 'vitest'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { deriveManagedTransferCopyClosure, deriveManagedTransferGraphIdentities } from '~~/shared/pageStudio/managed-transfer-copy-plan'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function fixture() {
  const scope = { tenantId: 'tenant', clientId: 'client', businessId: 'client', siteId: 'site', environment: 'staging' }
  const freezeDigest = 'a'.repeat(64)
  const object = (id: number, kind: string, version = 1) => ({ id: uuid(id), pin: { kind, version, bytes: 80, freezeDigest,
    collectionId: kind === 'content' ? '' : 'fleet', recordId: kind === 'record' ? 'limo' : '', operationId: `saved_${id}`,
    origin: 'prepared', sha256: String(id).padStart(64, '0') }, schemaObjectId: kind === 'record' ? uuid(3) : null,
  archived: kind === 'record' ? true : null, actorId: uuid(50), createdAt: '2026-10-16T00:00:00.000Z' })
  const objects = [object(1, 'content', 2), object(2, 'schema', 2), object(3, 'schema', 1), object(4, 'record'), object(5, 'content', 1)]
  return { scope, freezeDigest, currentContentId: uuid(1), selections: [{ collectionId: 'fleet', objectId: uuid(2) }],
    recordHeads: [{ collectionId: 'fleet', recordId: 'limo', objectId: uuid(4) }], objects, object,
    checkpoint: { schemaVersion: 2, contentBinding: { scope, revision: 1, digest: objects[4]!.pin.sha256 } } }
}
describe('exact managed transfer copy dependency closure', () => {
  it('includes current heads, archived record schema dependency and historical checkpoint content', () => {
    const f = fixture(), result = deriveManagedTransferCopyClosure(f, f.checkpoint)
    expect(result.map(x => x.id).sort()).toEqual(f.objects.map(x => x.id).sort())
    expect(result.find(x => x.pin.kind === 'record')?.archived).toBe(true)
  })
  it('does not confuse the bounded required closure with 1000 accepted metadata rows', () => {
    const f = fixture()
    for (let i = 6; i <= 1000; i++) f.objects.push(f.object(i, 'schema', i))
    expect(deriveManagedTransferCopyClosure(f, f.checkpoint)).toHaveLength(5)
  })
  it('rejects 129 required records before any transport or effect', () => {
    const f = fixture()
    f.recordHeads = []
    for (let i = 6; i <= 134; i++) {
      const o = f.object(i, 'record')
      o.pin.recordId = `record_${i}`
      f.objects.push(o)
      f.recordHeads.push({ collectionId: 'fleet', recordId: o.pin.recordId, objectId: o.id })
    }
    expect(() => deriveManagedTransferCopyClosure(f, f.checkpoint)).toThrow(/limit/i)
  })
  it.each(['schema', 'seed', 'head', 'scope', 'freeze', 'ambiguous'])('rejects missing or substituted %s dependency', (field) => {
    const f = fixture()
    if (field === 'schema') f.objects = f.objects.filter(x => x.id !== uuid(3))
    if (field === 'seed') f.objects = f.objects.filter(x => x.id !== uuid(5))
    if (field === 'head') f.recordHeads[0]!.objectId = uuid(999)
    if (field === 'scope') f.checkpoint.contentBinding.scope = { ...f.scope, siteId: 'other' }
    if (field === 'freeze') f.objects[3]!.pin.freezeDigest = 'b'.repeat(64)
    if (field === 'ambiguous') f.objects.push({ ...f.objects[4]!, id: uuid(999) })
    expect(() => deriveManagedTransferCopyClosure(f, f.checkpoint)).toThrow()
  })
  it('rejects oversized required bytes and never includes unreferenced content history', () => {
    const f = fixture()
    delete (f.checkpoint as { contentBinding?: unknown }).contentBinding
    expect(deriveManagedTransferCopyClosure(f, f.checkpoint)).toHaveLength(4)
    for (const object of f.objects) object.pin.bytes = 400_000
    expect(() => deriveManagedTransferCopyClosure(f, f.checkpoint)).toThrow(/limit/i)
  })
  it('derives stable purpose-separated UUIDv8 identities and keeps supplied generation', async () => {
    const input = { operationId: uuid(10), intentDigest: 'b'.repeat(64), sourceDigest: 'c'.repeat(64), destinationExecutionProofDigest: 'd'.repeat(64),
      generation: uuid(11), sourceObjectIds: [uuid(1), uuid(2)], selectedSchemaObjectIds: [uuid(2)] }
    const result = await deriveManagedTransferGraphIdentities(input)
    const identity = await collectionDigest({ version: 1, purpose: 'managed-transfer-copy-graph', operationId: input.operationId,
      intentDigest: input.intentDigest, sourceDigest: input.sourceDigest, destinationExecutionProofDigest: input.destinationExecutionProofDigest })
    expect(result.checkpointId).toBe(`transfer_${identity}`)
    expect(result.generation).toBe(input.generation)
    expect(result.applicationId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
    expect(result.objectIds).toHaveLength(2)
    expect(result.schemaObjects).toEqual([result.objectIds.find(x => x.sourceObjectId === uuid(2))])
    expect(await deriveManagedTransferGraphIdentities(input)).toEqual(result)
    expect(new Set([result.applicationId, ...result.objectIds.map(x => x.destinationObjectId)]).size).toBe(3)
  })
})
