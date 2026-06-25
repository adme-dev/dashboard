// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, createSSRApp, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VideoStudioRenderStatusStrip from '~~/app/components/media/VideoStudioRenderStatusStrip.vue'
import type { MediaRenderJob } from '~~/app/types'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span>{{ label }}</span>' },
  UButton: {
    name: 'UButton',
    props: ['icon', 'label', 'to', 'disabled', 'loading'],
    emits: ['click'],
    template: '<a v-if="to" :href="to"><slot />{{ label }}</a><button v-else :disabled="disabled" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>',
  },
  UDropdownMenu: { name: 'UDropdownMenu', props: ['items'], template: '<div><slot /></div>' },
}

function job(overrides: Partial<MediaRenderJob> = {}): MediaRenderJob {
  return {
    id: 'render-1',
    timelineId: 'timeline-1',
    projectId: 'project-1',
    channels: ['video'],
    status: 'done',
    variants: { reels_9x16: 'renders/reels.mp4', square_1x1: 'renders/square.mp4' },
    costCents: null,
    error: null,
    requestedBy: 'user-1',
    createdAt: '2026-06-18T00:00:00Z',
    updatedAt: '2026-06-18T00:01:00Z',
    ...overrides,
  }
}

async function render(props: Record<string, unknown>) {
  const app = createSSRApp({ render: () => h(VideoStudioRenderStatusStrip, { projectId: 'project-1', ...props }) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

async function mount(props: Record<string, unknown>) {
  const events: Array<{ name: string, payload: unknown }> = []
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(VideoStudioRenderStatusStrip, {
      projectId: 'project-1',
      ...props,
      onRetry: (value: MediaRenderJob) => events.push({ name: 'retry', payload: value }),
      onPublish: (value: MediaRenderJob, format: string) => events.push({ name: 'publish', payload: { value, format } }),
      onSendToPortal: (value: MediaRenderJob, format: string) => events.push({ name: 'send-to-portal', payload: { value, format } }),
      onSaveAsset: (value: MediaRenderJob, format: string) => events.push({ name: 'save-asset', payload: { value, format } }),
    })
  })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  app.mount(host)
  await nextTick()
  return { app, host, events }
}

describe('VideoStudioRenderStatusStrip', () => {
  it('renders compact completed variants with output actions', async () => {
    const html = await render({ jobs: [job()] })

    expect(html).toContain('Render queue')
    expect(html).toContain('1 completed')
    expect(html).toContain('reels_9x16')
    expect(html).toContain('square_1x1')
    expect(html).toContain('/api/agency/audio/projects/project-1/renders/render-1/reels_9x16')
    expect(html).toContain('Publish')
    expect(html).toContain('Portal')
    expect(html).toContain('Library')
  })

  it('renders failure details and emits retry from the strip', async () => {
    const failed = job({
      id: 'failed-render',
      status: 'failed',
      variants: {},
      error: 'VIDEO_RENDER_QUEUE binding unavailable',
      createdAt: '2026-06-18T02:00:00Z',
    })
    const { app, host, events } = await mount({ jobs: [failed] })

    try {
      expect(host.textContent).toContain('Render failed')
      expect(host.textContent).toContain('VIDEO_RENDER_QUEUE binding unavailable')

      ;([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Retry')) as HTMLButtonElement).click()
      await nextTick()

      expect(events).toHaveLength(1)
      expect(events[0].name).toBe('retry')
      expect((events[0].payload as MediaRenderJob).id).toBe('failed-render')
    } finally {
      app.unmount()
    }
  })
})
