// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, createSSRApp, h, nextTick } from 'vue'
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

async function render(clip: any = {
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
}) {
  const app = createSSRApp({
    render: () => h(VideoStudioClipInspector, {
      clip,
    })
  })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

async function mount(clip: any, canSplit = true) {
  const events: Array<{ name: string, payload: unknown }> = []
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(VideoStudioClipInspector, {
      clip,
      canSplit,
      onSplit: () => events.push({ name: 'split', payload: null }),
      onDelete: () => events.push({ name: 'delete', payload: null }),
      onSetCaptionStyle: (style: string) => events.push({ name: 'set-caption-style', payload: style }),
    })
  })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  app.mount(host)
  await nextTick()
  return { app, host, events }
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

  it('renders caption style preset controls for caption clips', async () => {
    const html = await render({
      clipId: 'cap1',
      kind: 'caption',
      trackId: 'captions',
      trackName: 'Captions',
      trackKind: 'caption',
      label: 'Caption clip',
      sourceLabel: 'Drive away today',
      startSec: 0,
      durationSec: 3,
      endSec: 3,
      captionStyle: 'bold_social',
      details: [
        { label: 'Track', value: 'Captions' },
        { label: 'Style', value: 'bold social' },
      ],
    })

    expect(html).toContain('Caption style')
    expect(html).toContain('Platform')
    expect(html).toContain('Bold social')
    expect(html).toContain('Subtitle-safe')
  })

  it('emits edit actions for the selected clip context', async () => {
    const { app, host, events } = await mount({
      clipId: 'cap1',
      kind: 'caption',
      trackId: 'captions',
      trackName: 'Captions',
      trackKind: 'caption',
      label: 'Caption clip',
      sourceLabel: 'Drive away today',
      startSec: 0,
      durationSec: 3,
      endSec: 3,
      captionStyle: 'platform_default',
      details: [{ label: 'Track', value: 'Captions' }],
    })

    try {
      ;([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Split')) as HTMLButtonElement).click()
      ;([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Delete')) as HTMLButtonElement).click()
      ;([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Bold social')) as HTMLButtonElement).click()
      await nextTick()

      expect(events).toEqual([
        { name: 'split', payload: null },
        { name: 'delete', payload: null },
        { name: 'set-caption-style', payload: 'bold_social' },
      ])
    } finally {
      app.unmount()
    }
  })
})
