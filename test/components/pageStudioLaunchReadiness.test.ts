// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, Suspense } from 'vue'
import Workspace from '~~/app/components/page-studio/PublishingWorkspace.client.vue'
import Readiness from '~~/app/components/page-studio/LaunchReadiness.vue'

const openPreview = vi.hoisted(() => vi.fn())
vi.mock('~~/app/utils/pageStudioCandidatePreview', () => ({ openPageStudioCandidatePreview: openPreview }))

const values = new Map<string, ReturnType<typeof ref>>()
const errors = new Map<string, ReturnType<typeof ref>>()
const mutate = vi.fn(), notify = vi.fn(), refresh = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
const state = () => ({ siteId: 'site', siteName: 'Site', siteStatus: 'active', checkpointId: 'checkpoint', digest: 'digest', approvedVersionId: 'version', activeReleases: [{ id: 'release', hostname: 'example.test', activatedAt: '2026-09-16T00:00:00Z' }], content: { status: 'ready', publicPages: 1, publicForms: 1 }, plan: { status: 'ready', key: 'trial' }, observedAt: '2026-09-16T00:00:00Z' })
const launchUrl = '/api/agency/page-studio/sites/site/launch-state'
const domainUrl = '/api/agency/page-studio/sites/site/domains'
const stubs = {
  UFormField: { props: ['label'], template: '<div>{{ label }}<slot/></div>' },
  UCard: { template: '<section><slot name="header"/><slot/><slot name="footer"/></section>' },
  UAlert: { props: ['title', 'description'], template: '<p>{{ title }} {{ description }}</p>' },
  UBadge: { props: ['label'], template: '<span>{{ label }}</span>' },
  UButton: { props: ['label', 'disabled', 'loading'], emits: ['click'], template: '<button :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}</button>' },
  UModal: { props: ['open'], template: '<aside v-if="open"><slot name="content"/></aside>' },
  UCheckbox: { props: ['modelValue', 'label', 'disabled'], emits: ['update:modelValue'], template: '<label><input type="checkbox" :disabled="disabled" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)"/>{{ label }}</label>' },
  UTabs: { props: ['items', 'modelValue'], template: '<div :data-selected-tab="modelValue"><template v-for="item in items"><slot :name="item.slot"/></template></div>' },
  PageStudioLaunchReadiness: Readiness,
  ...Object.fromEntries(['AgencySetup', 'PagesWorkspace', 'DraftHistory', 'AssetsWorkspace', 'FormSubmissionsWorkspace', 'AnalyticsWorkspace', 'DomainsWorkspace', 'SessionsWorkspace', 'EmailWorkspace'].map(name => [`PageStudio${name}`, { template: '<div/>' }]))
}
async function flush() {
  for (let i = 0;
    i < 8;
    i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(Workspace, { siteId: 'site' }) }) })
  for (const [name, component] of Object.entries(stubs)) app.component(name, component)
  apps.push(app)
  app.mount(host)
  await flush()
  return host
}
function button(host: HTMLElement, label: string) {
  return [...host.querySelectorAll('button')].find(node => node.textContent === label)!
}
beforeEach(() => {
  vi.clearAllMocks()
  values.clear()
  errors.clear()
  values.set(launchUrl, ref(state()))
  values.set('/api/agency/page-studio/sites/site/email', ref({ settings: {}, readiness: { sendingEnabled: false } }))
  values.set('/api/agency/page-studio/sites', ref({ sites: [{ id: 'site', clientId: 'client', name: 'Site', status: 'active' }] }))
  values.set('/api/agency/page-studio/reviews', ref({ reviews: [{ siteId: 'site', versionId: 'historical', decision: 'approved' }] }))
  values.set('/api/agency/page-studio/releases', ref({ releases: [{ id: 'release', siteId: 'site', status: 'active', environment: 'production', hostname: 'example.test' }] }))
  values.set(domainUrl, ref({ siteId: 'site', domains: [{ id: 'domain', hostname: 'example.test', status: 'active', dnsStatus: 'active', tlsStatus: 'active', hostnameStatus: 'active' }] }))
  refresh.mockResolvedValue(undefined)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('useToast', () => ({ add: notify }))
  vi.stubGlobal('$fetch', mutate)
  vi.stubGlobal('usePageStudioLauncher', () => ({ editorOrigin: ref('https://studio.example.test'), launchPageStudio: vi.fn() }))
  vi.stubGlobal('useFetch', async (url: string | (() => string)) => {
    const key = typeof url === 'function' ? url() : url
    errors.set(key, ref(null))
    return { data: values.get(key) ?? ref(null), error: errors.get(key), status: ref('success'), refresh: () => refresh(key) }
  })
})
afterEach(() => {
  for (const app of apps.splice(0)) app.unmount()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
describe('launch readiness and selected publication', () => {
  const candidateResponse = () => ({ build: { buildId: 'astro_build', versionDigest: 'digest', manifestDigest: 'manifest', scope: { siteId: 'site' },
    astro: { context: { identity: { environment: 'production', source: { kind: 'approved-version', versionId: 'version', checkpoint: { id: 'checkpoint', digest: 'digest' } } } } } },
  preview: { hostname: 'build.review.example.test', release: { buildId: 'astro_build', manifestDigest: 'manifest', versionDigest: 'digest', scope: { siteId: 'site' } } },
  session: { token: 'review-token', expiresAt: Math.floor(Date.now() / 1000) + 300 } })

  it('requires preparing and reviewing the exact Astro candidate before promotion', async () => {
    values.get(launchUrl)!.value.candidateReview = true
    mutate.mockResolvedValue(candidateResponse())
    const host = await mount()
    button(host, 'Publish approved version').click()
    await flush()
    expect(button(host, 'Publish reviewed build').disabled).toBe(true)
    button(host, 'Prepare preview').click()
    await flush()
    expect(mutate).toHaveBeenCalledWith('/api/agency/page-studio/sites/site/versions/version/candidate', expect.objectContaining({ body: { environment: 'production' } }))
    expect(button(host, 'Publish reviewed build').disabled).toBe(true)
    button(host, 'Open preview').click()
    await flush()
    expect(openPreview).toHaveBeenCalledWith('build.review.example.test', expect.objectContaining({ token: 'review-token' }))
    const checkbox = host.querySelector('input[type="checkbox"]') as HTMLInputElement
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
    button(host, 'Publish reviewed build').click()
    await flush()
    expect(mutate).toHaveBeenLastCalledWith('/api/agency/page-studio/sites/site/versions/version/publish', expect.objectContaining({ body: {
      environment: 'production', hostname: 'example.test', expectedActiveReleaseId: 'release', buildId: 'astro_build'
    } }))
  })
  it('reuses candidate request identity on preparation retry and rejects a mismatched response', async () => {
    values.get(launchUrl)!.value.candidateReview = true
    mutate.mockRejectedValueOnce(new Error('Disconnected'))
    const response = candidateResponse()
    response.preview.release.buildId = 'other_build'
    mutate.mockResolvedValueOnce(response)
    const host = await mount()
    button(host, 'Publish approved version').click()
    await flush()
    button(host, 'Prepare preview').click()
    await flush()
    button(host, 'Prepare preview').click()
    await flush()
    expect(mutate.mock.calls[0]![1].headers).toEqual(mutate.mock.calls[1]![1].headers)
    expect(button(host, 'Publish reviewed build').disabled).toBe(true)
    expect(openPreview).not.toHaveBeenCalled()
  })
  it('uses website-scoped domains and access without global subscription permissions', async () => {
    const host = await mount()
    expect(errors.has(domainUrl)).toBe(true)
    expect(errors.has('/api/agency/page-studio/domains')).toBe(false)
    expect(errors.has('/api/agency/page-studio/subscriptions')).toBe(false)
    expect(host.textContent).toContain('Current trial access is active.')
    expect(button(host, 'Publish approved version').disabled).toBe(false)
  })
  it('keeps denied review and release history separate from valid website state', async () => {
    const host = await mount()
    errors.get('/api/agency/page-studio/reviews')!.value = { statusCode: 403 }
    errors.get('/api/agency/page-studio/releases')!.value = { statusCode: 403 }
    await flush()
    expect(host.textContent).not.toContain('Site state could not be loaded')
    expect(host.textContent).toContain('Release history is unavailable')
    expect(button(host, 'Publish approved version').disabled).toBe(true)
  })
  it.each(['denied', 'wrong-site'])('rejects %s domain data without reporting a website failure', async (reason) => {
    const host = await mount()
    if (reason === 'denied') errors.get(domainUrl)!.value = { statusCode: 403 }
    else values.get(domainUrl)!.value.siteId = 'different-site'
    await flush()
    expect(host.textContent).not.toContain('Site state could not be loaded')
    expect(button(host, 'Publish approved version').disabled).toBe(true)
    expect(host.textContent).toContain('Unavailable')
  })
  it('uses the scoped site name and status beyond the portfolio page', async () => {
    values.get('/api/agency/page-studio/sites')!.value.sites = []
    const host = await mount()
    expect(host.querySelector('h1')?.textContent).toContain('Site')
    expect(host.textContent).not.toContain('Website management')
    expect(host.textContent).toContain('active')
  })
  it('shows readiness with actionable navigation and email setup still required', async () => {
    const host = await mount()
    expect(host.textContent).toContain('Launch readiness')
    expect(host.textContent).toContain('sender verification and sending still need setup')
    button(host, 'Email settings').click()
    await flush()
    expect(host.querySelector('[data-selected-tab]')?.getAttribute('data-selected-tab')).toBe('settings')
  })
  it('does not enable publication from historical approval when the saved draft is unapproved', async () => {
    values.get(launchUrl)!.value.approvedVersionId = null
    const host = await mount()
    expect(button(host, 'Publish approved version').disabled).toBe(true)
    expect(mutate).not.toHaveBeenCalled()
  })
  it('keeps historical releases out of the active release summary', async () => {
    values.get('/api/agency/page-studio/releases')!.value.releases[0].status = 'historical'
    values.get(launchUrl)!.value.activeReleases = []
    const host = await mount()
    expect(host.textContent).toContain('No release')
  })
  it('uses the current site pointer even when the release is outside the history page', async () => {
    values.get('/api/agency/page-studio/releases')!.value.releases = []
    const host = await mount()
    button(host, 'Publish approved version').click()
    await flush()
    button(host, 'Build and publish').click()
    await flush()
    expect(mutate).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: expect.objectContaining({ expectedActiveReleaseId: 'release' }) }))
  })
  it('refuses to publish if another edit changes the approved checkpoint after confirmation opens', async () => {
    const host = await mount()
    button(host, 'Publish approved version').click()
    await flush()
    expect(host.querySelector('aside')?.textContent).toContain('version')
    refresh.mockImplementation(async (key) => {
      if (key === launchUrl) values.get(key)!.value = { ...state(), checkpointId: 'new-checkpoint', digest: 'new-digest', approvedVersionId: 'new-version' }
    })
    button(host, 'Build and publish').click()
    await flush()
    expect(mutate).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Website changed' }))
  })
  it('publishes the exact confirmed version and active pointer after a fresh unchanged read', async () => {
    const host = await mount()
    button(host, 'Publish approved version').click()
    await flush()
    button(host, 'Build and publish').click()
    await flush()
    expect(mutate).toHaveBeenCalledWith('/api/agency/page-studio/sites/site/versions/version/publish', expect.objectContaining({
      method: 'POST', body: { environment: 'production', hostname: 'example.test', expectedActiveReleaseId: 'release' }
    }))
  })
})
