import { describe, expect, it } from 'vitest'
import { deriveHistoryRestore, parseDesignHistoryRequest } from '../../shared/emailRendering/designHistory'
import { parseDesignTemplateRequest } from '../../shared/emailRendering/designTemplates'
import { structuredDesign } from '../fixtures/email-design/structured'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'

const uuid = '10000000-0000-4000-8000-000000000001'
const source = () => validateEmailDesign(structuredDesign())
describe('history uses present policy, never historical authority', () => {
  it('restores structure and lineage while preserving current grants, brand, and restrictions', () => {
    const historical = source(),
      current = source()
    current.blocks.root.data.childrenIds = ['cta']
    delete current.blocks.heading
    current.lineage = current.lineage.filter(l => l.blockId !== 'heading')
    current.policy.editableFields = ['cta.data.props.text']
    const next = deriveHistoryRestore(current, historical)
    expect(next.blocks).toEqual(historical.blocks)
    expect(next.lineage).toEqual(historical.lineage)
    expect(next.policy).toEqual(current.policy)
    expect(next.policy.editableFields).not.toContain('heading.data.props.text')
    expect(next.source).toEqual(current.source)
  })
  it('rejects changes or removals to current locked blocks, inherited styles and locked placement', () => {
    const current = source(),
      historical = source()
    current.policy.designerLocks = { blockIds: ['heading'], styleFields: [] }
    historical.blocks.heading.data.props!.text = 'Earlier locked text'
    expect(() => deriveHistoryRestore(current, historical)).toThrow('EDIT_FORBIDDEN')
    historical.blocks.heading = structuredDesign().blocks.heading
    historical.blocks.root.data.childrenIds = ['cta', 'heading']
    expect(() => deriveHistoryRestore(current, historical)).toThrow('EDIT_FORBIDDEN')
    current.policy.designerLocks = { blockIds: [], styleFields: ['heading.data.style.color'] }
    historical.blocks.heading.data.style = { color: '#ffffff' }
    expect(() => deriveHistoryRestore(current, historical)).toThrow('EDIT_FORBIDDEN')
  })
  it('never restores older denied content fields, tenant scope, or native authority', () => {
    const current = source(),
      historical = source()
    current.policy.editableFields = ['cta.data.props.text']
    historical.blocks.heading.data.props!.text = 'Old denied content'
    expect(() => deriveHistoryRestore(current, historical)).toThrow('EDIT_FORBIDDEN')
    historical.scope.clientId = crypto.randomUUID()
    expect(() => deriveHistoryRestore(current, historical)).toThrow('POLICY_CHANGE_FORBIDDEN')
  })
  it('cannot reintroduce a descendant style that bypasses a current inherited lock', () => {
    const current = source(), historical = source()
    current.blocks.root.data.props = { fontFamily: 'MODERN_SANS' }
    historical.blocks.root.data.props = { fontFamily: 'MODERN_SANS' }
    historical.blocks.heading.data.style = { fontFamily: 'CLASSIC_SERIF' }
    current.blocks.root.data.childrenIds = ['cta']
    delete current.blocks.heading
    current.lineage = current.lineage.filter(item => item.blockId !== 'heading')
    current.policy.editableFields = current.policy.editableFields.filter(path => !path.startsWith('heading.'))
    current.policy.designerLocks = { blockIds: [], styleFields: ['root.data.props.fontFamily'] }
    expect(() => deriveHistoryRestore(current, historical)).toThrow('EDIT_FORBIDDEN')
  })
  it('rejects browser design JSON and broad or ambiguous commands', () => {
    const restore = {
      version: 1,
      command: 'restore-revision',
      draftId: uuid,
      expectedRevisionId: uuid,
      revisionId: uuid,
      operationId: uuid
    }
    expect(parseDesignHistoryRequest(restore).command).toBe('restore-revision')
    expect(() => parseDesignHistoryRequest({ ...restore, design: source() })).toThrow()
    expect(() => parseDesignHistoryRequest({ ...restore, command: 'undo' })).toThrow()
    const publish = {
      version: 1,
      command: 'publish-template',
      operationId: uuid,
      draftId: uuid,
      expectedRevisionId: uuid,
      name: 'Campaign',
      category: null,
      includedOverridePaths: []
    }
    expect(parseDesignTemplateRequest(publish).command).toBe('publish-template')
    expect(() => parseDesignTemplateRequest({ ...publish, clientId: null })).toThrow()
    expect(() => parseDesignTemplateRequest({ ...publish, design: source() })).toThrow()
  })
})
