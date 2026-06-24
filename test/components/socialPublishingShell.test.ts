// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { computed, createSSRApp, h, ref, watchEffect } from 'vue'
import { renderToString } from 'vue/server-renderer'
import SocialPublishingShell from '~~/app/components/social-publishing/SocialPublishingShell.vue'

const stubs: Record<string, unknown> = {
  USelectMenu: {
    name: 'USelectMenu',
    props: ['modelValue', 'items', 'valueKey', 'labelKey', 'placeholder', 'icon'],
    template: '<div data-select :data-options="items.length"></div>'
  },
  SocialPublishingNav: {
    name: 'SocialPublishingNav',
    props: ['counts'],
    template: '<nav data-nav :data-counts="JSON.stringify(counts)"></nav>'
  }
}

interface Opts {
  clients?: unknown
  counts?: unknown
  routeQuery?: Record<string, unknown>
  cookieValue?: string | null
}

// The shell uses the REAL useSocialPublishingClient composable (explicit import),
// so provide its Nuxt deps (useRoute/useRouter/useCookie) rather than stubbing the
// composable itself.
function installGlobals({ clients = [], counts = {}, routeQuery = {}, cookieValue = null }: Opts) {
  const cookie = ref<string | null>(cookieValue)
  const routerReplace = vi.fn()
  const route = { query: { ...routeQuery } }
  Object.assign(globalThis, {
    ref,
    computed,
    watchEffect,
    useRoute: () => route,
    useRouter: () => ({ replace: routerReplace }),
    useCookie: () => cookie,
    useFetch: (url: string) => {
      if (url === '/api/agency/clients') return { data: ref(clients) }
      if (url.includes('nav-counts')) return { data: ref(counts) }
      return { data: ref(null) }
    }
  })
  return { cookie, routerReplace }
}

async function render(
  props: Record<string, unknown> = { title: 'Compose' },
  slots: Record<string, () => unknown> = {},
  opts: Opts = {}
) {
  const ctx = installGlobals(opts)
  const app = createSSRApp({ render: () => h(SocialPublishingShell, props, slots) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  const html = await renderToString(app)
  return { html, ...ctx }
}

describe('SocialPublishingShell', () => {
  it('renders the title and optional subtitle', async () => {
    const { html } = await render({ title: 'Compose', subtitle: 'Create a post' })
    expect(html).toContain('Compose')
    expect(html).toContain('Create a post')
  })

  it('is a full-width single scroll container', async () => {
    const { html } = await render()
    expect(html).toContain('overflow-y-auto')
    expect(html).not.toContain('max-w-')
  })

  it('derives client options from a bare array response', async () => {
    const { html } = await render({ title: 'X' }, {}, {
      clients: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]
    })
    expect(html).toContain('data-options="2"')
  })

  it('derives client options from a { clients } wrapped response', async () => {
    const { html } = await render({ title: 'X' }, {}, {
      clients: { clients: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }, { id: '3', name: 'C' }] }
    })
    expect(html).toContain('data-options="3"')
  })

  it('passes the fetched nav counts down to the tile nav', async () => {
    const { html } = await render({ title: 'X' }, {}, {
      counts: { accounts: 5, scheduled: 3, pendingApprovals: 2, drafts: 7 }
    })
    expect(html).toContain('data-nav')
    expect(html).toContain('&quot;accounts&quot;:5')
  })

  it('renders the default body slot and the actions slot', async () => {
    const { html } = await render({ title: 'X' }, {
      default: () => h('div', {}, 'BODY_CONTENT'),
      actions: () => h('button', {}, 'ACTION_BTN')
    })
    expect(html).toContain('BODY_CONTENT')
    expect(html).toContain('ACTION_BTN')
  })

  it('defaults to the first client when none is selected (sets cookie + URL)', async () => {
    const { cookie, routerReplace } = await render({ title: 'X' }, {}, {
      routeQuery: {},
      cookieValue: null,
      clients: [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }]
    })
    expect(cookie.value).toBe('c1')
    expect(routerReplace).toHaveBeenCalledWith({ query: { client: 'c1' } })
  })

  it('keeps an existing client selection (does not override or rewrite the URL)', async () => {
    const { routerReplace } = await render({ title: 'X' }, {}, {
      routeQuery: { client: 'c2' },
      clients: [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }]
    })
    expect(routerReplace).not.toHaveBeenCalled()
  })
})
