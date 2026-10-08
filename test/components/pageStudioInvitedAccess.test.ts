// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, Suspense, watch } from 'vue'
import Access from '../../app/pages/agency/page-studio/[siteId]/access.vue'

const data = ref({ name: 'Fantasy Limo', cmsUrl: 'https://xeroflowpages.com/studio/sites/site-a', users: [{ id: 'user-a', name: 'Paul', email: 'paul@example.com', status: 'pending', role: null }] })
const error = ref<unknown>(null), save = vi.fn(), notify = vi.fn(), refresh = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
async function flush() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(Access) }) })
  app.component('UButton', { props: ['to', 'label', 'disabled', 'loading'], emits: ['click'], template: '<a v-if="to" :href="to">{{ label }}</a><button v-else :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}</button>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<p role="alert">{{ title }} {{ description }}</p>' })
  app.component('UFormField', { props: ['label'], template: '<label>{{ label }}<slot /></label>' })
  app.component('USelect', { props: ['modelValue', 'items'], emits: ['update:modelValue'], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.value">{{ item.label }}</option></select>' })
  apps.push(app)
  app.mount(host)
  await flush()
  return host
}
beforeEach(() => {
  vi.clearAllMocks()
  error.value = null
  save.mockResolvedValue({ role: 'editor' })
  for (const [key, value] of Object.entries({ ref, computed, watch, definePageMeta: vi.fn(), useHead: vi.fn(), useRoute: () => ({ params: { siteId: 'site-a' } }), useFetch: vi.fn(async () => ({ data, error, pending: ref(false), refresh })), $fetch: save, useToast: () => ({ add: notify }) })) vi.stubGlobal(key, value)
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})
it('requires an explicit save for the chosen website permission and preserves the CMS destination', async () => {
  const host = await mount()
  const button = host.querySelector('button')!
  expect(button.disabled).toBe(true)
  expect(host.textContent).toContain('email verification required')
  expect(host.querySelector('a[href^="https://xeroflowpages.com"]')?.getAttribute('href')).toBe(data.value.cmsUrl)
  const select = host.querySelector('select')!
  select.value = 'editor'
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await flush()
  expect(save).not.toHaveBeenCalled()
  button.click()
  await flush()
  expect(save).toHaveBeenCalledExactlyOnceWith('/api/agency/page-studio/sites/site-a/members', { method: 'PUT', body: { userId: 'user-a', role: 'editor' } })
  expect(refresh).toHaveBeenCalledOnce()
})
it('hides retained users and CMS links after permission loss', async () => {
  error.value = { data: { statusMessage: 'An agency administrator must manage CMS access.' } }
  const host = await mount()
  expect(host.textContent).toContain('An agency administrator must manage CMS access.')
  expect(host.textContent).not.toContain('paul@example.com')
  expect(host.querySelector('a[href^="https://xeroflowpages.com"]')).toBeNull()
  expect(host.querySelector('select')).toBeNull()
})
