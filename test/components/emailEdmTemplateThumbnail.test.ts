import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EdmTemplateThumbnail from '~~/app/components/email/builder/EdmTemplateThumbnail.vue'
import { EDM_STARTER_TEMPLATES } from '~~/app/utils/edmPresets'

async function renderThumbnail(templateId: string, width?: number) {
  const app = createSSRApp({
    render: () => h(EdmTemplateThumbnail, width ? { templateId, width } : { templateId })
  })
  return renderToString(app)
}

describe('EdmTemplateThumbnail', () => {
  it('renders the newsletter-digest template through the real block renderer', async () => {
    const html = await renderThumbnail('newsletter-digest')
    expect(html).toContain('Weekly digest')
    expect(html).toContain('Ready to launch?')
    expect(html).not.toContain('Unknown block')
  })

  it('renders the flash-sale template with its hero and discount copy', async () => {
    const html = await renderThumbnail('flash-sale')
    expect(html).toContain('Summer sale is on')
    expect(html).toContain('Take 15% off your first order')
    expect(html).not.toContain('Unknown block')
  })

  it('renders every starter template without an unknown-block fallback', async () => {
    for (const template of EDM_STARTER_TEMPLATES) {
      const html = await renderThumbnail(template.id)
      expect(html, `template ${template.id} should not render an unknown block`).not.toContain(
        'Unknown block'
      )
    }
  })

  it('scales the inner canvas down to fit the target width', async () => {
    const html = await renderThumbnail('newsletter-digest', 300)
    expect(html).toContain('width:600px')
    expect(html).toContain('scale(0.5)')
    expect(html).toContain('pointer-events:none')
  })
})
