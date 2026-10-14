// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, createApp, defineComponent, h, nextTick, ref, Suspense } from 'vue'
import type { PageStudioLaunchState } from '~~/shared/pageStudio/launchReadiness'
import LaunchStatus from '~~/app/components/page-studio/CustomerLaunchStatus.client.vue'

const state = ref<Partial<PageStudioLaunchState> | null>(null), error = ref<Error | null>(null), status = ref('success')
const refresh = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  error.value = null
  state.value = { siteId: 'site-a', content: { status: 'ready', publicPages: 3, publicForms: 0 }, approvedVersionId: 'version', activeReleases: [] }
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('useFetch', () => ({ data: state, error, status, refresh }))
})
afterEach(() => vi.unstubAllGlobals())
async function mount() {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(LaunchStatus, { siteId: 'site-a' }) }) })
  app.component('UButton', defineComponent({ props: ['label'], setup: (props, { attrs }) => () => h('button', attrs, props.label) }))
  app.component('UAlert', defineComponent({ props: ['title', 'description'], setup: props => () => h('div', `${props.title} ${props.description}`) }))
  app.component('UBadge', defineComponent({ props: ['label'], setup: props => () => h('span', props.label) }))
  app.component('USkeleton', defineComponent({ setup: () => () => h('div') }))
  app.mount(host)
  await Promise.resolve()
  await nextTick()
  return { app, host }
}
it('distinguishes approval from publication and allows a fresh check', async () => {
  const { app, host } = await mount()
  try {
    expect(host.textContent).toContain('3 visitor pages saved')
    expect(host.textContent).toContain('Current version approved')
    expect(host.textContent).toContain('No publication recorded')
    host.querySelector('button')!.click()
    expect(refresh).toHaveBeenCalledOnce()
  } finally { app.unmount() }
})
it('hides stale success when refresh fails', async () => {
  error.value = new Error('unavailable')
  state.value!.activeReleases = [{ id: 'release', hostname: 'old.example.test', activatedAt: '2026-10-15T00:00:00Z' }]
  const { app, host } = await mount()
  try {
    expect(host.textContent).toContain('Launch status unavailable')
    expect(host.textContent).not.toContain('old.example.test')
    expect(host.textContent).not.toContain('Current version approved')
  } finally { app.unmount() }
})
it('does not display another site’s retained fetch result', async () => {
  state.value!.siteId = 'site-b'
  state.value!.activeReleases = [{ id: 'release', hostname: 'foreign.example.test', activatedAt: '2026-10-15T00:00:00Z' }]
  const { app, host } = await mount()
  try {
    expect(host.textContent).not.toContain('foreign.example.test')
  } finally {
    app.unmount()
  }
})

it('does not confuse unavailable content with missing approval', async () => {
  state.value!.content = { status: 'unavailable', publicPages: null, publicForms: null }
  state.value!.approvedVersionId = null
  const { app, host } = await mount()
  try {
    expect(host.textContent).toContain('Approval could not be checked')
    expect(host.textContent).not.toContain('still needs review')
  } finally { app.unmount() }
})
it('describes a retained pointer without claiming domain reachability', async () => {
  state.value!.activeReleases = [{ id: 'release', hostname: 'example.test', activatedAt: '2026-10-15T00:00:00Z' }]
  const { app, host } = await mount()
  try {
    expect(host.textContent).toContain('Publication recorded')
    expect(host.textContent).toContain('Check domain and HTTPS readiness below')
    expect(host.textContent).not.toContain('live release')
  } finally { app.unmount() }
})
