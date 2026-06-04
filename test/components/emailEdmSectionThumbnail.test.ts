import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EdmSectionThumbnail from '~~/app/components/email/builder/EdmSectionThumbnail.vue'
import { findSectionPreset } from '~~/app/utils/edmPresets'

async function renderThumbnail(presetId: string) {
  const preset = findSectionPreset(presetId)
  if (!preset) throw new Error(`Preset not found: ${presetId}`)
  const app = createSSRApp({
    render: () => h(EdmSectionThumbnail, { preset })
  })
  return renderToString(app)
}

describe('EdmSectionThumbnail', () => {
  it('renders the header-logo-menu preset through the real block renderer', async () => {
    const html = await renderThumbnail('header-logo-menu')
    expect(html).toContain('Your brand')
    expect(html).toContain('Work')
    expect(html).not.toContain('Unknown block')
  })

  it('renders a hero-section preset heading', async () => {
    const html = await renderThumbnail('hero-dark-product')
    expect(html).toContain('Limited-time offer')
    expect(html).not.toContain('Unknown block')
  })

  it('renders a feature-grid preset', async () => {
    const html = await renderThumbnail('feature-icon-grid')
    expect(html).toContain('Plan')
    expect(html).not.toContain('Unknown block')
  })

  it('scales the inner canvas down to fit the target width', async () => {
    const preset = findSectionPreset('header-logo-menu')!
    const app = createSSRApp({
      render: () => h(EdmSectionThumbnail, { preset, width: 300 })
    })
    const html = await renderToString(app)
    // inner canvas computed at full email width then visually shrunk
    expect(html).toContain('width:600px')
    expect(html).toContain('scale(0.5)')
    expect(html).toContain('pointer-events:none')
  })
})
