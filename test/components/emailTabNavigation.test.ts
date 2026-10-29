/* eslint-disable @stylistic/max-statements-per-line -- Compact interaction fixtures. */
// @vitest-environment happy-dom
import { createApp, h, computed, reactive, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EmailPage from '~~/app/pages/agency/email/index.vue'

const route = reactive<{ query: Record<string, unknown>, hash: string }>({ query: {}, hash: '' })
const replace = vi.fn(async (target) => { route.query = target.query; route.hash = target.hash })
let cleanup: () => void
beforeEach(() => {
  route.query = {}; route.hash = ''; replace.mockClear()
  vi.stubGlobal('definePageMeta', () => {})
  vi.stubGlobal('useHead', () => {})
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useRouter', () => ({ replace }))
  vi.stubGlobal('computed', computed)
})
afterEach(() => { cleanup?.(); vi.unstubAllGlobals() })
async function mount() {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(EmailPage) })
  app.component('UTabs', { props: ['modelValue', 'items'], emits: ['update:modelValue'], template: '<nav><button v-for="item in items" :aria-selected="modelValue === item.value" @click="$emit(\'update:modelValue\', item.value)">{{ item.label }}</button></nav>' })
  app.component('UButton', { template: '<a><slot /></a>' })
  for (const name of ['Lists', 'Subscribers', 'Suppression', 'Templates', 'Campaigns']) app.component(`Email${name}Panel`, { template: `<div>${name} content</div>` })
  app.mount(host); cleanup = () => app.unmount(); await nextTick(); return host
}
describe('email tab navigation', () => {
  it('opens a direct templates link and retains unrelated query and hash on tab switches', async () => {
    route.query = { tab: 'templates', client: 'client-a' }; route.hash = '#library'
    const host = await mount(); expect(host.textContent).toContain('Templates content')
    Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'Campaigns')!.click(); await nextTick()
    expect(replace).toHaveBeenCalledWith({ query: { tab: 'campaigns', client: 'client-a' }, hash: '#library' })
    expect(host.textContent).toContain('Campaigns content')
  })
  it('falls back safely for an unknown tab', async () => {
    route.query = { tab: ['templates'] }; const host = await mount(); expect(host.textContent).toContain('Lists content')
  })
})
