// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, onBeforeUnmount, onMounted, ref, Suspense } from 'vue'
import TopUp from '../../app/components/page-studio/ImageCreditTopUp.vue'

const data = ref(), error = ref(null), pending = ref(false), refresh = vi.fn(), fetcher = vi.fn(), navigate = vi.fn(), settled = vi.fn()
const route = { query: {} as Record<string, string> }
const apps: ReturnType<typeof createApp>[] = []
const pack = { id: 'test100', version: 'v1', currency: 'aud', amountMinor: 1000, credits: 100 }
const id = '30000000-0000-4000-8000-000000000003'
async function flush() {
  for (let n = 0; n < 12; n++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount() {
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(TopUp, { siteId: 'site-a', onSettled: settled }) }) })
  app.component('UButton', { props: ['label', 'loading', 'disabled'], emits: ['click'], template: '<button :disabled="loading || disabled" @click="$emit(\'click\')">{{ label }}</button>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<p role="alert">{{ title }} {{ description }}</p>' })
  app.component('USelect', { props: ['modelValue', 'items'], emits: ['update:modelValue'], template: '<select @change="$emit(\'update:modelValue\', $event.target.value)"><option value="__choose__">Choose</option><option v-for="item in items" :value="item.value">{{item.label}}</option></select>' })
  app.component('UFormField', { template: '<div><slot /></div>' })
  app.component('UBadge', { props: ['label'], template: '<span>{{label}}</span>' })
  app.component('USkeleton', { template: '<div />' })
  apps.push(app)
  app.mount(root)
  await flush()
  return root
}
const button = (root: HTMLElement, label: string) => [...root.querySelectorAll('button')].find(item => item.textContent === label)!
beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  route.query = {}
  data.value = { available: true, canPurchase: true, mode: 'test', packs: [pack], purchases: [] }
  error.value = null
  for (const [key, value] of Object.entries({ ref, computed, onBeforeUnmount, onMounted, useRoute: () => route, useFetch: async () => ({ data, error, pending, refresh }), $fetch: fetcher, navigateTo: navigate })) vi.stubGlobal(key, value)
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})
it('shows unavailable billing without a purchase action', async () => {
  data.value.available = false
  const root = await mount()
  expect(root.textContent).toContain('Top-ups are not available yet')
  expect(button(root, 'Continue to test checkout')).toBeUndefined()
})
it('retains the same intent after an unknown response and sends no browser price', async () => {
  fetcher.mockRejectedValue(new Error('Timeout'))
  const root = await mount()
  const select = root.querySelector('select')!
  select.value = pack.id
  select.dispatchEvent(new Event('change'))
  await flush()
  button(root, 'Continue to test checkout').click()
  await flush()
  const first = JSON.parse(JSON.stringify(fetcher.mock.calls[0][1].body))
  button(root, 'Resume test checkout').click()
  await flush()
  expect(fetcher.mock.calls[1][1].body).toEqual(first)
  expect(Object.keys(first).sort()).toEqual(['intentId', 'packId', 'packVersion'])
  expect(navigate).not.toHaveBeenCalled()
})
it('does not treat success redirect as paid and keeps cancellation recoverable', async () => {
  route.query = { site: 'site-a', purchase: id, payment: 'cancelled' }
  fetcher.mockResolvedValue({ intentId: id, pack, status: 'pending', createdAt: new Date().toISOString(), compensatedCredits: 0 })
  const root = await mount()
  expect(root.textContent).toContain('Payment is not confirmed yet')
  expect(root.textContent).not.toContain('Payment confirmed.')
  expect(fetcher.mock.calls[0][0]).toContain('/receipt')
  expect(button(root, 'Start another purchase')).toBeUndefined()
})
it('allows a new selection after checking an old purchase without retaining the return URL state', async () => {
  route.query = { site: 'site-a', purchase: id, payment: 'returned' }
  fetcher.mockResolvedValue({ intentId: id, pack, status: 'confirmed', createdAt: new Date().toISOString(), compensatedCredits: 0 })
  const root = await mount()
  button(root, 'Start another purchase').click()
  await flush()
  expect(root.querySelector('select')).not.toBeNull()
  expect(button(root, 'Continue to test checkout')).toBeDefined()
})
it('hides cached billing choices when access refresh fails', async () => {
  error.value = new Error('Denied') as never
  const root = await mount()
  expect(root.textContent).toContain('Billing could not be loaded')
  expect(root.querySelector('select')).toBeNull()
})

it('does not clear an in-progress purchase when viewing a different confirmed receipt', async () => {
  sessionStorage.setItem('studio-image-purchase:site-a', JSON.stringify({ intentId: id, packId: pack.id, packVersion: pack.version }))
  fetcher.mockResolvedValue({ intentId: id, pack, status: 'pending', createdAt: new Date().toISOString(), compensatedCredits: 0 })
  const root = await mount()
  const otherId = '40000000-0000-4000-8000-000000000004'
  data.value.purchases = [{ intentId: otherId, pack, status: 'confirmed', createdAt: new Date().toISOString() }]
  fetcher.mockResolvedValue({ intentId: otherId, pack, status: 'confirmed', createdAt: new Date().toISOString(), compensatedCredits: 0 })
  await flush()
  button(root, 'View payment').click()
  await flush()
  expect(button(root, 'Resume test checkout')).toBeDefined()
  expect(button(root, 'Start another purchase')).toBeUndefined()
  expect(JSON.parse(sessionStorage.getItem('studio-image-purchase:site-a')!).intentId).toBe(id)
})

it('does not navigate after the customer leaves the website while checkout is loading', async () => {
  let finish!: (value: unknown) => void
  fetcher.mockImplementation(() => new Promise((resolve) => {
    finish = resolve
  }))
  const root = await mount()
  const select = root.querySelector('select')!
  select.value = pack.id
  select.dispatchEvent(new Event('change'))
  await flush()
  button(root, 'Continue to test checkout').click()
  await flush()
  apps.pop()!.unmount()
  finish({ intentId: id, status: 'checkout', checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_example' })
  await flush()
  expect(navigate).not.toHaveBeenCalled()
})

it('does not refresh its parent repeatedly when remounting a confirmed return receipt', async () => {
  route.query = { site: 'site-a', purchase: id, payment: 'returned' }
  fetcher.mockResolvedValue({ intentId: id, pack, status: 'confirmed', createdAt: new Date().toISOString(), compensatedCredits: 0 })
  const root = await mount()
  expect(settled).not.toHaveBeenCalled()
  button(root, 'Check payment status').click()
  await flush()
  expect(settled).toHaveBeenCalledOnce()
})
