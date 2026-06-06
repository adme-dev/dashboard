import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EdmTemplateThumbnail from '~~/app/components/email/builder/EdmTemplateThumbnail.vue'
import { EDM_STARTER_TEMPLATES } from '~~/app/utils/edmPresets'

const iconStub = { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' }

async function renderThumbnail(templateId: string, width?: number) {
  const app = createSSRApp({
    render: () => h(EdmTemplateThumbnail, width ? { templateId, width } : { templateId })
  })
  app.component('UIcon', iconStub)
  return renderToString(app)
}

describe('EdmTemplateThumbnail', () => {
  it('keeps the existing starter library and appends imported Postcards templates', () => {
    const ids = EDM_STARTER_TEMPLATES.map(template => template.id)
    expect(ids).toContain('newsletter-digest')
    expect(ids).toContain('flash-sale')
    expect(ids).toContain('postcards-glidex')
    expect(ids).toContain('postcards-futurax')
    expect(ids).toContain('postcards-aviro')
    expect(ids).not.toContain('postcards-metahome')
  })

  it('renders the GlideX template through the real block renderer', async () => {
    const html = await renderThumbnail('postcards-glidex')
    expect(html).toContain('Drive smarter')
    expect(html).toContain('Claim Your Offer Now')
    expect(html).not.toContain('Unknown block')
  })

  it('renders the Aviro template built from the downloaded asset folder', async () => {
    const html = await renderThumbnail('postcards-aviro')
    expect(html).toContain('Fresh ')
    expect(html).toContain('bicycle')
    expect(html).toContain('models now in stock')
    expect(html).toContain('In the shopping cart')
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
    const html = await renderThumbnail('postcards-glidex', 300)
    expect(html).toContain('width:600px')
    expect(html).toContain('scale(0.5)')
    expect(html).toContain('pointer-events:none')
  })

  it('keys rendered starter blocks by document block id, not array index', () => {
    const source = readFileSync(
      new URL('../../app/components/email/builder/EdmTemplateThumbnail.vue', import.meta.url),
      'utf8'
    )

    expect(source).toContain(':key="entry.id"')
    expect(source).not.toContain(':key="i"')
  })
})
