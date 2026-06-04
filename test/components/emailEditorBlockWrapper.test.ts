import { describe, expect, it } from 'vitest'
import { createSSRApp, h, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EditorBlockWrapper from '~~/app/components/email/builder/EditorBlockWrapper.vue'

const testGlobals = globalThis as Record<string, unknown>

testGlobals.useEdmBuilder = () => ({
  selectedBlockId: ref('hero'),
  setSelectedBlockId: () => {}
})

const stubs = {
  UButton: {
    name: 'UButton',
    props: ['icon', 'title'],
    template: '<button v-bind="$attrs" :title="title"><i v-if="icon" :data-icon="icon" /><slot /></button>'
  },
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UPopover: { name: 'UPopover', template: '<div><slot /><slot name="content" /></div>' }
}

async function renderWrapper(props: Record<string, unknown> = {}) {
  const app = createSSRApp({
    render: () => h(
      EditorBlockWrapper,
      { blockId: 'hero', ...props },
      { default: () => h('p', 'Hero block') }
    )
  })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

describe('EditorBlockWrapper drag reorder affordance', () => {
  it('renders a draggable handle and drop indicator for selected root blocks', async () => {
    const html = await renderWrapper({ dropPlacement: 'before' })

    expect(html).toContain('data-edm-drag-handle')
    expect(html).toContain('draggable="true"')
    expect(html).toContain('data-icon="i-lucide-grip-vertical"')
    expect(html).toContain('drop-indicator-before')
    expect(html).toContain('Hero block')
  })
})
