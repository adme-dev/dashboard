// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, createApp, defineComponent, h, nextTick, ref, Suspense } from 'vue'
import type { PageStudioLaunchState } from '~~/shared/pageStudio/launchReadiness'
import LaunchStatus from '~~/app/components/page-studio/CustomerLaunchStatus.client.vue'

const state = ref<Partial<PageStudioLaunchState> | null>(null), error = ref<Error | null>(null), status = ref('success')
const refresh = vi.fn(), request = vi.fn()
const openPreview = vi.hoisted(() => vi.fn())
vi.mock('~~/app/utils/pageStudioCandidatePreview', () => ({ openPageStudioCandidatePreview: openPreview }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('$fetch', request)
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

function ready() {
  Object.assign(state.value!, { candidateReview: true, canManagePublication: true, deliveryMode: 'static', checkpointId: 'checkpoint', digest: 'digest', plan: { status: 'ready', key: 'website' } })
  state.value!.content!.requiresSealedFeatures = false
}
function response() {
  return {
    build: { buildId: 'build', versionDigest: 'digest', manifestDigest: 'manifest', scope: { siteId: 'site-a' }, astro: { context: { identity: { environment: 'production', source: { kind: 'approved-version', versionId: 'version', checkpoint: { id: 'checkpoint', digest: 'digest' } } } } } },
    preview: { hostname: 'preview.example.test', release: { buildId: 'build', versionDigest: 'digest', manifestDigest: 'manifest', scope: { siteId: 'site-a' } } },
    session: { token: 'private-test-token', expiresAt: Date.now() / 1000 + 300 }
  }
}
function button(host: HTMLElement, label: string) {
  return Array.from(host.querySelectorAll('button')).find(item => item.textContent === label)
}
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve()
  await nextTick()
}
it('prepares the pinned approved version and opens only on a separate user click', async () => {
  ready()
  const candidate = response()
  request.mockResolvedValue(candidate)
  const { app, host } = await mount()
  try {
    button(host, 'Prepare approved preview')!.click()
    await settle()
    expect(request).toHaveBeenCalledWith('/api/portal/page-studio/sites/site-a/versions/version/candidate', expect.objectContaining({ method: 'POST', body: { environment: 'production' } }))
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(openPreview).not.toHaveBeenCalled()
    expect(host.textContent).not.toContain('private-test-token')
    button(host, 'Open approved preview')!.click()
    expect(openPreview).toHaveBeenCalledWith(candidate.preview.hostname, candidate.session)
  } finally { app.unmount() }
})
it('does not offer preparation when the production compiler is unavailable', async () => {
  ready()
  state.value!.candidateReview = false
  const { app, host } = await mount()
  try {
    expect(button(host, 'Prepare approved preview')).toBeUndefined()
  } finally { app.unmount() }
})
it('rechecks before dispatch and fails closed on a failed status refresh', async () => {
  ready()
  refresh.mockImplementation(() => {
    error.value = new Error('denied')
  })
  const { app, host } = await mount()
  try {
    button(host, 'Prepare approved preview')!.click()
    await settle()
    expect(request).not.toHaveBeenCalled()
    expect(button(host, 'Open approved preview')).toBeUndefined()
  } finally { app.unmount() }
})
it('rejects a preview whose manifest does not match the approved build', async () => {
  ready()
  const candidate = response()
  candidate.preview.release.manifestDigest = 'other'
  request.mockResolvedValue(candidate)
  const { app, host } = await mount()
  try {
    button(host, 'Prepare approved preview')!.click()
    await settle()
    expect(button(host, 'Open approved preview')).toBeUndefined()
    expect(host.textContent).toContain('Preview unavailable')
  } finally { app.unmount() }
})
it('discards an in-flight response after access changes, even if access returns', async () => {
  ready()
  let resolve!: (value: ReturnType<typeof response>) => void
  request.mockImplementation(() => new Promise((done) => {
    resolve = done
  }))
  const { app, host } = await mount()
  try {
    button(host, 'Prepare approved preview')!.click()
    await settle()
    state.value!.candidateReview = false
    state.value!.candidateReview = true
    resolve(response())
    await settle()
    expect(button(host, 'Open approved preview')).toBeUndefined()
  } finally { app.unmount() }
})
it('removes prepared access when the saved version changes', async () => {
  ready()
  request.mockResolvedValue(response())
  const { app, host } = await mount()
  try {
    button(host, 'Prepare approved preview')!.click()
    await settle()
    expect(button(host, 'Open approved preview')).toBeDefined()
    state.value!.digest = 'new-digest'
    await nextTick()
    expect(button(host, 'Open approved preview')).toBeUndefined()
  } finally { app.unmount() }
})
it('reuses the request key after a retry without sending duplicate concurrent requests', async () => {
  ready()
  request.mockRejectedValueOnce(new Error('try again')).mockResolvedValueOnce(response())
  const { app, host } = await mount()
  try {
    button(host, 'Prepare approved preview')!.click()
    button(host, 'Prepare approved preview')!.click()
    await settle()
    expect(request).toHaveBeenCalledTimes(1)
    button(host, 'Prepare approved preview')!.click()
    await settle()
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[0][1].headers['idempotency-key']).toBe(request.mock.calls[1][1].headers['idempotency-key'])
  } finally { app.unmount() }
})
it('drops an expired credential and offers preparation again', async () => {
  ready()
  request.mockResolvedValue(response())
  const { app, host } = await mount()
  try {
    button(host, 'Prepare approved preview')!.click()
    await settle()
    openPreview.mockImplementation(() => {
      throw new Error('Preview access expired. Prepare again.')
    })
    button(host, 'Open approved preview')!.click()
    await nextTick()
    expect(button(host, 'Open approved preview')).toBeUndefined()
    expect(host.textContent).toContain('Preview access expired')
    expect(button(host, 'Prepare approved preview')).toBeDefined()
  } finally { app.unmount() }
})

it('discards prepared credentials when the final status refresh fails', async () => {
  ready()
  request.mockResolvedValue(response())
  refresh.mockResolvedValueOnce(undefined).mockImplementationOnce(() => {
    error.value = new Error('access unavailable')
  })
  const { app, host } = await mount()
  try {
    button(host, 'Prepare approved preview')!.click()
    await settle()
    expect(request).toHaveBeenCalledOnce()
    expect(button(host, 'Open approved preview')).toBeUndefined()
    expect(host.textContent).toContain('Launch status unavailable')
  } finally { app.unmount() }
})
it.each(['site', 'version', 'checkpoint', 'digest', 'environment', 'release-site', 'missing-manifest', 'expiry'])('refuses a candidate with mismatched or invalid %s', async (field) => {
  ready()
  const candidate = response(), identity = candidate.build.astro.context.identity
  if (field === 'site') candidate.build.scope.siteId = 'other-site'
  if (field === 'version') identity.source.versionId = 'other-version'
  if (field === 'checkpoint') identity.source.checkpoint.id = 'other-checkpoint'
  if (field === 'digest') identity.source.checkpoint.digest = 'other-digest'
  if (field === 'environment') identity.environment = 'staging'
  if (field === 'release-site') candidate.preview.release.scope.siteId = 'other-site'
  if (field === 'missing-manifest') candidate.build.manifestDigest = ''
  if (field === 'expiry') candidate.session.expiresAt = 0
  request.mockResolvedValue(candidate)
  const { app, host } = await mount()
  try {
    button(host, 'Prepare approved preview')!.click()
    await settle()
    expect(button(host, 'Open approved preview')).toBeUndefined()
    expect(host.textContent).toContain('Preview unavailable')
  } finally { app.unmount() }
})
