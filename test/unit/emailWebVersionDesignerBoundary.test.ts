import { describe, expect, it } from 'vitest'
import { applyDesignerOperations } from '../../shared/emailRendering/designDesigner'
import { assertStaffDesignEdit, validateEmailDesign } from '../../shared/emailRendering/designContract'
import { structuredDesign } from '../fixtures/email-design/structured'

const operationId = '10000000-0000-4000-8000-000000000003'
describe('web link composer/native boundary (shared contract only)', () => {
  it.each(['{{web_version_url}}', '{{unsubscribe_url}}'])('preserves baseline %s in no-op and unrelated native style edits', (token) => {
    const source = structuredDesign()
    source.blocks.cta.data.props.url = token
    expect(applyDesignerOperations(source, [], operationId)).toEqual(source)
    const styled = applyDesignerOperations(source, [{ op: 'set-style', blockId: 'heading', style: { color: '#123456' } }], operationId)
    expect(styled.blocks.cta.data.props?.url).toBe(token)
    // A URL operation still goes through native/shared safeLink. This task
    // deliberately does not make token URL operations part of that vocabulary.
    expect(() => applyDesignerOperations(source, [{ op: 'set-props', blockId: 'cta', props: { url: token } }], operationId)).toThrow('EDIT_FORBIDDEN')
  })
  it('permits the existing staff content-only save policy to author a token in an editable URL', () => {
    const source = validateEmailDesign(structuredDesign())
    const next = structuredClone(source)
    next.blocks.cta.data.props!.url = '{{web_version_url}}'
    expect(() => assertStaffDesignEdit(source, next)).not.toThrow()
    expect(() => applyDesignerOperations(source, [{ op: 'set-props', blockId: 'cta', props: { url: '{{web_version_url}}' } }], operationId)).toThrow('EDIT_FORBIDDEN')
  })
})
