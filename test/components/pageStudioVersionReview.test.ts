// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, watch } from 'vue'
import Review from '~~/app/components/page-studio/VersionReview.client.vue'

const fetch = vi.fn(), notify = vi.fn(), reviewed = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
const state = () => ({ siteId: 'site', siteName: 'Example',
  version: { id: 'version', checkpointId: 'cp', digest: 'a'.repeat(64), status: 'in_review', summary: 'Add enquiry form', authorId: 'actor', authorRole: 'agency', createdAt: '2026-09-16T00:00:00Z', current: true },
  live: { releaseId: 'live', hostname: 'example.test', checkpointId: 'old', digest: 'b'.repeat(64) },
  releases: [{ releaseId: 'live', hostname: 'example.test' }], before: { title: 'Before' }, after: { title: '<img src=x onerror=alert(1)>' } })
const stubs = {
  UButton: { props: ['label', 'disabled', 'loading'], emits: ['click'], template: '<button :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}</button>' },
  USlideover: { props: ['open'], template: '<aside v-if="open"><slot name="body"/><slot name="footer"/></aside>' },
  UAlert: { props: ['title', 'description'], template: '<p>{{ title }} {{ description }}</p>' },
  UBadge: { props: ['label'], template: '<span>{{ label }}</span>' },
  UAccordion: { props: ['items'], template: '<div v-for="item in items"><h2>{{ item.label }}</h2><slot name="content" :item="item"/></div>' },
  UFormField: { template: '<div><slot/></div>' },
  UTextarea: { template: '<textarea/>' }, USelect: { template: '<select/>' }, USkeleton: { template: '<div/>' }
}
async function flush() {
  for (let i = 0;
    i < 10;
    i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function button(host: HTMLElement, label: string) {
  return [...host.querySelectorAll('button')].find(e => e.textContent === label)!
}
async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(Review, { siteId: 'site', versionId: 'version', onReviewed: reviewed }) })
  for (const [name, component] of Object.entries(stubs)) app.component(name, component)
  apps.push(app)
  app.mount(host)
  button(host, 'Review changes').click()
  await flush()
  return host
}
beforeEach(() => {
  vi.clearAllMocks()
  for (const [key, value] of Object.entries({ computed, ref, watch, $fetch: fetch, useToast: () => ({ add: notify }) })) vi.stubGlobal(key, value)
  fetch.mockImplementation(async (_url, options) => options?.method === 'POST' ? { decision: 'approved' } : state())
})
afterEach(() => {
  for (const app of apps.splice(0)) app.unmount()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
describe('website version review', () => {
  it('renders authored values as text and identifies the actual live baseline', async () => {
    const host = await mount()
    expect(host.textContent).toContain('example.test')
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(host.querySelector('img')).toBeNull()
    expect(button(host, 'Approve version').disabled).toBe(false)
  })
  it('rechecks and binds a decision to the inspected immutable candidate and live release', async () => {
    const host = await mount()
    button(host, 'Approve version').click()
    await flush()
    expect(fetch).toHaveBeenCalledWith('/api/agency/page-studio/sites/site/versions/version/reviews', { method: 'POST', body: { decision: 'approved', comment: undefined, expectedComparison: { digest: 'a'.repeat(64), checkpointId: 'cp', releaseId: 'live', hostname: 'example.test' } } })
    expect(reviewed).toHaveBeenCalledOnce()
  })
  it('refuses a decision when live content changes during confirmation', async () => {
    const host = await mount()
    fetch.mockResolvedValue({ ...state(), live: { ...state().live, releaseId: 'new' } })
    button(host, 'Approve version').click()
    await flush()
    expect(fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
    expect(host.textContent).toContain('The website changed')
    expect(button(host, 'Approve version').disabled).toBe(true)
  })
  it('refreshes without an obsolete live release after a failed decision', async () => {
    const host = await mount()
    fetch.mockRejectedValueOnce(new Error('release no longer active'))
    button(host, 'Approve version').click()
    await flush()
    button(host, 'Refresh comparison').click()
    await flush()
    expect(fetch).toHaveBeenLastCalledWith('/api/agency/page-studio/sites/site/versions/version/comparison', { query: undefined })
    expect(button(host, 'Approve version').disabled).toBe(false)
  })
  it('keeps historical and failed comparisons out of the decision flow', async () => {
    fetch.mockResolvedValue({ ...state(), version: { ...state().version, current: false } })
    const host = await mount()
    expect(button(host, 'Approve version').disabled).toBe(true)
    fetch.mockRejectedValue(new Error('private failure'))
    button(host, 'Review changes').click()
    await flush()
    expect(host.textContent).toContain('Review needs a refresh')
    expect(host.textContent).not.toContain('private failure')
    expect(button(host, 'Approve version').disabled).toBe(true)
  })
  it('does not report success or allow blind retry after a failed decision', async () => {
    const host = await mount()
    fetch.mockImplementation(async (_url, options) => {
      if (options?.method === 'POST') throw new Error('ambiguous')
      return state()
    })
    button(host, 'Approve version').click()
    await flush()
    expect(reviewed).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
    expect(host.textContent).toContain('decision was not confirmed')
    expect(button(host, 'Approve version').disabled).toBe(true)
  })
})
