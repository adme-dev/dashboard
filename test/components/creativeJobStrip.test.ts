// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import CreativeJobStrip from '~~/app/components/creative/CreativeJobStrip.vue'
import type { CreativeJobSummary } from '~~/app/utils/creative/jobSummary'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span>{{ label }}</span>' }
}

const summary: CreativeJobSummary = {
  counts: {
    total: 5,
    queued: 1,
    running: 1,
    ready: 1,
    failed: 1,
    blocked: 1,
    active: 2,
    completed: 1,
    attention: 2
  },
  latest: null,
  items: [
    {
      id: 'generation:generation-1',
      source: 'video_generation_jobs',
      sourceId: 'generation-1',
      kind: 'generation',
      status: 'running',
      retryable: false,
      label: 'Vehicle walkaround',
      createdAt: '2026-06-26T10:03:00.000Z',
      updatedAt: null,
      error: null,
      metadata: {}
    },
    {
      id: 'audio:audio-1',
      source: 'audio_assets',
      sourceId: 'audio-1',
      kind: 'audio',
      status: 'queued',
      retryable: false,
      label: 'Music asset',
      createdAt: '2026-06-26T10:02:00.000Z',
      updatedAt: null,
      error: null,
      metadata: {}
    },
    {
      id: 'render:render-1',
      source: 'media_render_jobs',
      sourceId: 'render-1',
      kind: 'render',
      status: 'failed',
      retryable: true,
      label: 'Render render-1',
      createdAt: '2026-06-26T10:01:00.000Z',
      updatedAt: null,
      error: 'runtime_not_ready after 2500ms',
      metadata: {}
    },
    {
      id: 'generation:generation-2',
      source: 'video_generation_jobs',
      sourceId: 'generation-2',
      kind: 'generation',
      status: 'blocked',
      retryable: false,
      label: 'Unsupported generation',
      createdAt: '2026-06-26T10:00:00.000Z',
      updatedAt: null,
      error: 'missing approved source asset',
      metadata: {}
    },
    {
      id: 'render:render-2',
      source: 'media_render_jobs',
      sourceId: 'render-2',
      kind: 'render',
      status: 'ready',
      retryable: false,
      label: 'Render reels_9x16',
      createdAt: '2026-06-26T09:59:00.000Z',
      updatedAt: null,
      error: null,
      metadata: {}
    }
  ]
}

async function render(props: Record<string, unknown>) {
  const app = createSSRApp({ render: () => h(CreativeJobStrip, props) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  return renderToString(app)
}

describe('CreativeJobStrip', () => {
  it('renders active, attention, and completed creative job groups', async () => {
    const html = await render({ summary })

    expect(html).toContain('Creative jobs')
    expect(html).toContain('2 active')
    expect(html).toContain('2 need attention')
    expect(html).toContain('1 completed')
    expect(html).toContain('Vehicle walkaround')
    expect(html).toContain('Music asset')
    expect(html).toContain('Render render-1')
    expect(html).toContain('runtime_not_ready after 2500ms')
    expect(html).toContain('Unsupported generation')
    expect(html).toContain('missing approved source asset')
    expect(html).toContain('Render reels_9x16')
  })

  it('renders an idle state when there are no creative jobs', async () => {
    const html = await render({
      summary: {
        items: [],
        latest: null,
        counts: {
          total: 0,
          queued: 0,
          running: 0,
          ready: 0,
          failed: 0,
          blocked: 0,
          active: 0,
          completed: 0,
          attention: 0
        }
      }
    })

    expect(html).toContain('Creative jobs')
    expect(html).toContain('No creative jobs')
  })
})
