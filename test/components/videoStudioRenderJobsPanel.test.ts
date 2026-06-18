import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VideoStudioRenderJobsPanel from '~~/app/components/media/VideoStudioRenderJobsPanel.vue'
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
  const app = createSSRApp({ render: () => h(VideoStudioRenderJobsPanel, { projectId: 'project-1', ...props }) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

describe('VideoStudioRenderJobsPanel', () => {
  it('renders completed render variants and export actions', async () => {
    const html = await render({ jobs: [job()] })

    expect(html).toContain('Render jobs')
    expect(html).toContain('done')
    expect(html).toContain('reels_9x16')
    expect(html).toContain('/api/agency/audio/projects/project-1/renders/render-1/reels_9x16')
    expect(html).toContain('Publish')
    expect(html).toContain('Portal')
    expect(html).toContain('Library')
  })

  it('renders an empty render state', async () => {
    const html = await render({ jobs: [] })

    expect(html).toContain('No render jobs yet')
    expect(html).toContain('Render')
  })
})
