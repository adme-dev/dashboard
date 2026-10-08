// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref } from 'vue'
import ThemeToggle from '../../app/components/studio/ThemeToggle.vue'

const cookie = ref<unknown>(undefined)
const mode = { value: 'light', preference: 'dark' }
const route = { meta: { colorMode: 'light' } }
const apps: ReturnType<typeof createApp>[] = []
beforeEach(() => {
  cookie.value = undefined
  mode.value = 'light'
  mode.preference = 'dark'
  route.meta.colorMode = 'light'
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('useCookie', vi.fn(() => cookie))
  vi.stubGlobal('useColorMode', () => mode)
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('defineNuxtRouteMiddleware', (callback: unknown) => callback)
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

it('defaults only Studio routes to light and restores an explicit dark choice', async () => {
  const middleware = (await import('../../app/middleware/studio-theme.global')).default
  const to = { path: '/studio/sites/site-a', meta: {} as { colorMode?: string } }
  await middleware(to as never, {} as never)
  expect(to.meta.colorMode).toBe('light')
  cookie.value = 'dark'
  await middleware(to as never, {} as never)
  expect(to.meta.colorMode).toBe('dark')
  cookie.value = 'invalid'
  await middleware(to as never, {} as never)
  expect(to.meta.colorMode).toBe('light')
  const agency = { path: '/agency', meta: {} }
  await middleware(agency as never, {} as never)
  expect(agency.meta).toEqual({})
  const other = { path: '/studio-other', meta: {} }
  await middleware(other as never, {} as never)
  expect(other.meta).toEqual({})
})

it('toggles immediately, persists a Studio-scoped cookie, and leaves the agency preference alone', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(ThemeToggle) })
  app.component('UButton', { template: '<button><slot /></button>' })
  apps.push(app)
  app.mount(host)
  const button = host.querySelector('button')!
  expect(button.getAttribute('aria-label')).toBe('Switch to dark mode')
  button.click()
  await nextTick()
  expect(cookie.value).toBe('dark')
  expect(mode.value).toBe('dark')
  expect(route.meta.colorMode).toBe('dark')
  expect(button.getAttribute('aria-label')).toBe('Switch to light mode')
  button.click()
  await nextTick()
  expect(cookie.value).toBe('light')
  expect(mode.value).toBe('light')
  expect(mode.preference).toBe('dark')
  expect(useCookie).toHaveBeenCalledWith('studio-color-mode', { path: '/studio', sameSite: 'lax', maxAge: 31536000 })
})
