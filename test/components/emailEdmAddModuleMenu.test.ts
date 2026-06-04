import { describe, expect, it } from 'vitest'
import { computed, createSSRApp, h, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EdmAddModuleMenu from '~~/app/components/email/builder/EdmAddModuleMenu.vue'
import { EDM_SECTION_CATEGORIES } from '~~/app/utils/edmPresets'

// The component relies on Nuxt auto-imports for ref/computed; expose them as
// globals so it renders in a bare SSR app.
;(globalThis as Record<string, unknown>).ref = ref
;(globalThis as Record<string, unknown>).computed = computed

// Stub the auto-imported children Nuxt would resolve at runtime so the
// component can render in a bare SSR app.
const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  EmailBuilderEdmSectionThumbnail: {
    name: 'EmailBuilderEdmSectionThumbnail',
    props: ['preset', 'width'],
    template: '<div class="thumb" :data-preset="preset?.id" />'
  }
}

async function render() {
  const app = createSSRApp({
    render: () => h(EdmAddModuleMenu)
  })
  app.config.globalProperties = app.config.globalProperties || {}
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

describe('EdmAddModuleMenu', () => {
  it('defaults to the Basic category and renders a compact icon grid of basic presets', async () => {
    const html = await render()
    const basic = EDM_SECTION_CATEGORIES.find(c => c.id === 'basic')!
    // Basic grid container present.
    expect(html).toContain('grid-cols-3')
    // Each basic preset name + its icon appear in the grid.
    for (const preset of basic.presets) {
      expect(html).toContain(preset.name)
      expect(html).toContain(`data-icon="${preset.icon}"`)
    }
    // Default-Basic view should not pre-render section thumbnails.
    expect(html).not.toContain('class="thumb"')
  })

  it('renders every category label in the mini rail', async () => {
    const html = await render()
    for (const category of EDM_SECTION_CATEGORIES) {
      expect(html).toContain(category.label)
    }
  })
})
