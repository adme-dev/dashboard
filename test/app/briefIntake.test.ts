// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, onMounted, ref, Suspense, watch, watchEffect } from 'vue'

const template = {
  id: 'social-template', categoryId: 'social', slug: 'social-content', name: 'Social Media Content',
  defaultPriority: 'medium', fields: [
    { id: 'title', fieldKey: 'content_brief_title', fieldLabel: 'Content Brief Title', fieldType: 'text', stepNumber: 1, sortOrder: 0 },
    { id: 'client', fieldKey: 'client', fieldLabel: 'Client', fieldType: 'client', stepNumber: 1, sortOrder: 1 }
  ]
}
const clients = [{ id: 'product-client', name: 'DriveAgent' }, { id: 'news-client', name: 'DriveAgent News' }]
const post = vi.fn().mockResolvedValue({ id: 'brief-1', referenceNumber: 'BR-1' })
const navigate = vi.fn()
const fetches: unknown[] = []
Object.assign(globalThis, {
  computed, ref, watch, onMounted, definePageMeta: vi.fn(),
  useAuth: () => ({ user: ref({ id: 'paul' }) }), useToast: () => ({ add: vi.fn() }),
  navigateTo: navigate, $fetch: post,
  useFetch: async (request: string | (() => string), options: { immediate?: boolean } = {}) => {
    fetches.push(request)
    const data = ref<unknown>(null)
    const load = () => {
      const path = typeof request === 'function' ? request() : request
      data.value = path === '/api/agency/briefs/categories'
        ? [{ id: 'social', name: 'Social Media', templateCount: 1 }]
        : path.startsWith('/api/agency/clients')
          ? clients
          : path.endsWith('/social-content')
            ? template
            : [template, { id: 'other-template', categoryId: 'other', name: 'Website Brief' }]
    }
    // Nuxt 4 does not start a never-executed immediate:false fetch on key changes.
    watchEffect(() => {
      if (options.immediate !== false) load()
    })
    return { data, pending: ref(false) }
  }
})
const NewBrief = (await import('~~/app/pages/agency/briefs/new.vue')).default
const Renderer = (await import('~~/app/components/briefs/BriefFormRenderer.vue')).default
let cleanup = () => {}
afterEach(() => {
  cleanup()
  post.mockClear()
  navigate.mockClear()
  fetches.length = 0
})
async function flush() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount(component: typeof NewBrief, props: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(component, props) }) })
  for (const name of ['UDashboardPanel', 'UDashboardNavbar', 'UCard']) {
    app.component(name, { template: '<div><slot name="left"/><slot name="right"/><slot/></div>' })
  }
  app.component('UButton', { props: ['label'], emits: ['click'], template: '<button @click="$emit(\'click\')">{{label}}<slot/></button>' })
  app.component('UBadge', { template: '<span><slot/></span>' })
  app.component('UIcon', { template: '<span/>' })
  app.component('BriefsBriefFormRenderer', {
    props: ['clients'], emits: ['submit'],
    template: '<div data-testid="clients">{{ JSON.stringify(clients) }}</div><button @click="$emit(\'submit\', { content_brief_title: \'Dealership introduction\', client: \'product-client\' }, true)">Save example</button>'
  })
  app.component('BriefsBriefFormField', { props: ['clients'], template: '<div data-testid="field-clients">{{ JSON.stringify(clients) }}</div>' })
  app.mount(host)
  cleanup = () => {
    app.unmount()
    host.remove()
  }
  await flush()
  return host
}
async function selectSocialTemplate(host: HTMLElement) {
  Array.from(host.querySelectorAll('h3')).find(el => el.textContent?.trim() === 'Social Media')!.click()
  await flush()
  const choice = Array.from(host.querySelectorAll('h3')).find(el => el.textContent?.trim() === 'Social Media Content')
  expect(choice, 'templates returned separately from category counts are selectable').toBeDefined()
  expect(host.textContent).not.toContain('Website Brief')
  choice!.click()
  await flush()
}
describe('agency brief intake', () => {
  it('shows templates belonging to the selected category from the templates API', async () => {
    const host = await mount(NewBrief)
    await selectSocialTemplate(host)
    expect(host.textContent).toContain('Save example')
  })
  it('passes real client choices into the form without confusing product and news', async () => {
    const host = await mount(NewBrief)
    await selectSocialTemplate(host)
    expect(JSON.parse(host.querySelector('[data-testid="clients"]')!.textContent!)).toEqual(clients)
  })
  it('saves the selected client and social-specific headline on the brief', async () => {
    const host = await mount(NewBrief)
    await selectSocialTemplate(host)
    Array.from(host.querySelectorAll('button')).find(el => el.textContent === 'Save example')!.click()
    await flush()
    expect(post).toHaveBeenCalledWith('/api/agency/briefs', expect.objectContaining({
      body: expect.objectContaining({ title: 'Dealership introduction', clientId: 'product-client', isDraft: true })
    }))
    expect(navigate).toHaveBeenCalledWith('/agency/briefs/brief-1')
  })
  it('forwards supplied client options from the renderer to client fields', async () => {
    const host = await mount(Renderer as typeof NewBrief, { template, clients })
    const fieldChoices = Array.from(host.querySelectorAll('[data-testid="field-clients"]'))
    expect(fieldChoices.length).toBe(2)
    expect(JSON.parse(fieldChoices[1]!.textContent!)).toEqual(clients)
  })
})
