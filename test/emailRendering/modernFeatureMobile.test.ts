import { describe, expect, it } from 'vitest'
import { renderTemplateDocumentLocally } from '~~/workers/email-rendering/src/render/document'
import { buildStarterTemplateDocument } from '~~/app/utils/edmPresets'
describe('modern email feature stacking', () => {
  it('exports explicit mobile columns as stackable cells rather than squeezing two columns', () => {
    const document = buildStarterTemplateDocument('modern-studio-welcome')
    const html = renderTemplateDocumentLocally(document)
    expect(html.match(/class="edm-feature-stack"/g)).toHaveLength(2)
    expect(html).toContain('.edm-feature-stack { display: block !important; width: 100% !important;')
    expect(html).toMatch(/\.edm-r-[^ ]+ > td \{ [^}]*padding:/)
    expect(html).toMatch(/\.edm-r-[^ ]+ h1[^}]*font-size: 32px !important;/)
    for (const block of Object.values(document)) if (block.type === 'feature-grid') delete block.data.mobile
    expect(renderTemplateDocumentLocally(document)).not.toContain('class="edm-feature-stack"')
  })
})
