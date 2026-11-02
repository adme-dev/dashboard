import { describe, expect, it } from 'vitest'
import { applyModuleInstance, extractDesignModule, moduleLocalOverrides, parseDesignModuleRequest, type ModuleInstanceRequest } from '../../shared/emailRendering/designModules'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import { structuredDesign } from '../fixtures/email-design/structured'

const moduleId = '30000000-0000-4000-8000-000000000001'
const rev1 = '40000000-0000-4000-8000-000000000001'
const rev2 = '40000000-0000-4000-8000-000000000002'
const op = '50000000-0000-4000-8000-000000000001'
const draftId = '60000000-0000-4000-8000-000000000001'
const identity = { version: 1 as const, operationId: op, draftId, expectedDraftRevisionId: rev1 }
const module = () => extractDesignModule(structuredDesign(), ['heading'], [], [])
const record = (revisionId = rev1, design = module()) => ({ moduleId, revisionId, design })
const insertion = (operationId = op): ModuleInstanceRequest => ({ ...identity, operationId, command: 'insert-module', moduleId, revisionId: rev1, parentId: 'root', index: 1 })
const update = (overrides: 'preserve' | 'discard' = 'preserve'): ModuleInstanceRequest => ({ ...identity, command: 'update-module-instance', instanceId: op, revisionId: rev2, overrides })

