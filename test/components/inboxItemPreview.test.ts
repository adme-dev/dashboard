// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createSSRApp, h, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import InboxItemPreview from '~~/app/components/inbox/InboxItemPreview.vue'

// Minimal stubs for the Nuxt-UI components the preview uses.
const stubs: Record<string, Component> = {
  USkeleton: { name: 'USkeleton', template: '<div class="skeleton" />' },
  UAlert: { name: 'UAlert', props: ['title', 'description', 'icon', 'color', 'variant'], template: '<div class="alert">{{ title }} {{ description }}</div>' },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span class="badge">{{ label }}</span>' },
  UButton: { name: 'UButton', props: ['label', 'icon', 'color'], template: '<button>{{ label }}</button>' },
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' }
}

async function render(notification: { link: string | null }) {
  const app = createSSRApp({ render: () => h(InboxItemPreview, { notification }) })
  for (const [name, c] of Object.entries(stubs)) {
    app.component(name, c)
  }
  return renderToString(app)
}

beforeEach(() => {
  // useToast is a Nuxt auto-import the component calls at setup.
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('InboxItemPreview', () => {
  it('renders the loading state for a task link without throwing', async () => {
    // $fetch never resolves within renderToString, so we observe the loading state.
    vi.stubGlobal('$fetch', () => new Promise(() => {}))
    const html = await render({ link: '/agency/tasks/t1' })
    expect(html).toContain('skeleton')
  })

  it('renders the loading state for a brief link without throwing', async () => {
    vi.stubGlobal('$fetch', () => new Promise(() => {}))
    const html = await render({ link: '/agency/briefs/b1' })
    expect(html).toContain('skeleton')
  })

  it('renders the loading state for an anomaly link without throwing', async () => {
    const fetch = vi.fn(() => new Promise(() => {}))
    vi.stubGlobal('$fetch', fetch)
    const html = await render({ link: '/anomalies?focus=a1' })
    expect(html).toContain('skeleton')
    expect(fetch).toHaveBeenCalledWith('/api/ai/anomalies/a1', {
      query: { missing: 'empty' }
    })
  })

  it('renders nothing meaningful for an unpreviewable link (parent shows fallback)', async () => {
    vi.stubGlobal('$fetch', () => new Promise(() => {}))
    const html = await render({ link: '/agency/boards/x' })
    expect(html).not.toContain('skeleton')
  })
})
