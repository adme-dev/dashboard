import { createApp, h, nextTick, type Component, type App } from 'vue'

export const siteId = '10000000-0000-4000-8000-000000000001'
export const requestId = '10000000-0000-4000-8000-000000000002'
export const otherSite = '20000000-0000-4000-8000-000000000001'
export const otherRequest = '20000000-0000-4000-8000-000000000002'
export const review = { checkpointId: 'saved-flower-design-v3', applicationId: '10000000-0000-4000-8000-000000000003', objectCount: 7 }
export const control = (overrides: Record<string, unknown> = {}) => ({ siteId, requestId, revision: 1, state: 'requested', review: null, expiresAt: '2026-12-01T00:00:00.000Z', allowedActions: ['revoke'], ...overrides })
export const apps: App[] = []
export async function flush() {
  for (let index = 0; index < 24; index++) {
    await Promise.resolve()
    await nextTick()
  }
}
export function deferred<T = unknown>() {
  let resolve!: (value: T) => void, reject!: (value: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
export async function mount(component: Component, props: Record<string, unknown> = {}, children: Record<string, Component> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(component, props) })
  apps.push(app)
  app.component('UButton', { props: ['label', 'disabled', 'loading'], template: '<button :disabled="disabled || loading">{{ label }}<slot/></button>' })
  app.component('UModal', { props: ['open', 'title', 'description'], template: '<section v-if="open" role="dialog" aria-modal="true"><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body"/><slot name="footer"/></section>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<div role="alert">{{ title }} {{ description }}</div>' })
  app.component('UDashboardPanel', { template: '<main><slot name="header"/><slot name="body"/></main>' })
  app.component('UDashboardNavbar', { props: ['title'], template: '<header><h1>{{ title }}</h1><slot name="right"/></header>' })
  app.component('UDashboardSidebarCollapse', { template: '<span/>' })
  app.component('UBadge', { template: '<span><slot/></span>' })
  for (const [name, child] of Object.entries(children)) app.component(name, child)
  app.mount(host)
  await flush()
  return host
}
export function button(host: HTMLElement, label: string) {
  return [...host.querySelectorAll('button')].find(value => value.textContent?.trim() === label)
}
export function dialog(host: HTMLElement) {
  return host.querySelector('[role="dialog"]') as HTMLElement | null
}
export async function click(host: HTMLElement, label: string) {
  const target = button(host, label)
  if (!target) throw new Error(`Missing button ${label}`)
  target.click()
  await flush()
}
export function cleanup() {
  apps.splice(0).forEach(app => app.unmount())
  document.body.replaceChildren()
}
