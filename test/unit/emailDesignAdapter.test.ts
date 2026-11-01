import { describe, expect, it } from 'vitest'
import { designToRendererDocument } from '../../shared/emailRendering/designAdapter'
import {
  structuredDesign,
  type MutableDesignFixture
} from '../fixtures/email-design/structured'
import { testEmailRenderer } from '../fixtures/emailRenderer'

describe('canonical design to existing renderer adapter', () => {
  it('preserves IDs, tokens and working CTA URLs through the private renderer', async () => {
    const input = structuredDesign()
    const { document } = designToRendererDocument(input)
    expect(document.heading.data.props!.text).toBe('Hello {{first_name}}')
    const html = await testEmailRenderer.renderDocument(document)
    expect(html).toContain('Hello {{first_name}}')
    expect(html).toContain('https://example.com/offer')
    expect(html).toContain('View offer')
    input.blocks.cta.data.props.url = 'https://example.com/changed'
    expect(document.cta.data.props!.url).toBe('https://example.com/offer')
  })
  it('renders a standalone module without subject or campaign footer', async () => {
    const input: MutableDesignFixture = structuredDesign()
    input.kind = 'module'
    delete input.blocks.root
    input.rootChildrenIds = ['heading', 'cta']
    const { document } = designToRendererDocument(input)
    expect(document.root.data.childrenIds).toEqual(['heading', 'cta'])
    expect(await testEmailRenderer.renderDocument(document)).toContain(
      'View offer'
    )
  })
  it('blocks unsupported canvas nodes instead of silently dropping them', () => {
    const input = structuredDesign()
    input.blocks.heading.type = 'FreeformCanvas'
    expect(() => designToRendererDocument(input)).toThrow()
  })
  it('preserves bounded legacy HTML as HTML, without declaring native layers', async () => {
    const input: MutableDesignFixture = structuredDesign()
    input.blocks.heading = {
      type: 'Html',
      data: { props: { contents: '<p>Legacy special offer</p>' } }
    }
    input.policy.editableFields = input.policy.editableFields.filter(
      (path: string) => !path.startsWith('heading.')
    )
    const { document, capabilities } = designToRendererDocument(input)
    expect(document.heading.type).toBe('Html')
    expect(
      capabilities.blocks.find(block => block.blockId === 'heading')
        ?.disposition
    ).toBe('design-only')
    expect(await testEmailRenderer.renderDocument(document)).toContain(
      'Legacy special offer'
    )
  })
  it('rejects policy promises that the conversion cannot honour', () => {
    const input = structuredDesign()
    input.blocks.heading.type = 'Html'
    expect(() => designToRendererDocument(input)).toThrow()
  })
  it('does not overwrite a module block named root when adding a layout wrapper', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.kind = 'module'
    input.blocks = {
      root: { type: 'Text', data: { props: { text: 'Must survive' } } }
    }
    input.rootChildrenIds = ['root']
    input.lineage = []
    input.policy.editableFields = []
    expect(() => designToRendererDocument(input)).toThrow()
  })
})
