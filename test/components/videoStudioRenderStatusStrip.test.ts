// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, createSSRApp, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VideoStudioRenderStatusStrip from '~~/app/components/media/VideoStudioRenderStatusStrip.vue'
import type { MediaRenderJob } from '~~/app/types'

const stubs = {
  UPopover: { template: '<div><slot /><slot name="content" /></div>' },
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UProgress: { name: 'UProgress', props: ['modelValue', 'max'], template: '<progress :value="modelValue" :max="max" />' },
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
    expect(html).toContain('Save to library')
    expect(html).toContain('Download 9:16 vertical')
  })

  it('shows no red alert for an earlier failure with unknown scope after a successful video export', async () => {
    const html = await render({ jobs: [
      job({ status: 'failed', channels: [], variants: {}, error: 'composite render failed: 500' }),
      job({ id: 'new', createdAt: '2026-06-20T02:00:00Z', variants: { reels_9x16: 'r.mp4' } })
    ] })
    expect(html).toContain('1 completed')
    expect(html).not.toContain('failed renders')
  })

  it('renders failure details and emits retry from the strip', async () => {
    const failed = job({
      id: 'failed-render',
      status: 'failed',
      variants: {},
      channels: ['square_1x1'],
      error: 'VIDEO_RENDER_QUEUE binding unavailable',
      createdAt: '2026-06-18T02:00:00Z',
    })
    const { app, host, events } = await mount({ jobs: [job(), failed, job({ id: 'older-failure', status: 'failed', error: null })] })

    try {
      expect(host.textContent).toContain('2 failed')
      expect(host.textContent).toContain('This export stopped without recording a reason.')
      expect(host.textContent).toContain('The export could not start because the render queue was unavailable.')
      expect(host.textContent).not.toContain('VIDEO_RENDER_QUEUE')
      expect(host.textContent).toContain('Requested outputs · 1:1 feed')

      ;([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Retry 1:1 feed')) as HTMLButtonElement).click()
      await nextTick()

      expect(events).toHaveLength(1)
      expect(events[0].name).toBe('retry')
      expect((events[0].payload as MediaRenderJob).id).toBe('failed-render')
      ;([...host.querySelectorAll('button')].find(button => button.textContent === 'Dismiss alert') as HTMLButtonElement).click()
      await nextTick()
      expect(host.textContent).toContain('1 failed')
      expect(host.textContent).not.toContain('render queue was unavailable')
      expect(host.textContent).toContain('This export stopped without recording a reason.')
    } finally {
      app.unmount()
    }
  })
})

describe('measured export stages', () => {
  it.each([
    ['capturing', { framesDone: 15, framesTotal: 30 }, 'Preparing artwork', '15 of 30 frames', '15', '30'],
    ['encoding', { encodedTimeMs: 12000, durationMs: 40200 }, 'Encoding video', '12.0 of 40.2 seconds', '12000', '40200'],
    ['uploading', { bytesDone: 1048576, bytesTotal: 2097152 }, 'Saving video', '1.0 of 2.0 MB', '1048576', '2097152'],
  ])('shows measured %s counters separately from completed formats', async (stage, counters, label, detail, value, max) => {
    const html = await render({ jobs: [job({ status: 'rendering', progress: { stage, ...counters, formatKey: 'reels_9x16', done: 0, total: 2, updatedAt: '2026-11-20T00:00:00Z' } as any })] })
    expect(html).toContain(label)
    expect(html).toContain(detail)
    expect(html).toContain(`value="${value}"`)
    expect(html).toContain(`max="${max}"`)
    expect(html).toContain('0 of 2 formats ready')
  })
  it('keeps terminal jobs free from stale active counters', async () => {
    const html = await render({ jobs: [job({ progress: { stage: 'encoding', encodedTimeMs: 12000, durationMs: 40200, done: 0, total: 1, formatKey: 'reels_9x16', updatedAt: '' } as any })] })
    expect(html).not.toContain('Encoding video')
    expect(html).not.toContain('<progress')
  })
})
