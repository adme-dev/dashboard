import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VideoStudioWorkbench from '~~/app/components/media/VideoStudioWorkbench.vue'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UButton: {
    name: 'UButton',
    props: ['icon', 'label', 'disabled'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
  },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span>{{ label }}</span>' }
}

async function render(props: Record<string, unknown>, slots: Record<string, () => unknown> = {}) {
  const app = createSSRApp({ render: () => h(VideoStudioWorkbench, props, slots) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

describe('VideoStudioWorkbench', () => {
  it('renders the core studio regions and supplied slots', async () => {
    const html = await render({
      currentTimeSec: 7,
      durationSec: 32,
      assetCount: 5,
      generationJobCount: 2,
      renderJobCount: 1,
      generationEnabled: true,
      rendering: false
    }, {
      library: () => h('p', 'Library filters'),
      preview: () => h('p', 'Preview canvas'),
      producer: () => h('p', 'Producer rail'),
      details: () => h('p', 'AI Producer details')
    })

    expect(html).toContain('Video Studio')
    expect(html).toContain('Library filters')
    expect(html).toContain('Preview canvas')
    expect(html).toContain('Producer rail')
    expect(html).toContain('AI Producer details')
    expect(html).toContain('5 assets')
    expect(html).toContain('2 AI jobs')
    expect(html).toContain('1 render')
  })
})
