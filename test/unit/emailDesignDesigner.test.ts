import { describe, expect, it } from 'vitest'
import { applyDesignerOperations, designerBlockId, designerCapabilities, parseDesignerRoundtripRequest } from '../../shared/emailRendering/designDesigner'
import { assertStaffDesignEdit, validateEmailDesign } from '../../shared/emailRendering/designContract'
import { structuredDesign } from '../fixtures/email-design/structured'

const opId = '10000000-0000-4000-8000-000000000003'
const apply = (ops: unknown, source: unknown = structuredDesign()) => applyDesignerOperations(source, ops, opId)

describe('canonical designer operations', () => {
  it('preserves exact no-op source and leaves the staff content guard unchanged', () => {
    expect(apply([])).toEqual(structuredDesign())
    const styled = apply([{ op: 'set-style', blockId: 'heading', style: { color: '#102030', fontSize: 24 } }])
    expect(styled.blocks.heading.data.style).toEqual({ color: '#102030', fontSize: 24 })
    expect(() => assertStaffDesignEdit(validateEmailDesign(structuredDesign()), styled)).toThrow('EDIT_FORBIDDEN')
  })
  it('mints deterministic add/duplicate identities and independent lineage without dropping unknown fields', () => {
    const source = structuredDesign()
    source.blocks.heading.data.props['customExtension'] = { preserve: true }
    const result = apply([
      { op: 'add-section', parentId: 'root', index: 1, sectionType: 'Container' },
      { op: 'duplicate-section', blockId: 'heading', parentId: designerBlockId(opId, 0), index: 0 },
      { op: 'move-section', blockId: 'cta', parentId: 'root', index: 0 },
      { op: 'remove-section', blockId: 'heading' }
    ], source)
    expect(result.blocks.root.data.childrenIds).toEqual(['cta', designerBlockId(opId, 0)])
    expect(result.blocks[designerBlockId(opId, 1)].data.props).toEqual(source.blocks.heading.data.props)
    expect(new Set(result.lineage.map(x => x.nodeId)).size).toBe(result.lineage.length)
    expect(result.policy.editableFields).toContain(`${designerBlockId(opId, 1)}.data.props.text`)
    expect(source.blocks.root.data.childrenIds).toEqual(['heading', 'cta'])
  })
  it('permits literal ampersands while preserving unsupported entity-rich source', () => {
    const source = validateEmailDesign(structuredDesign())
    source.blocks.heading.data.props!.text = 'R&D {{first_name}}'
    expect(apply([{ op: 'set-props', blockId: 'heading', props: { text: 'Design & Research {{first_name}}' } }], source).blocks.heading.data.props?.text).toBe('Design & Research {{first_name}}')
    source.blocks.heading.data.props!.text = 'Terms &amp; Conditions {{first_name}}'
    expect(() => apply([{ op: 'set-props', blockId: 'heading', props: { text: 'Terms {{first_name}}' } }], source)).toThrow('EDIT_FORBIDDEN')
    expect(apply([], source)).toEqual(source)
  })
  it('uses typed semantic CTA/root props and preserves mobile style/source metadata', () => {
    const result = apply([
      { op: 'set-props', blockId: 'root', props: { contentWidth: 680, canvasColor: '#ffffff' } },
      { op: 'set-props', blockId: 'cta', props: { buttonBackgroundColor: '#ff0000', buttonTextColor: '#ffffff', buttonStyle: 'pill', fullWidth: true } },
      { op: 'set-style', blockId: 'heading', mobile: true, style: { fontSize: 18, padding: { top: 8, bottom: 8, left: 4, right: 4 } } }
    ])
    expect(result.blocks.root.data.props?.contentWidth).toBe(680)
    expect(result.blocks.cta.data.props?.buttonStyle).toBe('pill')
    expect(result.blocks.heading.data.mobile).toMatchObject({ style: { fontSize: 18 } })
    expect(result.source).toEqual(structuredDesign().source)
  })
  it('adds/remaps nested column trees and refuses to drop occupied columns', () => {
    const columns = designerBlockId(opId, 0)
    const ops = [
      { op: 'add-section', parentId: 'root', index: 0, sectionType: 'ColumnsContainer' },
      { op: 'set-props', blockId: columns, props: { columnsCount: 3 } },
      { op: 'move-section', blockId: 'cta', parentId: columns, columnIndex: 2, index: 0 }
    ]
    const result = apply(ops)
    expect((result.blocks[columns].data.props?.columns as Array<{ childrenIds: string[] }>)[2].childrenIds).toEqual(['cta'])
    expect(() => apply([...ops, { op: 'set-props', blockId: columns, props: { columnsCount: 2 } }])).toThrow('EDIT_FORBIDDEN')
    const duplicate = apply([...ops, { op: 'duplicate-section', blockId: columns, parentId: 'root', index: 0 }])
    expect((duplicate.blocks[designerBlockId(opId, 3)].data.props?.columns as Array<{ childrenIds: string[] }>)[2].childrenIds).toEqual([designerBlockId(opId, 3, 1)])
  })
  it.each(['footer', 'Html', 'Text'])('protects %s legal/unsupported sections from deletion and inherited restyling', (type) => {
    const source = validateEmailDesign(structuredDesign())
    source.blocks.legal = { type, data: { props: { text: 'Unsubscribe {{unsubscribe_url}}' } } }
    source.blocks.root.data.childrenIds!.push('legal')
    expect(() => apply([{ op: 'remove-section', blockId: 'legal' }], source)).toThrow('EDIT_FORBIDDEN')
    expect(() => apply([{ op: 'set-style', blockId: 'root', style: { color: '#ffffff' } }], source)).toThrow('EDIT_FORBIDDEN')
  })
  it('enforces persisted brand restrictions on desktop/mobile and locked ancestors', () => {
    const source = validateEmailDesign(structuredDesign())
    source.policy.designerLocks = { blockIds: [], styleFields: ['heading.data.style.color', 'heading.data.style.padding.left', 'cta.data.props.buttonBackgroundColor'] }
    for (const mobile of [false, true]) expect(() => apply([{ op: 'set-style', blockId: 'heading', mobile, style: { color: '#ff0000' } }], source)).toThrow('EDIT_FORBIDDEN')
    expect(() => apply([{ op: 'set-props', blockId: 'cta', props: { buttonBackgroundColor: '#ff0000' } }], source)).toThrow('EDIT_FORBIDDEN')
    expect(() => apply([{ op: 'set-style', blockId: 'heading', style: { padding: { left: 40, right: 0, top: 0, bottom: 0 } } }], source)).toThrow('EDIT_FORBIDDEN')
    expect(() => apply([{ op: 'remove-section', blockId: 'heading' }], source)).toThrow('EDIT_FORBIDDEN')
    source.policy.designerLocks.blockIds = ['root']
    expect(() => apply([{ op: 'move-section', blockId: 'heading', parentId: 'root', index: 1 }], source)).toThrow('EDIT_FORBIDDEN')
    expect(designerCapabilities(source).blocks.find(x => x.blockId === 'heading')?.editable).toBe(false)
  })
  it('protects pinned module subtrees and dependency closure', () => {
    const source = validateEmailDesign(structuredDesign())
    source.dependencies = [{ moduleId: opId, revisionId: opId }]
    source.moduleInstances = [{ instanceId: 'instance', moduleId: opId, revisionId: opId, rootBlockIds: ['heading'], overrides: {} }]
    expect(apply([], source).dependencies).toEqual(source.dependencies)
    expect(() => apply([{ op: 'remove-section', blockId: 'heading' }], source)).toThrow('EDIT_FORBIDDEN')
    expect(() => apply([{ op: 'set-style', blockId: 'heading', style: { fontSize: 16 } }], source)).toThrow('EDIT_FORBIDDEN')
  })
  it('rejects foreign image assets but permits reuse of the existing canonical image set', () => {
    const source = validateEmailDesign(structuredDesign())
    for (const id of ['one', 'two']) {
      source.blocks[id] = { type: 'Image', data: { props: { url: `https://example.com/${id}.png` } } }
      source.blocks.root.data.childrenIds!.push(id)
      source.policy.editableFields.push(`${id}.data.props.url`)
    }
    expect(() => apply([{ op: 'set-props', blockId: 'one', props: { url: 'https://foreign.example/image.png' } }], source)).toThrow('EDIT_FORBIDDEN')
    expect(apply([{ op: 'set-props', blockId: 'one', props: { url: 'https://example.com/two.png' } }], source).blocks.one.data.props?.url).toBe('https://example.com/two.png')
  })
  it.each([
    { op: 'set-style', blockId: 'heading', style: { backgroundImage: 'url(https://evil.example)' } },
    { op: 'set-style', blockId: 'heading', style: { color: '#fff;display:none' } },
    { op: 'set-props', blockId: 'cta', props: { url: 'javascript:alert(1)' } },
    { op: 'set-props', blockId: 'heading', props: { text: 'Lost personalization' } },
    { op: 'set-props', blockId: 'heading', props: { policy: {} } },
    { op: 'add-section', parentId: 'root', index: 0, sectionType: 'Html' },
    { op: 'add-section', parentId: 'root', index: 0, sectionType: 'Text', blockId: 'forged-id' },
    { op: 'move-section', blockId: 'root', parentId: 'root', index: 0 }
  ])('rejects unreviewed operations %#', operation => expect(() => apply([operation])).toThrow())
  it('rejects actor/policy/artifact escalation and old content proposals at the separate parser', () => {
    const request = { command: 'propose', handoffId: opId, action: { version: 1, action: 'propose-designer-return', operationId: opId, scope: structuredDesign().scope, draftId: opId, baseRevisionId: opId, operations: [] } }
    expect(parseDesignerRoundtripRequest(request)).toEqual(request)
    for (const field of ['design', 'policy', 'actorId', 'nativeArtifact']) expect(() => parseDesignerRoundtripRequest({ ...request, action: { ...request.action, [field]: {} } })).toThrow()
    expect(() => parseDesignerRoundtripRequest({ ...request, action: { ...request.action, action: 'propose-return', design: structuredDesign() } })).toThrow()
  })
  it('reports canonical-only status and refuses unverified native source', () => {
    expect(designerCapabilities(structuredDesign()).nativeSource).toMatchObject({ state: 'canonical-only', artifact: null })
    const source = validateEmailDesign(structuredDesign())
    source.source.nativeArtifact = { id: 'invented', sha256: 'a'.repeat(64) }
    expect(() => apply([], source)).toThrow('EDIT_FORBIDDEN')
  })
})
