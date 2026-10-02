// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, onMounted, reactive, ref, watch, watchEffect } from 'vue'
import News from '~~/app/pages/agency/social/publishing/news.vue'
import Shell from '~~/app/components/social-publishing/SocialPublishingShell.vue'

let app: ReturnType<typeof createApp>
afterEach(() => { app?.unmount(); document.body.innerHTML = '' })
async function flush() { for (let i = 0; i < 12; i++) await nextTick() }

async function mount(query: Record<string, unknown> = { client: 'news' }) {
  const route = reactive({ query })
  const cookie = ref('adme')
  const fetch = vi.fn(async (url: string, options?: any) => {
    if (options?.method === 'PUT') return {}
    if (options?.method === 'POST') return { postIds: ['draft'] }
    if (url.includes('accounts?')) return [{ id: 'news-account', platform: 'facebook', account_name: 'DriveAgent News', is_active: true }]
    if (url.endsWith('/context')) return { activePackage: null, evidence: { pendingCount: 0, approvedCount: 0, approved: [] } }
    if (url.endsWith('/package-options')) return { packages: [], projects: [], allocations: [], rateCards: [] }
    if (url.includes('/evidence')) return { data: [], totalItems: 0 }
    if (/\/profiles\/[^/]+$/.test(url)) return { industry: 'Automotive', contentPillars: [], includeKeywords: [], excludeKeywords: [], makes: [], preferredPlatforms: ['facebook'], defaultTone: 'professional', defaultWorkflow: 'draft' }
    if (url.startsWith('/api/agency/social/news?')) return [{ id: 'article', title: 'News article', topics: [], relevance_reasons: [] }]
    if (url.startsWith('/api/agency/clients')) return [{ id: 'adme', name: 'ADME' }, { id: 'news', name: 'DriveAgent News' }]
    return []
  })
  Object.assign(globalThis, { computed, ref, watch, watchEffect, onMounted,
    definePageMeta: () => {}, useHead: () => {}, useAuth: () => ({ isAdmin: ref(true) }),
    useToast: () => ({ add: vi.fn() }), useRoute: () => route,
    useRouter: () => ({ replace: ({ query }: any) => { route.query = query } }),
    useCookie: () => cookie, $fetch: fetch,
    useFetch: (url: string) => ({ data: ref(url.includes('/clients') ? [{ id: 'adme', name: 'ADME' }, { id: 'news', name: 'DriveAgent News' }] : {}) }) })
  app = createApp({ render: () => h(News) })
  app.config.warnHandler = () => {}
  app.component('SocialPublishingShell', Shell)
  app.component('SocialPublishingNav', { render: () => h('nav') })
  app.component('USelectMenu', { props: ['modelValue'], render() { return h('span', { 'data-client': this.modelValue }) } })
  app.component('UButton', { props: ['label', 'disabled'], render() { return h('button', { disabled: this.disabled }, this.label) } })
  app.component('UCheckbox', { props: ['modelValue', 'label'], emits: ['update:modelValue'], render() {
    return h('input', { type: 'checkbox', 'data-label': this.label || '', checked: this.modelValue,
      onChange: () => this.$emit('update:modelValue', !this.modelValue) })
  } })
  for (const name of ['UFormField', 'UAlert', 'UBadge', 'UIcon']) app.component(name, { render() { return h('div', this.$slots.default?.()) } })
  const root = document.createElement('div'); document.body.append(root)
  app.mount(root)
  await flush()
  const click = async (label: string) => { const button = [...root.querySelectorAll('button')].find(el => el.textContent === label)!; button.click(); await flush() }
  return { root, fetch, click }
}

describe('News client context', () => {
  it('loads and saves the News profile and drafts for the same client as the header, despite ADME being first', async () => {
    const { root, fetch, click } = await mount()
    expect([...root.querySelectorAll('[data-client]')].slice(0, 2).map(el => el.getAttribute('data-client'))).toEqual(['news', 'news'])
    expect(fetch.mock.calls.some(([url]) => url === '/api/agency/social/news/profiles/adme')).toBe(false)
    await click('Client content profile')
    await click('Save profile')
    expect(fetch).toHaveBeenCalledWith('/api/agency/social/news/profiles/news', expect.objectContaining({ method: 'PUT' }))
    root.querySelector<HTMLInputElement>('input[data-label=""]')!.click(); await flush()
    await click('Create drafts')
    root.querySelector<HTMLInputElement>('input[data-label="Facebook · DriveAgent News"]')!.click(); await flush()
    const create = [...root.querySelectorAll('button')].filter(el => el.textContent === 'Create drafts').at(-1)!
    create.click(); await flush()
    expect(fetch).toHaveBeenCalledWith('/api/agency/social/news/drafts', expect.objectContaining({ body: expect.objectContaining({ clientId: 'news', accountIds: ['news-account'] }) }))
  })

  it('does not load or save a different client when an explicit query is invalid', async () => {
    const { fetch } = await mount({ client: ['news', 'adme'] })
    expect(fetch.mock.calls.some(([url]) => url.includes('/profiles/') || url.includes('accounts?'))).toBe(false)
  })
})