describe('immutable reusable canonical sections', () => {
  it('extracts a hero without subject/footer, preserving only the selected persisted policy and lineage', () => {
    const source = validateEmailDesign(structuredDesign())
    source.policy.designerLocks = { blockIds: ['heading', 'cta'], styleFields: ['heading.data.style.color'] }
    const selected = extractDesignModule(source, ['heading'], [], [])
    expect(selected.kind).toBe('module')
    expect(Object.keys(selected.blocks)).toEqual(['heading'])
    expect(selected.policy.editableFields).toEqual(['heading.data.props.text'])
    expect(selected.policy.designerLocks?.blockIds).toEqual(['heading'])
    expect(selected.source.nativeArtifact).toBeNull()
    expect(selected.lineage).toEqual([source.lineage[0]])
  })
  it('defaults saved-template publication to all layout children and rejects overlapping/missing selections', () => {
    expect(extractDesignModule(structuredDesign(), undefined, [], []).rootChildrenIds).toEqual(['heading', 'cta'])
    for (const roots of [['root'], ['heading', 'heading'], ['ghost']]) expect(() => extractDesignModule(structuredDesign(), roots, [], [])).toThrow()
  })
  it('mints collision-free block/node/field lineage on repeated insertion and inherits policy', () => {
    const first = applyModuleInstance(structuredDesign(), insertion(), [record()])
    const second = applyModuleInstance(first, insertion(crypto.randomUUID()), [record()])
    expect(second.moduleInstances).toHaveLength(2)
    expect(new Set(second.moduleInstances.flatMap(i => i.rootBlockIds)).size).toBe(2)
    expect(new Set(second.lineage.map(i => i.nodeId)).size).toBe(second.lineage.length)
    expect(second.dependencies).toEqual([{ moduleId, revisionId: rev1 }])
    expect(second.policy.editableFields).toContain(`mi_${op}_0.data.props.text`)
    expect(first.blocks.heading).toEqual(structuredDesign().blocks.heading)
    const collision = validateEmailDesign(structuredDesign())
    collision.lineage[0].nodeId = `mi_${op}_0`
    expect(() => applyModuleInstance(collision, insertion(), [record()])).toThrow('INVALID_DESIGN')
  })
  it('keeps pins unchanged until explicit update, derives actual local edits, and preserves them when requested', () => {
    const first = applyModuleInstance(structuredDesign(), insertion(), [record()])
    const root = first.moduleInstances[0].rootBlockIds[0]
    first.blocks[root].data.props!.text = 'Local staff override'
    const newer = module()
    newer.blocks.heading.data.props!.text = 'Published v2'
    const records = [record(), record(rev2, newer)]
    expect(first.moduleInstances[0].revisionId).toBe(rev1)
    const next = applyModuleInstance(first, update(), records)
    expect(next.blocks[root].data.props!.text).toBe('Local staff override')
    expect(next.moduleInstances[0].overrides).toEqual({ [`${root}.data.props.text`]: 'Local staff override' })
    expect(next.moduleInstances[0].revisionId).toBe(rev2)
    expect(applyModuleInstance(first, update('discard'), records).blocks[root].data.props!.text).toBe('Published v2')
  })
  it('does not resurrect a recorded override after staff restore the current baseline', () => {
    const first = applyModuleInstance(structuredDesign(), insertion(), [record()])
    const root = first.moduleInstances[0].rootBlockIds[0]
    first.moduleInstances[0].overrides = { [`${root}.data.props.text`]: 'stale override' }
    expect(moduleLocalOverrides(first, op, module())).toEqual({})
  })
  it('fails rather than drop an override whose field/policy disappears, unless discard is explicit', () => {
    const first = applyModuleInstance(structuredDesign(), insertion(), [record()])
    first.blocks[first.moduleInstances[0].rootBlockIds[0]].data.props!.text = 'Local'
    const locked = module()

    locked.policy.editableFields = []
    expect(() => applyModuleInstance(first, update(), [record(), record(rev2, locked)])).toThrow('OVERRIDE_CONFLICT')
    expect(applyModuleInstance(first, update('discard'), [record(), record(rev2, locked)]).moduleInstances[0].overrides).toEqual({})
  })
  it('detaches provenance while preserving exact content, lineage, and inherited restrictions', () => {
    const source = module()

    source.policy.designerLocks = { blockIds: ['heading'], styleFields: [] }
    const first = applyModuleInstance(structuredDesign(), insertion(), [record(rev1, source)])
    const detached = applyModuleInstance(first, { ...identity, command: 'detach-module-instance', instanceId: op }, [record(rev1, source)])
    expect(detached.moduleInstances).toEqual([])
    expect(detached.dependencies).toEqual([])
    expect(detached.blocks).toEqual(first.blocks)
    expect(detached.policy).toEqual(first.policy)
    expect(detached.lineage).toEqual(first.lineage)
  })
  it('requires explicit review of actual local overrides before publishing an instance and refuses partial instance selection', () => {
    const first = applyModuleInstance(structuredDesign(), insertion(), [record()])
    const root = first.moduleInstances[0].rootBlockIds[0]
    first.blocks[root].data.props!.text = 'Local'
    expect(() => extractDesignModule(first, [root], [record()], [])).toThrow('LOCAL_OVERRIDE_REVIEW_REQUIRED')
    expect(extractDesignModule(first, [root], [record()], [`${root}.data.props.text`]).blocks[root].data.props!.text).toBe('Local')
    const container = module()
    container.blocks.box = { type: 'Container', data: { childrenIds: ['heading'] } }

    container.rootChildrenIds = ['box']
    const nested = applyModuleInstance(structuredDesign(), insertion(), [record(rev1, container)])
    const child = Object.keys(nested.blocks).find(id => id.startsWith('mi_') && nested.blocks[id].type === 'Heading')!
    expect(() => extractDesignModule(nested, [child], [record(rev1, container)], [])).toThrow('CLOSED_SELECTION_REQUIRED')
  })
  it('rejects cross-scope inserts and insertion inside a pinned module', () => {
    const foreign = module()

    foreign.scope.clientId = crypto.randomUUID()
    expect(() => applyModuleInstance(structuredDesign(), insertion(), [record(rev1, foreign)])).toThrow('SCOPE_MISMATCH')
    const box = module()

    box.blocks.box = { type: 'Container', data: { childrenIds: ['heading'] } }

    box.rootChildrenIds = ['box']
    const first = applyModuleInstance(structuredDesign(), insertion(), [record(rev1, box)])
    expect(() => applyModuleInstance(first, { ...insertion(crypto.randomUUID()), parentId: first.moduleInstances[0].rootBlockIds[0], index: 0 } as ModuleInstanceRequest, [record(rev1, box)])).toThrow('EDIT_FORBIDDEN')
  })
  it('rejects browser design, scope, actor, manifest, URL and implicit update claims in strict action envelopes', () => {
    expect(parseDesignModuleRequest(insertion())).toEqual(insertion())
    for (const extra of [{ design: structuredDesign() }, { actorId: op }, { scope: { clientId: null } }, { assets: [] }, { url: 'https://evil.test/image.png' }]) expect(() => parseDesignModuleRequest({ ...insertion(), ...extra })).toThrow()
    expect(() => parseDesignModuleRequest({ ...identity, command: 'update-module-instance', instanceId: op, revisionId: rev2 })).toThrow()
  })
})
