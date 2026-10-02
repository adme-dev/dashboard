// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, onMounted, reactive, ref, watch, watchEffect } from 'vue'
import Accounts from '~~/app/pages/agency/social/publishing/accounts.vue'
import Shell from '~~/app/components/social-publishing/SocialPublishingShell.vue'

let app: ReturnType<typeof createApp>
afterEach(() => { app?.unmount(); document.body.innerHTML = '' })
async function mount(client: unknown = 'news', error = 'expired_state') {
  const route = reactive({ query: { client, social_error: error } as Record<string, unknown> })
  const cookie = ref('adme')
  const fetch = vi.fn(async () => [])
  Object.assign(globalThis, { computed, ref, watch, watchEffect, onMounted,
    definePageMeta: () => {}, useToast: () => ({ add: vi.fn() }), useRoute: () => route,
    useRouter: () => ({ replace: ({ query }: any) => { route.query = query } }),
    useCookie: () => cookie, $fetch: fetch,
    useFetch: (url: string) => ({ data: ref(url.includes('/clients') ? [{ id: 'adme', name: 'ADME' }, { id: 'news', name: 'DriveAgent News' }] : {}) }) })
  app = createApp({ render: () => h(Accounts) }); app.config.warnHandler = () => {}
  app.component('SocialPublishingShell', Shell)
  app.component('SocialPublishingNav', { render: () => h('nav') })
  app.component('UAlert', { props: ['title', 'description'], render() {
    return h('section', {}, [this.title, this.description, this.$slots.actions?.()])
  } })
  app.component('UButton', { props: ['label', 'disabled'], render() { return h('button', { disabled: this.disabled }, this.label) } })
  for (const name of ['USelectMenu', 'UInput', 'UBadge', 'UIcon', 'UModal']) app.component(name, { render() { return h('div', this.$slots.default?.()) } })
  const root = document.createElement('div'); document.body.append(root); app.mount(root)
  for (let i = 0; i < 8; i++) await nextTick()
  return { root, route, cookie, fetch }
}

describe('publishing account recovery', () => {
  it('keeps expired-session guidance after clearing the transient query and retries the original News client', async () => {
    const { root, route, cookie } = await mount()
    expect(route.query).toEqual({ client: 'news' })
    expect(cookie.value).toBe('news')
    expect(root.textContent).toContain('Facebook connection expired')
    const retry = [...root.querySelectorAll('button')].find(button => button.textContent === 'Retry Facebook connection')!
    expect(retry.disabled).toBe(false)
    retry.click()
    expect(window.location.href).toContain('/api/agency/social/publishing/accounts/connect/meta?clientId=news')
  })
  it('requires a correct client before retrying an invalid explicit client selection', async () => {
    const { root, cookie, fetch } = await mount(['news', 'adme'])
    const retry = [...root.querySelectorAll('button')].find(button => button.textContent === 'Retry Facebook connection')!
    expect(retry.disabled).toBe(true)
    expect(root.textContent).toContain('Choose a client')
    expect(cookie.value).toBe('adme')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('does not automatically route a generic invalid provider session through Facebook', async () => {
    const { root } = await mount('news', 'invalid_state')
    expect(root.textContent).toContain('Choose the correct client and reconnect the account')
    expect(root.textContent).not.toContain('Retry Facebook connection')
  })
})
