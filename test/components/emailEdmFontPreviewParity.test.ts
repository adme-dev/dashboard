import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EdmBlockRenderer from '~~/app/components/email/builder/EdmBlockRenderer.vue'
import { FONT_FAMILY_MAP, previewFontFamily, resolveFontFamily } from '~~/shared/emailRendering/fonts'
import { resolveFontFamily as resolveFromWorkerTypes } from '~~/workers/email-rendering/src/render/blocks/types'
import { renderTemplateDocumentLocally as renderTemplateDocument } from '~~/workers/email-rendering/src/render/document'

const MODERN_SANS = '"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif'
const GEOMETRIC_SANS = 'Avenir, "Avenir Next LT Pro", Montserrat, Corbel, "URW Gothic", source-sans-pro, sans-serif'

async function renderBlock(type: string, blockProps: Record<string, unknown>, style?: Record<string, unknown>) {
  const app = createSSRApp({
    render: () => h(EdmBlockRenderer, { type, props: blockProps, style })
  })
  app.component('UIcon', { props: ['name'], template: '<span :data-icon="name" />' })
  return renderToString(app)
}

describe('EDM preview font parity', () => {
  it('keeps the Worker re-export identical to the shared map', () => {
    expect(resolveFromWorkerTypes('MODERN_SANS')).toBe(MODERN_SANS)
    expect(resolveFromWorkerTypes('GEOMETRIC_SANS')).toBe(GEOMETRIC_SANS)
    for (const key of Object.keys(FONT_FAMILY_MAP)) {
      expect(resolveFromWorkerTypes(key)).toBe(resolveFontFamily(key))
      expect(resolveFromWorkerTypes(key)).toBe(FONT_FAMILY_MAP[key])
    }
    expect(resolveFromWorkerTypes(undefined)).toBe(MODERN_SANS)
    expect(resolveFromWorkerTypes(null)).toBe(MODERN_SANS)
    expect(resolveFromWorkerTypes('')).toBe(MODERN_SANS)
    expect(resolveFromWorkerTypes('Not A Key')).toBe(MODERN_SANS)
    expect(resolveFromWorkerTypes('Not A Key', 'Georgia, serif')).toBe('Georgia, serif')
  })

  it('keeps the sent email on the expanded sans stack', () => {
    const html = renderTemplateDocument({
      root: { type: 'EmailLayout', data: { props: { fontFamily: 'MODERN_SANS' }, childrenIds: ['h'] } },
      h: { type: 'Heading', data: { props: { level: 'h2', text: 'Parity' }, style: { fontFamily: 'MODERN_SANS' } } }
    })
    expect(html).toContain("font-family: 'Helvetica Neue', 'Arial Nova', 'Nimbus Sans', Arial, sans-serif;")
    expect(html).not.toContain('font-family:MODERN_SANS')
    expect(html).not.toContain('font-family: "Helvetica Neue"')
  })

  it('resolves stored keys in the canvas and leaves real CSS stacks alone', async () => {
    const heading = await renderBlock('Heading', { text: 'Drive', level: 'h2' }, { fontFamily: 'MODERN_SANS' })
    expect(heading).toContain('Helvetica Neue')
    expect(heading).toContain('sans-serif')
    expect(heading).not.toContain('font-family:MODERN_SANS')

    const button = await renderBlock('Button', { text: 'Book a test drive', url: 'https://example.com' }, { fontFamily: 'GEOMETRIC_SANS' })
    expect(button).toContain('Avenir')
    expect(button).toContain('sans-serif')
    expect(button).not.toContain('font-family:GEOMETRIC_SANS')

    const imported = await renderBlock('Text', { text: 'Imported' }, { fontFamily: "'Times New Roman', Times, serif" })
    expect(imported).toContain('Times New Roman')
    expect(imported).toContain('serif')

    const unset = await renderBlock('Heading', { text: 'Unset', level: 'h2' }, {})
    expect(unset).not.toContain('font-family:')

    expect(previewFontFamily('MODERN_SANS')).toBe(MODERN_SANS)
    expect(previewFontFamily('')).toBeUndefined()
    expect(previewFontFamily(null)).toBeUndefined()
    expect(previewFontFamily('Arial, sans-serif')).toBe('Arial, sans-serif')
  })
})
