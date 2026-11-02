import { describe, expect, it } from 'vitest'
import { useEdmNativeLibrary } from '../../app/composables/useEdmNativeLibrary'
import type { DesignHandoff } from '../../shared/emailRendering/designRoundtrip'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import { applyDesignerOperations } from '../../shared/emailRendering/designDesigner'
import { structuredDesign } from '../fixtures/email-design/structured'

const op = '50000000-0000-4000-8000-000000000001'
function handoff(): DesignHandoff {
  return { id: op, draftId: op, templateId: op, baseRevisionId: op, state: 'open', expiresAt: '2026-11-02T00:00:00Z', source: validateEmailDesign(structuredDesign()), proposal: null, proposalRevisionId: null, appliedRevisionId: null, editorUrl: 'https://creative.xeroflow.io' }
}
describe('native library saved-state fence', () => {
  it('opens no library write authority until exact same-owner projection is confirmed', () => {
    const flow = useEdmNativeLibrary(), source = handoff()
    const context = flow.capture(source, { operationId: op, operations: [], selectedBlockIds: ['heading'] }, op, 'section')
    expect(flow.state.value?.ready).toBe(false)
    expect(context.selectedBlockIds).toEqual(['heading'])
    const draft = { state: 'structured' as const, source: source.source, documentId: op, templateId: op, headRevisionId: op, projectionRevisionId: op, projection: { state: 'current' as const } }
    expect(() => flow.saved({ ...draft, documentId: crypto.randomUUID() }, op)).toThrow()
    expect(() => flow.saved({ ...draft, headRevisionId: crypto.randomUUID() }, op)).toThrow()
    flow.saved(draft, op)
    expect(flow.state.value?.ready).toBe(true)
  })
  it('invalidates captured selection before any reopen attempt while retaining its saved owner', () => {
    const flow = useEdmNativeLibrary(), source = handoff()
    flow.capture(source, { operationId: op, operations: [], selectedBlockIds: ['heading'], insertionTarget: { parentId: 'root', index: 1 } }, op, 'library')
    flow.saved({ state: 'structured', source: source.source, documentId: op, templateId: op, headRevisionId: op, projectionRevisionId: op, projection: { state: 'current' } }, op)
    flow.requireReopen()
    expect(flow.state.value).toMatchObject({ ready: true, reopenRequired: true, documentId: op, templateId: op, revisionId: op })
    expect(flow.state.value?.context.selectedBlockIds).toEqual([])
    expect(flow.state.value?.context.insertionTarget).toBeUndefined()
  })
  it('keeps captured operations through review, refuses divergent saved content, and cancels without touching source', () => {
    const flow = useEdmNativeLibrary(), source = handoff(), operations = [{ op: 'set-props', blockId: 'heading', props: { text: 'Changed {{first_name}}' } }]
    flow.capture(source, { operationId: op, operations, selectedBlockIds: ['heading'] }, op, 'library')
    const draft = { state: 'structured' as const, source: source.source, documentId: op, templateId: op, headRevisionId: op, projectionRevisionId: op, projection: { state: 'current' as const } }
    expect(() => flow.saved(draft, op)).toThrow()
    flow.saved({ ...draft, source: applyDesignerOperations(source.source, operations, op) }, op)
    expect(flow.state.value?.context.operations).toEqual(operations)
    flow.clear()
    expect(flow.state.value).toBeNull()
    expect(source.source.blocks.heading.data.props?.text).toBe('Hello {{first_name}}')
  })
})
