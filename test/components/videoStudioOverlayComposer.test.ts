import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VideoStudioOverlayComposer from '~~/app/components/media/VideoStudioOverlayComposer.vue'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UButton: {
    name: 'UButton',
    props: ['icon', 'label', 'disabled', 'loading'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
  },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span>{{ label }}</span>' },
  UInput: { name: 'UInput', props: ['modelValue', 'placeholder'], emits: ['update:modelValue'], template: '<input :value="modelValue" :placeholder="placeholder" />' },
  UFormField: { name: 'UFormField', props: ['label'], template: '<label><span>{{ label }}</span><slot /></label>' },
  USkeleton: { name: 'USkeleton', template: '<div />' },
}

async function render(props: Record<string, unknown>) {
  const app = createSSRApp({ render: () => h(VideoStudioOverlayComposer, props) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

describe('VideoStudioOverlayComposer', () => {
  it('renders Banner Studio projects and available formats', async () => {
    const html = await render({
      projects: [{
        id: 'banner-1',
        name: 'EOFY offer overlay',
        clientName: 'Knox GWM',
        status: 'ready',
        canvasData: {
          reels_9x16: { layers: [] },
          square_1x1: { layers: [] },
        },
      }],
      loading: false,
    })

    expect(html).toContain('Overlay')
    expect(html).toContain('EOFY offer overlay')
    expect(html).toContain('Knox GWM')
    expect(html).toContain('2 formats')
    expect(html).toContain('reels_9x16')
    expect(html).toContain('reels_9x16 · 0 layers')
    expect(html).toContain('Start')
    expect(html).toContain('Duration')
    expect(html).toContain('Add overlay')
  })

  it('renders replacement action for a selected overlay clip', async () => {
    const html = await render({
      selectedOverlayClip: { clipId: 'overlay-1', startSec: 1, durationSec: 4 },
      projects: [{
        id: 'banner-1',
        name: 'Lower third',
        status: 'ready',
        canvasData: { reels_9x16: { layers: [{ type: 'text' }] } },
      }],
      loading: false,
    })

    expect(html).toContain('Replace selected overlay')
    expect(html).toContain('reels_9x16 · 1 layers')
  })

  it('renders an empty state without projects', async () => {
    const html = await render({ projects: [], loading: false })
    expect(html).toContain('No overlays found')
  })
})
