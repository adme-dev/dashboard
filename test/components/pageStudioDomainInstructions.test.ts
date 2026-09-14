// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, Suspense } from 'vue'
import DomainsWorkspace from '~~/app/components/page-studio/DomainsWorkspace.client.vue'

const domain = {
  id: 'domain', hostname: 'www.customer.example', status: 'validating', dnsStatus: 'pending', tlsStatus: 'pending', hostnameStatus: 'pending',
  ownershipValidation: { type: 'txt', name: '_cf-custom-hostname.www.customer.example', value: 'ownership-value', cnameTarget: 'sites.platform.example' },
  certificateValidation: [{ txt_name: '_acme-challenge.www.customer.example', txt_value: 'certificate-value' }]
}
const data = ref<{ domains: typeof domain[], siteId?: string, canManage?: boolean }>({ domains: [domain], siteId: 'site', canManage: true })
const fetchStatus = ref('success')
const fetchError = ref<unknown>(null)
const mutate = vi.fn()
const toast = vi.fn()
const refresh = vi.fn()
let app: ReturnType<typeof createApp> | undefined
const stubs = {
  UCard: { template: '<section><slot name="header"/><slot/></section>' },
  UAlert: { props: ['title', 'description'], template: '<aside>{{ title }} {{ description }}</aside>' },
  UBadge: { props: ['label'], template: '<span>{{ label }}</span>' },
  UButton: { props: ['label', 'loading', 'disabled'], emits: ['click'], template: '<button :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}</button>' },
  UModal: { template: '<div/>' },
  USkeleton: { template: '<div/>' }
}
async function flush() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount(audience: 'agency' | 'portal' = 'agency') {
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(Suspense, null, { default: () => h(DomainsWorkspace, { siteId: 'site', audience }) }) })
  Object.entries(stubs).forEach(([name, stub]) => app!.component(name, stub))
  app.mount(host)
  await flush()
  return host
}
beforeEach(() => {
  vi.clearAllMocks()
  data.value = { domains: [structuredClone(domain)], siteId: 'site', canManage: true }
  fetchStatus.value = 'success'
  fetchError.value = null
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('useToast', () => ({ add: toast }))
  vi.stubGlobal('useFetch', async () => ({ data, status: fetchStatus, error: fetchError, refresh }))
  vi.stubGlobal('$fetch', mutate)
})
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('customer domain instructions', () => {
  it('renders portal instructions without mutation controls for a viewer', async () => {
    data.value = { domains: [domain], siteId: 'site', canManage: false }
    const host = await mount('portal')
    expect(host.textContent).toContain('ownership-value')
    expect(host.textContent).toContain('You can view domain settings')
    expect([...host.querySelectorAll('button')].map(button => button.textContent)).not.toContain('Connect domain')
    expect([...host.querySelectorAll('button')].map(button => button.textContent)).not.toContain('Verify DNS and TLS')
    expect(mutate).not.toHaveBeenCalled()
  })
  it.each([false, undefined])('keeps agency controls unavailable without an explicit fresh editing capability: %s', async (canManage) => {
    data.value = { domains: [domain], siteId: 'site', canManage }
    const host = await mount('agency')
    expect(host.textContent).toContain('ownership-value')
    expect(host.textContent).toContain('Website editing permission is required')
    expect([...host.querySelectorAll('button')].map(button => button.textContent)).not.toContain('Connect domain')
    expect([...host.querySelectorAll('button')].map(button => button.textContent)).not.toContain('Verify DNS and TLS')
    expect(mutate).not.toHaveBeenCalled()
  })
  it.each(['pending', 'error'])('denies agency editing while the fresh request is %s', async (status) => {
    fetchStatus.value = status
    if (status === 'error') fetchError.value = new Error('unavailable')
    const host = await mount('agency')
    expect([...host.querySelectorAll('button')].map(button => button.textContent)).not.toContain('Connect domain')
    expect([...host.querySelectorAll('button')].map(button => button.textContent)).not.toContain('Verify DNS and TLS')
  })
  it('hides stale agency site instructions and permissions', async () => {
    data.value = { domains: [domain], siteId: 'another-site', canManage: true }
    const host = await mount('agency')
    expect(host.textContent).not.toContain('ownership-value')
    expect([...host.querySelectorAll('button')].map(button => button.textContent)).not.toContain('Connect domain')
  })
  it('routes an authorised portal verification to the selected customer site', async () => {
    data.value = { domains: [domain], siteId: 'site', canManage: true }
    const host = await mount('portal')
    ;[...host.querySelectorAll('button')].find(button => button.textContent === 'Verify DNS and TLS')!.click()
    await flush()
    expect(mutate).toHaveBeenCalledWith('/api/portal/page-studio/sites/site/domains/domain/verify', { method: 'POST' })
    expect(refresh).toHaveBeenCalledOnce()
  })
  it('hides stale site data and capabilities while switching websites', async () => {
    data.value = { domains: [domain], siteId: 'different-site', canManage: true }
    const host = await mount('portal')
    expect(host.textContent).not.toContain('ownership-value')
    expect([...host.querySelectorAll('button')].map(button => button.textContent)).not.toContain('Connect domain')
  })

  it('shows ownership and certificate TXT records separately, with the exact traffic target and email preservation guidance', async () => {
    const host = await mount()
    for (const value of ['Verify ownership', 'Issue the HTTPS certificate', domain.ownershipValidation.name, 'ownership-value', domain.certificateValidation[0]!.txt_name, 'certificate-value', 'sites.platform.example', 'Keep your current MX and email TXT records']) {
      expect(host.textContent).toContain(value)
    }
    expect(mutate).not.toHaveBeenCalled()
  })
  it('does not invent certificate records while the provider is still preparing them', async () => {
    data.value.domains[0]!.certificateValidation = []
    const host = await mount()
    expect(host.textContent).toContain('ownership-value')
    expect(host.textContent).not.toContain('Issue the HTTPS certificate')
    expect(host.textContent).not.toContain('certificate-value')
  })
  it('reports a failed verification and permits another attempt without claiming DNS was changed', async () => {
    mutate.mockRejectedValue(new Error('provider unavailable'))
    const host = await mount()
    const button = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Verify DNS and TLS')!
    button.click()
    await flush()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Verification could not be completed', color: 'error' }))
    expect(refresh).not.toHaveBeenCalled()
    expect(button.disabled).toBe(false)
    expect(mutate).toHaveBeenCalledTimes(1)
  })
})
