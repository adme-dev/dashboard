// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, Suspense } from 'vue'
import DomainsWorkspace from '~~/app/components/page-studio/DomainsWorkspace.client.vue'

const domain = {
  id: 'domain', hostname: 'www.customer.example', status: 'validating', dnsStatus: 'pending', tlsStatus: 'pending', hostnameStatus: 'pending',
  ownershipValidation: { type: 'txt', name: '_cf-custom-hostname.www.customer.example', value: 'ownership-value', cnameTarget: 'sites.platform.example' },
  certificateValidation: [{ txt_name: '_acme-challenge.www.customer.example', txt_value: 'certificate-value' }]
}
const data = ref({ domains: [domain] })
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
async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(Suspense, null, { default: () => h(DomainsWorkspace, { siteId: 'site' }) }) })
  Object.entries(stubs).forEach(([name, stub]) => app!.component(name, stub))
  app.mount(host)
  await flush()
  return host
}
beforeEach(() => {
  vi.clearAllMocks()
  data.value = { domains: [structuredClone(domain)] }
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('useToast', () => ({ add: toast }))
  vi.stubGlobal('useFetch', async () => ({ data, status: ref('success'), error: ref(null), refresh }))
  vi.stubGlobal('$fetch', mutate)
})
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('customer domain instructions', () => {
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
