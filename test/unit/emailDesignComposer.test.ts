import { describe, expect, it } from 'vitest'
import { composerToDesignDraft, validateContentReturn } from '../../shared/emailRendering/designComposer'
import { structuredDesign } from '../fixtures/email-design/structured'

const scope = structuredDesign().scope.clientId

describe('first structured composer round trip', () => {
  it('preserves source and stable field identities across conversion without mutating input', () => {
    const blocks = structuredDesign().blocks
    const first = composerToDesignDraft(blocks, scope)
    const second = composerToDesignDraft(blocks, scope)
    expect(first.blocks).toEqual(blocks)
    expect(first.lineage).toEqual(second.lineage)
    first.blocks.heading.data.props!.text = 'Different'
    expect(blocks.heading.data.props.text).toBe('Hello {{first_name}}')
  })
  it('preserves responsive overrides and locks rich text instead of flattening it', () => {
    const blocks: any = structuredDesign().blocks
    blocks.heading.data.props.text = '<strong>Offer</strong>'
    blocks.heading.data.mobile = { style: { fontSize: 18 }, props: { text: 'Mobile offer' } }
    const design = composerToDesignDraft(blocks, scope)
    expect(design.blocks).toEqual(blocks)
    expect(design.policy.editableFields).not.toContain('heading.data.props.text')
    const candidate = structuredClone(design)
    candidate.blocks.heading.data.props!.text = 'Flattened'
    expect(() => validateContentReturn(design, candidate)).toThrow()
  })
  it('retains mobile, lineage and style while applying supported CTA content', () => {
    const design = composerToDesignDraft(structuredDesign().blocks, scope)
    const candidate = structuredClone(design)
    candidate.blocks.cta.data.props!.text = 'Book a visit'
    candidate.blocks.cta.data.props!.url = 'https://example.com/book'
    expect(validateContentReturn(design, candidate)).toEqual(candidate)
    expect(candidate.lineage).toEqual(design.lineage)
  })
  it.each(['#anchor" onclick=bad', 'javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.com', 'https://example.com/"x'])('rejects unsafe changed CTA URL %s', (url) => {
    const design = composerToDesignDraft(structuredDesign().blocks, scope)
    const next = structuredClone(design)
    next.blocks.cta.data.props!.url = url
    expect(() => validateContentReturn(design, next)).toThrow()
  })
  it('rejects native changes to locks, structure, scope or field identities', () => {
    const base = composerToDesignDraft(structuredDesign().blocks, scope)
    for (const change of [
      (d: any) => { d.policy.editableFields = [] },
      (d: any) => { d.blocks.root.data.childrenIds.reverse() },
      (d: any) => { d.scope.clientId = null },
      (d: any) => { d.lineage[0].nodeId = 'replacement' }
    ]) {
      const next = structuredClone(base)
      change(next)
      expect(() => validateContentReturn(base, next)).toThrow()
    }
  })
  it('rejects unsafe integer values rather than rounding source data during conversion', () => {
    const source: any = structuredDesign().blocks
    source.root.data.props = { legacyNumber: 9007199254740992 }
    expect(() => composerToDesignDraft(source, scope)).toThrow()
  })
  it('classifies malformed and oversized legacy source as definite validation failures', () => {
    expect(() => composerToDesignDraft(undefined, scope)).toThrow('INVALID_DESIGN')
    expect(() => composerToDesignDraft({ text: 'a'.repeat(2 * 1024 * 1024) }, scope)).toThrow('LIMIT_EXCEEDED')
  })
  it('rejects orphan content and spare column slots rather than losing them', () => {
    const source: any = structuredDesign().blocks
    source.hidden = { type: 'Text', data: { props: { text: 'Do not lose me' } } }
    expect(() => composerToDesignDraft(source, scope)).toThrow()
  })
})
