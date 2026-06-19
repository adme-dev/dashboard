// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, createSSRApp, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VideoStudioAssetActivityPanel from '~~/app/components/media/VideoStudioAssetActivityPanel.vue'

const stubs = {
  UBadge: { name: 'UBadge', props: ['label'], template: '<span>{{ label }}</span>' },
  UButton: {
    name: 'UButton',
    props: ['label', 'ariaLabel'],
    emits: ['click'],
    template: '<button :aria-label="ariaLabel" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
  },
}

async function render(props: Record<string, unknown>) {
  const app = createSSRApp({ render: () => h(VideoStudioAssetActivityPanel, props) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

async function mount(props: Record<string, unknown>) {
  const events: string[] = []
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(VideoStudioAssetActivityPanel, {
      ...props,
      onRefresh: () => events.push('refresh'),
    })
  })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  app.mount(host)
  await nextTick()
  return { app, host, events }
}

describe('VideoStudioAssetActivityPanel', () => {
  it('renders recent AI jobs with status, provider, prompt, and errors', async () => {
    const html = await render({
      jobs: [{
        id: 'job-1',
        assetLabel: 'Hero footage',
        action: 'mask-lift',
        modelId: 'replicate/sam-2',
        provider: 'replicate',
        status: 'failed',
        prompt: 'Lift the logo',
        errorMessage: 'Queue unavailable',
        createdAt: '2026-06-19T01:00:00Z',
      }],
    })

    expect(html).toContain('AI activity')
    expect(html).toContain('failed')
    expect(html).toContain('Hero footage')
    expect(html).toContain('mask-lift')
    expect(html).toContain('replicate/sam-2')
    expect(html).toContain('replicate')
    expect(html).toContain('Lift the logo')
    expect(html).toContain('Queue unavailable')
  })

  it('emits refresh and renders an empty state', async () => {
    const { app, host, events } = await mount({ jobs: [] })

    try {
      expect(host.textContent).toContain('No AI activity yet.')
      ;(host.querySelector('button[aria-label="Refresh AI activity"]') as HTMLButtonElement).click()
      await nextTick()

      expect(events).toEqual(['refresh'])
    } finally {
      app.unmount()
    }
  })
})
