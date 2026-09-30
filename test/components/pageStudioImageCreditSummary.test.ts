// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, Suspense } from 'vue'
import CreditSummary from '../../app/components/page-studio/ImageCreditSummary.vue'

const data = ref(), error = ref<unknown>(null), pending = ref(false), refresh = vi.fn(), fetcher = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
async function flush() {
  for (let n = 0;
    n < 8;
    n++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount() {
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(CreditSummary, { siteId: 'site-a' }) }) })
  app.component('UButton', { props: ['label', 'loading', 'disabled'], emits: ['click'], template: '<button :disabled="loading || disabled" @click="$emit(\'click\')">{{ label }}</button>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<p role="alert">{{ title }} {{ description }}</p>' })
  app.component('UTable', { props: ['data'], template: '<div><p v-for="row in data">{{ row.kind }} {{ row.credits }}</p></div>' })
  app.component('USkeleton', { template: '<div>Loading credits</div>' })
  apps.push(app)
  app.mount(root)
  await flush()
  return root
}
beforeEach(() => {
  vi.clearAllMocks()
  pending.value = false
  error.value = null
  data.value = { balance: { available: 70, balance: 80, reserved: 10, frozen: false }, canPurchase: true, history: { items: [{ id: 'entry-private-id', kind: 'settle', credits: -10, reserved: -10, createdAt: '2026-09-30T00:00:00Z' }], nextCursor: { entryId: 'cursor-id', createdAt: '2026-09-30T00:00:00.123456Z' } } }
  fetcher.mockImplementation(async () => ({ data, error, pending, refresh }))
  for (const [key, value] of Object.entries({ ref, computed, useFetch: fetcher }))vi.stubGlobal(key, value)
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})
it('distinguishes available and reserved credits and preserves the history cursor', async () => {
  const root = await mount()
  expect(root.textContent).toContain('70')
  expect(root.textContent).toContain('10 reserved')
  expect(root.textContent).toContain('shared across your websites')
  expect(root.textContent).not.toContain('entry-private-id')
  const older = [...root.querySelectorAll('button')].find(button => button.textContent === 'Older activity')
  older?.click()
  await flush()
  expect(fetcher.mock.calls[0][1].query.value.before).toBe(JSON.stringify(data.value.history.nextCursor))
})
it('hides retained account data after access failure', async () => {
  error.value = { statusCode: 403 }
  const root = await mount()
  expect(root.textContent).toContain('Credits could not be loaded')
  expect(root.textContent).not.toContain('70')
})
it('explains restricted spending and never invents a live payment button', async () => {
  data.value = { ...data.value, balance: { available: 0, balance: -10, reserved: 0, frozen: true }, canPurchase: false }
  const root = await mount()
  expect(root.textContent).toContain('Spending is paused')
  expect(root.textContent).toContain('billing owner')
  expect(root.textContent).not.toContain('Buy now')
})
