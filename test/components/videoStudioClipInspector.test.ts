import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VideoStudioClipInspector from '~~/app/components/media/VideoStudioClipInspector.vue'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UButton: {
    name: 'UButton',
    props: ['icon', 'label'],
    emits: ['click'],
    template: '<button @click="$emit(\'click\', $event)"><slot />{{ label }}</button>',
  },
}

async function render() {
  const app = createSSRApp({
    render: () => h(VideoStudioClipInspector, {
      clip: {
        clipId: 'v1',
        kind: 'video',
        trackId: 'video',
        trackName: 'Video',
        trackKind: 'video',
        label: 'Footage clip',
        sourceLabel: 'media/hero.mp4',
        startSec: 0,
        durationSec: 5,
        endSec: 5,
        details: [
          { label: 'Track', value: 'Video' },
          { label: 'Duration', value: '5s' },
          { label: 'Effects', value: '1' },
        ],
      },
    })
  })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

describe('VideoStudioClipInspector', () => {
  it('renders selected clip details and edit actions', async () => {
    const html = await render()

    expect(html).toContain('Selected clip')
    expect(html).toContain('Footage clip')
    expect(html).toContain('media/hero.mp4')
    expect(html).toContain('Duration')
    expect(html).toContain('Split')
    expect(html).toContain('Delete')
  })
})
