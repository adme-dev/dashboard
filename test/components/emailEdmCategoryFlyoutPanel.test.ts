import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EdmCategoryFlyoutPanel from '~~/app/components/email/builder/EdmCategoryFlyoutPanel.vue'
import { EDM_SECTION_CATEGORIES } from '~~/app/utils/edmPresets'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  EmailBuilderEdmSectionThumbnail: {
    name: 'EmailBuilderEdmSectionThumbnail',
    props: ['preset', 'width', 'maxHeight'],
    template: '<div class="thumb" :data-preset="preset?.id" :data-width="width" :data-max-height="maxHeight" />'
  }
}

async function render(categoryId = 'header') {
  const category = EDM_SECTION_CATEGORIES.find(c => c.id === categoryId)
  if (!category) throw new Error(`Category not found: ${categoryId}`)

  const app = createSSRApp({
    render: () => h(EdmCategoryFlyoutPanel, { category })
  })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  return renderToString(app)
}

describe('EdmCategoryFlyoutPanel', () => {
  it('renders a top-docked rich preset flyout for a selected category', async () => {
    const html = await render('header')

    expect(html).toContain('data-edm-category-flyout')
    expect(html).toContain('data-layout="top-docked"')
    expect(html).toContain('Header')
    expect(html).toContain('HEADER 1')
    expect(html).toContain('HEADER 2')
    expect(html).toContain('data-preset="header-logo-menu"')
    expect(html).toContain('data-width="360"')
    expect(html).toContain('data-max-height="420"')
  })

  it('renders Basic modules as a compact top-docked quick-add grid', async () => {
    const html = await render('basic')

    expect(html).toContain('Basic Modules')
    expect(html).toContain('grid-cols-2')
    expect(html).toContain('data-icon="i-lucide-type"')
    expect(html).not.toContain('class="thumb"')
  })
})
