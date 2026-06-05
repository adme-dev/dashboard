import { describe, expect, it } from 'vitest'
import { computed, createSSRApp, h, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EdmAddModuleMenu from '~~/app/components/email/builder/EdmAddModuleMenu.vue'
import { EDM_SECTION_CATEGORIES } from '~~/app/utils/edmPresets'
import type { EdmCustomModule } from '~~/app/composables/useEdmCustomModules'

// The component relies on Nuxt auto-imports for ref/computed/onMounted and the
// useEdmCustomModules composable; expose them as globals so it renders in a bare
// SSR app. The composable is stubbed with an empty module list.
;(globalThis as Record<string, unknown>).ref = ref
;(globalThis as Record<string, unknown>).computed = computed
;(globalThis as Record<string, unknown>).onMounted = () => {}
let customModuleFixture: EdmCustomModule[] = []
;(globalThis as Record<string, unknown>).useEdmCustomModules = () => ({
  modules: ref(customModuleFixture),
  loading: ref(false),
  loaded: ref(false),
  load: () => {},
  save: async () => ({}),
  rename: async () => ({}),
  remove: async () => {}
})

// Stub the auto-imported children Nuxt would resolve at runtime so the
// component can render in a bare SSR app.
const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UButton: { name: 'UButton', props: ['icon', 'label'], template: '<button><slot />{{ label }}</button>' },
  UTooltip: { name: 'UTooltip', props: ['text'], template: '<span><slot /></span>' },
  EmailBuilderEdmSectionThumbnail: {
    name: 'EmailBuilderEdmSectionThumbnail',
    props: ['preset', 'width'],
    template: '<div class="thumb" :data-preset="preset?.id" />'
  }
}

function moduleFixture(id: string, name: string, category: string): EdmCustomModule {
  return {
    id,
    name,
    description: null,
    category,
    blocks: { blocks: {}, rootChildrenIds: [] },
    preview_tone: 'light',
    client_id: null,
    created_by: null,
    created_at: '2026-06-05T00:00:00.000Z',
    updated_at: '2026-06-05T00:00:00.000Z'
  }
}

async function render(props: Record<string, unknown> = {}, modules: EdmCustomModule[] = []) {
  customModuleFixture = modules
  const app = createSSRApp({
    render: () => h(EdmAddModuleMenu, props)
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

  it('renders a Custom Modules rail entry', async () => {
    const html = await render()
    expect(html).toContain('Custom Modules')
  })

  it('groups saved custom modules by category inside the Custom Modules pane', async () => {
    const html = await render({ initialCategoryId: '__custom__' }, [
      moduleFixture('brand-header', 'Brand Header', 'header'),
      moduleFixture('offer-card', 'Offer Card', 'dealer-specials'),
      moduleFixture('legal-footer', 'Legal Footer', 'footer')
    ])

    expect(html).toContain('Header')
    expect(html).toContain('Brand Header')
    expect(html).toContain('Footer')
    expect(html).toContain('Legal Footer')
    expect(html).toContain('Dealer Specials')
    expect(html).toContain('Offer Card')
  })
})
