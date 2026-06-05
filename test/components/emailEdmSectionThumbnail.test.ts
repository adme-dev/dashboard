import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EdmSectionThumbnail from '~~/app/components/email/builder/EdmSectionThumbnail.vue'
import { EDM_SECTION_CATEGORIES, findSectionPreset } from '~~/app/utils/edmPresets'

async function renderThumbnail(presetId: string) {
  const preset = findSectionPreset(presetId)
  if (!preset) throw new Error(`Preset not found: ${presetId}`)
  const app = createSSRApp({
    render: () => h(EdmSectionThumbnail, { preset })
  })
  return renderToString(app)
}

describe('EdmSectionThumbnail', () => {
  it('adds imported Postcards sections to the module library', async () => {
    const imported = EDM_SECTION_CATEGORIES.find(category => category.id === 'imported')
    expect(imported?.presets.map(preset => preset.id)).toContain('postcards-glidex-02-hero')

    const html = await renderThumbnail('postcards-glidex-02-hero')
    expect(html).toContain('Drive smarter')
    expect(html).not.toContain('Unknown block')
  })

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

  it('renders every preset across every category without an unknown-block fallback', async () => {
    const allPresets = EDM_SECTION_CATEGORIES.flatMap(category => category.presets)
    // Guard: the three presets that previously fell through to "Unknown block".
    const ids = allPresets.map(preset => preset.id)
    expect(ids).toContain('basic-container')
    expect(ids).toContain('basic-columns-container')
    expect(ids).toContain('transactional-next-steps')

    for (const preset of allPresets) {
      const html = await renderThumbnail(preset.id)
      expect(html, `preset ${preset.id} should not render an unknown block`).not.toContain(
        'Unknown block'
      )
    }
  })

  it('scales the inner canvas down without reserving unscaled layout height', async () => {
    const preset = findSectionPreset('header-logo-menu')!
    const app = createSSRApp({
      render: () => h(EdmSectionThumbnail, { preset, width: 300 })
    })
    const html = await renderToString(app)
    // The inner canvas renders at full email width, but uses layout-affecting
    // zoom so the flyout tile does not keep the unscaled section height.
    expect(html).toContain('width:600px')
    expect(html).toContain('zoom:0.5')
    expect(html).not.toContain('transform:scale')
    expect(html).toContain('pointer-events:none')
  })

  it('can render a transparent preview shell for dark flyout panels', async () => {
    const preset = findSectionPreset('postcards-glidex-02-hero')!
    const app = createSSRApp({
      render: () => h(EdmSectionThumbnail, { preset, surface: 'transparent' })
    })
    const html = await renderToString(app)
    expect(html).toContain('edm-section-thumbnail')
    expect(html).toContain('bg-transparent')
    expect(html).not.toContain('edm-section-thumbnail relative overflow-hidden rounded-md border border-default bg-white')
  })
})
