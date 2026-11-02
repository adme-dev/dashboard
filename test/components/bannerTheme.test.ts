// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive } from 'vue'
import ThemeToggle from '../../app/components/banner/ThemeToggle.vue'

const mode = reactive({ value: 'dark', preference: 'dark' })
const apps: ReturnType<typeof createApp>[] = []

beforeEach(() => {
  mode.value = 'dark'
  mode.preference = 'dark'
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('useColorMode', () => mode)
})

afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

function mountToggle() {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(ThemeToggle) })
  app.component('UButton', { template: '<button><slot /></button>' })
  apps.push(app)
  app.mount(host)
  return host.querySelector('button')!
}

it('shows the user’s saved dark preference without forcing a light Banner theme', () => {
  const button = mountToggle()
  expect(button.getAttribute('aria-label')).toBe('Switch to light mode')
})

it('changes the shared appearance preference from Banner Studio', async () => {
  const button = mountToggle()
  button.click()
  expect(mode.preference).toBe('light')
  mode.value = 'light'
  await nextTick()
  expect(button.getAttribute('aria-label')).toBe('Switch to dark mode')
  button.click()
  expect(mode.preference).toBe('dark')
})

it('uses the effective system appearance when choosing the next explicit preference', () => {
  mode.preference = 'system'
  mode.value = 'light'
  const button = mountToggle()
  expect(button.getAttribute('aria-label')).toBe('Switch to dark mode')
  button.click()
  expect(mode.preference).toBe('dark')
})
